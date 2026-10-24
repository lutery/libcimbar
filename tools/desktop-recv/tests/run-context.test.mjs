// Real-behaviour tests for the stage-5 run context (UX-UT-081..086).
//
// The context is the only source of run/staging/fixture roots: every path is
// validated before any writer or service starts, historical run roots and the
// shared staging root are refused, and a resume must name the same run
// identity (runId/phase/productManifestSha256/attemptId).
//
// These tests import the production parser; nothing here re-implements it.
// Until tools/desktop-recv/e2e/run-context.mjs exists the import fails and
// every case below is RED for the missing module (the intended stage-5 state).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync,
  symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HISTORICAL_RUN_IDS,
  ITERATION_ID,
  PHASES,
  RUN_CONTEXT_FIELDS,
  RunContextError,
  assertDistinctContexts,
  ensureAttemptDir,
  initializeRunRoot,
  loadRunContext,
  resolveRunPath,
  verifyProductManifest,
} from '../e2e/run-context.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOLS = resolve(HERE, '..');
const REPO = resolve(TOOLS, '..', '..');
const RUN_E2E = join(TOOLS, 'e2e', 'run-e2e.mjs');
const RECORD_SENDER = join(TOOLS, 'e2e', 'record-sender.mjs');
const STAGE_PS1 = join(TOOLS, 'stage.ps1');
const OLD_RUNS = ['20261018-teamexec-01', '20261019-teamexec-02', '20261021-teamexec-03'];

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function isRunContextError(code, needle) {
  return (error) => {
    assert.ok(error instanceof RunContextError, `expected RunContextError, got ${error && error.stack}`);
    assert.equal(error.code, code);
    if (needle) assert.match(String(error.message), needle);
    return true;
  };
}

// Cheap read-only fingerprint of a tree: relative path + size + mtime. Used to
// prove that a rejected command wrote nothing (hashing 1.3 GB of old runs is
// not needed to detect a write).
function treeDigest(root) {
  if (!existsSync(root)) return 'missing';
  const rows = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const info = statSync(path);
      if (info.isDirectory()) walk(path);
      else rows.push(`${path.slice(root.length + 1).replaceAll('\\', '/')}|${info.size}|${info.mtimeMs}`);
    }
  };
  walk(root);
  return sha256(rows.join('\n'));
}

function makeRepo(t, label = 'repo') {
  const repo = mkdtempSync(join(tmpdir(), `ux-runctx-${label}-`));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  return repo;
}

function put(repo, rel, content) {
  const abs = join(repo, ...rel.split('/'));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  return abs;
}

function productFixture(repo, runId) {
  const baseRel = `build-desktop-recv/runs/${runId}/receiver`;
  const files = [
    { path: 'index.html', content: '<!doctype html><title>receiver</title>\n' },
    { path: 'src/app.js', content: 'export const app = true;\n' },
    { path: 'vendor/cimbar_js.wasm', content: Buffer.from([0x00, 0x61, 0x73, 0x6d]) },
  ];
  for (const file of files) put(repo, `${baseRel}/${file.path}`, file.content);
  const manifest = {
    version: 1,
    iterationId: ITERATION_ID,
    base: 'receiver',
    files: files.map((file) => ({
      path: file.path,
      sha256: sha256(file.content),
      bytes: Buffer.byteLength(file.content),
    })),
  };
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestRel = `docs/tests/runs/${runId}/product-manifest.json`;
  put(repo, manifestRel, bytes);
  return { baseRel, manifest, manifestRel, manifestSha: sha256(bytes) };
}

function contextFixture(repo, options = {}) {
  const {
    runId = '20261024-uxunit',
    attemptId = 'attempt-001',
    phase = 'final',
    contextRel = null,
    writeContext = true,
    mutate = null,
  } = options;
  put(repo, 'docs/tests/receiver-ux-v2/planning-cases.json', '{"e2eScenarios":[]}\n');
  put(repo, 'docs/plans/receiver-ux-v2/performance-method.json', '{"frozen":true}\n');
  const product = productFixture(repo, runId);
  const inputRel = `docs/tests/runs/${runId}/input-manifest.json`;
  const inputBytes = '{"inputs":[]}\n';
  put(repo, inputRel, inputBytes);
  const context = {
    version: 1,
    iterationId: 'receiver-ux-v2',
    runId,
    attemptId,
    phase,
    runRoot: `docs/tests/runs/${runId}`,
    stagingRoot: `build-desktop-recv/runs/${runId}`,
    fixtureRoot: `docs/tests/runs/${runId}/fixtures`,
    planningFile: 'docs/tests/receiver-ux-v2/planning-cases.json',
    methodFile: 'docs/plans/receiver-ux-v2/performance-method.json',
    productManifest: product.manifestRel,
    productManifestSha256: product.manifestSha,
    sourceRevision: 'a'.repeat(40),
    harnessRevision: 'b'.repeat(40),
    inputManifest: inputRel,
    inputManifestSha256: sha256(inputBytes),
    legacyThresholdFile: null,
  };
  if (mutate) mutate(context, product, repo);
  // The fixture file itself always stays inside the temp repo, even when a
  // negative case mutates runRoot to an escaping value.
  const rel = contextRel || `docs/tests/runs/${runId}/run-context.json`;
  const contextPath = join(repo, ...rel.split('/'));
  if (writeContext) put(repo, rel, `${JSON.stringify(context, null, 2)}\n`);
  return { repo, context, contextPath, product, contextRel: rel };
}

function runNode(file, args, options = {}) {
  return spawnSync(process.execPath, [file, ...args], {
    encoding: 'utf8',
    timeout: 60000,
    ...options,
  });
}

function oldRunDigests() {
  return OLD_RUNS.map((id) => treeDigest(join(REPO, 'docs', 'tests', 'runs', id)));
}

test('run context field set is exactly the frozen recipe-A contract', () => {
  assert.deepEqual(RUN_CONTEXT_FIELDS, [
    'version', 'iterationId', 'runId', 'attemptId', 'phase',
    'runRoot', 'stagingRoot', 'fixtureRoot', 'planningFile', 'methodFile',
    'productManifest', 'productManifestSha256', 'sourceRevision', 'harnessRevision',
    'inputManifest', 'inputManifestSha256', 'legacyThresholdFile',
  ]);
  assert.deepEqual(PHASES, ['baseline', 'slice', 'metrics', 'media', 'final', 'field']);
  assert.deepEqual(HISTORICAL_RUN_IDS, OLD_RUNS);
  assert.equal(ITERATION_ID, 'receiver-ux-v2');
});

test('UX-UT-081 missing run context is refused before any side effect', (t) => {
  const repo = makeRepo(t, 'refuse');

  // Broken JSON.
  const broken = join(repo, 'broken.json');
  writeFileSync(broken, '{ not json');
  assert.throws(
    () => loadRunContext(broken, { repoRoot: repo }),
    isRunContextError('E_CONTEXT_JSON'),
  );

  // Missing and extra fields, and an unknown phase.
  const { context, contextPath } = contextFixture(repo);
  const withoutPhase = { ...context };
  delete withoutPhase.phase;
  writeFileSync(contextPath, JSON.stringify(withoutPhase));
  assert.throws(
    () => loadRunContext(contextPath, { repoRoot: repo }),
    isRunContextError('E_CONTEXT_FIELDS', /phase/),
  );

  const extra = { ...context, extraField: 1 };
  writeFileSync(contextPath, JSON.stringify(extra));
  assert.throws(
    () => loadRunContext(contextPath, { repoRoot: repo }),
    isRunContextError('E_CONTEXT_FIELDS', /extraField/),
  );

  writeFileSync(contextPath, JSON.stringify({ ...context, phase: 'preview' }));
  assert.throws(
    () => loadRunContext(contextPath, { repoRoot: repo }),
    isRunContextError('E_CONTEXT_PHASE'),
  );

  // A valid context loads and performs no write at all.
  writeFileSync(contextPath, `${JSON.stringify(context, null, 2)}\n`);
  const before = treeDigest(repo);
  const loaded = loadRunContext(contextPath, { repoRoot: repo });
  assert.equal(loaded.runId, context.runId);
  assert.equal(loaded.attemptId, context.attemptId);
  assert.equal(loaded.phase, context.phase);
  assert.equal(treeDigest(repo), before);

  // The CLI refuses a missing or unreadable context before launching a
  // browser, an HTTP server or the native-dialog helper.
  const historyBefore = oldRunDigests();
  const missing = runNode(RUN_E2E, ['--case', 'E2E-27'], { cwd: repo });
  assert.notEqual(missing.status, 0, 'run-e2e without --context must fail');
  assert.match(`${missing.stdout}${missing.stderr}`, /--context/);
  assert.doesNotMatch(missing.stdout, /\[receiver\]|\[sender\]|\[recorder\]/);

  const brokenArg = runNode(RUN_E2E, ['--case', 'E2E-27', '--context', broken], { cwd: repo });
  assert.notEqual(brokenArg.status, 0, 'run-e2e with broken context JSON must fail');
  assert.doesNotMatch(brokenArg.stdout, /\[receiver\]|\[sender\]|\[recorder\]/);

  assert.deepEqual(oldRunDigests(), historyBefore, 'refused commands must not touch the historical runs');
});

test('UX-UT-082 Chinese and space roots propagate to every writer', (t) => {
  const outer = mkdtempSync(join(tmpdir(), 'ux-runctx-cjk-'));
  const repo = join(outer, '仓库 根');
  mkdirSync(repo, { recursive: true });
  t.after(() => rmSync(outer, { recursive: true, force: true }));

  // Fixture roots may themselves contain Chinese and spaces.
  const baseline = contextFixture(repo, {
    runId: '20261024-uxbase',
    attemptId: 'base-001',
    phase: 'baseline',
    mutate: (context) => { context.fixtureRoot = `${context.runRoot}/样本 目录`; },
  });
  const candidate = contextFixture(repo, {
    runId: '20261024-uxcand',
    attemptId: 'cand-001',
    phase: 'final',
  });
  put(repo, 'docs/tests/runs/20261021-teamexec-03/results.json', '[{"caseId":"E2E-1"}]\n');
  const oldRoot = join(repo, 'docs', 'tests', 'runs', '20261021-teamexec-03');
  const oldBefore = treeDigest(oldRoot);

  const base = loadRunContext(baseline.contextPath, { repoRoot: repo });
  const cand = loadRunContext(candidate.contextPath, { repoRoot: repo });
  assert.ok(base.abs.runRoot.includes('仓库 根'));
  assert.ok(base.abs.fixtureRoot.includes('样本 目录'));
  initializeRunRoot(base);
  initializeRunRoot(cand);

  // Actual files land under the declared roots, not a twin or the old root.
  for (const [context, payload] of [[base, 'baseline-bytes'], [cand, 'candidate-bytes']]) {
    const target = resolveRunPath(context, `proof/E2E-27/${context.attemptId}/original.bin`, { root: 'runRoot' });
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, payload);
  }
  assert.equal(readFileSync(join(base.abs.runRoot, 'proof', 'E2E-27', 'base-001', 'original.bin'), 'utf8'), 'baseline-bytes');
  assert.equal(readFileSync(join(cand.abs.runRoot, 'proof', 'E2E-27', 'cand-001', 'original.bin'), 'utf8'), 'candidate-bytes');
  assert.equal(existsSync(join(cand.abs.runRoot, 'proof', 'E2E-27', 'base-001')), false);
  assert.equal(treeDigest(oldRoot), oldBefore, 'base/candidate writes must not touch the old run');

  // The fixture root is writable at its declared Chinese/space location.
  const fixtureFile = resolveRunPath(base, 'inputs/primary.bin', { root: 'fixtureRoot' });
  mkdirSync(dirname(fixtureFile), { recursive: true });
  writeFileSync(fixtureFile, 'fixture');
  assert.ok(existsSync(join(base.abs.fixtureRoot, 'inputs', 'primary.bin')));

  // runner and recorder parse the SAME context file to the same identity.
  const runner = runNode(RUN_E2E, ['--validate-only', '--context', candidate.contextPath, '--repo-root', repo], { cwd: repo });
  assert.equal(runner.status, 0, runner.stderr);
  const recorder = runNode(RECORD_SENDER, ['--validate-only', '--context', candidate.contextPath, '--repo-root', repo], { cwd: repo });
  assert.equal(recorder.status, 0, recorder.stderr);
  const runnerIdentity = JSON.parse(runner.stdout.trim());
  const recorderIdentity = JSON.parse(recorder.stdout.trim());
  assert.deepEqual(recorderIdentity, runnerIdentity);
  assert.equal(runnerIdentity.runId, candidate.context.runId);
  assert.equal(runnerIdentity.attemptId, candidate.context.attemptId);
  assert.equal(runnerIdentity.phase, candidate.context.phase);
  assert.equal(runnerIdentity.productManifestSha256, candidate.context.productManifestSha256);
  assert.equal(runnerIdentity.contextSha256, sha256(readFileSync(candidate.contextPath)));
});

test('UX-UT-083 path escapes and historical output roots are refused', (t) => {
  const repo = makeRepo(t, 'escape');
  const reject = (mutate, code, needle) => {
    const fixture = contextFixture(repo, { runId: '20261024-uxesc', mutate });
    assert.throws(
      () => loadRunContext(fixture.contextPath, { repoRoot: repo }),
      isRunContextError(code, needle),
    );
  };

  // Lexical escapes: parent segments, drive letter, leading slash, URI and
  // backslash separators are all non-canonical repo-relative paths.
  reject((context) => { context.runRoot = 'docs/tests/runs/../runs/20261024-uxesc'; }, 'E_CONTEXT_PATH');
  reject((context) => { context.runRoot = 'E:/outside/run'; }, 'E_CONTEXT_PATH');
  reject((context) => { context.runRoot = '/tmp/outside'; }, 'E_CONTEXT_PATH');
  reject((context) => { context.runRoot = 'file:///C:/outside'; }, 'E_CONTEXT_PATH');
  reject((context) => { context.runRoot = 'docs\\tests\\runs\\20261024-uxesc'; }, 'E_CONTEXT_PATH');
  reject((context) => { context.planningFile = 'docs/tests/runs/../../outside.json'; }, 'E_CONTEXT_PATH');

  // Structured roots: a same-prefix twin is not the run root.
  reject((context) => { context.runRoot = 'docs/tests/runs-evil/20261024-uxesc'; }, 'E_CONTEXT_RUN_ROOT');
  reject((context) => { context.runRoot = 'docs/tests/runs/20261024-other'; }, 'E_CONTEXT_RUN_ROOT');
  reject((context) => { context.stagingRoot = 'build-desktop-recv/staging'; }, 'E_CONTEXT_STAGING_ROOT');
  reject((context) => { context.stagingRoot = 'build-desktop-recv/runs/20261024-other'; }, 'E_CONTEXT_STAGING_ROOT');
  reject((context) => { context.fixtureRoot = 'docs/tests/runs/20261024-other/fixtures'; }, 'E_CONTEXT_FIXTURE_ROOT');
  reject((context) => { context.fixtureRoot = context.runRoot; }, 'E_CONTEXT_FIXTURE_ROOT');

  // Historical run outputs are refused, including any path into them.
  const historical = contextFixture(repo, {
    runId: '20261021-teamexec-03',
    attemptId: 'attempt-001',
    phase: 'final',
  });
  assert.throws(
    () => loadRunContext(historical.contextPath, { repoRoot: repo }),
    isRunContextError('E_CONTEXT_HISTORY'),
  );
  const intoHistory = contextFixture(repo, {
    runId: '20261024-uxesc2',
    mutate: (context) => { context.planningFile = 'docs/tests/runs/20261021-teamexec-03/results.json'; },
  });
  assert.throws(
    () => loadRunContext(intoHistory.contextPath, { repoRoot: repo }),
    isRunContextError('E_CONTEXT_HISTORY'),
  );

  // Invalid identities and phases are refused.
  reject((context) => { context.runId = 'bad/../../id'; }, 'E_CONTEXT_RUN_ID');
  reject((context) => { context.attemptId = '../escape'; }, 'E_CONTEXT_ATTEMPT_ID');
  reject((context) => { context.phase = 'preview'; }, 'E_CONTEXT_PHASE');
  reject((context) => { context.sourceRevision = 'not-a-revision'; }, 'E_CONTEXT_REVISION');
  reject((context) => { context.planningFile = null; }, 'E_CONTEXT_PATH');

  // Write-time escapes are refused as well, not only in the JSON.
  const valid = contextFixture(repo, { runId: '20261024-uxesc3' });
  const context = loadRunContext(valid.contextPath, { repoRoot: repo });
  initializeRunRoot(context);
  for (const rel of [
    '../outside.bin',
    'E:/outside.bin',
    'file:///C:/outside.bin',
    'proof/../../outside.bin',
    'proof\\..\\outside.bin',
  ]) {
    assert.throws(() => resolveRunPath(context, rel), isRunContextError('E_CONTEXT_PATH'), rel);
  }

  // A junction that points outside the declared root is refused when this
  // host lets the test create one; otherwise the sub-sample is reported as
  // not measured instead of being claimed as tested.
  const outside = join(repo, 'external-root');
  mkdirSync(outside, { recursive: true });
  const link = join(context.abs.runRoot, 'escape-link');
  let linked = false;
  try {
    symlinkSync(outside, link, 'junction');
    linked = true;
  } catch (error) {
    t.diagnostic(`junction creation unavailable on this host: ${error.code}`);
  }
  if (linked) {
    assert.throws(
      () => resolveRunPath(context, 'escape-link/evil.bin'),
      (error) => error instanceof RunContextError,
    );
  }
});

test('UX-UT-084 baseline/candidate staging are separate and the old package stays read-only', (t) => {
  const repo = makeRepo(t, 'staging');
  const baseline = contextFixture(repo, {
    runId: '20261024-uxbase', attemptId: 'base-001', phase: 'baseline',
  });
  const candidate = contextFixture(repo, {
    runId: '20261024-uxcand', attemptId: 'cand-001', phase: 'final',
  });
  const base = loadRunContext(baseline.contextPath, { repoRoot: repo });
  const cand = loadRunContext(candidate.contextPath, { repoRoot: repo });
  assert.doesNotThrow(() => assertDistinctContexts(base, cand));

  // The same run root can never stand for two builds.
  assert.throws(() => assertDistinctContexts(base, base), isRunContextError('E_CONTEXT_ROOTS_EQUAL'));
  const twin = contextFixture(repo, {
    runId: '20261024-uxbase',
    attemptId: 'base-002',
    phase: 'baseline',
    contextRel: 'docs/tests/receiver-ux-v2/variants/base-002.json',
  });
  const twinLoaded = loadRunContext(twin.contextPath, { repoRoot: repo });
  assert.throws(() => assertDistinctContexts(base, twinLoaded), isRunContextError('E_CONTEXT_ROOTS_EQUAL'));

  // Within one context, staging and fixture roots may not collapse into the
  // run root or the shared staging directory.
  const sameRoot = contextFixture(repo, {
    runId: '20261024-uxsame',
    mutate: (context) => { context.stagingRoot = context.runRoot; },
  });
  assert.throws(
    () => loadRunContext(sameRoot.contextPath, { repoRoot: repo }),
    isRunContextError('E_CONTEXT_STAGING_ROOT'),
  );
  const fixtureAtRoot = contextFixture(repo, {
    runId: '20261024-uxsame',
    mutate: (context) => { context.fixtureRoot = context.runRoot; },
  });
  assert.throws(
    () => loadRunContext(fixtureAtRoot.contextPath, { repoRoot: repo }),
    isRunContextError('E_CONTEXT_FIXTURE_ROOT'),
  );

  // stage.ps1 -StagingRoot must copy the receiver only into the declared
  // staging root; the shared staging area and the delivered v1 package stay
  // byte-for-byte read-only (listing fingerprint, no writes at all).
  const sharedStaging = join(REPO, 'build-desktop-recv', 'staging');
  const productDir = join(REPO, 'product');
  const sharedBefore = treeDigest(sharedStaging);
  const productBefore = treeDigest(productDir);
  const roundStaging = join(repo, '本轮 staging');
  const staged = spawnSync('pwsh', [
    '-NoProfile', '-File', STAGE_PS1,
    '-RunId', '20261024-uxstage', '-Mode', 'development',
    '-StagingRoot', roundStaging,
  ], { encoding: 'utf8', timeout: 180000 });
  assert.equal(staged.status, 0, `${staged.stdout}\n${staged.stderr}`);
  assert.ok(existsSync(join(roundStaging, 'index.html')), 'receiver entry point staged');
  assert.ok(existsSync(join(roundStaging, 'src', 'app.js')), 'receiver source staged');
  assert.equal(treeDigest(sharedStaging), sharedBefore, 'shared staging must stay untouched');
  assert.equal(treeDigest(productDir), productBefore, 'the delivered v1 package must stay read-only');

  const help = spawnSync('pwsh', ['-NoProfile', '-File', STAGE_PS1, '-Help'], {
    encoding: 'utf8', timeout: 60000,
  });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /-StagingRoot/);
});

test('UX-UT-085 resume accepts only the same run identity and keeps old attempts', (t) => {
  const repo = makeRepo(t, 'resume');
  const first = contextFixture(repo, {
    runId: '20261024-uxresume', attemptId: 'attempt-001', phase: 'slice',
  });
  const loaded = loadRunContext(first.contextPath, { repoRoot: repo });
  assert.doesNotThrow(() => initializeRunRoot(loaded));

  const variant = (attemptId, phase, harnessRevision = 'b'.repeat(40)) => {
    const fixture = contextFixture(repo, {
      runId: '20261024-uxresume',
      attemptId,
      phase,
      contextRel: `docs/tests/receiver-ux-v2/variants/${attemptId}-${phase}.json`,
      mutate: (context) => { context.harnessRevision = harnessRevision; },
    });
    return loadRunContext(fixture.contextPath, { repoRoot: repo });
  };

  // Another attempt cannot silently take over the root.
  const nextAttempt = variant('attempt-002', 'slice');
  assert.throws(() => initializeRunRoot(nextAttempt), isRunContextError('E_CONTEXT_RUN_EXISTS'));
  assert.throws(
    () => initializeRunRoot(nextAttempt, { resume: true }),
    isRunContextError('E_CONTEXT_RESUME_MISMATCH', /attemptId/),
  );

  // A slice context cannot be relabelled as the final gate context.
  const finalPhase = variant('attempt-001', 'final');
  assert.throws(
    () => initializeRunRoot(finalPhase, { resume: true }),
    isRunContextError('E_CONTEXT_RESUME_MISMATCH', /phase/),
  );

  // Tool-only changes keep the same product identity and may resume.
  const toolOnly = variant('attempt-001', 'slice', 'c'.repeat(40));
  assert.doesNotThrow(() => initializeRunRoot(toolOnly, { resume: true }));

  // A different product manifest refuses the resume.
  const otherManifest = contextFixture(repo, {
    runId: '20261024-uxresume',
    attemptId: 'attempt-002',
    phase: 'slice',
    contextRel: 'docs/tests/receiver-ux-v2/variants/other-manifest.json',
    mutate: (context) => { context.productManifestSha256 = 'd'.repeat(64); },
  });
  const other = loadRunContext(otherManifest.contextPath, { repoRoot: repo });
  assert.throws(
    () => initializeRunRoot(other, { resume: true }),
    isRunContextError('E_CONTEXT_RESUME_MISMATCH', /productManifestSha256|manifest/),
  );

  // Attempt originals are never overwritten: a second attempt gets its own
  // directory and the first attempt's proof stays byte-identical.
  const attemptOne = ensureAttemptDir(loaded, 'E2E-27', 'attempt-001');
  writeFileSync(join(attemptOne, 'original.bin'), 'first-attempt');
  assert.throws(
    () => ensureAttemptDir(loaded, 'E2E-27', 'attempt-001'),
    isRunContextError('E_ATTEMPT_EXISTS'),
  );
  assert.equal(readFileSync(join(attemptOne, 'original.bin'), 'utf8'), 'first-attempt');
  const attemptTwo = ensureAttemptDir(loaded, 'E2E-27', 'attempt-002');
  assert.notEqual(attemptOne, attemptTwo);
  assert.ok(existsSync(join(attemptOne, 'original.bin')));
  assert.throws(
    () => ensureAttemptDir(loaded, '../E2E-27', 'attempt-003'),
    isRunContextError('E_CONTEXT_PATH'),
  );
  assert.throws(
    () => ensureAttemptDir(loaded, 'E2E-27', '../attempt'),
    isRunContextError('E_CONTEXT_PATH'),
  );
});

test('UX-UT-086 product manifest and tool revision are bound separately', (t) => {
  const repo = makeRepo(t, 'manifest');
  const fixture = contextFixture(repo);
  const context = loadRunContext(fixture.contextPath, { repoRoot: repo });
  const verified = verifyProductManifest(context);
  assert.equal(verified.files.length, 3);

  const receiverRoot = join(repo, 'build-desktop-recv', 'runs', fixture.context.runId, 'receiver');
  const appPath = join(receiverRoot, 'src', 'app.js');
  const goodApp = readFileSync(appPath);
  writeFileSync(appPath, 'tampered product byte\n');
  assert.throws(
    () => verifyProductManifest(context),
    isRunContextError('E_MANIFEST_FILE', /app\.js/),
  );
  writeFileSync(appPath, goodApp);

  // A missing file is not "fewer checks": the manifest names it.
  const wasmPath = join(receiverRoot, 'vendor', 'cimbar_js.wasm');
  const goodWasm = readFileSync(wasmPath);
  rmSync(wasmPath);
  assert.throws(
    () => verifyProductManifest(context),
    isRunContextError('E_MANIFEST_FILE', /cimbar_js\.wasm/),
  );
  writeFileSync(wasmPath, goodWasm);

  // Editing the manifest text without updating the context digest is refused.
  const manifestPath = join(repo, ...fixture.product.manifestRel.split('/'));
  const manifestText = readFileSync(manifestPath, 'utf8');
  const edited = JSON.parse(manifestText);
  edited.files[0].bytes += 1;
  writeFileSync(manifestPath, `${JSON.stringify(edited, null, 2)}\n`);
  assert.throws(() => verifyProductManifest(context), isRunContextError('E_MANIFEST_SHA'));

  // Unsorted, duplicated or escaping entries are refused as well.
  const writeManifest = (mutate) => {
    const manifest = JSON.parse(manifestText);
    mutate(manifest);
    const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
    const variant = contextFixture(repo, {
      contextRel: 'docs/tests/receiver-ux-v2/variants/manifest-variant.json',
      mutate: (ctx) => { ctx.productManifestSha256 = sha256(bytes); },
    });
    // contextFixture rewrites the good manifest; write the variant after it.
    writeFileSync(manifestPath, bytes);
    return loadRunContext(variant.contextPath, { repoRoot: repo });
  };
  const unsorted = writeManifest((manifest) => {
    manifest.files = [manifest.files[1], manifest.files[0], manifest.files[2]];
  });
  assert.throws(
    () => verifyProductManifest(unsorted),
    isRunContextError('E_MANIFEST_FORMAT', /sorted/),
  );
  const duplicated = writeManifest((manifest) => {
    manifest.files[1] = { ...manifest.files[0] };
  });
  assert.throws(
    () => verifyProductManifest(duplicated),
    isRunContextError('E_MANIFEST_FORMAT', /duplicate/),
  );
  const escapingBase = writeManifest((manifest) => {
    manifest.base = '../receiver';
  });
  assert.throws(
    () => verifyProductManifest(escapingBase),
    isRunContextError('E_CONTEXT_PATH'),
  );

  // A tool-only commit changes harnessRevision but not the product binding:
  // the same product manifest still verifies and keeps its digest.
  const toolOnly = contextFixture(repo, {
    contextRel: 'docs/tests/receiver-ux-v2/variants/tool-only.json',
    mutate: (ctx) => { ctx.harnessRevision = 'e'.repeat(40); },
  });
  const toolContext = loadRunContext(toolOnly.contextPath, { repoRoot: repo });
  assert.equal(toolContext.productManifestSha256, toolOnly.context.productManifestSha256);
  assert.doesNotThrow(() => verifyProductManifest(toolContext));
});

// T3 adversarial matrix: risks the T1 cases do not cover. Nothing here is a
// line-by-line mirror of the implementation; each case names a real way an
// operator or a crashed script could cross two builds or borrow history.
test('T3 adversarial: case-folded twins, separators, history and forged identities', (t) => {
  const repo = makeRepo(t, 'adversarial');

  // Windows case-folding: two roots that differ only by case are THE SAME
  // directory on this host, so they can never stand for two builds.
  const lower = contextFixture(repo, {
    runId: '20261024-uxcase', attemptId: 'attempt-001', phase: 'baseline',
  });
  const upper = contextFixture(repo, {
    runId: '20261024-UXCASE', attemptId: 'attempt-002', phase: 'final',
    contextRel: 'docs/tests/receiver-ux-v2/variants/case-twin.json',
  });
  assert.doesNotThrow(() => loadRunContext(lower.contextPath, { repoRoot: repo }));
  assert.doesNotThrow(() => loadRunContext(upper.contextPath, { repoRoot: repo }));
  assert.throws(
    () => assertDistinctContexts(
      loadRunContext(lower.contextPath, { repoRoot: repo }),
      loadRunContext(upper.contextPath, { repoRoot: repo }),
    ),
    (error) => error instanceof RunContextError
      && (error.code === 'E_CONTEXT_ROOTS_EQUAL' || error.code === 'E_CONTEXT_ROOTS_OVERLAP'),
  );

  // Backslash separators leak through every root, not just runRoot.
  const backslash = contextFixture(repo, {
    runId: '20261024-uxbs',
    mutate: (context) => { context.stagingRoot = 'build-desktop-recv\\runs\\20261024-uxbs'; },
  });
  assert.throws(
    () => loadRunContext(backslash.contextPath, { repoRoot: repo }),
    isRunContextError('E_CONTEXT_PATH'),
  );

  // Identity stays ASCII: Chinese/space runIds never become directory names.
  const cjkId = contextFixture(repo, { runId: '20261024 中文' });
  assert.throws(
    () => loadRunContext(cjkId.contextPath, { repoRoot: repo }),
    isRunContextError('E_CONTEXT_RUN_ID'),
  );

  // stagingRoot pointed at a historical run is refused.
  const histStaging = contextFixture(repo, {
    runId: '20261024-uxhist',
    mutate: (context) => { context.stagingRoot = 'docs/tests/runs/20261021-teamexec-03/staging'; },
  });
  assert.throws(
    () => loadRunContext(histStaging.contextPath, { repoRoot: repo }),
    (error) => error instanceof RunContextError
      && ['E_CONTEXT_STAGING_ROOT', 'E_CONTEXT_HISTORY'].includes(error.code),
  );

  // A fictional historical root inside the temp repo refuses a load AND the
  // load attempt itself leaves its bytes untouched.
  contextFixture(repo, { runId: '20261021-teamexec-03', attemptId: 'attempt-001', phase: 'final' });
  const historicalDir = join(repo, 'docs', 'tests', 'runs', '20261021-teamexec-03');
  const historicalBefore = treeDigest(historicalDir);
  assert.throws(
    () => loadRunContext(join(historicalDir, 'run-context.json'), { repoRoot: repo }),
    isRunContextError('E_CONTEXT_HISTORY'),
  );
  assert.equal(treeDigest(historicalDir), historicalBefore);

  // A directory passed as the context file is a refusal, not a stack trace.
  assert.throws(
    () => loadRunContext(repo, { repoRoot: repo }),
    isRunContextError('E_CONTEXT_MISSING'),
  );

  // Case-folded attempt names are the same attempt directory on this host:
  // reopening it stays an overwrite attempt and is refused.
  const plain = contextFixture(repo, { runId: '20261024-uxfold' });
  const foldedContext = loadRunContext(plain.contextPath, { repoRoot: repo });
  initializeRunRoot(foldedContext);
  const attempt = ensureAttemptDir(foldedContext, 'E2E-27', 'attempt-001');
  writeFileSync(join(attempt, 'original.bin'), 'sealed');
  assert.throws(
    () => ensureAttemptDir(foldedContext, 'E2E-27', 'ATTEMPT-001'),
    isRunContextError('E_ATTEMPT_EXISTS'),
  );
  assert.equal(readFileSync(join(attempt, 'original.bin'), 'utf8'), 'sealed');
});

// T28: development-acceptance A/B observer (measure-ux) - behaviour tests.
//
// The measurement formulas come from the FROZEN method
// (docs/plans/receiver-ux-v2/performance-method.json, recipe F). The tool
// must refuse an edited method (frozen flag or thresholds), judge rounds
// from raw frame samples, recompute every threshold from the frozen
// formulas and KEEP the raw samples of invalid rounds (no silent deletion
// of slow samples).
//
// Nothing here drives a browser: T31 is the task that runs the actual A/B
// collection. These tests pin the computation, the refusal rules and the
// CLI exit codes (--help=0, missing or unknown argument=2, edited method=3).
//
// Until tools/desktop-recv/e2e/measure-ux.mjs exists the import list below
// is RED for the missing module, which is the intended TDD starting state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import {
  INSTRUMENTATION_SHA256, OBSERVER_SCRIPT, OUTPUT_REL, UxMeasureError,
  buildOutputFiles, computeReadyMs, decideVerdict, evaluateThresholds, judgeRound,
  matchEnvironment, median, nearestRankPercentile, outputDirFor, pairRounds,
  planRounds, runAbDrive, summarizeSides, validateMethod, writeMeasurements,
} from '../e2e/measure-ux.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const TOOLS = resolve(HERE, '..');
const REPO = resolve(TOOLS, '..', '..');
const MEASURE_UX = join(TOOLS, 'e2e', 'measure-ux.mjs');
const FROZEN_METHOD = join(REPO, 'docs', 'plans', 'receiver-ux-v2', 'performance-method.json');

const isUxError = (code, needle) => (error) => {
  assert.ok(error instanceof UxMeasureError, `expected UxMeasureError, got ${error && error.stack}`);
  assert.equal(error.code, code);
  if (needle) assert.match(String(error.message), needle);
  return true;
};
function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function makeRepo(t, label = 'repo') {
  const repo = mkdtempSync(join(tmpdir(), `ux-measure-${label}-`));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  return repo;
}

function put(repo, rel, content) {
  const abs = join(repo, ...rel.split('/'));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  return abs;
}

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
// --- fixture repository with two distinct build contexts -------------------

const WASM_BYTES = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const INPUT_BYTES = Buffer.alloc(2048, 0xa5);
const MEDIA_BYTES = Buffer.concat([Buffer.alloc(1024, 0x3c), Buffer.alloc(1024, 0x9e)]);
const ATTEMPT_ID = 'attempt-001';
const BASE_RUN = '20261024-uxmeas-base';
const CAND_RUN = '20261024-uxmeas-cand';

function productManifestFor(repo, runId, appExtra) {
  const files = [
    { path: 'index.html', content: '<!doctype html><title>receiver</title>\n' },
    { path: 'src/app.js', content: `export const app = true;\n${appExtra || ''}` },
    { path: 'src/decoder-client.js', content: 'export class DecoderClient {}\n' },
    { path: 'vendor/cimbar_js.wasm', content: WASM_BYTES },
  ];
  for (const file of files) put(repo, `build-desktop-recv/runs/${runId}/receiver/${file.path}`, file.content);
  const manifest = {
    version: 1,
    iterationId: 'receiver-ux-v2',
    base: 'receiver',
    files: files.map((file) => ({
      path: file.path,
      sha256: sha256(file.content),
      bytes: Buffer.byteLength(file.content),
    })),
  };
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  put(repo, `docs/tests/runs/${runId}/product-manifest.json`, bytes);
  return { manifest, manifestSha: sha256(bytes) };
}

function inputManifestFor(repo, runId, options = {}) {
  const inputRel = `docs/tests/runs/${runId}/fixtures/primary-input.bin`;
  const mediaRel = `docs/tests/runs/${runId}/fixtures/media.webm`;
  const inputBytes = options.inputBytes || INPUT_BYTES;
  const mediaBytes = options.mediaBytes || MEDIA_BYTES;
  put(repo, inputRel, inputBytes);
  put(repo, mediaRel, mediaBytes);
  const manifest = {
    version: 1,
    iterationId: 'receiver-ux-v2',
    runId,
    lockedAt: '2026-10-24T00:00:00.000Z',
    primaryInput: {
      path: inputRel,
      sha256: sha256(inputBytes),
      bytes: Buffer.byteLength(inputBytes),
    },
    media: { withSha256: sha256(mediaBytes) },
    files: [
      { path: inputRel, sha256: sha256(inputBytes), bytes: Buffer.byteLength(inputBytes), role: 'fixture' },
      { path: mediaRel, sha256: sha256(mediaBytes), bytes: Buffer.byteLength(mediaBytes), role: 'media' },
    ],
  };
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  put(repo, `docs/tests/runs/${runId}/input-manifest.json`, bytes);
  return { manifest, manifestSha: sha256(bytes), inputRel, mediaRel };
}
function contextFixture(repo, runId, options = {}) {
  const {
    attemptId = ATTEMPT_ID,
    phase = 'final',
    contextRel = null,
    mutate = null,
    appExtra = null,
    inputOptions = null,
  } = options;
  const planningRel = 'docs/tests/receiver-ux-v2/planning-cases.json';
  put(repo, planningRel, '{"e2eScenarios":[]}\n');
  put(repo, 'docs/plans/receiver-ux-v2/performance-method.json', '{"frozen":true}\n');
  const product = productManifestFor(repo, runId, appExtra);
  const input = inputManifestFor(repo, runId, inputOptions || {});
  const context = {
    version: 1,
    iterationId: 'receiver-ux-v2',
    runId,
    attemptId,
    phase,
    runRoot: `docs/tests/runs/${runId}`,
    stagingRoot: `build-desktop-recv/runs/${runId}`,
    fixtureRoot: `docs/tests/runs/${runId}/fixtures`,
    planningFile: planningRel,
    methodFile: 'docs/plans/receiver-ux-v2/performance-method.json',
    productManifest: `docs/tests/runs/${runId}/product-manifest.json`,
    productManifestSha256: product.manifestSha,
    sourceRevision: 'a'.repeat(40),
    harnessRevision: 'b'.repeat(40),
    inputManifest: `docs/tests/runs/${runId}/input-manifest.json`,
    inputManifestSha256: input.manifestSha,
    legacyThresholdFile: null,
  };
  if (mutate) mutate(context, { repo, product, input });
  const rel = contextRel || `docs/tests/runs/${runId}/run-context.json`;
  put(repo, rel, `${JSON.stringify(context, null, 2)}\n`);
  return { repo, context, contextPath: join(repo, ...rel.split('/')), rel };
}

// A complete two-build repository: baseline run + candidate run, both with
// verified product manifests and the SAME frozen input/media binding.
function buildFxRepo(t, options = {}) {
  const repo = makeRepo(t, 'fx');
  const baseline = contextFixture(repo, BASE_RUN, {
    attemptId: 'baseline-001',
    phase: 'baseline',
    appExtra: 'export const baseline = true;\n',
  });
  const candidate = contextFixture(repo, CAND_RUN, {
    mutate: (context) => { context.attemptId = ATTEMPT_ID; },
    appExtra: 'export const candidate = true;\n',
  });
  return {
    repo,
    baseline,
    candidate,
    baselinePath: baseline.contextPath,
    candidatePath: candidate.contextPath,
  };
}
// --- T28-01 nearest-rank percentiles and median on fixed arrays ----------

test('T28-01a nearest-rank percentile on fixed arrays', () => {
  // Hand-computed nearest-rank values; rank = ceil(p/100 * n), 1-based.
  assert.equal(nearestRankPercentile([10, 20, 30, 40, 50], 50), 30);
  assert.equal(nearestRankPercentile([10, 20, 30, 40, 50], 95), 50);
  assert.equal(nearestRankPercentile([1, 2, 3, 4], 50), 2, 'even n picks the upper middle element');
  const seq = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(nearestRankPercentile(seq, 50), 50);
  assert.equal(nearestRankPercentile(seq, 95), 95);
  assert.equal(nearestRankPercentile(seq, 100), 100);
  assert.equal(nearestRankPercentile(seq, 1), 1);
  const seq99 = Array.from({ length: 99 }, (_, i) => i + 1);
  assert.equal(nearestRankPercentile(seq99, 95), 95);

  // Unsorted input is accepted and the input array is not mutated.
  const unsorted = [30, 10, 20];
  assert.equal(nearestRankPercentile(unsorted, 50), 20);
  assert.deepEqual(unsorted, [30, 10, 20]);
});

test('T28-01b percentile and median reject empty or non-finite input', () => {
  for (const bad of [[], [1, NaN, 3], [1, Infinity, 3]]) {
    assert.throws(() => nearestRankPercentile(bad, 50), isUxError('E_STATS_INPUT'));
    assert.throws(() => median(bad), isUxError('E_STATS_INPUT'));
  }
  for (const badP of [0, 101, 50.5, -5, Number.NaN]) {
    assert.throws(() => nearestRankPercentile([1, 2, 3], badP), isUxError('E_STATS_INPUT'));
  }
});

test('T28-01c median on fixed arrays', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([7]), 7);
  const unsorted = [5, 1, 4, 2, 3];
  assert.equal(median(unsorted), 3);
  assert.deepEqual(unsorted, [5, 1, 4, 2, 3], 'input is not mutated');
});

// --- T28-02 readyMs from the page Date clock ------------------------------

test('T28-02 readyMs is journey.readyAt - receivingAt on the same clock', () => {
  assert.equal(computeReadyMs({ journey: { receivingAt: 1000, readyAt: 1250 } }), 250);
  assert.equal(computeReadyMs({ journey: { receivingAt: 2000, readyAt: 2000 } }), 0);
  assert.throws(() => computeReadyMs({ journey: { receivingAt: 1000 } }), isUxError('E_READY_MS'));
  assert.throws(() => computeReadyMs({ journey: { readyAt: 1000 } }), isUxError('E_READY_MS'));
  assert.throws(() => computeReadyMs({}), isUxError('E_READY_MS'));
  assert.throws(
    () => computeReadyMs({ journey: { receivingAt: 1300, readyAt: 1200 } }),
    isUxError('E_READY_MS'),
  );
  assert.throws(
    () => computeReadyMs({ journey: { receivingAt: Number.NaN, readyAt: 1200 } }),
    isUxError('E_READY_MS'),
  );
});
// --- T28-03 frozen-method validation --------------------------------------

test('T28-03a the real frozen method loads and records its SHA', () => {
  const bytes = readFileSync(FROZEN_METHOD);
  const { method, sha } = validateMethod(bytes);
  assert.equal(method.frozen, true);
  assert.equal(method.iterationId, 'receiver-ux-v2');
  assert.equal(sha, sha256(bytes), 'the method SHA-256 is recorded from the actual bytes');
  assert.equal(method.pairedRuns, 5);
  assert.deepEqual(method.order, ['AB', 'BA', 'AB', 'BA', 'AB']);
  assert.equal(method.warmupPerBuild, 1);
  assert.equal(method.primaryInput.minSettledFrames, 30);
  assert.ok(method.matchedEnvironment.includes('wasmSha256'));
  assert.ok(method.matchedEnvironment.includes('instrumentationSha256'));
  const names = method.mandatoryMetrics.map((metric) => metric.name);
  assert.deepEqual(names, ['readyMs', 'frameRttP50Ms', 'frameRttP95Ms']);
});

test('T28-03b an unfrozen or edited method is refused', () => {
  const method = JSON.parse(readFileSync(FROZEN_METHOD, 'utf8'));
  const variant = (mutate) => {
    const clone = structuredClone(method);
    mutate(clone);
    return Buffer.from(`${JSON.stringify(clone, null, 2)}\n`);
  };
  assert.throws(
    () => validateMethod(variant((m) => { m.frozen = false; })),
    isUxError('E_METHOD_NOT_FROZEN'),
  );
  assert.throws(
    () => validateMethod(variant((m) => { m.frozen = 'yes'; })),
    isUxError('E_METHOD_NOT_FROZEN'),
  );
  assert.throws(
    () => validateMethod(Buffer.from('{ not json')),
    isUxError('E_METHOD_JSON'),
  );
  assert.throws(
    () => validateMethod(variant((m) => { m.iterationId = 'other-iteration'; })),
    isUxError('E_METHOD_FIELD'),
  );
  // Any threshold edit is refused, so a doctored file cannot loosen a gate.
  assert.throws(
    () => validateMethod(variant((m) => { m.mandatoryMetrics[0].candidateMax.relativeFactor = 1.2; })),
    isUxError('E_METHOD_THRESHOLD'),
  );
  assert.throws(
    () => validateMethod(variant((m) => { m.mandatoryMetrics[1].candidateMax.absoluteAllowanceMs = 3; })),
    isUxError('E_METHOD_THRESHOLD'),
  );
  assert.throws(
    () => validateMethod(variant((m) => { m.mandatoryMetrics[2].candidateMax.formula = 'x'; })),
    isUxError('E_METHOD_THRESHOLD'),
  );
  assert.throws(
    () => validateMethod(variant((m) => { m.mandatoryMetrics.pop(); })),
    isUxError('E_METHOD_FIELD'),
  );
  assert.throws(
    () => validateMethod(variant((m) => { m.order = ['AB', 'AB', 'AB', 'AB', 'AB']; })),
    isUxError('E_METHOD_FIELD'),
  );
  assert.throws(
    () => validateMethod(variant((m) => { m.pairedRuns = 3; })),
    isUxError('E_METHOD_FIELD'),
  );
  assert.throws(
    () => validateMethod(variant((m) => { m.warmupPerBuild = 0; })),
    isUxError('E_METHOD_FIELD'),
  );
  assert.throws(
    () => validateMethod(variant((m) => { m.primaryInput.minSettledFrames = 10; })),
    isUxError('E_METHOD_FIELD'),
  );
  assert.throws(
    () => validateMethod(variant((m) => { m.matchedEnvironment.pop(); })),
    isUxError('E_METHOD_FIELD'),
  );
  assert.throws(
    () => validateMethod(variant((m) => { m.hardInvariants.telemetryMinWriteIntervalMs = 100; })),
    isUxError('E_METHOD_FIELD'),
  );
});
// --- T28-04 round judging from raw frame samples --------------------------

// A frame submitted at t0Ms and settled at settledAtMs (performance.now
// domain); rttMs = settledAtMs - t0Ms, ok=true means the frame resolved.
function frameSeq(count, rttMs, { startAt = 0, stepMs = 100 } = {}) {
  const frames = [];
  for (let i = 0; i < count; i += 1) {
    const t0 = startAt + i * stepMs;
    frames.push({ seq: i + 1, t0Ms: t0, settledAtMs: t0 + rttMs, ok: true, rttMs });
  }
  return frames;
}

function baseRules() {
  return {
    minSettledFrames: 30,
    telemetryMinWriteIntervalMs: 250,
    inputSha256: sha256(INPUT_BYTES),
    mediaSha256: sha256(MEDIA_BYTES),
    matchedEnvironment: [
      'wasmSha256', 'inputSha256', 'mediaSha256', 'browserVersion', 'mode',
      'viewport', 'deviceScaleFactor', 'screenResolution', 'powerMode',
      'instrumentationSha256',
    ],
  };
}

function envFixture(overrides = {}) {
  return {
    wasmSha256: sha256(WASM_BYTES),
    inputSha256: sha256(INPUT_BYTES),
    mediaSha256: sha256(MEDIA_BYTES),
    browserVersion: 'edge-120.0',
    mode: 'B',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    screenResolution: { width: 1920, height: 1080 },
    powerMode: 'balanced',
    instrumentationSha256: INSTRUMENTATION_SHA256,
    ...overrides,
  };
}

function validRoundRecord(overrides = {}) {
  return {
    side: 'B',
    pairIndex: 1,
    slot: 1,
    warmup: false,
    journey: { receivingAt: 5000, readyAt: 6250 },
    frames: frameSeq(35, 40),
    telemetryWrites: [1000, 1300, 1600],
    telemetryArmed: true,
    env: envFixture(),
    inputSha256: sha256(INPUT_BYTES),
    mediaSha256: sha256(MEDIA_BYTES),
    ...overrides,
  };
}

test('T28-04a a complete round derives readyMs, p50/p95 and invariants', () => {
  const judged = judgeRound(validRoundRecord(), baseRules());
  assert.equal(judged.exclusionReason, null);
  assert.deepEqual(judged.violations, []);
  assert.equal(judged.readyMs, 1250);
  assert.equal(judged.okFrameCount, 35);
  assert.equal(judged.settledFrameCount, 35);
  assert.equal(judged.rejectedFrameCount, 0);
  assert.equal(judged.p50Ms, 40, 'constant RTT array has p50 = 40');
  assert.equal(judged.p95Ms, 40, 'constant RTT array has p95 = 40');
  assert.equal(judged.maxInFlight, 1, 'sequential frames never overlap');
  assert.equal(judged.telemetryJudged, true);
  assert.equal(judged.minTelemetryGapMs, 300);
  assert.deepEqual(judged.telemetryGapMs, [300, 300]);
  assert.equal(judged.invariantViolations.length, 0);
});

test('T28-04b rejected frames are kept out of the RTT samples but recorded', () => {
  const frames = frameSeq(35, 40);
  frames[10].ok = false; // settled but rejected: not an RTT sample
  const judged = judgeRound(validRoundRecord({ frames }), baseRules());
  assert.equal(judged.exclusionReason, null, '34 ok frames still satisfy the minimum');
  assert.equal(judged.okFrameCount, 34);
  assert.equal(judged.rejectedFrameCount, 1);
  assert.equal(judged.settledFrameCount, 35);
  assert.equal(judged.rttSamples.length, 34, 'ok frames define the samples');
  assert.equal(judged.p50Ms, 40);
});
test('T28-04c too few settled frames excludes the round, samples kept', () => {
  const short = validRoundRecord({ frames: frameSeq(29, 40) });
  const judged = judgeRound(short, baseRules());
  assert.equal(judged.exclusionReason, 'E_FRAMES');
  assert.ok(judged.violations.some((v) => v.code === 'E_FRAMES'));
  assert.equal(judged.okFrameCount, 29);
  assert.equal(judged.p50Ms, null, 'percentiles are not reported for an excluded round');
  assert.equal(judged.p95Ms, null);
  assert.equal(judged.frames.length, 29, 'the raw samples stay in the record');
});

test('T28-04d malformed frames refuse the round', () => {
  const frames = frameSeq(35, 40);
  frames[3].settledAtMs = null; // a claimed-ok frame that never settled
  frames[3].rttMs = null;
  const judged = judgeRound(validRoundRecord({ frames }), baseRules());
  assert.equal(judged.exclusionReason, 'E_FRAMES');
  assert.ok(judged.violations.some((v) => v.code === 'E_FRAMES' && /frame 4/.test(v.detail)),
    'the violation names the malformed frame');
});

test('T28-04e overlapping frame intervals break the single-flight invariant', () => {
  const frames = frameSeq(35, 40, { stepMs: 100 });
  frames[20].t0Ms = frames[19].t0Ms + 20; // submitted before the previous settles
  frames[20].settledAtMs = frames[20].t0Ms + 40;
  frames[20].rttMs = 40;
  const judged = judgeRound(validRoundRecord({ frames }), baseRules());
  assert.equal(judged.maxInFlight, 2);
  assert.ok(judged.invariantViolations.some((v) => v.code === 'E_SINGLE_FLIGHT'));
  assert.equal(judged.exclusionReason, 'E_SINGLE_FLIGHT');
});

test('T28-04f telemetry write gaps below the frozen interval are a violation', () => {
  const judged = judgeRound(
    validRoundRecord({ telemetryWrites: [1000, 1300, 1350, 1700] }),
    baseRules(),
  );
  assert.ok(judged.invariantViolations.some((v) => v.code === 'E_TELEMETRY_INTERVAL'));
  assert.equal(judged.minTelemetryGapMs, 50);
  assert.equal(judged.telemetryJudged, true);
  // Fewer than two writes cannot be judged; that is recorded, not claimed.
  const sparse = judgeRound(validRoundRecord({ telemetryWrites: [1000] }), baseRules());
  assert.equal(sparse.telemetryJudged, false);
  assert.equal(sparse.minTelemetryGapMs, null);
});

test('T28-04g wrong input/media SHA on a round is refused', () => {
  const wrongInput = judgeRound(
    validRoundRecord({ inputSha256: '0'.repeat(64) }),
    baseRules(),
  );
  assert.equal(wrongInput.exclusionReason, 'E_INPUT_SHA');
  const wrongMedia = judgeRound(
    validRoundRecord({ mediaSha256: '0'.repeat(64) }),
    baseRules(),
  );
  assert.equal(wrongMedia.exclusionReason, 'E_MEDIA_SHA');
  assert.equal(wrongMedia.frames.length, 35, 'refused rounds keep their raw samples');
});

// --- Round-13 B-R1(b): RTT comes from the RAW start/end timestamps ---------

test('T-R13-B1b a lying rttMs is refused and the recomputed value is used', () => {
  const frames = frameSeq(35, 40);
  frames[7].rttMs = 0; // redundant field lies; t0Ms/settledAtMs unchanged
  const judged = judgeRound(validRoundRecord({ frames }), baseRules());
  assert.ok(judged.violations.some((v) => v.code === 'E_RTT_MISMATCH'
    && /frame 8/.test(v.detail) && /rttMs is 0/.test(v.detail) && /40/.test(v.detail)),
  JSON.stringify(judged.violations));
  assert.equal(judged.p50Ms, 40, 'the recomputed RTT feeds the percentile');
  assert.equal(judged.p95Ms, 40);
  assert.ok(judged.rttSamples.every((value) => value === 40),
    'no raw sample carries the redundant field value');
});

test('T-R13-B1b a settlement before its submission is refused', () => {
  const frames = frameSeq(35, 40);
  frames[3].settledAtMs = frames[3].t0Ms - 1;
  const judged = judgeRound(validRoundRecord({ frames }), baseRules());
  assert.ok(judged.violations.some((v) => v.code === 'E_RTT' && /frame 4/.test(v.detail)),
    JSON.stringify(judged.violations));
  assert.equal(judged.exclusionReason, 'E_RTT');
  assert.equal(judged.p50Ms, null, 'an unordered settlement is not measured');
});
// --- T28-05 environment matching, pair plan and pairing -------------------

test('T28-05a matchEnvironment reports every mismatching field', () => {
  const a = envFixture();
  const same = matchEnvironment(a, envFixture(), [
    'wasmSha256', 'inputSha256', 'mediaSha256', 'browserVersion', 'mode',
    'viewport', 'deviceScaleFactor', 'screenResolution', 'powerMode',
    'instrumentationSha256',
  ]);
  assert.equal(same.matched, true);
  assert.deepEqual(same.mismatches, []);

  const b = envFixture({ browserVersion: 'edge-121.0', powerMode: 'saver' });
  const diff = matchEnvironment(a, b, ['browserVersion', 'powerMode', 'mode']);
  assert.equal(diff.matched, false);
  assert.deepEqual(diff.mismatches, [
    { field: 'browserVersion', a: 'edge-120.0', b: 'edge-121.0' },
    { field: 'powerMode', a: 'balanced', b: 'saver' },
  ]);
});

test('T28-05b planRounds expands the frozen AB/BA/AB/BA/AB order', () => {
  const { method } = validateMethod(readFileSync(FROZEN_METHOD));
  const plan = planRounds(method);
  assert.equal(plan.length, 5);
  assert.deepEqual(plan.map((p) => p.order), ['AB', 'BA', 'AB', 'BA', 'AB']);
  assert.deepEqual(plan.map((p) => p.first), ['A', 'B', 'A', 'B', 'A']);
  assert.deepEqual(plan.map((p) => p.second), ['B', 'A', 'B', 'A', 'B']);
  assert.deepEqual(plan.map((p) => p.pair), [1, 2, 3, 4, 5]);
});

// Ten measured rounds (A = baseline, B = candidate) plus one warmup per
// build, all valid; the drive assigns pairIndex/slot from the frozen order.
function measuredRounds({ candidateRtt = 46, baselineRtt = 44 } = {}) {
  const order = ['AB', 'BA', 'AB', 'BA', 'AB'];
  const rounds = [
    { ...validRoundRecord({ side: 'A', warmup: true, pairIndex: 0, slot: 0 }) },
    { ...validRoundRecord({ side: 'B', warmup: true, pairIndex: 0, slot: 0 }) },
  ];
  order.forEach((pairOrder, pairIndex) => {
    const [first, second] = pairOrder === 'AB' ? ['A', 'B'] : ['B', 'A'];
    for (const [side, slot] of [[first, 1], [second, 2]]) {
      rounds.push(validRoundRecord({
        side,
        pairIndex: pairIndex + 1,
        slot,
        frames: frameSeq(35, side === 'A' ? baselineRtt : candidateRtt),
      }));
    }
  });
  return rounds;
}

test('T28-05c five valid pairs form; warmups are kept but excluded', () => {
  const rounds = measuredRounds();
  const result = pairRounds(rounds, baseRules());
  assert.equal(result.pairs.length, 5);
  assert.ok(result.pairs.every((p) => p.valid));
  for (const pair of result.pairs) {
    assert.ok(pair.a, `pair ${pair.pair} has the A round`);
    assert.ok(pair.b, `pair ${pair.pair} has the B round`);
    assert.equal(pair.a.exclusionReason, null);
    assert.equal(pair.b.exclusionReason, null);
  }
  assert.equal(result.invalidRounds.length, 2);
  assert.ok(result.invalidRounds.every((r) => r.reason === 'E_WARMUP'));
  assert.equal(result.validPairs, 5);
  // The warmup rounds keep their raw frames: nothing is deleted.
  assert.equal(result.invalidRounds[0].round.frames.length, 35);
});
test('T28-05d a dropped round invalidates its whole pair', () => {
  const rounds = measuredRounds();
  const dropped = rounds.findIndex(
    (r) => r.pairIndex === 3 && r.side === 'B' && !r.warmup,
  );
  rounds.splice(dropped, 1);
  const result = pairRounds(rounds, baseRules());
  assert.equal(result.pairs.length, 5);
  const pair3 = result.pairs.find((p) => p.pair === 3);
  assert.equal(pair3.valid, false);
  assert.equal(pair3.reason, 'E_PAIR_MISSING_ROUND');
  assert.equal(result.validPairs, 4, 'only four pairs remain measurable');
  // The surviving rounds of the broken pair stay in the raw record.
  assert.ok(result.invalidRounds.some((r) => r.reason === 'E_PAIR_MISSING_ROUND'
    && r.round.side === 'A' && r.round.pairIndex === 3));
});

test('T28-05e an excluded round invalidates its whole pair, samples kept', () => {
  const rounds = measuredRounds();
  const short = rounds.find((r) => r.pairIndex === 2 && r.side === 'B' && !r.warmup);
  short.frames = frameSeq(29, 40);
  const result = pairRounds(rounds, baseRules());
  const pair2 = result.pairs.find((p) => p.pair === 2);
  assert.equal(pair2.valid, false);
  assert.equal(pair2.reason, 'E_FRAMES');
  const invalidEntry = result.invalidRounds.find(
    (r) => r.reason === 'E_FRAMES' && r.round.frames.length === 29,
  );
  assert.ok(invalidEntry, 'the short round is listed as invalid');
  assert.equal(invalidEntry.round.frames.length, 29, 'raw samples preserved');
  assert.ok(result.invalidRounds.every((r) => Array.isArray(r.round.frames)),
    'every invalid entry still carries its raw samples');
  assert.equal(result.validPairs, 4);
});

test('T28-05f an environment mismatch within a pair refuses that pair', () => {
  const rounds = measuredRounds();
  const bRound = rounds.find((r) => r.pairIndex === 1 && r.side === 'B');
  bRound.env = envFixture({ browserVersion: 'edge-999.0' });
  const result = pairRounds(rounds, baseRules());
  const pair1 = result.pairs.find((p) => p.pair === 1);
  assert.equal(pair1.valid, false);
  assert.equal(pair1.reason, 'E_ENV_MISMATCH');
  assert.ok(pair1.detail.mismatches.some((m) => m.field === 'browserVersion'));
  assert.equal(result.validPairs, 4);
  assert.ok(result.invalidRounds.some((r) => r.reason === 'E_ENV_MISMATCH'));
});

test('T28-05g duplicate rounds for one slot are refused as a structural fault', () => {
  const rounds = measuredRounds();
  const duplicate = validRoundRecord({ side: 'B', pairIndex: 1, slot: 2 });
  rounds.push(duplicate);
  const result = pairRounds(rounds, baseRules());
  const pair1 = result.pairs.find((p) => p.pair === 1);
  assert.equal(pair1.valid, false);
  assert.equal(pair1.reason, 'E_PAIR_DUPLICATE_ROUND');
  assert.equal(result.validPairs, 4);
});
// --- T28-06 aggregation and threshold recomputation (FX-PERF-RAW style) ---
//
// The expected limits are recomputed INDEPENDENTLY from the frozen formula
// text in performance-method.json, not copied from the tool's internals:
//   readyMs:     candidateMedian <= baselineMedian * 1.10 + 250
//   frameRttP50: candidateMedian <= max(baselineMedian * 1.10, baselineMedian + 2)
//   frameRttP95: candidateMedian <= max(baselineMedian * 1.15, baselineMedian + 5)

function fxRounds({ candidateRtt, baselineRtt }) {
  return measuredRounds({ candidateRtt, baselineRtt });
}

function fxAnalysis({ candidateRtt = 46, baselineRtt = 44, readyBaseline, readyCandidate } = {}) {
  const rounds = fxRounds({ candidateRtt, baselineRtt });
  let index = 0;
  const baseReady = readyBaseline || [1000, 1100, 1000, 1200, 1100];
  const candReady = readyCandidate || [1150, 1250, 1200, 1300, 1200];
  for (const round of rounds) {
    if (round.warmup) continue;
    const pairReady = round.side === 'A' ? baseReady : candReady;
    round.journey = {
      receivingAt: 5000,
      readyAt: 5000 + pairReady[(round.pairIndex - 1) % pairReady.length],
    };
    index += 1;
  }
  const paired = pairRounds(rounds, baseRules());
  const summary = summarizeSides(paired.pairs);
  const metrics = evaluateThresholds(summary);
  const decision = decideVerdict({ pairs: paired.pairs, validPairs: paired.validPairs, metrics });
  return { rounds, paired, summary, metrics, decision };
}

test('T28-06a medians and thresholds recompute exactly from fixed arrays', () => {
  const { summary, metrics, decision } = fxAnalysis();
  // readyMs medians: baseline [1000,1100,1000,1200,1100] -> 1100,
  // candidate [1150,1250,1200,1300,1200] -> 1200.
  assert.equal(summary.A.readyMsMedian, 1100);
  assert.equal(summary.B.readyMsMedian, 1200);
  // Constant per-round RTT arrays give per-round p50 = p95 = the constant.
  assert.equal(summary.A.rttP50Median, 44);
  assert.equal(summary.A.rttP95Median, 44);
  assert.equal(summary.B.rttP50Median, 46);
  assert.equal(summary.B.rttP95Median, 46);

  const ready = metrics.readyMs;
  assert.equal(ready.baselineMedian, 1100);
  assert.equal(ready.candidateMedian, 1200);
  assert.equal(ready.limit, 1100 * 1.10 + 250, 'independent frozen-formula recomputation');
  assert.equal(ready.marginMs, (1100 * 1.10 + 250) - 1200);
  assert.equal(ready.pass, 1200 <= 1100 * 1.10 + 250);

  const p50 = metrics.frameRttP50Ms;
  assert.equal(p50.limit, Math.max(44 * 1.10, 44 + 2));
  assert.equal(p50.marginMs, Math.max(44 * 1.10, 44 + 2) - 46);
  assert.equal(p50.pass, 46 <= Math.max(44 * 1.10, 44 + 2));

  const p95 = metrics.frameRttP95Ms;
  assert.equal(p95.limit, Math.max(44 * 1.15, 44 + 5));
  assert.equal(p95.pass, 46 <= Math.max(44 * 1.15, 44 + 5));

  assert.equal(decision.verdict, 'PASS');
  assert.deepEqual(decision.reasons, []);
});

test('T28-06b per-round percentiles feed the median, not a pooled sample', () => {
  // Five baseline rounds with different frame COUNTS and different constant
  // RTTs. Per-round p50 = [40, 60, 42, 48, 46] -> median 46; per-round p95 is
  // the same list -> 46. A pooled percentile over all 220 frames would give
  // p50 = 48 and p95 = 60, so this distribution does distinguish the two
  // aggregations (the previous fixture could not).
  const rounds = measuredRounds({ candidateRtt: 50, baselineRtt: 40 });
  const layout = [
    { count: 30, rtt: 40 },
    { count: 100, rtt: 60 },
    { count: 30, rtt: 42 },
    { count: 30, rtt: 48 },
    { count: 30, rtt: 46 },
  ];
  const aRounds = rounds.filter((r) => r.side === 'A' && !r.warmup)
    .sort((x, y) => x.pairIndex - y.pairIndex);
  aRounds.forEach((round, i) => { round.frames = frameSeq(layout[i].count, layout[i].rtt); });
  const paired = pairRounds(rounds, baseRules());
  const summary = summarizeSides(paired.pairs);

  assert.deepEqual([...summary.A.rttP50Values].sort((a, b) => a - b), [40, 42, 46, 48, 60]);
  assert.equal(summary.A.rttP50Median, 46, 'median of the five per-round p50 values');
  assert.equal(summary.A.rttP95Median, 46);

  const pooled = aRounds.flatMap((round) => round.frames.map((frame) => frame.rttMs));
  assert.equal(pooled.length, 220);
  assert.equal(nearestRankPercentile(pooled, 50), 48, 'a pooled p50 would be 48');
  assert.equal(nearestRankPercentile(pooled, 95), 60, 'a pooled p95 would be 60');

  // Candidate pooled would also be 50; the per-round median is 50 too.
  assert.equal(summary.B.rttP50Median, 50);
});
test('T28-06c a breached threshold fails the verdict with the numbers kept', () => {
  // candidate p50 = 50 exceeds max(44 * 1.10, 44 + 2) = 48.4.
  const { metrics, decision } = fxAnalysis({ candidateRtt: 50, baselineRtt: 44 });
  assert.equal(metrics.frameRttP50Ms.pass, false);
  assert.ok(metrics.frameRttP50Ms.marginMs < 0, 'a negative margin shows the breach size');
  assert.equal(decision.verdict, 'FAIL');
  assert.ok(decision.reasons.some((r) => r.metric === 'frameRttP50Ms'),
    'the failing metric is named');
});

test('T28-06d fewer than five valid pairs is NOT_RUN, never PASS', () => {
  const rounds = measuredRounds({ candidateRtt: 46, baselineRtt: 44 });
  const short = rounds.find((r) => r.pairIndex === 5 && r.side === 'B');
  short.frames = frameSeq(10, 40);
  const paired = pairRounds(rounds, baseRules());
  assert.equal(paired.validPairs, 4);
  const summary = summarizeSides(paired.pairs);
  const metrics = evaluateThresholds(summary);
  const decision = decideVerdict({ pairs: paired.pairs, validPairs: paired.validPairs, metrics });
  assert.equal(decision.verdict, 'NOT_RUN');
  assert.ok(decision.reasons.some((r) => /fewer than 5/.test(r.detail)),
    'the reason states the pair shortfall');
  // The summary still reports the four valid pairs' numbers; it does not
  // silently average over the broken one.
  assert.equal(summary.B.readyMsValues.length, 4);
});

test('T28-06e a candidate invariant violation is FAIL, not dropped noise', () => {
  const rounds = measuredRounds({ candidateRtt: 46, baselineRtt: 44 });
  const offender = rounds.find((r) => r.side === 'B' && r.pairIndex === 2);
  // Reintroduce a single-flight overlap on one candidate round.
  offender.frames = frameSeq(35, 46);
  offender.frames[20].t0Ms = offender.frames[19].t0Ms + 20;
  offender.frames[20].settledAtMs = offender.frames[20].t0Ms + 46;
  offender.frames[20].rttMs = 46;
  const paired = pairRounds(rounds, baseRules());
  const summary = summarizeSides(paired.pairs);
  const metrics = evaluateThresholds(summary);
  const decision = decideVerdict({ pairs: paired.pairs, validPairs: paired.validPairs, metrics });
  assert.equal(decision.verdict, 'FAIL');
  assert.ok(decision.reasons.some((r) => r.code === 'E_SINGLE_FLIGHT'),
    'the invariant violation is the named failure');
  assert.ok(decision.reasons.some((r) => r.side === 'B' && r.pairIndex === 2),
    'the offending round is identified');
});

test('T28-06f baseline-only violations do not fail the candidate', () => {
  const rounds = measuredRounds({ candidateRtt: 46, baselineRtt: 44 });
  const offender = rounds.find((r) => r.side === 'A' && r.pairIndex === 2);
  offender.frames = frameSeq(35, 44);
  offender.frames[20].t0Ms = offender.frames[19].t0Ms + 20;
  offender.frames[20].settledAtMs = offender.frames[20].t0Ms + 44;
  offender.frames[20].rttMs = 44;
  const paired = pairRounds(rounds, baseRules());
  const summary = summarizeSides(paired.pairs);
  const metrics = evaluateThresholds(summary);
  const decision = decideVerdict({ pairs: paired.pairs, validPairs: paired.validPairs, metrics });
  // The overlapping baseline round invalidates its pair; the measurement is
  // not decidable (4 pairs), and the candidate is NOT blamed for it.
  assert.equal(decision.verdict, 'NOT_RUN');
  assert.ok(!decision.reasons.some((r) => r.side === 'B' && r.code === 'E_SINGLE_FLIGHT'));
});
// --- T28-07 outputs: raw rounds kept, attempt-scoped, refuse overwrite ----

function fullOutputInput(fx) {
  return {
    candidate: { runId: CAND_RUN, attemptId: ATTEMPT_ID },
    baseline: { runId: BASE_RUN, attemptId: 'baseline-001' },
    methodSha256: 'f'.repeat(64),
    binding: {
      inputSha256: sha256(INPUT_BYTES),
      mediaSha256: sha256(MEDIA_BYTES),
      inputBytes: INPUT_BYTES.length,
      inputPath: 'fixtures/primary-input.bin',
      mediaPath: 'fixtures/media.webm',
      sides: { A: null, B: null },
    },
    rounds: fx.paired.allRounds,
    pairs: fx.paired.pairs,
    invalidRounds: fx.paired.invalidRounds,
    summary: fx.summary,
    metrics: fx.metrics,
    decision: fx.decision,
    startedAtIso: '2026-10-25T00:00:00.000Z',
    finishedAtIso: '2026-10-25T00:10:00.000Z',
  };
}

test('T28-07a buildOutputFiles keeps every raw round and adds the analysis', () => {
  const fx = fxAnalysis({ candidateRtt: 50, baselineRtt: 44 });
  const files = buildOutputFiles(fullOutputInput(fx));
  for (const required of ['run.json', 'environment.json', 'input.json', 'manifest.json',
    'invalid-rounds.json', 'summary.json', 'comparison.json']) {
    assert.ok(files[required], `${required} is present`);
  }
  const runJson = files['run.json'];
  assert.equal(runJson.methodSha256, 'f'.repeat(64));
  assert.equal(runJson.outputVersion, 1);

  // S9: the frozen input SHA anchor lives in the T6 input manifest, not in
  // the method file (primaryInput.sha256 stays null until a new version).
  assert.match(files['input.json'].frozenAnchor, /T6/);
  assert.match(files['input.json'].frozenAnchor, /input-manifest/);
  // S11: the 30-frame gate counts resolved (ok) frames, which is stricter
  // than the method's settled-frame wording; the output says so explicitly.
  assert.equal(files['summary.json'].counting.gate, 'okFrameCount');
  assert.match(files['summary.json'].counting.note, /settledFrameCount/);

  // One raw file per collected round, valid or not, warmups included.
  const roundFiles = Object.keys(files).filter((name) => name.startsWith('rounds/'));
  assert.equal(roundFiles.length, fx.paired.allRounds.length);

  // The FAIL case keeps the breaching round's raw frames intact.
  const comparison = files['comparison.json'];
  assert.equal(comparison.verdict, 'FAIL');
  assert.equal(comparison.validPairs, 5);
  assert.equal(comparison.metrics.frameRttP50Ms.candidateMedian, 50);
  const invalidRounds = files['invalid-rounds.json'].rounds;
  assert.equal(invalidRounds.length, 2, 'the two warmups are the only invalid rounds here');
});

test('T28-07b the output directory is attempt-scoped and refuses overwrites', (t) => {
  const repo = makeRepo(t, 'outdir');
  const fakeContext = {
    attemptId: ATTEMPT_ID,
    abs: { runRoot: join(repo, 'docs', 'tests', 'runs', CAND_RUN) },
  };
  const dir = outputDirFor(fakeContext);
  assert.ok(dir.includes(join('measurements', 'ux-overhead', ATTEMPT_ID)));
  assert.equal(existsSync(dir), false);
  const files = buildOutputFiles(fullOutputInput(fxAnalysis({ candidateRtt: 46, baselineRtt: 44 })));
  writeMeasurements(fakeContext, files);
  assert.ok(existsSync(join(dir, 'comparison.json')));
  assert.throws(
    () => writeMeasurements(fakeContext, files),
    isUxError('E_OUTPUT_EXISTS'),
  );
  // Baseline roots are never touched: the tool writes only under the
  // candidate context it was given.
  assert.equal(existsSync(join(repo, 'docs', 'tests', 'runs', BASE_RUN)), false);
});

test('T28-07c the observer script wraps submitFrame and keeps the promise', () => {
  assert.ok(typeof OBSERVER_SCRIPT === 'string' && OBSERVER_SCRIPT.includes('submitFrame'));
  assert.ok(OBSERVER_SCRIPT.includes('/src/decoder-client.js'));
  assert.ok(OBSERVER_SCRIPT.includes('MutationObserver'));
  // S5: every numeric telemetry span is named explicitly, #ux-progress too.
  for (const id of ['#ux-elapsed', '#ux-rate', '#ux-progress', '#ux-media']) {
    assert.ok(OBSERVER_SCRIPT.includes(id), `${id} is explicitly observed`);
  }
  // B2: the observer must not poll; arming is event-driven only.
  assert.ok(!OBSERVER_SCRIPT.includes('setInterval'), 'no polling interval in the observer');
  assert.equal(INSTRUMENTATION_SHA256, sha256(OBSERVER_SCRIPT),
    'the recorded instrumentation SHA is the script actually injected');
  // The wrapper must not alter settlement: it records via side promises.
  assert.ok(OBSERVER_SCRIPT.includes('original.apply'));
  assert.ok(OBSERVER_SCRIPT.includes('return promise'));
});
// --- T28-08 CLI exit codes --------------------------------------------------

function runCli(args) {
  return spawnSync(process.execPath, [MEASURE_UX, ...args], {
    cwd: REPO, encoding: 'utf8', timeout: 120000,
  });
}

test('T28-08a --help exits 0 and names the three required inputs', () => {
  const res = runCli(['--help']);
  assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
  assert.match(res.stdout, /--context/);
  assert.match(res.stdout, /--baseline-context/);
  assert.match(res.stdout, /--method/);
  assert.match(res.stdout, /--validate-only/);
});

test('T28-08b missing required arguments exit 2 before any validation', () => {
  for (const args of [
    [],
    ['--context', 'x.json'],
    ['--context', 'x.json', '--baseline-context', 'y.json'],
  ]) {
    const res = runCli(args);
    assert.equal(res.status, 2, `args=${JSON.stringify(args)}: ${res.stdout} ${res.stderr}`);
    assert.match(res.stderr, /--context|--baseline-context|--method/);
  }
});

test('T28-08c an unknown argument exits 2 (unknown-gate analogue)', () => {
  const res = runCli(['--gate', 'local']);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /unknown argument/);
});

test('T28-08d a missing or unfrozen method file refuses with exit 3', (t) => {
  const repo = makeRepo(t, 'method');
  const missing = runCli([
    '--context', join(repo, 'ctx.json'), '--baseline-context', join(repo, 'ctx.json'),
    '--method', join(repo, 'nope.json'),
  ]);
  assert.equal(missing.status, 3);
  assert.match(`${missing.stderr}`, /not found/i);

  const unfrozenRel = 'docs/tests/unfrozen-method.json';
  put(repo, unfrozenRel, '{"frozen":false}');
  const unfrozen = runCli([
    '--context', join(repo, 'ctx.json'), '--baseline-context', join(repo, 'ctx.json'),
    '--method', join(repo, ...unfrozenRel.split('/')),
  ]);
  assert.equal(unfrozen.status, 3);
  assert.match(unfrozen.stderr, /frozen/i);
});
// --- T28-09 CLI validation chain -------------------------------------------

test('T28-09a identical contexts are refused (one build cannot be both sides)', (t) => {
  const fx = buildFxRepo(t);
  const res = runCli([
    '--context', fx.candidatePath, '--baseline-context', fx.candidatePath,
    '--method', FROZEN_METHOD, '--repo-root', fx.repo,
  ]);
  assert.equal(res.status, 3);
  assert.match(`${res.stdout}${res.stderr}`, /same|equal|roots/i);
});

test('T28-09b a tampered staged build refuses (product manifest SHA guard)', (t) => {
  const fx = buildFxRepo(t);
  const appPath = join(fx.repo, 'build-desktop-recv', 'runs', CAND_RUN, 'receiver', 'src', 'app.js');
  writeFileSync(appPath, 'tampered product byte\n');
  const before = treeDigest(fx.repo);
  const res = runCli([
    '--context', fx.candidatePath, '--baseline-context', fx.baselinePath,
    '--method', FROZEN_METHOD, '--repo-root', fx.repo,
  ]);
  assert.equal(res.status, 3);
  assert.match(`${res.stdout}${res.stderr}`, /SHA-256|manifest/i);
  assert.equal(treeDigest(fx.repo), before, 'the refused command wrote nothing');
});

test('T28-09c an input SHA mismatch between the sides refuses', (t) => {
  const fx = buildFxRepo(t);
  // A different input on the candidate side, with a consistent context built
  // by hand (so the other-input manifest on disk stays), letting the refusal
  // land on the cross-side rule rather than on a digest mismatch.
  const otherInput = Buffer.alloc(2048, 0x5a);
  const input = inputManifestFor(fx.repo, CAND_RUN, { inputBytes: otherInput });
  const baseContext = JSON.parse(readFileSync(fx.candidatePath, 'utf8'));
  baseContext.inputManifestSha256 = input.manifestSha;
  const variantRel = 'docs/tests/receiver-ux-v2/variants/other-input.json';
  const contextPath = put(fx.repo, variantRel, `${JSON.stringify(baseContext, null, 2)}\n`);
  const res = runCli([
    '--context', contextPath, '--baseline-context', fx.baselinePath,
    '--method', FROZEN_METHOD, '--repo-root', fx.repo,
  ]);
  assert.equal(res.status, 3);
  assert.match(`${res.stdout}${res.stderr}`, /input/i);
  assert.match(`${res.stdout}${res.stderr}`, /sha/i);
});

test('T28-09d an existing output directory for the attempt refuses', (t) => {
  const fx = buildFxRepo(t);
  const outDir = join(fx.repo, 'docs', 'tests', 'runs', CAND_RUN,
    'measurements', 'ux-overhead', ATTEMPT_ID);
  mkdirSync(outDir, { recursive: true });
  const res = runCli([
    '--context', fx.candidatePath, '--baseline-context', fx.baselinePath,
    '--method', FROZEN_METHOD, '--repo-root', fx.repo, '--validate-only',
  ]);
  assert.equal(res.status, 3);
  assert.match(`${res.stdout}${res.stderr}`, /exists|overwrite/i);
});

test('T28-09e --validate-only accepts a good pair and writes nothing', (t) => {
  const fx = buildFxRepo(t);
  const before = treeDigest(fx.repo);
  const res = runCli([
    '--context', fx.candidatePath, '--baseline-context', fx.baselinePath,
    '--method', FROZEN_METHOD, '--repo-root', fx.repo, '--validate-only',
  ]);
  assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
  const plan = JSON.parse(res.stdout);
  assert.equal(plan.pairs, 5);
  assert.equal(plan.order.join(','), 'AB,BA,AB,BA,AB');
  assert.equal(plan.warmupPerBuild, 1);
  assert.equal(plan.methodSha256, sha256(readFileSync(FROZEN_METHOD)));
  assert.ok(plan.inputSha256, 'the frozen input binding is in the plan');
  assert.ok(plan.mediaSha256, 'the frozen media binding is in the plan');
  assert.ok(plan.instrumentationSha256, 'the observer SHA is in the plan');
  assert.match(plan.outputDir, /ux-overhead/);
  assert.equal(treeDigest(fx.repo), before, 'validation writes nothing');
});

// --- T30-B1: collection errors are judged and written, never abort --------

// A minimal validated object for drive-level tests: the stubbed runRound
// replaces all browser work, but runAbDrive/judging/output stay the real code.
function minimalValidated(t, label) {
  const repo = makeRepo(t, label);
  const runRoot = join(repo, 'docs', 'tests', 'runs', CAND_RUN);
  const method = JSON.parse(readFileSync(FROZEN_METHOD, 'utf8'));
  const binding = {
    inputManifest: 'docs/tests/runs/x/input-manifest.json',
    inputSha256: sha256(INPUT_BYTES),
    mediaSha256: sha256(MEDIA_BYTES),
    inputBytes: INPUT_BYTES.length,
    inputPath: 'fixtures/primary-input.bin',
    mediaRelativePath: 'fixtures/media.webm',
  };
  return {
    repoRoot: repo,
    context: { runId: CAND_RUN, attemptId: ATTEMPT_ID, phase: 'final', abs: { runRoot } },
    baseline: { runId: BASE_RUN, attemptId: 'baseline-001', phase: 'baseline' },
    method,
    methodSha256: sha256(readFileSync(FROZEN_METHOD)),
    minSettledFrames: 30,
    telemetryMinWriteIntervalMs: 250,
    candidateBuild: {
      receiverDir: join(repo, 'cand'), wasmSha256: sha256(WASM_BYTES),
      manifestSha256: '1'.repeat(64), fileCount: 4,
    },
    baselineBuild: {
      receiverDir: join(repo, 'base'), wasmSha256: sha256(WASM_BYTES),
      manifestSha256: '2'.repeat(64), fileCount: 4,
    },
    candidateInput: binding,
    baselineInput: binding,
    outputDir: join(runRoot, 'measurements', 'ux-overhead', ATTEMPT_ID),
  };
}

function roundKey(round) {
  return `${round.side}:${round.warmup ? 'warm' : round.pairIndex}`;
}

test('T30-B1a a collection error is undecidable but keeps its raw samples', () => {
  // Candidate business failure (never reached the artifact) -> FAIL.
  const rounds = measuredRounds({ candidateRtt: 46, baselineRtt: 44 });
  const business = rounds.find((r) => r.side === 'B' && r.pairIndex === 2 && !r.warmup);
  Object.assign(business, {
    collectionError: { code: 'E_JOURNEY_INCOMPLETE', kind: 'business', message: 'journey never reached readyAt' },
    journey: { receivingAt: 5000 },
  });
  const judged = judgeRound(business, baseRules());
  assert.equal(judged.exclusionReason, 'E_COLLECTION_ERROR');
  assert.equal(judged.frames.length, 35, 'the salvaged raw samples stay in the record');
  const paired = pairRounds(rounds, baseRules());
  assert.equal(paired.validPairs, 4, 'the pair carrying the error is undecidable');
  const decision = decideVerdict({
    pairs: paired.pairs,
    validPairs: paired.validPairs,
    metrics: evaluateThresholds(summarizeSides(paired.pairs)),
  });
  assert.equal(decision.verdict, 'FAIL');
  assert.ok(decision.reasons.some((r) => r.code === 'E_COLLECTION_ERROR'
    && r.kind === 'business' && r.pairIndex === 2 && r.side === 'B'));

  // A tool/environment failure is NOT_RUN, never a candidate FAIL.
  const rounds2 = measuredRounds({ candidateRtt: 46, baselineRtt: 44 });
  const environment = rounds2.find((r) => r.side === 'B' && r.pairIndex === 3 && !r.warmup);
  Object.assign(environment, {
    collectionError: { code: 'E_COLLECTION_FAILED', kind: 'environment', message: 'browser launch failed' },
  });
  const paired2 = pairRounds(rounds2, baseRules());
  const decision2 = decideVerdict({
    pairs: paired2.pairs,
    validPairs: paired2.validPairs,
    metrics: evaluateThresholds(summarizeSides(paired2.pairs)),
  });
  assert.equal(decision2.verdict, 'NOT_RUN');
  assert.ok(decision2.reasons.some((r) => r.code === 'E_COLLECTION_ERROR'
    && r.kind === 'environment' && r.side === 'B'));
});

test('T30-B1b a stubbed business failure still writes rounds and invalid-rounds', async (t) => {
  const validated = minimalValidated(t, 'drive-business');
  const records = measuredRounds({ candidateRtt: 46, baselineRtt: 44 });
  const business = records.find((r) => r.side === 'B' && r.pairIndex === 2 && !r.warmup);
  Object.assign(business, {
    collectionError: { code: 'E_JOURNEY_INCOMPLETE', kind: 'business', message: 'no artifact' },
    journey: { receivingAt: 5000 },
  });
  const byKey = new Map(records.map((record) => [roundKey(record), record]));
  const result = await runAbDrive(validated, {
    runRound: async (entry) => byKey.get(
      `${entry.side}:${entry.warmup ? 'warm' : entry.pairIndex}`,
    ),
  });
  assert.equal(result.exitCode, 1, 'a FAIL measurement exits 1, never 3');
  assert.equal(result.output.verdict, 'FAIL');
  const dir = validated.outputDir;
  const saved = JSON.parse(readFileSync(join(dir, 'rounds', 'pair-2-B.json'), 'utf8'));
  assert.equal(saved.collectionError.kind, 'business');
  assert.equal(saved.frames.length, 35, 'salvaged frames are on disk');
  const invalid = JSON.parse(readFileSync(join(dir, 'invalid-rounds.json'), 'utf8'));
  assert.ok(invalid.rounds.some((r) => r.file === 'rounds/pair-2-B.json'
    && r.reason === 'E_COLLECTION_ERROR'));
  const comparison = JSON.parse(readFileSync(join(dir, 'comparison.json'), 'utf8'));
  assert.equal(comparison.verdict, 'FAIL');
  assert.equal(comparison.validPairs, 4);
});

test('T30-B1c a throwing runRound becomes an environment record, outputs still land', async (t) => {
  const validated = minimalValidated(t, 'drive-throw');
  const records = measuredRounds({ candidateRtt: 46, baselineRtt: 44 });
  const byKey = new Map(records.map((record) => [roundKey(record), record]));
  const result = await runAbDrive(validated, {
    runRound: async (entry) => {
      if (entry.side === 'B' && entry.pairIndex === 1 && !entry.warmup) {
        throw new Error('stub launch exploded');
      }
      return byKey.get(`${entry.side}:${entry.warmup ? 'warm' : entry.pairIndex}`);
    },
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.output.verdict, 'NOT_RUN', 'a tool failure is not a candidate FAIL');
  const saved = JSON.parse(readFileSync(join(validated.outputDir, 'rounds', 'pair-1-B.json'), 'utf8'));
  assert.equal(saved.collectionError.kind, 'environment');
  assert.match(saved.collectionError.message, /stub launch exploded/);
  const invalid = JSON.parse(readFileSync(join(validated.outputDir, 'invalid-rounds.json'), 'utf8'));
  assert.ok(invalid.rounds.some((r) => r.file === 'rounds/pair-1-B.json'
    && r.reason === 'E_COLLECTION_ERROR'));
  assert.ok(existsSync(join(validated.outputDir, 'comparison.json')));
});

// --- T30-B2: event-driven telemetry arming (no polling), armed is judged ---

// Execute the REAL observer script in a VM with a fake page. A module loader
// is injected through window.__uxModuleLoader (a seam no real page uses), so
// the wrap succeeds on the first try without the vm dynamic-import flag;
// every timer call is recorded.
async function runObserverScript(options = {}) {
  const { readyState = 'complete', clock = { now: 0 }, moduleNamespace = null } = options;
  const spans = options.spans || [];
  const timers = { setTimeout: 0, setInterval: 0 };
  const listeners = {};
  const mutationObservers = [];
  const addListener = (type, fn) => {
    (listeners[type] || (listeners[type] = [])).push(fn);
  };
  const sandbox = {
    performance: { now: () => clock.now },
    Promise,
    setTimeout: (...args) => { timers.setTimeout += 1; return 0; },
    setInterval: (...args) => { timers.setInterval += 1; return 0; },
    clearTimeout: () => {},
    clearInterval: () => {},
    MutationObserver: class {
      constructor(callback) {
        this.cb = callback;
        this.disconnected = false;
        mutationObservers.push(this);
      }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
    document: {
      readyState,
      documentElement: {},
      addEventListener: addListener,
      querySelectorAll: () => spans.slice(),
    },
    window: {
      addEventListener: addListener,
      __uxModuleLoader: async () => moduleNamespace,
    },
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  const script = new vm.Script(OBSERVER_SCRIPT);
  script.runInContext(context);
  const drain = async () => {
    for (let i = 0; i < 5; i += 1) await new Promise((step) => setImmediate(step));
  };
  const fire = (type) => {
    for (const fn of listeners[type] || []) fn();
  };
  return { sandbox, spans, listeners, mutationObservers, timers, clock, drain, fire };
}

test('T30-B2a a page without numeric spans leaves no pending timer', async () => {
  const FakeClient = class { submitFrame() { return Promise.resolve({}); } };
  const page = await runObserverScript({
    readyState: 'complete',
    spans: [],
    moduleNamespace: { DecoderClient: FakeClient },
  });
  await page.drain();
  const state = page.sandbox.window.__uxObserver;
  assert.equal(state.wrapped, true, 'the submitFrame wrapper still installs');
  assert.equal(state.telemetryArmed, false);
  assert.equal(state.telemetryUnavailable, true, 'absence is recorded, not polled for');
  assert.equal(page.timers.setInterval, 0, 'no polling interval was ever scheduled');
  assert.equal(page.timers.setTimeout, 0, 'no retry/settle timer was scheduled either');
  assert.equal(page.mutationObservers.length, 0, 'a fully parsed page needs no root observer');
});

test('T30-B2b arming is event-driven: DOMContentLoaded arms, load disarms', async () => {
  const FakeClient = class { submitFrame() { return Promise.resolve({}); } };
  const page = await runObserverScript({
    readyState: 'loading',
    spans: [],
    moduleNamespace: { DecoderClient: FakeClient },
  });
  await page.drain();
  const state = page.sandbox.window.__uxObserver;
  assert.equal(state.telemetryArmed, false, 'spans are not parsed yet');
  assert.equal(page.mutationObservers.length, 1, 'a bounded root observer covers dynamic spans');
  // The static spans appear by DOMContentLoaded (the real product shape).
  page.spans.push({}, {}, {}, {});
  page.fire('DOMContentLoaded');
  assert.equal(state.telemetryArmed, true);
  // Arming created exactly one numeric-area observer; a later root mutation
  // must not double-arm or add another observer.
  assert.equal(page.mutationObservers.length, 2, 'root observer + numeric-area observer');
  page.mutationObservers[0].cb();
  assert.equal(page.mutationObservers.length, 2);
  // load disarms the root observer; the numeric observer stays.
  page.fire('load');
  assert.equal(page.mutationObservers[0].disconnected, true);
  assert.equal(page.mutationObservers[1].disconnected, false);
  assert.equal(state.telemetryArmed, true);
  assert.equal(state.telemetryUnavailable, false);
  assert.equal(page.timers.setInterval, 0);
  assert.equal(page.timers.setTimeout, 0, 'no timer was needed to arm');
});

test('T30-B2c telemetryArmed is required on the candidate, not-applicable on the baseline', () => {
  const candidate = judgeRound(validRoundRecord({ telemetryArmed: false }), baseRules());
  assert.equal(candidate.exclusionReason, 'E_TELEMETRY_NOT_ARMED');
  assert.ok(candidate.invariantViolations.some((v) => v.code === 'E_TELEMETRY_NOT_ARMED'),
    'a candidate without the numeric area is a product fault, not noise');

  const baseline = judgeRound(validRoundRecord({ side: 'A', telemetryArmed: false }), baseRules());
  assert.equal(baseline.exclusionReason, null, 'the baseline UI has no numeric area by design');
  assert.equal(baseline.telemetryApplicable, false);
  assert.match(baseline.telemetryNote, /not applicable/);
  assert.ok(!baseline.violations.some((v) => v.code === 'E_TELEMETRY_NOT_ARMED'));

  const warmup = judgeRound(validRoundRecord({ warmup: true, telemetryArmed: false }), baseRules());
  assert.ok(!warmup.violations.some((v) => v.code === 'E_TELEMETRY_NOT_ARMED'),
    'warmups never gate the run');

  // A salvaged collection-error round does not double-report as not-armed.
  const salvaged = judgeRound(validRoundRecord({
    telemetryArmed: false,
    collectionError: { code: 'E_COLLECTION_FAILED', kind: 'environment', message: 'x' },
  }), baseRules());
  assert.ok(!salvaged.violations.some((v) => v.code === 'E_TELEMETRY_NOT_ARMED'));

  // The verdict fails even though every threshold passes.
  const rounds = measuredRounds({ candidateRtt: 46, baselineRtt: 44 });
  const offender = rounds.find((r) => r.side === 'B' && r.pairIndex === 3 && !r.warmup);
  offender.telemetryArmed = false;
  const paired = pairRounds(rounds, baseRules());
  const decision = decideVerdict({
    pairs: paired.pairs,
    validPairs: paired.validPairs,
    metrics: evaluateThresholds(summarizeSides(paired.pairs)),
  });
  assert.equal(decision.verdict, 'FAIL');
  assert.ok(decision.reasons.some((r) => r.code === 'E_TELEMETRY_NOT_ARMED' && r.pairIndex === 3));
});

// --- S6b: execute the wrapper, prove promise identity and settlement ------

// --- Round-12 A-R3: the live leg needs a REAL 30s Receiving window ---------
//
// The round-12 external review showed every 09b live record: 15 samples at
// ~2s, only the first 9 Receiving, Ready at ~18.1s, yet valid=true because the
// old judge only asked "did frames settle / did revision ever change". The
// judge now verifies the WINDOW ITSELF: all samples Receiving, one constant
// session identity, >=30000ms observed, and at least one settlement inside the
// window. These tests are RED until tools/desktop-recv/e2e/measure-ux-calc.mjs
// exports judgeLiveSide (the module split also serves B-02/S2).

async function loadCalc() {
  return import('../e2e/measure-ux-calc.mjs');
}

// 09b shape: 15 samples ~2s apart, 9 Receiving then 6 Ready, Ready at ~18.1s.
function liveRecord09bShape(overrides = {}) {
  const base = 1792900521929;
  const samples = [];
  for (let i = 0; i < 15; i += 1) {
    const receiving = i < 9;
    samples.push({
      at: base + i * 2010,
      atMs: i * 2010,
      perfNow: 6000 + i * 2010,
      state: receiving ? 'Receiving' : 'Ready',
      primary: receiving ? (i === 0 ? '正在等待有效数据' : '正在接收数据') : '文件已接收完成，请保存',
      elapsed: receiving ? `${(i * 1.8).toFixed(1)}s` : '16.4s',
      rate: receiving ? '62.4 KiB/s（含冗余）' : '65.4 KiB/s（含冗余）',
      sessionId: 'sess-09b',
      sessionSeq: null,
      revision: receiving ? 2 : 3,
      submitted: receiving ? 1 : 142,
    });
  }
  const frames = [];
  for (let i = 0; i < 142; i += 1) {
    const t0 = 6488 + i * 115;
    frames.push({ seq: i + 1, t0Ms: t0, settledAtMs: t0 + 60, ok: true, rttMs: 60 });
  }
  return {
    side: 'B',
    pairIndex: 1,
    samples,
    frames,
    telemetryWrites: Array.from({ length: 60 }, (_, i) => 6489 + i * 260),
    telemetryArmed: true,
    observations: {
      afterStop: {
        frozenA: { state: 'Stopped', elapsed: '16.4s', primary: '已停止' },
        frozenB: { state: 'Stopped', elapsed: '16.4s', primary: '已停止' },
      },
    },
    ...overrides,
  };
}

// A compliant live record: 16 samples covering 30s, every one Receiving, one
// session identity, settlements inside the perf-domain window, candidate
// telemetry armed with >=250ms gaps, numeric/status feedback, frozen clock.
function liveRecordCompliant(overrides = {}) {
  const samples = [];
  for (let i = 0; i <= 15; i += 1) {
    samples.push({
      at: 1000000 + i * 2000,
      atMs: i * 2000,
      perfNow: 5000 + i * 2000,
      state: 'Receiving',
      primary: i === 0 ? '正在等待有效数据' : '正在接收数据',
      elapsed: `${(i * 2).toFixed(1)}s`,
      rate: '60.0 KiB/s（含冗余）',
      sessionId: 'sess-live-1',
      sessionSeq: 7,
      revision: 2,
      submitted: 1 + i,
    });
  }
  const frames = [];
  for (let i = 0; i < 70; i += 1) {
    const t0 = 5200 + i * 450;
    frames.push({ seq: i + 1, t0Ms: t0, settledAtMs: t0 + 60, ok: true, rttMs: 60 });
  }
  return {
    side: 'B',
    pairIndex: 1,
    samples,
    frames,
    telemetryWrites: Array.from({ length: 60 }, (_, i) => 5100 + i * 260),
    telemetryArmed: true,
    observations: {
      afterStop: {
        frozenA: { state: 'Stopped', elapsed: '32.0s', primary: '已停止' },
        frozenB: { state: 'Stopped', elapsed: '32.0s', primary: '已停止' },
      },
    },
    ...overrides,
  };
}

test('T-R12-A3a the 09b shape is refused: short window and Ready samples', async () => {
  const { judgeLiveSide } = await loadCalc();
  const judged = judgeLiveSide(liveRecord09bShape(), 'B');
  assert.equal(judged.valid, false, 'the 09b shape must never be VALID again');
  assert.ok(judged.violations.some((v) => v.code === 'E_LIVE_WINDOW_SHORT'),
    `window-short violation expected, got ${JSON.stringify(judged.violations)}`);
  assert.ok(judged.violations.some((v) => v.code === 'E_LIVE_NOT_RECEIVING'),
    'the Ready samples must be reported');
  assert.ok(judged.windowObservedMs < 30000);
  assert.ok(judged.firstNonReceiving && judged.firstNonReceiving.state === 'Ready');
  assert.equal(judged.windowObservedMs, 8 * 2010, 'first to last Receiving sample');
  assert.equal(judged.firstNonReceiving.at, 1792900521929 + 9 * 2010);
  assert.equal(judged.samples.length, 15, 'every raw sample is kept in the record');
});

test('T-R12-A3b a real 30s Receiving window passes with zero violations', async () => {
  const { judgeLiveSide } = await loadCalc();
  const judged = judgeLiveSide(liveRecordCompliant(), 'B');
  assert.deepEqual(judged.violations, [], JSON.stringify(judged.violations));
  assert.equal(judged.valid, true);
  assert.ok(judged.windowObservedMs >= 30000);
  assert.equal(judged.sessionIdentity, 'id:sess-live-1');
  assert.ok(judged.settledInWindow >= 1, 'a real settlement inside the window');
});

test('T-R12-A3c a changed session identity inside the window is refused', async () => {
  const { judgeLiveSide } = await loadCalc();
  const record = liveRecordCompliant();
  record.samples[8].sessionId = 'sess-live-2';
  record.samples[8].sessionSeq = 8;
  const judged = judgeLiveSide(record, 'B');
  assert.equal(judged.valid, false);
  assert.ok(judged.violations.some((v) => v.code === 'E_LIVE_SESSION_IDENTITY'));
});

test('T-R12-A3d a window without a settlement inside it is refused', async () => {
  const { judgeLiveSide } = await loadCalc();
  const record = liveRecordCompliant();
  // Settlements exist, but all of them happened BEFORE the observed window.
  for (const frame of record.frames) {
    frame.t0Ms = 500 + frame.seq;
    frame.settledAtMs = 560 + frame.seq;
  }
  const judged = judgeLiveSide(record, 'B');
  assert.equal(judged.valid, false);
  assert.equal(judged.settledInWindow, 0);
  assert.ok(judged.violations.some((v) => v.code === 'E_LIVE_NO_SETTLEMENT'));
});

test('T-R12-A3e candidate feedback and stop-release checks still gate the B side', async () => {
  const { judgeLiveSide } = await loadCalc();
  const unarmed = judgeLiveSide(liveRecordCompliant({ telemetryArmed: false }), 'B');
  assert.ok(unarmed.violations.some((v) => v.code === 'E_LIVE_TELEMETRY_NOT_ARMED'));
  const fast = judgeLiveSide(liveRecordCompliant({
    telemetryWrites: [1000, 1100, 1500, 1800],
  }), 'B');
  assert.ok(fast.violations.some((v) => v.code === 'E_LIVE_TELEMETRY_INTERVAL'));
  const stale = liveRecordCompliant();
  stale.observations = {
    afterStop: {
      frozenA: { state: 'Stopped', elapsed: '32.0s' },
      frozenB: { state: 'Stopped', elapsed: '33.0s' },
    },
  };
  const notFrozen = judgeLiveSide(stale, 'B');
  assert.ok(notFrozen.violations.some((v) => v.code === 'E_LIVE_CLOCK_NOT_FROZEN'));
  // The baseline (A) has no numeric area by design: it is not judged for it.
  const baseline = judgeLiveSide(liveRecordCompliant({ side: 'A', telemetryArmed: false }), 'A');
  assert.ok(!baseline.violations.some((v) => v.code === 'E_LIVE_TELEMETRY_NOT_ARMED'));
});

test('T-R12-A3f observation jitter: a 249.9ms observed live gap passes, 240ms is still refused', async () => {
  const { judgeLiveSide } = await loadCalc();
  // The product's write gate is performance.now-based; the observer sees DOM
  // mutations up to one frame off that clock, so an observed 249.9ms gap is
  // measurement-channel noise, not a product violation (OBSERVATION_JITTER_MS).
  const jitter = liveRecordCompliant({
    telemetryWrites: Array.from({ length: 12 }, (_, i) => 5100 + i * 249.9),
  });
  const jittered = judgeLiveSide(jitter, 'B');
  assert.ok(!jittered.violations.some((v) => v.code === 'E_LIVE_TELEMETRY_INTERVAL'),
    `249.9ms observed gap must pass, got ${JSON.stringify(jittered.violations)}`);
  // A real violation stays refused: the allowance is 1ms, not a hole.
  const real = liveRecordCompliant({
    telemetryWrites: Array.from({ length: 12 }, (_, i) => 5100 + i * 240),
  });
  const refused = judgeLiveSide(real, 'B');
  assert.ok(refused.violations.some((v) => v.code === 'E_LIVE_TELEMETRY_INTERVAL'),
    'a 240ms gap must still be refused');
  // The recorded-leg judge keeps the strict boundary (no jitter allowance).
  const strict = judgeRound(validRoundRecord({
    telemetryWrites: Array.from({ length: 12 }, (_, i) => 1000 + i * 249.9),
  }), baseRules());
  assert.ok(strict.invariantViolations.some((v) => v.code === 'E_TELEMETRY_INTERVAL'),
    'judgeRound must keep the strict 250ms boundary');
});

test('T28-07d executing the wrapper preserves promise identity and settlement', async () => {
  const clock = { now: 100 };
  const resolvedValue = { marker: 'ok' };
  const resolvedPromise = Promise.resolve(resolvedValue);
  const rejection = Object.assign(new Error('frame rejected downstream'), { code: 14003 });
  const rejectedPromise = Promise.reject(rejection);
  rejectedPromise.catch(() => {}); // the test observes it below; keep Node quiet until then
  let mode = 'resolve';
  class FakeClient {
    submitFrame() {
      if (mode === 'throw') throw new Error('sync boom');
      return mode === 'resolve' ? resolvedPromise : rejectedPromise;
    }
  }
  const page = await runObserverScript({
    readyState: 'complete',
    clock,
    moduleNamespace: { DecoderClient: FakeClient },
  });
  await page.drain();
  const state = page.sandbox.window.__uxObserver;
  assert.equal(state.wrapped, true);

  const client = new FakeClient();
  clock.now = 200;
  const returned = client.submitFrame({ width: 2, height: 2 });
  assert.equal(returned, resolvedPromise, 'the ORIGINAL promise is returned, not a wrapper');
  clock.now = 245;
  assert.equal(await returned, resolvedValue, 'the caller sees the original settlement');
  await page.drain();
  assert.equal(state.frames.length, 1);
  assert.equal(state.frames[0].t0Ms, 200);
  assert.equal(state.frames[0].rttMs, 45);
  assert.equal(state.frames[0].ok, true);

  mode = 'reject';
  clock.now = 300;
  const returnedRejected = client.submitFrame();
  assert.equal(returnedRejected, rejectedPromise, 'a rejected promise is also returned unchanged');
  clock.now = 350;
  await assert.rejects(returnedRejected, (error) => error === rejection);
  await page.drain();
  assert.equal(state.frames.length, 2);
  assert.equal(state.frames[1].ok, false);
  assert.equal(state.frames[1].rejected, true);
  assert.equal(state.frames[1].rttMs, 50);

  mode = 'throw';
  clock.now = 400;
  assert.throws(() => client.submitFrame(), /sync boom/, 'a synchronous throw is not swallowed');
  await page.drain();
  assert.equal(state.frames.length, 3);
  assert.equal(state.frames[2].syncThrow, true);
  assert.equal(state.frames[2].ok, false);
});

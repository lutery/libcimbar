// T28: development-acceptance A/B observer for the receiver UX overhead.
//
// Dev-only tool: it never ships in the receiver package and its tests stay
// outside ALL_SUITES. The authority for every formula is the FROZEN method
// docs/plans/receiver-ux-v2/performance-method.json (recipe F). This module
// embeds the same constants and REFUSES a method file whose frozen flag,
// order, sample minimum or thresholds were edited, so a doctored method
// cannot loosen a gate; a real method change needs a new version and a full
// re-run of both sides.
//
// Boundaries from recipe F:
// - The observer wraps DecoderClient.prototype.submitFrame identically on
//   both builds, records start/end on the SAME performance.now domain and
//   returns the ORIGINAL promise unchanged (the measurement's own then()
//   never throws and never alters settlement).
// - readyMs = journey.readyAt - receivingAt on the page's Date clock.
// - DOM counting observes only the ux-metric numeric area, so original
//   immediate control/terminal-state changes never count as 4Hz violations.
// - Invalid rounds KEEP their raw samples; nothing is deleted. The
//   whole-pair replacement policy (<= 2) is executed by T31, not here.
//
// CLI:
//   node measure-ux.mjs --context <candidate ctx> --baseline-context <baseline ctx>
//        --method <performance-method.json> [--validate-only] [--repo-root <dir>]
//
// Exit: 0 = validation ok (validate-only) or measurement PASS;
//       1 = measurement FAIL or NOT_RUN;
//       2 = bad arguments;
//       3 = validation failure (method/context/manifest/input/output).
import { spawnSync } from 'node:child_process';
import {
  createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync,
} from 'node:fs';
import http from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertDistinctContexts,
  loadRunContext,
  resolveRunPath,
  sha256,
  verifyProductManifest,
} from './run-context.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = resolve(HERE, '..', '..', '..');

export const OUTPUT_REL = 'measurements/ux-overhead';

// Round-12 S2: the pure calculation/validation half lives in
// measure-ux-calc.mjs so the UX gate re-runs the SAME calculator over the raw
// files (B-02). This module keeps the browser-driving half and re-exports the
// historical API unchanged for its callers and tests.
export {
  INSTRUMENTATION_SHA256, INVARIANT_CODES, LIVE_SETTLE_GRACE_MS, LIVE_WINDOW_MS,
  METRIC_NAMES, OBSERVER_SCRIPT, REQUIRED_ENV_FIELDS, THRESHOLD_DEFAULTS,
  UxMeasureError, UX_MEASURE_VERSION, computeReadyMs, decideVerdict,
  evaluateThresholds, judgeLiveSide, judgeRound, matchEnvironment,
  maxConcurrentFrames, median, nearestRankPercentile, pairRounds, planRounds,
  summarizeSides, validateMethod,
} from './measure-ux-calc.mjs';

import {
  INSTRUMENTATION_SHA256, OBSERVER_SCRIPT, REQUIRED_ENV_FIELDS, UxMeasureError,
  UX_MEASURE_VERSION, decideVerdict, evaluateThresholds, pairRounds, planRounds,
  summarizeSides, validateMethod,
} from './measure-ux-calc.mjs';

// --- measurement outputs ---------------------------------------------------

// The measurement output is attempt-scoped and write-once: a repeated
// attempt never overwrites an earlier attempt's raw data.
export function outputDirFor(context) {
  return resolveRunPath(context, `${OUTPUT_REL}/${context.attemptId}`, { root: 'runRoot' });
}

function roundFileRef(round) {
  if (round.warmup) return `rounds/warmup-${round.side}.json`;
  return `rounds/pair-${round.pairIndex}-${round.side}.json`;
}

function roundCell(round) {
  if (!round) return null;
  return {
    readyMs: round.readyMs === undefined ? null : round.readyMs,
    p50Ms: round.p50Ms === undefined ? null : round.p50Ms,
    p95Ms: round.p95Ms === undefined ? null : round.p95Ms,
    okFrameCount: round.okFrameCount === undefined ? null : round.okFrameCount,
    rejectedFrameCount: round.rejectedFrameCount === undefined ? null : round.rejectedFrameCount,
    maxInFlight: round.maxInFlight === undefined ? null : round.maxInFlight,
    minTelemetryGapMs: round.minTelemetryGapMs === undefined ? null : round.minTelemetryGapMs,
    telemetryArmed: round.telemetryArmed === undefined ? null : round.telemetryArmed,
    collectionError: round.collectionError || null,
    exclusionReason: round.exclusionReason === undefined ? null : round.exclusionReason,
  };
}

function firstMeasured(judgedRounds, side) {
  return judgedRounds.find((round) => round.side === side && !round.warmup) || null;
}

// Build every output document as a JSON object. Raw rounds land in their own
// files with every frame kept; invalid rounds get a reason entry that
// POINTS AT the raw file instead of deleting or trimming it.
export function buildOutputFiles(input) {
  const {
    candidate, baseline, method, methodSha256, binding, builds,
    rounds, pairs, invalidRounds, summary, metrics, decision,
    startedAtIso, finishedAtIso,
  } = input;
  const files = {};
  files['run.json'] = {
    outputVersion: UX_MEASURE_VERSION,
    kind: 'ux-overhead-ab',
    startedAtIso,
    finishedAtIso,
    methodSha256,
    instrumentationSha256: INSTRUMENTATION_SHA256,
    candidate,
    baseline,
    plan: method && {
      pairs: method.pairedRuns,
      order: method.order,
      warmupPerBuild: method.warmupPerBuild,
      minSettledFrames: method.primaryInput.minSettledFrames,
      telemetryMinWriteIntervalMs: method.hardInvariants.telemetryMinWriteIntervalMs,
    },
    verdict: decision.verdict,
  };
  files['environment.json'] = {
    matchedEnvironment: REQUIRED_ENV_FIELDS,
    sides: {
      A: firstMeasured(rounds, 'A') ? firstMeasured(rounds, 'A').env : null,
      B: firstMeasured(rounds, 'B') ? firstMeasured(rounds, 'B').env : null,
    },
  };
  // S9: the frozen input SHA anchor lives in the T6 input manifest of each
  // run context; the method file itself keeps primaryInput.sha256 null until
  // a new frozen method version is published.
  files['input.json'] = Object.assign({}, binding, {
    frozenAnchor: 'the frozen input/media SHA anchor is the T6 input manifest bound by each'
      + ' run context (docs/tests/runs/20261024-teamexec-04/input-manifest.json); the frozen'
      + ' method keeps primaryInput.sha256 null until a new method version',
  });
  files['manifest.json'] = {
    methodSha256,
    sides: {
      A: builds && builds.A ? {
        productManifest: builds.A.productManifest,
        productManifestSha256: builds.A.manifestSha256,
        verifiedFileCount: builds.A.fileCount,
      } : null,
      B: builds && builds.B ? {
        productManifest: builds.B.productManifest,
        productManifestSha256: builds.B.manifestSha256,
        verifiedFileCount: builds.B.fileCount,
      } : null,
    },
  };
  for (const round of rounds) {
    files[roundFileRef(round)] = round;
  }
  files['invalid-rounds.json'] = {
    count: invalidRounds.length,
    rounds: invalidRounds.map((entry) => ({
      file: roundFileRef(entry.round),
      side: entry.round.side,
      pairIndex: entry.round.pairIndex,
      warmup: entry.round.warmup === true,
      reason: entry.reason,
      detail: entry.detail === undefined ? null : entry.detail,
    })),
  };
  files['summary.json'] = {
    outputVersion: UX_MEASURE_VERSION,
    methodSha256,
    instrumentationSha256: INSTRUMENTATION_SHA256,
    counting: {
      gate: 'okFrameCount',
      note: 'the 30-frame gate counts resolved (ok) frames only, which is stricter than'
        + ' the frozen method wording "settled frames"; settledFrameCount in each round'
        + ' file additionally counts rejected settlements and never gates anything',
    },
    sides: {
      A: Object.assign({ role: 'baseline' }, summary.A),
      B: Object.assign({ role: 'candidate' }, summary.B),
    },
  };
  files['comparison.json'] = {
    outputVersion: UX_MEASURE_VERSION,
    methodSha256,
    instrumentationSha256: INSTRUMENTATION_SHA256,
    validPairs: pairs.filter((pair) => pair.valid).length,
    pairs: pairs.map((pair) => ({
      pair: pair.pair,
      valid: pair.valid,
      reason: pair.reason,
      a: roundCell(pair.a),
      b: roundCell(pair.b),
    })),
    metrics,
    verdict: decision.verdict,
    reasons: decision.reasons,
    formulaSource: 'docs/plans/receiver-ux-v2/performance-method.json',
  };
  return files;
}

// Write the files under the CANDIDATE context's run root only; the baseline
// root is read-only for this tool. An existing attempt directory is never
// overwritten.
export function writeMeasurements(context, files) {
  const dir = outputDirFor(context);
  if (existsSync(dir)) {
    throw new UxMeasureError('E_OUTPUT_EXISTS',
      `measurement output directory already exists and is never overwritten: ${dir}`);
  }
  mkdirSync(dir, { recursive: true });
  for (const [rel, value] of Object.entries(files)) {
    const abs = join(dir, ...rel.split('/'));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `${JSON.stringify(value, null, 2)}\n`);
  }
  return dir;
}
// --- input binding and the validation chain -------------------------------

function readJson(path, code, label) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new UxMeasureError(code, `${label} not found: ${path}`);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new UxMeasureError(code, `${label} is not valid JSON: ${error.message}`);
  }
}

function hashFile(path, code, label) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new UxMeasureError(code, `${label} not found: ${path}`);
  }
  return sha256(readFileSync(path));
}

// The frozen input binding of one build: the input manifest is re-hashed
// against the context digest, the 128KiB primary input and the recording
// file are re-hashed from disk, and the recording is located by the exact
// SHA in the manifest's media entry (never by a mutable file name).
export function loadInputBinding(context) {
  const manifestPath = context.abs.inputManifest;
  if (!manifestPath) {
    throw new UxMeasureError('E_INPUT_MISSING', 'the run context does not bind an input manifest');
  }
  const bytes = readFileSync(manifestPath);
  const actualSha = sha256(bytes);
  if (actualSha !== context.inputManifestSha256) {
    throw new UxMeasureError('E_INPUT_SHA',
      `inputManifestSha256 mismatch: the input manifest on disk (${actualSha.slice(0, 12)}...)`
      + ` does not match the run context (${String(context.inputManifestSha256).slice(0, 12)}...)`);
  }
  const manifest = readJson(manifestPath, 'E_INPUT_FORMAT', 'input manifest');
  const primaryInput = manifest.primaryInput;
  if (!primaryInput || typeof primaryInput.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(primaryInput.sha256)) {
    throw new UxMeasureError('E_INPUT_FORMAT', 'input manifest needs primaryInput.sha256');
  }
  if (!Number.isSafeInteger(primaryInput.bytes) || primaryInput.bytes <= 0) {
    throw new UxMeasureError('E_INPUT_FORMAT', 'input manifest needs a positive primaryInput.bytes');
  }
  const media = manifest.media;
  if (!media || typeof media.withSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(media.withSha256)) {
    throw new UxMeasureError('E_INPUT_FORMAT', 'input manifest needs media.withSha256');
  }
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const mediaEntry = files.find((entry) => entry && entry.sha256 === media.withSha256);
  if (!mediaEntry) {
    throw new UxMeasureError('E_INPUT_MISSING',
      'the input manifest does not list the frozen recording (media.withSha256)');
  }
  const primaryEntry = files.find((entry) => entry && entry.sha256 === primaryInput.sha256);
  if (!primaryEntry) {
    throw new UxMeasureError('E_INPUT_MISSING',
      'the input manifest does not list the frozen primary input');
  }
  const absolute = (rel) => resolve(context.repoRoot, ...rel.split('/'));
  const mediaPath = absolute(mediaEntry.path);
  if (hashFile(mediaPath, 'E_INPUT_SHA', 'frozen recording') !== media.withSha256) {
    throw new UxMeasureError('E_INPUT_SHA',
      `the recording on disk does not match its frozen SHA-256: ${mediaEntry.path}`);
  }
  const primaryPath = absolute(primaryEntry.path);
  if (hashFile(primaryPath, 'E_INPUT_SHA', 'primary input') !== primaryInput.sha256) {
    throw new UxMeasureError('E_INPUT_SHA',
      `the primary input on disk does not match its frozen SHA-256: ${primaryEntry.path}`);
  }
  return {
    inputManifest: context.inputManifest,
    inputManifestSha256: actualSha,
    inputSha256: primaryInput.sha256,
    inputBytes: primaryInput.bytes,
    inputPath: primaryEntry.path,
    mediaSha256: media.withSha256,
    mediaPath,
    mediaRelativePath: mediaEntry.path,
  };
}

function buildInfo(context, verified) {
  const wasm = verified.files.find((file) => /(^|\/)cimbar_js\.wasm$/.test(file.path));
  return {
    runId: context.runId,
    attemptId: context.attemptId,
    phase: context.phase,
    productManifest: context.productManifest,
    manifestSha256: verified.manifestSha256,
    fileCount: verified.files.length,
    wasmSha256: wasm ? wasm.sha256 : null,
    receiverDir: join(context.abs.stagingRoot, 'receiver'),
  };
}

// Parse + validate everything before a single browser starts. The method is
// checked FIRST so a doctored/missing method is reported as such even when
// the contexts are broken too. No file is written here.
export function loadAndValidate(options) {
  const repoRoot = resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const methodPath = resolve(repoRoot, options.method);
  if (!existsSync(methodPath) || !statSync(methodPath).isFile()) {
    throw new UxMeasureError('E_METHOD_MISSING', `performance method not found: ${methodPath}`);
  }
  const methodResult = validateMethod(readFileSync(methodPath));
  const context = loadRunContext(options.context, { repoRoot });
  const baseline = loadRunContext(options.baselineContext, { repoRoot });
  assertDistinctContexts(context, baseline);
  const candidateBuild = buildInfo(context, verifyProductManifest(context));
  const baselineBuild = buildInfo(baseline, verifyProductManifest(baseline));
  if (candidateBuild.wasmSha256 === null || baselineBuild.wasmSha256 === null) {
    throw new UxMeasureError('E_BUILD_MISSING', 'a product manifest does not list cimbar_js.wasm');
  }
  if (candidateBuild.wasmSha256 !== baselineBuild.wasmSha256) {
    throw new UxMeasureError('E_ENV_MISMATCH',
      `the two builds do not share the same wasm (${candidateBuild.wasmSha256} vs ${baselineBuild.wasmSha256})`);
  }
  for (const build of [candidateBuild, baselineBuild]) {
    if (!existsSync(join(build.receiverDir, 'index.html'))) {
      throw new UxMeasureError('E_BUILD_MISSING',
        `the staged receiver is missing: ${join(build.receiverDir, 'index.html')}`);
    }
  }
  const candidateInput = loadInputBinding(context);
  const baselineInput = loadInputBinding(baseline);
  if (candidateInput.inputSha256 !== baselineInput.inputSha256) {
    throw new UxMeasureError('E_INPUT_MISMATCH',
      'the two builds do not share the same frozen input:'
      + ` candidate inputSha256 ${candidateInput.inputSha256} vs baseline inputSha256 ${baselineInput.inputSha256}`);
  }
  if (candidateInput.mediaSha256 !== baselineInput.mediaSha256) {
    throw new UxMeasureError('E_INPUT_MISMATCH',
      'the two builds do not share the same frozen recording:'
      + ` candidate mediaSha256 ${candidateInput.mediaSha256} vs baseline mediaSha256 ${baselineInput.mediaSha256}`);
  }
  const declaredInputSha = methodResult.method.primaryInput.sha256;
  if (declaredInputSha !== null && declaredInputSha !== undefined
    && declaredInputSha !== candidateInput.inputSha256) {
    throw new UxMeasureError('E_INPUT_MISMATCH',
      'the run input SHA-256 does not match the SHA declared in the frozen method:'
      + ` ${candidateInput.inputSha256} vs ${declaredInputSha}`);
  }
  const outputDir = outputDirFor(context);
  if (existsSync(outputDir)) {
    throw new UxMeasureError('E_OUTPUT_EXISTS',
      `measurement output directory already exists and is never overwritten: ${outputDir}`);
  }
  return {
    repoRoot,
    context,
    baseline,
    method: methodResult.method,
    methodSha256: methodResult.sha,
    minSettledFrames: methodResult.minSettledFrames,
    telemetryMinWriteIntervalMs: methodResult.telemetryMinWriteIntervalMs,
    candidateBuild,
    baselineBuild,
    candidateInput,
    baselineInput,
    outputDir,
  };
}
// --- validation plan and the local static server --------------------------

export function planFor(validated) {
  return {
    kind: 'ux-overhead-ab-plan',
    candidate: {
      runId: validated.context.runId,
      attemptId: validated.context.attemptId,
      phase: validated.context.phase,
    },
    baseline: {
      runId: validated.baseline.runId,
      attemptId: validated.baseline.attemptId,
      phase: validated.baseline.phase,
    },
    pairs: validated.method.pairedRuns,
    order: validated.method.order,
    warmupPerBuild: validated.method.warmupPerBuild,
    minSettledFrames: validated.minSettledFrames,
    telemetryMinWriteIntervalMs: validated.telemetryMinWriteIntervalMs,
    methodSha256: validated.methodSha256,
    instrumentationSha256: INSTRUMENTATION_SHA256,
    inputSha256: validated.candidateInput.inputSha256,
    mediaSha256: validated.candidateInput.mediaSha256,
    outputDir: validated.outputDir,
  };
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// One loopback static server per round, serving exactly that build's staged
// receiver directory. Both builds use the same server code and the same
// page URL shape, so neither side gets a hosting advantage.
export async function startStaticServer(rootDir) {
  const root = resolve(rootDir);
  const server = http.createServer((request, response) => {
    try {
      const rawPath = decodeURIComponent((request.url || '/').split('?')[0]);
      const relative = rawPath.replace(/^\/+/, '') || 'index.html';
      const absolute = resolve(root, ...relative.split('/'));
      if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
        response.writeHead(403);
        response.end('forbidden');
        return;
      }
      if (!existsSync(absolute) || !statSync(absolute).isFile()) {
        response.writeHead(404);
        response.end('not found');
        return;
      }
      response.writeHead(200, {
        'content-type': CONTENT_TYPES[extname(absolute)] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      createReadStream(absolute).pipe(response);
    } catch (error) {
      response.writeHead(500);
      response.end('server error');
    }
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const { port } = server.address();
  return {
    port,
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
}
// --- the A/B drive (T31 executes it; T28 only pins the code) --------------

const VIEWPORT = { width: 1280, height: 800 };
const DEVICE_SCALE_FACTOR = 1;

function activePowerMode() {
  const result = spawnSync('powercfg', ['/getactivescheme'], { encoding: 'utf8', timeout: 15000 });
  if (result.status !== 0 || !result.stdout) return 'unknown';
  return result.stdout.trim();
}

// Each round: fresh browser, fresh page, fresh Worker. The page is closed
// after the journey reaches the artifact, so no journey timestamp or Worker
// state can leak into the next round. Both builds run the same script.
//
// B1: a round NEVER throws out of this function. A failed collection becomes
// a round record with a collectionError (kind: 'business' when the journey
// never reached the artifact, 'environment' for every tool/browser fault),
// and whatever the page observer already recorded is salvaged into that
// record so the raw evidence survives; judgeRound/pairRounds then treat the
// round as undecidable while the outputs still land on disk.
async function runRound({ side, pairIndex, slot, warmup, build, input, powerMode }) {
  const startedAtIso = new Date().toISOString();
  let browser = null;
  let server = null;
  let page = null;
  const failed = (error, kind) => ({
    side,
    pairIndex,
    slot,
    warmup,
    startedAtIso,
    collectionError: {
      code: (error && error.code) || 'E_COLLECTION_FAILED',
      kind,
      message: String((error && error.message) || error),
    },
  });
  const salvage = async (record) => {
    if (!page) {
      record.salvaged = false;
      return record;
    }
    try {
      const partial = await page.evaluate(() => {
        const observer = window.__uxObserver;
        if (!observer) return null;
        return {
          frames: observer.frames,
          telemetryWrites: observer.telemetryWrites,
          telemetryArmed: observer.telemetryArmed === true,
          telemetryUnavailable: observer.telemetryUnavailable === true,
          wrapped: observer.wrapped,
          wrappedAtMs: observer.wrappedAtMs,
          importError: observer.importError,
          journey: window.__journey || null,
          state: window.__state === undefined ? null : window.__state,
          screen: { width: window.screen.width, height: window.screen.height },
        };
      });
      if (!partial) {
        record.salvaged = false;
        return record;
      }
      return Object.assign(record, partial, { salvaged: true });
    } catch {
      record.salvaged = false;
      return record;
    }
  };
  try {
    const { chromium } = await import('playwright-core');
    server = await startStaticServer(build.receiverDir);
    browser = await chromium.launch({ channel: 'msedge', headless: false });
    const browserContext = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    });
    await browserContext.addInitScript(OBSERVER_SCRIPT);
    page = await browserContext.newPage();
    await page.goto(server.url);
    // The recording journey starts with the real file input; the button is
    // enabled once capabilities have been inspected.
    await page.waitForFunction(
      () => {
        const button = document.querySelector('#btn-video');
        return Boolean(button) && button.disabled === false;
      },
      { timeout: 30000 },
    );
    await page.setInputFiles('#file-input', input.mediaPath);
    try {
      await page.waitForFunction(
        () => Boolean(window.__journey && window.__journey.readyAt !== undefined),
        { timeout: 300000 },
      );
    } catch (error) {
      // The journey never reached the artifact: that is the product's own
      // outcome (failurePolicy), not a tool fault.
      throw new UxMeasureError('E_JOURNEY_INCOMPLETE',
        `the journey never reached the artifact (readyAt missing after 300s): ${error.message}`,
        { kind: 'business' });
    }
    const captured = await page.evaluate(() => ({
      observer: window.__uxObserver || null,
      journey: window.__journey || null,
      state: window.__state,
      screen: { width: window.screen.width, height: window.screen.height },
    }));
    if (!captured.observer) {
      throw new UxMeasureError('E_OBSERVER_MISSING', `the observer did not install for ${side} pair ${pairIndex}`);
    }
    if (!captured.observer.wrapped) {
      throw new UxMeasureError('E_OBSERVER_MISSING',
        `submitFrame was not wrapped (${captured.observer.importError || 'no import result'})`);
    }
    return {
      side,
      pairIndex,
      slot,
      warmup,
      startedAtIso,
      pageUrl: server.url,
      journey: captured.journey,
      state: captured.state,
      frames: captured.observer.frames,
      telemetryWrites: captured.observer.telemetryWrites,
      telemetryArmed: captured.observer.telemetryArmed === true,
      telemetryUnavailable: captured.observer.telemetryUnavailable === true,
      wrappedAtMs: captured.observer.wrappedAtMs,
      env: {
        wasmSha256: build.wasmSha256,
        inputSha256: input.inputSha256,
        mediaSha256: input.mediaSha256,
        browserVersion: browser.version(),
        mode: 'B',
        viewport: VIEWPORT,
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
        screenResolution: captured.screen,
        powerMode,
        instrumentationSha256: INSTRUMENTATION_SHA256,
      },
      inputSha256: input.inputSha256,
      mediaSha256: input.mediaSha256,
    };
  } catch (error) {
    const isBusiness = error instanceof UxMeasureError && error.code === 'E_JOURNEY_INCOMPLETE';
    return salvage(failed(error, isBusiness ? 'business' : 'environment'));
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
  }
}

function roundSequence(method) {
  const sequence = [
    { side: 'A', pairIndex: 0, slot: 0, warmup: true },
    { side: 'B', pairIndex: 0, slot: 0, warmup: true },
  ];
  for (const entry of planRounds(method)) {
    sequence.push({ side: entry.first, pairIndex: entry.pair, slot: 1, warmup: false });
    sequence.push({ side: entry.second, pairIndex: entry.pair, slot: 2, warmup: false });
  }
  return sequence;
}

export async function runAbDrive(validated, options = {}) {
  const powerMode = activePowerMode();
  const rules = {
    minSettledFrames: validated.minSettledFrames,
    telemetryMinWriteIntervalMs: validated.telemetryMinWriteIntervalMs,
    inputSha256: validated.candidateInput.inputSha256,
    mediaSha256: validated.candidateInput.mediaSha256,
    matchedEnvironment: REQUIRED_ENV_FIELDS,
  };
  const collectRound = options.runRound || runRound;
  const startedAtIso = new Date().toISOString();
  const rounds = [];
  for (const entry of roundSequence(validated.method)) {
    const side = entry.side;
    const build = side === 'A' ? validated.baselineBuild : validated.candidateBuild;
    const input = side === 'A' ? validated.baselineInput : validated.candidateInput;
    let record;
    try {
      record = await collectRound({ ...entry, build, input, powerMode });
    } catch (error) {
      // Belt and braces: runRound converts its own failures into
      // collectionError records, and a throw from a stubbed/overridden
      // collector must still not abort the whole collection.
      record = {
        ...entry,
        startedAtIso,
        collectionError: {
          code: (error && error.code) || 'E_COLLECTION_FAILED',
          kind: 'environment',
          message: String((error && error.message) || error),
        },
      };
    }
    rounds.push(record);
    if (options.onRound) options.onRound(record);
  }
  const paired = pairRounds(rounds, rules);
  const summary = summarizeSides(paired.pairs);
  const metrics = evaluateThresholds(summary);
  const decision = decideVerdict({
    pairs: paired.pairs, validPairs: paired.validPairs, metrics,
  });
  const files = buildOutputFiles({
    candidate: {
      runId: validated.context.runId,
      attemptId: validated.context.attemptId,
      phase: validated.context.phase,
      productManifestSha256: validated.candidateBuild.manifestSha256,
    },
    baseline: {
      runId: validated.baseline.runId,
      attemptId: validated.baseline.attemptId,
      phase: validated.baseline.phase,
      productManifestSha256: validated.baselineBuild.manifestSha256,
    },
    method: validated.method,
    methodSha256: validated.methodSha256,
    binding: {
      inputSha256: validated.candidateInput.inputSha256,
      mediaSha256: validated.candidateInput.mediaSha256,
      inputBytes: validated.candidateInput.inputBytes,
      inputPath: validated.candidateInput.inputPath,
      mediaPath: validated.candidateInput.mediaRelativePath,
      sides: {
        A: { inputManifest: validated.baselineInput.inputManifest, mediaPath: validated.baselineInput.mediaRelativePath },
        B: { inputManifest: validated.candidateInput.inputManifest, mediaPath: validated.candidateInput.mediaRelativePath },
      },
    },
    builds: {
      A: validated.baselineBuild,
      B: validated.candidateBuild,
    },
    rounds: paired.allRounds,
    pairs: paired.pairs,
    invalidRounds: paired.invalidRounds,
    summary,
    metrics,
    decision,
    startedAtIso,
    finishedAtIso: new Date().toISOString(),
  });
  const dir = writeMeasurements(validated.context, files);
  const output = {
    verdict: decision.verdict,
    reasons: decision.reasons,
    validPairs: paired.validPairs,
    metrics,
    outputDir: dir,
    methodSha256: validated.methodSha256,
    instrumentationSha256: INSTRUMENTATION_SHA256,
  };
  return { exitCode: decision.verdict === 'PASS' ? 0 : 1, output };
}
// --- CLI -------------------------------------------------------------------

const HELP = `usage: node tools/desktop-recv/e2e/measure-ux.mjs --context <candidate run-context.json> --baseline-context <baseline run-context.json> --method <performance-method.json> [--validate-only] [--repo-root <dir>]

  --context            candidate (current attempt) run context.
  --baseline-context   baseline build run context; read-only for this tool.
  --method             the FROZEN performance method JSON. It must carry
                       frozen=true and the recipe-F order/thresholds; an
                       edited method is refused, never reinterpreted.
  --validate-only      run every validation, print the measurement plan and
                       stop: no browser starts and no file is written.
  --repo-root <dir>    resolve repository-relative paths against <dir>
                       (fixture tests); defaults to this checkout.
  --help               this text.

The full run collects one warmup per build plus five A/B pairs in the frozen
AB/BA/AB/BA/AB order, serially, one fresh browser page (and Worker) per
round, and writes every raw round plus summary/comparison under
<runRoot>/measurements/ux-overhead/<attemptId>/. An existing attempt output
is never overwritten; the whole-pair replacement policy (<= 2) is executed
by T31, not by this tool.

Exit: 0 = validation ok (validate-only) or measurement PASS;
      1 = measurement FAIL/NOT_RUN or an aborted collection (raw rounds are
          still written before exiting);
      2 = bad arguments;
      3 = pre-run validation failure only (method/context/manifest/input/
          output); a round that fails to collect is never exit 3.`;

const ARG_KEYS = new Map([
  ['--context', 'context'],
  ['--baseline-context', 'baselineContext'],
  ['--method', 'method'],
  ['--repo-root', 'repoRoot'],
]);

export function parseCliArgs(argv) {
  const parsed = { help: false, validateOnly: false, context: null, baselineContext: null, method: null, repoRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') { parsed.help = true; continue; }
    if (arg === '--validate-only') { parsed.validateOnly = true; continue; }
    if (ARG_KEYS.has(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) return { error: `${arg} needs a value` };
      parsed[ARG_KEYS.get(arg)] = value;
      index += 1;
      continue;
    }
    return { error: `unknown argument: ${arg}` };
  }
  if (parsed.help) return parsed;
  for (const required of ['context', 'baselineContext', 'method']) {
    if (!parsed[required]) return { error: `--${required === 'baselineContext' ? 'baseline-context' : required} is required` };
  }
  return parsed;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN) {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed.error) {
    console.error(parsed.error);
    console.error(HELP);
    process.exit(2);
  }
  if (parsed.help) {
    console.log(HELP);
    process.exit(0);
  }
  // Exit 3 is reserved for PRE-RUN validation. Everything after validation -
  // a browser that will not start, a page that never reaches the artifact,
  // a stubbed round that throws - is a collection outcome: the raw rounds
  // still land on disk and the process exits 1 with a FAIL/NOT_RUN verdict.
  let validated;
  try {
    validated = loadAndValidate(parsed);
  } catch (error) {
    console.error(error && error.message ? error.message : String(error));
    process.exit(3);
  }
  if (parsed.validateOnly) {
    console.log(JSON.stringify(planFor(validated), null, 2));
    process.exit(0);
  }
  try {
    const result = await runAbDrive(validated);
    console.log(JSON.stringify(result.output, null, 2));
    process.exit(result.exitCode);
  } catch (error) {
    console.error(`collection aborted before a verdict (exit 1, not a validation failure): ${
      (error && error.message) || String(error)}`);
    process.exit(1);
  }
}

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
import { createHash } from 'node:crypto';
import {
  createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync,
} from 'node:fs';
import http from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ITERATION_ID,
  assertDistinctContexts,
  loadRunContext,
  resolveRunPath,
  sha256,
  verifyProductManifest,
} from './run-context.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = resolve(HERE, '..', '..', '..');

export const OUTPUT_REL = 'measurements/ux-overhead';
export const UX_MEASURE_VERSION = 1;

const REQUIRED_ENV_FIELDS = [
  'wasmSha256', 'inputSha256', 'mediaSha256', 'browserVersion', 'mode',
  'viewport', 'deviceScaleFactor', 'screenResolution', 'powerMode',
  'instrumentationSha256',
];
const FROZEN_ORDER = ['AB', 'BA', 'AB', 'BA', 'AB'];
const FROZEN_PAIRS = 5;
const FROZEN_WARMUP = 1;
const FROZEN_MIN_FRAMES = 30;
const FROZEN_TELEMETRY_INTERVAL_MS = 250;
const THRESHOLD_DEFAULTS = {
  readyMs: {
    relativeFactor: 1.1,
    absoluteAllowanceMs: 250,
    formula: 'candidateMedian <= baselineMedian * 1.10 + 250',
  },
  frameRttP50Ms: {
    relativeFactor: 1.1,
    absoluteAllowanceMs: 2,
    formula: 'candidateMedian <= max(baselineMedian * 1.10, baselineMedian + 2)',
  },
  frameRttP95Ms: {
    relativeFactor: 1.15,
    absoluteAllowanceMs: 5,
    formula: 'candidateMedian <= max(baselineMedian * 1.15, baselineMedian + 5)',
  },
};
const METRIC_NAMES = ['readyMs', 'frameRttP50Ms', 'frameRttP95Ms'];
// Invariant classes name a product fault on the CANDIDATE (FAIL), never
// environment noise that may be replaced.
const INVARIANT_CODES = new Set([
  'E_SINGLE_FLIGHT', 'E_TELEMETRY_INTERVAL', 'E_TELEMETRY_NOT_ARMED',
]);

export class UxMeasureError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = 'UxMeasureError';
    this.code = code;
    if (detail !== null) this.detail = detail;
  }
}
// --- pure statistics --------------------------------------------------------

function assertFiniteArray(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new UxMeasureError('E_STATS_INPUT', `${label} needs a non-empty array`);
  }
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new UxMeasureError('E_STATS_INPUT', `${label} contains a non-finite value: ${String(value)}`);
    }
  }
}

// Nearest-rank percentile: sort ascending, rank = ceil(p/100 * n), 1-based.
// No interpolation, so a fixed array has one exact expected value; even n
// therefore picks the upper middle element for p50.
export function nearestRankPercentile(values, p) {
  if (typeof p !== 'number' || !Number.isInteger(p) || p < 1 || p > 100) {
    throw new UxMeasureError('E_STATS_INPUT', `percentile must be an integer in 1..100 (got ${String(p)})`);
  }
  assertFiniteArray(values, 'percentile input');
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[rank - 1];
}

// Median across rounds: middle of the sorted values, mean of the two middle
// values for an even count. Never mixes frames from different rounds.
export function median(values) {
  assertFiniteArray(values, 'median input');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

// readyMs is the page's own Date-clock difference for one round: the same
// journey marks the product records, no tool-side timing is mixed in.
export function computeReadyMs(round) {
  const journey = round && round.journey;
  const receivingAt = journey && journey.receivingAt;
  const readyAt = journey && journey.readyAt;
  for (const [name, value] of [['receivingAt', receivingAt], ['readyAt', readyAt]]) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new UxMeasureError('E_READY_MS', `journey.${name} is missing or not a finite number`);
    }
  }
  if (readyAt < receivingAt) {
    throw new UxMeasureError('E_READY_MS', `journey.readyAt (${readyAt}) is before receivingAt (${receivingAt})`);
  }
  return readyAt - receivingAt;
}
// --- frozen method validation ----------------------------------------------

function methodField(condition, message) {
  if (!condition) throw new UxMeasureError('E_METHOD_FIELD', message);
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

// Parse + validate the frozen method. The constants embedded above are the
// recipe-F values; every value that changes a verdict must match them, so
// editing the JSON in place cannot move a threshold. Returns the parsed
// method, the SHA-256 of the exact bytes read, and the two numbers the round
// rules need.
export function validateMethod(bytes, options = {}) {
  const expectedIterationId = options.iterationId || ITERATION_ID;
  let method;
  try {
    method = JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes));
  } catch (error) {
    throw new UxMeasureError('E_METHOD_JSON', `the performance method is not valid JSON: ${error.message}`);
  }
  if (!method || typeof method !== 'object' || Array.isArray(method)) {
    throw new UxMeasureError('E_METHOD_JSON', 'the performance method must be a JSON object');
  }
  if (method.frozen !== true) {
    throw new UxMeasureError('E_METHOD_NOT_FROZEN',
      `the performance method is not frozen (frozen !== true): ${String(method.frozen)}`);
  }
  methodField(method.version === 1, `unsupported method version: ${String(method.version)}`);
  methodField(method.kind === 'frozen_method_only', `unexpected method kind: ${String(method.kind)}`);
  methodField(method.methodStatus === 'DESIGN_FROZEN',
    `unexpected methodStatus: ${String(method.methodStatus)}`);
  methodField(method.iterationId === expectedIterationId,
    `unexpected iterationId: ${String(method.iterationId)}`);
  methodField(method.pairedRuns === FROZEN_PAIRS,
    `pairedRuns must be ${FROZEN_PAIRS} (got ${String(method.pairedRuns)})`);
  methodField(deepEqual(method.order, FROZEN_ORDER),
    `the pair order must stay ${FROZEN_ORDER.join('/')} (got ${JSON.stringify(method.order)})`);
  methodField(method.warmupPerBuild === FROZEN_WARMUP,
    `warmupPerBuild must be ${FROZEN_WARMUP} (got ${String(method.warmupPerBuild)})`);
  methodField(deepEqual(method.matchedEnvironment, REQUIRED_ENV_FIELDS),
    'matchedEnvironment does not match the frozen field list');
  methodField(method.primaryInput && method.primaryInput.minSettledFrames === FROZEN_MIN_FRAMES,
    `minSettledFrames must be ${FROZEN_MIN_FRAMES}`);
  methodField(method.primaryInput.payloadBytes === 131072,
    'primaryInput.payloadBytes must stay 131072');
  methodField(method.primaryInput.compressibility === 'incompressible',
    'primaryInput.compressibility must stay incompressible');
  methodField(method.primaryInput.mode === 'B', 'primaryInput.mode must stay B');
  methodField(method.hardInvariants
    && method.hardInvariants.telemetryMinWriteIntervalMs === FROZEN_TELEMETRY_INTERVAL_MS,
  `hardInvariants.telemetryMinWriteIntervalMs must stay ${FROZEN_TELEMETRY_INTERVAL_MS}`);
  methodField(method.liveObservation && method.liveObservation.pairs === FROZEN_PAIRS
    && deepEqual(method.liveObservation.order, FROZEN_ORDER),
  'liveObservation pairs/order must stay 5 with the frozen AB/BA order');

  methodField(Array.isArray(method.mandatoryMetrics)
    && deepEqual(method.mandatoryMetrics.map((metric) => metric && metric.name), METRIC_NAMES),
  `mandatoryMetrics must be exactly ${METRIC_NAMES.join(', ')}`);
  for (const metric of method.mandatoryMetrics) {
    const expected = THRESHOLD_DEFAULTS[metric.name];
    const actual = metric.candidateMax || {};
    const matches = actual.relativeFactor === expected.relativeFactor
      && actual.absoluteAllowanceMs === expected.absoluteAllowanceMs
      && actual.formula === expected.formula;
    if (!matches) {
      throw new UxMeasureError('E_METHOD_THRESHOLD',
        `threshold for ${metric.name} does not match the frozen formula (${expected.formula})`);
    }
  }
  return {
    method,
    sha: sha256(Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes))),
    minSettledFrames: FROZEN_MIN_FRAMES,
    telemetryMinWriteIntervalMs: FROZEN_TELEMETRY_INTERVAL_MS,
  };
}
// --- round judging ---------------------------------------------------------

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// Maximum number of frame intervals open at the same time. A settlement at
// the exact instant of the next submission is processed first, so a strict
// single-flight scheduler never looks concurrent.
function maxConcurrentFrames(frames) {
  const events = [];
  for (const frame of frames) {
    if (!isFiniteNumber(frame.t0Ms)) continue;
    events.push({ at: frame.t0Ms, delta: 1 });
    if (isFiniteNumber(frame.settledAtMs)) events.push({ at: frame.settledAtMs, delta: -1 });
  }
  events.sort((a, b) => (a.at - b.at) || (a.delta - b.delta));
  let current = 0;
  let worst = 0;
  for (const event of events) {
    current += event.delta;
    if (current > worst) worst = current;
  }
  return worst;
}

// Judge one round from its RAW samples: derive readyMs, the settled-frame
// counts, per-round percentiles and the invariants, and keep every input
// field untouched so an excluded round is still fully reproducible.
//
// rules: { minSettledFrames, telemetryMinWriteIntervalMs, inputSha256,
//          mediaSha256 }
export function judgeRound(record, rules) {
  const violations = [];
  const push = (code, detail) => violations.push({ code, detail });
  const frames = Array.isArray(record.frames) ? record.frames : [];

  // A collection failure is the primary reason and is always first: the
  // round is undecidable, but its salvaged raw samples stay in the record.
  if (record.collectionError) {
    push('E_COLLECTION_ERROR', String(record.collectionError.message || 'collection failed'));
  }

  let readyMs = null;
  try {
    readyMs = computeReadyMs(record);
  } catch (error) {
    push(error.code || 'E_READY_MS', error.message);
  }

  let okCount = 0;
  let rejectedCount = 0;
  let malformed = 0;
  const rttSamples = [];
  for (const frame of frames) {
    const seq = frame && frame.seq;
    if (!frame || !isFiniteNumber(seq) || !isFiniteNumber(frame.t0Ms)) {
      malformed += 1;
      push('E_FRAMES', `frame ${String(seq)}: missing seq/t0Ms`);
      continue;
    }
    if (frame.ok === true) {
      if (!isFiniteNumber(frame.settledAtMs) || !isFiniteNumber(frame.rttMs)) {
        malformed += 1;
        push('E_FRAMES', `frame ${seq}: claimed ok but has no settlement/rtt`);
        continue;
      }
      okCount += 1;
      rttSamples.push(frame.rttMs);
    } else if (isFiniteNumber(frame.settledAtMs)) {
      rejectedCount += 1;
    }
  }
  if (malformed === 0 && okCount < rules.minSettledFrames) {
    push('E_FRAMES', `only ${okCount} settled ok frames (< ${rules.minSettledFrames})`);
  }
  const measurable = malformed === 0 && okCount >= rules.minSettledFrames;
  const p50Ms = measurable ? nearestRankPercentile(rttSamples, 50) : null;
  const p95Ms = measurable ? nearestRankPercentile(rttSamples, 95) : null;

  const maxInFlight = maxConcurrentFrames(frames);
  if (maxInFlight > 1) {
    push('E_SINGLE_FLIGHT', `max frames in flight was ${maxInFlight} (must stay 1)`);
  }

  const writes = (Array.isArray(record.telemetryWrites) ? record.telemetryWrites : [])
    .filter(isFiniteNumber)
    .slice()
    .sort((a, b) => a - b);
  const telemetryGapMs = [];
  for (let index = 1; index < writes.length; index += 1) {
    telemetryGapMs.push(writes[index] - writes[index - 1]);
  }
  const telemetryJudged = telemetryGapMs.length > 0;
  const minTelemetryGapMs = telemetryJudged ? Math.min(...telemetryGapMs) : null;
  if (telemetryJudged && minTelemetryGapMs < rules.telemetryMinWriteIntervalMs) {
    push('E_TELEMETRY_INTERVAL',
      `telemetry numeric area was written every ${minTelemetryGapMs}ms (< ${rules.telemetryMinWriteIntervalMs}ms)`);
  }

  // B2: arming is a judged fact, not a silent default. The candidate build
  // must expose the numeric area (a missing one is a product fault, FAIL);
  // the legacy baseline has no numeric area by design, which is recorded as
  // not applicable instead of passing or failing the 4Hz invariant.
  const telemetryApplicable = record.telemetryArmed === true;
  const telemetryNote = (!record.warmup && record.side === 'A' && !telemetryApplicable)
    ? 'baseline UI has no numeric telemetry area by design; the 4Hz invariant is not applicable'
    : null;
  if (!record.warmup && !record.collectionError && record.side === 'B' && !telemetryApplicable) {
    push('E_TELEMETRY_NOT_ARMED',
      'the candidate numeric telemetry area was never observed (telemetryArmed !== true)');
  }

  if (typeof record.inputSha256 !== 'string' || record.inputSha256 !== rules.inputSha256) {
    push('E_INPUT_SHA', 'the round input SHA-256 does not match the frozen input');
  }
  if (typeof record.mediaSha256 !== 'string' || record.mediaSha256 !== rules.mediaSha256) {
    push('E_MEDIA_SHA', 'the round media SHA-256 does not match the frozen recording');
  }

  return {
    ...record,
    readyMs,
    okFrameCount: okCount,
    rejectedFrameCount: rejectedCount,
    settledFrameCount: okCount + rejectedCount,
    rttSamples,
    p50Ms,
    p95Ms,
    maxInFlight,
    telemetryGapMs,
    minTelemetryGapMs,
    telemetryJudged,
    telemetryApplicable,
    telemetryNote,
    violations,
    invariantViolations: violations.filter((v) => INVARIANT_CODES.has(v.code)),
    exclusionReason: violations.length > 0 ? violations[0].code : null,
  };
}
// --- environment matching and pair formation ------------------------------

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

// Compare two round environments on the frozen field list. Every mismatch is
// reported by name; a single mismatch makes the pair undecidable (recipe F:
// environment differences are never treated as noise).
export function matchEnvironment(left, right, fields) {
  const mismatches = [];
  for (const field of fields) {
    const a = left ? left[field] : undefined;
    const b = right ? right[field] : undefined;
    const same = (a === undefined && b === undefined)
      || (a !== undefined && b !== undefined && stableStringify(a) === stableStringify(b));
    if (!same) mismatches.push({ field, a: a === undefined ? null : a, b: b === undefined ? null : b });
  }
  return { matched: mismatches.length === 0, mismatches };
}

export function planRounds(method) {
  return method.order.map((order, index) => ({
    pair: index + 1,
    order,
    first: order[0],
    second: order[1],
  }));
}

// Group judged rounds into the five pairs. A pair is valid only when both
// sides are present exactly once, both rounds passed their own rules and
// both environments match on every frozen field. Every round that does not
// contribute to a valid pair is listed in invalidRounds with its reason and
// its raw samples intact.
export function pairRounds(rounds, rules) {
  const judged = rounds.map((round) => judgeRound(round, rules));
  const invalidRounds = [];
  const invalid = (round, reason, detail) => invalidRounds.push({ round, reason, detail });
  const measured = [];
  for (const round of judged) {
    if (round.warmup === true) {
      invalid(round, 'E_WARMUP', 'warmup rounds are excluded from the measurement');
    } else {
      measured.push(round);
    }
  }
  const pairIndexes = [...new Set(measured.map((round) => round.pairIndex))]
    .sort((a, b) => a - b);
  const pairs = [];
  for (const pairIndex of pairIndexes) {
    const members = measured.filter((round) => round.pairIndex === pairIndex);
    const aRounds = members.filter((round) => round.side === 'A');
    const bRounds = members.filter((round) => round.side === 'B');
    const pair = {
      pair: pairIndex,
      a: aRounds.length === 1 ? aRounds[0] : null,
      b: bRounds.length === 1 ? bRounds[0] : null,
      valid: false,
      reason: null,
      detail: null,
    };
    if (members.length !== 2 || aRounds.length !== 1 || bRounds.length !== 1) {
      pair.reason = members.length > 2 || aRounds.length > 1 || bRounds.length > 1
        ? 'E_PAIR_DUPLICATE_ROUND' : 'E_PAIR_MISSING_ROUND';
      pair.detail = `pair ${pairIndex} has ${aRounds.length} A round(s) and ${bRounds.length} B round(s)`;
      for (const round of members) invalid(round, pair.reason, pair.detail);
      pairs.push(pair);
      continue;
    }
    const env = matchEnvironment(pair.a.env, pair.b.env, rules.matchedEnvironment);
    const failed = [pair.a, pair.b].find((round) => round.exclusionReason !== null);
    if (failed) {
      // The round's own failure is the reason; environment comparison is
      // meaningless for a round that collected nothing.
      pair.reason = failed.exclusionReason;
      pair.detail = `pair ${pairIndex} side ${failed.side} was excluded: ${failed.exclusionReason}`;
      invalid(pair.a, pair.reason, pair.detail);
      invalid(pair.b, pair.reason, pair.detail);
      pairs.push(pair);
      continue;
    }
    if (!env.matched) {
      pair.reason = 'E_ENV_MISMATCH';
      pair.detail = { mismatches: env.mismatches };
      invalid(pair.a, pair.reason, pair.detail);
      invalid(pair.b, pair.reason, pair.detail);
      pairs.push(pair);
      continue;
    }
    pair.valid = true;
    pairs.push(pair);
  }
  return {
    allRounds: judged,
    pairs,
    invalidRounds,
    validPairs: pairs.filter((pair) => pair.valid).length,
  };
}
// --- aggregation, threshold recomputation and the verdict -----------------

function sideSummary(pairs, key) {
  const rounds = pairs.filter((pair) => pair.valid).map((pair) => pair[key]);
  const readyMsValues = rounds.map((round) => round.readyMs);
  const rttP50Values = rounds.map((round) => round.p50Ms);
  const rttP95Values = rounds.map((round) => round.p95Ms);
  return {
    rounds: rounds.length,
    pairIndexes: pairs.filter((pair) => pair.valid).map((pair) => pair.pair),
    readyMsValues,
    readyMsMedian: readyMsValues.length ? median(readyMsValues) : null,
    rttP50Values,
    rttP50Median: rttP50Values.length ? median(rttP50Values) : null,
    rttP95Values,
    rttP95Median: rttP95Values.length ? median(rttP95Values) : null,
    frameCounts: rounds.map((round) => round.okFrameCount),
    frameCountTotal: rounds.reduce((sum, round) => sum + round.okFrameCount, 0),
  };
}

// Per side: the median of the five per-round values. Percentiles are never
// pooled across rounds (recipe F: "不混不同帧数池").
export function summarizeSides(pairs) {
  return { A: sideSummary(pairs, 'a'), B: sideSummary(pairs, 'b') };
}

function metricResult(name, baselineMedian, candidateMedian, baselineRounds, candidateRounds) {
  const { relativeFactor, absoluteAllowanceMs, formula } = THRESHOLD_DEFAULTS[name];
  let limit;
  if (name === 'readyMs') {
    limit = baselineMedian * relativeFactor + absoluteAllowanceMs;
  } else {
    limit = Math.max(baselineMedian * relativeFactor, baselineMedian + absoluteAllowanceMs);
  }
  return {
    metric: name,
    baselineMedian,
    candidateMedian,
    baselineRounds,
    candidateRounds,
    relativeFactor,
    absoluteAllowanceMs,
    formula,
    limit,
    marginMs: limit - candidateMedian,
    pass: candidateMedian <= limit,
  };
}

// Recompute every gate from the frozen formula and the medians above; the
// numbers, the limit and the signed margin are all kept, not only a boolean.
export function evaluateThresholds(summary) {
  return {
    readyMs: metricResult('readyMs', summary.A.readyMsMedian, summary.B.readyMsMedian,
      summary.A.rounds, summary.B.rounds),
    frameRttP50Ms: metricResult('frameRttP50Ms', summary.A.rttP50Median, summary.B.rttP50Median,
      summary.A.rounds, summary.B.rounds),
    frameRttP95Ms: metricResult('frameRttP95Ms', summary.A.rttP95Median, summary.B.rttP95Median,
      summary.A.rounds, summary.B.rounds),
  };
}

// PASS needs five valid pairs and every gate met. A candidate invariant
// violation is FAIL even when the pair that carried it was excluded: recipe
// F never treats product faults as noise. Anything short of five valid pairs
// is NOT_RUN (not decidable), never PASS.
export function decideVerdict({ pairs, validPairs, metrics }) {
  const reasons = [];
  let businessFailure = false;
  for (const pair of pairs) {
    for (const [side, round] of [['A', pair.a], ['B', pair.b]]) {
      if (!round || !round.collectionError) continue;
      const kind = round.collectionError.kind || 'environment';
      reasons.push({
        code: 'E_COLLECTION_ERROR',
        side,
        pairIndex: pair.pair,
        kind,
        detail: round.collectionError.message,
      });
      // failurePolicy: a CANDIDATE business failure is FAIL, never noise.
      if (side === 'B' && kind === 'business') businessFailure = true;
    }
  }
  const invariantReasons = [];
  for (const pair of pairs) {
    const candidateRound = pair.b;
    if (!candidateRound) continue;
    for (const violation of candidateRound.invariantViolations || []) {
      invariantReasons.push({
        code: violation.code,
        side: 'B',
        pairIndex: pair.pair,
        detail: violation.detail,
      });
    }
  }
  if (businessFailure || invariantReasons.length > 0) {
    return { verdict: 'FAIL', reasons: [...reasons, ...invariantReasons] };
  }
  if (validPairs < FROZEN_PAIRS) {
    reasons.push({
      code: 'E_PAIRS',
      detail: `fewer than ${FROZEN_PAIRS} valid pairs (${validPairs}); the measurement is not decidable`,
    });
    return { verdict: 'NOT_RUN', reasons };
  }
  for (const name of METRIC_NAMES) {
    const metric = metrics[name];
    if (!metric.pass) {
      reasons.push({
        code: 'E_THRESHOLD',
        metric: name,
        detail: `${name}: candidate median ${metric.candidateMedian} > limit ${metric.limit}`
          + ` (${metric.formula})`,
      });
    }
  }
  return reasons.length > 0 ? { verdict: 'FAIL', reasons } : { verdict: 'PASS', reasons: [] };
}
// --- in-page observer (identical on both builds) --------------------------

// Injected at document start on every navigation of a measurement page. It
// wraps DecoderClient.prototype.submitFrame the moment the module can be
// imported (the product looks the method up through the prototype at call
// time, so the wrap catches every later call), records start/end on the
// page's performance.now domain, and RETURNS THE ORIGINAL PROMISE: the
// measurement's own then() never throws and never changes settlement.
//
// The DOM counter watches only the four numeric telemetry spans by their
// frozen ids (#ux-elapsed/#ux-rate/#ux-progress/#ux-media), so the original
// immediate control/status changes never count against the 4Hz telemetry
// budget. One MutationObserver instance observes all four nodes, so one
// paint tick is one write event, not four. Arming is event-driven only:
// there is no polling timer, so a page without a numeric area (the legacy
// baseline UI) carries no recurring observer cost that the other side
// would not also carry.
export const OBSERVER_SCRIPT = `(() => {
  if (window.__uxObserver) return;
  const state = window.__uxObserver = {
    version: 1,
    wrapped: false,
    wrappedAtMs: null,
    importError: null,
    frames: [],
    telemetryWrites: [],
    telemetryArmed: false,
    telemetryUnavailable: false,
  };
  let seqCounter = 0;
  const pushFrame = (frame) => {
    seqCounter += 1;
    state.frames.push(Object.assign({ seq: seqCounter }, frame));
  };
  let attempts = 0;
  // Same-origin module load. A page never defines __uxModuleLoader; the
  // deterministic tests inject one so the REAL wrapper can be executed
  // outside a browser without the vm dynamic-import flag. The injected
  // observer on real pages always takes the native import() branch.
  const loadModule = typeof window.__uxModuleLoader === 'function'
    ? window.__uxModuleLoader
    : (url) => import(url);
  const wrap = async () => {
    attempts += 1;
    try {
      const mod = await loadModule('/src/decoder-client.js');
      const proto = mod.DecoderClient.prototype;
      if (proto.submitFrame && proto.submitFrame.__uxWrapped) return;
      if (typeof proto.submitFrame !== 'function') {
        throw new Error('submitFrame not found on DecoderClient.prototype');
      }
      const original = proto.submitFrame;
      const wrapped = function submitFrameMeasured(...args) {
        const t0 = performance.now();
        let promise;
        try {
          promise = original.apply(this, args);
        } catch (error) {
          pushFrame({ t0Ms: t0, settledAtMs: t0, ok: false, rttMs: 0, syncThrow: true });
          throw error;
        }
        Promise.resolve(promise).then(
          () => {
            const end = performance.now();
            pushFrame({ t0Ms: t0, settledAtMs: end, ok: true, rttMs: end - t0 });
          },
          () => {
            const end = performance.now();
            pushFrame({ t0Ms: t0, settledAtMs: end, ok: false, rejected: true, rttMs: end - t0 });
          },
        );
        return promise;
      };
      wrapped.__uxWrapped = true;
      proto.submitFrame = wrapped;
      state.wrapped = true;
      state.wrappedAtMs = performance.now();
    } catch (error) {
      if (attempts < 200) {
        setTimeout(wrap, 50);
      } else {
        state.importError = String((error && error.message) || error);
      }
    }
  };
  wrap();
  const armTelemetry = () => {
    if (state.telemetryArmed) return true;
    const nodes = document.querySelectorAll('#ux-elapsed, #ux-rate, #ux-progress, #ux-media');
    if (!nodes.length) return false;
    const observer = new MutationObserver(() => {
      state.telemetryWrites.push(performance.now());
    });
    for (const node of nodes) {
      observer.observe(node, { characterData: true, childList: true, subtree: true });
    }
    state.telemetryArmed = true;
    return true;
  };
  if (armTelemetry()) {
    // The numeric area is already present (injected after the DOM parsed).
  } else if (document.readyState === 'loading') {
    // The static spans arrive with the parsed document: arm once on
    // DOMContentLoaded, keep a bounded root observer for late-inserted
    // spans, and stop observing at load. No timers are involved. The
    // listeners are registered FIRST: an init script can run before
    // document.documentElement exists, and observing null would throw and
    // kill the whole IIFE with telemetryArmed stuck false (observed on the
    // real candidate page; fixed by ordering + null guard).
    document.addEventListener('DOMContentLoaded', () => { armTelemetry(); }, { once: true });
    const rootObserver = new MutationObserver(() => {
      if (armTelemetry()) rootObserver.disconnect();
    });
    if (document.documentElement) {
      rootObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
    window.addEventListener('load', () => {
      rootObserver.disconnect();
      if (!state.telemetryArmed) state.telemetryUnavailable = true;
    }, { once: true });
  } else {
    // Injected after the document was parsed: a missing numeric area is
    // recorded as unavailable instead of being polled for.
    state.telemetryUnavailable = true;
  }
})();`;

// The instrumentation identity the environment records per round; identical
// bytes on both builds, so a mismatch is a real instrumentation difference.
export const INSTRUMENTATION_SHA256 = sha256(OBSERVER_SCRIPT);
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

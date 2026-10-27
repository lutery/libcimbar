// Round-12 S2 split: the PURE calculation / validation half of the UX
// measurement toolchain. Nothing here starts a browser, a server or a page.
//
//   * the frozen-method parser and the recipe-F constants,
//   * nearest-rank statistics, round judging, pairing, aggregation,
//   * the live-leg judge (A-R3: one real 30s Receiving window),
//   * a recompute CLI that re-derives every claimed number from the raw files
//     on disk, so the UX gate (verify-ux-evidence.py, B-02) can re-run the
//     calculator instead of trusting a PASS written by the runner.
//
// measure-ux.mjs re-exports the historical API from here (single source of
// truth); live-legs.mjs judges with the same judgeLiveSide.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ITERATION_ID, loadRunContext, sha256 } from './run-context.mjs';

export const UX_MEASURE_VERSION = 1;
export const REQUIRED_ENV_FIELDS = [
  'wasmSha256', 'inputSha256', 'mediaSha256', 'browserVersion', 'mode',
  'viewport', 'deviceScaleFactor', 'screenResolution', 'powerMode',
  'instrumentationSha256',
];
export const FROZEN_ORDER = ['AB', 'BA', 'AB', 'BA', 'AB'];
export const FROZEN_PAIRS = 5;
export const FROZEN_WARMUP = 1;
export const FROZEN_MIN_FRAMES = 30;
export const FROZEN_TELEMETRY_INTERVAL_MS = 250;
export const THRESHOLD_DEFAULTS = {
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
export const METRIC_NAMES = ['readyMs', 'frameRttP50Ms', 'frameRttP95Ms'];
export const INVARIANT_CODES = new Set([
  'E_SINGLE_FLIGHT', 'E_TELEMETRY_INTERVAL', 'E_TELEMETRY_NOT_ARMED',
]);

// A live leg is only evidence when the SAME session stays in Receiving for
// the whole frozen window (A-R3). 30s is the frozen active window; the grace
// only lets a settlement that lands between the last sample and the real stop
// still count as "inside".
export const LIVE_WINDOW_MS = 30000;
export const LIVE_SETTLE_GRACE_MS = 5000;
// The product's own write gate is performance.now-based (now - last >=
// REFRESH_MS before any numeric write). The OBSERVER, however, timestamps the
// DOM mutation when it becomes observable, which sits up to one frame off the
// projection clock in either direction, so an OBSERVED gap can read a few
// tenths of a millisecond below the real one (recorded legs measured
// 250.2-250.3ms minimums through the same channel). This jitter allowance
// applies ONLY to the live judge's observed-interval check; the frozen
// FROZEN_TELEMETRY_INTERVAL_MS, judgeRound (recorded legs) and the method
// file are untouched - a real violation like 240ms is still refused.
export const OBSERVATION_JITTER_MS = 1;

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
export function maxConcurrentFrames(frames) {
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
      if (!isFiniteNumber(frame.settledAtMs)) {
        malformed += 1;
        push('E_FRAMES', `frame ${seq}: claimed ok but has no settlement`);
        continue;
      }
      // B-R1(b): the raw start/end timestamps are the primary RTT source. A
      // settlement before its own submission is not a usable sample, and the
      // redundant rttMs field is only a cross-check that must agree exactly.
      if (frame.settledAtMs < frame.t0Ms) {
        malformed += 1;
        push('E_RTT',
          `frame ${seq}: settledAtMs (${frame.settledAtMs}) is before t0Ms (${frame.t0Ms})`);
        continue;
      }
      const rtt = frame.settledAtMs - frame.t0Ms;
      if (frame.rttMs !== rtt) {
        push('E_RTT_MISMATCH',
          `frame ${seq}: rttMs is ${JSON.stringify(frame.rttMs)},`
          + ` settledAtMs - t0Ms is ${rtt}`);
      }
      okCount += 1;
      rttSamples.push(rtt);
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

// --- A-R3: one real 30s Receiving window per live side ---------------------

function sampleClockMs(sample) {
  if (isFiniteNumber(sample.at)) return sample.at;
  if (isFiniteNumber(sample.atMs)) return sample.atMs;
  return null;
}

function samplePerfMs(sample) {
  return isFiniteNumber(sample.perfNow) ? sample.perfNow : null;
}

// A live side is VALID only when the record proves ONE session stayed in
// Receiving for the whole frozen window and a real settlement happened inside
// it. The old "revision ever grew" test is gone: the Ready transition itself
// bumps the revision, which is exactly how the 09b records passed while the
// last ~12s were idle.
export function judgeLiveSide(record, side, options = {}) {
  const windowMs = isFiniteNumber(options.windowMs) ? options.windowMs : LIVE_WINDOW_MS;
  const graceMs = isFiniteNumber(options.graceMs) ? options.graceMs : LIVE_SETTLE_GRACE_MS;
  const violations = [];
  const push = (code, detail) => violations.push({ code, detail });
  const samples = Array.isArray(record.samples) ? record.samples : [];
  const frames = Array.isArray(record.frames) ? record.frames : [];
  const writes = (Array.isArray(record.telemetryWrites) ? record.telemetryWrites : [])
    .filter(isFiniteNumber)
    .slice()
    .sort((a, b) => a - b);

  // --- frame-side facts (kept for every record, valid or not) -----------
  const maxInFlight = maxConcurrentFrames(frames);
  const okFrames = frames.filter((frame) => frame && frame.ok === true
    && isFiniteNumber(frame.settledAtMs));

  record.samples = samples;
  record.maxInFlight = maxInFlight;
  record.okFrameCount = okFrames.length;
  record.submittedLast = Math.max(...samples.map((s) => (isFiniteNumber(s.submitted) ? s.submitted : 0)), 0);

  // --- the window ------------------------------------------------------
  if (samples.length === 0) {
    push('E_LIVE_NO_SAMPLES', 'no live samples were recorded');
  }
  const ordered = samples.slice().sort((a, b) => (sampleClockMs(a) ?? 0) - (sampleClockMs(b) ?? 0));
  const firstNonReceivingIndex = ordered.findIndex((sample) => sample.state !== 'Receiving');
  const receiving = firstNonReceivingIndex === -1 ? ordered : ordered.slice(0, firstNonReceivingIndex);
  const firstNonReceiving = firstNonReceivingIndex === -1 ? null : ordered[firstNonReceivingIndex];
  record.firstNonReceiving = firstNonReceiving;

  if (firstNonReceiving) {
    push('E_LIVE_NOT_RECEIVING',
      `a sample left Receiving at ${String(sampleClockMs(firstNonReceiving))}ms (state=${String(firstNonReceiving.state)})`);
  }
  if (receiving.length === 0) {
    push('E_LIVE_NO_RECEIVING', 'no Receiving sample was observed');
  }
  const windowStartMs = receiving.length ? sampleClockMs(receiving[0]) : null;
  const windowEndMs = receiving.length ? sampleClockMs(receiving[receiving.length - 1]) : null;
  const windowObservedMs = windowStartMs !== null && windowEndMs !== null
    ? windowEndMs - windowStartMs : null;
  record.windowObservedMs = windowObservedMs;
  record.windowStartAtMs = windowStartMs;
  record.windowEndAtMs = windowEndMs;
  if (windowObservedMs === null || windowObservedMs < windowMs) {
    push('E_LIVE_WINDOW_SHORT',
      `the observed Receiving window was ${String(windowObservedMs)}ms (< ${windowMs}ms);`
      + ' an early Ready is a failed round, never a padded 30s window');
  }

  // --- one session identity across the whole window --------------------
  const identityOf = (sample) => {
    if (sample.sessionId !== null && sample.sessionId !== undefined && sample.sessionId !== '') {
      return `id:${sample.sessionId}`;
    }
    if (sample.sessionSeq !== null && sample.sessionSeq !== undefined) {
      return `seq:${sample.sessionSeq}`;
    }
    return null;
  };
  const identities = receiving.map(identityOf);
  const distinct = [...new Set(identities.filter((value) => value !== null))];
  if (identities.length === 0 || identities.some((value) => value === null)) {
    push('E_LIVE_SESSION_IDENTITY',
      'the Receiving samples carry no session identity (sessionId/sessionSeq)');
  } else if (distinct.length !== 1) {
    push('E_LIVE_SESSION_IDENTITY',
      `the session identity changed inside the window: ${distinct.join(', ')}`);
  } else {
    record.sessionIdentity = distinct[0];
  }

  // --- a real settlement INSIDE the window ------------------------------
  // Samples carry the page's performance.now at sampling time; frames live on
  // the same performance.now domain. Without that anchor the claim "settled
  // inside the window" cannot be checked at all, which is itself a refusal.
  const windowStartPerf = receiving.length ? samplePerfMs(receiving[0]) : null;
  const windowEndPerf = receiving.length ? samplePerfMs(receiving[receiving.length - 1]) : null;
  let settledInWindow = 0;
  if (windowStartPerf === null || windowEndPerf === null) {
    push('E_LIVE_WINDOW_BOUNDS',
      'the samples carry no performance.now anchor, so settlements cannot be placed inside the window');
  } else {
    settledInWindow = okFrames.filter((frame) => frame.settledAtMs >= windowStartPerf
      && frame.settledAtMs <= windowEndPerf + graceMs).length;
    if (settledInWindow === 0) {
      push('E_LIVE_NO_SETTLEMENT',
        'no settled ok frame falls inside the observed Receiving window');
    }
  }
  record.settledInWindow = settledInWindow;
  record.windowStartPerfMs = windowStartPerf;
  record.windowEndPerfMs = windowEndPerf;

  // --- single-flight ----------------------------------------------------
  if (maxInFlight > 1) {
    push('E_LIVE_SINGLE_FLIGHT', `max frames in flight was ${maxInFlight} (must stay 1)`);
  }

  // --- candidate-only feedback checks -----------------------------------
  if (side === 'B') {
    if (record.telemetryArmed !== true) {
      push('E_LIVE_TELEMETRY_NOT_ARMED', 'the candidate numeric telemetry area was not armed');
    }
    let minGap = null;
    for (let index = 1; index < writes.length; index += 1) {
      const gap = writes[index] - writes[index - 1];
      if (minGap === null || gap < minGap) minGap = gap;
    }
    record.minTelemetryGapMs = minGap;
    if (writes.length >= 2 && minGap !== null
      && minGap < FROZEN_TELEMETRY_INTERVAL_MS - OBSERVATION_JITTER_MS) {
      push('E_LIVE_TELEMETRY_INTERVAL',
        `telemetry write interval ${minGap.toFixed(1)}ms < ${FROZEN_TELEMETRY_INTERVAL_MS}ms`
        + ` (minus the ${OBSERVATION_JITTER_MS}ms observation-jitter allowance)`);
    }
    const numericChanges = receiving.filter((sample, index, all) => index > 0
      && sample.elapsed !== all[index - 1].elapsed).length;
    record.numericChanges = numericChanges;
    if (numericChanges === 0) {
      push('E_LIVE_NO_NUMERIC_FEEDBACK', 'numeric feedback never updated during the Receiving window');
    }
    const statusChanges = receiving.filter((sample, index, all) => index > 0
      && sample.primary !== all[index - 1].primary).length;
    record.statusChanges = statusChanges;
    if (statusChanges === 0) {
      push('E_LIVE_NO_STATUS_FEEDBACK', 'the status line never changed during the Receiving window');
    }
    const stop = record.observations && record.observations.afterStop;
    const frozen = Boolean(stop && stop.frozenA && stop.frozenB
      && stop.frozenA.elapsed === stop.frozenB.elapsed && stop.frozenA.elapsed !== '');
    record.clockReleasedAfterStop = frozen;
    if (!frozen) {
      push('E_LIVE_CLOCK_NOT_FROZEN', 'the display clock did not freeze after the real stop');
    }
  }

  const okRtts = okFrames.map((frame) => frame.rttMs).filter(isFiniteNumber).sort((a, b) => a - b);
  record.rttAdvisory = {
    p50: okRtts.length ? nearestRankPercentile(okRtts, 50) : null,
    p95: okRtts.length ? nearestRankPercentile(okRtts, 95) : null,
    note: 'advisory only; live sampling is never the primary metric',
  };
  record.violations = violations;
  record.violationMessages = violations.map((v) => `${v.code}: ${v.detail}`);
  record.valid = violations.length === 0;
  return record;
}

// --- B-02: recompute a measurement directory from its raw files -----------

function readJsonFile(path, label, push) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    push('E_RECOMPUTE_MISSING', `${label} is missing on disk: ${path}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    push('E_RECOMPUTE_JSON', `${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

function numberClose(left, right, tolerance = 1e-6) {
  if (typeof left !== 'number' || typeof right !== 'number') return left === right;
  if (Number.isNaN(left) || Number.isNaN(right)) return false;
  return Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));
}

function compareNumberList(label, claimed, actual, push) {
  if (!Array.isArray(claimed) || !Array.isArray(actual) || claimed.length !== actual.length) {
    push('E_RECOMPUTE_TAMPERED',
      `${label} does not match the recomputation (${JSON.stringify(claimed)} vs ${JSON.stringify(actual)})`);
    return;
  }
  for (let index = 0; index < claimed.length; index += 1) {
    if (!numberClose(claimed[index], actual[index])) {
      push('E_RECOMPUTE_TAMPERED',
        `${label}[${index}] is ${JSON.stringify(claimed[index])}, recomputed ${JSON.stringify(actual[index])}`);
      return;
    }
  }
}

function compareNumber(label, claimed, actual, push) {
  if (!numberClose(claimed, actual)) {
    push('E_RECOMPUTE_TAMPERED',
      `${label} is ${JSON.stringify(claimed)}, recomputed ${JSON.stringify(actual)}`);
  }
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

// Re-derive the recorded A/B measurement from rounds/*.json and compare EVERY
// claimed number with the recomputation. `measurementDir` must be the complete
// measurement directory (with rounds/); a proof copy without raw rounds is
// resolved to the original by the CLI below.
export function recomputeMeasurement({ measurementDir, methodBytes, method }, expected = {}) {
  const violations = [];
  const push = (code, detail) => violations.push({ code, detail });
  const stats = { measurementDir, validPairs: null, verdict: null, live: null };

  let parsedMethod = method;
  let methodSha = null;
  if (!parsedMethod) {
    try {
      const validated = validateMethod(methodBytes);
      parsedMethod = validated.method;
      methodSha = validated.sha;
    } catch (error) {
      push(error.code || 'E_METHOD_JSON', error.message);
    }
  } else {
    methodSha = sha256(methodBytes);
  }

  const run = readJsonFile(join(measurementDir, 'run.json'), 'run.json', push);
  const input = readJsonFile(join(measurementDir, 'input.json'), 'input.json', push);
  const summary = readJsonFile(join(measurementDir, 'summary.json'), 'summary.json', push);
  const comparison = readJsonFile(join(measurementDir, 'comparison.json'), 'comparison.json', push);
  const invalid = readJsonFile(join(measurementDir, 'invalid-rounds.json'), 'invalid-rounds.json', push);
  if (!parsedMethod || !run || !input || !summary || !comparison || !invalid) {
    return { ok: false, violations, stats };
  }

  // --- method / instrumentation binding --------------------------------
  if (run.outputVersion !== UX_MEASURE_VERSION || run.kind !== 'ux-overhead-ab') {
    push('E_RECOMPUTE_SHAPE', 'run.json is not a ux-overhead-ab measurement');
  }
  if (run.methodSha256 !== methodSha) {
    push('E_METHOD_BINDING',
      `run.json methodSha256 ${String(run.methodSha256).slice(0, 12)} does not match the current frozen method ${String(methodSha).slice(0, 12)}`);
  }
  if (run.instrumentationSha256 !== INSTRUMENTATION_SHA256) {
    push('E_INSTRUMENTATION_BINDING',
      'run.json instrumentationSha256 does not match the observer this calculator embeds');
  }
  if (comparison.methodSha256 !== methodSha || summary.methodSha256 !== methodSha) {
    push('E_METHOD_BINDING', 'summary/comparison methodSha256 do not match the current frozen method');
  }
  if (comparison.instrumentationSha256 !== INSTRUMENTATION_SHA256
    || summary.instrumentationSha256 !== INSTRUMENTATION_SHA256) {
    push('E_INSTRUMENTATION_BINDING', 'summary/comparison instrumentationSha256 do not match');
  }
  if (expected.productManifestSha256) {
    // An expected identity that encounters no candidate is a refusal, never
    // a skipped check: "no candidate" cannot prove any build.
    if (!run.candidate || typeof run.candidate.productManifestSha256 !== 'string') {
      push('E_BUILD_BINDING',
        'run.json carries no candidate product manifest identity; the measurement cannot be bound to the run context');
    } else if (run.candidate.productManifestSha256 !== expected.productManifestSha256) {
      push('E_BUILD_BINDING',
        'run.json candidate product manifest does not match the current run context');
    }
  }
  if (expected.inputSha256 && input.inputSha256 !== expected.inputSha256) {
    push('E_INPUT_BINDING', 'input.json inputSha256 does not match the current input manifest');
  }
  if (expected.mediaSha256 && input.mediaSha256 !== expected.mediaSha256) {
    push('E_INPUT_BINDING', 'input.json mediaSha256 does not match the current input manifest');
  }

  // --- recorded rounds (raw frame files) -------------------------------
  const roundsDir = join(measurementDir, 'rounds');
  if (!existsSync(roundsDir) || !statSync(roundsDir).isDirectory()) {
    push('E_RECOMPUTE_RAW_MISSING',
      'rounds/ is missing: the recorded raw pair files were not included with the measurement');
    return { ok: false, violations, stats };
  }
  const expectedRounds = ['warmup-A.json', 'warmup-B.json'];
  for (let pair = 1; pair <= FROZEN_PAIRS; pair += 1) {
    expectedRounds.push(`pair-${pair}-A.json`, `pair-${pair}-B.json`);
  }
  const present = readdirSync(roundsDir).filter((name) => name.endsWith('.json')).sort();
  const missing = expectedRounds.filter((name) => !present.includes(name));
  const extra = present.filter((name) => !expectedRounds.includes(name));
  if (missing.length) {
    push('E_RECOMPUTE_RAW_MISSING', `the recorded rounds are incomplete; missing ${missing.join(', ')}`);
  }
  if (extra.length) {
    push('E_RECOMPUTE_RAW_EXTRA', `unexpected raw round files: ${extra.join(', ')}`);
  }
  const rounds = [];
  for (const name of present) {
    const record = readJsonFile(join(roundsDir, name), `rounds/${name}`, push);
    if (record) rounds.push(record);
  }
  const rules = {
    minSettledFrames: parsedMethod.primaryInput.minSettledFrames,
    telemetryMinWriteIntervalMs: parsedMethod.hardInvariants.telemetryMinWriteIntervalMs,
    inputSha256: input.inputSha256,
    mediaSha256: input.mediaSha256,
    matchedEnvironment: parsedMethod.matchedEnvironment,
  };
  const paired = pairRounds(rounds, rules);
  const recomputedSummary = summarizeSides(paired.pairs);
  const metrics = evaluateThresholds(recomputedSummary);
  const decision = decideVerdict({
    pairs: paired.pairs, validPairs: paired.validPairs, metrics,
  });
  stats.validPairs = paired.validPairs;
  stats.verdict = decision.verdict;
  stats.rounds = rounds.length;
  stats.summary = recomputedSummary;
  stats.metrics = metrics;
  // Round-level judging violations (E_RTT/E_RTT_MISMATCH/...) are what
  // invalidated a round; they change the derived verdict but not the
  // "claims match the recomputation" success bit. Surface them so a refusal
  // can name the exact contradiction instead of only the verdict delta.
  stats.roundViolations = paired.allRounds.flatMap((round) => (round.violations || [])
    .map((violation) => ({
      side: round.side,
      pairIndex: round.pairIndex,
      warmup: round.warmup === true,
      code: violation.code,
      detail: violation.detail,
    })));

  // --- compare every claimed number ------------------------------------
  for (const side of ['A', 'B']) {
    const claimed = (summary.sides || {})[side] || {};
    const actual = recomputedSummary[side];
    for (const field of ['rounds', 'frameCountTotal']) {
      compareNumber(`summary.sides.${side}.${field}`, claimed[field], actual[field], push);
    }
    for (const field of ['readyMsMedian', 'rttP50Median', 'rttP95Median']) {
      compareNumber(`summary.sides.${side}.${field}`, claimed[field], actual[field], push);
    }
    for (const field of ['pairIndexes', 'readyMsValues', 'rttP50Values', 'rttP95Values', 'frameCounts']) {
      compareNumberList(`summary.sides.${side}.${field}`, claimed[field], actual[field], push);
    }
  }
  if (comparison.validPairs !== paired.validPairs) {
    push('E_RECOMPUTE_TAMPERED',
      `comparison.validPairs is ${JSON.stringify(comparison.validPairs)}, recomputed ${paired.validPairs}`);
  }
  if (comparison.verdict !== decision.verdict) {
    push('E_VERDICT_MISMATCH',
      `comparison.verdict is ${JSON.stringify(comparison.verdict)}, recomputed ${decision.verdict}`);
  }
  if (run.verdict !== decision.verdict) {
    push('E_VERDICT_MISMATCH',
      `run.json verdict is ${JSON.stringify(run.verdict)}, recomputed ${decision.verdict}`);
  }
  for (const name of METRIC_NAMES) {
    const claimed = (comparison.metrics || {})[name] || {};
    const actual = metrics[name];
    for (const field of ['baselineMedian', 'candidateMedian', 'limit', 'marginMs']) {
      compareNumber(`comparison.metrics.${name}.${field}`, claimed[field], actual[field], push);
    }
    if (claimed.pass !== actual.pass) {
      push('E_RECOMPUTE_TAMPERED',
        `comparison.metrics.${name}.pass is ${JSON.stringify(claimed.pass)}, recomputed ${actual.pass}`);
    }
  }
  const claimedPairs = Array.isArray(comparison.pairs) ? comparison.pairs : [];
  if (claimedPairs.length !== paired.pairs.length) {
    push('E_RECOMPUTE_TAMPERED', 'comparison.pairs does not list every recomputed pair');
  } else {
    paired.pairs.forEach((pair, index) => {
      const claimed = claimedPairs[index] || {};
      if (claimed.pair !== pair.pair || claimed.valid !== pair.valid
        || claimed.reason !== pair.reason) {
        push('E_RECOMPUTE_TAMPERED',
          `comparison.pairs[${index}] does not match the recomputation for pair ${pair.pair}`);
      }
      for (const [side, round] of [['a', pair.a], ['b', pair.b]]) {
        const claimedCell = claimed[side] || {};
        const actualCell = roundCell(round) || {};
        for (const field of ['readyMs', 'p50Ms', 'p95Ms', 'okFrameCount', 'rejectedFrameCount',
          'maxInFlight', 'minTelemetryGapMs']) {
          compareNumber(`comparison.pairs[${index}].${side}.${field}`,
            claimedCell[field], actualCell[field], push);
        }
      }
    });
  }

  // --- invalid rounds are preserved, never deleted ----------------------
  const claimedInvalid = Array.isArray(invalid.rounds) ? invalid.rounds : [];
  const actualInvalid = paired.invalidRounds.map((entry) => ({
    file: roundFileRefFor(entry.round),
    reason: entry.reason,
  })).sort((a, b) => a.file.localeCompare(b.file));
  const claimedSorted = claimedInvalid.map((entry) => ({ file: entry.file, reason: entry.reason }))
    .sort((a, b) => a.file.localeCompare(b.file));
  if (JSON.stringify(actualInvalid) !== JSON.stringify(claimedSorted)) {
    push('E_RECOMPUTE_TAMPERED',
      'invalid-rounds.json does not match the recomputed invalid/warmup rounds');
  }

  // --- the live legs ----------------------------------------------------
  stats.live = recomputeLiveDir(join(measurementDir, 'live'), {
    liveInputSha256: expected.liveInputSha256,
  }, push);

  return { ok: violations.length === 0, violations, stats };
}

function roundFileRefFor(round) {
  if (round.warmup) return `rounds/warmup-${round.side}.json`;
  return `rounds/pair-${round.pairIndex}-${round.side}.json`;
}

// Re-judge the ten live sides from live/rounds/*.json and check the claimed
// live summary against the recomputation. A missing live leg is a violation:
// the recorded A/B numbers can never stand in for the 5x30s obligation.
export function recomputeLiveDir(liveDir, expected = {}, push = () => {}) {
  const stats = { dir: liveDir, sides: {}, verdict: null };
  if (!existsSync(liveDir) || !statSync(liveDir).isDirectory()) {
    push('E_RECOMPUTE_LIVE_MISSING', 'live/ is missing: the 5x30s live legs are not evidenced');
    return stats;
  }
  const roundsDir = join(liveDir, 'rounds');
  if (!existsSync(roundsDir) || !statSync(roundsDir).isDirectory()) {
    push('E_RECOMPUTE_LIVE_MISSING', 'live/rounds/ is missing: no raw live side records');
    return stats;
  }
  const summary = readJsonFile(join(liveDir, 'summary.json'), 'live/summary.json', push);
  const records = [];
  for (let pair = 1; pair <= FROZEN_PAIRS; pair += 1) {
    for (const side of ['A', 'B']) {
      const name = `pair-${pair}-${side}.json`;
      const record = readJsonFile(join(roundsDir, name), `live/rounds/${name}`, push);
      if (!record) continue;
      if (record.side !== side || record.pairIndex !== pair) {
        push('E_RECOMPUTE_LIVE_SHAPE', `live/rounds/${name} does not carry side=${side} pairIndex=${pair}`);
      }
      const judged = judgeLiveSide(record, side);
      records.push(judged);
      stats.sides[`pair-${pair}-${side}`] = {
        valid: judged.valid,
        windowObservedMs: judged.windowObservedMs,
        settledInWindow: judged.settledInWindow,
        violations: judged.violationMessages,
      };
      for (const message of judged.violationMessages) {
        push('E_LIVE_INVALID', `pair-${pair}-${side}: ${message}`);
      }
    }
  }
  const sidesValid = {
    A: records.filter((record) => record.side === 'A' && record.valid).length,
    B: records.filter((record) => record.side === 'B' && record.valid).length,
  };
  const verdict = records.length === FROZEN_PAIRS * 2 && sidesValid.A === FROZEN_PAIRS
    && sidesValid.B === FROZEN_PAIRS ? 'PASS' : 'FAIL';
  stats.sidesValid = sidesValid;
  stats.verdict = verdict;
  if (summary) {
    if (summary.kind !== 'live-legs-summary') {
      push('E_RECOMPUTE_LIVE_SHAPE', 'live/summary.json is not a live-legs-summary');
    }
    if (summary.pairs !== FROZEN_PAIRS || JSON.stringify(summary.order) !== JSON.stringify(FROZEN_ORDER)) {
      push('E_RECOMPUTE_LIVE_SHAPE', 'live/summary.json pairs/order do not match the frozen plan');
    }
    if (summary.activeWindowSeconds !== LIVE_WINDOW_MS / 1000) {
      push('E_RECOMPUTE_LIVE_SHAPE',
        `live/summary.json activeWindowSeconds is ${JSON.stringify(summary.activeWindowSeconds)}`);
    }
    if (JSON.stringify(summary.sidesValid) !== JSON.stringify(sidesValid)) {
      push('E_RECOMPUTE_TAMPERED',
        `live/summary.json sidesValid ${JSON.stringify(summary.sidesValid)} != recomputed ${JSON.stringify(sidesValid)}`);
    }
    if (summary.verdict !== verdict) {
      push('E_RECOMPUTE_TAMPERED',
        `live/summary.json verdict ${JSON.stringify(summary.verdict)} != recomputed ${verdict}`);
    }
    if (expected.liveInputSha256 && summary.liveInputSha256 !== expected.liveInputSha256) {
      push('E_LIVE_INPUT_BINDING',
        'live/summary.json liveInputSha256 does not match the current input manifest liveInput');
    }
    const invalidClaimed = Array.isArray(summary.invalidRounds) ? summary.invalidRounds : [];
    const invalidActual = records.filter((record) => !record.valid)
      .map((record) => `pair-${record.pairIndex}-${record.side}`).sort();
    if (JSON.stringify([...invalidClaimed].sort()) !== JSON.stringify(invalidActual)) {
      push('E_RECOMPUTE_TAMPERED',
        `live/summary.json invalidRounds ${JSON.stringify(invalidClaimed)} != recomputed ${JSON.stringify(invalidActual)}`);
    }
  }
  return stats;
}

// --- the recompute CLI ------------------------------------------------------

const HELP = `usage: node tools/desktop-recv/e2e/measure-ux-calc.mjs --recompute <runRoot> <measurementDir...> --method <performance-method.json> [--context <run-context.json>] [--repo-root <dir>]

  Re-derives every recorded A/B number and every live-side verdict from the
  RAW files on disk and refuses a measurement whose claims do not match.
  The UX gate calls this instead of trusting a written PASS.

  --recompute <runRoot> <dir...>  one or more measurement directories (the
                                  complete one with rounds/, or the proof copy;
                                  a proof copy is resolved to
                                  <runRoot>/measurements/ux-overhead/<attempt>
                                  and must mirror it).
  --method <path>                 the FROZEN performance method.
  --context <path>                optional run-context.json: cross-binds the
                                  current product manifest, input media and
                                  live input SHAs.
  --repo-root <dir>               resolve repo-relative context paths against
                                  <dir> (fixture tests).
  Output: {"ok":bool,"violations":[...],"stats":{...}}; exit 0 only when ok.`;

function parseCli(argv) {
  const parsed = { help: false, runRoot: null, dirs: [], method: null, context: null, repoRoot: null };
  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') { parsed.help = true; index += 1; continue; }
    if (arg === '--recompute') {
      parsed.runRoot = argv[index + 1];
      index += 2;
      while (index < argv.length && !argv[index].startsWith('--')) {
        parsed.dirs.push(argv[index]);
        index += 1;
      }
      continue;
    }
    if (['--method', '--context', '--repo-root'].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) return { error: `${arg} needs a value` };
      parsed[arg === '--repo-root' ? 'repoRoot' : arg.slice(2)] = value;
      index += 2;
      continue;
    }
    return { error: `unknown argument: ${arg}` };
  }
  if (parsed.help) return parsed;
  if (!parsed.runRoot || parsed.dirs.length === 0 || !parsed.method) {
    return { error: '--recompute <runRoot> <measurementDir...> --method <path> are required' };
  }
  return parsed;
}

function samePath(left, right) {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

function readJsonIfPresent(path) {
  if (!existsSync(path) || !statSync(path).isFile()) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return null;
  }
}

function deepJsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

// A proof copy must mirror the original measurement for every file it carries
// (summary/comparison/environment/input/manifest/run + live/*). Tampering the
// copy into a clean-looking PASS is refused even when the original is intact.
function mirrorViolations(copyDir, originalDir, push) {
  const mirrored = ['summary.json', 'comparison.json', 'environment.json', 'input.json',
    'manifest.json', 'run.json'];
  for (const name of mirrored) {
    const copy = readJsonIfPresent(join(copyDir, name));
    const original = readJsonIfPresent(join(originalDir, name));
    if (copy === null && original === null) continue;
    if (copy === null || original === null || !deepJsonEqual(copy, original)) {
      push('E_PROOF_COPY_MISMATCH',
        `the proof copy of ${name} does not match the original measurement file`);
    }
  }
  const copyLive = join(copyDir, 'live');
  const originalLive = join(originalDir, 'live');
  const copySummary = readJsonIfPresent(join(copyLive, 'summary.json'));
  const originalSummary = readJsonIfPresent(join(originalLive, 'summary.json'));
  if (copySummary !== null || originalSummary !== null) {
    if (copySummary === null || originalSummary === null || !deepJsonEqual(copySummary, originalSummary)) {
      push('E_PROOF_COPY_MISMATCH', 'the proof copy of live/summary.json does not match the original');
    }
  }
  const copyRounds = join(copyLive, 'rounds');
  const originalRounds = join(originalLive, 'rounds');
  if (existsSync(copyRounds) && existsSync(originalRounds)) {
    const names = readdirSync(copyRounds).filter((name) => name.endsWith('.json')).sort();
    const originalNames = readdirSync(originalRounds).filter((name) => name.endsWith('.json')).sort();
    if (JSON.stringify(names) !== JSON.stringify(originalNames)) {
      push('E_PROOF_COPY_MISMATCH', 'the proof copy of live/rounds/ does not mirror the original file set');
    } else {
      for (const name of names) {
        const copy = readJsonIfPresent(join(copyRounds, name));
        const original = readJsonIfPresent(join(originalRounds, name));
        if (copy === null || original === null || !deepJsonEqual(copy, original)) {
          push('E_PROOF_COPY_MISMATCH', `the proof copy of live/rounds/${name} does not match the original`);
        }
      }
    }
  }
}

const SHA256_RE = /^[0-9a-f]{64}$/;

// Build the EXPECTED identities from the run context. Every required identity
// is either actually obtained (the product manifest must re-hash to the value
// the context declares; the input identities are read from the bound input
// manifest) or reported as a violation - an empty expected object would make
// every downstream binding check silently vacuous.
function contextExpectations(contextPath, repoRoot, push) {
  const expected = {};
  const context = loadRunContext(contextPath, repoRoot ? { repoRoot } : {});

  if (!context.productManifest || !context.productManifestSha256) {
    push('E_CONTEXT_BINDING',
      'the run context does not bind a product manifest; measurements cannot be bound to the current build');
  } else {
    const manifestAbs = context.abs.productManifest;
    if (!existsSync(manifestAbs) || !statSync(manifestAbs).isFile()) {
      push('E_CONTEXT_BINDING',
        `the product manifest declared by the run context is missing on disk: ${context.productManifest}`);
    } else {
      const diskSha = sha256(readFileSync(manifestAbs));
      if (diskSha !== context.productManifestSha256) {
        push('E_CONTEXT_BINDING',
          `the product manifest on disk does not hash to the run context productManifestSha256`
          + ` (disk ${diskSha.slice(0, 12)}... vs context ${context.productManifestSha256.slice(0, 12)}...)`);
      } else {
        expected.productManifestSha256 = context.productManifestSha256;
      }
    }
  }

  let manifest = null;
  if (!context.inputManifest) {
    push('E_CONTEXT_BINDING',
      'the run context does not bind an input manifest; the measurement cannot be bound to the current inputs');
  } else {
    const inputAbs = context.abs.inputManifest;
    if (!existsSync(inputAbs) || !statSync(inputAbs).isFile()) {
      push('E_CONTEXT_BINDING',
        `the input manifest declared by the run context is missing on disk: ${context.inputManifest}`);
    } else if (context.inputManifestSha256
      && sha256(readFileSync(inputAbs)) !== context.inputManifestSha256) {
      push('E_CONTEXT_BINDING',
        'the input manifest on disk does not hash to the run context inputManifestSha256');
    } else {
      try {
        manifest = JSON.parse(readFileSync(inputAbs, 'utf8'));
      } catch (error) {
        push('E_CONTEXT_BINDING', `the input manifest is not readable JSON: ${error.message}`);
      }
    }
  }
  if (manifest) {
    const take = (field, value, label) => {
      if (typeof value === 'string' && SHA256_RE.test(value)) {
        expected[field] = value;
      } else {
        push('E_CONTEXT_BINDING',
          `the input manifest does not provide ${label}; the measurement cannot be bound`);
      }
    };
    take('inputSha256', manifest.primaryInput && manifest.primaryInput.sha256,
      'primaryInput.sha256');
    take('mediaSha256', manifest.media && manifest.media.withSha256,
      'media.withSha256');
    take('liveInputSha256', manifest.liveInput && manifest.liveInput.sha256,
      'liveInput.sha256');
  }
  return expected;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const parsed = parseCli(process.argv.slice(2));
  if (parsed.error) {
    console.error(parsed.error);
    console.error(HELP);
    process.exit(2);
  }
  if (parsed.help) {
    console.log(HELP);
    process.exit(0);
  }
  const violations = [];
  const push = (code, detail) => violations.push({ code, detail });
  const stats = { measurements: [] };
  let methodBytes = null;
  let method = null;
  try {
    methodBytes = readFileSync(parsed.method);
    method = validateMethod(methodBytes).method;
  } catch (error) {
    push(error.code || 'E_METHOD_MISSING', error.message);
  }
  let expected = {};
  if (method && parsed.context) {
    try {
      expected = contextExpectations(parsed.context, parsed.repoRoot, push);
    } catch (error) {
      push('E_CONTEXT_REFUSED', String((error && error.message) || error));
    }
  }
  if (method) {
    for (const dir of parsed.dirs) {
      const run = readJsonIfPresent(join(dir, 'run.json'));
      const attemptId = run && run.candidate && run.candidate.attemptId;
      // The attempt id names a directory under the run root: accept only the
      // same shape the gate accepts for record.attemptId, never a path.
      const attemptSafe = typeof attemptId === 'string'
        && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(attemptId);
      if (attemptId !== undefined && attemptId !== null && !attemptSafe) {
        push('E_RECOMPUTE_SHAPE', `run.json candidate.attemptId is not a safe attempt id: ${JSON.stringify(attemptId)}`);
      }
      const originalDir = attemptSafe
        ? join(parsed.runRoot, 'measurements', 'ux-overhead', attemptId) : null;
      let target = resolve(dir);
      if (originalDir && existsSync(originalDir) && !samePath(originalDir, dir)) {
        mirrorViolations(resolve(dir), resolve(originalDir), push);
        target = resolve(originalDir);
      }
      const result = recomputeMeasurement({
        measurementDir: target, methodBytes, method,
      }, expected);
      stats.measurements.push({
        requestedDir: resolve(dir),
        recomputedDir: target,
        ok: result.ok,
        validPairs: result.stats.validPairs,
        verdict: result.stats.verdict,
        roundViolations: result.stats.roundViolations || [],
        live: result.stats.live,
      });
      violations.push(...result.violations);
    }
  }
  const output = { ok: violations.length === 0, violations, stats };
  console.log(JSON.stringify(output, null, 2));
  process.exit(output.ok ? 0 : 1);
}

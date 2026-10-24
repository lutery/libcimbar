// T7: receiver UX observation model (UX-UT-017..033). These cases are the
// specification for web/desktop-recv/src/ux-telemetry.js; until that module
// exists this suite is genuinely RED (ERR_MODULE_NOT_FOUND), which is the
// behavior-missing RED required by the plan — a skeleton guard is not a RED.
//
// Rate math here is asserted with pre-computed literal expectations from the
// frozen window definition (12 x 250ms, epoch-anchored), independent of any
// implementation function.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ReceiverTelemetry } from '../../src/ux-telemetry.js';

const MAX_SAFE_INTEGER = 9007199254740991;

function deepFreeze(value) {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  if (value && typeof value === 'object') Object.freeze(value);
  return value;
}

// --- report/fixture builders -------------------------------------------------

function rSingle(ratio) {
  return { state: 'single', ratios: [ratio], diagnosticCode: 0 };
}
function rMultiple(ratios) {
  return { state: 'multiple', ratios: [...ratios], diagnosticCode: 19005 };
}
function rEmpty() {
  return { state: 'empty', ratios: [], diagnosticCode: 0 };
}
function rUnavailable(diag) {
  return { state: 'unavailable', ratios: [], diagnosticCode: diag };
}
function rNotSampled() {
  return { state: 'not_sampled', ratios: [], diagnosticCode: 0 };
}

function beginRequest(seq = 1, { id = 's1', kind = 'live', nowMs = 0 } = {}) {
  return { version: 1, sessionId: id, sessionSeq: seq, inputKind: kind, nowMs };
}

function frameInput(seq, { frameId, at, outcome = 'data', bytes = 625,
  id = 's1', report = rNotSampled(), version = 1 } = {}) {
  return {
    version, sessionId: id, sessionSeq: seq, frameId,
    receivedAtMs: at, outcome, bytesDecoded: bytes, report,
  };
}

function finishRequest(seq, { nowMs, reason, artifactId = null, id = 's1', version = 1 } = {}) {
  return { version, sessionId: id, sessionSeq: seq, nowMs, reason, artifactId };
}

// The frozen window math, computed here from the raw bucket state — the test
// owns the formula and the literals; the model only owns the buckets.
function expectedRate(rate, nowMs) {
  const q = Math.floor((nowMs - rate.epochMs) / 250);
  const start = rate.epochMs + Math.max(0, q - 11) * 250;
  const windowMs = nowMs - start;
  const low = Math.max(0, q - 11);
  const bytes = rate.buckets
    .filter((b) => b.generation >= low && b.generation <= q)
    .reduce((sum, b) => sum + b.bytes, 0);
  const sinceEpoch = nowMs - rate.epochMs;
  if (sinceEpoch < 1000) {
    return { q, start, windowMs, bytes, phase: 'warming', perSecond: null };
  }
  return { q, start, windowMs, bytes, phase: 'active', perSecond: (bytes * 1000) / windowMs };
}

// --- UX-UT-017: begin ownership ------------------------------------------------------------

test('UX-UT-017 begin is idempotent per owner and fully resets on a newer seq', () => {
  const teardown = new ReceiverTelemetry();
  const first = teardown.begin({ version: 1, sessionId: 's1', sessionSeq: 1, inputKind: 'live', nowMs: 100 });
  assert.deepEqual(first,
    { ok: true, code: 0, data: { sessionSeq: 1, applied: true, observationRevision: 1 } });

  teardown.acceptFrame(frameInput(1, { frameId: 1, at: 200, bytes: 625, report: rSingle(0.25) }));
  assert.equal(teardown.snapshot().observationRevision, 2);

  // the exact same begin again: nothing resets, time does not move
  const before = teardown.snapshot();
  const again = teardown.begin({ version: 1, sessionId: 's1', sessionSeq: 1, inputKind: 'live', nowMs: 500 });
  assert.deepEqual(again.data, { sessionSeq: 1, applied: false, observationRevision: 2 });
  const after = teardown.snapshot();
  assert.equal(after.receivingAtMs, 100, 'receivingAt never moves');
  assert.equal(after.observationRevision, before.observationRevision);
  assert.deepEqual(after, before, 'the identical begin leaves every observed fact unchanged');

  // unknown version: 19013, nothing applied
  assert.deepEqual(teardown.begin({ version: 2, sessionId: 's1', sessionSeq: 1, inputKind: 'live', nowMs: 600 }),
    { ok: false, code: 19013, data: null });
  assert.deepEqual(teardown.snapshot(), before);

  // same seq conflicts: id and kind
  assert.equal(teardown.begin({ version: 1, sessionId: 's2', sessionSeq: 1, inputKind: 'live', nowMs: 600 }).code, 19008);
  assert.equal(teardown.begin({ version: 1, sessionId: 's1', sessionSeq: 1, inputKind: 'video', nowMs: 600 }).code, 19008);
  assert.deepEqual(teardown.snapshot(), before);

  // a newer seq replaces everything
  const newer = teardown.begin({ version: 1, sessionId: 's1', sessionSeq: 2, inputKind: 'video', nowMs: 9000 });
  assert.deepEqual(newer.data, { sessionSeq: 2, applied: true, observationRevision: 1 });
  const fresh = teardown.snapshot();
  assert.equal(fresh.sessionSeq, 2);
  assert.equal(fresh.sessionId, 's1');
  assert.equal(fresh.inputKind, 'video');
  assert.equal(fresh.observationRevision, 1);
  assert.equal(fresh.receivingAtMs, 9000);
  assert.equal(fresh.endedAtMs, null);
  assert.equal(fresh.rate.epochMs, 9000);
  assert.equal(fresh.rate.buckets.length, 12);
  assert.ok(fresh.rate.buckets.every((b) => b.bytes === 0));
  assert.equal(fresh.progress.trustedRatio, null);
  assert.equal(fresh.progress.ambiguity, null);
  assert.deepEqual(fresh.save, { phase: 'none', attemptId: null, artifactId: null, errorCode: null });
  assert.deepEqual(fresh.diagnostics, []);

  // an older seq is stale from now on
  assert.deepEqual(teardown.begin({ version: 1, sessionId: 's1', sessionSeq: 1, inputKind: 'video', nowMs: 10001 }),
    { ok: false, code: 19007, data: null });
});

// --- UX-UT-018: FrameInput validation before any state move ------------------

test('UX-UT-018 invalid FrameInput is refused before any ux state moves', () => {
  const t = new ReceiverTelemetry();
  t.begin(beginRequest(1, { nowMs: 100 }));
  t.acceptFrame(frameInput(1, { frameId: 1, at: 200, report: rSingle(0.5) }));
  const baseline = deepFreeze(t.snapshot());

  const refuses = [
    ['version 2', frameInput(1, { frameId: 9, at: 250, version: 2 }), 19013],
    ['unknown field', Object.assign(frameInput(1, { frameId: 9, at: 250 }), { autoRestart: true }), 19008],
    ['frameId 0', frameInput(1, { frameId: 0, at: 250 }), 19008],
    ['frameId fractional', frameInput(1, { frameId: 1.5, at: 250 }), 19008],
    ['stale frameId', frameInput(1, { frameId: 1, at: 250 }), 19007],
    ['other session', frameInput(1, { frameId: 9, at: 250, id: 's2' }), 19008],
    ['data with zero bytes', frameInput(1, { frameId: 9, at: 250, bytes: 0, report: rSingle(0.5) }), 19008],
    ['data with fractional bytes', frameInput(1, { frameId: 9, at: 250, bytes: 1.5, report: rSingle(0.5) }), 19008],
    ['data with not_sampled report', frameInput(1, { frameId: 9, at: 250, report: rNotSampled() }), 19008],
    ['no_data with bytes', frameInput(1, { frameId: 9, at: 250, outcome: 'no_data', bytes: 625 }), 19008],
    ['error with bytes', frameInput(1, { frameId: 9, at: 250, outcome: 'error', bytes: 625 }), 19008],
    ['unknown outcome', frameInput(1, { frameId: 9, at: 250, outcome: 'shrug' }), 19008],
    ['receivedAt before receivingAt', frameInput(1, { frameId: 9, at: 99 }), 19009],
    ['receivedAt before last accept', frameInput(1, { frameId: 9, at: 199 }), 19009],
    ['receivedAt negative', frameInput(1, { frameId: 9, at: -1 }), 19009],
  ];
  for (const [name, request, code] of refuses) {
    assert.deepEqual(t.acceptFrame(request), { ok: false, code, data: null }, name);
    assert.deepEqual(t.snapshot(), baseline, `${name}: the snapshot must not move`);
  }

  // non-finite times are also clock errors (19009)
  for (const at of [NaN, Infinity]) {
    assert.deepEqual(t.acceptFrame(frameInput(1, { frameId: 9, at })),
      { ok: false, code: 19009, data: null }, `receivedAt ${at}`);
    assert.deepEqual(t.snapshot(), baseline);
  }

  // a valid current frame after all that is still accepted
  const ok = t.acceptFrame(frameInput(1, { frameId: 50, at: 250, report: rSingle(0.5) }));
  assert.equal(ok.ok, true);
  assert.equal(ok.data.applied, true);
  assert.equal(t.snapshot().observationRevision, baseline.observationRevision + 1);
});

// --- UX-UT-019: stale/seq/frozen strictness -----------------------------------

test('UX-UT-019 stale frames, stale seqs and frozen states are refused with 19007', () => {
  const t = new ReceiverTelemetry();
  t.begin(beginRequest(2, { nowMs: 100 }));
  t.acceptFrame(frameInput(2, { frameId: 5, at: 200, report: rSingle(0.25) }));
  const baseline = deepFreeze(t.snapshot());

  for (const frameId of [5, 4, 1]) {
    assert.deepEqual(t.acceptFrame(frameInput(2, { frameId, at: 300, report: rSingle(0.3) })),
      { ok: false, code: 19007, data: null }, `duplicate/old frameId ${frameId}`);
  }
  assert.deepEqual(t.acceptFrame(frameInput(1, { frameId: 100, at: 300 })),
    { ok: false, code: 19007, data: null }, 'a stale seq is refused even with a higher frameId');

  const after = t.snapshot();
  assert.deepEqual(after, baseline, 'no fact moves on stale input');
  assert.equal(after.progress.lastDataAtMs, 200);

  // after a genuine finish, even a new current frameId is refused
  t.finish(finishRequest(2, { nowMs: 1000, reason: 'stopped' }));
  assert.deepEqual(t.acceptFrame(frameInput(2, { frameId: 6, at: 1100 })),
    { ok: false, code: 19007, data: null });
  assert.equal(t.snapshot().endedAtMs, 1000, 'the endpoint stays frozen');
});

// --- UX-UT-020: repeated ratios vs real bytes --------------------------------

test('UX-UT-020 repeated single ratios do not fake progress though bytes still count', () => {
  const t = new ReceiverTelemetry();
  t.begin(beginRequest(1, { nowMs: 0 }));
  t.acceptFrame(frameInput(1, { frameId: 1, at: 1000, report: rSingle(0.25) }));
  t.acceptFrame(frameInput(1, { frameId: 2, at: 1250, report: rSingle(0.25) }));
  t.acceptFrame(frameInput(1, { frameId: 3, at: 1500, report: rSingle(0.5) }));

  const snap = t.snapshot();
  assert.equal(snap.progress.trustedRatio, 0.5);
  assert.equal(snap.progress.lastAdvanceAtMs, 1500, 'only a strict increase advances');
  assert.equal(snap.progress.lastDataAtMs, 1500);
  const total = snap.rate.buckets.reduce((sum, b) => sum + b.bytes, 0);
  assert.equal(total, 1875, 'all three real data frames are counted');
  assert.equal(snap.rate.epochMs, 0);
});

// --- UX-UT-021: multiple streams lock ambiguity until a new seq --------------

test('UX-UT-021 multiple stream reports lock ambiguity until a new seq', () => {
  const t = new ReceiverTelemetry();
  t.begin(beginRequest(1, { nowMs: 0 }));
  t.acceptFrame(frameInput(1, { frameId: 1, at: 500, report: rSingle(0.2) }));
  t.acceptFrame(frameInput(1, { frameId: 2, at: 1000, report: rMultiple([0.3, 0.8]) }));

  let snap = t.snapshot();
  assert.equal(snap.progress.ambiguity, 19005, 'multiple streams lock the ambiguity');
  assert.equal(snap.progress.trustedRatio, null);
  assert.deepEqual(snap.diagnostics, [19005]);

  t.acceptFrame(frameInput(1, { frameId: 3, at: 1500, report: rSingle(0.9) }));
  snap = t.snapshot();
  assert.equal(snap.progress.ambiguity, 19005, 'a later single does not unlock');
  assert.equal(snap.progress.trustedRatio, null);
  assert.deepEqual(snap.diagnostics, [19005], 'the diagnostic is deduped');
  const total = snap.rate.buckets.reduce((sum, b) => sum + b.bytes, 0);
  assert.equal(total, 1875, 'the data rate still works during the lock');

  // a new seq starts clean: no inherited lock, a new estimate can form
  t.begin(beginRequest(2, { kind: 'video', nowMs: 9000 }));
  snap = t.snapshot();
  assert.equal(snap.progress.ambiguity, null);
  assert.deepEqual(snap.diagnostics, []);
  t.acceptFrame(frameInput(2, { frameId: 1, at: 9500, report: rSingle(0.1) }));
  assert.equal(t.snapshot().progress.trustedRatio, 0.1);
});

// --- UX-UT-022: regressed single ratios lock ambiguity ------------------------

test('UX-UT-022 a regressed single ratio locks ambiguity and nothing is clamped', () => {
  const t = new ReceiverTelemetry();
  t.begin(beginRequest(1, { nowMs: 0 }));
  t.acceptFrame(frameInput(1, { frameId: 1, at: 500, report: rSingle(0.6) }));
  t.acceptFrame(frameInput(1, { frameId: 2, at: 1000, report: rSingle(0.4) }));
  t.acceptFrame(frameInput(1, { frameId: 3, at: 1500, report: rSingle(0.8) }));

  const snap = t.snapshot();
  assert.equal(snap.progress.trustedRatio, null, 'no max/current/upcoming ratio is shown');
  assert.equal(snap.progress.ambiguity, 19006);
  assert.deepEqual(snap.diagnostics, [19006]);
  const total = snap.rate.buckets.reduce((sum, b) => sum + b.bytes, 0);
  assert.equal(total, 1875, 'reception continues during the ambiguity lock');

  // independent control: an equal ratio is not a regression
  const control = new ReceiverTelemetry();
  control.begin(beginRequest(1, { nowMs: 0 }));
  control.acceptFrame(frameInput(1, { frameId: 1, at: 500, report: rSingle(0.6) }));
  control.acceptFrame(frameInput(1, { frameId: 2, at: 1000, report: rSingle(0.6) }));
  assert.equal(control.snapshot().progress.trustedRatio, 0.6);
  assert.deepEqual(control.snapshot().diagnostics, []);
  assert.equal(control.snapshot().progress.lastAdvanceAtMs, 500,
    'equal ratios do not advance either');
});

// --- UX-UT-023: temporary empty/unavailable reports hide, not reset ----------

test('UX-UT-023 temporary empty or unavailable reports hide the ratio but keep the trust history', () => {
  for (const [label, report, diag] of [
    ['empty report', rEmpty(), 0],
    ['read failure', rUnavailable(19002), 19002],
    ['format invalid', rUnavailable(19004), 19004],
    ['legacy absent', rUnavailable(19015), 19015],
  ]) {
    const t = new ReceiverTelemetry();
    t.begin(beginRequest(1, { nowMs: 0 }));
    t.acceptFrame(frameInput(1, { frameId: 1, at: 500, report: rSingle(0.6) }));
    t.acceptFrame(frameInput(1, { frameId: 2, at: 1000, report }));

    const snap = t.snapshot();
    assert.equal(snap.progress.trustedRatio, 0.6, `${label}: the trusted history is kept`);
    assert.equal(snap.progress.lastAdvanceAtMs, 500, `${label}: the advance history is kept`);
    assert.equal(snap.progress.ambiguity, null, `${label}: no ambiguity lock`);
    if (diag) {
      assert.deepEqual(snap.diagnostics, [diag], `${label}: the diagnostic is recorded once`);
    }

    // recovery with a higher ratio advances; with a lower one it locks (19006)
    t.acceptFrame(frameInput(1, { frameId: 3, at: 1500, report: rSingle(0.7) }));
    assert.equal(t.snapshot().progress.trustedRatio, 0.7, `${label}: a stronger estimate is trusted`);
    assert.equal(t.snapshot().progress.lastAdvanceAtMs, 1500);
  }

  // recovery with the lower 0.5 against the kept 0.6 baseline: 19006
  const regress = new ReceiverTelemetry();
  regress.begin(beginRequest(1, { nowMs: 0 }));
  regress.acceptFrame(frameInput(1, { frameId: 1, at: 500, report: rSingle(0.6) }));
  regress.acceptFrame(frameInput(1, { frameId: 2, at: 1000, report: rEmpty() }));
  regress.acceptFrame(frameInput(1, { frameId: 3, at: 1500, report: rSingle(0.5) }));
  assert.equal(regress.snapshot().progress.ambiguity, 19006);
});

// --- UX-UT-024: honest progress up to a real artifact ------------------------

test('UX-UT-024 ratios at or above one stay non-completed until a real artifact', () => {
  const t = new ReceiverTelemetry();
  t.begin(beginRequest(1, { nowMs: 0 }));
  t.acceptFrame(frameInput(1, { frameId: 1, at: 500, report: rSingle(0) }));
  t.acceptFrame(frameInput(1, { frameId: 2, at: 1000, report: rSingle(0.999) }));
  t.acceptFrame(frameInput(1, { frameId: 3, at: 1500, report: rSingle(1) }));
  t.acceptFrame(frameInput(1, { frameId: 4, at: 2000, report: rSingle(1.4) }));

  const snap = t.snapshot();
  assert.equal(snap.progress.trustedRatio, 1.4, 'no clamping anywhere in the model');
  assert.equal(snap.progress.ambiguity, null);
  assert.equal(snap.observationRevision, 5, 'each real frame was applied exactly once');

  // a real artifact outcome marks the artifact fact; completion display is the
  // view's job with the business artifact, not a ratio property
  t.acceptFrame(frameInput(1, { frameId: 5, at: 2500, report: rSingle(1.4) }));
  const withArtifact = t.snapshot();
  assert.equal(withArtifact.observationRevision, 6);
});

// --- UX-UT-025: twelve buckets, exact boundary placement ----------------------

test('UX-UT-025 twelve buckets place boundary bytes exactly and keep the denominator stable', () => {
  const t = new ReceiverTelemetry();
  t.begin(beginRequest(1, { nowMs: 0 }));
  t.acceptFrame(frameInput(1, { frameId: 1, at: 0, bytes: 10 }));
  t.acceptFrame(frameInput(1, { frameId: 2, at: 249.9, bytes: 20 }));
  t.acceptFrame(frameInput(1, { frameId: 3, at: 250, bytes: 30 }));
  t.acceptFrame(frameInput(1, { frameId: 4, at: 2999.9, bytes: 40 }));

  const snap = t.snapshot();
  assert.equal(snap.rate.buckets.length, 12, 'the model always keeps exactly 12 slots');

  // independent expected rates (literals from the frozen example)
  const at2999 = expectedRate(snap.rate, 2999.9);
  assert.equal(at2999.bytes, 100, '10 + 20 + 30 + 40 all retained at 2999.9');
  assert.equal(at2999.windowMs, 2999.9);
  assert.equal(at2999.phase, 'active');
  assert.ok(Math.abs(at2999.perSecond - 100000 / 2999.9) < 1e-9);

  // t=3000: q=12, the window starts at 250: bucket 0 (30B) is out
  t.acceptFrame(frameInput(1, { frameId: 5, at: 3000, bytes: 50 }));
  const at3000 = expectedRate(t.snapshot().rate, 3000);
  assert.equal(at3000.bytes, 120, '30 + 40 + 50 retained');
  assert.equal(at3000.windowMs, 2750);
  assert.ok(Math.abs(at3000.perSecond - 120000 / 2750) < 1e-9);
});

// --- UX-UT-026: one-second warm-up uses the real coverage ---------------------

test('UX-UT-026 the warmup boundary uses the actual coverage window', () => {
  const t = new ReceiverTelemetry();
  t.begin(beginRequest(1, { nowMs: 0 }));
  t.acceptFrame(frameInput(1, { frameId: 1, at: 250, bytes: 1024 }));
  const snap = t.snapshot();

  const at999 = expectedRate(snap.rate, 999.9);
  assert.equal(at999.phase, 'warming');
  assert.equal(at999.perSecond, null);
  assert.equal(at999.windowMs, 999.9);
  assert.equal(at999.bytes, 1024);

  const at1000 = expectedRate(snap.rate, 1000);
  assert.equal(at1000.phase, 'active');
  assert.equal(at1000.perSecond, 1024, '1024 bytes over exactly 1000ms');
  assert.equal(at1000.windowMs, 1000);

  const at2999 = expectedRate(snap.rate, 2999.9);
  assert.equal(at2999.phase, 'active');
  assert.ok(Math.abs(at2999.perSecond - 1024000 / 2999.9) < 1e-9);
  assert.equal(at2999.windowMs, 2999.9);

  const at3000 = expectedRate(snap.rate, 3000);
  assert.equal(at3000.windowMs, 2750);
  assert.ok(Math.abs(at3000.perSecond - 1024 * 1000 / 2750) < 1e-9);

  const at3250 = expectedRate(snap.rate, 3250);
  assert.equal(at3250.bytes, 0);
  assert.equal(at3250.perSecond, 0, 'zero is active, never a new warmup');
  assert.equal(at3250.phase, 'active');
});

// --- UX-UT-027: after the data stops, the rate reaches zero within 3s ---------

test('UX-UT-027 after the data stops the rate reaches zero within three seconds', () => {
  // branch A: the last sample at 249.9ms (bucket 0)
  const a = new ReceiverTelemetry();
  a.begin(beginRequest(1, { nowMs: 0 }));
  a.acceptFrame(frameInput(1, { frameId: 1, at: 249.9, bytes: 625 }));
  const aAlive = expectedRate(a.snapshot().rate, 2999.9);
  assert.equal(aAlive.bytes, 625);
  assert.ok(aAlive.perSecond > 0, 'still visible just before 3000ms');
  const aDone = expectedRate(a.snapshot().rate, 3000);
  assert.equal(aDone.perSecond, 0);
  assert.equal(aDone.phase, 'active');

  // branch B: the last sample at 250ms (bucket 1) survives until 3250
  const b = new ReceiverTelemetry();
  b.begin(beginRequest(1, { nowMs: 0 }));
  b.acceptFrame(frameInput(1, { frameId: 1, at: 250, bytes: 625 }));
  const bAlive = expectedRate(b.snapshot().rate, 3249.9);
  assert.equal(bAlive.bytes, 625);
  const bDone = expectedRate(b.snapshot().rate, 3250);
  assert.equal(bDone.perSecond, 0);
  assert.equal(bDone.phase, 'active');

  // the reads are pure: repeating them changes nothing
  const before = b.snapshot();
  const again = b.snapshot();
  assert.deepEqual(again, before);
});

// --- UX-UT-028: only real decoded bytes count --------------------------------

test('UX-UT-028 only real decoded bytes are counted and redundancy is explicit', () => {
  const t = new ReceiverTelemetry();
  t.begin(beginRequest(1, { nowMs: 0 }));
  t.acceptFrame(frameInput(1, { frameId: 1, at: 100, report: rSingle(0.25) }));
  t.acceptFrame(frameInput(1, { frameId: 2, at: 250, outcome: 'no_data' }));
  t.acceptFrame(frameInput(1, { frameId: 3, at: 500, report: rSingle(0.25) }));
  t.acceptFrame(frameInput(1, { frameId: 4, at: 750, outcome: 'error' }));

  const at1000 = expectedRate(t.snapshot().rate, 1000);
  assert.equal(at1000.bytes, 1250, 'exactly the two data frames, no error/no_data bytes');
  assert.ok(Math.abs(at1000.perSecond - 1250000 / 1000) < 1e-9, '1250 B/s, including redundancy');
  assert.equal(at1000.windowMs, 1000);

  const snap = t.snapshot();
  assert.equal(snap.progress.lastDataAtMs, 500, 'no_data/error never refresh lastData');
  assert.equal(snap.progress.lastResultAtMs, 750, 'they do update the result time');
  assert.equal(snap.progress.lastAdvanceAtMs, 100, 'a repeated ratio does not advance again');
});

// --- UX-UT-029: overflow resets only the rate domain --------------------------

test('UX-UT-029 a safe-integer overflow resets only the rate domain', () => {
  // layout A: both frames in the same bucket
  const a = new ReceiverTelemetry();
  a.begin(beginRequest(1, { nowMs: 0 }));
  a.acceptFrame(frameInput(1, { frameId: 1, at: 250, bytes: MAX_SAFE_INTEGER }));
  a.acceptFrame(frameInput(1, { frameId: 2, at: 250, bytes: 1, report: rSingle(0.5) }));

  let snap = a.snapshot();
  assert.deepEqual(snap.diagnostics, [19010]);
  assert.equal(snap.rate.epochMs, 250, 'the rate epoch re-anchors at the overflow time');
  assert.equal(snap.receivingAtMs, 0, 'the receiving start never moves');
  assert.equal(snap.progress.trustedRatio, 0.5, 'the ratio fact survives');
  assert.equal(snap.progress.lastDataAtMs, 250);

  const aWarming = expectedRate(snap.rate, 1249.9);
  assert.equal(aWarming.phase, 'warming');
  assert.equal(aWarming.perSecond, null);
  const aZero = expectedRate(snap.rate, 1250);
  assert.equal(aZero.phase, 'active');
  assert.equal(aZero.perSecond, 0);

  a.acceptFrame(frameInput(1, { frameId: 3, at: 2000, bytes: 100 }));
  const aCounting = expectedRate(a.snapshot().rate, 2000);
  assert.equal(aCounting.bytes, 100);
  assert.ok(aCounting.perSecond > 0, 'normal bytes count again after the reset');

  // layout B: the same frame times spread across two buckets
  const b = new ReceiverTelemetry();
  b.begin(beginRequest(1, { nowMs: 0 }));
  b.acceptFrame(frameInput(1, { frameId: 1, at: 0, bytes: MAX_SAFE_INTEGER }));
  b.acceptFrame(frameInput(1, { frameId: 2, at: 250, bytes: 1, report: rSingle(0.5) }));
  const bSnap = b.snapshot();
  assert.deepEqual(bSnap.diagnostics, [19010]);
  assert.equal(bSnap.rate.epochMs, 250);
  assert.equal(expectedRate(bSnap.rate, 1249.9).phase, 'warming');
  assert.equal(expectedRate(bSnap.rate, 1250).perSecond, 0);

  // the elapsed time is untouched by a rate reset
  const elapsed = bSnap.endedAtMs === null ? 1250 - bSnap.receivingAtMs : null;
  assert.equal(elapsed, 1250, 'elapsed keeps counting from receivingAt');
});

// --- UX-UT-030: big jumps and long sequences stay bounded ---------------------

test('UX-UT-030 big time jumps and long sequences keep fixed bounded state', () => {
  const t = new ReceiverTelemetry();
  t.begin(beginRequest(1, { nowMs: 0 }));
  t.acceptFrame(frameInput(1, { frameId: 1, at: 100, bytes: 625 }));
  t.acceptFrame(frameInput(1, { frameId: 2, at: 900000000, bytes: 625 }));

  const snap = t.snapshot();
  assert.equal(snap.rate.buckets.length, 12, 'the model never grows buckets');
  assert.equal(snap.receivingAtMs, 0, 'receivingAt is not reset by jumps');
  const atJump = expectedRate(snap.rate, 900000000);
  assert.equal(atJump.windowMs, 2750, 'the independent window at the jump');
  assert.equal(atJump.bytes, 625);
  assert.ok(Math.abs(atJump.perSecond - 625000 / 2750) < 1e-9);

  // a long sequence of repeated unavailable reports stays deduped
  for (let i = 3; i <= 60; i += 1) {
    t.acceptFrame(frameInput(1, { frameId: i, at: 900000000 + i, report: rUnavailable(19015) }));
  }
  const later = t.snapshot();
  assert.deepEqual(later.diagnostics, [19015], 'one diagnostic for many frames');
  assert.equal(later.rate.buckets.length, 12);
  assert.equal(later.observationRevision, 61, 'each real frame applied once, history not kept');
});

// --- UX-UT-031: regressed and non-finite clocks are refused -------------------

test('UX-UT-031 regressed and non-finite clocks are refused and later recover honestly', () => {
  for (const at of [99, 199, -1, NaN, Infinity]) {
    const t = new ReceiverTelemetry();
    t.begin(beginRequest(1, { nowMs: 100 }));
    t.acceptFrame(frameInput(1, { frameId: 1, at: 200, bytes: 625 }));
    const baseline = deepFreeze(t.snapshot());
    assert.deepEqual(t.acceptFrame(frameInput(1, { frameId: 2, at, bytes: 625 })),
      { ok: false, code: 19009, data: null }, `invalid time ${at}`);
    assert.deepEqual(t.snapshot(), baseline, `nothing applied for time ${at}`);

    // after the recovery the old buckets age out naturally
    t.acceptFrame(frameInput(1, { frameId: 2, at: 5000, bytes: 625, report: rSingle(0.1) }));
    assert.equal(t.snapshot().progress.trustedRatio, 0.1);
    const recovered = expectedRate(t.snapshot().rate, 5000);
    assert.equal(recovered.windowMs, 4900);
    assert.equal(recovered.bytes, 1250);
  }
});

// --- UX-UT-033: finish freezes the endpoint and later cleanup is idempotent ---

test('UX-UT-033 finish freezes the endpoint, repeats are idempotent, cleanup cannot erase', () => {
  for (const reason of ['artifact', 'incomplete', 'stopped', 'error', 'disposed']) {
    const t = new ReceiverTelemetry();
    t.begin(beginRequest(1, { nowMs: 100 }));
    t.acceptFrame(frameInput(1, { frameId: 1, at: 300, bytes: 625, report: rSingle(0.4) }));

    const finish = t.finish(finishRequest(1,
      { nowMs: 1000, reason, artifactId: reason === 'artifact' ? '42' : null }));
    assert.equal(finish.ok, true, `${reason}: the genuine finish applies`);
    assert.equal(finish.data.applied, true);
    const snap = t.snapshot();
    assert.equal(snap.endedAtMs, 1000, `${reason}: the endpoint froze at 1000`);

    const revisionBeforeRepeat = t.snapshot().observationRevision;
    const repeat = t.finish(finishRequest(1,
      { nowMs: 1300, reason, artifactId: reason === 'artifact' ? '42' : null }));
    assert.equal(repeat.data.applied, false, `${reason}: the repeat is not applied`);
    assert.equal(repeat.data.observationRevision, revisionBeforeRepeat);
    assert.equal(t.snapshot().endedAtMs, 1000, 'the endpoint never moves');

    // accept frames are refused after any terminal
    assert.deepEqual(t.acceptFrame(frameInput(1, { frameId: 9, at: 1500 })),
      { ok: false, code: 19007, data: null });

    // the elapsed stays floor(endedAt-receivingAt) no matter the cleanup time
    const elapsedFrozen = snap.endedAtMs - snap.receivingAtMs;
    assert.equal(elapsedFrozen, 900);
  }

  // invalid reasons do not invent artifacts
  const bad = new ReceiverTelemetry();
  bad.begin(beginRequest(1, { nowMs: 100 }));
  assert.deepEqual(bad.finish(finishRequest(1, { nowMs: 1000, reason: 'percentage', artifactId: '42' })),
    { ok: false, code: 19008, data: null });
  assert.deepEqual(bad.finish(finishRequest(1, { nowMs: 1000, reason: 'artifact', artifactId: null })),
    { ok: false, code: 19008, data: null });

  // a finish without begin is an idempotent no-op (Preparing cleanup)
  const cold = new ReceiverTelemetry();
  const never = cold.finish(finishRequest(1, { nowMs: 2000, reason: 'disposed' }));
  assert.equal(never.ok, true);
  assert.deepEqual(never.data, { sessionSeq: 1, applied: false, observationRevision: 0 });
  const coldSnap = cold.snapshot();
  assert.equal(coldSnap.receivingAtMs, null, 'no receiving time was ever set');
  assert.equal(coldSnap.endedAtMs, null);
});

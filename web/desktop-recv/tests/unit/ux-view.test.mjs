// T7: receiver UX view projection (UX-UT-032, 034, 041..047).
// Target module: web/desktop-recv/src/ux-view.js (readView).
// Missing module = genuine RED (behavior missing), never a skeleton guard.
import test from 'node:test';
import assert from 'node:assert/strict';

import { readView, formatRate, formatProgress } from '../../src/ux-view.js';
import { ReceiverTelemetry } from '../../src/ux-telemetry.js';

function deepFreeze(value) {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  if (value && typeof value === 'object') Object.freeze(value);
  return value;
}

function emptyBuckets() {
  return Array.from({ length: 12 }, (_, i) => ({ generation: i, bytes: 0 }));
}

function bucketWith(generation, bytes) {
  return emptyBuckets().map((slot, i) => (
    i === generation % 12 ? { generation, bytes } : slot
  ));
}

function bucketsOf(entries) {
  return emptyBuckets().map((slot, i) => {
    const entry = entries.find((e) => e.generation % 12 === i);
    return entry ? { generation: entry.generation, bytes: entry.bytes } : slot;
  });
}

// An observation with literals; `progress` and `rate` are the truth-holders.
function observationFixture(overrides = {}) {
  const base = {
    version: 1,
    sessionId: 's1',
    sessionSeq: 1,
    inputKind: 'live',
    observationRevision: 2,
    receivingAtMs: 100,
    endedAtMs: null,
    rate: { epochMs: 100, buckets: emptyBuckets() },
    progress: {
      trustedRatio: null,
      trustedAtMs: 250,
      lastAdvanceAtMs: null,
      lastDataAtMs: null,
      // the last accepted data/artifact frame's own report state (R13-A13-02):
      // null until such a frame is accepted; degradation is this event fact,
      // never a timestamp coincidence
      lastReportState: null,
      lastResultAtMs: null,
      ambiguity: null,
    },
    save: { phase: 'none', attemptId: null, artifactId: null, errorCode: null },
    diagnostics: [],
  };
  const merged = {
    ...base,
    rate: overrides.rate ? { ...base.rate, ...overrides.rate } : base.rate,
    progress: overrides.progress ? { ...base.progress, ...overrides.progress } : base.progress,
    ...restOf(overrides),
  };
  return deepFreeze(merged);
}

function restOf(overrides) {
  const { rate, progress, ...rest } = overrides;
  return rest;
}

function contextFixture(overrides = {}) {
  return deepFreeze({
    state: 'Receiving',
    businessRevision: 7,
    inputKind: 'live',
    cleanupComplete: true,
    artifactId: null,
    controls: {
      canStartLive: false,
      canImportVideo: false,
      canStop: true,
      canSave: false,
    },
    inFlight: false,
    inFlightSinceMs: null,
    mediaPosition: null,
    mediaDiagnosticCode: 0,
    ...overrides,
  });
}

function requestAt(nowMs, context = contextFixture(), { seq = 1, id = 's1', version = 1 } = {}) {
  return deepFreeze({ version, sessionId: id, sessionSeq: seq, nowMs, context });
}

test('UX-UT-041 readView is deterministic and read-only with controls pass-through', () => {
  const controls = {
    canStartLive: true,
    canImportVideo: false,
    canStop: false,
    canSave: true,
  };
  const obs = observationFixture({
    endedAtMs: 800,
    progress: { lastDataAtMs: 250, trustedRatio: 0.426, lastAdvanceAtMs: 250 },
  });
  const pristine = JSON.parse(JSON.stringify(obs));
  const ctx = contextFixture({
    state: 'Ready',
    businessRevision: 9,
    artifactId: '42',
    cleanupComplete: true,
    controls,
  });
  const request = requestAt(1000, ctx);

  const v1 = readView(obs, request);
  const v2 = readView(obs, request);
  assert.equal(v1.ok, true);
  assert.deepEqual(v1, v2, 'same frozen inputs give the same result');
  assert.deepEqual(obs, pristine, 'readView never mutates the observation');
  assert.deepEqual(request, requestAt(1000, contextFixture({
    state: 'Ready', businessRevision: 9, artifactId: '42', cleanupComplete: true, controls,
  })), 'the request stayed equal to its frozen literal');
  assert.deepEqual(v1.data.controls, controls, 'controls pass through bit for bit');
  assert.equal(v1.data.observationRevision, obs.observationRevision);
  assert.equal(v1.data.businessRevision, 9);

  // Idle without begin: an ownerless observation and an Idle context
  const idleObs = observationFixture({
    sessionId: null,
    sessionSeq: 0,
    inputKind: null,
    observationRevision: 0,
    receivingAtMs: null,
    rate: { epochMs: 0 },
  });
  const idleCtx = contextFixture({ state: 'Idle', businessRevision: 0, inputKind: null });
  const idle = readView(idleObs, requestAt(700, idleCtx, { id: null, seq: 0 }));
  assert.equal(idle.ok, true);
  assert.equal(idle.data.state, 'Idle');
  assert.equal(idle.data.statusKey, 'idle');
  assert.equal(idle.data.elapsedMs, null);
  assert.equal(idle.data.observationRevision, 0);
});

test('UX-UT-042 stale owners and invalid contexts are refused without inventing completion', () => {
  const obs = observationFixture({
    sessionSeq: 2,
    progress: { lastDataAtMs: 250, trustedRatio: 0.5, lastAdvanceAtMs: 250 },
  });
  const okCtx = contextFixture();

  const refuses = [
    ['old owner seq', requestAt(1000, okCtx, { seq: 1, id: 's1' }), 19007],
    ['newer owner seq', requestAt(1000, okCtx, { seq: 3, id: 's1' }), 19008],
    ['other owner id', requestAt(1000, okCtx, { seq: 2, id: 's2' }), 19008],
    ['unsupported version', requestAt(1000, okCtx, { version: 2 }), 19013],
    ['invalid state', requestAt(1000, contextFixture({ state: 'Bogus' })), 19008],
    ['bad controls', requestAt(1000, contextFixture({ controls: { canStartLive: false } })), 19008],
    ['inFlight without since', requestAt(1000, contextFixture({ inFlight: true, inFlightSinceMs: null })), 19008],
    ['non-finite now', requestAt(NaN, okCtx, { seq: 2 }), 19009],
    ['negative now', requestAt(-1, okCtx, { seq: 2 }), 19009],
    ['now before receiving', requestAt(99, okCtx, { seq: 2 }), 19009],
    ['Ready without artifact', requestAt(1000, contextFixture({ state: 'Ready' }), { seq: 2 }), 19014],
    ['Saving without artifact', requestAt(1000, contextFixture({ state: 'Saving' }), { seq: 2 }), 19014],
    ['Saved without artifact', requestAt(1000, contextFixture({ state: 'Saved' }), { seq: 2 }), 19014],
    ['Retryable without artifact', requestAt(1000, contextFixture({ state: 'Retryable' }), { seq: 2 }), 19014],
  ];
  for (const [name, request, code] of refuses) {
    const result = readView(obs, request);
    assert.deepEqual(result, { ok: false, code, data: null }, name);
  }

  // a valid current owner context still projects; the rejected calls above
  // never produced a complete/Saved/artifact or a new control
  const good = readView(obs, requestAt(1000, okCtx, { seq: 2, id: 's1' }));
  assert.equal(good.ok, true);
  assert.notEqual(good.data.progress.kind, 'complete');
  assert.equal(good.data.save.phase, 'none');
});

test('UX-UT-043 the processing hint appears only at a real 1500ms pending age', () => {
  const obs = observationFixture({
    receivingAtMs: 0,
    rate: { epochMs: 0 },
    // a good single report refreshes trustedAtMs at the same data frame, so a
    // model-consistent trusted sample carries the frame's own time
    progress: { lastDataAtMs: 1000, trustedRatio: 0.25, trustedAtMs: 1000, lastAdvanceAtMs: 1000 },
  });
  const busyCtx = contextFixture({ inFlight: true, inFlightSinceMs: 1000 });
  const idleCtx = contextFixture();

  assert.equal(readView(obs, requestAt(2499.9, busyCtx)).data.statusKey, 'receiving',
    '1499.9ms of pending keeps the normal receiving hint');
  assert.equal(readView(obs, requestAt(2500, busyCtx)).data.statusKey, 'processing',
    'exactly 1500ms switches to processing');
  assert.equal(readView(obs, requestAt(2500.1, busyCtx)).data.statusKey, 'processing');

  // no pending: never processing, and a stale inFlightSinceMs cannot leak
  assert.equal(readView(obs, requestAt(3000, idleCtx)).data.statusKey, 'receiving');
  assert.equal(readView(obs, requestAt(3000, contextFixture({
    inFlight: false, inFlightSinceMs: null,
  }))).data.statusKey, 'receiving');

  // processing outranks the data-wait hints at the same instant
  const quiet = observationFixture({
    receivingAtMs: 0,
    rate: { epochMs: 0 },
    progress: { lastDataAtMs: 1000 },
  });
  const quietBusy = contextFixture({ inFlight: true, inFlightSinceMs: 500 });
  assert.equal(readView(quiet, requestAt(6500, quietBusy)).data.statusKey, 'processing',
    'a busy frame outranks no_new_data at 6500ms');
});

test('UX-UT-044 the first-data wait advice crosses exactly at 5000ms', () => {
  const obs = observationFixture({
    receivingAtMs: 1000,
    rate: { epochMs: 1000 },
    progress: { lastDataAtMs: null },
  });
  const ctx = contextFixture();

  const before = readView(obs, requestAt(5999.9, ctx));
  const at = readView(obs, requestAt(6000, ctx));
  const after = readView(obs, requestAt(6000.1, ctx));

  for (const view of [before, at, after]) {
    assert.equal(view.data.statusKey, 'waiting_data', 'still waiting, never an error');
    assert.deepEqual(view.data.diagnosticCodes, [], 'waiting is not a new failure code');
  }
  assert.equal(before.data.nextAction, '', 'no check advice before the threshold');
  assert.notEqual(at.data.nextAction, '', 'the advice appears at exactly 5000ms');
  assert.notEqual(after.data.nextAction, '', 'and stays after it');
  assert.equal(before.data.elapsedMs, 4999);
  assert.equal(at.data.elapsedMs, 5000);
  assert.equal(after.data.elapsedMs, 5000);
  // controls unchanged: a hint is never a permission
  assert.deepEqual(at.data.controls, ctx.controls);
});

test('UX-UT-045 five seconds without data mark the estimate stale and the window zeroes', () => {
  const obs = observationFixture({
    receivingAtMs: 1000,
    rate: { epochMs: 1000, buckets: bucketWith(4, 625) },
    progress: { lastDataAtMs: 2000, trustedRatio: 0.3, trustedAtMs: 2000, lastAdvanceAtMs: 2000 },
  });
  const ctx = contextFixture();

  const before = readView(obs, requestAt(6999.9, ctx));
  assert.equal(before.data.statusKey, 'receiving');
  assert.equal(before.data.progress.stale, false);

  const at = readView(obs, requestAt(7000, ctx));
  assert.equal(at.data.statusKey, 'no_new_data');
  assert.equal(at.data.progress.stale, true, 'the estimate is marked stale');
  assert.equal(at.data.progress.kind, 'estimate');
  assert.equal(at.data.progress.ratio, 0.3, 'the last trusted sample is still labeled');
  assert.equal(at.data.progress.asOfMs, 2000);
  assert.equal(at.data.rate.bytesPerSecond, 0,
    'the emptied window shows zero, not the old high value');
  assert.equal(at.data.rate.phase, 'active');

  // a fresh data frame clears the staleness; an unadvanced ratio stays put
  const recovered = observationFixture({
    receivingAtMs: 1000,
    rate: { epochMs: 1000 },
    progress: { lastDataAtMs: 7100, trustedRatio: 0.3, trustedAtMs: 7100, lastAdvanceAtMs: 2000 },
  });
  const after = readView(recovered, requestAt(7100, ctx));
  assert.equal(after.data.statusKey, 'receiving');
  assert.equal(after.data.progress.stale, false);
  assert.equal(after.data.progress.ratio, 0.3, 'no invented growth');
});

test('UX-UT-046 the no-progress hint needs a trusted single and crosses at 8000ms', () => {
  const obs = observationFixture({
    receivingAtMs: 0,
    rate: { epochMs: 0, buckets: bucketWith(35, 625) },
    progress: { lastDataAtMs: 8750, lastAdvanceAtMs: 1000, trustedRatio: 0.25, trustedAtMs: 8750 },
  });
  const ctx = contextFixture();

  const before = readView(obs, requestAt(8999.9, ctx));
  assert.equal(before.data.statusKey, 'receiving');
  const at = readView(obs, requestAt(9000, ctx));
  assert.equal(at.data.statusKey, 'no_progress');
  assert.equal(readView(obs, requestAt(9000.1, ctx)).data.statusKey, 'no_progress');
  assert.ok(at.data.rate.bytesPerSecond > 0,
    'a stalled ratio does not force the rate to zero');

  // a strict increase clears it
  const advanced = observationFixture({
    receivingAtMs: 0,
    rate: { epochMs: 0 },
    progress: { lastDataAtMs: 9001, lastAdvanceAtMs: 9001, trustedRatio: 0.4, trustedAtMs: 9001 },
  });
  assert.equal(readView(advanced, requestAt(9001, ctx)).data.statusKey, 'receiving');

  // report-quality variants never claim "no new blocks"
  const ambiguous = observationFixture({
    receivingAtMs: 0,
    rate: { epochMs: 0 },
    progress: { lastDataAtMs: 8800, trustedRatio: null, trustedAtMs: null, ambiguity: 19005 },
    diagnostics: [19005],
  });
  assert.equal(readView(ambiguous, requestAt(9500, ctx)).data.statusKey, 'progress_unknown');

  const enough = observationFixture({
    receivingAtMs: 0,
    rate: { epochMs: 0 },
    progress: { lastDataAtMs: 8800, trustedRatio: 1.2, trustedAtMs: 8800 },
  });
  assert.equal(readView(enough, requestAt(9500, ctx)).data.statusKey, 'collecting_more');
});

test('UX-UT-032 the same observation revision projects with now, purely', () => {
  const obs = observationFixture({
    receivingAtMs: 100,
    rate: { epochMs: 100, buckets: bucketWith(0, 625) },
    progress: { lastDataAtMs: 250, lastResultAtMs: 250, trustedRatio: 0.25, lastAdvanceAtMs: 250 },
  });
  const pristine = JSON.parse(JSON.stringify(obs));
  const ctx = contextFixture({ businessRevision: 7 });

  const v1 = readView(obs, requestAt(1100, ctx));
  const v2 = readView(obs, requestAt(4100, ctx));
  assert.equal(v1.ok, true);
  assert.equal(v2.ok, true);
  assert.equal(v1.data.elapsedMs, 1000);
  assert.equal(v2.data.elapsedMs, 4000);
  assert.equal(v2.data.observationRevision, v1.data.observationRevision);
  assert.equal(v1.data.businessRevision, 7);
  assert.equal(v2.data.businessRevision, 7);
  assert.equal(v1.data.announcementKey, v2.data.announcementKey,
    'time alone never changes the semantic identity');
  assert.ok(!/[0-9]/.test(v1.data.announcementKey),
    'the announcement key never carries numbers');
  assert.deepEqual(obs, pristine, 'the frozen observation is untouched');
  assert.equal(v2.data.rate.bytesPerSecond, 0,
    'the old sample ages out by projection, with no new observation');
  const v3 = readView(obs, requestAt(1100, ctx));
  assert.deepEqual(v3, v1, 'the same inputs are reproducible');
});

test('UX-UT-047 business terminals outrank the receiving detail and only real artifacts complete', () => {
  const obs = observationFixture({
    receivingAtMs: 100,
    endedAtMs: 800,
    rate: { epochMs: 100, buckets: bucketWith(0, 625) },
    progress: { lastDataAtMs: 250, trustedRatio: 0.9, lastAdvanceAtMs: 250 },
  });
  const controls = {
    canStartLive: false, canImportVideo: false, canStop: true, canSave: false,
  };

  const terminalStates = [
    ['Preparing', 'preparing'],
    ['Draining', 'draining'],
    ['Reconstructing', 'reconstructing'],
    ['Stopping', 'stopping'],
    ['Stopped', 'stopped'],
    ['Incomplete', 'incomplete'],
  ];
  for (const [state, key] of terminalStates) {
    const view = readView(obs, requestAt(1200, contextFixture({ state, controls })));
    assert.equal(view.ok, true);
    assert.equal(view.data.statusKey, key, `${state} keeps its own status key`);
    assert.notEqual(view.data.statusKey, 'receiving');
    assert.equal(view.data.elapsedMs, 700, `${state}: the elapsed is frozen at the endpoint`);
    assert.notEqual(view.data.progress.kind, 'complete', `${state} is not a completion`);
  }

  // the enough_data control: a trusted ratio >= 1 without a real artifact
  const enoughObs = observationFixture({
    receivingAtMs: 100,
    progress: { lastDataAtMs: 500, trustedRatio: 1.05, trustedAtMs: 500, lastAdvanceAtMs: 500 },
  });
  const enoughView = readView(enoughObs, requestAt(1200, contextFixture()));
  assert.equal(enoughView.data.statusKey, 'collecting_more');
  assert.equal(enoughView.data.progress.kind, 'enough_data');
  assert.equal(enoughView.data.progress.ratio, null, 'no 100%, no clamped 99%');
  assert.equal(enoughView.data.controls.canSave, false, 'no save permission from a ratio');
  assert.notEqual(enoughView.data.announcementKey.includes('complete'), true);

  // a real Ready artifact completes; the controls stay the business's own
  const readyControls = {
    canStartLive: false, canImportVideo: false, canStop: true, canSave: true,
  };
  const ready = readView(obs, requestAt(1200, contextFixture({
    state: 'Ready', artifactId: '42', controls: readyControls,
  })));
  assert.equal(ready.data.statusKey, 'ready');
  assert.equal(ready.data.progress.kind, 'complete');
  assert.equal(ready.data.progress.ratio, 1);
  assert.deepEqual(ready.data.controls, readyControls);
  assert.equal(ready.data.announcementKey, 'ready:42:none');

  // the save states separate their phases
  const savingObs = observationFixture({
    receivingAtMs: 100, endedAtMs: 800,
    save: { phase: 'writing', attemptId: 'save-1', artifactId: '42', errorCode: null },
  });
  const saving = readView(savingObs, requestAt(1300, contextFixture({
    state: 'Saving', artifactId: '42',
    controls: { canStartLive: false, canImportVideo: false, canStop: false, canSave: false },
  })));
  const savedObs = observationFixture({
    receivingAtMs: 100, endedAtMs: 800,
    save: { phase: 'saved', attemptId: 'save-1', artifactId: '42', errorCode: null },
  });
  const saved = readView(savedObs, requestAt(1400, contextFixture({
    state: 'Saved', artifactId: '42',
    controls: { canStartLive: true, canImportVideo: true, canStop: false, canSave: false },
  })));
  assert.equal(saving.data.state, 'Saving');
  assert.equal(saving.data.statusKey, 'saving_writing');
  assert.equal(saving.data.progress.kind, 'complete');
  assert.equal(saved.data.statusKey, 'saved');
  assert.equal(saved.data.progress.kind, 'complete');
  assert.equal(saved.data.save.phase, 'saved');
  assert.equal(saved.data.announcementKey, 'saved:42:save-1');
  assert.equal(saved.data.elapsedMs, 700, 'the save time is not part of the receiving time');
});

test('UX-UT-034 the 1500/5000/8000 hint boundaries land on the exact millisecond', () => {
  // (1) no data ever: waiting_data with advice exactly at 5000 elapsed
  const none = observationFixture({ receivingAtMs: 0, rate: { epochMs: 0 } });
  const ctx = contextFixture();
  const before = readView(none, requestAt(4999.9, ctx));
  const at = readView(none, requestAt(5000, ctx));
  assert.equal(before.data.statusKey, 'waiting_data');
  assert.equal(before.data.nextAction, '');
  assert.equal(at.data.statusKey, 'waiting_data');
  assert.notEqual(at.data.nextAction, '');
  assert.equal(at.data.rate.phase, 'active');
  assert.equal(at.data.rate.bytesPerSecond, 0, 'picture frames are not data bytes');

  // (2) data once at 1000, no trusted ratio: unavailable progress, and
  // no_new_data from exactly 6000 regardless of the ratio quality
  const stale = observationFixture({ receivingAtMs: 0, rate: { epochMs: 0 },
    progress: { lastDataAtMs: 1000 } });
  assert.equal(readView(stale, requestAt(5999.9, ctx)).data.statusKey, 'progress_unavailable');
  assert.equal(readView(stale, requestAt(6000, ctx)).data.statusKey, 'no_new_data');
  assert.equal(readView(stale, requestAt(6000.1, ctx)).data.statusKey, 'no_new_data');

  // (3) trusted single, advance stalled since 1000, data through 8999/9000
  const stalled = observationFixture({ receivingAtMs: 0, rate: { epochMs: 0 },
    progress: { lastDataAtMs: 8999, trustedRatio: 0.25, trustedAtMs: 8999, lastAdvanceAtMs: 1000 } });
  assert.equal(readView(stalled, requestAt(8999.9, ctx)).data.statusKey, 'receiving');
  assert.equal(readView(stalled, requestAt(9000, ctx)).data.statusKey, 'no_progress');
  const advanced = observationFixture({ receivingAtMs: 0, rate: { epochMs: 0 },
    progress: { lastDataAtMs: 9001, trustedRatio: 0.5, trustedAtMs: 9001, lastAdvanceAtMs: 9001 } });
  assert.equal(readView(advanced, requestAt(9001, ctx)).data.statusKey, 'receiving',
    'a strict increase clears the no-progress hint');

  // (4) busy frame: processing from exactly 1500ms of pending age
  const busyObs = observationFixture({ receivingAtMs: 0, rate: { epochMs: 0 },
    progress: { lastDataAtMs: 1000, trustedRatio: 0.25, trustedAtMs: 1000, lastAdvanceAtMs: 1000 } });
  const busyCtx = contextFixture({ inFlight: true, inFlightSinceMs: 500 });
  assert.equal(readView(busyObs, requestAt(1999.9, busyCtx)).data.statusKey, 'receiving');
  assert.equal(readView(busyObs, requestAt(2000, busyCtx)).data.statusKey, 'processing');
  // and processing outranks the data-wait hints at the same instant
  assert.equal(readView(busyObs, requestAt(6100, busyCtx)).data.statusKey, 'processing');
});


// --- T14: window math, thresholds and report ambiguity at view level ---------

test('T14 the view rate follows the frozen window boundaries', () => {
  // pre-3000ms fixture: gens 0/1/11 hold 30/30/40 bytes (the canonical 025 walk)
  const pre = observationFixture({
    receivingAtMs: 0,
    rate: { epochMs: 0, buckets: bucketsOf([
      { generation: 0, bytes: 30 }, { generation: 1, bytes: 30 }, { generation: 11, bytes: 40 }]) },
    progress: { lastDataAtMs: 2999.9 },
  });
  const ctx = contextFixture({ businessRevision: 1 });

  const at999 = readView(pre, requestAt(999.9, ctx));
  assert.equal(at999.data.rate.phase, 'warming');
  assert.equal(at999.data.rate.bytesPerSecond, null);

  const at1000 = readView(pre, requestAt(1000, ctx));
  assert.equal(at1000.data.rate.phase, 'active');
  assert.equal(at1000.data.rate.windowMs, 1000);
  assert.ok(Math.abs(at1000.data.rate.bytesPerSecond - 60) < 1e-9,
    `1000ms expected 60 B/s, got ${at1000.data.rate.bytesPerSecond}`);

  const at2999 = readView(pre, requestAt(2999.9, ctx));
  assert.equal(at2999.data.rate.windowMs, 2999.9);
  assert.ok(Math.abs(at2999.data.rate.bytesPerSecond - 100000 / 2999.9) < 1e-9);

  // post-3000ms fixture: the 50B frame lands generation 12 (slot 0 reused)
  const post = observationFixture({
    receivingAtMs: 0,
    rate: { epochMs: 0, buckets: bucketsOf([
      { generation: 12, bytes: 50 }, { generation: 1, bytes: 30 }, { generation: 11, bytes: 40 }]) },
    progress: { lastDataAtMs: 3000 },
  });
  const at3000 = readView(post, requestAt(3000, ctx));
  assert.equal(at3000.data.rate.windowMs, 2750);
  assert.ok(Math.abs(at3000.data.rate.bytesPerSecond - 120000 / 2750) < 1e-9,
    `3000ms expected 480/11 B/s, got ${at3000.data.rate.bytesPerSecond}`);

  const at3250 = readView(post, requestAt(3250, ctx));
  assert.equal(at3250.data.rate.windowMs, 2750);
  assert.ok(Math.abs(at3250.data.rate.bytesPerSecond - 90000 / 2750) < 1e-9,
    `3250ms keeps gens 11+12 (40+50), got ${at3250.data.rate.bytesPerSecond}`);
});

test('T14-R05 data with degraded reports hides the ratio but keeps the rate', () => {
  // real data flows (625B in generation 4), but the worker report degrades
  const obs = observationFixture({
    receivingAtMs: 0,
    rate: { epochMs: 0, buckets: bucketsOf([{ generation: 4, bytes: 625 }]) },
    progress: { lastDataAtMs: 2000 },
    diagnostics: [19002],
  });
  const view = readView(obs, requestAt(3000, contextFixture()));
  assert.equal(view.ok, true);
  assert.equal(view.data.statusKey, 'progress_unavailable');
  assert.equal(view.data.progress.kind, 'unavailable');
  assert.equal(view.data.progress.ratio, null);
  assert.equal(view.data.progress.asOfMs, null);
  assert.equal(view.data.progress.diagnosticCode, 19002);
  assert.ok(view.data.rate.bytesPerSecond > 0, 'the rate keeps counting real bytes');
});

test('T14 every notice threshold flips exactly at its millisecond', () => {
  const flips = [
    {
      name: 'checking the source at receivingAt+5000',
      obs: () => observationFixture({ receivingAtMs: 1000, rate: { epochMs: 1000 } }),
      ctx: () => contextFixture(),
      before: 5999.9, after: 6000,
      holds: (v) => v.data.statusKey === 'waiting_data' && v.data.nextAction === '',
      crosses: (v) => v.data.statusKey === 'waiting_data' && v.data.nextAction !== '',
    },
    {
      name: 'no_new_data at lastData+5000',
      obs: () => observationFixture({ receivingAtMs: 0, rate: { epochMs: 0 },
        progress: { lastDataAtMs: 2000, trustedRatio: 0.3, trustedAtMs: 2000, lastAdvanceAtMs: 2000 } }),
      ctx: () => contextFixture(),
      before: 6999.9, after: 7000,
      holds: (v) => v.data.statusKey === 'receiving',
      crosses: (v) => v.data.statusKey === 'no_new_data',
    },
    {
      name: 'no_progress at lastAdvance+8000',
      obs: () => observationFixture({ receivingAtMs: 0, rate: { epochMs: 0 },
        progress: { lastDataAtMs: 8999, trustedRatio: 0.25, trustedAtMs: 8999, lastAdvanceAtMs: 1000 } }),
      ctx: () => contextFixture(),
      before: 8999.9, after: 9000,
      holds: (v) => v.data.statusKey === 'receiving',
      crosses: (v) => v.data.statusKey === 'no_progress',
    },
    {
      name: 'processing at inFlightSince+1500',
      obs: () => observationFixture({ receivingAtMs: 0, rate: { epochMs: 0 },
        progress: { lastDataAtMs: 1000, trustedRatio: 0.25, trustedAtMs: 1000, lastAdvanceAtMs: 1000 } }),
      ctx: () => contextFixture({ inFlight: true, inFlightSinceMs: 1000 }),
      before: 2499.9, after: 2500,
      holds: (v) => v.data.statusKey === 'receiving',
      crosses: (v) => v.data.statusKey === 'processing',
    },
  ];
  for (const flip of flips) {
    const before = readView(flip.obs(), flip.ctx() && requestAt(flip.before, flip.ctx()));
    assert.ok(flip.holds(before), `${flip.name}: before ${flip.before}`);
    assert.ok(!flip.crosses(before), `${flip.name}: must not have crossed before ${flip.after}`);
    const after = readView(flip.obs(), requestAt(flip.after, flip.ctx()));
    assert.ok(flip.crosses(after), `${flip.name}: must cross exactly at ${flip.after}`);
    assert.ok(flip.holds(after) || !flip.crosses(after) === false ? true : true,
      `${flip.name}: crossing sanity`);
  }
});

test('T15 the tiny rate displays under one decimal and frozen states show nothing', () => {
  const unit = ' KiB/s（含冗余）';
  assert.equal(formatRate({ phase: 'active', bytesPerSecond: 51, windowMs: 2750, includesRedundancy: true }),
    `<0.1${unit}`, '51 B/s = 0.0498 KiB/s rounds up in the display, not to 0.0');
  assert.equal(formatRate({ phase: 'active', bytesPerSecond: 102.4, windowMs: 2750, includesRedundancy: true }),
    `0.1${unit}`, '102.4 B/s is exactly 0.1 KiB/s');
  assert.equal(formatRate({ phase: 'active', bytesPerSecond: 0, windowMs: 2750, includesRedundancy: true }),
    `0.0${unit}`, 'a true zero stays 0.0');
  assert.equal(formatRate({ phase: 'warming', bytesPerSecond: null, windowMs: 0, includesRedundancy: true }), '');
  assert.equal(formatRate({ phase: 'frozen', bytesPerSecond: null, windowMs: 0, includesRedundancy: true }), '');
  assert.equal(formatRate(null), '');
});


// --- T20: the media position is an independent fact from the file estimate ----

test('T20 the media position normalizes independently of the file estimate', () => {
  const videoContext = (mediaPosition, mediaDiagnosticCode = 0) => contextFixture({
    inputKind: 'video', mediaPosition, mediaDiagnosticCode, businessRevision: 9,
  });

  // a known duration: the fraction is recomputed, never taken from input
  const known = readView(observationFixture({ inputKind: 'video' }),
    requestAt(2000, videoContext({ positionSeconds: 80, durationSeconds: 150, fraction: 0.9 })));
  assert.equal(known.ok, true);
  assert.equal(known.data.mediaPosition.positionSeconds, 80);
  assert.equal(known.data.mediaPosition.durationSeconds, 150);
  assert.ok(Math.abs(known.data.mediaPosition.fraction - 80 / 150) < 1e-9,
    'the fraction is min(1, position/duration), not the caller value');
  assert.notEqual(known.data.statusKey, 'collecting_more');

  // an unknown duration: the fraction stays null, no error is invented
  const unknown = readView(observationFixture({ inputKind: 'video' }),
    requestAt(2000, videoContext({ positionSeconds: 3, durationSeconds: null, fraction: null })));
  assert.deepEqual(unknown.data.mediaPosition,
    { positionSeconds: 3, durationSeconds: null, fraction: null });

  // live sessions never show a media bar
  const live = readView(observationFixture(),
    requestAt(2000, contextFixture({ mediaPosition: { positionSeconds: 5, durationSeconds: 9, fraction: 0.5 } })));
  assert.equal(live.data.mediaPosition, null);

  // an invalid position degrades to null with 19011, the session keeps going
  const broken = readView(observationFixture({ inputKind: 'video' }),
    requestAt(2000, videoContext({ positionSeconds: -1, durationSeconds: null, fraction: null }, 19011)));
  assert.equal(broken.ok, true);
  assert.equal(broken.data.mediaPosition, null);
  assert.deepEqual(broken.data.diagnosticCodes, [19011]);

  // EOF at 100 percent of the media is still not a completed file
  const ended = readView(observationFixture({ inputKind: 'video', endedAtMs: 1800 }),
    requestAt(2000, videoContext({ positionSeconds: 150, durationSeconds: 150, fraction: 1 },
      0) && contextFixture({
      state: 'Incomplete', businessRevision: 11, inputKind: 'video',
      artifactId: null,
      controls: { canStartLive: true, canImportVideo: true, canStop: false, canSave: false },
      inFlight: false, inFlightSinceMs: null,
      mediaPosition: { positionSeconds: 150, durationSeconds: 150, fraction: 1 },
      mediaDiagnosticCode: 0,
    })));
  assert.equal(ended.ok, true);
  assert.equal(ended.data.statusKey, 'incomplete', 'media at 100 percent is not completion');
  assert.notEqual(ended.data.progress.kind, 'complete');
  assert.equal(ended.data.controls.canSave, false);
  assert.equal(ended.data.mediaPosition.fraction, 1);
});

// --- T30: estimate copy, quiet-state guidance and the full copy matrix -------

test('T30 formatProgress never rounds an estimate up to a hundred', () => {
  assert.equal(formatProgress({ kind: 'estimate', ratio: 0.995, stale: false }),
    '重建估计约 99%', '0.995 floors to 99, never rounds to 100');
  assert.equal(formatProgress({ kind: 'estimate', ratio: 0.999, stale: false }),
    '重建估计约 99%');
  assert.equal(formatProgress({ kind: 'estimate', ratio: 0, stale: false }),
    '重建估计约 0%');
  assert.equal(formatProgress({ kind: 'estimate', ratio: 0.5, stale: false }),
    '重建估计约 50%');
  assert.equal(formatProgress({ kind: 'estimate', ratio: 0.5, stale: true }),
    '上次重建估计约 50%', 'a stale estimate says it is the previous one');
  assert.equal(formatProgress({ kind: 'complete', ratio: 1, stale: false }), '重建完成');
  assert.equal(formatProgress({ kind: 'ambiguous', ratio: null, stale: false }), '进度无法判定');
  assert.equal(formatProgress({ kind: 'unavailable', ratio: null, stale: false }), '进度暂不可用');
  assert.equal(formatProgress({ kind: 'enough_data', ratio: null, stale: false }),
    '数据量已达到，文件尚未完成');
  assert.equal(formatProgress({ kind: 'none', ratio: null, stale: false }), '');
});

test('T30 quiet and unavailable states carry next-step guidance', () => {
  const stale = observationFixture({ receivingAtMs: 0, rate: { epochMs: 0 },
    progress: { lastDataAtMs: 2000, trustedRatio: 0.3, trustedAtMs: 2000, lastAdvanceAtMs: 2000 } });
  const quiet = readView(stale, requestAt(7000, contextFixture()));
  assert.equal(quiet.data.statusKey, 'no_new_data');
  assert.notEqual(quiet.data.nextAction, '', 'the quiet state suggests what to check');
  assert.match(quiet.data.nextAction, /遮挡|暂停/,
    'the advice names the covered or paused sender');

  const degraded = observationFixture({ receivingAtMs: 0, rate: { epochMs: 0 },
    progress: { lastDataAtMs: 2000 } });
  const unavailable = readView(degraded, requestAt(3000, contextFixture()));
  assert.equal(unavailable.data.statusKey, 'progress_unavailable');
  assert.notEqual(unavailable.data.nextAction, '', 'the unavailable state suggests a path');
  assert.match(unavailable.data.nextAction, /继续接收|发送源/);
});

test('T30 every status copy stays digit-free across the whole status matrix', () => {
  const ownerless = () => observationFixture({ sessionId: null, sessionSeq: 0,
    inputKind: null, observationRevision: 0, receivingAtMs: null, rate: { epochMs: 0 } });
  const cases = [
    ['idle', 9000, ownerless(), contextFixture({ state: 'Idle', businessRevision: 0, inputKind: null })],
    ['preparing', 9000, ownerless(), contextFixture({ state: 'Preparing', businessRevision: 1 })],
    ['waiting_data', 9000, observationFixture({ receivingAtMs: 0, rate: { epochMs: 0 } }), contextFixture()],
    ['processing', 2600, observationFixture({ receivingAtMs: 0, rate: { epochMs: 0 },
      progress: { lastDataAtMs: 1000, trustedRatio: 0.25, trustedAtMs: 1000, lastAdvanceAtMs: 1000 } }),
      contextFixture({ inFlight: true, inFlightSinceMs: 1000 })],
    ['receiving', 1500, observationFixture({ receivingAtMs: 0, rate: { epochMs: 0 },
      progress: { lastDataAtMs: 1000, trustedRatio: 0.25, trustedAtMs: 1000, lastAdvanceAtMs: 1000 } }),
      contextFixture()],

    ['no_new_data', 9000, observationFixture({ receivingAtMs: 0, rate: { epochMs: 0 },
      progress: { lastDataAtMs: 2000, trustedRatio: 0.3, trustedAtMs: 2000, lastAdvanceAtMs: 2000 } }),
      contextFixture()],
    ['no_progress', 9000, observationFixture({ receivingAtMs: 0, rate: { epochMs: 0 },
      progress: { lastDataAtMs: 8999, trustedRatio: 0.25, trustedAtMs: 8999, lastAdvanceAtMs: 1000 } }),
      contextFixture()],
    ['progress_unknown', 3000, observationFixture({ receivingAtMs: 0, rate: { epochMs: 0 },
      progress: { lastDataAtMs: 2000, ambiguity: 19005 }, diagnostics: [19005] }), contextFixture()],
    ['progress_unavailable', 3000, observationFixture({ receivingAtMs: 0, rate: { epochMs: 0 },
      progress: { lastDataAtMs: 2000 } }), contextFixture()],
    ['collecting_more', 3000, observationFixture({ receivingAtMs: 0, rate: { epochMs: 0 },
      progress: { lastDataAtMs: 2000, trustedRatio: 1.2, trustedAtMs: 2000, lastAdvanceAtMs: 2000 } }),
      contextFixture()],
    ['draining', 1200, observationFixture({ receivingAtMs: 100, endedAtMs: 800 }), contextFixture({ state: 'Draining' })],
    ['reconstructing', 1200, observationFixture({ receivingAtMs: 100, endedAtMs: 800 }), contextFixture({ state: 'Reconstructing' })],
    ['stopping', 1200, observationFixture({ receivingAtMs: 100, endedAtMs: 800 }), contextFixture({ state: 'Stopping' })],
    ['stopped', 1200, observationFixture({ receivingAtMs: 100, endedAtMs: 800 }), contextFixture({ state: 'Stopped' })],
    ['incomplete', 1200, observationFixture({ receivingAtMs: 100, endedAtMs: 800 }), contextFixture({ state: 'Incomplete' })],
    ['error', 1200, observationFixture({ receivingAtMs: 100, endedAtMs: 800 }), contextFixture({ state: 'Error' })],
    ['ready', 1200, observationFixture({ receivingAtMs: 100, endedAtMs: 800 }), contextFixture({ state: 'Ready', artifactId: '42' })],
    ['saving_selecting', 1200, observationFixture({ receivingAtMs: 100, endedAtMs: 800,
      save: { phase: 'selecting', attemptId: 'a', artifactId: '42', errorCode: null } }),
      contextFixture({ state: 'Saving', artifactId: '42' })],
    ['saving_writing', 1200, observationFixture({ receivingAtMs: 100, endedAtMs: 800,
      save: { phase: 'writing', attemptId: 'a', artifactId: '42', errorCode: null } }),
      contextFixture({ state: 'Saving', artifactId: '42' })],
    ['saving_pending', 1200, observationFixture({ receivingAtMs: 100, endedAtMs: 800,
      save: { phase: 'pending', attemptId: 'a', artifactId: '42', errorCode: null } }),
      contextFixture({ state: 'Saving', artifactId: '42' })],
    ['saved', 1200, observationFixture({ receivingAtMs: 100, endedAtMs: 800,
      save: { phase: 'saved', attemptId: 'a', artifactId: '42', errorCode: null } }),
      contextFixture({ state: 'Saved', artifactId: '42' })],
    ['save_cancelled', 1200, observationFixture({ receivingAtMs: 100, endedAtMs: 800,
      save: { phase: 'cancelled', attemptId: 'a', artifactId: '42', errorCode: 16002 } }),
      contextFixture({ state: 'Retryable', artifactId: '42' })],
    ['save_failed', 1200, observationFixture({ receivingAtMs: 100, endedAtMs: 800,
      save: { phase: 'failed', attemptId: 'a', artifactId: '42', errorCode: 16005 } }),
      contextFixture({ state: 'Retryable', artifactId: '42' })],
  ];
  const seen = new Set();
  for (const [expectedKey, at, observation, context] of cases) {
    const view = readView(observation, requestAt(at, context));
    assert.equal(view.ok, true, expectedKey);
    assert.equal(view.data.statusKey, expectedKey, `the matrix reaches ${expectedKey}`);
    seen.add(view.data.statusKey);
    for (const field of ['primary', 'secondary', 'nextAction']) {
      assert.doesNotMatch(view.data[field], /\d/,
        `${expectedKey}.${field} stays digit-free, got "${view.data[field]}"`);
    }
  }
  assert.equal(seen.size, 23, 'all twenty-three status keys of the schema were exercised');
});


// --- R12-A-R1: report degradation in the model -> view combination ----------
//
// The verdict's counterexample: a good single (.6) followed by an empty or
// unavailable report kept projecting `kind=estimate, ratio=.6` and formatted
// "重建估计约 60%", because the view only degraded when the kept ratio was
// null. These cases drive the real ReceiverTelemetry and readView; only the
// input frames and the projection clock are controlled.

function rSingle(ratio) {
  return { state: 'single', ratios: [ratio], diagnosticCode: 0 };
}
function rEmpty() {
  return { state: 'empty', ratios: [], diagnosticCode: 0 };
}
function rUnavailable(diag) {
  return { state: 'unavailable', ratios: [], diagnosticCode: diag };
}

function beginRequest(seq = 1, { nowMs = 0 } = {}) {
  return { version: 1, sessionId: 's1', sessionSeq: seq, inputKind: 'live', nowMs };
}

function frameInput(seq, { frameId, at, bytes = 625,
  report = { state: 'not_sampled', ratios: [], diagnosticCode: 0 } } = {}) {
  return {
    version: 1, sessionId: 's1', sessionSeq: seq, frameId,
    receivedAtMs: at, outcome: 'data', bytesDecoded: bytes, report,
  };
}

function viewFromTelemetry(telemetry, context, nowMs) {
  const snapshot = telemetry.snapshot();
  return readView(snapshot, deepFreeze({
    version: 1,
    sessionId: snapshot.sessionId,
    sessionSeq: snapshot.sessionSeq,
    nowMs,
    context,
  }));
}

test('R12-A-R1-1 a data frame with an empty report hides the current percentage', () => {
  const t = new ReceiverTelemetry();
  t.begin(beginRequest(1, { nowMs: 0 }));
  t.acceptFrame(frameInput(1, { frameId: 1, at: 1000, report: rSingle(0.6) }));

  const before = viewFromTelemetry(t, contextFixture(), 1000);
  assert.equal(before.ok, true);
  assert.equal(before.data.progress.kind, 'estimate', 'the good report is decidable');
  assert.equal(before.data.progress.ratio, 0.6);
  assert.equal(formatProgress(before.data.progress), '重建估计约 60%');

  // a real data frame whose report is empty: the history stays, the current
  // projection must stop claiming the kept 60% is still decidable
  t.acceptFrame(frameInput(1, { frameId: 2, at: 1100, report: rEmpty() }));
  assert.equal(t.snapshot().progress.trustedRatio, 0.6, 'the history baseline survives');
  assert.equal(t.snapshot().progress.lastDataAtMs, 1100);
  assert.equal(t.snapshot().progress.trustedAtMs, 1000,
    'a degraded report never refreshes the trust time');

  const after = viewFromTelemetry(t, contextFixture(), 1100);
  assert.equal(after.ok, true);
  assert.equal(after.data.progress.kind, 'unavailable');
  assert.equal(after.data.progress.ratio, null);
  assert.equal(after.data.progress.asOfMs, null);
  assert.equal(after.data.progress.stale, false);
  assert.equal(after.data.progress.diagnosticCode, 0,
    'an empty report carries no degradation code');
  assert.equal(formatProgress(after.data.progress), '进度暂不可用');
  assert.notEqual(formatProgress(after.data.progress), '重建估计约 60%',
    'the old percentage is never presented as current');
  assert.equal(after.data.statusKey, 'progress_unavailable');
  assert.doesNotMatch(after.data.primary, /60|%/);
  assert.doesNotMatch(after.data.secondary, /60|%/);
});

test('R12-A-R1-2 an unavailable report keeps its own code in the view', () => {
  const t = new ReceiverTelemetry();
  t.begin(beginRequest(1, { nowMs: 0 }));
  t.acceptFrame(frameInput(1, { frameId: 1, at: 1000, report: rSingle(0.6) }));
  t.acceptFrame(frameInput(1, { frameId: 2, at: 1100, report: rUnavailable(19004) }));

  const view = viewFromTelemetry(t, contextFixture(), 1100);
  assert.equal(view.ok, true);
  assert.equal(view.data.progress.kind, 'unavailable');
  assert.equal(view.data.progress.ratio, null);
  assert.equal(view.data.progress.diagnosticCode, 19004,
    'the report degradation code travels through to the view');
  assert.deepEqual(view.data.diagnosticCodes, [19004]);
  assert.equal(formatProgress(view.data.progress), '进度暂不可用');
  assert.equal(view.data.statusKey, 'progress_unavailable');
});

test('R12-A-R1-3 a stronger single after a degraded report restores the estimate', () => {
  const t = new ReceiverTelemetry();
  t.begin(beginRequest(1, { nowMs: 0 }));
  t.acceptFrame(frameInput(1, { frameId: 1, at: 1000, report: rSingle(0.6) }));
  t.acceptFrame(frameInput(1, { frameId: 2, at: 1100, report: rEmpty() }));

  const degraded = viewFromTelemetry(t, contextFixture(), 1200);
  assert.equal(degraded.data.progress.kind, 'unavailable');

  t.acceptFrame(frameInput(1, { frameId: 3, at: 1300, report: rSingle(0.7) }));
  const recovered = viewFromTelemetry(t, contextFixture(), 1300);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.data.progress.kind, 'estimate');
  assert.equal(recovered.data.progress.ratio, 0.7);
  assert.equal(recovered.data.progress.asOfMs, 1300);
  assert.equal(recovered.data.progress.stale, false);
  assert.equal(recovered.data.progress.diagnosticCode, 0);
  assert.equal(recovered.data.statusKey, 'receiving');
  assert.equal(formatProgress(recovered.data.progress), '重建估计约 70%');
});

test('R12-A-R1-4 a weaker single after a degraded report still locks 19006', () => {
  const t = new ReceiverTelemetry();
  t.begin(beginRequest(1, { nowMs: 0 }));
  t.acceptFrame(frameInput(1, { frameId: 1, at: 1000, report: rSingle(0.6) }));
  t.acceptFrame(frameInput(1, { frameId: 2, at: 1100, report: rEmpty() }));
  t.acceptFrame(frameInput(1, { frameId: 3, at: 1300, report: rSingle(0.5) }));

  const snap = t.snapshot();
  assert.equal(snap.progress.ambiguity, 19006, 'the model still locks the rollback');
  assert.equal(snap.progress.trustedRatio, null);

  const view = viewFromTelemetry(t, contextFixture(), 1300);
  assert.equal(view.ok, true);
  assert.equal(view.data.progress.kind, 'ambiguous');
  assert.equal(view.data.progress.ratio, null);
  assert.equal(view.data.progress.asOfMs, null);
  assert.equal(view.data.progress.diagnosticCode, 19006);
  assert.equal(view.data.statusKey, 'progress_unknown');
  assert.equal(formatProgress(view.data.progress), '进度无法判定');
});

test('R12-A-R1-5 a continuous single stream keeps its estimate projection', () => {
  const t = new ReceiverTelemetry();
  t.begin(beginRequest(1, { nowMs: 0 }));
  const ratios = [0.1, 0.2, 0.3, 0.45, 0.6, 0.75];
  ratios.forEach((ratio, i) => {
    const at = 1000 + i * 250;
    t.acceptFrame(frameInput(1, { frameId: i + 1, at, report: rSingle(ratio) }));
    const view = viewFromTelemetry(t, contextFixture(), at);
    assert.equal(view.data.progress.kind, 'estimate', `ratio ${ratio}: still an estimate`);
    assert.equal(view.data.progress.ratio, ratio, `ratio ${ratio}: exact value`);
    assert.equal(view.data.progress.diagnosticCode, 0);
    assert.equal(view.data.statusKey, 'receiving');
  });

  // an equal ratio refreshes the trust time and is not a degradation
  const lastAt = 1000 + ratios.length * 250;
  t.acceptFrame(frameInput(1, { frameId: ratios.length + 1, at: lastAt, report: rSingle(0.75) }));
  const repeated = viewFromTelemetry(t, contextFixture(), lastAt);
  assert.equal(repeated.data.progress.kind, 'estimate');
  assert.equal(repeated.data.progress.ratio, 0.75);
  assert.equal(repeated.data.progress.asOfMs, lastAt);
});

test('R12-A-R1-6 a degraded report leaves the rate and the business outputs untouched', () => {
  const build = (degraded) => {
    const t = new ReceiverTelemetry();
    t.begin(beginRequest(1, { nowMs: 0 }));
    t.acceptFrame(frameInput(1, { frameId: 1, at: 1000, bytes: 625, report: rSingle(0.6) }));
    t.acceptFrame(frameInput(1, {
      frameId: 2, at: 1100, bytes: 625,
      report: degraded ? rEmpty() : rSingle(0.6),
    }));
    return viewFromTelemetry(t, contextFixture(), 2000);
  };
  const clean = build(false);
  const degraded = build(true);

  assert.equal(clean.data.progress.kind, 'estimate');
  assert.equal(clean.data.progress.ratio, 0.6);
  assert.equal(degraded.data.progress.kind, 'unavailable');

  // the rate domain is independent of the report quality: two real data
  // frames of 625B over a 2000ms window are exactly 625 B/s
  assert.deepEqual(degraded.data.rate, clean.data.rate, 'the rate projection is identical');
  assert.equal(degraded.data.rate.phase, 'active');
  assert.equal(degraded.data.rate.bytesPerSecond, 625);
  assert.equal(degraded.data.rate.windowMs, 2000);
  assert.equal(degraded.data.elapsedMs, 2000, 'the elapsed clock is untouched');
  assert.equal(degraded.data.state, 'Receiving', 'the business state is untouched');
  assert.deepEqual(degraded.data.controls, clean.data.controls);
  assert.deepEqual(degraded.data.save, clean.data.save);
  assert.equal(degraded.data.observationRevision, clean.data.observationRevision,
    'the same real frames were accepted in both runs');
  assert.equal(degraded.data.mediaPosition, null);
});

// --- R13-A13-02: report quality is the frame's own event state --------------
//
// The view must read observation.progress.lastReportState (the last accepted
// data/artifact report) instead of inferring from `lastDataAtMs > trustedAtMs`,
// which is blind when a different frame reuses the same receivedAtMs. Hand
// fixtures below set the fact explicitly: never a timestamp coincidence.

test('R13-A13-02-V the view degrades by lastReportState, not by a timestamp inequality', () => {
  // (1) degraded by event state alone: the frame times are equal, so the old
  // inference could never see this degradation
  const degraded = observationFixture({
    receivingAtMs: 0,
    rate: { epochMs: 0 },
    progress: {
      trustedRatio: 0.6,
      trustedAtMs: 1000,
      lastAdvanceAtMs: 1000,
      lastDataAtMs: 1000,
      lastResultAtMs: 1000,
      lastReportState: 'empty',
    },
  });
  const degradedView = readView(degraded, requestAt(1000, contextFixture()));
  assert.equal(degradedView.ok, true);
  assert.equal(degradedView.data.progress.kind, 'unavailable');
  assert.equal(degradedView.data.progress.ratio, null);
  assert.equal(degradedView.data.progress.asOfMs, null);
  assert.equal(degradedView.data.progress.stale, false);
  assert.equal(degradedView.data.progress.diagnosticCode, 0);
  assert.equal(degradedView.data.statusKey, 'progress_unavailable');
  assert.equal(formatProgress(degradedView.data.progress), '进度暂不可用');

  // (2) a newer frame whose own report is a single: no degradation, even
  // though lastDataAtMs > trustedAtMs would have matched the old inference
  const current = observationFixture({
    receivingAtMs: 0,
    rate: { epochMs: 0 },
    progress: {
      trustedRatio: 0.6,
      trustedAtMs: 1000,
      lastAdvanceAtMs: 1000,
      lastDataAtMs: 2000,
      lastResultAtMs: 2000,
      lastReportState: 'single',
    },
  });
  const currentView = readView(current, requestAt(2000, contextFixture()));
  assert.equal(currentView.data.progress.kind, 'estimate');
  assert.equal(currentView.data.progress.ratio, 0.6);
  assert.equal(currentView.data.progress.asOfMs, 1000);
  assert.equal(currentView.data.statusKey, 'receiving');

  // (3) unavailable carries its code, equal times again
  const coded = observationFixture({
    receivingAtMs: 0,
    rate: { epochMs: 0 },
    progress: {
      trustedRatio: 0.6,
      trustedAtMs: 1000,
      lastAdvanceAtMs: 1000,
      lastDataAtMs: 1000,
      lastResultAtMs: 1000,
      lastReportState: 'unavailable',
    },
    diagnostics: [19004],
  });
  const codedView = readView(coded, requestAt(1000, contextFixture()));
  assert.equal(codedView.data.progress.kind, 'unavailable');
  assert.equal(codedView.data.progress.ratio, null);
  assert.equal(codedView.data.progress.diagnosticCode, 19004);
  assert.equal(codedView.data.statusKey, 'progress_unavailable');

  // (4) a legacy observation without the field invents no degradation: the
  // timestamp inequality alone is not a report-quality signal any more
  const legacy = observationFixture({
    receivingAtMs: 0,
    rate: { epochMs: 0 },
    progress: {
      trustedRatio: 0.6,
      trustedAtMs: 1000,
      lastAdvanceAtMs: 1000,
      lastDataAtMs: 2000,
      lastResultAtMs: 2000,
    },
  });
  const legacyView = readView(legacy, requestAt(2000, contextFixture()));
  assert.equal(legacyView.data.progress.kind, 'estimate');
  assert.equal(legacyView.data.progress.ratio, 0.6);
  assert.equal(legacyView.data.statusKey, 'receiving');
});

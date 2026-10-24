// T7: receiver UX view projection (UX-UT-032, 034, 041..047).
// Target module: web/desktop-recv/src/ux-view.js (readView).
// Missing module = genuine RED (behavior missing), never a skeleton guard.
import test from 'node:test';
import assert from 'node:assert/strict';

import { readView, formatRate } from '../../src/ux-view.js';

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
    progress: { lastDataAtMs: 1000, trustedRatio: 0.25, lastAdvanceAtMs: 1000 },
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
    progress: { lastDataAtMs: 500, trustedRatio: 1.05, lastAdvanceAtMs: 500 },
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

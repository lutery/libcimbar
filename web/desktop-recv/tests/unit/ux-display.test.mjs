// T9: receiver UX display lifecycle (UX-UT-048..052), migrated from the
// stage-4.5 skeleton with real assertions. Target module:
// web/desktop-recv/src/ux-display.js. Missing module = genuine RED.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createUxDisplay } from '../../src/ux-display.js';

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

function observation(overrides = {}) {
  const base = {
    version: 1,
    sessionId: 's1',
    sessionSeq: 1,
    inputKind: 'live',
    observationRevision: 2,
    receivingAtMs: 1000,
    endedAtMs: null,
    rate: { epochMs: 1000, buckets: emptyBuckets() },
    progress: {
      trustedRatio: null,
      trustedAtMs: null,
      lastAdvanceAtMs: null,
      lastDataAtMs: null,
      lastResultAtMs: null,
      ambiguity: null,
    },
    save: { phase: 'none', attemptId: null, artifactId: null, errorCode: null },
    diagnostics: [],
  };
  return deepFreeze({
    ...base,
    progress: overrides.progress ? { ...base.progress, ...overrides.progress } : base.progress,
    rate: overrides.rate ? { ...base.rate, ...overrides.rate } : base.rate,
    ...stripNested(overrides),
  });
}

function stripNested(overrides) {
  const { progress, rate, ...rest } = overrides;
  return rest;
}

function context(overrides = {}) {
  return deepFreeze({
    state: 'Receiving',
    businessRevision: 3,
    inputKind: 'live',
    cleanupComplete: true,
    artifactId: null,
    controls: { canStartLive: false, canImportVideo: false, canStop: true, canSave: false },
    inFlight: false,
    inFlightSinceMs: null,
    mediaPosition: null,
    mediaDiagnosticCode: 0,
    ...overrides,
  });
}

function makeDisplay({ current, clock, paint, timers }) {
  return createUxDisplay({
    readCurrent: () => current.value,
    nowMs: () => clock.now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    paint,
  });
}

function fakeTimers() {
  let nextId = 0;
  const pending = new Map();
  const calls = { set: 0, clear: 0 };
  return {
    calls,
    setTimer(fn) {
      calls.set += 1;
      nextId += 1;
      pending.set(nextId, fn);
      return nextId;
    },
    clearTimer(id) {
      calls.clear += 1;
      pending.delete(id);
    },
    size: () => pending.size,
    lastId: () => nextId,
    fire(id) {
      const fn = pending.get(id);
      pending.delete(id);
      if (fn) fn();
    },
    fireLast() {
      const id = nextId;
      this.fire(id);
    },
    callback(id) {
      return pending.get(id);
    },
  };
}

function paintRecorder() {
  const calls = [];
  let throwCount = 0;
  const paint = (payload) => {
    calls.push(payload);
    if (throwCount > 0) {
      throwCount -= 1;
      throw new Error('paint exploded');
    }
  };
  const isTelemetry = (call) => 'elapsedText' in call || 'rateText' in call
    || 'progressText' in call || 'mediaText' in call;
  return {
    paint,
    calls,
    throwNext(times = 1) { throwCount = times; },
    telemetry: () => calls.filter(isTelemetry),
    announcements: () => calls.filter((call) => 'announcement' in call),
    business: () => calls.filter((call) => 'primary' in call || 'secondary' in call
      || 'nextAction' in call || 'save' in call || 'diagnostics' in call),
  };
}

test('UX-UT-048 the same revision advances elapsed by the clock without new announcements', () => {
  const clock = { now: 2000 };
  const current = { value: {
    owner: { sessionId: 's1', sessionSeq: 1 },
    observation: observation({}),
    context: context(),
  } };
  const timers = fakeTimers();
  const spy = paintRecorder();
  const display = makeDisplay({ current, clock, paint: spy.paint, timers });

  display.syncBusiness();
  assert.ok(spy.announcements().length === 1, 'the first projection announces once');
  assert.equal(spy.telemetry().length, 1);
  assert.equal(spy.telemetry()[0].elapsedMs, 1000, 'elapsed 2000-1000');

  // no snapshot events: only the display clock moves 2000 -> 3000
  clock.now = 2500;
  timers.fireLast();
  clock.now = 3000;
  timers.fireLast();
  const writes = spy.telemetry();
  assert.equal(writes.length, 3, 'one write per projection');
  assert.equal(writes[2].elapsedMs - writes[0].elapsedMs, 1000,
    'elapsed advances by the clock alone');
  assert.equal(spy.announcements().length, 1,
    'the same announcementKey never re-enters the live region');

  // a genuine artifact at 3500 freezes the receiving time
  clock.now = 3500;
  current.value = {
    owner: { sessionId: 's1', sessionSeq: 1 },
    observation: observation({ endedAtMs: 3500 }),
    context: context({ state: 'Ready', artifactId: '42',
      controls: { canStartLive: false, canImportVideo: false, canStop: true, canSave: true } }),
  };
  display.syncBusiness();
  const lastElapsed = [...spy.telemetry()].pop();
  assert.equal(lastElapsed.elapsedMs, 2500, '3500-1000, frozen at the artifact');
  assert.equal(spy.announcements().length, 2, 'the ready key is a new semantic identity');
  assert.equal(timers.size(), 0, 'the receiving timer stops at the terminal');

  clock.now = 4000;
  current.value = {
    owner: { sessionId: 's1', sessionSeq: 1 },
    observation: observation({ endedAtMs: 3500,
      save: { phase: 'writing', attemptId: 'save-1', artifactId: '42', errorCode: null } }),
    context: context({ state: 'Saving', artifactId: '42',
      controls: { canStartLive: false, canImportVideo: false, canStop: false, canSave: false } }),
  };
  display.syncBusiness();
  const afterSaving = [...spy.telemetry()].pop();
  assert.equal(afterSaving.elapsedMs, 2500, 'the save time is not receiving time');

  // Preparing that never began keeps elapsed null
  clock.now = 4200;
  current.value = {
    owner: { sessionId: 's1', sessionSeq: 2 },
    observation: observation({ sessionId: null, sessionSeq: 0, inputKind: null,
      observationRevision: 0, receivingAtMs: null }),
    context: context({ state: 'Preparing', businessRevision: 0 }),
  };
  display.syncBusiness();
  const preparing = [...spy.telemetry()].pop();
  assert.equal(preparing.elapsedMs, null, 'no begin, no elapsed');
});

test('UX-UT-049 events and ticks share one 250ms throttle while business stays immediate', () => {
  // track A: 100Hz business notifications plus the 250ms clock, all Receiving
  const clock = { now: 0 };
  const current = { value: {
    owner: { sessionId: 's1', sessionSeq: 1 },
    observation: observation({ receivingAtMs: 0, rate: { epochMs: 0 } }),
    context: context(),
  } };
  const timers = fakeTimers();
  const spy = paintRecorder();
  const display = makeDisplay({ current, clock, paint: spy.paint, timers });

  display.syncBusiness(); // t=0 baseline write
  for (let t = 10; t < 1000; t += 10) {
    clock.now = t;
    display.syncBusiness(); // 100Hz business notification
    if (t % 250 === 0) timers.fireLast(); // the 250ms display clock
  }
  const writes = spy.telemetry().map((call) => call.elapsedMs);
  assert.ok(writes.length >= 4, 'values keep changing so writes are real');
  for (let i = 1; i < writes.length; i += 1) {
    assert.ok(writes[i] - writes[i - 1] >= 250 - 1e-9,
      `adjacent telemetry writes are at least 250ms apart (${writes[i - 1]} -> ${writes[i]})`);
  }
  const inWindow = writes.filter((at) => at < 1000).length;
  assert.equal(inWindow, 4, 'at most four writes in the half-open [0,1000)');
  assert.equal(spy.announcements().length, 1, 'no re-announcement during numbers');

  // track B (fresh fixtures): business changes paint immediately at a terminal
  const clockB = { now: 0 };
  const currentB = { value: {
    owner: { sessionId: 's1', sessionSeq: 1 },
    observation: observation({ receivingAtMs: 0, rate: { epochMs: 0 } }),
    context: context(),
  } };
  const timersB = fakeTimers();
  const spyB = paintRecorder();
  const displayB = makeDisplay({ current: currentB, clock: clockB, paint: spyB.paint, timers: timersB });
  displayB.syncBusiness();
  const armedTimer = timersB.lastId();
  assert.equal(timersB.size(), 1, 'one receiving refresher');

  clockB.now = 125;
  currentB.value = {
    owner: { sessionId: 's1', sessionSeq: 1 },
    observation: observation({ receivingAtMs: 0, rate: { epochMs: 0 }, endedAtMs: 125 }),
    context: context({ state: 'Ready', artifactId: '42',
      controls: { canStartLive: false, canImportVideo: false, canStop: true, canSave: true } }),
  };
  displayB.syncBusiness();
  const readyPaint = spyB.business().at(-1);
  assert.ok(readyPaint && 'primary' in readyPaint,
    'the ready primary paints on the event, not on the next tick');
  assert.equal(timersB.size(), 0, 'Ready releases the receiving timer');

  clockB.now = 200;
  currentB.value = {
    owner: { sessionId: 's1', sessionSeq: 1 },
    observation: observation({ receivingAtMs: 0, rate: { epochMs: 0 }, endedAtMs: 125,
      save: { phase: 'writing', attemptId: 'save-1', artifactId: '42', errorCode: null } }),
    context: context({ state: 'Saving', artifactId: '42',
      controls: { canStartLive: false, canImportVideo: false, canStop: false, canSave: false } }),
  };
  displayB.syncBusiness();
  assert.ok(spyB.business().at(-1) && 'save' in spyB.business().at(-1),
    'the saving phase paints immediately too');
  assert.equal(timersB.size(), 0, 'Saving never rebuilds the receiving timer');

  // a late tick after the terminal adds no telemetry write
  const writesBefore = spyB.telemetry().length;
  timersB.fire(armedTimer);
  assert.equal(spyB.telemetry().length, writesBefore,
    'a stale tick after the terminal writes nothing');
});

test('UX-UT-050 one refresher per seq and released ticks never paint', () => {
  const clock = { now: 1000 };
  const current = { value: {
    owner: { sessionId: 's1', sessionSeq: 1 },
    observation: observation({}),
    context: context(),
  } };
  const timers = fakeTimers();
  const spy = paintRecorder();
  const display = makeDisplay({ current, clock, paint: spy.paint, timers });

  display.syncBusiness();
  assert.equal(timers.size(), 1);
  const firstTimer = timers.lastId();
  const staleCallback = timers.callback(firstTimer);

  display.syncBusiness();
  assert.equal(timers.size(), 1, 'a repeated sync creates no second refresher');
  assert.equal(timers.calls.set, 1);

  // owner switch: the old timer is cleared, a fresh one is armed for seq2
  clock.now = 2000;
  current.value = {
    owner: { sessionId: 's1', sessionSeq: 2 },
    observation: observation({ sessionSeq: 2, receivingAtMs: 2000, rate: { epochMs: 2000 } }),
    context: context({ businessRevision: 5 }),
  };
  display.syncBusiness();
  assert.ok(timers.calls.clear >= 1, 'the previous timer was released');
  assert.equal(timers.size(), 1, 'still exactly one refresher');
  const seq2Writes = spy.telemetry().length;

  // the stale seq1 callback fires: nothing for seq2
  if (staleCallback) staleCallback();
  assert.equal(spy.telemetry().length, seq2Writes,
    'a cancelled callback never paints the new owner');

  // a view older than the last painted viewAt never rolls back
  const writesBefore = spy.telemetry().length;
  clock.now = 1500; // earlier than the seq2 projection at 2000
  timers.fireLast();
  assert.equal(spy.telemetry().length, writesBefore, 'no rollback to an earlier view');

  // terminals release the refresher; dispose is idempotent
  clock.now = 2600;
  current.value = {
    owner: { sessionId: 's1', sessionSeq: 2 },
    observation: observation({ sessionSeq: 2, receivingAtMs: 2000, endedAtMs: 2600, rate: { epochMs: 2000 } }),
    context: context({ state: 'Stopped', businessRevision: 6,
      controls: { canStartLive: true, canImportVideo: true, canStop: false, canSave: false } }),
  };
  display.syncBusiness();
  assert.equal(timers.size(), 0, 'Stopped releases the receiving timer');

  const lateCallback = timers.callback(timers.lastId());
  display.dispose();
  display.dispose();
  if (lateCallback) lateCallback();
  const afterDispose = spy.telemetry().length;
  if (lateCallback) lateCallback();
  assert.equal(spy.telemetry().length, afterDispose,
    'dispose is idempotent and late callbacks stay inert');
});

test('UX-UT-051 returning from the background re-projects by the real clock', () => {
  const clock = { now: 2000 };
  const current = { value: {
    owner: { sessionId: 's1', sessionSeq: 1 },
    observation: observation({ receivingAtMs: 1000,
      rate: { epochMs: 1000, buckets: emptyBuckets().map((slot, i) => (
        i === 0 ? { generation: 4, bytes: 625 } : slot)) } }),
    context: context(),
  } };
  const timers = fakeTimers();
  const spy = paintRecorder();
  const display = makeDisplay({ current, clock, paint: spy.paint, timers });
  display.syncBusiness();
  assert.equal(timers.size(), 1);

  // hidden at 2000; nothing happens until 20000 without any snapshot or tick
  display.setVisible(false);
  assert.equal(timers.size(), 0, 'hidden pauses the refresher');
  clock.now = 20000;
  display.setVisible(true);
  const resumed = [...spy.telemetry()].pop();
  assert.equal(resumed.elapsedMs, 19000, '20000-1000 by the real clock, no tick counting');
  assert.ok(resumed.rateText.includes('0.0'), 'the stale window aged to zero');
  assert.equal(timers.size(), 1, 'at most one refresher resumes');

  // pagehide destroys; a hidden-era callback never paints again
  const hiddenCallback = timers.callback(timers.lastId());
  display.dispose();
  if (hiddenCallback) hiddenCallback();
  const after = spy.telemetry().length;
  if (hiddenCallback) hiddenCallback();
  assert.equal(spy.telemetry().length, after);

  // an invalid clock only degrades the projection
  const clock2 = { now: NaN };
  const timers2 = fakeTimers();
  const spy2 = paintRecorder();
  const display2 = makeDisplay({ current, clock: clock2, paint: spy2.paint, timers: timers2 });
  display2.syncBusiness();
  assert.doesNotThrow(() => display2.setVisible(true));
  assert.equal(spy2.telemetry().length, 0, 'a non-finite clock writes no numbers');
});

test('UX-UT-052 a paint failure degrades only this render and records 19012', () => {
  const clock = { now: 1000 };
  const current = { value: {
    owner: { sessionId: 's1', sessionSeq: 1 },
    observation: observation({}),
    context: context(),
  } };
  const timers = fakeTimers();
  const spy = paintRecorder();
  const display = makeDisplay({ current, clock, paint: spy.paint, timers });

  spy.throwNext(1); // the first paint explodes
  assert.doesNotThrow(() => display.syncBusiness());
  assert.equal(timers.size(), 1, 'the display stays alive with its refresher');

  // the next business event paints again and surfaces the recorded 19012
  clock.now = 1200;
  current.value = {
    owner: { sessionId: 's1', sessionSeq: 1 },
    observation: observation({ progress: { lastDataAtMs: 1100 } }),
    context: context({ businessRevision: 4 }),
  };
  display.syncBusiness();
  assert.ok(spy.calls.length >= 2, 'later events still paint');
  const diagCalls = spy.calls.filter((call) => 'diagnostics' in call);
  assert.ok(diagCalls.some((call) => call.diagnostics.includes(19012)),
    'the render failure is recorded as a bounded diagnostic');
  assert.ok(diagCalls.every((call) => call.diagnostics.length <= 15),
    'diagnostics stay bounded and deduped');
});


// --- T20: the cancel and retry texts paint through the save section ----------

test('T20 the cancel and retry texts paint and the interlocks stay with deriveControls', () => {
  const clock = { now: 1000 };
  const current = { value: {
    owner: { sessionId: 's1', sessionSeq: 1 },
    observation: observation({ receivingAtMs: 100, endedAtMs: 800 }),
    context: context({ state: 'Ready', artifactId: '42',
      controls: { canStartLive: false, canImportVideo: false, canStop: true, canSave: true } }),
  } };
  const timers = fakeTimers();
  const spy = paintRecorder();
  const display = makeDisplay({ current, clock, paint: spy.paint, timers });
  display.syncBusiness();
  assert.equal(timers.size(), 0, 'Ready keeps the receiving timer released');

  // a cancelled save lands Retryable with its dedicated copy
  clock.now = 1100;
  current.value = {
    owner: { sessionId: 's1', sessionSeq: 1 },
    observation: observation({ receivingAtMs: 100, endedAtMs: 800,
      save: { phase: 'cancelled', attemptId: 'save-1', artifactId: '42', errorCode: 16002 } }),
    context: context({ state: 'Retryable', artifactId: '42',
      controls: { canStartLive: false, canImportVideo: false, canStop: true, canSave: true } }),
  };
  display.syncBusiness();
  const cancelledPaint = spy.business().at(-1);
  assert.equal(cancelledPaint.save, '保存已取消，文件仍可保存',
    'the cancel copy is explicit that the file is still there');
  assert.equal(spy.announcements().length, 2, 'the retry state is a new semantic identity');

  // the user clicks retry: selecting paints, the interlocks stay derived
  clock.now = 1150;
  current.value = {
    owner: { sessionId: 's1', sessionSeq: 1 },
    observation: observation({ receivingAtMs: 100, endedAtMs: 800,
      save: { phase: 'selecting', attemptId: 'save-2', artifactId: '42', errorCode: null } }),
    context: context({ state: 'Saving', artifactId: '42',
      controls: { canStartLive: false, canImportVideo: false, canStop: false, canSave: false } }),
  };
  display.syncBusiness();
  const retryPaint = spy.business().at(-1);
  assert.equal(retryPaint.save, '请选择保存位置');
  assert.equal(timers.size(), 0, 'Saving never rebuilds the receiving timer');
});

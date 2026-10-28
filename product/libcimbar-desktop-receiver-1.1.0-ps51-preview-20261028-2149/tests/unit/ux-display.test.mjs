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

function paintRecorder(clock) {
  const calls = [];
  const stamps = []; // the clock value of each successful paint
  let throwCount = 0;
  let throwTelemetryCount = 0;
  const isTelemetry = (call) => 'elapsedText' in call || 'rateText' in call
    || 'progressText' in call || 'mediaText' in call;
  const paint = (payload) => {
    // a throwing paint is a refused write: it never reaches the display, so it
    // must not be recorded among the successfully painted payloads
    if (isTelemetry(payload) && throwTelemetryCount > 0) {
      throwTelemetryCount -= 1;
      throw new Error('telemetry paint exploded');
    }
    if (throwCount > 0) {
      throwCount -= 1;
      throw new Error('paint exploded');
    }
    calls.push(payload);
    stamps.push(clock ? clock.now : null);
  };
  return {
    paint,
    calls,
    stamps,
    telemetryStamps: () => calls.map((call, i) => [call, stamps[i]])
      .filter((entry) => isTelemetry(entry[0]))
      .map((entry) => entry[1]),
    throwNext(times = 1) { throwCount = times; },
    throwNextTelemetry(times = 1) { throwTelemetryCount = times; },
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
  assert.equal(timersB.callback(armedTimer), undefined,
    'Ready releases the receiving refresher');
  assert.equal(timersB.size(), 1,
    'the final numbers wait for the 250ms boundary on one convergence timer');

  clockB.now = 200;
  currentB.value = {
    owner: { sessionId: 's1', sessionSeq: 1 },
    observation: observation({ receivingAtMs: 0, rate: { epochMs: 0 }, endedAtMs: 125,
      save: { phase: 'writing', attemptId: 'save-1', artifactId: '42', errorCode: null } }),
    context: context({ state: 'Saving', artifactId: '42',
      controls: { canStartLive: false, canImportVideo: false, canStop: false, canSave: false } }),
  };
  const setsBeforeSaving = timersB.calls.set;
  displayB.syncBusiness();
  assert.ok(spyB.business().at(-1) && 'save' in spyB.business().at(-1),
    'the saving phase paints immediately too');
  assert.equal(timersB.calls.set, setsBeforeSaving,
    'Saving never rebuilds the receiving refresher');
  assert.equal(timersB.size(), 1, 'the pending convergence timer is unchanged');

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


// --- T26: the semantic copies never carry digits (walks the full matrix) -----

// Given every business state the walk touches
// When the display paints
// Then primary, secondary, nextAction and announcement never contain a digit:
// numbers live only in the throttled metric region (UX-UT-049/032 keep the
// frequency side; this pins the copy side)
test('T26 semantic copies stay digit-free across the full state walk', () => {
  const clock = { now: 1000 };
  const current = { value: {
    owner: null,
    observation: observation({ sessionId: null, sessionSeq: 0, inputKind: null,
      observationRevision: 0, receivingAtMs: null }),
    context: context({ state: 'Idle', businessRevision: 0, inputKind: null,
      controls: { canStartLive: true, canImportVideo: true, canStop: false, canSave: false } }),
  } };
  const timers = fakeTimers();
  const spy = paintRecorder();
  const display = makeDisplay({ current, clock, paint: spy.paint, timers });
  display.syncBusiness();

  const steps = [
    { state: 'Preparing', businessRevision: 1, controls: { canStartLive: false, canImportVideo: false, canStop: true, canSave: false } },
    { state: 'Receiving', businessRevision: 2, controls: { canStartLive: false, canImportVideo: false, canStop: true, canSave: false } },
    { state: 'Ready', businessRevision: 3, artifactId: '42', controls: { canStartLive: false, canImportVideo: false, canStop: true, canSave: true } },
    { state: 'Saving', businessRevision: 4, artifactId: '42', controls: { canStartLive: false, canImportVideo: false, canStop: false, canSave: false } },
    { state: 'Saved', businessRevision: 5, artifactId: '42', controls: { canStartLive: true, canImportVideo: true, canStop: false, canSave: false } },
    { state: 'Retryable', businessRevision: 6, artifactId: '42', controls: { canStartLive: false, canImportVideo: false, canStop: true, canSave: true } },
    { state: 'Stopped', businessRevision: 7, controls: { canStartLive: true, canImportVideo: true, canStop: false, canSave: false } },
  ];
  clock.now = 1500;
  current.value = {
    owner: { sessionId: 's1', sessionSeq: 1 },
    observation: observation({ receivingAtMs: 100, endedAtMs: 1400,
      save: { phase: 'none', attemptId: null, artifactId: null, errorCode: null } }),
    context: context({ state: steps[0].state, businessRevision: steps[0].businessRevision,
      artifactId: null, controls: steps[0].controls }),
  };
  display.syncBusiness();

  let index = 0;
  for (const step of steps.slice(1)) {
    clock.now += 100;
    const save = step.state === 'Saving' || step.state === 'Saved'
      ? { phase: step.state === 'Saved' ? 'saved' : 'writing', attemptId: 'save-1', artifactId: '42', errorCode: null }
      : step.state === 'Retryable'
        ? { phase: 'cancelled', attemptId: 'save-1', artifactId: '42', errorCode: 16002 }
        : { phase: 'none', attemptId: null, artifactId: null, errorCode: null };
    current.value = {
      owner: { sessionId: 's1', sessionSeq: 1 },
      observation: observation({ receivingAtMs: 100, endedAtMs: 1400, save }),
      context: context({ state: step.state, businessRevision: step.businessRevision,
        artifactId: step.artifactId || null, controls: step.controls }),
    };
    display.syncBusiness();
    index += 1;
  }

  const semantic = spy.calls.filter((call) => 'primary' in call || 'announcement' in call
    || 'secondary' in call || 'nextAction' in call);
  assert.ok(semantic.length >= 7, `the walk painted every step (${semantic.length})`);
  for (const call of semantic) {
    for (const key of ['primary', 'secondary', 'nextAction', 'announcement']) {
      if (key in call) {
        assert.doesNotMatch(call[key], /\d/,
          `${key} copy stays digit-free, got "${call[key]}"`);
      }
    }
  }
});


// --- R12-A-R2 / B-01: commit semantics, terminal convergence, lastBusiness ---
//
// The verdict's counterexamples: a change swallowed by the 250ms gate was
// still written into lastTelemetry (so it was never painted), a terminal
// inside the gate released the refresher before converging, and lastBusiness
// was never committed after a successful paint (so identical syncs rewrote the
// same semantic sections). These cases drive the real createUxDisplay with a
// controlled clock, controlled paint and a fake timer table.

function receivingOwner() {
  return { sessionId: 's1', sessionSeq: 1 };
}

function dataAt(atMs, ratio) {
  return observation({
    progress: {
      lastDataAtMs: atMs,
      trustedRatio: ratio,
      trustedAtMs: atMs,
      lastAdvanceAtMs: atMs,
    },
  });
}

function readyAt(endedAtMs, lastDataAtMs, ratio) {
  return observation({
    endedAtMs,
    progress: {
      lastDataAtMs,
      trustedRatio: ratio,
      trustedAtMs: lastDataAtMs,
      lastAdvanceAtMs: lastDataAtMs,
    },
  });
}

const READY_CONTROLS = { canStartLive: false, canImportVideo: false, canStop: true, canSave: true };

test('R12-A-R2-1 a change the gate swallows is painted on the next tick', () => {
  const clock = { now: 1000 };
  const current = { value: {
    owner: receivingOwner(),
    observation: observation({}),
    context: context(),
  } };
  const timers = fakeTimers();
  const spy = paintRecorder();
  const display = makeDisplay({ current, clock, paint: spy.paint, timers });

  display.syncBusiness(); // t1000 baseline: elapsed 0, no ratio yet
  assert.equal(spy.telemetry().length, 1);
  assert.equal(spy.telemetry()[0].elapsedText, '0.0s');
  assert.equal(spy.telemetry()[0].progressText, '');

  // t1100: real data and a ratio arrive 100ms after the last write
  clock.now = 1100;
  current.value = {
    owner: receivingOwner(),
    observation: dataAt(1100, 0.2),
    context: context(),
  };
  display.syncBusiness();
  assert.equal(spy.telemetry().length, 1, 'the 250ms gate swallows the t1100 write');
  assert.ok(!spy.telemetry().some((call) => call.progressText === '重建估计约 20%'),
    'the swallowed value was never claimed as painted');

  // t1250: the tick re-projects the same, now paint-eligible observation
  clock.now = 1250;
  timers.fireLast();
  const writes = spy.telemetry();
  assert.equal(writes.length, 2, 'the latest projection is painted at the boundary');
  assert.equal(writes[1].progressText, '重建估计约 20%', 'the actual value, not just a count');
  assert.equal(writes[1].elapsedText, '0.3s');
});

test('R12-A-R2-2 a terminal inside the gate converges at the 250ms boundary', () => {
  const clock = { now: 1000 };
  const current = { value: {
    owner: receivingOwner(),
    observation: observation({}),
    context: context(),
  } };
  const timers = fakeTimers();
  const spy = paintRecorder(clock);
  const display = makeDisplay({ current, clock, paint: spy.paint, timers });

  display.syncBusiness(); // t1000 baseline
  const baseline = spy.telemetry().length;

  // t2000: real data raises the estimate; elapsed and rate are outside warmup
  clock.now = 2000;
  current.value = {
    owner: receivingOwner(),
    observation: dataAt(2000, 0.2),
    context: context(),
  };
  display.syncBusiness();
  assert.equal(spy.telemetry().length, baseline + 1, 't2000 is outside the gate');
  const active = spy.telemetry().at(-1);
  assert.equal(active.progressText, '重建估计约 20%');
  assert.notEqual(active.rateText, '', 'the rate is active at t2000');

  // t2100: the real artifact lands 100ms later, inside the shared boundary.
  // The frozen hard invariant telemetryMinWriteIntervalMs=250 is unqualified,
  // so the terminal projection must NOT write across the boundary: one
  // convergence timer waits for the boundary instead.
  clock.now = 2100;
  current.value = {
    owner: receivingOwner(),
    observation: readyAt(2100, 2000, 0.2),
    context: context({ state: 'Ready', artifactId: '42', controls: READY_CONTROLS }),
  };
  display.syncBusiness();
  assert.equal(spy.telemetry().length, baseline + 1, 'no numeric write inside the boundary');
  assert.equal(spy.telemetry().at(-1), active, 'the displayed numbers are still the t2000 ones');
  assert.equal(timers.size(), 1, 'one convergence timer waits for the boundary');
  const convergenceTimer = timers.lastId();

  // t2250: the boundary opens; the re-projected terminal values paint then
  clock.now = 2250;
  timers.fire(convergenceTimer);
  const flushed = spy.telemetry().at(-1);
  assert.notEqual(flushed, active, 'the final projection is painted at the boundary');
  assert.equal(flushed.progressText, '重建完成');
  assert.equal(flushed.rateText, '', 'a frozen rate shows nothing');
  assert.equal(flushed.elapsedText, '1.1s', 'the receiving time froze at the artifact');
  const stamps = spy.telemetryStamps();
  assert.equal(stamps.at(-1) - stamps.at(-2), 250,
    'the convergence write keeps the 250ms minimum interval from the last write');
  assert.equal(timers.size(), 0, 'convergence releases the timer');
});

test('R12-A-R2-2b a terminal with an open boundary flushes immediately', () => {
  const clock = { now: 1000 };
  const current = { value: {
    owner: receivingOwner(),
    observation: observation({}),
    context: context(),
  } };
  const timers = fakeTimers();
  const spy = paintRecorder(clock);
  const display = makeDisplay({ current, clock, paint: spy.paint, timers });
  display.syncBusiness(); // t1000 baseline, last write at 1000

  // t1400: the boundary is already open (400ms later); no extra wait is owed
  clock.now = 1400;
  current.value = {
    owner: receivingOwner(),
    observation: readyAt(1400, 1000, 0.2),
    context: context({ state: 'Ready', artifactId: '42', controls: READY_CONTROLS }),
  };
  display.syncBusiness();
  const flushed = spy.telemetry().at(-1);
  assert.equal(flushed.progressText, '重建完成');
  assert.equal(flushed.elapsedText, '0.4s');
  const stamps = spy.telemetryStamps();
  assert.ok(stamps.at(-1) - stamps.at(-2) >= 250,
    'the immediate terminal write still respects the boundary');
  assert.equal(timers.size(), 0, 'no convergence timer when the boundary is already open');
});

test('R12-A-R2-2c repeated syncs while a terminal flush is pending schedule once', () => {
  const clock = { now: 1000 };
  const current = { value: {
    owner: receivingOwner(),
    observation: observation({}),
    context: context(),
  } };
  const timers = fakeTimers();
  const spy = paintRecorder(clock);
  const display = makeDisplay({ current, clock, paint: spy.paint, timers });
  display.syncBusiness();
  clock.now = 2000;
  current.value = { owner: receivingOwner(), observation: dataAt(2000, 0.2), context: context() };
  display.syncBusiness();

  clock.now = 2100;
  current.value = {
    owner: receivingOwner(),
    observation: readyAt(2100, 2000, 0.2),
    context: context({ state: 'Ready', artifactId: '42', controls: READY_CONTROLS }),
  };
  display.syncBusiness();
  const armed = timers.lastId();
  const setsAfterTerminal = timers.calls.set;
  const writesAfterTerminal = spy.telemetry().length;
  assert.equal(timers.size(), 1, 'one convergence timer waits for the boundary');

  // repeated business syncs inside the pending window: no re-scheduling, no
  // out-of-boundary numeric write, business sections still paint immediately
  for (const at of [2150, 2200, 2249]) {
    clock.now = at;
    current.value = {
      owner: receivingOwner(),
      observation: readyAt(2100, 2000, 0.2),
      context: context({ state: 'Ready', artifactId: '42', controls: READY_CONTROLS }),
    };
    display.syncBusiness();
    assert.equal(timers.calls.set, setsAfterTerminal, `t${at}: no duplicate scheduling`);
    assert.equal(timers.size(), 1, `t${at}: still exactly one convergence timer`);
    assert.equal(spy.telemetry().length, writesAfterTerminal,
      `t${at}: no numeric write inside the boundary`);
  }

  clock.now = 2250;
  timers.fire(armed);
  const finalWrites = spy.telemetry().filter((call) => call.progressText === '重建完成');
  assert.equal(finalWrites.length, 1, 'exactly one terminal numeric write');
  assert.equal(timers.size(), 0, 'no further timer after convergence');
});

test('R12-A-R2-2d an owner change or dispose cancels a pending terminal flush', () => {
  const clock = { now: 1000 };
  const current = { value: {
    owner: receivingOwner(),
    observation: observation({}),
    context: context(),
  } };
  const timers = fakeTimers();
  const spy = paintRecorder(clock);
  const display = makeDisplay({ current, clock, paint: spy.paint, timers });
  display.syncBusiness();
  clock.now = 2000;
  current.value = { owner: receivingOwner(), observation: dataAt(2000, 0.2), context: context() };
  display.syncBusiness();
  clock.now = 2100;
  current.value = {
    owner: receivingOwner(),
    observation: readyAt(2100, 2000, 0.2),
    context: context({ state: 'Ready', artifactId: '42', controls: READY_CONTROLS }),
  };
  display.syncBusiness();
  const pending = timers.lastId();
  assert.equal(timers.size(), 1, 'a convergence timer is pending');

  // the owner advances long after the boundary: the old convergence is moot
  clock.now = 2500;
  current.value = {
    owner: { sessionId: 's1', sessionSeq: 2 },
    observation: observation({ sessionId: null, sessionSeq: 0, inputKind: null,
      observationRevision: 0, receivingAtMs: null }),
    context: context({ state: 'Idle', businessRevision: 0, inputKind: null,
      controls: { canStartLive: true, canImportVideo: true, canStop: false, canSave: false } }),
  };
  display.syncBusiness();
  assert.equal(timers.size(), 0, 'the owner change cancelled the pending flush');
  const writesAfterSwitch = spy.telemetry().length;
  timers.fire(pending); // the stale convergence callback
  assert.equal(spy.telemetry().length, writesAfterSwitch, 'the stale flush never writes');

  // dispose also cancels a pending flush
  clock.now = 3000;
  current.value = {
    owner: { sessionId: 's1', sessionSeq: 2 },
    observation: observation({ sessionId: 's1', sessionSeq: 2,
      receivingAtMs: 3000, rate: { epochMs: 3000 } }),
    context: context({ state: 'Receiving', businessRevision: 1 }),
  };
  display.syncBusiness();
  clock.now = 3100;
  current.value = {
    owner: { sessionId: 's1', sessionSeq: 2 },
    observation: observation({ sessionId: 's1', sessionSeq: 2, receivingAtMs: 3000,
      endedAtMs: 3100, rate: { epochMs: 3000 } }),
    context: context({ state: 'Ready', artifactId: '42', businessRevision: 2,
      controls: READY_CONTROLS }),
  };
  display.syncBusiness();
  assert.equal(timers.size(), 1, 'a convergence timer is pending again');
  display.dispose();
  assert.equal(timers.size(), 0, 'dispose cancelled the pending flush');
});

test('R12-A-R2-3 a converged terminal never repaints and a failed flush is corrected', () => {
  // A: a converged terminal is not rewritten by a later identical sync
  const clock = { now: 1000 };
  const current = { value: {
    owner: receivingOwner(),
    observation: observation({}),
    context: context(),
  } };
  const timers = fakeTimers();
  const spy = paintRecorder();
  const display = makeDisplay({ current, clock, paint: spy.paint, timers });
  display.syncBusiness();
  clock.now = 2000;
  current.value = { owner: receivingOwner(), observation: dataAt(2000, 0.2), context: context() };
  display.syncBusiness();
  clock.now = 2100;
  current.value = {
    owner: receivingOwner(),
    observation: readyAt(2100, 2000, 0.2),
    context: context({ state: 'Ready', artifactId: '42', controls: READY_CONTROLS }),
  };
  display.syncBusiness();
  const pendingTimer = timers.lastId();
  clock.now = 2250;
  timers.fire(pendingTimer); // converge at the 250ms boundary
  const converged = spy.telemetry().length;
  const lastFlush = spy.telemetry().at(-1);
  assert.equal(lastFlush.progressText, '重建完成');

  clock.now = 2600;
  display.syncBusiness();
  assert.equal(spy.telemetry().length, converged, 'an identical terminal view is not rewritten');
  assert.equal(spy.telemetry().at(-1), lastFlush);
  assert.equal(timers.size(), 0, 'the converged terminal holds no timer');

  // B: a failed terminal flush leaves the cache untouched; the next sync corrects it
  const clockB = { now: 1000 };
  const currentB = { value: {
    owner: receivingOwner(),
    observation: observation({}),
    context: context(),
  } };
  const timersB = fakeTimers();
  const spyB = paintRecorder();
  const displayB = makeDisplay({ current: currentB, clock: clockB, paint: spyB.paint, timers: timersB });
  displayB.syncBusiness();
  clockB.now = 2000;
  currentB.value = { owner: receivingOwner(), observation: dataAt(2000, 0.2), context: context() };
  displayB.syncBusiness();
  const beforeTerminal = spyB.telemetry().length;

  clockB.now = 2100;
  currentB.value = {
    owner: receivingOwner(),
    observation: readyAt(2100, 2000, 0.2),
    context: context({ state: 'Ready', artifactId: '42', controls: READY_CONTROLS }),
  };
  displayB.syncBusiness();
  const pendingB = timersB.lastId();
  assert.equal(timersB.size(), 1, 'the terminal waits for the boundary');

  // the boundary flush itself fails: nothing is painted or claimed, and no
  // autonomous retry spins a timer after termination
  spyB.throwNextTelemetry(1);
  clockB.now = 2250;
  timersB.fire(pendingB);
  assert.equal(spyB.telemetry().length, beforeTerminal,
    'the failed flush painted nothing and claimed nothing');
  assert.ok(!spyB.telemetry().some((call) => call.progressText === '重建完成'));
  assert.equal(timersB.size(), 0, 'a failed convergence leaves no timer behind');

  clockB.now = 2700;
  displayB.syncBusiness(); // the same terminal view, retried by the next sync
  const corrected = spyB.telemetry().at(-1);
  assert.equal(spyB.telemetry().length, beforeTerminal + 1);
  assert.equal(corrected.progressText, '重建完成');
  assert.equal(corrected.elapsedText, '1.1s');
  assert.equal(corrected.rateText, '');
});

test('R12-A-R2-4 a failed telemetry paint is not remembered as painted', () => {
  const clock = { now: 1000 };
  const current = { value: {
    owner: receivingOwner(),
    observation: observation({}),
    context: context(),
  } };
  const timers = fakeTimers();
  const spy = paintRecorder();
  const display = makeDisplay({ current, clock, paint: spy.paint, timers });
  display.syncBusiness();
  assert.equal(spy.telemetry().length, 1);

  // t1300: data plus a ratio, outside the gate, but the paint explodes
  clock.now = 1300;
  current.value = { owner: receivingOwner(), observation: dataAt(1300, 0.2), context: context() };
  spy.throwNextTelemetry(1);
  display.syncBusiness();
  assert.equal(spy.telemetry().length, 1, 'the failed write is not counted as painted');
  assert.ok(!spy.telemetry().some((call) => call.progressText === '重建估计约 20%'));

  // t1600: the next projection retries the same content and succeeds
  clock.now = 1600;
  display.syncBusiness();
  const retried = spy.telemetry().at(-1);
  assert.equal(spy.telemetry().length, 2);
  assert.equal(retried.progressText, '重建估计约 20%');
  assert.equal(retried.elapsedText, '0.6s');

  // the recorded 19012 surfaces on the next semantic announcement
  clock.now = 1700;
  current.value = {
    owner: receivingOwner(),
    observation: readyAt(1700, 1300, 0.2),
    context: context({ state: 'Ready', artifactId: '42', controls: READY_CONTROLS }),
  };
  display.syncBusiness();
  const diagCalls = spy.calls.filter((call) => 'diagnostics' in call);
  assert.ok(diagCalls.some((call) => call.diagnostics.includes(19012)),
    'the render failure is recorded as 19012');
});

test('R12-A-R2-5 identical syncs commit the business cache once', () => {
  const clock = { now: 1000 };
  const current = { value: {
    owner: receivingOwner(),
    observation: observation({}),
    context: context(),
  } };
  const timers = fakeTimers();
  const spy = paintRecorder();
  const display = makeDisplay({ current, clock, paint: spy.paint, timers });

  display.syncBusiness();
  const businessWrites = spy.business().length;
  assert.equal(businessWrites, 1, 'the first projection paints the business sections once');
  assert.equal(spy.announcements().length, 1);

  display.syncBusiness();
  assert.equal(spy.business().length, businessWrites, 'the identical sync paints nothing again');
  assert.equal(spy.announcements().length, 1, 'no duplicate live-region announcement');

  clock.now = 1500; // time alone moves the numbers, never the semantics
  timers.fireLast();
  assert.equal(spy.business().length, businessWrites, 'a time-only tick never repaints semantics');
  assert.ok(spy.telemetry().length >= 2, 'the numbers still advance');
});

// UT-007..UT-012: session coordination. All dependencies are injected; no
// real media API or Worker is touched here.
//
// The tests at the end also pin the receiver-v1 Snapshot mapping (TD-13):
// the contract enums are read from the frozen schema file itself, so drift
// fails here instead of at integration time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SessionCoordinator } from '../../src/session.js';
import { toContractSnapshot } from '../../src/contract-snapshot.js';
import { ReceiverTelemetry } from '../../src/ux-telemetry.js';
import { readView } from '../../src/ux-view.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(
  readFileSync(join(HERE, '../../../../docs/design-catalog/contracts/receiver-v1.schema.json'), 'utf8')
);
const SNAPSHOT_SCHEMA = SCHEMA.$defs.Snapshot;
const ARTIFACT_SCHEMA = SCHEMA.$defs.Artifact;
const STATS_SCHEMA = SCHEMA.$defs.Stats;

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeTrack() {
  const listeners = [];
  return {
    stopped: false,
    stop() { this.stopped = true; },
    addEventListener(type, fn) { if (type === 'ended') listeners.push(fn); },
    fireEnded() { for (const fn of listeners) fn(); },
  };
}

function fakeStream() {
  const track = fakeTrack();
  return {
    tracks: [track],
    getTracks() { return this.tracks; },
    getVideoTracks() { return this.tracks; },
  };
}

function fakeClient() {
  let settle = null;
  return {
    closed: false,
    close() { this.closed = true; },
    submitFrame() { return new Promise((resolve) => { settle = resolve; }); },
    deliver(result) { if (settle) settle(result); },
  };
}

// Given a click handler that reserves and opens the picker
// When starting
// Then the picker is called before any decoder await, and one session exists
test('UT-007 reserve synchronously, picker before client', async () => {
  const order = [];
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => { order.push('picker'); return Promise.resolve(fakeStream()); },
    createClient: () => { order.push('client'); return Promise.resolve(fakeClient()); },
  });

  const result = coordinator.startLive({ requestId: 'r1' });
  assert.equal(result.accepted, true);
  assert.deepEqual(order, ['picker', 'client'], 'no await between reserve and picker');

  await tick();
  assert.equal(coordinator.snapshot().sessionSeq, 1);
  assert.ok(['Preparing', 'Receiving'].includes(coordinator.snapshot().state));
});

// Given the same requestId twice in quick succession
// When starting twice
// Then only one picker and one decoder are created
test('UT-008 duplicate start is idempotent', async () => {
  let pickerCalls = 0;
  let clientCalls = 0;
  let resolvePicker;
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => {
      pickerCalls += 1;
      return new Promise((resolve) => { resolvePicker = resolve; });
    },
    createClient: () => { clientCalls += 1; return Promise.resolve(fakeClient()); },
  });

  const first = coordinator.startLive({ requestId: 'same' });
  const second = coordinator.startLive({ requestId: 'same' });

  assert.equal(first.accepted, true);
  assert.equal(second.duplicate, true);
  assert.equal(pickerCalls, 1);
  assert.equal(clientCalls, 1);

  resolvePicker(fakeStream());
  await tick();
});

// Given session A stopped and session B running
// When A's worker replies late
// Then B's snapshot is untouched
test('UT-009 late results from a stopped session are ignored', async () => {
  const clients = [];
  const pickers = [];
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve) => { pickers.push(resolve); }),
    createClient: () => { const client = fakeClient(); clients.push(client); return Promise.resolve(client); },
  });

  coordinator.startLive({ requestId: 'a' });
  pickers[0](fakeStream());
  await tick();
  assert.equal(coordinator.snapshot().state, 'Receiving');

  coordinator.offerFrame({ width: 2, height: 3, pixels: new ArrayBuffer(24) });
  await tick(5);

  coordinator.stop();
  await tick();
  const b = coordinator.startLive({ requestId: 'b' });
  assert.equal(b.accepted, true);
  await tick();
  const before = coordinator.snapshot();

  clients[0].deliver({ outcome: 'artifact', artifact: { byteCount: 99 } });
  await tick();

  const after = coordinator.snapshot();
  assert.equal(after.artifact, null, 'A must not write into B');
  assert.equal(after.sessionSeq, before.sessionSeq);
});

// Given a picker that is still pending when the user stops
// When the old authorization returns a stream
// Then the tracks are stopped at once and no new start is allowed yet
test('UT-010 a late capture stream is stopped immediately', async () => {
  let resolvePicker;
  const stream = fakeStream();
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve) => { resolvePicker = resolve; }),
    createClient: () => Promise.resolve(fakeClient()),
  });

  coordinator.startLive({ requestId: 'a' });
  coordinator.stop();
  assert.equal(coordinator.snapshot().state, 'Stopping');
  assert.equal(coordinator.startLive({ requestId: 'b' }).accepted, false, 'cleanup not converged');

  resolvePicker(stream);
  await tick();

  assert.equal(stream.tracks[0].stopped, true);
  assert.equal(coordinator.snapshot().state, 'Stopped');
});

// Given a pending picker when stop is requested
// When reading the snapshot and stopping again
// Then cleanupComplete stays false and the repeat stop has no side effects
test('UT-011 stopping reports cleanupComplete until settled', async () => {
  let resolvePicker;
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve) => { resolvePicker = resolve; }),
    createClient: () => Promise.resolve(fakeClient()),
  });

  coordinator.startLive({ requestId: 'a' });
  coordinator.stop();

  const stopping = coordinator.snapshot();
  assert.equal(stopping.state, 'Stopping');
  assert.equal(stopping.cleanupComplete, false);

  coordinator.stop(); // repeat: no new event
  assert.equal(coordinator.snapshot().eventSeq, stopping.eventSeq);
  assert.equal(coordinator.snapshot().state, 'Stopping');

  resolvePicker(fakeStream());
  await tick();

  assert.equal(coordinator.snapshot().state, 'Stopped');
  assert.equal(coordinator.snapshot().cleanupComplete, true);
});

// Given a completed session A and a new session B
// When B starts
// Then counters are zero, no artifact survives, identity is fresh
test('UT-012 a new session starts clean', async () => {
  const clients = [];
  const pickers = [];
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve) => { pickers.push(resolve); }),
    createClient: () => { const client = fakeClient(); clients.push(client); return Promise.resolve(client); },
  });

  coordinator.startLive({ requestId: 'a' });
  pickers[0](fakeStream());
  await tick();
  coordinator.offerFrame({ width: 2, height: 3, pixels: new ArrayBuffer(24) });
  await tick(5);
  clients[0].deliver({ outcome: 'artifact', artifact: { byteCount: 7, name: 'a.bin' } });
  await tick();
  assert.equal(coordinator.snapshot().state, 'Ready');
  assert.ok(coordinator.snapshot().artifact);

  coordinator.stop();
  await tick();

  const b = coordinator.startLive({ requestId: 'b' });
  assert.equal(b.accepted, true);
  const snap = coordinator.snapshot();
  assert.equal(snap.sessionSeq, 2);
  assert.equal(snap.artifact, null);
  assert.equal(snap.state, 'Preparing');
  assert.deepEqual(
    { submitted: snap.stats.submitted, dropped: snap.stats.dropped, completed: snap.stats.completed },
    { submitted: 0, dropped: 0, completed: 0 }
  );
  assert.ok(snap.eventSeq > 0);
});

// --- TD-13: the internal snapshot maps onto the frozen Snapshot contract ---

function assertConforms(snapshot) {
  const required = SNAPSHOT_SCHEMA.required;
  const actualKeys = Object.keys(snapshot).sort();
  assert.deepEqual(actualKeys, [...required].sort(),
    'mapped snapshot must have exactly the schema keys');

  assert.ok(SNAPSHOT_SCHEMA.properties.state.enum.includes(snapshot.state),
    `state ${snapshot.state} must be in the contract enum`);
  assert.ok(SNAPSHOT_SCHEMA.properties.mode.enum.includes(snapshot.mode),
    `mode ${snapshot.mode} must be in the contract enum`);
  assert.ok(SNAPSHOT_SCHEMA.properties.inputKind.enum.includes(snapshot.inputKind));
  assert.ok(SNAPSHOT_SCHEMA.properties.saveStatus.enum.includes(snapshot.saveStatus));

  for (const item of snapshot.pendingExternal) {
    assert.ok(SNAPSHOT_SCHEMA.properties.pendingExternal.items.enum.includes(item),
      `pendingExternal item ${item} must be registered`);
  }

  const statsKeys = Object.keys(snapshot.stats).sort();
  assert.deepEqual(statsKeys, [...STATS_SCHEMA.required].sort());
  assert.ok(snapshot.stats.inflight === 0 || snapshot.stats.inflight === 1);
  assert.equal(snapshot.stats.capturedFrames,
    snapshot.stats.submittedFrames + snapshot.stats.droppedFrames);

  if (snapshot.artifact) {
    assert.deepEqual(Object.keys(snapshot.artifact).sort(),
      [...ARTIFACT_SCHEMA.required].sort());
    assert.equal('blob' in snapshot.artifact, false,
      'the contract artifact never carries the Blob');
  }
}

test('TD-13 a mapped snapshot conforms to receiver-v1 Snapshot', () => {
  const internal = {
    sessionId: 's1',
    revision: 3,
    state: 'Receiving',
    artifact: null,
    inputKind: 'live',
    inputEnded: false,
    capturePending: false,
    cleanupComplete: true,
    stats: { submitted: 5, dropped: 2, completed: 3, failed: 0, inFlight: false },
  };
  const mapped = toContractSnapshot(internal, {
    mode: 68,
    saveStatus: 'none',
    saveAttemptId: null,
    lastError: null,
    elapsedMs: 1500,
  });
  assertConforms(mapped);
  assert.equal(mapped.mode, 'B');
  assert.equal(mapped.state, 'Receiving');
  assert.deepEqual(mapped.pendingExternal, []);
  assert.equal(mapped.stats.capturedFrames, 7);
  assert.equal(mapped.stats.submittedFrames, 5);
  assert.equal(mapped.stats.processedFrames, 3);
  assert.equal(mapped.stats.droppedFrames, 2);
  assert.equal(mapped.stats.inflight, 0);
  assert.equal(mapped.stats.elapsedMs, 1500);
  assert.equal(mapped.artifact, null);
});

test('TD-13 a Ready artifact drops the Blob and keeps the contract fields', () => {
  const internal = {
    sessionId: 's2',
    revision: 9,
    state: 'Ready',
    inputKind: 'live',
    inputEnded: true,
    capturePending: true,
    cleanupComplete: false,
    artifact: {
      artifactId: '42',
      fountainFileId: '0000002a',
      suggestedName: 'report.pdf',
      byteCount: 1234,
      compressedBytes: 1100,
      mime: 'application/octet-stream',
      blob: new Blob([new Uint8Array([1])]), // internal only
    },
    stats: { submitted: 1, dropped: 0, completed: 1, failed: 0, inFlight: true },
  };
  const mapped = toContractSnapshot(internal, {
    mode: 'Bm',
    saveStatus: 'selecting',
    saveAttemptId: 'att-1',
    savePending: ['save_picker'],
    lastError: { code: 12002, name: 'CAPTURE_NOT_ALLOWED', message: 'x', retryAction: 'new_click', details: {} },
    elapsedMs: 42,
  });

  assertConforms(mapped);
  assert.equal(mapped.mode, 'Bm');
  assert.equal(mapped.state, 'Ready');
  assert.deepEqual(mapped.pendingExternal, ['capture_picker', 'save_picker']);
  assert.equal(mapped.saveAttemptId, 'att-1');
  assert.equal(mapped.saveStatus, 'selecting');
  assert.equal(mapped.artifact.suggestedName, 'report.pdf');
  assert.equal(mapped.artifact.byteCount, 1234);
  assert.equal(mapped.lastError.code, 12002);

  // schema conditional: Ready does not constrain saveStatus, but Saving would
  const saving = toContractSnapshot(
    Object.assign({}, internal, { state: 'Saving' }),
    { mode: 'B', saveStatus: 'writing', elapsedMs: null }
  );
  assertConforms(saving);
  assert.equal(saving.saveStatus, 'writing');
});

test('TD-13 unknown internal states fall back to Stopped, never invent', () => {
  const internal = {
    sessionId: 's3',
    revision: 1,
    state: 'SomethingNew',
    artifact: null,
    inputKind: 'video',
    inputEnded: false,
    capturePending: false,
    cleanupComplete: true,
    stats: {},
  };
  const mapped = toContractSnapshot(internal, {});
  assertConforms(mapped);
  assert.equal(mapped.state, 'Stopped');
  assert.equal(mapped.inputKind, 'video');
  assert.equal(mapped.stats.capturedFrames, 0);
  assert.equal(mapped.stats.elapsedMs, null);
});

test('TD-13 no session maps to null (IF-003)', () => {
  assert.equal(toContractSnapshot(null, {}), null);
  assert.equal(toContractSnapshot({ sessionId: null }, {}), null);
});

// --- T2.2.a acceptance items 1 and 2 (from review round 3, W-3) ---

// Given the user stops while the capture picker is still pending
// When the picker rejects afterwards
// Then the session converges to Stopped and never returns to Idle
test('T2.2.a-1 a rejection after stop never leaves Stopping', async () => {
  let rejectPicker;
  const errors = [];
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve, reject) => { rejectPicker = reject; }),
    createClient: () => Promise.resolve(fakeClient()),
    onError: (code) => errors.push(code),
  });

  coordinator.startLive({ requestId: 'a' });
  coordinator.stop();
  assert.equal(coordinator.snapshot().state, 'Stopping');

  rejectPicker(new Error('late cancel'));
  await tick();

  assert.equal(coordinator.snapshot().state, 'Stopped', 'converges to Stopped');
  assert.equal(errors.includes(12002), false, 'no spurious 12002 after stop');
});

// Given the decoder cannot initialize
// When init fails mid-session
// Then the session reaches a terminal state instead of hanging in Preparing
test('T2.2.a-2 decoder init failure converges to Stopped', async () => {
  const errors = [];
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => Promise.resolve(fakeStream()),
    createClient: () => Promise.reject(Object.assign(new Error('boom'), { code: 15001 })),
    onError: (code) => errors.push(code),
  });

  coordinator.startLive({ requestId: 'a' });
  await tick();

  assert.equal(coordinator.snapshot().state, 'Stopped');
  assert.equal(errors.includes(15001), true);
});

// --- T2.2.b acceptance item 6 (round 4 note): Incomplete retires resources ---

// Given the input ends and no artifact could be rebuilt
// When the session lands on Incomplete
// Then the capture tracks and the decoder are released at once
test('T2.2.b-6 an Incomplete session releases its resources', async () => {
  const clients = [];
  const pickers = [];
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve) => { pickers.push(resolve); }),
    createClient: () => { const client = fakeClient(); clients.push(client); return Promise.resolve(client); },
  });

  coordinator.startLive({ requestId: 'a' });
  pickers[0](fakeStream());
  await tick();
  assert.equal(coordinator.snapshot().state, 'Receiving');

  await coordinator.finishStream({ takeFinalSample: () => null });

  assert.equal(coordinator.snapshot().state, 'Incomplete');
  assert.equal(clients[0].closed, true, 'the decoder is retired');
});

// --- Round-1 external review A-02: Incomplete must be restartable ---

// Given a session ended Incomplete
// When the user starts again through either entry
// Then a fresh session is accepted with no old progress or artifact
test('UT-063 an Incomplete session restarts through both entries', async () => {
  const clients = [fakeClient(), fakeClient(), fakeClient()];
  const pickers = [];
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve) => { pickers.push(resolve); }),
    createClient: () => Promise.resolve(clients.shift()),
  });

  coordinator.startLive({ requestId: 'live-1' });
  pickers[0](fakeStream());
  await tick();
  assert.equal(coordinator.snapshot().state, 'Receiving');

  await coordinator.finishStream({ takeFinalSample: () => null });
  const incomplete = coordinator.snapshot();
  assert.equal(incomplete.state, 'Incomplete');
  assert.equal(incomplete.cleanupComplete, true, 'nothing stays pending');

  // restart through the live entry
  const live = coordinator.startLive({ requestId: 'live-2' });
  assert.equal(live.accepted, true, 'startLive accepted after Incomplete');
  assert.notEqual(live.sessionId, incomplete.sessionId);
  const fresh = coordinator.snapshot();
  assert.equal(fresh.state, 'Preparing');
  assert.equal(fresh.artifact, null, 'no old artifact');
  assert.equal(fresh.inputEnded, false);
  assert.equal(fresh.stats.submitted, 0, 'stats start from zero');

  // converge this one and restart through the video entry
  pickers[1](fakeStream());
  await tick();
  await coordinator.finishStream({ takeFinalSample: () => null });
  assert.equal(coordinator.snapshot().state, 'Incomplete');

  const video = coordinator.startVideo({
    requestId: 'video-1',
    openSource: () => Promise.resolve({ stop() {} }),
  });
  assert.equal(video.accepted, true, 'startVideo accepted after Incomplete');
  assert.notEqual(video.sessionId, incomplete.sessionId);
  await tick();
  assert.equal(coordinator.snapshot().state, 'Receiving');
});

// --- Round-1 external review C-02: capture rejection must release workers ---

// Given the parallel decoder init already produced a ready client
// When the capture picker is then rejected
// Then that client is closed immediately and the next session builds a new one
test('UT-064 picker rejection closes the already-ready client', async () => {
  const clients = [];
  let rejectPicker;
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve, reject) => { rejectPicker = reject; }),
    createClient: () => { const client = fakeClient(); clients.push(client); return Promise.resolve(client); },
  });

  coordinator.startLive({ requestId: 'live-1' });
  await tick(); // the client finishes init while the picker is still open
  assert.equal(clients.length, 1);

  rejectPicker(Object.assign(new Error('cancelled'), { code: 12002 }));
  await tick();

  assert.equal(coordinator.snapshot().state, 'Idle');
  assert.equal(clients[0].closed, true, 'the parallel-initialized client is released');
});

// Given the capture is rejected before the decoder init settles
// When the client arrives late
// Then the invalidated session's cleanup token closes it instead of leaking
test('UT-065 a late client after rejection is closed by the cleanup token', async () => {
  const clients = [];
  let resolvePicker; let rejectPicker;
  let resolveClient;
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve, reject) => { resolvePicker = resolve; rejectPicker = reject; }),
    createClient: () => new Promise((resolve) => { resolveClient = (client) => { clients.push(client); resolve(client); }; }),
  });

  coordinator.startLive({ requestId: 'live-1' });
  rejectPicker(Object.assign(new Error('cancelled'), { code: 12002 }));
  await tick();
  assert.equal(coordinator.snapshot().state, 'Idle');

  const late = fakeClient();
  resolveClient(late);
  await tick();
  assert.equal(late.closed, true, 'the late client is closed, not adopted');
});

// Given the user cancels the picker three times in a row, restarting between
// rounds only after the late decoder init has arrived
// When each round's client eventually returns
// Then every client is closed, the cleanup state converges before the next
// round is admitted, and create/close counts match (round-3 B-R1: an
// unconverged init must not let a new session accumulate in parallel).
// UT-089 rewrites UT-066, which assumed restarts were always admitted.
test('UT-089 repeated cancellations release every late client', async () => {
  let createCalls = 0;
  const clients = [];
  const clientResolvers = [];
  const pickerRejects = [];
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve, reject) => { pickerRejects.push(reject); }),
    createClient: () => {
      createCalls += 1;
      return new Promise((resolve) => { clientResolvers.push(resolve); });
    },
  });

  for (let round = 1; round <= 3; round += 1) {
    const started = coordinator.startLive({ requestId: `live-${round}` });
    assert.equal(started.accepted, true, `round ${round} is admitted`);
    pickerRejects[round - 1](Object.assign(new Error('cancelled'), { code: 12002 }));
    await tick();
    assert.equal(coordinator.snapshot().state, 'Idle');
    assert.equal(coordinator.snapshot().cleanupComplete, false,
      `round ${round} still owns the pending init`);

    const client = fakeClient();
    clients.push(client);
    clientResolvers[round - 1](client);
    await tick();
    assert.equal(client.closed, true, `round ${round} late client was closed`);
    assert.equal(coordinator.snapshot().cleanupComplete, true,
      `round ${round} cleanup converged before the next start`);
  }

  assert.equal(createCalls, 3, 'one decoder per round');
  assert.equal(clients.length, 3);
  assert.equal(clients.filter((client) => client.closed).length, 3,
    'every late client was closed');
});

// --- Round-3 B-R1: an unconverged init blocks a new session ---

// Given the picker was cancelled while the decoder init is still pending
// When the user clicks start again before the init settles
// Then the restart is refused with reason 'cleanup' and no second decoder is
// created; once the late client arrives it is closed, the snapshot is
// re-emitted with cleanupComplete=true, and the restart is admitted
test('UT-088 a cancel during init blocks restart until cleanup converges', async () => {
  const snapshots = [];
  let createCalls = 0;
  let pickerCalls = 0;
  let rejectPicker;
  let resolveClient;
  const clients = [];
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => {
      pickerCalls += 1;
      return new Promise((resolve, reject) => { rejectPicker = reject; });
    },
    createClient: () => {
      createCalls += 1;
      return new Promise((resolve) => { resolveClient = resolve; });
    },
    onSnapshot: (snapshot) => snapshots.push(snapshot),
  });

  assert.equal(coordinator.startLive({ requestId: 'live-1' }).accepted, true);
  rejectPicker(Object.assign(new Error('cancelled'), { code: 12002 }));
  await tick();

  let snapshot = coordinator.snapshot();
  assert.equal(snapshot.state, 'Idle');
  assert.equal(snapshot.cleanupComplete, false, 'the init is still owned');

  const blocked = coordinator.startLive({ requestId: 'live-2' });
  assert.deepEqual(blocked, { accepted: false, reason: 'cleanup' });
  assert.equal(createCalls, 1, 'no second decoder was created');
  assert.equal(pickerCalls, 1, 'no second picker was opened');
  assert.equal(coordinator.snapshot().sessionSeq, 1, 'no new session was reserved');

  const emittedBefore = snapshots.length;
  const late = fakeClient();
  clients.push(late);
  resolveClient(late);
  await tick();

  assert.equal(late.closed, true, 'the late client of the cancelled session is closed');
  snapshot = coordinator.snapshot();
  assert.equal(snapshot.state, 'Idle');
  assert.equal(snapshot.cleanupComplete, true, 'cleanup converged');
  assert.ok(snapshots.length > emittedBefore, 'the snapshot is re-emitted on convergence');
  assert.equal(snapshots[snapshots.length - 1].cleanupComplete, true);

  const restarted = coordinator.startLive({ requestId: 'live-3' });
  assert.equal(restarted.accepted, true, 'a converged session admits the next start');
  assert.notEqual(restarted.sessionId, snapshot.sessionId);
  await tick();
});

// Given the user stops while the decoder init promise is still pending
// When that init finally REJECTS (rather than resolving late)
// Then the session stays Stopped, cleanup completes, and no error is surfaced
test('UT-090 a pending init rejection after stop stays silent', async () => {
  const errors = [];
  let rejectClient;
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => Promise.resolve(fakeStream()),
    createClient: () => new Promise((resolve, reject) => { rejectClient = reject; }),
    onError: (code) => errors.push(code),
  });

  coordinator.startLive({ requestId: 'live-1' });
  await tick();
  assert.equal(coordinator.snapshot().state, 'Preparing');

  coordinator.stop();
  assert.equal(coordinator.snapshot().state, 'Stopping');

  rejectClient(Object.assign(new Error('init failed'), { code: 15002 }));
  await tick();

  const snapshot = coordinator.snapshot();
  assert.equal(snapshot.state, 'Stopped');
  assert.equal(snapshot.cleanupComplete, true);
  assert.deepEqual(errors, [], 'a user-initiated stop settles silently');
});

// Given an unconverged live cancellation (pending decoder init)
// When the user imports a recording instead
// Then startVideo refuses with reason 'cleanup' and starts no session; after
// convergence the same video entry is admitted normally
test('UT-091 startVideo honours the same cleanup gate as startLive', async () => {
  let createCalls = 0;
  let opened = 0;
  let rejectPicker;
  let resolveClient;
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve, reject) => { rejectPicker = reject; }),
    createClient: () => {
      createCalls += 1;
      return new Promise((resolve) => { resolveClient = resolve; });
    },
  });

  coordinator.startLive({ requestId: 'live-1' });
  rejectPicker(Object.assign(new Error('cancelled'), { code: 12002 }));
  await tick();
  assert.equal(coordinator.snapshot().state, 'Idle');
  assert.equal(coordinator.snapshot().cleanupComplete, false);

  const blocked = coordinator.startVideo({
    requestId: 'video-1',
    openSource: () => { opened += 1; return Promise.resolve({ stop() {} }); },
  });
  assert.deepEqual(blocked, { accepted: false, reason: 'cleanup' });
  assert.equal(opened, 0, 'the file was not opened for a refused start');
  assert.equal(createCalls, 1, 'no second decoder was created');
  assert.equal(coordinator.snapshot().sessionSeq, 1, 'no new session was reserved');

  const late = fakeClient();
  resolveClient(late);
  await tick();
  assert.equal(late.closed, true);
  assert.equal(coordinator.snapshot().cleanupComplete, true);

  const restarted = coordinator.startVideo({
    requestId: 'video-2',
    openSource: () => { opened += 1; return Promise.resolve({ stop() {} }); },
  });
  assert.equal(restarted.accepted, true, 'the video entry is admitted after convergence');
  resolveClient(fakeClient());
  await tick();
  assert.equal(coordinator.snapshot().state, 'Receiving');
});

// --- Round-1 external review A-03: init failure must converge under stop ---

// Given the user stops while the decoder init promise is still pending
// When the client finally resolves (or the watchdog rejects it)
// Then the session converges to Stopped, the late client is closed, and no
// error is surfaced for a stop the user requested themselves
test('UT-067 stop during pending init converges to Stopped silently', async () => {
  const errors = [];
  let resolveClient;
  const pickers = [];
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve) => { pickers.push(resolve); }),
    createClient: () => new Promise((resolve) => { resolveClient = resolve; }),
    onError: (code) => errors.push(code),
  });

  coordinator.startLive({ requestId: 'live-1' });
  pickers[0](fakeStream());
  await tick();
  assert.equal(coordinator.snapshot().state, 'Preparing');

  coordinator.stop();
  assert.equal(coordinator.snapshot().state, 'Stopping');

  const late = fakeClient();
  resolveClient(late);
  await tick();

  const snapshot = coordinator.snapshot();
  assert.equal(snapshot.state, 'Stopped', 'converges after the late init settles');
  assert.equal(snapshot.cleanupComplete, true);
  assert.equal(late.closed, true);
  assert.deepEqual(errors, [], 'no error surfaced for a user-initiated stop');
});

// Given the decoder worker dies after it was ready and receiving
// When the client reports the channel failure
// Then the session enters a recoverable terminal state with the inputs released
test('UT-068 a post-ready channel failure lands in Stopped', async () => {
  const errors = [];
  const clients = [];
  const pickers = [];
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve) => { pickers.push(resolve); }),
    createClient: () => { const client = fakeClient(); clients.push(client); return Promise.resolve(client); },
    onError: (code) => errors.push(code),
  });

  coordinator.startLive({ requestId: 'live-1' });
  pickers[0](fakeStream());
  await tick();
  assert.equal(coordinator.snapshot().state, 'Receiving');
  assert.equal(typeof clients[0].onFailure, 'function',
    'the coordinator wires the client failure hook');

  clients[0].onFailure(Object.assign(new Error('worker died'), { code: 15010 }));
  await tick();

  assert.equal(coordinator.snapshot().state, 'Stopped');
  assert.equal(clients[0].closed, true, 'inputs are released');
  assert.equal(errors.includes(15010), true);
});


// --- T3.2: save attempts drive the session state machine ---

function readyCoordinator() {
  const clients = [];
  const pickers = [];
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve) => { pickers.push(resolve); }),
    createClient: () => { const client = fakeClient(); clients.push(client); return Promise.resolve(client); },
  });
  coordinator.startLive({ requestId: 's' });
  pickers[0](fakeStream());
  return { coordinator, clients, pickers };
}

test('T3.2.a save events drive Ready -> Saving -> Saved', async () => {
  const { coordinator, clients } = readyCoordinator();
  await tick();
  coordinator.offerFrame({ width: 2, height: 3, pixels: new ArrayBuffer(24) });
  await tick(5);
  clients[0].deliver({ outcome: 'artifact', artifact: { byteCount: 5, name: 'a.bin' } });
  await tick();
  assert.equal(coordinator.snapshot().state, 'Ready');

  coordinator.saveEvent({ saveStatus: 'selecting', attemptId: 'a1' });
  assert.equal(coordinator.snapshot().state, 'Saving');

  coordinator.saveEvent({ saveStatus: 'writing', attemptId: 'a1' });
  assert.equal(coordinator.snapshot().state, 'Saving');

  coordinator.saveEvent({ saveStatus: 'saved', attemptId: 'a1' });
  assert.equal(coordinator.snapshot().state, 'Saved');
  assert.equal(coordinator.snapshot().saveAttemptId, 'a1');
});

test('T3.2.a a failed save lands Retryable and can retry', async () => {
  const { coordinator, clients } = readyCoordinator();
  await tick();
  coordinator.offerFrame({ width: 2, height: 3, pixels: new ArrayBuffer(24) });
  await tick(5);
  clients[0].deliver({ outcome: 'artifact', artifact: { byteCount: 5, name: 'a.bin' } });
  await tick();

  coordinator.saveEvent({ saveStatus: 'selecting', attemptId: 'a1' });
  coordinator.saveEvent({ saveStatus: 'failed', attemptId: 'a1' });
  assert.equal(coordinator.snapshot().state, 'Retryable');

  // a retry (new attempt) goes back through Saving
  coordinator.saveEvent({ saveStatus: 'selecting', attemptId: 'a2' });
  assert.equal(coordinator.snapshot().state, 'Saving');
  coordinator.saveEvent({ saveStatus: 'cancelled', attemptId: 'a2' });
  assert.equal(coordinator.snapshot().state, 'Retryable');

  // and the artifact is still there to save again
  assert.ok(coordinator.snapshot().artifact);
});

test('T3.2.b stop during a pending save converges after settlement', async () => {
  const { coordinator, clients } = readyCoordinator();
  await tick();
  coordinator.offerFrame({ width: 2, height: 3, pixels: new ArrayBuffer(24) });
  await tick(5);
  clients[0].deliver({ outcome: 'artifact', artifact: { byteCount: 5, name: 'a.bin' } });
  await tick();

  coordinator.saveEvent({ saveStatus: 'selecting', attemptId: 'a1' });
  assert.equal(coordinator.snapshot().state, 'Saving');

  let settleSave;
  coordinator.attachSave({ whenSettled: () => new Promise((resolve) => { settleSave = resolve; }) });

  coordinator.stop();
  assert.equal(coordinator.snapshot().state, 'Stopping');

  settleSave();
  await tick();

  assert.equal(coordinator.snapshot().state, 'Stopped');
  assert.equal(coordinator.snapshot().cleanupComplete, true);
});

// --- T7 receiver UX observation hooks (UX-UT-012..016) ----------------------
//
// The coordinator gains an optional observation path: a fresh ux model per
// session comes in via options.createUx, a monotonic clock via options.nowMs,
// and the真实 createClient factory receives the captured owner. The legacy
// paths are untouched: every assertion below pins a UX hook, never state.

// A ux model double: records every action call and answers with a cheap
// ok Ack. The session must drive the actions; nothing here decides state.
function uxModelDouble() {
  const calls = [];
  const ack = (seq, revision) => ({
    ok: true, code: 0,
    data: { sessionSeq: seq, applied: true, observationRevision: revision },
  });
  return {
    calls,
    begin(request) { calls.push({ name: 'begin', request }); return ack(request.sessionSeq, 1); },
    acceptFrame(input) { calls.push({ name: 'acceptFrame', input }); return ack(input.sessionSeq, calls.length); },
    observeSave(request) { calls.push({ name: 'observeSave', request }); return ack(request.sessionSeq, calls.length); },
    finish(request) { calls.push({ name: 'finish', request }); return ack(request.sessionSeq, calls.length); },
  };
}

function uxSessionHarness() {
  const clients = [];
  const pickers = [];
  const observations = [];
  const snapshotEvents = [];
  const clock = { now: 100 };
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve) => { pickers.push(resolve); }),
    createClient: (owner) => {
      const client = fakeClient();
      clients.push({ client, owner });
      return Promise.resolve(client);
    },
    createUx: () => { const model = uxModelDouble(); observations.push(model); return model; },
    nowMs: () => clock.now,
    onSnapshot: (snapshot) => snapshotEvents.push(snapshot),
  });
  return { coordinator, clients, pickers, observations, snapshotEvents, clock };
}

const acceptsOf = (model) => model.calls.filter((c) => c.name === 'acceptFrame');
const callsNamed = (model, name) => model.calls.filter((c) => c.name === name);

// Start a session and converge it to Receiving; `clock.now` is set to 600
// before the last readiness dependency resolves, so a model begin carries it.
async function reachReceiving(harness, kind = 'live') {
  const { coordinator, pickers, clock } = harness;
  if (kind === 'live') {
    coordinator.startLive({ requestId: 'ux-live-1' });
    clock.now = 600;
    pickers[0](fakeStream());
  } else {
    coordinator.startVideo({
      requestId: 'ux-video-1',
      openSource: () => Promise.resolve({ stop() {} }),
    });
    clock.now = 600;
  }
  await tick(5);
  assert.equal(coordinator.snapshot().state, 'Receiving');
  assert.equal(observationsOf(harness).length, 1, 'one fresh ux model for this session');
  return harness.observations[0];
}

function observationsOf(harness) {
  return harness.observations;
}

// Push a frame through the live scheduler and resolve its real reply. Accepts
// either a uxSessionHarness ({client,...} pairs) or a raw client list.
async function deliverFrame(harness, index, result) {
  const { coordinator } = harness;
  coordinator.offerFrame({ width: 2, height: 3, pixels: new ArrayBuffer(24) });
  await tick(1);
  const entry = harness.clients[index];
  const client = entry && entry.client ? entry.client : entry;
  client.deliver(result);
  await tick(5);
}

test('UX-UT-012 Receiving begins the observation once with the real owner and clock', async () => {
  const h = uxSessionHarness();
  h.coordinator.startLive({ requestId: 'ux-live-1' });
  await tick();

  assert.equal(h.coordinator.snapshot().state, 'Preparing');
  assert.equal(observationsOf(h).length, 0,
    'no ux model and no begin while the session is still Preparing');

  h.clock.now = 600; // the readiness that finishes last resolves here
  h.pickers[0](fakeStream());
  await tick(5);

  assert.equal(h.coordinator.snapshot().state, 'Receiving');
  const model = observationsOf(h)[0];
  assert.equal(callsNamed(model, 'begin').length, 1,
    'one begin, not one per readiness dependency');
  const begin = callsNamed(model, 'begin')[0].request;
  assert.equal(begin.version, 1);
  assert.equal(begin.sessionId, 's1');
  assert.equal(begin.sessionSeq, 1);
  assert.equal(begin.inputKind, 'live');
  assert.equal(begin.nowMs, 600, 'the begin carries the real Receiving-entry time');

  // the client factory was given the owner captured at creation time
  assert.deepEqual(h.clients[0].owner, { sessionId: 's1', sessionSeq: 1 });

  // a real data frame reaches the model exactly once, stamped on this clock
  h.clock.now = 800;
  await deliverFrame(h, 0, { frameId: 1, outcome: 'data', bytesDecoded: 625 });
  const accept = callsNamed(model, 'acceptFrame');
  assert.equal(accept.length, 1);
  const input = accept[0].input;
  assert.equal(input.version, 1);
  assert.equal(input.sessionId, 's1');
  assert.equal(input.sessionSeq, 1);
  assert.equal(input.frameId, 1);
  assert.equal(input.receivedAtMs, 800, 'receivedAt taken on the main thread clock');
  assert.equal(input.outcome, 'data');
  assert.equal(input.bytesDecoded, 625, 'the decoded bytes from the original result');
  assert.deepEqual(input.report,
    { state: 'unavailable', ratios: [], diagnosticCode: 19015 },
    'an old worker without the observation drops to 19015, keeping the data path');

  // stopping lands exactly one genuine stopped finish
  h.clock.now = 900;
  h.coordinator.stop();
  await tick(5);
  const finishes = callsNamed(model, 'finish');
  assert.equal(finishes.length, 1, 'one finish for one genuine terminal');
  assert.deepEqual(finishes[0].request,
    { version: 1, sessionId: 's1', sessionSeq: 1, nowMs: 900, reason: 'stopped', artifactId: null });
});

test('UX-UT-012 the video entry and reversed readiness order also begin exactly once', async () => {
  // video kind, decoder first, source second: no begin while the source is pending
  const h = uxSessionHarness();
  let resolveSource;
  h.coordinator.startVideo({
    requestId: 'ux-video-1',
    openSource: () => new Promise((resolve) => { resolveSource = resolve; }),
  });
  await tick();
  assert.equal(h.coordinator.snapshot().state, 'Preparing');
  assert.equal(observationsOf(h).length, 0, 'no begin before both dependencies are ready');

  h.clock.now = 700;
  resolveSource({ stop() {} });
  await tick(5);
  assert.equal(h.coordinator.snapshot().state, 'Receiving');
  const model = observationsOf(h)[0];
  assert.equal(callsNamed(model, 'begin').length, 1);
  assert.equal(callsNamed(model, 'begin')[0].request.inputKind, 'video');
  assert.equal(callsNamed(model, 'begin')[0].request.nowMs, 700);

  // live kind, source first and decoder second: still exactly one begin
  const pickers = [];
  const observations = [];
  const clock = { now: 100 };
  let resolveClient;
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve) => { pickers.push(resolve); }),
    createClient: () => new Promise((resolve) => { resolveClient = resolve; }),
    createUx: () => { const extra = uxModelDouble(); observations.push(extra); return extra; },
    nowMs: () => clock.now,
  });
  coordinator.startLive({ requestId: 'ux-live-2' });
  await tick();
  pickers[0](fakeStream()); // media ready first, decoder still pending
  await tick();
  assert.equal(coordinator.snapshot().state, 'Preparing');
  assert.equal(observations.length, 0, 'no begin from the source alone');

  clock.now = 650;
  resolveClient(fakeClient());
  await tick(5);
  assert.equal(coordinator.snapshot().state, 'Receiving');
  assert.equal(observations.length, 1);
  assert.equal(callsNamed(observations[0], 'begin').length, 1,
    'the reversed readiness order still begins exactly once');
  assert.equal(callsNamed(observations[0], 'begin')[0].request.inputKind, 'live');
  assert.equal(callsNamed(observations[0], 'begin')[0].request.nowMs, 650);
});

test('UX-UT-013 the observation maps the bypass, never the core result', async () => {
  const h = uxSessionHarness();
  const model = await reachReceiving(h);
  const fakeObservation = (patch) => Object.assign({
    version: 1,
    report: { state: 'single', ratios: [0.426], diagnosticCode: 0 },
  }, patch);

  // (1) no observation on a real data frame: 19015, bytes kept
  await deliverFrame(h, 0, { frameId: 1, outcome: 'data', bytesDecoded: 625 });
  let accept = acceptsOf(model).at(-1).input;
  assert.deepEqual(accept.report, { state: 'unavailable', ratios: [], diagnosticCode: 19015 });
  assert.equal(accept.bytesDecoded, 625);

  // (2) an unsupported observation version: 19013
  await deliverFrame(h, 0, { frameId: 2, outcome: 'data', bytesDecoded: 625, uxObservation: fakeObservation({ version: 2 }) });
  accept = acceptsOf(model).at(-1).input;
  assert.deepEqual(accept.report, { state: 'unavailable', ratios: [], diagnosticCode: 19013 });
  assert.equal(accept.bytesDecoded, 625);

  // (3) a structurally invalid observation: 19008
  await deliverFrame(h, 0, {
    frameId: 3, outcome: 'data', bytesDecoded: 625,
    uxObservation: { version: 1, report: { state: 'single', ratios: 'oops', diagnosticCode: 0 } },
  });
  accept = acceptsOf(model).at(-1).input;
  assert.deepEqual(accept.report, { state: 'unavailable', ratios: [], diagnosticCode: 19008 });

  // (4) a valid observation flows through unchanged
  await deliverFrame(h, 0, { frameId: 4, outcome: 'data', bytesDecoded: 625, uxObservation: fakeObservation({}) });
  accept = acceptsOf(model).at(-1).input;
  assert.deepEqual(accept.report, { state: 'single', ratios: [0.426], diagnosticCode: 0 });

  // (5) no_data and error always carry not_sampled and zero bytes
  await deliverFrame(h, 0, { frameId: 5, outcome: 'no_data', bytesDecoded: 0 });
  accept = acceptsOf(model).at(-1).input;
  assert.equal(accept.outcome, 'no_data');
  assert.equal(accept.bytesDecoded, 0);
  assert.deepEqual(accept.report, { state: 'not_sampled', ratios: [], diagnosticCode: 0 });

  await deliverFrame(h, 0, { frameId: 6, outcome: 'error', errorCode: 15005 });
  accept = acceptsOf(model).at(-1).input;
  assert.equal(accept.outcome, 'error');
  assert.equal(accept.bytesDecoded, 0);
  assert.deepEqual(accept.report, { state: 'not_sampled', ratios: [], diagnosticCode: 0 });

  // (6) a real artifact keeps its business landing AND feeds the model:
  // both the accept and one artifact finish, with the artifact identity
  await deliverFrame(h, 0, { frameId: 7, outcome: 'artifact', bytesDecoded: 625, artifact: { artifactId: '42', byteCount: 5 } });
  assert.equal(h.coordinator.snapshot().state, 'Ready',
    'the artifact path is the original business behavior');
  accept = acceptsOf(model).at(-1).input;
  assert.equal(accept.outcome, 'artifact');
  assert.equal(accept.bytesDecoded, 625);
  const finishes = callsNamed(model, 'finish');
  assert.equal(finishes.length, 1, 'the artifact terminal finishes the observation');
  assert.equal(finishes[0].request.reason, 'artifact');
  assert.equal(finishes[0].request.artifactId, '42');

  // a later stop must not move the frozen endpoint with a second finish
  await deliverFrame(h, 0, { frameId: 8, outcome: 'data', bytesDecoded: 625 });
  h.coordinator.stop();
  await tick(5);
  assert.equal(callsNamed(model, 'finish').length, 1,
    'stays one finish after a terminal, whether or not the model freezes it');
});

test('UX-UT-014 stale results never feed the model of the next session', async () => {
  const clients = [];
  const pickers = [];
  const observations = [];
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve) => { pickers.push(resolve); }),
    createClient: () => {
      const client = fakeClient();
      clients.push(client);
      return Promise.resolve(client);
    },
    createUx: () => { const model = uxModelDouble(); observations.push(model); return model; },
  });

  // session A (live) receives a real data frame
  coordinator.startLive({ requestId: 'a' });
  pickers[0](fakeStream());
  await tick(5);
  await deliverFrame({ coordinator, clients, pickers, observations }, 0,
    { frameId: 1, outcome: 'data', bytesDecoded: 625 });
  assert.equal(acceptsOf(observations[0]).length, 1);

  // a second submission stays genuinely in flight (controlled pending promise)
  // while the user stops the session and a new one begins
  coordinator.offerFrame({ width: 2, height: 3, pixels: new ArrayBuffer(24) });
  await tick(1);

  coordinator.stop();
  await tick();
  assert.equal(coordinator.snapshot().state, 'Stopped');

  // session B (video) via the cleanup gate; the sequencing never crosses
  coordinator.startVideo({ requestId: 'b', openSource: () => Promise.resolve({ stop() {} }) });
  await tick(5);
  assert.equal(coordinator.snapshot().state, 'Receiving');
  assert.equal(observations.length, 2, 'a fresh model per session');
  assert.equal(callsNamed(observations[1], 'begin').length, 1);

  // a late A result now arrives: it must not touch B's model or snapshot
  const before = coordinator.snapshot();
  clients[0].deliver({ frameId: 99, outcome: 'data', bytesDecoded: 12345 });
  await tick(5);
  const after = coordinator.snapshot();
  assert.equal(acceptsOf(observations[1]).length, 0,
    "a late frame from session A does not feed session B's model");
  assert.equal(acceptsOf(observations[0]).length, 1,
    'and does not retroactively feed the frozen A model either');
  assert.equal(after.revision, before.revision, 'the business revision is untouched');
  assert.equal(after.sessionSeq, 2, 'the current session stays B');

  // B's own fresh frame is accepted once
  coordinator.offerFrame({ width: 2, height: 3, pixels: new ArrayBuffer(24) });
  await tick(1);
  clients[1].deliver({ frameId: 1, outcome: 'data', bytesDecoded: 625 });
  await tick(5);
  assert.equal(acceptsOf(observations[1]).length, 1, 'the current frame is counted exactly once');
  assert.equal(acceptsOf(observations[1])[0].input.frameId, 1);
});

test('T12-S1 save events drive Saving/Saved/Retryable observations through a real save', async () => {
  const makeReady = async () => {
    const clients = [];
    const pickers = [];
    const clock = { now: 100 };
    const coordinator = new SessionCoordinator({
      getDisplayMedia: () => new Promise((resolve) => { pickers.push(resolve); }),
      createClient: () => {
        const client = fakeClient();
        clients.push(client);
        return Promise.resolve(client);
      },
      createUx: () => new ReceiverTelemetry(),
      nowMs: () => clock.now,
    });
    coordinator.startLive({ requestId: 'T12-S1' });
    pickers[0](fakeStream());
    await tick(5);
    clock.now = 500;
    coordinator.offerFrame({ width: 2, height: 3, pixels: new ArrayBuffer(24) });
    await tick(1);
    clients[0].deliver({ frameId: 1, outcome: 'artifact', bytesDecoded: 625,
      artifact: { artifactId: '42', byteCount: 128 } });
    await tick(5);
    return { coordinator, clients, clock };
  };
  const requestAt = (coordinator, nowMs) => {
    const snap = coordinator.snapshot();
    const context = {
      state: snap.state,
      businessRevision: snap.revision,
      inputKind: snap.inputKind,
      cleanupComplete: snap.cleanupComplete,
      artifactId: snap.artifact ? '42' : null,
      controls: { canStartLive: false, canImportVideo: false, canStop: true, canSave: true },
      inFlight: false,
      inFlightSinceMs: null,
      mediaPosition: null,
      mediaDiagnosticCode: 0,
    };
    return { version: 1, sessionId: 's1', sessionSeq: 1, nowMs, context };
  };
  const statusAt = (harness, nowMs) => {
    const result = readView(harness.coordinator.uxTelemetry().snapshot(),
      requestAt(harness.coordinator, nowMs));
    return result;
  };

  // the successful walk: selecting -> writing -> pending -> saved
  const ok = await makeReady();
  assert.equal(ok.coordinator.snapshot().state, 'Ready');
  assert.equal(typeof ok.coordinator.uxSaveIntent, 'function',
    'the save click hook exists');
  ok.coordinator.uxSaveIntent();

  ok.clock.now = 800;
  ok.coordinator.saveEvent({ saveStatus: 'selecting', attemptId: 7 });
  let view = statusAt(ok, 800);
  assert.equal(view.ok, true, 'the saving projection must be complete during the save');
  assert.equal(view.data.state, 'Saving');
  assert.equal(view.data.statusKey, 'saving_selecting');

  ok.clock.now = 850;
  ok.coordinator.saveEvent({ saveStatus: 'writing', attemptId: 7, lastError: null });
  view = statusAt(ok, 850);
  assert.equal(view.data.statusKey, 'saving_writing');

  ok.clock.now = 900;
  ok.coordinator.saveEvent({ saveStatus: 'pending', attemptId: 7 });
  view = statusAt(ok, 900);
  assert.equal(view.data.statusKey, 'saving_pending');

  ok.clock.now = 950;
  ok.coordinator.saveEvent({ saveStatus: 'saved', attemptId: 7 });
  view = statusAt(ok, 950);
  assert.equal(view.data.statusKey, 'saved');
  assert.equal(view.data.save.phase, 'saved');
  assert.equal(view.data.save.attemptId, '7');
  assert.equal(view.data.elapsedMs, 400,
    'frozen at the artifact (500-100); the save time is not receiving time');
  // a late writing event for the settled attempt never rewrites the save view
  ok.coordinator.saveEvent({ saveStatus: 'writing', attemptId: 7, lastError: null });
  view = statusAt(ok, 960);
  assert.equal(view.ok, true, 'Saved stays projectable after a late event');
  assert.equal(view.data.statusKey, 'saved');

  // the cancelled walk: failed+16002 -> Retryable, a retryable save can restart
  const cancel = await makeReady();
  cancel.coordinator.uxSaveIntent();
  cancel.clock.now = 800;
  cancel.coordinator.saveEvent({ saveStatus: 'selecting', attemptId: 8 });
  view = statusAt(cancel, 800);
  assert.equal(view.data.statusKey, 'saving_selecting');

  cancel.clock.now = 850;
  cancel.coordinator.saveEvent({ saveStatus: 'failed', attemptId: 8, lastError: 16002 });
  view = statusAt(cancel, 850);
  assert.equal(view.data.state, 'Retryable');
  assert.equal(view.data.statusKey, 'save_cancelled',
    'failed+16002 normalizes to a cancel for the user');
  assert.equal(view.data.save.artifactId, '42', 'the owner artifact is kept');

  // the retry after the cancel goes through Saving again (a new attempt)
  cancel.coordinator.uxSaveIntent();
  cancel.clock.now = 900;
  cancel.coordinator.saveEvent({ saveStatus: 'selecting', attemptId: 9 });
  view = statusAt(cancel, 900);
  assert.equal(view.data.state, 'Saving');
  assert.equal(view.data.statusKey, 'saving_selecting',
    'Retryable re-enters Saving with the fresh attempt');

  // a real busy guard during the write is still the writing phase
  cancel.clock.now = 950;
  cancel.coordinator.saveEvent({ saveStatus: 'writing', attemptId: 9, lastError: null });
  cancel.coordinator.saveEvent({ saveStatus: 'writing', attemptId: 9, lastError: 16008 });
  view = statusAt(cancel, 950);
  assert.equal(view.data.statusKey, 'saving_writing');
  assert.equal(view.data.save.errorCode, 16008,
    'the busy guard stays writing, never a fake failure');

  // a stale event of the already settled attempt 8 is ignored by the ux
  // observation; the original business bookkeeping is untouched
  cancel.coordinator.saveEvent({ saveStatus: 'writing', attemptId: 8, lastError: null });
  view = statusAt(cancel, 1000);
  assert.equal(view.ok, true);
  assert.equal(view.data.save.attemptId, '9',
    'the stale attempt never takes over the save view');
  assert.equal(view.data.statusKey, 'saving_writing');
});

test('UX-UT-015 every genuine terminal finishes with its own reason', async () => {
  // (a) Ready through a real artifact
  const ready = uxSessionHarness();
  const readyModel = await reachReceiving(ready);
  await deliverFrame(ready, 0,
    { frameId: 1, outcome: 'artifact', bytesDecoded: 625, artifact: { artifactId: '42', byteCount: 5 } });
  const readyFinish = callsNamed(readyModel, 'finish').at(-1).request;
  assert.equal(readyFinish.reason, 'artifact');
  assert.equal(readyFinish.artifactId, '42');

  // (b) Incomplete through the end-of-input drain
  const stopping = uxSessionHarness();
  const stoppingModel = await reachReceiving(stopping);
  await stopping.coordinator.finishStream({ takeFinalSample: () => null });
  const stoppingFinish = callsNamed(stoppingModel, 'finish').at(-1).request;
  assert.equal(stoppingFinish.reason, 'incomplete');
  assert.equal(stoppingFinish.artifactId, null);
  assert.equal(stoppingFinish.nowMs, 600, 'the finish carries this main-thread clock');

  // (c) Stopped via the user
  const stopped = uxSessionHarness();
  const stoppedModel = await reachReceiving(stopped);
  stopped.clock.now = 1200;
  stopped.coordinator.stop();
  await tick(5);
  assert.equal(callsNamed(stoppedModel, 'finish').length, 1);
  assert.equal(callsNamed(stoppedModel, 'finish')[0].request.reason, 'stopped');

  // (d) error through the real failure hook
  const failed = uxSessionHarness();
  const failedModel = await reachReceiving(failed);
  failed.clock.now = 1400;
  failed.clients[0].client.onFailure(
    Object.assign(new Error('worker died'), { code: 15010 }));
  await tick(5);
  const failedFinish = callsNamed(failedModel, 'finish').at(-1).request;
  assert.equal(failedFinish.reason, 'error');
  assert.equal(failedFinish.artifactId, null);
});

test('UX-UT-016 data-frame results never churn the business snapshot revision', async () => {
  const h = uxSessionHarness();
  const model = await reachReceiving(h);
  const snapshotsBeforeBusiness = h.snapshotEvents.length;
  const revisionBefore = h.coordinator.snapshot().revision;

  // five real data frames: no state transition, so no business revision churn —
  // and precisely one observation accept each
  for (let i = 2; i <= 6; i += 1) {
    await deliverFrame(h, 0, { frameId: i, outcome: 'data', bytesDecoded: 625 });
  }
  const snapshotAfter = h.coordinator.snapshot();
  assert.equal(snapshotAfter.revision, revisionBefore,
    'data frames are not business state transitions');
  assert.equal(h.snapshotEvents.length, snapshotsBeforeBusiness,
    'the business event stream stays silent during frame counts');

  // ux reads out of the exact Double: no pushes, and the projected model state
  // cannot invent business revisions in either direction
  assert.equal(acceptsOf(model).length, 5, 'each frame observed exactly once');
  assert.equal(callsNamed(model, 'observeSave').length, 0,
    'no save observation without a genuine save event');
});

// --- T10: duplicate injection from both callable entries (real model) --------

test('T10 a duplicate result from either entry counts exactly once', async () => {
  const clients = [];
  const pickers = [];
  const observations = [];
  const clock = { now: 100 };
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve) => { pickers.push(resolve); }),
    createClient: () => { const client = fakeClient(); clients.push(client); return Promise.resolve(client); },
    createUx: () => { const model = new ReceiverTelemetry(); observations.push(model); return model; },
    nowMs: () => clock.now,
  });

  // live session: the real onResult path delivers once
  coordinator.startLive({ requestId: 'live-1' });
  pickers[0](fakeStream());
  await tick(5);
  const liveSeq = coordinator.snapshot().sessionSeq;

  coordinator.offerFrame({ width: 2, height: 3, pixels: new ArrayBuffer(24) });
  await tick(1);
  clients[0].deliver({ frameId: 1, outcome: 'data', bytesDecoded: 625 });
  await tick(5);

  let snap = coordinator.uxTelemetry().snapshot();
  const liveRevision = snap.observationRevision;
  const liveBytes = snap.rate.buckets.reduce((sum, b) => sum + b.bytes, 0);
  assert.equal(liveBytes, 625, 'the live frame is counted once');

  // the artificial duplicate through the same entry (live onResult path)
  clock.now = 200;
  coordinator._onFrameResult(liveSeq, { frameId: 1, outcome: 'data', bytesDecoded: 625 });
  coordinator._onFrameResult(liveSeq, { frameId: 1, outcome: 'data', bytesDecoded: 625 });
  snap = coordinator.uxTelemetry().snapshot();
  assert.equal(snap.observationRevision, liveRevision,
    'duplicates never lift the observation revision');
  assert.equal(snap.rate.buckets.reduce((sum, b) => sum + b.bytes, 0), 625,
    'duplicates never double the counted bytes');

  await coordinator.finishStream({ takeFinalSample: () => null });
  assert.equal(coordinator.snapshot().state, 'Incomplete');

  // video session: the submitAndWait await path also delivers once
  coordinator.startVideo({
    requestId: 'video-1',
    openSource: () => Promise.resolve({ stop() {} }),
  });
  await tick(5);
  const videoSeq = coordinator.snapshot().sessionSeq;
  const submission = coordinator.submitVideoFrame(
    { width: 2, height: 3, pixels: new ArrayBuffer(24) });
  await tick(1);
  clients[1].deliver({ frameId: 1, outcome: 'data', bytesDecoded: 625 });
  const videoResult = await submission;
  assert.equal(videoResult.outcome, 'data');

  snap = coordinator.uxTelemetry().snapshot();
  const videoRevision = snap.observationRevision;
  assert.equal(snap.rate.buckets.reduce((sum, b) => sum + b.bytes, 0), 625,
    'the video frame is counted once');

  // the artificial duplicate through the await path entry
  clock.now = 400;
  coordinator._onFrameResult(videoSeq, { frameId: 1, outcome: 'data', bytesDecoded: 625 });
  snap = coordinator.uxTelemetry().snapshot();
  assert.equal(snap.observationRevision, videoRevision);
  assert.equal(snap.rate.buckets.reduce((sum, b) => sum + b.bytes, 0), 625);

  // the scheduler never double-fires either: one submission, one await result
  assert.equal(coordinator.snapshot().stats.submitted, 1,
    'the video session submitted exactly one frame');
});

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

// Given the user cancels the picker three times in a row
// When each parallel init eventually returns
// Then every client is closed and no resource survives
test('UT-066 repeated cancellations release every late client', async () => {
  const clients = [];
  const resolvers = [];
  let rejectPicker;
  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve, reject) => { rejectPicker = reject; }),
    createClient: () => new Promise((resolve) => { resolvers.push(resolve); }),
  });

  for (let round = 1; round <= 3; round += 1) {
    coordinator.startLive({ requestId: `live-${round}` });
    rejectPicker(Object.assign(new Error('cancelled'), { code: 12002 }));
    await tick(); // the rejection settles in a microtask before the next start
  }
  await tick();
  assert.equal(coordinator.snapshot().state, 'Idle');

  for (const resolve of resolvers) {
    const client = fakeClient();
    clients.push(client);
    resolve(client);
  }
  await tick();
  assert.equal(clients.length, 3);
  assert.equal(clients.filter((client) => client.closed).length, 3,
    'every late client was closed');
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

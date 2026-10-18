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

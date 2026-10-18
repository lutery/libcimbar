// UT-007..UT-012: session coordination. All dependencies are injected; no
// real media API or Worker is touched here.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SessionCoordinator } from '../../src/session.js';

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

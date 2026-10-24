// UT-055..UT-062, UT-085..UT-087: main-thread DecoderClient failure
// convergence. Round-1 external review A-03/B-S03: every exit (worker error,
// messageerror, close, postMessage failure, init/frame watchdog timeout)
// must settle init and frame promises exactly once, terminate the dead
// worker, and surface a registered code (15010/15011/14003). UT-085..087
// close the round-3 A-R1/B-R1 gap: a PROTOCOL init failure (init-failed) and
// a throwing frame postMessage must release the worker too.
import test from 'node:test';
import assert from 'node:assert/strict';

import { DecoderClient } from '../../src/decoder-client.js';

function fakeWorker() {
  return {
    terminated: false,
    posted: [],
    terminate() { this.terminated = true; },
    postMessage(msg) { this.posted.push(msg); },
    emit(data) { if (this.onmessage) this.onmessage({ data }); },
    fireError(message) { if (this.onerror) this.onerror({ message }); },
    fireMessageError() { if (this.onmessageerror) this.onmessageerror({}); },
  };
}

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
const FRAME_PIXELS = new ArrayBuffer(2 * 3 * 4);

function initMessage() {
  return { type: 'init', mode: 68, assets: [], limits: {} };
}

// Given the worker script never loads
// When onerror fires before the worker can answer init
// Then init rejects with 15010 and the dead worker is terminated
test('UT-055 worker error before ready rejects init with 15010', async () => {
  const worker = fakeWorker();
  const client = new DecoderClient(worker, { initTimeoutMs: 500, frameTimeoutMs: 500 });
  const init = client.init(initMessage());
  worker.fireError('script load failed');
  await assert.rejects(init, (error) => error.code === 15010);
  assert.equal(worker.terminated, true, 'the dead worker is terminated');
});

// Given the channel dies mid-session
// When messageerror fires with a frame in flight
// Then the frame rejects with 15010 and onFailure reports the death once
test('UT-056 messageerror rejects pending frames with 15010', async () => {
  const worker = fakeWorker();
  const client = new DecoderClient(worker, { initTimeoutMs: 500, frameTimeoutMs: 500 });
  const init = client.init(initMessage());
  worker.emit({ type: 'ready', mode: 68 });
  await init;

  const failures = [];
  client.onFailure = (error) => failures.push(error.code);
  const frame = client.submitFrame({ width: 2, height: 3, pixels: FRAME_PIXELS });
  worker.fireMessageError();
  await assert.rejects(frame, (error) => error.code === 15010);
  assert.deepEqual(failures, [15010], 'onFailure fired exactly once');
  assert.equal(worker.terminated, true);
});

// Given init is still pending
// When the owner closes the client (stop during init)
// Then init rejects instead of hanging forever
test('UT-057 close during pending init settles the init promise', async () => {
  const worker = fakeWorker();
  const client = new DecoderClient(worker, { initTimeoutMs: 500, frameTimeoutMs: 500 });
  const init = client.init(initMessage());
  client.close();
  await assert.rejects(init, (error) => error.code === 15010);
  assert.equal(worker.terminated, true);
});

// Given the worker never answers init
// When the main-thread init watchdog expires
// Then init rejects with 15011, the worker is terminated, and a late
// 'ready' cannot settle the already-rejected promise
test('UT-058 init watchdog times out with 15011', async () => {
  const worker = fakeWorker();
  const client = new DecoderClient(worker, { initTimeoutMs: 10, frameTimeoutMs: 500 });
  const init = client.init(initMessage());
  await assert.rejects(init, (error) => error.code === 15011);
  assert.equal(worker.terminated, true, 'a silent worker is terminated');
  worker.emit({ type: 'ready', mode: 68 }); // late ready: must not throw
  await tick(5);
});

// Given a frame is in flight and the worker is wedged (no reply)
// When the frame watchdog expires
// Then the frame rejects with 14003, the worker is terminated, and the
// owner is told once so the session can enter a recoverable terminal state
test('UT-059 frame watchdog times out with 14003 and fails the channel', async () => {
  const worker = fakeWorker();
  const client = new DecoderClient(worker, { initTimeoutMs: 500, frameTimeoutMs: 10 });
  const init = client.init(initMessage());
  worker.emit({ type: 'ready', mode: 68 });
  await init;

  const failures = [];
  client.onFailure = (error) => failures.push(error.code);
  const frame = client.submitFrame({ width: 2, height: 3, pixels: FRAME_PIXELS });
  await assert.rejects(frame, (error) => error.code === 14003);
  assert.equal(worker.terminated, true, 'a wedged worker is terminated');
  assert.deepEqual(failures, [14003]);
});

// Given postMessage itself throws (worker already gone)
// When submitting a frame
// Then the frame rejects with 15010 instead of hanging
test('UT-060 a throwing postMessage rejects the frame with 15010', async () => {
  const worker = fakeWorker();
  const client = new DecoderClient(worker, { initTimeoutMs: 500, frameTimeoutMs: 500 });
  const init = client.init(initMessage());
  worker.emit({ type: 'ready', mode: 68 });
  await init;

  worker.postMessage = () => { throw new Error('gone'); };
  await assert.rejects(
    client.submitFrame({ width: 2, height: 3, pixels: FRAME_PIXELS }),
    (error) => error.code === 15010
  );
});

// Given the channel already died once
// When further errors arrive
// Then init stays settled-once and onFailure is notified exactly once
test('UT-061 channel failures settle exactly once', async () => {
  const worker = fakeWorker();
  const client = new DecoderClient(worker, { initTimeoutMs: 500, frameTimeoutMs: 500 });
  const init = client.init(initMessage());
  worker.emit({ type: 'ready', mode: 68 });
  await init;

  const failures = [];
  client.onFailure = (error) => failures.push(error.code);
  worker.fireError('first');
  worker.fireError('second');
  await tick(5);
  assert.equal(failures.length, 1, 'onFailure fired exactly once');
  assert.equal(worker.terminated, true);
  // a late init-failed message must not double-settle anything
  worker.emit({ type: 'init-failed', code: 15002 });
  await tick(5);
  assert.equal(failures.length, 1);
});

// Given a healthy worker
// When init and frames flow normally
// Then results resolve as before and close still terminates the worker
test('UT-062 the healthy path still works', async () => {
  const worker = fakeWorker();
  const client = new DecoderClient(worker, { initTimeoutMs: 500, frameTimeoutMs: 500 });
  const init = client.init(initMessage());
  worker.emit({ type: 'ready', mode: 68 });
  const ready = await init;
  assert.equal(ready.mode, 68);
  assert.equal(worker.terminated, false);

  const frame = client.submitFrame({ width: 2, height: 3, pixels: FRAME_PIXELS });
  const frameId = worker.posted[worker.posted.length - 1].frameId;
  worker.emit({ type: 'frame-result', frameId, outcome: 'no_data' });
  const result = await frame;
  assert.equal(result.outcome, 'no_data');

  client.close();
  assert.equal(worker.terminated, true);
});

// --- Round-3 A-R1/B-R1: the protocol init failure must release the worker ---

// Given the worker's own digest/asset verification fails and posts init-failed
// When the protocol rejection arrives before ready
// Then init rejects with the worker's code, the worker is terminated, and
// onFailure stays silent (the session never adopted the client yet)
test('UT-085 protocol init-failed terminates the worker and rejects init', async () => {
  const worker = fakeWorker();
  const client = new DecoderClient(worker, { initTimeoutMs: 500, frameTimeoutMs: 500 });
  const failures = [];
  client.onFailure = (error) => failures.push(error.code);
  const init = client.init(initMessage());
  worker.emit({ type: 'init-failed', code: 18002, detail: 'wasm digest mismatch' });
  await assert.rejects(init, (error) => error.code === 18002);
  assert.equal(worker.terminated, true, 'the failed worker is released');
  assert.deepEqual(failures, [], 'onFailure stays silent before ready');
});

// Given postMessage itself throws while the init message is being sent
// When init is called
// Then init rejects with 15010 and the worker is terminated
test('UT-086 a throwing init postMessage terminates the worker', async () => {
  const worker = fakeWorker();
  worker.postMessage = () => { throw new Error('gone'); };
  const client = new DecoderClient(worker, { initTimeoutMs: 500, frameTimeoutMs: 500 });
  const failures = [];
  client.onFailure = (error) => failures.push(error.code);
  await assert.rejects(client.init(initMessage()), (error) => error.code === 15010);
  assert.equal(worker.terminated, true, 'the dead worker is released');
  assert.deepEqual(failures, [], 'onFailure stays silent before ready');
});

// Given a frame is already in flight and postMessage now throws for a new one
// When submitting the next frame
// Then the throwing frame rejects with 15010, the still-pending frames reject
// with the same failure, the worker is terminated, and the owner is told once
test('UT-087 a throwing frame postMessage converges the whole channel', async () => {
  const worker = fakeWorker();
  const client = new DecoderClient(worker, { initTimeoutMs: 500, frameTimeoutMs: 500 });
  const init = client.init(initMessage());
  worker.emit({ type: 'ready', mode: 68 });
  await init;

  const failures = [];
  client.onFailure = (error) => failures.push(error.code);
  const first = client.submitFrame({ width: 2, height: 3, pixels: new ArrayBuffer(24) });
  assert.equal(worker.posted.length, 2, 'init and the first frame went out');
  worker.postMessage = () => { throw new Error('gone'); };
  const second = client.submitFrame({ width: 2, height: 3, pixels: new ArrayBuffer(24) });
  await assert.rejects(second, (error) => error.code === 15010);
  await assert.rejects(first, (error) => error.code === 15010,
    'the other pending frame rejects with the same failure');
  assert.equal(worker.terminated, true, 'the dead worker is terminated');
  assert.deepEqual(failures, [15010], 'onFailure fired exactly once');
});

// --- T7 receiver UX pending metadata (UX-UT-008..011) ----------------------
//
// The client keeps, beside its real pending entry, the ux submission
// metadata: owner identity + a real main-thread time captured before
// worker.postMessage. The getter is read-only; every failure exit clears it
// together with its pending entry.

const UX_OBSERVATION_FIXTURE = {
  version: 1,
  report: { state: 'single', ratios: [0.426], diagnosticCode: 0 },
};

function ownedClient({ clock = { now: 100 }, frameTimeoutMs = 500 } = {}) {
  const worker = fakeWorker();
  const client = new DecoderClient(worker, { initTimeoutMs: 500, frameTimeoutMs },
    { owner: { sessionId: 's1', sessionSeq: 1 }, nowMs: () => clock.now });
  return { worker, client, clock };
}

async function ownedReady(client, worker) {
  const init = client.init(initMessage());
  worker.emit({ type: 'ready', mode: 68 });
  await init;
}

// Given a client with an injected owner and a clock that the postMessage spy
// advances only after reading the pending metadata
// When a frame is submitted at t=100 and read again at t=800
// Then submittedAtMs stays 100 (the real post time), the payload carries no
// metadata, and later reads never rewrite it
test('UX-UT-008 pending submittedAtMs comes from the real main-thread post', async () => {
  const clock = { now: 100 };
  const { worker, client } = ownedClient({ clock });
  await ownedReady(client, worker);

  let sawDuringPost = null;
  const basePost = worker.postMessage;
  worker.postMessage = (msg) => {
    if (msg.type === 'frame') {
      sawDuringPost = client.pendingSubmission();
      clock.now = 200; // the worker world only exists after the post
    }
    basePost(msg);
  };

  const frame = client.submitFrame({ width: 2, height: 3, pixels: new ArrayBuffer(24) });
  clock.now = 800;
  assert.deepEqual(sawDuringPost,
    { sessionId: 's1', sessionSeq: 1, frameId: 1, submittedAtMs: 100 },
    'the metadata already exists inside postMessage, stamped before the post');
  assert.deepEqual(client.pendingSubmission(),
    { sessionId: 's1', sessionSeq: 1, frameId: 1, submittedAtMs: 100 },
    'a later read returns the stored time, never the read time');

  worker.emit({ type: 'frame-result', frameId: 1, outcome: 'no_data' });
  const result = await frame;
  assert.equal(result.outcome, 'no_data');
  assert.deepEqual(client.pendingSubmission(), null, 'no fake inFlight after the reply');

  const framePost = worker.posted.find((msg) => msg.type === 'frame');
  assert.equal(Object.keys(framePost).includes('sessionId'), false);
  assert.equal(Object.keys(framePost).includes('submittedAtMs'), false);
  assert.ok('pixels' in framePost, 'the real payload is untouched');
  assert.equal(worker.posted.length, 2, 'queries add no channel messages');
});

// Given one real pending frame
// When a reply with a wrong frameId arrives, then the matching reply, then a
// stale repeat of the same result
// Then the wrong id keeps the pending entry, the match clears it once, and
// no stale reply can restore it
test('UX-UT-009 a wrong frameId clears nothing and a stale reply restores nothing', async () => {
  const clock = { now: 300 };
  const { worker, client } = ownedClient({ clock });
  await ownedReady(client, worker);

  const frame = client.submitFrame({ width: 2, height: 3, pixels: new ArrayBuffer(24) });
  assert.deepEqual(client.pendingSubmission(),
    { sessionId: 's1', sessionSeq: 1, frameId: 1, submittedAtMs: 300 });

  worker.emit({ type: 'frame-result', frameId: 999, outcome: 'no_data' });
  assert.deepEqual(client.pendingSubmission(),
    { sessionId: 's1', sessionSeq: 1, frameId: 1, submittedAtMs: 300 },
    'a wrong id leaves the pending entry untouched');

  worker.emit({ type: 'frame-result', frameId: 1, outcome: 'data', bytesDecoded: 625, uxObservation: UX_OBSERVATION_FIXTURE });
  const settled = await frame;
  assert.equal(settled.outcome, 'data');
  assert.deepEqual(settled.uxObservation, UX_OBSERVATION_FIXTURE,
    'the optional observation parses through the original result untouched');
  assert.deepEqual(client.pendingSubmission(), null, 'cleared on the match');
  await tick(5);
  assert.deepEqual(client.pendingSubmission(), null);

  // a stale repeat cannot resurrect or re-settle anything
  worker.emit({ type: 'frame-result', frameId: 1, outcome: 'data', bytesDecoded: 625, uxObservation: UX_OBSERVATION_FIXTURE });
  await tick(5);
  assert.deepEqual(client.pendingSubmission(), null);
  assert.equal(worker.posted.length, 2, 'replies add no channel messages');
});

// Given five independent clients each holding one pending frame
// When the original failure exits fire one by one
// Then each frame still rejects with its registered convergence code and
// the ux pending metadata is empty after every exit
test('UX-UT-010 every original failure exit clears the ux pending metadata', async () => {
  const arm = async (overrides = {}) => {
    const harness = ownedClient(overrides);
    await ownedReady(harness.client, harness.worker);
    const frame = harness.client.submitFrame(
      { width: 2, height: 3, pixels: new ArrayBuffer(24) });
    return { ...harness, frame };
  };

  const rejectsAndClears = async (armed, code) => {
    await assert.rejects(armed.frame, (error) => error.code === code);
    assert.deepEqual(armed.client.pendingSubmission(), null,
      `${code}: the pending metadata is gone with the pending entry`);
  };

  // (a) a postMessage throw: 15010
  const a = await arm();
  a.worker.postMessage = () => { throw new Error('gone'); };
  await rejectsAndClears(a, 15010);

  // (b) the frame watchdog: 14003
  const b = await arm({ frameTimeoutMs: 10 });
  await rejectsAndClears(b, 14003);

  // (c) worker error: 15010
  const c = await arm();
  c.worker.fireError('dead');
  await rejectsAndClears(c, 15010);

  // (d) messageerror: 15010
  const d = await arm();
  d.worker.fireMessageError();
  await rejectsAndClears(d, 15010);

  // (e) close: 15010
  const e = await arm();
  e.client.close();
  await rejectsAndClears(e, 15010);
  assert.equal(e.worker.terminated, true);

  // a very late reply across all five never resurrects the metadata
  for (const armed of [a, b, c, d, e]) {
    armed.worker.emit({ type: 'frame-result', frameId: 1, outcome: 'data', bytesDecoded: 625 });
  }
  await tick(5);
  for (const armed of [a, b, c, d, e]) {
    assert.deepEqual(armed.client.pendingSubmission(), null);
  }
});

// Given a healthy channel and one frame in flight
// When pendingSubmission is queried repeatedly without new frames
// Then no channel message, pending entry, or side effect is added, and the
// getter answers honestly before and after the real reply
test('UX-UT-011 observation queries carry no channel cost', async () => {
  const clock = { now: 100 };
  const { worker, client } = ownedClient({ clock });
  await ownedReady(client, worker);

  const frame = client.submitFrame({ width: 2, height: 3, pixels: new ArrayBuffer(24) });
  let last = null;
  for (let query = 0; query < 50; query += 1) {
    last = client.pendingSubmission();
  }
  assert.ok(last, 'queries return the pending entry while it is really pending');
  assert.deepEqual(last, { sessionId: 's1', sessionSeq: 1, frameId: 1, submittedAtMs: 100 });
  assert.equal(worker.posted.length, 2, 'init plus the original frame only');
  assert.equal(client.pending.size, 1, 'queries create no new pending entry');

  worker.emit({ type: 'frame-result', frameId: 1, outcome: 'no_data' });
  const result = await frame;
  assert.equal(result.outcome, 'no_data');

  for (let query = 0; query < 50; query += 1) {
    client.pendingSubmission();
  }
  assert.deepEqual(client.pendingSubmission(), null);
  assert.equal(worker.posted.length, 2);
  assert.equal(client.pending.size, 0);
});

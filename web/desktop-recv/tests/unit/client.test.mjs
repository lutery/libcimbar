// UT-055..UT-062: main-thread DecoderClient failure convergence.
// Round-1 external review A-03/B-S03: every exit (worker error,
// messageerror, close, postMessage failure, init/frame watchdog timeout)
// must settle init and frame promises exactly once, terminate the dead
// worker, and surface a registered code (15010/15011/14003).
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

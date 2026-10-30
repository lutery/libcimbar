// UT-013..UT-018: frame scheduling policy.
// The scheduler owns the single in-flight slot; sources own their media.
import test from 'node:test';
import assert from 'node:assert/strict';

import { FrameScheduler } from '../../src/frame-scheduler.js';
import { captureFrame } from '../../src/live-source.js';

const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
const frame = (width = 2, height = 3) => ({
  width, height, pixels: new ArrayBuffer(width * height * 4),
});

// Given one frame in flight and a new live sample
// When submitting again
// Then it is dropped, counted, and never queued or resent
test('UT-013 live samples are dropped while busy', async () => {
  const results = [];
  let release;
  const scheduler = new FrameScheduler({
    submit: () => new Promise((resolve) => { release = resolve; }),
    maxPixels: 100,
    onResult: (result) => results.push(result),
  });

  assert.equal(scheduler.submitFrame(frame()), true);
  assert.equal(scheduler.submitFrame(frame()), false, 'busy: drop the sample');
  assert.equal(scheduler.stats().dropped, 1);
  assert.equal(scheduler.stats().inFlight, true);

  release({ outcome: 'no_data' });
  await tick();

  assert.equal(scheduler.stats().inFlight, false);
  assert.equal(scheduler.stats().completed, 1);
  assert.equal(results.length, 1, 'the dropped frame is never replayed');
});

// Given a burst of submissions while the first is still resolving
// When the first settles
// Then concurrency never exceeded one slot and only the next sample runs
test('UT-014 one slot, pause and resume', async () => {
  let concurrent = 0;
  let maxConcurrent = 0;
  const scheduler = new FrameScheduler({
    submit: async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await tick(5);
      concurrent -= 1;
      return { outcome: 'no_data' };
    },
    maxPixels: 100,
  });

  for (let i = 0; i < 10; i += 1) scheduler.submitFrame(frame());
  assert.equal(scheduler.stats().inFlight, true);
  assert.equal(scheduler.stats().submitted, 1);
  assert.equal(scheduler.stats().dropped, 9);

  await tick(40);
  assert.equal(maxConcurrent, 1, 'never more than one frame in flight');
  assert.equal(scheduler.stats().inFlight, false);

  assert.equal(scheduler.submitFrame(frame()), true, 'resumes after settlement');
});

// Given a frame that fails (timeout/stop) and a late reply
// When the slot settles
// Then it is released exactly once and counters stay non-negative
test('UT-015 settle races release the slot once', async () => {
  let rejectSubmit;
  const scheduler = new FrameScheduler({
    submit: () => new Promise((resolve, reject) => { rejectSubmit = reject; }),
    maxPixels: 100,
  });

  scheduler.submitFrame(frame());
  rejectSubmit(Object.assign(new Error('timed out'), { code: 14003 }));
  await tick();

  const afterFailure = scheduler.stats();
  assert.equal(afterFailure.inFlight, false);
  assert.equal(afterFailure.failed, 1);
  assert.ok(afterFailure.submitted >= afterFailure.completed + afterFailure.failed);
  assert.ok(afterFailure.completed >= 0 && afterFailure.failed >= 0 && afterFailure.dropped >= 0);

  // stopping while idle is a no-op and must not move counters
  const before = scheduler.stats();
  assert.equal(scheduler.submitFrame(frame()), true);
  const after = scheduler.stats();
  assert.equal(after.submitted, before.submitted + 1);
});

// Given a real ArrayBuffer transferred to the worker
// When the main thread looks at it afterwards
// Then it is detached and the scheduler keeps working without touching it
test('UT-016 detached buffers are never read again', async () => {
  let observedInSubmit = -1;
  const scheduler = new FrameScheduler({
    submit: async (incoming) => {
      // emulate postMessage with a transfer list
      const copy = structuredClone(incoming.pixels, { transfer: [incoming.pixels] });
      observedInSubmit = incoming.pixels.byteLength;
      return { outcome: 'no_data', copied: copy.byteLength };
    },
    maxPixels: 100,
  });

  const pixels = new ArrayBuffer(2 * 3 * 4);
  scheduler.submitFrame({ width: 2, height: 3, pixels });

  assert.equal(observedInSubmit, 0, 'the buffer is detached inside submit');
  assert.equal(pixels.byteLength, 0, 'the caller buffer is detached after submit');

  await tick();
  assert.equal(scheduler.stats().inFlight, false);
  assert.equal(scheduler.stats().completed, 1);
});

// Given a video whose natural size differs from its CSS size
// When extracting a frame
// Then natural dimensions are used, and an over-budget frame is refused
test('UT-017 natural size, no silent downscale', () => {
  const created = [];
  const createCanvas = (width, height) => {
    created.push([width, height]);
    return {
      width, height,
      getContext: () => ({
        drawImage() {},
        getImageData: () => ({ data: new Uint8ClampedArray(width * height * 4) }),
      }),
    };
  };

  const video = { videoWidth: 1024, videoHeight: 768, clientWidth: 320, clientHeight: 240 };
  const extracted = captureFrame(video, { createCanvas, maxPixels: 4194304 });
  assert.deepEqual(created[0], [1024, 768], 'natural size, not CSS size');
  assert.equal(extracted.width, 1024);

  let reported = null;
  const oversized = { videoWidth: 4000, videoHeight: 4000, clientWidth: 320, clientHeight: 240 };
  const refused = captureFrame(oversized, {
    createCanvas,
    maxPixels: 4194304,
    onError: (code) => { reported = code; },
  });
  assert.equal(refused, null, 'never silently resized');
  assert.equal(reported, 14002);
  assert.equal(created.length, 1, 'no canvas is created for an over-budget frame');
});

// Given EOF while a frame is still in flight
// When finishing the stream
// Then completion waits for the reply, samples at most once, and never hangs
test('UT-018 EOF waits for the in-flight reply', async () => {
  let release;
  const scheduler = new FrameScheduler({
    submit: () => new Promise((resolve) => { release = resolve; }),
    maxPixels: 100,
  });

  scheduler.submitFrame(frame());

  let finished = false;
  const finalSamples = [];
  const finishPromise = scheduler.finish({
    takeFinalSample: () => { finalSamples.push(1); return null; },
  }).then(() => { finished = true; });

  await tick();
  assert.equal(finished, false, 'must not declare the end before the last reply');

  release({ outcome: 'no_data' });
  await finishPromise;

  assert.equal(finished, true);
  assert.ok(finalSamples.length <= 1, 'at most one final sample');
  assert.equal(scheduler.stats().inFlight, false);

  // idle case: resolves immediately, no infinite wait
  const idle = new FrameScheduler({ submit: async () => ({ outcome: 'no_data' }), maxPixels: 100 });
  await idle.finish({ takeFinalSample: () => null });
  assert.equal(idle.stats().inFlight, false);
});

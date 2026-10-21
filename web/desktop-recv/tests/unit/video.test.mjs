// UT-031..UT-036: recorded-video source. The media element, URL functions and
// capture are injected, so Node drives every scenario deterministically.
import test from 'node:test';
import assert from 'node:assert/strict';

import { VideoSource } from '../../src/video-source.js';

const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeVideoElement({ width = 1024, height = 1024, duration = 1, failMetadata = false,
  neverSeek = false, failSeekAfter = Infinity, withRVFC = false } = {}) {
  let time = 0;
  let seekCount = 0;
  let frameCallback = null;
  const listeners = {};
  const element = {
    src: null,
    videoWidth: width,
    videoHeight: height,
    duration,
    muted: true,
    paused: false,
    played: 0,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) {
      const list = listeners[type] || [];
      const index = list.indexOf(fn);
      if (index >= 0) list.splice(index, 1);
    },
    dispatch(type) { for (const fn of [...(listeners[type] || [])]) fn(); },
    listenerCount(type) { return (listeners[type] || []).length; },
    pause() { element.paused = true; },
    play() { element.paused = false; element.played += 1; return Promise.resolve(); },
    load() {},
    removeAttribute() {},
    get currentTime() { return time; },
    set currentTime(value) {
      time = value;
      seekCount += 1;
      if (neverSeek) return; // a broken container: no event ever fires
      queueMicrotask(() => this.dispatch(seekCount > failSeekAfter ? 'error' : 'seeked'));
    },
  };
  if (withRVFC) {
    element.requestVideoFrameCallback = (callback) => { frameCallback = callback; return 1; };
    element.fireFrame = (mediaTime) => {
      const callback = frameCallback;
      frameCallback = null;
      if (callback) callback(0, { mediaTime });
    };
  }
  Object.defineProperty(element, 'src', {
    set() {
      queueMicrotask(() => element.dispatch(failMetadata ? 'error' : 'loadedmetadata'));
    },
  });
  return element;
}

function withFakeUrls(run) {
  const created = [];
  const revoked = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => { const id = `blob:fake-${created.length}`; created.push(id); return id; };
  URL.revokeObjectURL = (id) => revoked.push(id);
  return run({ created, revoked }).finally(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });
}

const file = (name = 'clip.webm') => ({ name, size: 12345 });

// The shared harness: submits queue up entries that the test releases.
function harness({ element, failCapture = false, seekTimeoutMs, onEnded, onError }) {
  const submits = [];
  const source = new VideoSource({
    createElement: () => element,
    seekTimeoutMs,
    captureFrame: failCapture ? () => null : () => (
      { width: element.videoWidth, height: element.videoHeight, pixels: new ArrayBuffer(16) }
    ),
    submit: async (frame, meta) => {
      const entry = { frame, meta, resolved: false };
      submits.push(entry);
      return new Promise((resolve) => {
        entry.release = (result) => { entry.resolved = true; resolve(result); };
      });
    },
    onEnded: onEnded || (() => {}),
    onError: onError || (() => {}),
  });
  return { source, submits };
}

// Given a file that was opened
// When stop is called
// Then the object URL is reclaimed exactly once and the source closes
test('UT-031 stopping reclaims the object URL exactly once', async () => {
  await withFakeUrls(async ({ revoked }) => {
    const element = fakeVideoElement();
    const { source } = harness({ element });
    await source.open(file());
    assert.equal(source.snapshot().open, true);

    source.stop();
    assert.equal(revoked.length, 1, 'reclaimed exactly once');
    assert.equal(source.snapshot().open, false);

    source.stop(); // second stop is a no-op
    assert.equal(revoked.length, 1);
  });
});

// Given a file whose metadata cannot be read, or whose first frame cannot decode
// When opening
// Then the failure is limited and the URL is reclaimed
test('UT-032 unreadable media fails finitely', async () => {
  await withFakeUrls(async ({ revoked }) => {
    const badElement = fakeVideoElement({ failMetadata: true });
    const bad = harness({ element: badElement });
    await assert.rejects(
      bad.source.open(file()),
      (error) => error.code === 13005
    );
    assert.equal(revoked.length, 1, 'URL reclaimed after metadata failure');

    const undecodable = harness({ element: fakeVideoElement(), failCapture: true });
    await assert.rejects(
      undecodable.source.open(file()),
      (error) => error.code === 13002
    );
    assert.equal(revoked.length, 2, 'URL reclaimed after decode failure');
  });
});

// Given a short recording whose seek targets collapse near the end
// When stepping
// Then every submitted media time is strictly increasing and the position
// never leaves the container bounds
test('UT-033 stepping stays in bounds with increasing media times', async () => {
  await withFakeUrls(async () => {
    const element = fakeVideoElement({ duration: 0.05 });
    const { source, submits } = harness({ element });

    await source.open(file());
    const runPromise = source.run();
    for (let i = 0; i < 100; i += 1) {
      await tick(5);
      for (const entry of submits) {
        if (entry.frame && !entry.resolved) entry.release({ outcome: 'no_data' });
      }
      // stop polling once the run has settled to avoid an unawaited promise
      const settled = await Promise.race([runPromise.then(() => true), Promise.resolve(false)]);
      if (settled) break;
    }
    await runPromise;

    const times = submits.filter((entry) => entry.frame).map((entry) => entry.meta.mediaTimeUs);
    assert.ok(times.length >= 1, 'at least one frame was submitted');
    for (let i = 1; i < times.length; i += 1) {
      assert.ok(times[i] > times[i - 1], 'media times strictly increase');
    }
    assert.ok(source.snapshot().positionSeconds <= element.duration + 0.001,
      'the seek target never leaves the container');
  });
});

// Given the end of the recording
// When the last frame has been submitted
// Then eof fires only after the final result resolves
test('UT-034 eof waits for the final result', async () => {
  await withFakeUrls(async () => {
    const element = fakeVideoElement({ duration: 0.08 });
    const events = [];
    const { source, submits } = harness({
      element,
      onEnded: (reason) => events.push(`ended:${reason}`),
    });

    await source.open(file());
    const runPromise = source.run();

    // release every pending frame each round; eof only fires after the last
    // reply settles
    for (let i = 0; i < 100; i += 1) {
      await tick(5);
      for (const entry of submits) {
        if (entry.frame && !entry.resolved) {
          events.push('submit');
          entry.release({ outcome: 'no_data' });
        }
      }
      if (events.includes('ended:eof')) break;
    }
    await runPromise;
    events.push('run-done');

    assert.equal(events[events.length - 1], 'run-done');
    assert.equal(events.includes('ended:eof'), true);
    const eofIndex = events.indexOf('ended:eof');
    const lastSubmit = events.lastIndexOf('submit');
    assert.ok(lastSubmit >= 0 && lastSubmit < eofIndex, 'eof fires after the last reply');
  });
});

// Given a recording shorter than one frame interval
// When running
// Then it ends finitely without wrapping around
test('UT-035 a short recording ends without looping', async () => {
  await withFakeUrls(async ({ revoked }) => {
    const element = fakeVideoElement({ duration: 0.01 });
    const { source, submits } = harness({ element });

    await source.open(file());
    const runPromise = source.run();
    for (let i = 0; i < 100; i += 1) {
      await tick(5);
      for (const entry of submits) {
        if (entry.frame && !entry.resolved) entry.release({ outcome: 'no_data' });
      }
      const settled = await Promise.race([runPromise.then(() => true), Promise.resolve(false)]);
      if (settled) break;
    }
    await runPromise;

    const times = submits.filter((e) => e.frame).map((e) => e.meta.mediaTimeUs);
    assert.ok(times.length >= 1, 'at least one frame was submitted');
    assert.equal(source.snapshot().positionSeconds <= element.duration + 0.01, true,
      'position never wrapped to the start');

    source.stop();
    assert.equal(revoked.length, 1);
  });
});

// Given a recording is running
// When stop is called mid-flight
// Then late seek events submit nothing and the URL is reclaimed once
test('UT-036 stop mid-run submits nothing further', async () => {
  await withFakeUrls(async ({ revoked }) => {
    const element = fakeVideoElement({ duration: 5 });
    const { source, submits } = harness({ element });

    await source.open(file());

    const runPromise = source.run();
    await tick(20);
    source.stop();

    for (const entry of submits) if (entry.frame && !entry.resolved) entry.release({ outcome: 'no_data' });
    await runPromise;

    const before = submits.filter((e) => e.frame).length;
    element.dispatch('seeked'); // a late seek event must do nothing
    await tick(20);
    const after = submits.filter((e) => e.frame).length;

    assert.equal(after, before, 'no frames submitted after stop');
    assert.equal(revoked.length, 1, 'URL reclaimed exactly once');
  });
});

// --- TD-15: per-frame playback import (rVFC) ---

// Given the element still carries a capture stream from a previous session
// When a recording is opened
// Then the previous stream is detached first (srcObject wins over src)
test('UT-082 open detaches a previous capture stream', async () => {
  await withFakeUrls(async () => {
    const element = fakeVideoElement();
    element.srcObject = { id: 'old-stream' };
    const { source } = harness({ element });
    await source.open(file());
    assert.equal(element.srcObject, null, 'the old stream is detached');
  });
});

// Given a recording played through the video element
// When requestVideoFrameCallback is available
// Then every presented frame is captured and submitted one at a time
// (no 1/15 s time-stepping, which lands on inter frames and drops data)
test('UT-081 import decodes every presented frame (rVFC path)', async () => {
  await withFakeUrls(async () => {
    const element = fakeVideoElement({ duration: 2, withRVFC: true });
    const events = [];
    const { source, submits } = harness({ element, onEnded: (reason) => events.push(reason) });

    await source.open(file());
    const runPromise = source.run();
    await tick(5);

    assert.ok(element.played >= 1, 'playback started');

    element.fireFrame(0.5);
    await tick(5);
    assert.equal(element.paused, true, 'paused while a submission is in flight');
    assert.equal(submits.filter((entry) => entry.frame).length, 1);

    // release the first frame; playback resumes and waits for the next one
    submits[0].release({ outcome: 'no_data' });
    await tick(10);
    element.fireFrame(0.9);
    await tick(5);
    assert.equal(submits.filter((entry) => entry.frame).length, 2);
    submits[1].release({ outcome: 'no_data' });
    await tick(10);

    element.dispatch('ended');
    await runPromise;
    assert.deepEqual(events, ['eof']);
    const times = submits.filter((entry) => entry.frame).map((entry) => entry.meta.mediaTimeUs);
    assert.deepEqual(times, [500000, 900000], 'the presented media times are used verbatim');
  });
});

// --- Round-1 external review B-S04: bounded seeks and the final tail frame ---

// Given a container that acknowledges metadata but never completes a seek
// When opening
// Then the seek watchdog ends the attempt finitely with 13003 and the URL
// is reclaimed, instead of hanging the session forever
test('UT-069 a never-completing first seek fails finitely', { timeout: 3000 }, async () => {
  await withFakeUrls(async ({ revoked }) => {
    const errors = [];
    const element = fakeVideoElement({ neverSeek: true });
    const { source } = harness({
      element, seekTimeoutMs: 30, onError: (code) => errors.push(code),
    });

    await assert.rejects(source.open(file()), (error) => error.code === 13003);
    assert.equal(revoked.length, 1, 'URL reclaimed after the bounded failure');
    assert.deepEqual(errors, [13003]);
    assert.equal(source.snapshot().open, false);
  });
});

// Given the media errors out mid-read
// When stepping
// Then run() rejects with 13002, the element is torn down finitely, and the
// error is surfaced once for the recoverable re-import path
test('UT-070 a media error during run ends finitely', { timeout: 3000 }, async () => {
  await withFakeUrls(async ({ revoked }) => {
    const errors = [];
    const element = fakeVideoElement({ duration: 1, failSeekAfter: 1 });
    const { source } = harness({
      element, seekTimeoutMs: 1000, onError: (code) => errors.push(code),
    });

    await source.open(file()); // the open precheck seek is the only good one
    await assert.rejects(source.run(), (error) => error.code === 13002);
    assert.equal(revoked.length, 1, 'torn down exactly once');
    assert.deepEqual(errors, [13002]);
    assert.equal(source.snapshot().open, false);
  });
});

// Given the final frame interval of the recording
// When stepping reaches the end of the container
// Then the tail position is sampled once before eof, so the last key frame
// gets a bounded capture chance
test('UT-071 the final tail frame is sampled before eof', { timeout: 5000 }, async () => {
  await withFakeUrls(async () => {
    const element = fakeVideoElement({ duration: 0.1 });
    const events = [];
    const { source, submits } = harness({
      element, onEnded: (reason) => events.push(reason),
    });

    await source.open(file());
    const runPromise = source.run();
    for (let i = 0; i < 100 && !events.includes('eof'); i += 1) {
      await tick(5);
      for (const entry of submits) {
        if (entry.frame && !entry.resolved) entry.release({ outcome: 'no_data' });
      }
    }
    await runPromise;

    assert.equal(events.includes('eof'), true);
    const times = submits.filter((e) => e.frame).map((e) => e.meta.mediaTimeUs);
    assert.equal(times[times.length - 1], Math.round(0.099 * 1e6),
      'the last sample covers the container tail');
    for (let i = 1; i < times.length; i += 1) {
      assert.ok(times[i] > times[i - 1], 'media times strictly increase');
    }
  });
});

// Given a source failed finitely
// When the user picks a healthy recording next
// Then a fresh source opens normally: failure does not poison re-import
test('UT-072 a failed source is discarded and a fresh import succeeds', { timeout: 3000 }, async () => {
  await withFakeUrls(async () => {
    const broken = harness({ element: fakeVideoElement({ neverSeek: true }), seekTimeoutMs: 30 });
    await assert.rejects(broken.source.open(file('bad.webm')), (error) => error.code === 13003);

    const good = harness({ element: fakeVideoElement() });
    const meta = await good.source.open(file('good.webm'));
    assert.equal(meta.durationSeconds, 1);
  });
});

// --- Round-3 S-2: the rVFC run must not leak pending promises ---

// Given capture throws synchronously inside a presented-frame callback
// When the rVFC run steps that frame
// Then run() rejects with 13002 instead of letting the exception escape the
// callback, the source is torn down, and no run promise is left pending
test('UT-093 a sync throw in the frame callback rejects the run with 13002', { timeout: 3000 }, async () => {
  await withFakeUrls(async ({ revoked }) => {
    const errors = [];
    const element = fakeVideoElement({ duration: 2, withRVFC: true });
    let captures = 0;
    const source = new VideoSource({
      createElement: () => element,
      captureFrame: () => {
        captures += 1;
        // the open() precheck captures once; the first run frame explodes
        if (captures > 1) throw new Error('capture exploded');
        return { width: element.videoWidth, height: element.videoHeight, pixels: new ArrayBuffer(16) };
      },
      submit: async () => ({ outcome: 'no_data' }),
      onError: (code) => errors.push(code),
    });

    await source.open(file());
    const runPromise = source.run();
    await tick(5);
    assert.ok(element.played >= 1, 'playback started');
    element.fireFrame(0.5); // the exception is thrown inside this callback

    await assert.rejects(runPromise, (error) => error.code === 13002);
    assert.deepEqual(errors, [13002], 'the failure is surfaced once');
    assert.equal(source.snapshot().open, false, 'the source is torn down');
    assert.equal(revoked.length, 1, 'the object URL is reclaimed');
  });
});

// Given a run is waiting for the next presented frame
// When stop() is called before that callback ever fires
// Then the run promise settles promptly instead of hanging forever
test('UT-094 stop settles a run waiting on the frame callback', { timeout: 3000 }, async () => {
  await withFakeUrls(async ({ revoked }) => {
    const element = fakeVideoElement({ duration: 5, withRVFC: true });
    const { source } = harness({ element });

    await source.open(file());
    const runPromise = source.run();
    await tick(10);
    assert.equal(element.played, 1, 'playback started and no frame was presented yet');

    source.stop();
    const outcome = await Promise.race([
      runPromise.then(() => 'settled', () => 'settled'),
      new Promise((resolve) => setTimeout(() => resolve('hung'), 200)),
    ]);
    assert.equal(outcome, 'settled', 'stop() must settle the pending rVFC run');
    assert.equal(revoked.length, 1, 'URL reclaimed exactly once');
  });
});

// Given a run is in progress
// When stop() is called
// Then the run's ended/error listeners are removed, so a late media event
// cannot reach a torn-down source
test('UT-095 stop removes the run ended and error listeners', { timeout: 3000 }, async () => {
  await withFakeUrls(async () => {
    const element = fakeVideoElement({ duration: 5, withRVFC: true });
    const events = [];
    const { source } = harness({ element, onEnded: (reason) => events.push(reason) });

    await source.open(file());
    const runPromise = source.run();
    await tick(5);
    assert.equal(element.listenerCount('ended'), 1, 'the run listens for the real EOF');
    const errorsBefore = element.listenerCount('error');

    source.stop();
    await runPromise;

    assert.equal(element.listenerCount('ended'), 0, 'the ended listener is removed on settle');
    assert.ok(element.listenerCount('error') < errorsBefore,
      'the run error listener is removed on settle');
    element.dispatch('ended');
    await tick(5);
    assert.deepEqual(events, [], 'a late ended event cannot fire eof after stop');
  });
});

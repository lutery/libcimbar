// UT-031..UT-036: recorded-video source. The media element, URL functions and
// capture are injected, so Node drives every scenario deterministically.
import test from 'node:test';
import assert from 'node:assert/strict';

import { VideoSource } from '../../src/video-source.js';

const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeVideoElement({ width = 1024, height = 1024, duration = 1, failMetadata = false } = {}) {
  let time = 0;
  const listeners = {};
  const element = {
    src: null,
    videoWidth: width,
    videoHeight: height,
    duration,
    muted: true,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) {
      const list = listeners[type] || [];
      const index = list.indexOf(fn);
      if (index >= 0) list.splice(index, 1);
    },
    dispatch(type) { for (const fn of [...(listeners[type] || [])]) fn(); },
    pause() {},
    load() {},
    removeAttribute() {},
    get currentTime() { return time; },
    set currentTime(value) {
      time = value;
      queueMicrotask(() => this.dispatch('seeked'));
    },
  };
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
function harness({ element, failCapture = false, onEnded, onError }) {
  const submits = [];
  const source = new VideoSource({
    createElement: () => element,
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
    await tick(60);

    for (const entry of submits) {
      if (entry.frame && !entry.resolved) entry.release({ outcome: 'no_data' });
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
    await tick(60);

    for (const entry of submits) if (entry.frame && !entry.resolved) entry.release({ outcome: 'no_data' });
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

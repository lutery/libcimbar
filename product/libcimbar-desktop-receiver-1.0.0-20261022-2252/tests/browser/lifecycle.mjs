// IAT-04: lifecycle hardening in a real browser - the real coordinator drives
// the real worker with a synthetic canvas capture stream, covering start,
// frame flow, stop convergence, and a late capture stream.
import { SessionCoordinator } from '../../src/session.js';
import { DecoderClient } from '../../src/decoder-client.js';
import { loadAssetSet, makeLimits } from './native-payload.mjs';

function tick(ms = 50) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForState(coordinator, states, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const snapshot = coordinator.snapshot();
    if (states.includes(snapshot.state)) return snapshot;
    if (Date.now() > deadline) {
      throw new Error(`timeout waiting for ${states}; state=${snapshot.state}`);
    }
    await tick(50);
  }
}

export async function runLifecycle(record) {
  const assets = await loadAssetSet();

  // A synthetic source: animated canvas -> real MediaStream.
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext('2d');

  function makeStream() {
    const stream = canvas.captureStream(30);
    // animate so rVFC/captureStream produces frames
    let value = 0;
    const timer = setInterval(() => {
      value = (value + 40) % 256;
      context.fillStyle = `rgb(${value},${255 - value},60)`;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }, 33);
    stream.addEventListener('ended', () => {}, { once: true });
    const originalStop = () => clearInterval(timer);
    return { stream, stopPainting: originalStop };
  }

  let painting = null;
  const coordinator = new SessionCoordinator({
    getDisplayMedia: async () => {
      const made = makeStream();
      painting = made;
      return made.stream;
    },
    createClient: async () => {
      const worker = new Worker(new URL('../../worker/decoder-worker.js', import.meta.url));
      const client = new DecoderClient(worker, {
        maxFramePixels: 4194304,
        maxArtifactBytes: 16777216,
      });
      await client.init({ mode: 68, assets, limits: makeLimits() });
      return client;
    },
    maxPixels: 4194304,
    onError: () => {},
  });

  const snapshots = [];
  coordinator.startLive({ requestId: 'lifecycle-1' });
  const ready = await waitForState(coordinator, ['Receiving']);
  snapshots.push(ready.state);

  // let the real pipeline chew a few frames (they decode to nothing)
  await tick(700);
  const midStats = coordinator.snapshot().stats;

  coordinator.stop();
  const stopped = await waitForState(coordinator, ['Stopped']);
  snapshots.push(stopped.state);
  if (painting) painting.stopPainting();

  const cleanupOk = stopped.cleanupComplete === true;
  const statsOk = typeof midStats.submitted === 'number' || typeof midStats.dropped === 'number';

  // late stream: start, stop before the picker resolves, then let it through
  let lateResolve;
  let lateStreamStopped = false;
  const lateCoordinator = new SessionCoordinator({
    getDisplayMedia: () => new Promise((resolve) => { lateResolve = resolve; }),
    createClient: async () => {
      const worker = new Worker(new URL('../../worker/decoder-worker.js', import.meta.url));
      const client = new DecoderClient(worker, { maxFramePixels: 4194304, maxArtifactBytes: 16777216 });
      await client.init({ mode: 68, assets, limits: makeLimits() });
      return client;
    },
    maxPixels: 4194304,
    onError: () => {},
  });

  lateCoordinator.startLive({ requestId: 'late' });
  lateCoordinator.stop();
  lateResolve({
    getTracks() {
      return [{
        stop() { lateStreamStopped = true; },
        addEventListener() {},
      }];
    },
    getVideoTracks() { return this.getTracks(); },
  });
  await tick(200);

  record('IAT-04 lifecycle', cleanupOk && statsOk && lateStreamStopped &&
      snapshots.join(',') === 'Receiving,Stopped',
    `states=${snapshots.join(',')} cleanup=${cleanupOk} lateStreamStopped=${lateStreamStopped}`);
}

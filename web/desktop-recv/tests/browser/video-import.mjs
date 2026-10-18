// IAT-05: a REAL recorded video goes through the whole chain - MediaRecorder
// encodes the sample image into a WebM file, the VideoSource steps it, and
// the real worker must rebuild the artifact. Codec loss is the enemy here,
// so the recording runs at a very high bitrate.
import { SessionCoordinator } from '../../src/session.js';
import { DecoderClient } from '../../src/decoder-client.js';
import { VideoSource } from '../../src/video-source.js';
import { loadAssetSet, makeLimits } from './native-payload.mjs';

function tick(ms = 50) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForState(coordinator, states, timeoutMs = 30000) {
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

async function recordSampleVideo(imageBitmap) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext('2d');

  const stream = canvas.captureStream(30);
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find((candidate) => MediaRecorder.isTypeSupported(candidate));
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 50_000_000,
  });

  const chunks = [];
  recorder.ondataavailable = (event) => { if (event.data && event.data.size) chunks.push(event.data); };
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });

  recorder.start(100);
  const draw = () => context.drawImage(imageBitmap, 0, 0, 1024, 1024);
  draw();
  const timer = setInterval(draw, 33);
  await tick(1500);
  clearInterval(timer);
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((track) => track.stop());

  const blob = new Blob(chunks, { type: mimeType });
  return { file: new File([blob], 'sample.webm', { type: mimeType }), mimeType, bytes: blob.size };
}

export async function runVideoImport(record) {
  const assets = await loadAssetSet();
  const sample = await (await fetch(new URL('./fixtures/4cecc30f.png', import.meta.url))).blob();
  const imageBitmap = await createImageBitmap(sample);

  const { file, mimeType, bytes } = await recordSampleVideo(imageBitmap);

  const coordinator = new SessionCoordinator({
    getDisplayMedia: () => Promise.reject(new Error('not used for video import')),
    createClient: async () => {
      const worker = new Worker(new URL('../../worker/decoder-worker.js', import.meta.url));
      const client = new DecoderClient(worker, { maxFramePixels: 4194304, maxArtifactBytes: 16777216 });
      await client.init({ mode: 68, assets, limits: makeLimits() });
      return client;
    },
    maxPixels: 4194304,
    onError: () => {},
  });

  let videoSource = null;
  let openError = null;
  coordinator.startVideo({
    requestId: 'video-1',
    openSource: async () => {
      try {
        const source = new VideoSource({
          submit: (frame) => coordinator.submitVideoFrame(frame),
          onEnded: () => {
            void coordinator.finishStream({ takeFinalSample: () => null })
              .catch(() => {});
          },
          onError: (code) => { openError = `source error ${code}`; },
          maxPixels: 4194304,
        });
        const metadata = await source.open(file);
        videoSource = source;
        return source;
      } catch (error) {
        openError = `open failed: ${String((error && error.message) || error)} code=${error && error.code}`;
        throw error;
      }
    },
  });

  await waitForState(coordinator, ['Receiving', 'Stopped', 'Idle']);
  if (openError) {
    record('IAT-05 video import', false, `openError=${openError}`);
    return;
  }
  if (videoSource && coordinator.snapshot().state === 'Receiving') {
    void videoSource.run().catch((error) => { openError = `run failed: ${String((error && error.message) || error)}`; });
  }

  let final;
  try {
    final = await waitForState(coordinator, ['Ready', 'Incomplete', 'Stopped', 'Idle'], 45000);
  } finally {
    if (final && final.state === 'Ready') coordinator.releaseInputs();
  }

  const artifact = final.artifact;
  const ok = final.state === 'Ready' && artifact && artifact.byteCount === 7538;
  record('IAT-05 video import', ok,
    `codec=${mimeType} file=${bytes}B state=${final.state} ` +
    `artifactBytes=${artifact ? artifact.byteCount : 'n/a'} expected=7538 ` +
    (openError ? `error=${openError}` : ''));
}

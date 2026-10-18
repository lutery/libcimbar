// Desktop receiver entry. The coordinator owns session state and the single
// in-flight frame; this file only wires DOM events to it and paints snapshots.
import { inspectCapabilities } from './capabilities.js';
import { deriveControls, describeRecovery, safeSuggestedName, noDataHint } from './ui.js';
import { DecoderClient } from './decoder-client.js';
import { SessionCoordinator } from './session.js';
import { SaveController } from './save-controller.js';
import { captureFrame } from './live-source.js';
import { VideoSource } from './video-source.js';

const MODE_B = 68;
const MAX_PIXELS = 4194304;

const el = {
  caps: document.getElementById('caps'),
  status: document.getElementById('status'),
  log: document.getElementById('log'),
  preview: document.getElementById('preview'),
  artifact: document.getElementById('artifact'),
  artifactName: document.getElementById('artifact-name'),
  artifactSize: document.getElementById('artifact-size'),
  btnLive: document.getElementById('btn-live'),
  btnVideo: document.getElementById('btn-video'),
  btnStop: document.getElementById('btn-stop'),
  btnSave: document.getElementById('btn-save'),
  fileInput: document.getElementById('file-input'),
  mode: document.getElementById('mode'),
};

let capabilities = null;
let assets = null;
let errorRegistry = null;
let saveController = null;
let loopRunning = false;
let startClicks = 0;
let drainRequested = false;
let releasedOnReady = false;
let receivingSince = 0;
let noDataNoticeShown = false;
let activeVideoSource = null;
let videoRunStarted = false;
const NO_DATA_NOTICE_MS = 5000;

const coordinator = new SessionCoordinator({
  // The picker wrapper is the single place a stream is obtained: the preview
  // attaches here and the same stream goes to the coordinator.
  getDisplayMedia: async (constraints) => {
    const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
    el.preview.hidden = false;
    el.preview.srcObject = stream;
    try { await el.preview.play(); } catch (error) { /* autoplay guard */ }
    return stream;
  },
  createClient: async () => {
    const worker = new Worker(new URL('../worker/decoder-worker.js', import.meta.url));
    const client = new DecoderClient(worker, {
      maxFramePixels: MAX_PIXELS,
      maxArtifactBytes: 16777216,
    });
    await client.init({ mode: MODE_B, assets, limits: {} });
    return client;
  },
  maxPixels: MAX_PIXELS,
  onSnapshot: () => render(),
  onError: (code) => showError(code),
});

function logLine(text, isError = false) {
  const prefix = isError ? '[error] ' : '';
  el.log.textContent += `${prefix}${text}\n`;
  el.log.scrollTop = el.log.scrollHeight;
}

function showError(code) {
  const recovery = describeRecovery(code, errorRegistry);
  logLine(`${code}: ${recovery.message} (${recovery.retryAction})`, true);
}

function render() {
  const snapshot = coordinator.snapshot();
  const controls = deriveControls(snapshot, capabilities || {});
  el.status.textContent = controls.statusText;
  el.btnLive.disabled = !(controls.canStart && capabilities.realtime);
  el.btnVideo.disabled = !controls.canImportVideo;
  el.btnStop.disabled = !controls.canStop;
  el.btnSave.disabled = !controls.canSave;

  const artifact = snapshot.artifact;
  if (artifact) {
    el.artifact.hidden = false;
    el.artifactName.textContent = artifact.suggestedName || artifact.name || 'file';
    el.artifactSize.textContent = `${artifact.byteCount ?? artifact.byteLength} bytes`;
  } else {
    el.artifact.hidden = true;
  }
  el.mode.textContent = 'Mode B';

  const shouldRun = snapshot.state === 'Receiving' && snapshot.inputKind === 'live';
  if (shouldRun && !loopRunning) {
    loopRunning = true;
    runFrameLoop();
  }
  if (!shouldRun && loopRunning) {
    loopRunning = false;
    el.preview.hidden = true;
  }

  // Recorded input: the video source steps frames only after both the source
  // and the decoder are ready (state Receiving).
  if (snapshot.state === 'Receiving' && snapshot.inputKind === 'video' &&
      activeVideoSource && !videoRunStarted) {
    videoRunStarted = true;
    activeVideoSource.run().catch((error) => logLine(String((error && error.message) || error), true));
  }
  if (snapshot.state !== 'Receiving') videoRunStarted = false;

  // No-data notice: name the source and the mode once the wait is long enough,
  // never claiming completion or failure.
  if (shouldRun) {
    if (!receivingSince) receivingSince = Date.now();
    if (!noDataNoticeShown && Date.now() - receivingSince >= NO_DATA_NOTICE_MS) {
      const hint = noDataHint({
        elapsedMs: Date.now() - receivingSince,
        thresholdMs: NO_DATA_NOTICE_MS,
        sourceLabel: 'the shared window',
        mode: 'B',
      });
      if (hint) {
        logLine(hint.text);
        noDataNoticeShown = true;
      }
    }
  } else {
    receivingSince = 0;
    noDataNoticeShown = false;
  }
  if (snapshot.state === 'Stopped' || snapshot.state === 'Idle') {
    el.preview.hidden = true;
    if (snapshot.state === 'Stopped') el.preview.srcObject = null;
  }

  // The capture stream has ended: drain the in-flight frame, then either the
  // artifact arrives or the session ends incomplete.
  if (snapshot.inputEnded && snapshot.state === 'Draining' && !drainRequested) {
    drainRequested = true;
    coordinator.finishStream({
      takeFinalSample: () => captureFrame(el.preview, {
        maxPixels: MAX_PIXELS,
        onError: (code) => showError(code),
      }),
    }).catch((error) => logLine(String((error && error.message) || error), true));
  }
  if (snapshot.state !== 'Draining') drainRequested = false;

  // The artifact has been delivered: stop sharing and retire the decoder.
  if (snapshot.state === 'Ready' && !releasedOnReady) {
    releasedOnReady = true;
    coordinator.releaseInputs();
    logLine('capture stopped; the file is ready to save');
  }
  if (snapshot.state === 'Preparing') releasedOnReady = false;
}

function runFrameLoop() {
  const step = () => {
    if (!loopRunning) return;
    if (coordinator.snapshot().state !== 'Receiving') {
      loopRunning = false;
      return;
    }
    const frame = captureFrame(el.preview, {
      maxPixels: MAX_PIXELS,
      onError: (code) => showError(code),
    });
    if (frame) coordinator.offerFrame(frame);

    if (!loopRunning) return;
    if (typeof el.preview.requestVideoFrameCallback === 'function') {
      el.preview.requestVideoFrameCallback(step);
    } else {
      setTimeout(step, 66);
    }
  };
  step();
}

async function startLive() {
  if (!capabilities.realtime) return;
  startClicks += 1;
  const result = coordinator.startLive({ requestId: `live-${startClicks}` });
  if (!result.accepted && result.reason === 'busy') {
    logLine('a session is already active');
  }
}

function startVideoImport(file) {
  if (!capabilities.videoImport) return;
  startClicks += 1;
  videoRunStarted = false;
  const result = coordinator.startVideo({
    requestId: `video-${startClicks}`,
    openSource: async () => {
      // The shared preview element doubles as the video element; the source
      // sets its src and reclaims the URL on stop.
      const source = new VideoSource({
        createElement: () => el.preview,
        submit: (frame) => coordinator.submitVideoFrame(frame),
        onEnded: () => {
          void coordinator.finishStream({ takeFinalSample: () => null })
            .catch((error) => logLine(String((error && error.message) || error), true));
        },
        onError: (code) => showError(code),
        maxPixels: MAX_PIXELS,
      });
      const metadata = await source.open(file);
      activeVideoSource = source;
      logLine(`recording: ${metadata.width}x${metadata.height}, ${metadata.durationSeconds.toFixed(1)}s`);
      return source;
    },
  });
  if (!result.accepted && result.reason === 'busy') {
    logLine('a session is already active');
  }
}

async function saveArtifact() {
  const snapshot = coordinator.snapshot();
  const artifact = snapshot.artifact;
  if (!artifact || !artifact.blob) return;
  if (!capabilities.savePicker) {
    logLine('saving is unavailable without a secure context', true);
    return;
  }

  const fallback = snapshot.sessionId || 'cimbar-recv';
  saveController.start({
    artifact: { blob: artifact.blob, suggestedName: artifact.suggestedName },
    suggestedName: safeSuggestedName(artifact.suggestedName, fallback),
    isCurrent: () => {
      const state = coordinator.snapshot().state;
      return state !== 'Stopping' && state !== 'Stopped';
    },
  });
}

function reportSave(event) {
  if (event.saveStatus === 'saved') {
    logLine(`saved (${event.attemptId ?? ''})`);
  } else if (event.saveStatus === 'cancelled') {
    logLine('save cancelled; the file is still ready to save');
  } else if (event.saveStatus === 'failed') {
    logLine(`save failed (${event.lastError}); you can try again`, true);
  }
}

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function init() {
  capabilities = inspectCapabilities(window);

  const reasons = capabilities.reasons || [];
  if (reasons.length) {
    el.caps.hidden = false;
    el.caps.textContent = `Some features are unavailable: ${reasons.join('; ')}.`;
  }

  try {
    assets = await loadJson('config/asset-set.json');
    errorRegistry = await loadJson('config/errors.json');
  } catch (error) {
    logLine(`configuration unavailable: ${(error && error.message) || error}`, true);
  }

  if (capabilities.savePicker && typeof window.showSaveFilePicker === 'function') {
    saveController = new SaveController({
      showSaveFilePicker: (options) => window.showSaveFilePicker(options),
      onEvent: reportSave,
    });
  }

  el.btnLive.addEventListener('click', () => { void startLive(); });
  el.btnVideo.addEventListener('click', () => { el.fileInput.click(); });
  el.fileInput.addEventListener('change', () => {
    const file = el.fileInput.files && el.fileInput.files[0];
    el.fileInput.value = '';
    if (file) startVideoImport(file);
  });
  el.btnStop.addEventListener('click', () => coordinator.stop());
  el.btnSave.addEventListener('click', () => { void saveArtifact(); });

  render();
}

init();

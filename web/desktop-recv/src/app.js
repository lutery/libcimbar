// Desktop receiver entry. The coordinator owns session state and the single
// in-flight frame; this file only wires DOM events to it and paints snapshots.
import { inspectCapabilities } from './capabilities.js';
import { deriveControls, describeRecovery, safeSuggestedName } from './ui.js';
import { DecoderClient } from './decoder-client.js';
import { SessionCoordinator } from './session.js';
import { captureFrame } from './live-source.js';

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
let loopRunning = false;
let startClicks = 0;

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

  const shouldRun = snapshot.state === 'Receiving';
  if (shouldRun && !loopRunning) {
    loopRunning = true;
    runFrameLoop();
  }
  if (!shouldRun && loopRunning) {
    loopRunning = false;
    el.preview.hidden = true;
  }
  if (snapshot.state === 'Stopped') {
    el.preview.hidden = true;
    el.preview.srcObject = null;
  }
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

async function saveArtifact() {
  const artifact = coordinator.snapshot().artifact;
  if (!artifact || !artifact.blob) return;

  const fallback = coordinator.snapshot().sessionId || 'cimbar-recv';
  const suggestedName = safeSuggestedName(artifact.suggestedName, fallback);
  let handle;
  try {
    handle = await window.showSaveFilePicker({ suggestedName });
  } catch (error) {
    logLine('save cancelled');
    return;
  }

  try {
    const writable = await handle.createWritable();
    await writable.write(artifact.blob);
    await writable.close();
    logLine(`saved ${suggestedName}`);
  } catch (error) {
    logLine(`save failed: ${(error && error.message) || error}`, true);
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

  el.btnLive.addEventListener('click', () => { void startLive(); });
  el.btnVideo.addEventListener('click', () => { el.fileInput.click(); });
  el.fileInput.addEventListener('change', () => {
    el.fileInput.value = '';
    logLine('importing a recording is not available in this build yet', true);
  });
  el.btnStop.addEventListener('click', () => coordinator.stop());
  el.btnSave.addEventListener('click', () => { void saveArtifact(); });

  render();
}

init();

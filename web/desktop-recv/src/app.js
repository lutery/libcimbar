// Desktop receiver entry. Single session at a time, one frame in flight.
// The UI never opens a picker without a user click.
import { inspectCapabilities } from './capabilities.js';
import { deriveControls, describeRecovery, safeSuggestedName } from './ui.js';
import { DecoderClient } from './decoder-client.js';

const MODE_B = 68;

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

const session = {
  counter: 0,
  snapshot: { sessionId: null, sessionSeq: 0, revision: 0, state: 'Idle', artifact: null },
  client: null,
  stream: null,
  videoUrl: null,
  inFlight: false,
  frameCallback: null,
};

let capabilities = null;
let assets = null;
let errorRegistry = null;
let framesSeen = 0;

function logLine(text, isError = false) {
  const prefix = isError ? '[error] ' : '';
  el.log.textContent += `${prefix}${text}\n`;
  el.log.scrollTop = el.log.scrollHeight;
}

function setSnapshot(patch) {
  session.snapshot = Object.assign({}, session.snapshot, patch, {
    revision: session.snapshot.revision + 1,
  });
  render();
}

function isCurrent(seq) {
  return session.snapshot.sessionSeq === seq &&
    !['Stopping', 'Stopped', 'Error'].includes(session.snapshot.state);
}

function render() {
  const controls = deriveControls(session.snapshot, capabilities || {});
  el.status.textContent = controls.statusText;
  el.btnLive.disabled = !(controls.canStart && capabilities.realtime);
  el.btnVideo.disabled = !controls.canImportVideo;
  el.btnStop.disabled = !controls.canStop;
  el.btnSave.disabled = !controls.canSave;

  const artifact = session.snapshot.artifact;
  if (artifact && artifact.byteLength >= 0) {
    el.artifact.hidden = false;
    el.artifactName.textContent = artifact.name || 'file';
    el.artifactSize.textContent = `${artifact.byteLength} bytes`;
  } else {
    el.artifact.hidden = true;
  }
  el.mode.textContent = 'Mode B';
}

function showError(code) {
  const recovery = describeRecovery(code, errorRegistry);
  logLine(`${code}: ${recovery.message} (${recovery.retryAction})`, true);
}

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function ensureClient() {
  if (session.client) return session.client;
  const worker = new Worker(new URL('../worker/decoder-worker.js', import.meta.url));

  const client = new DecoderClient(worker, { maxFramePixels: 4194304, maxArtifactBytes: 16777216 });
  await client.init({ mode: MODE_B, assets, limits: {} });
  session.client = client;
  return client;
}

function releaseSession() {
  if (session.stream) {
    for (const track of session.stream.getTracks()) track.stop();
    session.stream = null;
  }
  if (session.videoUrl) {
    URL.revokeObjectURL(session.videoUrl);
    session.videoUrl = null;
  }
  el.preview.pause();
  el.preview.srcObject = null;
  el.preview.removeAttribute('src');
  el.preview.hidden = true;
  if (session.client) {
    session.client.close();
    session.client = null;
  }
  session.inFlight = false;
  session.frameCallback = null;
}

function captureFrame(video) {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > 4194304) {
    logLine(`frame too large (${width}x${height}); not resizing`, true);
    return null;
  }
  const canvas = captureFrame.canvas || (captureFrame.canvas = new OffscreenCanvas(width, height));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, width, height);
  return { width, height, pixels: context.getImageData(0, 0, width, height).data.buffer };
}

async function handleResult(result, seq) {
  if (!isCurrent(seq)) return;
  if (result.outcome === 'no_data') {
    framesSeen += 1;
    if (framesSeen % 30 === 0) logLine(`${framesSeen} frames seen, no data yet`);
    return;
  }
  if (result.outcome === 'data') {
    logLine(`decoded ${result.bytesDecoded} bytes`);
    return;
  }
  if (result.outcome === 'artifact') {
    framesSeen = 0;
    setSnapshot({
      state: 'Ready',
      artifact: {
        byteLength: result.artifact.byteCount,
        name: result.artifact.suggestedName,
        blob: result.artifact.blob,
      },
    });
    logLine(`file rebuilt: ${result.artifact.byteCount} bytes`);
    return;
  }
  showError(result.errorCode);
}

function scheduleFrames(seq, video) {
  const step = async () => {
    if (!isCurrent(seq) || session.snapshot.state !== 'Receiving') return;
    if (session.client && !session.inFlight) {
      session.inFlight = true;
      try {
        const frame = captureFrame(video);
        if (frame) await handleResult(await session.client.submitFrame(frame), seq);
      } catch (error) {
        logLine(String((error && error.message) || error), true);
      }
      session.inFlight = false;
    }
    if (isCurrent(seq)) scheduleFrames(seq, video);
  };

  if (typeof video.requestVideoFrameCallback === 'function') {
    session.frameCallback = video.requestVideoFrameCallback(step);
  } else {
    setTimeout(step, 66);
  }
}

async function startLive() {
  if (!capabilities.realtime) return;
  const seq = ++session.counter;
  framesSeen = 0;
  setSnapshot({ sessionId: `s${seq}`, sessionSeq: seq, state: 'Preparing', artifact: null });

  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
  } catch (error) {
    setSnapshot({ state: 'Idle' });
    showError(12002);
    return;
  }

  session.stream = stream;
  el.preview.srcObject = stream;
  el.preview.hidden = false;
  await el.preview.play().catch(() => {});
  const track = stream.getVideoTracks()[0];
  if (track) {
    track.addEventListener('ended', () => {
      if (isCurrent(seq)) stopSession();
    });
  }

  try {
    await ensureClient();
  } catch (error) {
    logLine(`decoder unavailable: ${(error && error.message) || error}`, true);
    releaseSession();
    setSnapshot({ state: 'Idle' });
    return;
  }

  if (!isCurrent(seq)) {
    releaseSession();
    return;
  }
  setSnapshot({ state: 'Receiving' });
  scheduleFrames(seq, el.preview);
}

async function startVideo(file) {
  if (!file) return;
  const seq = ++session.counter;
  framesSeen = 0;
  setSnapshot({ sessionId: `s${seq}`, sessionSeq: seq, state: 'Preparing', artifact: null });

  session.videoUrl = URL.createObjectURL(file);
  el.preview.src = session.videoUrl;
  el.preview.hidden = false;

  el.preview.addEventListener('ended', () => {
    if (!isCurrent(seq)) return;
    if (session.snapshot.state === 'Ready') return;
    setSnapshot({ state: 'Incomplete' });
    logLine('the recording ended before the file was complete');
  }, { once: true });

  try {
    await el.preview.play();
    await ensureClient();
  } catch (error) {
    logLine(`video import failed: ${(error && error.message) || error}`, true);
    releaseSession();
    setSnapshot({ state: 'Idle' });
    return;
  }

  if (!isCurrent(seq)) { releaseSession(); return; }
  setSnapshot({ state: 'Receiving' });
  scheduleFrames(seq, el.preview);
}

function stopSession() {
  const seq = session.snapshot.sessionSeq;
  if (!isCurrent(seq)) return;
  setSnapshot({ state: 'Stopping' });
  releaseSession();
  setSnapshot({ state: 'Stopped' });
  logLine('stopped');
}

async function saveArtifact() {
  const artifact = session.snapshot.artifact;
  if (!artifact || !artifact.blob) return;

  const suggestedName = safeSuggestedName(artifact.name, session.snapshot.sessionId || 'cimbar-recv');
  let handle;
  try {
    handle = await window.showSaveFilePicker({ suggestedName });
  } catch (error) {
    logLine('save cancelled', false);
    return;
  }

  setSnapshot({ state: 'Saving' });
  try {
    const writable = await handle.createWritable();
    await writable.write(artifact.blob);
    await writable.close();
    setSnapshot({ state: 'Saved' });
    logLine(`saved ${suggestedName}`);
  } catch (error) {
    setSnapshot({ state: 'Retryable' });
    logLine(`save failed: ${(error && error.message) || error}`, true);
  }
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

  el.btnLive.addEventListener('click', () => { startLive(); });
  el.btnVideo.addEventListener('click', () => { el.fileInput.click(); });
  el.fileInput.addEventListener('change', () => {
    const file = el.fileInput.files && el.fileInput.files[0];
    el.fileInput.value = '';
    startVideo(file);
  });
  el.btnStop.addEventListener('click', stopSession);
  el.btnSave.addEventListener('click', saveArtifact);

  render();
}

init();

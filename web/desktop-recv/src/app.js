// Desktop receiver entry. The coordinator owns session state and the single
// in-flight frame; this file only wires DOM events to it and paints snapshots.
import { inspectCapabilities } from './capabilities.js';
import { deriveControls, describeRecovery, safeSuggestedName, noDataHint } from './ui.js';
import { DecoderClient } from './decoder-client.js';
import { LIMITS_DEFAULT } from './contracts.js';
import { SessionCoordinator } from './session.js';
import { toContractSnapshot } from './contract-snapshot.js';
import { SaveController } from './save-controller.js';
import { captureFrame } from './live-source.js';
import { VideoSource } from './video-source.js';
import { ReceiverTelemetry } from './ux-telemetry.js';
import { createUxDisplay } from './ux-display.js';

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
  uxPrimary: document.getElementById('ux-primary'),
  uxSecondary: document.getElementById('ux-secondary'),
  uxNext: document.getElementById('ux-next'),
  uxSave: document.getElementById('ux-save'),
  uxElapsed: document.getElementById('ux-elapsed'),
  uxRate: document.getElementById('ux-rate'),
  uxProgress: document.getElementById('ux-progress'),
  uxMedia: document.getElementById('ux-media'),
  uxAnnouncement: document.getElementById('ux-announcement'),
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
  createClient: async (owner) => {
    // A-R1: this factory owns the client until init settles. A rejection
    // (protocol init-failed, watchdog, or a throwing construction) releases
    // the worker here, because the coordinator never adopts the client.
    journey().initStartAt = Date.now();
    let client = null;
    try {
      const worker = new Worker(new URL('../worker/decoder-worker.js', import.meta.url));
      client = new DecoderClient(worker, {
        maxFramePixels: MAX_PIXELS,
        maxArtifactBytes: 16777216,
        // Main-thread watchdogs (A-03): the worker cannot rescue a wedged
        // thread itself. Limits come from the same frozen defaults as the
        // worker side (profile.json mirrors contracts.js).
        initTimeoutMs: LIMITS_DEFAULT.initTimeoutMs,
        frameTimeoutMs: LIMITS_DEFAULT.frameTimeoutMs,
      }, {
        // receiver-ux: the owner captured at session creation, plus the
        // monotonic main-thread clock for the submission timestamp.
        owner,
        nowMs: () => performance.now(),
      });
      await client.init({ mode: MODE_B, assets, limits: {} });
      journey().initReadyAt = Date.now();
      return client;
    } catch (error) {
      if (client && typeof client.close === 'function') client.close();
      throw error;
    }
  },
  maxPixels: MAX_PIXELS,
  createUx: () => new ReceiverTelemetry(),
  nowMs: () => performance.now(),
  onSnapshot: () => render(),
  onError: (code) => showError(code),
});

// --- receiver-ux display (T9 sparrow slice: read-only projection + clock) ---

function currentMediaPosition() {
  if (!activeVideoSource || typeof activeVideoSource.snapshot !== 'function') return null;
  const position = activeVideoSource.snapshot();
  if (!position || position.open !== true) return null;
  const seconds = position.positionSeconds;
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const duration = Number.isFinite(position.durationSeconds) && position.durationSeconds > 0
    ? position.durationSeconds : null;
  return {
    positionSeconds: seconds,
    durationSeconds: duration,
    fraction: duration === null ? null : Math.min(1, seconds / duration),
  };
}

function paintUx(payload) {
  if ('primary' in payload) el.uxPrimary.textContent = payload.primary;
  if ('secondary' in payload) el.uxSecondary.textContent = payload.secondary;
  if ('nextAction' in payload) el.uxNext.textContent = payload.nextAction;
  if ('save' in payload) el.uxSave.textContent = payload.save;
  if ('elapsedText' in payload) el.uxElapsed.textContent = payload.elapsedText;
  if ('rateText' in payload) el.uxRate.textContent = payload.rateText;
  if ('progressText' in payload) el.uxProgress.textContent = payload.progressText;
  if ('mediaText' in payload) el.uxMedia.textContent = payload.mediaText || '';
  if ('announcement' in payload) el.uxAnnouncement.textContent = payload.announcement;
  if ('diagnostics' in payload) {
    for (const code of payload.diagnostics) logLine(`ux ${code}`);
  }
}

const uxDisplay = createUxDisplay({
  readCurrent: () => {
    const snapshot = coordinator.snapshot();
    const telemetry = coordinator.uxTelemetry();
    const pending = coordinator.pendingSubmission();
    const controls = deriveControls(snapshot, capabilities || {});
    return {
      owner: snapshot.sessionId
        ? { sessionId: snapshot.sessionId, sessionSeq: snapshot.sessionSeq }
        : null,
      observation: telemetry && typeof telemetry.snapshot === 'function'
        ? telemetry.snapshot() : null,
      context: {
        state: snapshot.state,
        businessRevision: snapshot.revision,
        inputKind: snapshot.inputKind,
        cleanupComplete: snapshot.cleanupComplete,
        artifactId: snapshot.artifact && snapshot.artifact.artifactId
          ? String(snapshot.artifact.artifactId) : null,
        controls: {
          canStartLive: controls.canStart === true,
          canImportVideo: controls.canImportVideo === true,
          canStop: controls.canStop === true,
          canSave: controls.canSave === true,
        },
        inFlight: pending !== null,
        inFlightSinceMs: pending ? pending.submittedAtMs : null,
        mediaPosition: currentMediaPosition(),
        mediaDiagnosticCode: 0,
      },
    };
  },
  nowMs: () => performance.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (id) => clearTimeout(id),
  paint: paintUx,
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

// --- Measurement hooks (diagnostics only) ---------------------------------
// The external journey runner observes these from the page; nothing here
// changes product behavior. The status trail is bounded so a long-lived page
// cannot grow without limit.
function journey() {
  if (!window.__journey || typeof window.__journey !== 'object') window.__journey = {};
  return window.__journey;
}

function recordStatus(state) {
  const trail = Array.isArray(window.__statusTrail) ? window.__statusTrail : [];
  window.__statusTrail = trail;
  const last = trail[trail.length - 1];
  if (last && last.state === state) return;
  trail.push({ state, t: Date.now() });
  while (trail.length > 100) trail.shift();
}

function recordJourney(snapshot) {
  const marks = journey();
  if (snapshot.state === 'Receiving' && marks.receivingAt === undefined) {
    marks.receivingAt = Date.now();
  }
  if (snapshot.artifact && marks.readyAt === undefined) {
    marks.readyAt = Date.now();
  }
  if (snapshot.state === 'Saved' && marks.savedAt === undefined) {
    marks.savedAt = Date.now();
  }
}

function render() {
  const snapshot = coordinator.snapshot();
  // Diagnostics: last observed values for the external journey runner.
  window.__lastStats = snapshot.stats;
  window.__state = snapshot.state;
  recordStatus(snapshot.state);
  recordJourney(snapshot);
  window.__contractSnapshot = toContractSnapshot(snapshot, { mode: 'B' });
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
    activeVideoSource.run().catch((error) => {
      // B-S04: a broken recording must end finitely. The source already
      // surfaced its code and tore itself down; drive the session to a
      // recoverable terminal state instead of hanging in Receiving.
      logLine(String((error && error.message) || error), true);
      void coordinator.finishStream({ takeFinalSample: () => null }).catch(() => {});
    });
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

  // Recorded input is decoded frame-by-frame from the preview element while
  // it plays; a hidden video element does not present frames, so the frame
  // callback (and therefore the whole import) would stall. Keep it visible
  // for the lifetime of the video session.
  if (snapshot.inputKind === 'video' &&
      ['Receiving', 'Draining', 'Reconstructing'].includes(snapshot.state)) {
    el.preview.hidden = false;
  }

  // receiver-ux: the read-only Chinese feedback paints through the display
  // (business sections immediately, numbers through the shared 250ms gate).
  uxDisplay.syncBusiness();
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

// --- A-02 diagnostics: bounded per-import tail ledger -----------------------
// The external journey runner orders the last settled submissions, the EOF
// signal and the final sample from this array. It is diagnostics only: no
// product path reads it back, and it never grows past TAIL_EVENTS_CAP. `t` is
// the page clock in ms (Date.now()), consistent with this file's other records.
const TAIL_EVENTS_CAP = 16;

function recordTailEvent(timeline, event) {
  if (!timeline || !Array.isArray(timeline.tailEvents)) return;
  timeline.tailEvents.push(event);
  if (timeline.tailEvents.length > TAIL_EVENTS_CAP) timeline.tailEvents.shift();
}

function startVideoImport(file) {
  if (!capabilities.videoImport) return;
  startClicks += 1;
  videoRunStarted = false;
  // Diagnostics: one timeline per import attempt (fresh identity each time).
  const attemptId = `video-${startClicks}`;
  window.__videoTimeline = {
    attemptId,
    presented: 0,
    firstUs: null,
    lastUs: null,
    endReason: null,
    artifactFrameId: null,
    finalSample: null,
    // A-02: bounded tail ledger; the oldest event shifts out at the cap.
    tailEvents: [],
  };
  const result = coordinator.startVideo({
    requestId: attemptId,
    openSource: async () => {
      // The shared preview element doubles as the video element; the source
      // sets its src and reclaims the URL on stop.
      const source = new VideoSource({
        createElement: () => el.preview,
        submit: (frame, meta) => {
          const timeline = window.__videoTimeline;
          if (timeline && meta && Number.isFinite(meta.mediaTimeUs)) {
            if (timeline.firstUs === null) timeline.firstUs = meta.mediaTimeUs;
            timeline.lastUs = meta.mediaTimeUs;
            timeline.presented += 1;
          }
          const submission = coordinator.submitVideoFrame(frame);
          if (timeline && submission && typeof submission.then === 'function') {
            submission.then((frameResult) => {
              if (frameResult && frameResult.outcome === 'artifact') {
                timeline.artifactFrameId = frameResult.frameId ?? null;
              }
              // A-02: keep the settled submission's media time and outcome so
              // the tail window can be ordered against eof and the drain.
              recordTailEvent(timeline, {
                kind: 'result',
                outcome: frameResult && frameResult.outcome != null ? frameResult.outcome : null,
                frameId: frameResult && frameResult.frameId != null ? frameResult.frameId : null,
                mediaTimeUs: meta && Number.isFinite(meta.mediaTimeUs) ? meta.mediaTimeUs : null,
                t: Date.now(),
              });
            }).catch(() => { /* the run path surfaces the failure */ });
          }
          return submission;
        },
        onEnded: (reason) => {
          if (window.__videoTimeline) window.__videoTimeline.endReason = reason;
          recordTailEvent(window.__videoTimeline, {
            kind: 'ended',
            reason: reason ?? null,
            t: Date.now(),
          });
          // EOF drain takes one real final capture (B-S04): the recorded
          // path must not skip the last usable frame like the live path.
          void coordinator.finishStream({
            takeFinalSample: () => {
              const frame = captureFrame(el.preview, {
                maxPixels: MAX_PIXELS,
                onError: (code) => showError(code),
              });
              const capturedAt = Date.now();
              if (window.__videoTimeline) {
                window.__videoTimeline.finalSample = frame
                  ? { captured: true, width: frame.width, height: frame.height, t: capturedAt }
                  : { captured: false, t: capturedAt };
              }
              recordTailEvent(window.__videoTimeline, {
                kind: 'finalSample',
                captured: !!frame,
                width: frame ? frame.width : null,
                height: frame ? frame.height : null,
                t: capturedAt,
              });
              return frame;
            },
          }).catch((error) => logLine(String((error && error.message) || error), true));
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
  // receiver-ux: capture the immutable save owner synchronously in the click,
  // before the picker; the first genuine selecting event binds it to the
  // real attempt id. The original start call below is untouched.
  coordinator.uxSaveIntent();
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
      onEvent: (event) => {
        const marks = journey();
        if (event.saveStatus === 'selecting' && marks.saveRequestAt === undefined) {
          marks.saveRequestAt = Date.now();
        }
        if (event.saveStatus === 'saved' && marks.writeCloseAt === undefined) {
          marks.writeCloseAt = Date.now();
        }
        reportSave(event);
        coordinator.saveEvent(event);
      },
    });
    coordinator.attachSave(saveController);
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

  document.addEventListener('visibilitychange', () => {
    uxDisplay.setVisible(document.visibilityState !== 'hidden');
  });
  window.addEventListener('pagehide', () => { uxDisplay.dispose(); });

  render();
}

init();

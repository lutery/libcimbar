// Receiver UX display lifecycle (M4, receiver-ux-v2 internal). One instance
// per page: createUxDisplay assembles the read-only view projection from the
// business snapshot plus the observation and paints only changed sections.
// It never touches capture, submission, save IO or the session state machine;
// the display clock is a courtesy timer for elapsed/rate only.
import { readView, formatElapsed, formatRate, formatProgress, formatMedia } from './ux-view.js';

const REFRESH_MS = 250; // viewRefreshMinMs from contracts/ux-display-config.json
const ACTIVE_STATES = new Set(['Receiving', 'Draining', 'Reconstructing']);
const DIAGNOSTICS_CAP = 15;

const EMPTY_OBSERVATION = Object.freeze({
  version: 1,
  sessionId: null,
  sessionSeq: 0,
  inputKind: null,
  observationRevision: 0,
  receivingAtMs: null,
  endedAtMs: null,
  rate: Object.freeze({ epochMs: 0, buckets: Object.freeze([]) }),
  progress: Object.freeze({
    trustedRatio: null,
    trustedAtMs: null,
    lastAdvanceAtMs: null,
    lastDataAtMs: null,
    lastResultAtMs: null,
    ambiguity: null,
  }),
  save: Object.freeze({ phase: 'none', attemptId: null, artifactId: null, errorCode: null }),
  diagnostics: Object.freeze([]),
});

const SAVE_TEXT = {
  none: '',
  selecting: '请选择保存位置',
  writing: '正在保存文件',
  pending: '正在等待保存完成',
  saved: '文件已保存',
  cancelled: '保存已取消，文件仍可保存',
  failed: '保存失败，可以重试',
  aborted: '保存中止',
};

export function createUxDisplay({ readCurrent, nowMs, setTimer, clearTimer, paint }) {
  let owner = null; // {sessionId, sessionSeq} of the refresher's session
  let timerId = null;
  let active = false;
  let disposed = false;
  let lastViewAtMs = 0;
  let lastTelemetryWriteAt = null;
  let announcedKey = null;
  let lastBusiness = {};
  let lastTelemetry = {};
  const queuedDiagnostics = new Set();

  function sameOwner(a, b) {
    return a === null && b === null
      || (a !== null && b !== null
        && a.sessionId === b.sessionId && a.sessionSeq === b.sessionSeq);
  }

  function releaseTimer() {
    if (timerId !== null) {
      if (typeof clearTimer === 'function') clearTimer(timerId);
      timerId = null;
    }
    active = false;
  }

  function queueDiagnostic(code) {
    if (queuedDiagnostics.size < DIAGNOSTICS_CAP) queuedDiagnostics.add(code);
  }

  function safePaint(payload) {
    try {
      paint(payload);
    } catch (error) {
      queueDiagnostic(19012);
    }
  }

  // One projection: assemble the request, run readView, act on the result.
  function project() {
    if (disposed) return;
    const current = readCurrent();
    if (!current) return;
    const now = nowMs();
    const nextOwner = current.owner || null;
    if (!sameOwner(nextOwner, owner)) {
      // owner change: drop the old refresher and every per-seq paint memory
      releaseTimer();
      owner = nextOwner;
      announcedKey = null;
      lastBusiness = {};
      lastTelemetry = {};
      lastTelemetryWriteAt = null;
      lastViewAtMs = 0;
    }
    const request = {
      version: 1,
      sessionId: nextOwner ? nextOwner.sessionId : null,
      sessionSeq: nextOwner ? nextOwner.sessionSeq : 0,
      nowMs: now,
      context: current.context,
    };
    const result = readView(current.observation || EMPTY_OBSERVATION, request);
    if (!result.ok) {
      queueDiagnostic(result.code);
      scheduleFor(current.context.state);
      flushBusiness();
      return;
    }
    const view = result.data;
    if (typeof now === 'number' && now < lastViewAtMs) return; // no rollback
    lastViewAtMs = view.viewAtMs;
    paintBusinessFrom(view);
    maybePaintTelemetryFrom(view, now);
    scheduleFor(current.context.state);
  }

  function paintBusinessFrom(view) {
    const sections = {};
    if (view.primary !== lastBusiness.primary) sections.primary = view.primary;
    if (view.secondary !== lastBusiness.secondary) sections.secondary = view.secondary;
    if (view.nextAction !== lastBusiness.nextAction) sections.nextAction = view.nextAction;
    const saveText = SAVE_TEXT[view.save.phase] ?? '';
    if (saveText !== lastBusiness.save) sections.save = saveText;
    if (view.announcementKey !== announcedKey) {
      announcedKey = view.announcementKey;
      const secondary = view.secondary ? ` ${view.secondary}` : '';
      sections.announcement = `${view.primary}${secondary}`;
      if (queuedDiagnostics.size > 0) {
        sections.diagnostics = [...queuedDiagnostics];
        queuedDiagnostics.clear();
      }
    }
    if (Object.keys(sections).length > 0) safePaint(sections);
  }

  function maybePaintTelemetryFrom(view, now) {
    if (typeof now !== 'number' || !Number.isFinite(now)) return;
    const sections = {};
    const elapsedChanged = view.elapsedMs !== lastTelemetry.elapsedMs;
    if (elapsedChanged) {
      sections.elapsedMs = view.elapsedMs;
      sections.elapsedText = formatElapsed(view.elapsedMs);
      lastTelemetry.elapsedMs = view.elapsedMs;
    }
    const rateText = formatRate(view.rate);
    if (rateText !== lastTelemetry.rateText) {
      sections.rateText = rateText;
      lastTelemetry.rateText = rateText;
    }
    const progressText = formatProgress(view.progress);
    if (progressText !== lastTelemetry.progressText) {
      sections.progressText = progressText;
      lastTelemetry.progressText = progressText;
    }
    const mediaText = formatMedia(view.mediaPosition);
    if (mediaText !== lastTelemetry.mediaText) {
      sections.mediaText = mediaText;
      lastTelemetry.mediaText = mediaText;
    }
    if (Object.keys(sections).length === 0) return; // identical text: no write
    if (lastTelemetryWriteAt !== null && now - lastTelemetryWriteAt < REFRESH_MS) return;
    lastTelemetryWriteAt = now; // the shared boundary for events and ticks
    sections.observationRevision = view.observationRevision;
    sections.businessRevision = view.businessRevision;
    safePaint(sections);
  }

  function scheduleFor(contextState) {
    const isActive = ACTIVE_STATES.has(contextState);
    if (!isActive) {
      releaseTimer();
      return;
    }
    active = true;
    if (timerId !== null) return;
    const seq = owner ? owner.sessionSeq : 0;
    const callback = () => {
      if (!owner || owner.sessionSeq !== seq) return; // a stale refresher
      if (disposed) return;
      timerId = null;
      project();
    };
    timerId = setTimer(callback, REFRESH_MS);
  }

  function flushBusiness() {
    if (queuedDiagnostics.size > 0) {
      const payload = { diagnostics: [...queuedDiagnostics] };
      queuedDiagnostics.clear();
      safePaint(payload);
    }
  }

  function syncBusiness() {
    project();
  }

  function setVisible(visible) {
    if (disposed) return;
    if (!visible) {
      releaseTimer();
      return;
    }
    lastTelemetryWriteAt = null; // one immediate write on resume
    project();
  }

  function dispose() {
    releaseTimer();
    disposed = true;
  }

  return { syncBusiness, setVisible, dispose };
}

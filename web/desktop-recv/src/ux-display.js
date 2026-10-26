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
      return true;
    } catch (error) {
      queueDiagnostic(19012);
      return false; // nothing was committed to the display layer
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
    if (!ACTIVE_STATES.has(current.context.state)) flushTerminalTelemetry(view, now);
    scheduleFor(current.context.state);
  }

  function paintBusinessFrom(view) {
    const sections = {};
    const saveText = SAVE_TEXT[view.save.phase] ?? '';
    if (view.primary !== lastBusiness.primary) sections.primary = view.primary;
    if (view.secondary !== lastBusiness.secondary) sections.secondary = view.secondary;
    if (view.nextAction !== lastBusiness.nextAction) sections.nextAction = view.nextAction;
    if (saveText !== lastBusiness.save) sections.save = saveText;
    const announces = view.announcementKey !== announcedKey;
    if (announces) {
      const secondary = view.secondary ? ` ${view.secondary}` : '';
      sections.announcement = `${view.primary}${secondary}`;
      if (queuedDiagnostics.size > 0) {
        sections.diagnostics = [...queuedDiagnostics];
      }
    }
    if (Object.keys(sections).length === 0) return; // identical semantics: no write
    if (!safePaint(sections)) return; // retry the same content on the next sync
    lastBusiness = {
      primary: view.primary,
      secondary: view.secondary,
      nextAction: view.nextAction,
      save: saveText,
    };
    if (announces) {
      announcedKey = view.announcementKey;
      if (sections.diagnostics) queuedDiagnostics.clear();
    }
  }

  // The numeric projection is committed only after a successful paint; a value
  // the gate (or a paint failure) dropped stays pending, so the next projection
  // recomputes it from the newest view instead of losing it (round-12 A-R2).
  function maybePaintTelemetryFrom(view, now, { force = false } = {}) {
    if (typeof now !== 'number' || !Number.isFinite(now)) return;
    const elapsedText = formatElapsed(view.elapsedMs);
    const rateText = formatRate(view.rate);
    const progressText = formatProgress(view.progress);
    const mediaText = formatMedia(view.mediaPosition);
    const sections = {};
    if (view.elapsedMs !== lastTelemetry.elapsedMs) {
      sections.elapsedMs = view.elapsedMs;
      sections.elapsedText = elapsedText;
    }
    if (rateText !== lastTelemetry.rateText) sections.rateText = rateText;
    if (progressText !== lastTelemetry.progressText) sections.progressText = progressText;
    if (mediaText !== lastTelemetry.mediaText) sections.mediaText = mediaText;
    if (Object.keys(sections).length === 0) return; // identical text: no write
    if (!force && lastTelemetryWriteAt !== null && now - lastTelemetryWriteAt < REFRESH_MS) {
      return; // the shared boundary dropped this projection; nothing is committed
    }
    sections.observationRevision = view.observationRevision;
    sections.businessRevision = view.businessRevision;
    if (!safePaint(sections)) return; // a failed write is not a painted value
    lastTelemetry = {
      elapsedMs: view.elapsedMs,
      rateText,
      progressText,
      mediaText,
    };
    lastTelemetryWriteAt = now; // the shared boundary for events and ticks
  }

  // Terminal convergence: leaving the active states owes the user the final
  // metrics even when the shared gate would still be closed. This one write
  // may cross the boundary; it is idempotent because a painted projection
  // leaves no diff for the next sync.
  function flushTerminalTelemetry(view, now) {
    maybePaintTelemetryFrom(view, now, { force: true });
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
    if (queuedDiagnostics.size === 0) return;
    const payload = { diagnostics: [...queuedDiagnostics] };
    if (safePaint(payload)) queuedDiagnostics.clear();
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

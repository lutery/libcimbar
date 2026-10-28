// Session coordinator (M02): the only writer of session state.
// One session at a time; the source picker is opened synchronously inside the
// user click, before any await. Late streams and late worker results are
// cleaned up against the token of the session that created them.
import { FrameScheduler } from './frame-scheduler.js';

const RAW_SAVE_STATUSES = new Set([
  'selecting', 'writing', 'pending', 'saved', 'cancelled', 'failed', 'aborted',
]);
const TERMINAL_SAVE_STATUSES = new Set(['saved', 'cancelled', 'failed', 'aborted']);
const SAVE_BINDINGS_CAP = 16;

// Restartable terminal states. Kept in lockstep with the UI's IDLE_LIKE set
// (ui.js): a session that ended Incomplete must accept a fresh start through
// both entries instead of dead-ending the user (round-1 review A-02).
const IDLE_STATES = new Set(['Idle', 'Stopped', 'Saved', 'Incomplete']);

export class SessionCoordinator {
  constructor(options = {}) {
    this._createClient = options.createClient;
    this._getDisplayMedia = options.getDisplayMedia;
    this._onSnapshot = options.onSnapshot || (() => {});
    this._onError = options.onError || (() => {});
    this._maxPixels = options.maxPixels || 4194304;
    // Optional receiver-ux observation (receiver-ux-v2): a fresh ux model per
    // session comes from createUx; nowMs is the monotonic main-thread clock
    // used for begin/accept/finish stamps. Legacy callers keep working.
    this._createUx = typeof options.createUx === 'function' ? options.createUx : null;
    this._nowMs = typeof options.nowMs === 'function' ? options.nowMs
      : () => performance.now();
    this._ux = null;
    this._uxSeq = 0;
    this._uxFinished = false;
    this._uxSaveOwner = null;
    this._saveAttemptBindings = new Map();

    this._counter = 0;
    this._eventSeq = 0;
    this._session = null;
    this._client = null;
    this._scheduler = null;
    this._stream = null;
    this._videoSource = null;
    this._startRequests = new Map(); // requestId -> sessionId
    this._pending = new Set();
    this._saveWhenSettled = null;
    this._cleanupToken = 0;
  }

  // Read-only ux accessors for the display layer (T9): the current model and
  // the real pending submission metadata of the adopted client, if any.
  uxTelemetry() {
    return this._ux;
  }

  pendingSubmission() {
    const client = this._client;
    return client && typeof client.pendingSubmission === 'function'
      ? client.pendingSubmission()
      : null;
  }

  snapshot() {
    if (!this._session) {
      return Object.freeze({
        sessionId: null, sessionSeq: 0, revision: 0, state: 'Idle',
        artifact: null, inputKind: null, inputEnded: false,
        cleanupComplete: true, eventSeq: this._eventSeq,
        stats: { submitted: 0, dropped: 0, completed: 0, failed: 0, inFlight: false },
      });
    }
    const s = this._session;
    return Object.freeze({
      sessionId: s.id,
      sessionSeq: s.seq,
      revision: s.revision,
      state: s.state,
      artifact: s.artifact,
      inputKind: s.inputKind,
      inputEnded: s.inputEnded,
      capturePending: s.capturePending === true,
      startedAt: s.startedAt,
      saveAttemptId: s.saveAttemptId || null,
      cleanupComplete: this._pending.size === 0,
      eventSeq: this._eventSeq,
      stats: this._scheduler ? this._scheduler.stats()
        : { submitted: 0, dropped: 0, completed: 0, failed: 0, inFlight: false },
    });
  }

  _emit(patch) {
    if (!this._session) return;
    Object.assign(this._session, patch);
    this._session.revision += 1;
    this._eventSeq += 1;
    this._onSnapshot(this.snapshot());
  }

  _isCurrent(seq) {
    return !!this._session && this._session.seq === seq;
  }

  _isStopping() {
    return !!this._session && ['Stopping', 'Stopped'].includes(this._session.state);
  }

  // Track a promise as part of cleanup, so Stopped is only reported once every
  // pending picker/decoder operation has settled.
  _track(promise) {
    const tracked = Promise.resolve(promise).catch(() => {});
    this._pending.add(tracked);
    tracked.finally(() => {
      this._pending.delete(tracked);
      if (!this._session || this._pending.size > 0) return;
      if (this._session.state === 'Stopping') {
        this._emit({ state: 'Stopped' });
      } else {
        // B-R1: the UI may have rendered while cleanup was still open (Idle
        // with cleanupComplete=false). Re-emit on convergence so it re-enables.
        this._emit({});
      }
    });
    return tracked;
  }

  _newSession(kind) {
    const seq = ++this._counter;
    this._session = {
      id: `s${seq}`,
      seq,
      revision: 0,
      state: 'Preparing',
      artifact: null,
      inputKind: kind,
      inputEnded: false,
      capturePending: false,
      startedAt: Date.now(),
    };
    this._client = null;
    this._scheduler = null;
    this._stream = null;
    this._videoSource = null;
    this._ux = null;
    this._uxSeq = 0;
    this._uxFinished = false;
    this._uxSaveOwner = null;
    this._saveAttemptBindings.clear();
    this._eventSeq += 1;
    this._onSnapshot(this.snapshot());
    return seq;
  }

  // Recorded-video session. The file input's change event is the user
  // activation; openSource runs the metadata/decode precheck and returns a
  // VideoSource that has NOT started stepping yet.
  startVideo({ requestId = 'video', openSource } = {}) {
    const previousId = this._startRequests.get(requestId);
    if (previousId && this._session && this._session.id === previousId &&
        !IDLE_STATES.has(this._session.state)) {
      return { accepted: true, duplicate: true, sessionId: previousId };
    }
    // B-R1: no new session may start while an earlier one still owns a
    // pending picker/init. The state can already read Idle (a cancelled
    // capture), so the pending set is the authoritative cleanup gate.
    if (this._pending.size > 0) {
      return { accepted: false, reason: 'cleanup' };
    }
    if (this._session && !IDLE_STATES.has(this._session.state)) {
      return { accepted: false, reason: 'busy' };
    }

    const seq = this._newSession('video');
    this._startRequests.set(requestId, this._session.id);
    this._capturePendingSet(seq, true);

    this._track(
      Promise.resolve()
        .then(() => openSource())
        .then((source) => {
          this._capturePendingSet(seq, false);
          this._attachVideoSource(seq, source);
        })
        .catch((error) => {
          this._capturePendingSet(seq, false);
          this._captureRejected(seq, error);
        })
    );
    this._track(this._initializeDecoder(seq));
    return { accepted: true, sessionId: this._session.id };
  }

  _attachVideoSource(seq, source) {
    if (!this._isCurrent(seq) || this._isStopping() || this._session.captureRejected) {
      if (source && typeof source.stop === 'function') source.stop();
      return;
    }
    this._videoSource = source;
    this._maybeStart(seq);
  }

  _mediaReady() {
    return !!(this._stream || this._videoSource);
  }

  _maybeStart(seq) {
    if (!this._isCurrent(seq) || this._isStopping()) return;
    if (this._mediaReady() && this._client && this._session.state === 'Preparing') {
      this._uxBegin(seq);
      this._emit({ state: 'Receiving' });
    }
  }

  // --- receiver-ux observation (bypass only; never a state machine change) --

  _uxBegin(seq) {
    if (!this._createUx) return;
    const session = this._session;
    if (!session || session.seq !== seq) return;
    this._ux = this._createUx();
    this._uxSeq = seq;
    this._uxFinished = false;
    try {
      this._ux.begin({
        version: 1,
        sessionId: session.id,
        sessionSeq: session.seq,
        inputKind: session.inputKind,
        nowMs: this._nowMs(),
      });
    } catch (error) { /* the observation side channel never breaks the session */ }
  }

  // An old worker (or a bad bypass) only degrades the ux report; the frame's
  // business outcome and bytes stay exactly what the original result carried.
  _normalizeObservation(observation) {
    if (!observation || typeof observation !== 'object') {
      return { state: 'unavailable', ratios: [], diagnosticCode: 19015 };
    }
    if (observation.version !== 1) {
      return { state: 'unavailable', ratios: [], diagnosticCode: 19013 };
    }
    const report = observation.report;
    if (this._isValidReport(report)) {
      return {
        state: report.state,
        ratios: report.ratios.map((ratio) => ratio),
        diagnosticCode: report.diagnosticCode,
      };
    }
    return { state: 'unavailable', ratios: [], diagnosticCode: 19008 };
  }

  _isValidReport(report) {
    if (!report || typeof report !== 'object') return false;
    const states = ['single', 'multiple', 'empty', 'unavailable', 'not_sampled'];
    if (!states.includes(report.state)) return false;
    if (!Array.isArray(report.ratios) || report.ratios.length > 8) return false;
    for (const ratio of report.ratios) {
      if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0) return false;
    }
    if (!Number.isSafeInteger(report.diagnosticCode)) return false;
    switch (report.state) {
      case 'single':
        return report.ratios.length === 1 && report.diagnosticCode === 0;
      case 'multiple':
        return report.ratios.length >= 2 && report.diagnosticCode === 19005;
      case 'empty':
      case 'not_sampled':
        return report.ratios.length === 0 && report.diagnosticCode === 0;
      case 'unavailable': {
        const codes = [19001, 19002, 19003, 19004, 19008, 19013, 19015];
        return report.ratios.length === 0 && codes.includes(report.diagnosticCode);
      }
      default:
        return false;
    }
  }

  _uxAccept(seq, result) {
    if (!this._ux || this._uxSeq !== seq) return;
    const session = this._session;
    if (!session) return;
    const outcome = result && result.outcome;
    const input = {
      version: 1,
      sessionId: session.id,
      sessionSeq: session.seq,
      frameId: result ? result.frameId : undefined,
      receivedAtMs: this._nowMs(),
      outcome,
      bytesDecoded: 0,
      report: { state: 'not_sampled', ratios: [], diagnosticCode: 0 },
    };
    if (outcome === 'data' || outcome === 'artifact') {
      input.bytesDecoded = result.bytesDecoded;
      input.report = this._normalizeObservation(result.uxObservation);
    }
    try {
      this._ux.acceptFrame(input);
    } catch (error) { /* ux refuse never blocks the original result */ }
  }

  // A genuine terminal finishes the observation exactly once per session.
  _uxFinish(seq, reason, artifactId) {
    if (!this._ux || this._uxSeq !== seq) return;
    if (this._uxFinished) return;
    const session = this._session;
    if (!session) return;
    this._uxFinished = true;
    try {
      this._ux.finish({
        version: 1,
        sessionId: session.id,
        sessionSeq: session.seq,
        nowMs: this._nowMs(),
        reason,
        artifactId: typeof artifactId === 'string' && artifactId ? artifactId : null,
      });
    } catch (error) { /* the observation side channel never breaks the session */ }
  }

  startLive({ requestId = 'live' } = {}) {
    // Idempotency first: the same requestId against the still-active session
    // returns the original operation instead of opening a second picker.
    const previousId = this._startRequests.get(requestId);
    if (previousId && this._session && this._session.id === previousId &&
        !IDLE_STATES.has(this._session.state)) {
      return { accepted: true, duplicate: true, sessionId: previousId };
    }
    // B-R1: same cleanup gate as startVideo (see above).
    if (this._pending.size > 0) {
      return { accepted: false, reason: 'cleanup' };
    }
    if (this._session && !IDLE_STATES.has(this._session.state)) {
      return { accepted: false, reason: 'busy' };
    }

    const seq = this._newSession('live');
    this._startRequests.set(requestId, this._session.id);

    // Synchronous reservation, then the picker inside the click — no await in
    // between. Handlers are installed immediately so a late stream is closed.
    let picker;
    try {
      picker = this._getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    } catch (error) {
      this._captureRejected(seq, error);
      return { accepted: true, sessionId: this._session.id };
    }

    this._capturePendingSet(seq, true);
    this._track(
      Promise.resolve(picker)
        .then((stream) => {
          this._capturePendingSet(seq, false);
          this._attachCapture(seq, stream);
        })
        .catch((error) => {
          this._capturePendingSet(seq, false);
          this._captureRejected(seq, error);
        })
    );
    this._track(this._initializeDecoder(seq));
    return { accepted: true, sessionId: this._session.id };
  }

  _capturePendingSet(seq, value) {
    if (this._isCurrent(seq) && this._session) this._session.capturePending = value;
  }

  _attachCapture(seq, stream) {
    if (!this._isCurrent(seq) || this._isStopping() || this._session.captureRejected) {
      if (stream && typeof stream.getTracks === 'function') {
        for (const track of stream.getTracks()) track.stop();
      }
      return;
    }
    this._stream = stream;
    const track = stream.getVideoTracks ? stream.getVideoTracks()[0] : null;
    if (track) {
      track.addEventListener('ended', () => {
        if (!this._isCurrent(seq) || this._isStopping()) return;
        this._emit({ inputEnded: true, state: 'Draining' });
      });
    }
    this._maybeStart(seq);
  }

  _initializeDecoder(seq) {
    const owner = this._session
      ? { sessionId: this._session.id, sessionSeq: this._session.seq }
      : null;
    return Promise.resolve(this._createClient(owner))
      .then((client) => {
        if (!this._isCurrent(seq) || this._isStopping() ||
            (this._session && this._session.captureRejected)) {
          // A dead session (stopped, superseded, or capture-rejected) must
          // not adopt the client: close it instead of leaking the worker.
          if (client && typeof client.close === 'function') client.close();
          return;
        }
        this._client = client;
        if (client && typeof client === 'object') {
          // A channel that dies after ready ends the session (A-03): the
          // client guarantees this fires at most once.
          client.onFailure = (error) => {
            if (this._isCurrent(seq)) this._decoderFailed(seq, error);
          };
        }
        this._scheduler = new FrameScheduler({
          submit: (frame) => client.submitFrame(frame),
          maxPixels: this._maxPixels,
          onResult: (result) => this._onFrameResult(seq, result),
          onError: (code) => { if (this._isCurrent(seq)) this._onError(code); },
        });
        this._maybeStart(seq);
      })
      .catch((error) => {
        if (this._isCurrent(seq)) this._decoderFailed(seq, error);
      });
  }

  // The picker/openSource was cancelled or failed: this session's data
  // identity is void. Retire whatever the parallel decoder init already
  // created and forbid late arrivals from attaching (round-1 review C-02).
  _captureRejected(seq, error) {
    if (!this._isCurrent(seq)) return;
    // A rejection arriving after stop must not pull Stopping back to Idle.
    if (this._isStopping()) return;
    this._onError(error && error.code ? error.code : 12002);
    this._emit({ state: 'Idle', captureRejected: true });
    this.releaseInputs();
  }

  // Decoder init failure is fatal for the session: it must converge to a
  // terminal state instead of hanging in Preparing forever.
  _decoderFailed(seq, error) {
    if (!this._isCurrent(seq)) return;
    if (this._isStopping()) return; // a user-initiated stop settles silently
    this._onError(error && error.code ? error.code : 15001);
    this._uxFinish(seq, 'error', null);
    this._emit({ state: 'Stopping' });
    this.releaseInputs();
    if (this._pending.size === 0) {
      this._emit({ state: 'Stopped' });
    }
  }

  // One frame from the live source. Drops are counted by the scheduler.
  offerFrame(frame) {
    if (!this._session || this._session.state !== 'Receiving' || !this._scheduler) return false;
    return this._scheduler.submitFrame(frame);
  }

  // Paced path for recorded media: resolves with the actual result so the
  // source can step one frame at a time. The session still owns the state
  // transitions (Ready on artifact, errors surfaced).
  submitVideoFrame(frame) {
    const session = this._session;
    if (!session || session.state !== 'Receiving' || !this._scheduler) {
      return Promise.resolve({ outcome: 'error', errorCode: 11003 });
    }
    const seq = session.seq;
    return this._scheduler.submitAndWait(frame).then((result) => {
      this._onFrameResult(seq, result);
      return result;
    }).catch((error) => {
      const code = error && Number.isSafeInteger(error.code) ? error.code : 15003;
      if (this._isCurrent(seq)) this._onError(code);
      return { outcome: 'error', errorCode: code };
    });
  }

  _onFrameResult(seq, result) {
    if (!this._isCurrent(seq)) return;
    if (this._isStopping()) return;
    if (this._session.state !== 'Receiving' && this._session.state !== 'Draining') return;

    this._uxAccept(seq, result);

    if (result.outcome === 'artifact') {
      this._uxFinish(seq, 'artifact', result.artifact && result.artifact.artifactId);
      this._emit({ state: 'Ready', artifact: result.artifact });
      return;
    }
    if (result.outcome === 'error') {
      this._onError(result.errorCode);
    }
  }

  // Save events flow through the coordinator so the session state machine
  // stays the only writer: Ready -> Saving -> Saved | Retryable. During
  // Stopping the state is frozen; the save still settles honestly.
  attachSave(controller) {
    this._saveWhenSettled = () => controller.whenSettled();
  }

  // --- save observation boundary (recipe E; bypass only) ---------------------

  // Called synchronously inside the user's save click, before the picker: it
  // captures the immutable owner {sessionId, sessionSeq, artifactId} that the
  // coming attempt's events belong to. The picker is never awaited here.
  uxSaveIntent() {
    if (!this._session) return;
    const artifact = this._session.artifact;
    this._uxSaveOwner = {
      sessionId: this._session.id,
      sessionSeq: this._session.seq,
      artifactId: artifact && artifact.artifactId != null
        ? String(artifact.artifactId)
        : null,
    };
  }

  _observeSaveEvent(event) {
    if (!this._ux) return;
    try {
      const rawStatus = event && event.saveStatus;
      if (!RAW_SAVE_STATUSES.has(rawStatus)) return;
      const attemptId = event.attemptId == null ? null : String(event.attemptId);
      if (rawStatus === 'selecting') {
        // the first genuine event of the attempt binds the captured owner to
        // the real attemptId; an already-bound attempt keeps its owner
        if (attemptId && this._uxSaveOwner && this._uxSaveOwner.artifactId != null) {
          const bound = this._saveAttemptBindings.get(attemptId);
          if (!bound) {
            if (this._saveAttemptBindings.size >= SAVE_BINDINGS_CAP) {
              this._saveAttemptBindings.clear();
            }
            this._saveAttemptBindings.set(attemptId, { ...this._uxSaveOwner });
            this._uxSaveOwner = null; // consumed exactly once
          }
        }
        const owner = attemptId ? this._saveAttemptBindings.get(attemptId) : null;
        if (owner) this._sendSaveObservation(owner, attemptId, rawStatus, event.lastError);
        return;
      }
      if (!attemptId) return; // a null attempt can never be bound
      const owner = this._saveAttemptBindings.get(attemptId);
      if (!owner) return; // an unbound attempt stays silent (recipe E)
      this._sendSaveObservation(owner, attemptId, rawStatus, event.lastError);
      if (TERMINAL_SAVE_STATUSES.has(rawStatus)) {
        this._saveAttemptBindings.delete(attemptId); // settled: cleanup
      }
    } catch (error) { /* the save observation bypass never blocks the session */ }
  }

  _sendSaveObservation(owner, attemptId, rawStatus, errorCode) {
    try {
      this._ux.observeSave({
        version: 1,
        sessionId: owner.sessionId,
        sessionSeq: owner.sessionSeq,
        artifactId: owner.artifactId,
        attemptId,
        rawStatus,
        errorCode: errorCode == null ? null : Number(errorCode),
      });
    } catch (error) { /* bypass only */ }
  }

  saveEvent(event) {
    this._observeSaveEvent(event); // ux bypass first, never blocks the state machine
    if (!this._session || !this._isCurrent(this._session.seq)) return;
    if (this._isStopping()) return; // the state is frozen; the save settles honestly

    switch (event.saveStatus) {
      case 'selecting':
      case 'writing':
      case 'pending':
        if (['Ready', 'Saving', 'Retryable'].includes(this._session.state)) {
          this._emit({ state: 'Saving', saveAttemptId: event.attemptId || null });
        }
        break;
      case 'saved':
        if (['Saving', 'Ready'].includes(this._session.state)) {
          this._emit({ state: 'Saved', saveAttemptId: event.attemptId || null });
        }
        break;
      case 'failed':
      case 'cancelled':
        if (this._session.state === 'Saving') {
          this._emit({ state: 'Retryable', saveAttemptId: event.attemptId || null });
        }
        break;
      default:
        break; // aborted and unknown statuses leave the state unchanged
    }
  }

  // EOF barrier: wait for the in-flight reply, allow at most one final sample.
  // A session that already reached Ready has nothing left to drain.
  async finishStream({ takeFinalSample } = {}) {
    if (!this._scheduler || !this._session) return;
    if (!['Receiving', 'Draining'].includes(this._session.state)) return;
    const seq = this._session.seq;
    if (!this._isCurrent(seq)) return;
    this._emit({ state: 'Draining', inputEnded: true });
    await this._scheduler.finish({ takeFinalSample });
    if (!this._isCurrent(seq)) return;
    if (this._session.state === 'Draining') {
      this._uxFinish(seq, 'incomplete', null);
      this._emit({ state: 'Incomplete' });
      // nothing was delivered: retire the capture and the decoder now
      this.releaseInputs();
    }
  }

  // Release the capture tracks and the decoder without changing the session
  // state: used once the artifact has been delivered (the Worker's job is
  // done) and by stop().
  releaseInputs() {
    if (this._stream && typeof this._stream.getTracks === 'function') {
      for (const track of this._stream.getTracks()) track.stop();
    }
    this._stream = null;
    if (this._videoSource && typeof this._videoSource.stop === 'function') {
      this._videoSource.stop();
    }
    this._videoSource = null;
    if (this._client && typeof this._client.close === 'function') {
      this._client.close();
    }
    this._client = null;
    this._scheduler = null;
  }

  stop() {
    if (!this._session) return;
    if (['Stopping', 'Stopped'].includes(this._session.state)) return; // idempotent
    this._uxFinish(this._session.seq, 'stopped', null);
    this._emit({ state: 'Stopping' });
    this._cleanupToken += 1;

    this.releaseInputs();

    // An in-flight save must settle before the session reports Stopped; the
    // committed file is never rolled back.
    if (this._saveWhenSettled) {
      this._track(this._saveWhenSettled().then(() => {}));
      if (this._pending.size > 0) return;
    }
    if (this._pending.size === 0) {
      this._emit({ state: 'Stopped' });
    }
  }
}

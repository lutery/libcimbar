// Session coordinator (M02): the only writer of session state.
// One session at a time; the source picker is opened synchronously inside the
// user click, before any await. Late streams and late worker results are
// cleaned up against the token of the session that created them.
import { FrameScheduler } from './frame-scheduler.js';

const IDLE_STATES = new Set(['Idle', 'Stopped', 'Saved', 'Error']);

export class SessionCoordinator {
  constructor(options = {}) {
    this._createClient = options.createClient;
    this._getDisplayMedia = options.getDisplayMedia;
    this._onSnapshot = options.onSnapshot || (() => {});
    this._onError = options.onError || (() => {});
    this._maxPixels = options.maxPixels || 4194304;

    this._counter = 0;
    this._eventSeq = 0;
    this._session = null;
    this._client = null;
    this._scheduler = null;
    this._stream = null;
    this._startRequests = new Map(); // requestId -> sessionId
    this._pending = new Set();
    this._cleanupToken = 0;
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
      if (this._session && this._session.state === 'Stopping' && this._pending.size === 0) {
        this._emit({ state: 'Stopped' });
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
    };
    this._client = null;
    this._scheduler = null;
    this._stream = null;
    this._eventSeq += 1;
    this._onSnapshot(this.snapshot());
    return seq;
  }

  startLive({ requestId = 'live' } = {}) {
    // Idempotency first: the same requestId against the still-active session
    // returns the original operation instead of opening a second picker.
    const previousId = this._startRequests.get(requestId);
    if (previousId && this._session && this._session.id === previousId &&
        !IDLE_STATES.has(this._session.state)) {
      return { accepted: true, duplicate: true, sessionId: previousId };
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

    this._track(
      Promise.resolve(picker)
        .then((stream) => this._attachCapture(seq, stream))
        .catch((error) => this._captureRejected(seq, error))
    );
    this._track(this._initializeDecoder(seq));
    return { accepted: true, sessionId: this._session.id };
  }

  _attachCapture(seq, stream) {
    if (!this._isCurrent(seq) || this._isStopping()) {
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
    return Promise.resolve(this._createClient())
      .then((client) => {
        if (!this._isCurrent(seq) || this._isStopping()) {
          if (client && typeof client.close === 'function') client.close();
          return;
        }
        this._client = client;
        this._scheduler = new FrameScheduler({
          submit: (frame) => client.submitFrame(frame),
          maxPixels: this._maxPixels,
          onResult: (result) => this._onFrameResult(seq, result),
          onError: (code) => { if (this._isCurrent(seq)) this._onError(code); },
        });
        this._maybeStart(seq);
      })
      .catch((error) => {
        if (this._isCurrent(seq)) this._onError(error && error.code ? error.code : 15001);
      });
  }

  _maybeStart(seq) {
    if (!this._isCurrent(seq) || this._isStopping()) return;
    if (this._stream && this._client && this._session.state === 'Preparing') {
      this._emit({ state: 'Receiving' });
    }
  }

  _captureRejected(seq, error) {
    if (!this._isCurrent(seq)) return;
    this._onError(error && error.code ? error.code : 12002);
    this._emit({ state: 'Idle' });
  }

  // One frame from the live source. Drops are counted by the scheduler.
  offerFrame(frame) {
    if (!this._session || this._session.state !== 'Receiving' || !this._scheduler) return false;
    return this._scheduler.submitFrame(frame);
  }

  _onFrameResult(seq, result) {
    if (!this._isCurrent(seq)) return;
    if (this._isStopping()) return;
    if (this._session.state !== 'Receiving' && this._session.state !== 'Draining') return;

    if (result.outcome === 'artifact') {
      this._emit({ state: 'Ready', artifact: result.artifact });
      return;
    }
    if (result.outcome === 'error') {
      this._onError(result.errorCode);
    }
  }

  // EOF barrier: wait for the in-flight reply, allow at most one final sample.
  async finishStream({ takeFinalSample } = {}) {
    if (!this._scheduler || !this._session) return;
    const seq = this._session.seq;
    if (!this._isCurrent(seq)) return;
    this._emit({ state: 'Draining', inputEnded: true });
    await this._scheduler.finish({ takeFinalSample });
    if (!this._isCurrent(seq)) return;
    if (this._session.state === 'Draining') {
      this._emit({ state: 'Incomplete' });
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
    if (this._client && typeof this._client.close === 'function') {
      this._client.close();
    }
    this._client = null;
    this._scheduler = null;
  }

  stop() {
    if (!this._session) return;
    if (['Stopping', 'Stopped'].includes(this._session.state)) return; // idempotent
    this._emit({ state: 'Stopping' });
    this._cleanupToken += 1;

    this.releaseInputs();

    if (this._pending.size === 0) {
      this._emit({ state: 'Stopped' });
    }
  }
}

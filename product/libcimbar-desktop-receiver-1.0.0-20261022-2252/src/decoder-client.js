// Main-thread client for the classic decoder worker.
// One init per session; one frame in flight; frames are transferred, so the
// caller must not touch `pixels` after submitFrame() resolves or rejects.
//
// Failure convergence (round-1 external review A-03/B-S03): every exit — a
// worker error, messageerror, close(), a throwing postMessage, or the
// main-thread init/frame watchdogs — settles the init and frame promises
// exactly once with a registered code (15010/15011/14003), terminates the
// dead worker, and notifies a running owner exactly once through onFailure
// so the session can land in a recoverable terminal state. The worker's own
// timer cannot rescue a wedged worker thread; these watchdogs run here.

const DEFAULT_INIT_TIMEOUT_MS = 30000;
const DEFAULT_FRAME_TIMEOUT_MS = 30000;

function positiveInt(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

export class DecoderClient {
  constructor(worker, baseLimits = {}) {
    this.worker = worker;
    this.baseLimits = baseLimits;
    this.pending = new Map();
    this.nextFrameId = 1;
    this.initPromise = null;
    this.closed = false;
    this.onFailure = null; // owner hook: called once when the channel dies after ready
    this._onInitReady = null;
    this._onInitFailed = null;
    this._initTimer = null;
    this._ready = false;
    this._failureNotified = false;
    this._initTimeoutMs = positiveInt(baseLimits.initTimeoutMs, DEFAULT_INIT_TIMEOUT_MS);
    this._frameTimeoutMs = positiveInt(baseLimits.frameTimeoutMs, DEFAULT_FRAME_TIMEOUT_MS);
    worker.onmessage = (event) => this._onMessage(event.data);
    worker.onerror = (event) => this._channelFailed(
      codedError(15010, `worker error: ${event.message || 'unknown'}`));
    worker.onmessageerror = () => this._channelFailed(
      codedError(15010, 'worker message could not be deserialized'));
  }

  init({ mode, assets, limits }) {
    if (this.initPromise) throw new Error('init already called');
    if (this.closed) throw codedError(15010, 'client closed');
    this.initPromise = new Promise((resolve, reject) => {
      this._onInitReady = resolve;
      this._onInitFailed = reject;
    });
    // Main-thread init watchdog: a worker that never answers (failed script
    // load, dead thread) is concluded here, not by the worker's own timer.
    this._initTimer = setTimeout(() => {
      this._channelFailed(codedError(15011, 'decoder init timed out'));
    }, this._initTimeoutMs);
    try {
      this.worker.postMessage({
        type: 'init',
        mode,
        assets,
        limits: Object.assign({}, this.baseLimits, limits || {}),
      });
    } catch (error) {
      this._channelFailed(codedError(15010, 'worker postMessage failed'));
    }
    return this.initPromise;
  }

  submitFrame({ width, height, pixels }) {
    if (!this.initPromise) throw new Error('init not called');
    if (this.closed) throw codedError(15010, 'client closed');
    const frameId = this.nextFrameId++;
    return new Promise((resolve, reject) => {
      // Main-thread frame watchdog: a wedged WASM call blocks the worker
      // thread, so only this side can give up on the reply.
      const timer = setTimeout(() => {
        if (this.pending.delete(frameId)) {
          const error = codedError(14003, 'frame reply timed out');
          reject(error);
          this._channelFailed(error);
        }
      }, this._frameTimeoutMs);
      this.pending.set(frameId, { resolve, reject, timer });
      try {
        this.worker.postMessage(
          { type: 'frame', frameId, width, height, byteLength: pixels.byteLength, pixels },
          [pixels]
        );
      } catch (error) {
        // A-R1: a frame whose postMessage throws must converge the channel
        // like any other death: the throwing frame rejects below, the other
        // pending frames reject through _failAll, and the worker terminates.
        const failure = codedError(15010, 'worker postMessage failed');
        const entry = this.pending.get(frameId);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(frameId);
        }
        reject(failure);
        this._channelFailed(failure);
      }
    });
  }

  _onMessage(msg) {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'ready') {
      this._settleInit(null, { mode: msg.mode });
      return;
    }
    if (msg.type === 'init-failed') {
      // A-R1: a protocol init failure cannot continue on this channel, so it
      // converges like any other channel death: settle everything, terminate
      // the worker, and stay silent on onFailure while not ready (the session
      // has not adopted the client yet).
      this._channelFailed(codedError(msg.code, msg.detail || 'init failed'));
      return;
    }
    if (msg.type === 'frame-result') {
      const entry = this.pending.get(msg.frameId);
      if (!entry) return; // stale frame, ignore
      this.pending.delete(msg.frameId);
      clearTimeout(entry.timer);
      entry.resolve(msg);
    }
  }

  // Settle the init promise exactly once: an error rejects it, a value
  // resolves it. A no-op after the first settlement, so a late `ready`
  // cannot resurrect a timed-out init.
  _settleInit(error, value) {
    if (this._initTimer !== null) {
      clearTimeout(this._initTimer);
      this._initTimer = null;
    }
    const ready = this._onInitReady;
    const failed = this._onInitFailed;
    this._onInitReady = null;
    this._onInitFailed = null;
    if (error) {
      if (failed) failed(error);
    } else if (ready) {
      this._ready = true;
      ready(value);
    }
  }

  // The protocol cannot continue on this channel. Settle everything still
  // pending, terminate the worker, and notify a running owner exactly once.
  _channelFailed(error) {
    this._settleInit(error);
    this._failAll(error);
    if (typeof this.worker.terminate === 'function') this.worker.terminate();
    if (this._ready && !this.closed && !this._failureNotified) {
      this._failureNotified = true;
      if (typeof this.onFailure === 'function') this.onFailure(error);
    }
  }

  _failAll(error) {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this._settleInit(codedError(15010, 'client closed'));
    this._failAll(codedError(15010, 'client closed'));
    try { this.worker.postMessage({ type: 'close' }); } catch (e) { /* already gone */ }
    if (typeof this.worker.terminate === 'function') this.worker.terminate();
  }
}

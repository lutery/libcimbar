// Main-thread client for the classic decoder worker.
// One init per session; one frame in flight; frames are transferred, so the
// caller must not touch `pixels` after submitFrame() resolves or rejects.

export class DecoderClient {
  constructor(worker, baseLimits = {}) {
    this.worker = worker;
    this.baseLimits = baseLimits;
    this.pending = new Map();
    this.nextFrameId = 1;
    this.initPromise = null;
    this.closed = false;
    this._onInitReady = null;
    this._onInitFailed = null;
    worker.onmessage = (event) => this._onMessage(event.data);
    worker.onerror = (event) => this._failAll(new Error(`worker error: ${event.message || 'unknown'}`));
  }

  init({ mode, assets, limits }) {
    if (this.initPromise) throw new Error('init already called');
    if (this.closed) throw new Error('client closed');
    this.initPromise = new Promise((resolve, reject) => {
      this._onInitReady = resolve;
      this._onInitFailed = reject;
    });
    this.worker.postMessage({
      type: 'init',
      mode,
      assets,
      limits: Object.assign({}, this.baseLimits, limits || {}),
    });
    return this.initPromise;
  }

  submitFrame({ width, height, pixels }) {
    if (!this.initPromise) throw new Error('init not called');
    if (this.closed) throw new Error('client closed');
    const frameId = this.nextFrameId++;
    return new Promise((resolve, reject) => {
      this.pending.set(frameId, { resolve, reject });
      this.worker.postMessage(
        { type: 'frame', frameId, width, height, byteLength: pixels.byteLength, pixels },
        [pixels]
      );
    });
  }

  _onMessage(msg) {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'ready') {
      if (this._onInitReady) this._onInitReady({ mode: msg.mode });
      this._onInitReady = null;
      this._onInitFailed = null;
      return;
    }
    if (msg.type === 'init-failed') {
      if (this._onInitFailed) {
        const error = new Error(msg.detail || 'init failed');
        error.code = msg.code;
        this._onInitFailed(error);
      }
      this._onInitReady = null;
      this._onInitFailed = null;
      this._failAll(new Error(`init failed: ${msg.code}`));
      return;
    }
    if (msg.type === 'frame-result') {
      const entry = this.pending.get(msg.frameId);
      if (!entry) return; // stale frame, ignore
      this.pending.delete(msg.frameId);
      entry.resolve(msg);
    }
  }

  _failAll(error) {
    for (const entry of this.pending.values()) entry.reject(error);
    this.pending.clear();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this._failAll(new Error('client closed'));
    try { this.worker.postMessage({ type: 'close' }); } catch (e) { /* already gone */ }
    if (typeof this.worker.terminate === 'function') this.worker.terminate();
  }
}

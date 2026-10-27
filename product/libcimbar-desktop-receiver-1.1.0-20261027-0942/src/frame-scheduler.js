// Frame scheduling for the receiver: at most one frame in flight.
// A live source drops samples while busy; a recorded source pauses its media
// instead (the pairing lives in video-source, T3.1).
export class FrameScheduler {
  constructor(options = {}) {
    this._submit = options.submit;
    this._maxPixels = options.maxPixels || 4194304;
    this._onResult = options.onResult || (() => {});
    this._onError = options.onError || (() => {});
    this._stats = { submitted: 0, dropped: 0, completed: 0, failed: 0 };
    this._inFlight = null; // promise of the current submission, or null
  }

  // Boundary checks before anything is allocated; a code of 0 means valid.
  _validate(frame) {
    if (!frame) return 14001;
    const { width, height } = frame;
    if (!Number.isSafeInteger(width) || width <= 0 ||
        !Number.isSafeInteger(height) || height <= 0) {
      return 14001;
    }
    const pixels = width * height;
    if (!Number.isSafeInteger(pixels) || pixels > this._maxPixels) {
      return 14002; // over budget: refuse, never silently downscale
    }
    if (!(frame.pixels instanceof ArrayBuffer)) return 14001;
    if (frame.pixels.byteLength !== pixels * 4) return 14001;
    return 0;
  }

  submitFrame(frame) {
    if (this._inFlight) {
      this._stats.dropped += 1; // busy: drop the sample, never queue it
      return false;
    }
    const invalid = this._validate(frame);
    if (invalid) {
      this._stats.dropped += 1;
      this._onError(invalid);
      return false;
    }

    this._stats.submitted += 1;

    // enter the submission synchronously (this is where postMessage happens).
    // A synchronous throw means the frame never went in flight: report it as
    // refused, not accepted.
    let submission;
    try {
      submission = this._submit(frame);
    } catch (error) {
      this._stats.failed += 1;
      this._onError(error && Number.isSafeInteger(error.code) ? error.code : 15003);
      return false;
    }

    this._inFlight = Promise.resolve(submission)
      .then((result) => {
        this._stats.completed += 1;
        this._onResult(result);
      })
      .catch((error) => {
        this._stats.failed += 1;
        this._onError(error && Number.isSafeInteger(error.code) ? error.code : 15003);
      })
      .finally(() => {
        this._inFlight = null; // released exactly once
      });
    return true;
  }

  stats() {
    return Object.assign({}, this._stats, { inFlight: this._inFlight !== null });
  }

  async whenIdle() {
    if (this._inFlight) await this._inFlight.catch(() => {});
  }

  // Paced submission for recorded media: resolves with the actual result.
  // onResult/onError are NOT invoked for this frame - the awaiter owns the
  // outcome, so the video source can pace one frame at a time.
  submitAndWait(frame) {
    if (this._inFlight) {
      return Promise.reject(Object.assign(new Error('busy'), { code: 14005 }));
    }
    const invalid = this._validate(frame);
    if (invalid) {
      this._stats.dropped += 1;
      return Promise.reject(Object.assign(new Error('invalid frame'), { code: invalid }));
    }

    this._stats.submitted += 1;
    let submission;
    try {
      submission = this._submit(frame);
    } catch (error) {
      this._stats.failed += 1;
      return Promise.reject(Object.assign(new Error('submit failed'), { code: 15003 }));
    }

    const tracked = Promise.resolve(submission)
      .then((result) => {
        this._stats.completed += 1;
        return result;
      })
      .catch((error) => {
        this._stats.failed += 1;
        throw error;
      })
      .finally(() => {
        this._inFlight = null;
      });
    this._inFlight = tracked.catch(() => {});
    return tracked;
  }

  // EOF barrier: wait for the in-flight reply first, take at most one final
  // sample, then wait again. Always resolves; never spins.
  async finish(options = {}) {
    await this.whenIdle();
    if (typeof options.takeFinalSample === 'function') {
      const finalFrame = options.takeFinalSample();
      if (finalFrame) {
        this.submitFrame(finalFrame);
        await this.whenIdle();
      }
    }
    return this.stats();
  }
}

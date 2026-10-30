// Recorded-video source (M04): File -> object URL -> metadata/decode
// precheck -> seek-stepped frame extraction with backpressure -> EOF signal.
// Seek stepping (instead of rVFC) is deterministic and pairs naturally with
// the single-slot scheduler: one frame is extracted and awaited at a time.
import { captureFrame } from './live-source.js';

const FRAME_INTERVAL_S = 1 / 15;

export class VideoSource {
  constructor(options = {}) {
    this._createElement = options.createElement || (() => document.createElement('video'));
    this._maxPixels = options.maxPixels || 4194304;
    this._capture = options.captureFrame || captureFrame;
    this._submit = options.submit; // async (frame, meta) => result
    this._onEnded = options.onEnded || (() => {});
    this._onError = options.onError || (() => {});
    this._onMetadata = options.onMetadata || (() => {});
    this._seekTimeoutMs = options.seekTimeoutMs || 5000;

    this._url = null;
    this._video = null;
    this._duration = 0;
    this._nextTime = 0;
    this._playing = false;
    this._pendingSeek = null;
    this._runSettle = null; // settles a pending rVFC run (S-2)
    this._listeners = [];
  }

  snapshot() {
    return {
      open: !!this._video,
      durationSeconds: this._duration,
      positionSeconds: this._video ? this._video.currentTime : 0,
    };
  }

  // Opens the file and prechecks metadata and decodability. Rejects with a
  // registered code: 13005 (metadata invalid) or 13001/13002 (cannot decode).
  async open(file) {
    if (!file || typeof file.name !== 'string') {
      throw Object.assign(new Error('no file'), { code: 13005 });
    }
    this._url = URL.createObjectURL(file);
    this._video = this._createElement();
    this._video.muted = true;
    if ('playsInline' in this._video || this._video.playsInline === undefined) {
      this._video.playsInline = true;
    }
    // The shared preview element may still carry the previous session's
    // capture stream; srcObject takes precedence over src, so the file's
    // metadata would never load (observed as a spurious 13005 when a
    // recording was imported after a live round).
    try { this._video.srcObject = null; } catch (error) { /* detached */ }
    this._video.src = this._url;

    try {
      await this._waitFor(this._video, 'loadedmetadata', 'error', 15000)
        .then((outcome) => {
          if (outcome !== 'loadedmetadata') {
            throw Object.assign(new Error('metadata failed'), { code: 13005 });
          }
        });

      // MediaRecorder WebM carries an unknown duration in its header. Seeking
      // far past the end forces the browser to compute the real duration.
      if (!Number.isFinite(this._video.duration)) {
        await new Promise((resolve) => {
          const onChange = () => {
            if (Number.isFinite(this._video.duration) && this._video.duration > 0) {
              cleanup();
              resolve();
            }
          };
          const cleanup = () => this._video.removeEventListener('durationchange', onChange);
          this._video.addEventListener('durationchange', onChange);
          this._video.currentTime = 1e101;
          setTimeout(resolve, 3000); // bounded: a truly broken file ends here
        });
        this._video.currentTime = 0;
      }

      this._duration = this._video.duration;
      if (!Number.isFinite(this._duration) || this._duration <= 0 ||
          !Number.isSafeInteger(this._video.videoWidth) || this._video.videoWidth <= 0) {
        throw Object.assign(new Error('invalid metadata'), { code: 13005 });
      }

      // decode precheck: a seek must actually produce a frame
      await this._seek(0.01, 'open');
      const probe = this._capture(this._video, {
        maxPixels: this._maxPixels,
        onError: (code) => { throw Object.assign(new Error('capture failed'), { code }); },
      });
      if (!probe) {
        throw Object.assign(new Error('first frame not decodable'), { code: 13002 });
      }
      this._video.pause();
      this._nextTime = 0;
      this._onMetadata({
        width: this._video.videoWidth,
        height: this._video.videoHeight,
        durationSeconds: this._duration,
      });
      return {
        width: this._video.videoWidth,
        height: this._video.videoHeight,
        durationSeconds: this._duration,
      };
    } catch (error) {
      this.stop();
      this._onError(error && error.code ? error.code : 13002);
      throw error;
    }
  }

  // Controlled extraction. Resolves when the stream ends (eof) or stop() is
  // called; rejects finitely with a registered code when the media breaks
  // mid-read (round-1 review B-S04: a corrupt container must never hang the
  // session — the caller drives it to a recoverable terminal state).
  async run() {
    if (!this._video) throw Object.assign(new Error('not open'), { code: 13005 });
    this._playing = true;
    try {
      // Per-frame playback is the truthful way to read a recording: the
      // browser decodes every frame in order, so inter frames are pixel
      // exact (time-stepped seeking lands on inter frames without their
      // decode history and mostly fails the scan - TD-15). Browsers without
      // rVFC keep the seek-stepping fallback.
      if (typeof this._video.requestVideoFrameCallback === 'function') {
        await this._runFrames();
      } else {
        await this._runLoop();
      }
    } catch (error) {
      this._playing = false;
      this.stop();
      this._onError(error && Number.isSafeInteger(error.code) ? error.code : 13002);
      throw error;
    }
  }

  // Play the recording and process every presented frame, pausing between
  // frames so exactly one submission is in flight (the scheduler contract).
  async _runFrames() {
    const video = this._video;
    await new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        video.removeEventListener('error', onError);
        video.removeEventListener('ended', onEnded);
        if (this._runSettle === finishRun) this._runSettle = null;
      };
      const finishRun = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const failRun = (error) => {
        if (settled) return;
        if (!this._playing) { finishRun(); return; }
        settled = true;
        cleanup();
        reject(error);
      };
      const onError = () => failRun(Object.assign(new Error('video playback failed'), { code: 13002 }));
      const onEnded = () => {
        if (!this._playing) { finishRun(); return; }
        this._finish('eof');
        finishRun();
      };
      // S-2: stop() must settle a run whose next frame callback may never
      // fire; cleanup removes both listeners whenever the run settles.
      this._runSettle = finishRun;
      video.addEventListener('error', onError);
      video.addEventListener('ended', onEnded);

      const step = () => {
        if (!this._playing) { finishRun(); return; }
        video.requestVideoFrameCallback((now, meta) => {
          if (!this._playing) { finishRun(); return; }
          // S-2: a synchronous throw (capture, play, ...) must fail the run
          // with a registered code instead of escaping the callback.
          try {
            video.pause();
            const mediaTime = (meta && Number.isFinite(meta.mediaTime))
              ? meta.mediaTime
              : video.currentTime;
            const frame = this._capture(video, {
              maxPixels: this._maxPixels,
              onError: (code) => this._onError(code),
            });
            const submission = frame
              ? this._submit(frame, { mediaTimeUs: Math.round(mediaTime * 1e6) })
              : Promise.resolve({ outcome: 'no_data' });
            submission.then((result) => {
              if (!this._playing) { finishRun(); return; }
              if (result && result.outcome === 'artifact') {
                this._finish('eof');
                finishRun();
                return;
              }
              Promise.resolve(video.play()).then(step).catch(failRun);
            }).catch(failRun);
          } catch (error) {
            failRun(Object.assign(new Error('frame callback failed'), { code: 13002 }));
          }
        });
      };
      Promise.resolve(video.play()).then(step).catch(failRun);
    });
  }

  async _runLoop() {
    let lastTarget = -1;
    while (this._playing) {
      if (this._nextTime >= this._duration) {
        // The interval between the last sample and the real end was never
        // covered: give the final key frame one bounded capture chance
        // before declaring eof.
        const tail = Math.max(this._duration - 0.001, 0);
        if (lastTarget < tail - 0.001) {
          lastTarget = tail;
          await this._seek(tail);
          if (!this._playing) return;
          const frame = this._capture(this._video, {
            maxPixels: this._maxPixels,
            onError: (code) => this._onError(code),
          });
          if (frame) {
            const result = await this._submit(frame, { mediaTimeUs: Math.round(tail * 1e6) });
            if (!this._playing) return;
            if (result && result.outcome === 'artifact') {
              this._finish('eof');
              return;
            }
          }
        }
        this._finish('eof');
        return;
      }

      const mediaTime = this._nextTime;
      this._nextTime += FRAME_INTERVAL_S;

      // the seek target is bounded by the container duration
      const target = Math.min(mediaTime, Math.max(this._duration - 0.001, 0));
      lastTarget = target;

      await this._seek(target);
      if (!this._playing) return;

      const frame = this._capture(this._video, {
        maxPixels: this._maxPixels,
        onError: (code) => this._onError(code),
      });
      if (!frame) continue;

      // backpressure: the next seek happens only after this result arrives
      const result = await this._submit(frame, { mediaTimeUs: Math.round(mediaTime * 1e6) });
      if (!this._playing) return;

      if (result && result.outcome === 'artifact') {
        this._finish('eof');
        return;
      }
    }
  }

  stop() {
    const wasPlaying = this._playing;
    this._playing = false;
    // a run waiting for the next presented frame must settle, not hang (S-2)
    if (this._runSettle) this._runSettle();
    this._removeListeners();
    // a seek that can no longer complete must not hang the run() coroutine
    if (this._pendingSeek) {
      const resolveSeek = this._pendingSeek;
      this._pendingSeek = null;
      resolveSeek();
    }
    if (this._video) {
      try { this._video.pause(); } catch (e) { /* detached */ }
      this._video.removeAttribute('src');
      this._video.load();
      this._video = null;
    }
    if (this._url) {
      URL.revokeObjectURL(this._url); // reclaimed exactly once
      this._url = null;
    }
    return wasPlaying;
  }

  _finish(reason) {
    this._playing = false;
    this._onEnded(reason);
  }

  // Waits for either event and resolves with its NAME; the caller decides
  // which outcome is fatal. Only the timeout rejects (13003).
  _waitFor(element, successEvent, failureEvent, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(Object.assign(new Error('timeout'), { code: 13003 }));
      }, timeoutMs);
      const onEvent = (name) => {
        cleanup();
        resolve(name);
      };
      const cleanup = () => {
        clearTimeout(timer);
        element.removeEventListener(successEvent, onEvent);
        element.removeEventListener(failureEvent, onEvent);
      };
      element.addEventListener(successEvent, () => onEvent(successEvent), { once: true });
      element.addEventListener(failureEvent, () => onEvent(failureEvent), { once: true });
    });
  }

  // A seek must always conclude. Besides 'seeked', a media error, an abort,
  // or the watchdog timeout settles it with a registered code; stop() still
  // resolves it immediately and silently (round-1 review B-S04).
  //   - phase 'open' (metadata/first-frame precheck): 13003
  //   - phase 'run' (mid-read stepping): 13002
  _seek(timeSeconds, phase = 'run') {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        this._pendingSeek = null;
        clearTimeout(timer);
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const onSeeked = () => finish();
      const onBroken = () => finish(Object.assign(new Error('media error during seek'), {
        code: phase === 'open' ? 13003 : 13002,
      }));
      const timer = setTimeout(() => {
        finish(Object.assign(new Error('seek timed out'), {
          code: phase === 'open' ? 13003 : 13002,
        }));
      }, this._seekTimeoutMs);
      const cleanup = () => {
        this._video.removeEventListener('seeked', onSeeked);
        this._video.removeEventListener('error', onBroken);
        this._video.removeEventListener('abort', onBroken);
      };
      this._listeners.push(cleanup);
      this._pendingSeek = () => finish(); // stop() settles without an error
      this._video.addEventListener('seeked', onSeeked, { once: true });
      this._video.addEventListener('error', onBroken);
      this._video.addEventListener('abort', onBroken);
      this._video.currentTime = timeSeconds;
    });
  }

  _removeListeners() {
    for (const cleanup of this._listeners) {
      try { cleanup(); } catch (e) { /* detached */ }
    }
    this._listeners = [];
  }
}

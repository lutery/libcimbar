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

    this._url = null;
    this._video = null;
    this._duration = 0;
    this._nextTime = 0;
    this._playing = false;
    this._seenTimes = new Set();
    this._listeners = [];
  }

  snapshot() {
    return {
      open: !!this._video,
      durationSeconds: this._duration,
      positionSeconds: this._video ? this._video.currentTime : 0,
      seenFrames: this._seenTimes.size,
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
      await this._seek(0.01);
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
  // called. Exactly one frame is in flight at any time; the media time is
  // deduplicated so a seek that lands on the same frame never resubmits.
  async run() {
    if (!this._video) throw Object.assign(new Error('not open'), { code: 13005 });
    this._playing = true;

    while (this._playing) {
      if (this._nextTime >= this._duration) {
        this._finish('eof');
        return;
      }

      const mediaTime = this._nextTime;
      this._nextTime += FRAME_INTERVAL_S;
      if (this._seenTimes.has(mediaTime)) continue; // dedup on media time
      this._seenTimes.add(mediaTime);

      await this._seek(Math.min(mediaTime, Math.max(this._duration - 0.001, 0)));
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
    this._removeListeners();
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

  _seek(timeSeconds) {
    return new Promise((resolve) => {
      const onSeeked = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => this._video.removeEventListener('seeked', onSeeked);
      this._listeners.push(cleanup);
      this._video.addEventListener('seeked', onSeeked, { once: true });
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

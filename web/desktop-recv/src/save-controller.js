// Save controller (M07): the artifact is immutable; each save attempt is
// separate. Only write() AND close() succeeding means "saved".
export class SaveController {
  constructor(options = {}) {
    this._picker = options.showSaveFilePicker;
    this._onEvent = options.onEvent || (() => {});
    this._pendingMs = options.pendingMs || 30000;
    this._setTimer = options.setTimeout || setTimeout;
    this._clearTimer = options.clearTimeout || clearTimeout;
    this._attempt = null;
    this._nextAttempt = 1;
  }

  snapshot() {
    if (!this._attempt) return { saveStatus: 'none', attemptId: null, lastError: null };
    return {
      saveStatus: this._attempt.state,
      attemptId: this._attempt.id,
      lastError: this._attempt.error || null,
    };
  }

  _settle(state, error) {
    this._attempt.state = state;
    this._attempt.error = error || null;
    if (this._attempt.pendingTimer) {
      this._clearTimer(this._attempt.pendingTimer);
      this._attempt.pendingTimer = null;
    }
    this._onEvent(this.snapshot());
  }

  // Called from a user click. Pre-validation is synchronous; the picker is
  // invoked synchronously so the browser keeps the user activation. Awaiting
  // only starts after the picker call.
  start({ artifact, suggestedName, isCurrent = () => true }) {
    if (!artifact || !artifact.blob) {
      this._onEvent({ saveStatus: 'failed', attemptId: null, lastError: 16007 });
      return false;
    }
    if (this._attempt && ['selecting', 'writing', 'pending'].includes(this._attempt.state)) {
      this._attempt.error = 16008; // SAVE_BUSY is visible in the snapshot too
      this._onEvent({ saveStatus: this._attempt.state, attemptId: this._attempt.id, lastError: 16008 });
      return false; // no second side effect
    }

    const attempt = {
      id: this._nextAttempt,
      state: 'selecting',
      artifact,
      suggestedName,
      error: null,
      pendingTimer: null,
    };
    this._nextAttempt += 1;
    this._attempt = attempt;
    this._onEvent(this.snapshot());

    let pickerResult;
    try {
      pickerResult = this._picker({ suggestedName });
    } catch (error) {
      this._settle('failed', error && error.name === 'AbortError' ? 16002 : 16003);
      return true;
    }

    Promise.resolve(pickerResult)
      .then((handle) => {
        // The user may have stopped the session while the dialog was open.
        // A target chosen after the stop must not start a write.
        if (!isCurrent()) {
          this._settle('aborted', 16010);
          return undefined;
        }
        return this._write(attempt, handle);
      })
      .catch((error) => {
        if (error && error.name === 'AbortError') {
          this._settle('cancelled', 16002);
          return;
        }
        this._settle('failed', 16003);
      });

    return true;
  }

  _write(attempt, handle) {
    attempt.state = 'writing';
    this._onEvent(this.snapshot());

    if (this._pendingMs > 0) {
      attempt.pendingTimer = this._setTimer(() => {
        if (attempt.state === 'writing') {
          // non-terminal: the write has not settled yet, do not retry on our own
          attempt.state = 'pending';
          this._onEvent(this.snapshot());
        }
      }, this._pendingMs);
    }

    let writable;
    attempt.stage = 'write';
    return Promise.resolve(handle.createWritable())
      .then((created) => { writable = created; return writable.write(attempt.artifact.blob); })
      .then(() => { attempt.stage = 'close'; return writable.close(); })
      .then(() => { this._settle('saved', null); })
      .catch((error) => {
        // the artifact stays in memory; a new click may retry it
        const code = error && error.name === 'AbortError' ? 16002
          : (attempt.stage === 'close' ? 16006 : 16005);
        this._settle(error && error.name === 'AbortError' ? 'cancelled' : 'failed', code);
      });
  }
}

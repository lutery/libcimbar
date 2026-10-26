// Receiver UX observation model (M2, receiver-ux-v2 internal). One instance
// per session seq: the session coordinator creates it at the genuine
// Receiving transition and drives begin / acceptFrame / observeSave / finish.
// All actions return { ok, code, data } envelopes; a failure only declines
// the UX observation and never describes file transfer results.
//
// Numeric constants mirror docs/design-catalog/receiver-ux-v2/contracts/
// ux-display-config.json (rateBucketCount 12, rateBucketMs 250,
// rateWarmupMs 1000, maxReportStreams 8); they are inlined because the
// module loads in the browser as plain ESM.

const RATE_BUCKET_COUNT = 12;
const RATE_BUCKET_MS = 250;
const RATE_WARMUP_MS = 1000;
const MAX_REPORT_STREAMS = 8;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const OUTCOMES = new Set(['no_data', 'data', 'artifact', 'error']);
const REASONS = new Set(['artifact', 'incomplete', 'stopped', 'error', 'disposed']);
const RAW_SAVE_STATUSES = new Set([
  'selecting', 'writing', 'pending', 'saved', 'cancelled', 'failed', 'aborted',
]);
const TERMINAL_SAVE_PHASES = new Set(['saved', 'failed', 'cancelled', 'aborted']);
const ACTIVE_SAVE_PHASES = new Set(['selecting', 'writing', 'pending']);
const UNAVAILABLE_CODES = new Set([19001, 19002, 19003, 19004, 19008, 19013, 19015]);
const REPORT_STATES = new Set(['single', 'multiple', 'empty', 'unavailable', 'not_sampled']);

function isId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function isSeq(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function isClockMs(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function hasExactKeys(object, keys) {
  const actual = Object.keys(object);
  if (actual.length !== keys.length) return false;
  return keys.every((key) => actual.includes(key));
}

// A Report is valid only as a whole (UX-01): shape plus state-conditional
// ratio/code rules. Partial trust is never granted.
function isValidReport(report) {
  if (!report || typeof report !== 'object') return false;
  if (!REPORT_STATES.has(report.state)) return false;
  const ratios = report.ratios;
  if (!Array.isArray(ratios) || ratios.length > MAX_REPORT_STREAMS) return false;
  for (const ratio of ratios) {
    if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0) return false;
  }
  const code = report.diagnosticCode;
  if (!Number.isSafeInteger(code)) return false;
  switch (report.state) {
    case 'single':
      return ratios.length === 1 && code === 0;
    case 'multiple':
      return ratios.length >= 2 && code === 19005;
    case 'empty':
    case 'not_sampled':
      return ratios.length === 0 && code === 0;
    case 'unavailable':
      return ratios.length === 0 && UNAVAILABLE_CODES.has(code);
    default:
      return false;
  }
}

function copyReport(report) {
  return {
    state: report.state,
    ratios: report.ratios.map((ratio) => ratio),
    diagnosticCode: report.diagnosticCode,
  };
}

export class ReceiverTelemetry {
  constructor() {
    this._owner = null; // { sessionId, sessionSeq, inputKind }
    this._revision = 0;
    this._receivingAtMs = null;
    this._endedAtMs = null;
    this._finishedKey = null;
    this._lastAcceptedFrameId = null;
    this._lastResultAtMs = null;
    this._lastDataAtMs = null;
    this._lastReportState = null;
    this._lastAdvanceAtMs = null;
    this._trustedRatio = null;
    this._trustedAtMs = null;
    this._ambiguity = null; // 19005 | 19006 once locked, until a new seq
    this._epochMs = 0;
    this._buckets = Array.from({ length: RATE_BUCKET_COUNT },
      () => ({ generation: -1, bytes: 0 }));
    this._diagnostics = new Set();
    this._save = { phase: 'none', attemptId: null, artifactId: null, errorCode: null };
  }

  // --- envelopes ----------------------------------------------------------

  _ack(applied, sessionSeqOverride) {
    return {
      ok: true,
      code: 0,
      data: {
        sessionSeq: sessionSeqOverride !== undefined
          ? sessionSeqOverride
          : (this._owner ? this._owner.sessionSeq : 0),
        applied,
        observationRevision: this._revision,
      },
    };
  }

  _fail(code) {
    return { ok: false, code, data: null };
  }

  // --- UX-02: begin -------------------------------------------------------

  begin(request) {
    if (!request || typeof request !== 'object') return this._fail(19008);
    if (request.version !== 1) return this._fail(19013);
    if (!hasExactKeys(request, ['version', 'sessionId', 'sessionSeq', 'inputKind', 'nowMs'])) {
      return this._fail(19008);
    }
    if (!isId(request.sessionId) || !isSeq(request.sessionSeq) ||
        (request.inputKind !== 'live' && request.inputKind !== 'video')) {
      return this._fail(19008);
    }
    if (!isClockMs(request.nowMs)) return this._fail(19009);

    const owner = this._owner;
    if (owner) {
      if (request.sessionSeq < owner.sessionSeq) return this._fail(19007);
      if (request.sessionSeq === owner.sessionSeq) {
        if (request.sessionId !== owner.sessionId || request.inputKind !== owner.inputKind) {
          return this._fail(19008);
        }
        return this._ack(false); // the identical begin never resets anything
      }
    }

    // first begin, or a newer seq replacing the whole observation state
    this._owner = {
      sessionId: request.sessionId,
      sessionSeq: request.sessionSeq,
      inputKind: request.inputKind,
    };
    this._revision = 1;
    this._receivingAtMs = request.nowMs;
    this._endedAtMs = null;
    this._finishedKey = null;
    this._lastAcceptedFrameId = null;
    this._lastResultAtMs = null;
    this._lastDataAtMs = null;
    this._lastReportState = null;
    this._lastAdvanceAtMs = null;
    this._trustedRatio = null;
    this._trustedAtMs = null;
    this._ambiguity = null;
    this._epochMs = request.nowMs;
    for (const slot of this._buckets) {
      slot.generation = -1;
      slot.bytes = 0;
    }
    this._diagnostics.clear();
    this._save = { phase: 'none', attemptId: null, artifactId: null, errorCode: null };
    return this._ack(true);
  }

  // --- UX-03: acceptFrame -------------------------------------------------

  acceptFrame(request) {
    if (!request || typeof request !== 'object') return this._fail(19008);
    if (request.version !== 1) return this._fail(19013);

    const owner = this._owner;
    if (!owner) return this._fail(19007);
    if (request.sessionSeq < owner.sessionSeq) return this._fail(19007);
    if (request.sessionSeq > owner.sessionSeq || request.sessionId !== owner.sessionId) {
      return this._fail(19008);
    }
    if (this._endedAtMs !== null) return this._fail(19007);
    if (!Number.isSafeInteger(request.frameId) || request.frameId < 1) {
      return this._fail(19008);
    }
    if (this._lastAcceptedFrameId !== null &&
        request.frameId <= this._lastAcceptedFrameId) {
      return this._fail(19007);
    }

    if (!isClockMs(request.receivedAtMs)) return this._fail(19009);
    if (request.receivedAtMs < this._receivingAtMs) return this._fail(19009);
    if (this._lastResultAtMs !== null &&
        request.receivedAtMs < this._lastResultAtMs) {
      return this._fail(19009);
    }

    if (!hasExactKeys(request, ['version', 'sessionId', 'sessionSeq', 'frameId',
      'receivedAtMs', 'outcome', 'bytesDecoded', 'report'])) {
      return this._fail(19008);
    }
    if (!OUTCOMES.has(request.outcome)) return this._fail(19008);
    if (!Number.isSafeInteger(request.bytesDecoded) || request.bytesDecoded < 0) {
      return this._fail(19008);
    }
    if (!isValidReport(request.report)) return this._fail(19008);
    if (request.outcome === 'no_data' || request.outcome === 'error') {
      if (request.bytesDecoded !== 0) return this._fail(19008);
      if (request.report.state !== 'not_sampled') return this._fail(19008);
    } else {
      if (request.bytesDecoded <= 0) return this._fail(19008);
      if (request.report.state === 'not_sampled') return this._fail(19008);
    }

    this._revision += 1;
    this._lastAcceptedFrameId = request.frameId;
    this._lastResultAtMs = request.receivedAtMs;
    if (request.outcome === 'data' || request.outcome === 'artifact') {
      this._lastDataAtMs = request.receivedAtMs;
      // The accepted frame's own report state is an observable fact: it is
      // recorded even while an ambiguity lock ignores later ratios, exactly
      // like degradation codes (round-13 A13-02).
      this._lastReportState = request.report.state;
      this._applyReport(request.report, request.receivedAtMs);
      this._applyRate(request.bytesDecoded, request.receivedAtMs);
    }
    return this._ack(true);
  }

  _applyReport(report, atMs) {
    if (this._ambiguity !== null) {
      // locked until a new seq: later ratios change nothing, but degradation
      // codes are still observable facts
      if (report.state === 'unavailable') this._diagnostics.add(report.diagnosticCode);
      return;
    }
    if (report.state === 'single') {
      const ratio = report.ratios[0];
      if (this._trustedRatio === null) {
        this._trustedRatio = ratio;
        this._trustedAtMs = atMs;
        this._lastAdvanceAtMs = atMs;
      } else if (ratio > this._trustedRatio) {
        this._trustedRatio = ratio;
        this._trustedAtMs = atMs;
        this._lastAdvanceAtMs = atMs;
      } else if (ratio === this._trustedRatio) {
        this._trustedAtMs = atMs;
      } else {
        this._ambiguity = 19006;
        this._diagnostics.add(19006);
      }
    } else if (report.state === 'multiple') {
      this._ambiguity = 19005;
      this._diagnostics.add(19005);
    } else if (report.state === 'unavailable') {
      this._diagnostics.add(report.diagnosticCode);
    }
    // empty: a temporary absence — the trusted history stays as it is
  }

  _applyRate(bytes, atMs) {
    const q = Math.floor((atMs - this._epochMs) / RATE_BUCKET_MS);
    const idx = q % RATE_BUCKET_COUNT;
    const slot = this._buckets[idx];
    const prospective = slot.generation === q ? slot.bytes + bytes : bytes;
    if (!Number.isSafeInteger(prospective)) {
      this._overflowRate(atMs);
      return;
    }
    const low = Math.max(0, q - (RATE_BUCKET_COUNT - 1));
    let sum = prospective;
    for (let i = 0; i < this._buckets.length; i += 1) {
      if (i === idx) continue;
      const other = this._buckets[i];
      if (other.generation >= low && other.generation <= q) sum += other.bytes;
    }
    if (!Number.isSafeInteger(sum)) {
      this._overflowRate(atMs);
      return;
    }
    slot.generation = q;
    slot.bytes = prospective;
  }

  // 19010: drop this sample, clear the window, re-anchor the rate epoch; the
  // receiving/progress facts stay untouched.
  _overflowRate(atMs) {
    for (const slot of this._buckets) {
      slot.generation = -1;
      slot.bytes = 0;
    }
    this._epochMs = atMs;
    this._diagnostics.add(19010);
  }

  // --- UX-06: observeSave -------------------------------------------------

  observeSave(request) {
    if (!request || typeof request !== 'object') return this._fail(19008);
    if (request.version !== 1) return this._fail(19013);
    const owner = this._owner;
    if (!owner) return this._fail(19007);
    if (request.sessionSeq < owner.sessionSeq) return this._fail(19007);
    if (request.sessionSeq > owner.sessionSeq || request.sessionId !== owner.sessionId) {
      return this._fail(19008);
    }
    if (!hasExactKeys(request, ['version', 'sessionId', 'sessionSeq', 'artifactId',
      'attemptId', 'rawStatus', 'errorCode'])) {
      return this._fail(19008);
    }
    if (!isId(request.artifactId) || !isId(request.attemptId)) return this._fail(19008);
    if (!RAW_SAVE_STATUSES.has(request.rawStatus)) return this._fail(19008);
    const errorCode = request.errorCode;
    if (errorCode !== null && !(Number.isSafeInteger(errorCode) && errorCode > 0)) {
      return this._fail(19008);
    }
    if (request.rawStatus === 'saved' && errorCode !== null) return this._fail(19008);

    // normalization: failed/cancelled + 16002 is a user cancel; writing with
    // the re-entrancy guard (16008) is still writing
    let phase = request.rawStatus;
    if ((request.rawStatus === 'failed' || request.rawStatus === 'cancelled') &&
        errorCode === 16002) {
      phase = 'cancelled';
    }

    const current = this._save;
    if (current.attemptId === request.attemptId) {
      if (current.phase === phase && current.errorCode === errorCode) {
        return this._ack(false); // the identical event never lifts the revision
      }
      if (TERMINAL_SAVE_PHASES.has(current.phase) && ACTIVE_SAVE_PHASES.has(phase)) {
        return this._fail(19007); // a settled attempt never regresses to writing
      }
    } else if (phase !== 'selecting') {
      return this._fail(19007); // a new attempt is only established by selecting
    }

    this._save = {
      phase,
      attemptId: request.attemptId,
      artifactId: request.artifactId,
      errorCode: phase === 'saved' ? null : errorCode,
    };
    this._revision += 1;
    return this._ack(true);
  }

  // --- UX-05: finish ------------------------------------------------------

  finish(request) {
    if (!request || typeof request !== 'object') return this._fail(19008);
    if (request.version !== 1) return this._fail(19013);
    if (!REASONS.has(request.reason)) return this._fail(19008);
    if (request.reason === 'artifact') {
      if (!isId(request.artifactId)) return this._fail(19008);
    } else if (request.artifactId !== null) {
      return this._fail(19008);
    }
    if (!hasExactKeys(request, ['version', 'sessionId', 'sessionSeq', 'nowMs',
      'reason', 'artifactId'])) {
      return this._fail(19008);
    }
    if (!isId(request.sessionId) || !isSeq(request.sessionSeq)) return this._fail(19008);
    if (!isClockMs(request.nowMs)) return this._fail(19009);

    const owner = this._owner;
    if (!owner) {
      // Preparing never began: the cleanup is an idempotent no-op
      return this._ack(false, request.sessionSeq);
    }
    if (request.sessionSeq < owner.sessionSeq) return this._fail(19007);
    if (request.sessionSeq > owner.sessionSeq || request.sessionId !== owner.sessionId) {
      return this._fail(19008);
    }
    if (this._endedAtMs !== null) {
      const key = `${request.reason}:${request.artifactId == null ? '' : request.artifactId}`;
      if (key === this._finishedKey) return this._ack(false);
      return this._fail(19007); // a later terminal never moves the endpoint
    }
    if (request.nowMs < this._receivingAtMs) return this._fail(19009);

    this._endedAtMs = request.nowMs;
    this._finishedKey = `${request.reason}:${request.artifactId == null ? '' : request.artifactId}`;
    this._revision += 1;
    return this._ack(true);
  }

  // --- read side ----------------------------------------------------------

  snapshot() {
    const locked = this._ambiguity !== null;
    const buckets = this._buckets.map((slot) => Object.freeze({
      generation: slot.generation,
      bytes: slot.bytes,
    }));
    return Object.freeze({
      version: 1,
      sessionId: this._owner ? this._owner.sessionId : null,
      sessionSeq: this._owner ? this._owner.sessionSeq : 0,
      inputKind: this._owner ? this._owner.inputKind : null,
      observationRevision: this._revision,
      receivingAtMs: this._receivingAtMs,
      endedAtMs: this._endedAtMs,
      rate: Object.freeze({ epochMs: this._epochMs, buckets: Object.freeze(buckets) }),
      progress: Object.freeze({
        trustedRatio: locked ? null : this._trustedRatio,
        trustedAtMs: locked ? null : this._trustedAtMs,
        lastAdvanceAtMs: this._lastAdvanceAtMs,
        lastDataAtMs: this._lastDataAtMs,
        lastReportState: this._lastReportState,
        lastResultAtMs: this._lastResultAtMs,
        ambiguity: this._ambiguity,
      }),
      save: Object.freeze({ ...this._save }),
      diagnostics: Object.freeze([...this._diagnostics].sort((a, b) => a - b)),
    });
  }
}

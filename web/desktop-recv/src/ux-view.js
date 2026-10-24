// Receiver UX view projection (M3, receiver-ux-v2 internal). readView is a
// pure function: it consumes the observation snapshot (ReceiverTelemetry.snapshot
// shape) plus the read-only business context and returns a UxResult envelope
// whose data is the ViewSnapshot. It never mutates inputs and never calls
// back into the session.
//
// Constants mirror docs/design-catalog/receiver-ux-v2/contracts/
// ux-display-config.json (rateBucketCount 12, rateBucketMs 250, rateWarmupMs
// 1000, notice thresholds 5000/5000/8000/1500, refresh 250).
const RATE_BUCKET_MS = 250;
const RATE_WARMUP_MS = 1000;
const FIRST_DATA_NOTICE_MS = 5000;
const NO_DATA_NOTICE_MS = 5000;
const NO_ADVANCE_NOTICE_MS = 8000;
const PROCESSING_NOTICE_MS = 1500;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const REPORT_DEGRADATION_CODES = new Set([19001, 19002, 19003, 19004, 19015]);
const STATES = ['Idle', 'Preparing', 'Receiving', 'Draining', 'Reconstructing',
  'Ready', 'Saving', 'Saved', 'Retryable', 'Stopping', 'Stopped', 'Incomplete',
  'Error'];
const ARTIFACT_STATES = new Set(['Ready', 'Saving', 'Saved', 'Retryable']);
const COMPLETION_STATES = new Set(['Ready', 'Saving', 'Saved', 'Retryable']);

const TEXT = {
  idle: '选择接收方式',
  preparing: '正在准备',
  waiting_data: '正在等待有效数据',
  processing: '正在处理当前帧',
  receiving: '正在接收数据',
  receiving_video: '正在读取录像并接收数据',
  no_new_data: '最近没有识别到新数据',
  no_progress: '暂时没有新进展',
  progress_unknown: '正在识别码流',
  progress_unavailable: '进度暂不可用',
  collecting_more: '继续补齐重建数据',
  draining: '正在处理最后的数据',
  reconstructing: '正在重建文件',
  ready: '文件已接收完成，请保存',
  saving_selecting: '请选择保存位置',
  saving_writing: '正在保存文件',
  saving_pending: '正在等待保存完成',
  saved: '文件已保存',
  save_cancelled: '保存已取消，文件仍可保存',
  save_failed: '保存失败，可以重试',
  stopping: '正在停止',
  stopped: '已停止',
  incomplete: '数据不足，未能重建文件',
  error: '接收发生错误',
};

const WAITING_ADVICE = '请检查发送画面是否可见，并确认 Mode 是否匹配。';
const KEEP_SENDING = '保持发送画面可见并继续播放。';
const READY_NEXT = '点击保存文件。';
const SAVED_NEXT = '可以开始下一次接收。';

function isId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function isClock(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function fail(code) {
  return { ok: false, code, data: null };
}

function isValidControls(controls) {
  if (!controls || typeof controls !== 'object') return false;
  const keys = ['canStartLive', 'canImportVideo', 'canStop', 'canSave'];
  const actual = Object.keys(controls);
  if (actual.length !== keys.length) return false;
  return keys.every((key) => typeof controls[key] === 'boolean');
}

// Validates the context's mediaPosition shape; value-level problems (negative
// position, unusable duration) degrade to null + 19011 instead of rejecting.
function normalizeMedia(context, diagnostics) {
  if (context.mediaDiagnosticCode === 19011) return null;
  if (context.inputKind !== 'video' || context.mediaPosition === null) return null;
  const media = context.mediaPosition;
  if (typeof media !== 'object'
      || typeof media.positionSeconds !== 'number'
      || (media.durationSeconds !== null && typeof media.durationSeconds !== 'number')
      || (media.fraction !== null && typeof media.fraction !== 'number')) {
    return invalid(diagnostics);
  }
  if (!Number.isFinite(media.positionSeconds) || media.positionSeconds < 0) {
    return invalid(diagnostics);
  }
  const duration = media.durationSeconds;
  if (duration === null || !Number.isFinite(duration) || duration <= 0) {
    return { positionSeconds: media.positionSeconds, durationSeconds: null, fraction: null };
  }
  return {
    positionSeconds: media.positionSeconds,
    durationSeconds: duration,
    fraction: Math.min(1, media.positionSeconds / duration),
  };
}

function invalid(diagnostics) {
  diagnostics.add(19011);
  return null;
}

function projectRate(observation, nowMs, receivingAtMs, endedAtMs) {
  if (endedAtMs !== null && endedAtMs !== undefined) {
    return { phase: 'frozen', bytesPerSecond: null, windowMs: 0, includesRedundancy: true };
  }
  if (receivingAtMs === null || receivingAtMs === undefined) {
    return { phase: 'idle', bytesPerSecond: null, windowMs: 0, includesRedundancy: true };
  }
  const rate = observation.rate || { epochMs: receivingAtMs, buckets: [] };
  const epoch = typeof rate.epochMs === 'number' ? rate.epochMs : receivingAtMs;
  if (nowMs - epoch < RATE_WARMUP_MS) {
    return { phase: 'warming', bytesPerSecond: null, windowMs: 0, includesRedundancy: true };
  }
  const q = Math.floor((nowMs - epoch) / RATE_BUCKET_MS);
  const low = Math.max(0, q - 11);
  let bytes = 0;
  for (const slot of rate.buckets || []) {
    if (slot.generation >= low && slot.generation <= q) bytes += slot.bytes;
  }
  const windowMs = nowMs - (epoch + low * RATE_BUCKET_MS);
  return {
    phase: 'active',
    bytesPerSecond: windowMs > 0 ? (bytes * 1000) / windowMs : 0,
    windowMs,
    includesRedundancy: true,
  };
}

function projectElapsed(receivingAtMs, endedAtMs, nowMs) {
  if (receivingAtMs === null || receivingAtMs === undefined) return null;
  const end = endedAtMs !== null && endedAtMs !== undefined ? endedAtMs : nowMs;
  return Math.floor(end - receivingAtMs);
}

function projectProgress(observation, context, nowMs) {
  const progress = observation.progress || {};
  if (COMPLETION_STATES.has(context.state)) {
    return {
      kind: 'complete', ratio: 1,
      asOfMs: observation.endedAtMs !== null && observation.endedAtMs !== undefined
        ? observation.endedAtMs : nowMs,
      stale: false, diagnosticCode: 0,
    };
  }
  if (progress.ambiguity) {
    return { kind: 'ambiguous', ratio: null, asOfMs: null, stale: false,
      diagnosticCode: progress.ambiguity };
  }
  const trusted = progress.trustedRatio;
  if (trusted === null || trusted === undefined) {
    if (progress.lastDataAtMs != null) {
      // Data is flowing but the report read degraded: hide the ratio, keep
      // the rate. The code is this seq's latest report degradation (never an
      // ambiguity code — those took the ambiguous branch above).
      let degradation = 0;
      for (const code of observation.diagnostics || []) {
        if (REPORT_DEGRADATION_CODES.has(code) && code > degradation) degradation = code;
      }
      return { kind: 'unavailable', ratio: null, asOfMs: null,
        stale: false, diagnosticCode: degradation };
    }
    return { kind: 'none', ratio: null, asOfMs: null, stale: false, diagnosticCode: 0 };
  }
  if (trusted >= 1) {
    return { kind: 'enough_data', ratio: null, asOfMs: progress.trustedAtMs ?? null,
      stale: false, diagnosticCode: 0 };
  }
  const stale = progress.lastDataAtMs != null
    && nowMs - progress.lastDataAtMs >= NO_DATA_NOTICE_MS;
  return { kind: 'estimate', ratio: trusted, asOfMs: progress.trustedAtMs ?? null,
    stale, diagnosticCode: 0 };
}

function statusKeyFor(observation, context, nowMs) {
  switch (context.state) {
    case 'Idle': return 'idle';
    case 'Preparing': return 'preparing';
    case 'Draining': return 'draining';
    case 'Reconstructing': return 'reconstructing';
    case 'Stopping': return 'stopping';
    case 'Stopped': return 'stopped';
    case 'Incomplete': return 'incomplete';
    case 'Error': return 'error';
    case 'Ready': return 'ready';
    case 'Saving':
      if (context.state === 'Saving') {
        const phase = observation.save ? observation.save.phase : 'none';
        if (phase === 'selecting') return 'saving_selecting';
        if (phase === 'writing') return 'saving_writing';
        if (phase === 'pending') return 'saving_pending';
      }
      return null; // caller rejects with 19014
    case 'Saved':
      return observation.save && observation.save.phase === 'saved' ? 'saved' : null;
    case 'Retryable': {
      const phase = observation.save ? observation.save.phase : 'none';
      if (phase === 'cancelled') return 'save_cancelled';
      if (phase === 'failed') return 'save_failed';
      return null;
    }
    default:
      break;
  }
  // Receiving detail
  if (context.inFlight && typeof context.inFlightSinceMs === 'number'
      && nowMs - context.inFlightSinceMs >= PROCESSING_NOTICE_MS) {
    return 'processing';
  }
  const progress = observation.progress || {};
  if (progress.lastDataAtMs == null) return 'waiting_data';
  if (nowMs - progress.lastDataAtMs >= NO_DATA_NOTICE_MS) return 'no_new_data';
  if (progress.ambiguity) return 'progress_unknown';
  const trusted = progress.trustedRatio;
  if (trusted === null || trusted === undefined) return 'progress_unavailable';
  if (trusted >= 1) return 'collecting_more';
  if (progress.lastAdvanceAtMs != null
      && nowMs - progress.lastAdvanceAtMs >= NO_ADVANCE_NOTICE_MS) {
    return 'no_progress';
  }
  return 'receiving';
}

export function readView(observation, request) {
  if (!observation || typeof observation !== 'object'
      || !request || typeof request !== 'object') {
    return fail(19008);
  }
  if (request.version !== 1) return fail(19013);

  const context = request.context;
  if (!context || typeof context !== 'object') return fail(19008);
  if (!STATES.includes(context.state)) return fail(19008);
  if (!Number.isSafeInteger(context.businessRevision) || context.businessRevision < 0) {
    return fail(19008);
  }
  if (context.inputKind !== null && context.inputKind !== 'live'
      && context.inputKind !== 'video') {
    return fail(19008);
  }
  if (typeof context.cleanupComplete !== 'boolean') return fail(19008);
  if (context.artifactId !== null && !isId(context.artifactId)) return fail(19008);
  if (!isValidControls(context.controls)) return fail(19008);
  if (typeof context.inFlight !== 'boolean') return fail(19008);
  if (context.inFlight) {
    if (!isClock(context.inFlightSinceMs)) return fail(19008);
  } else if (context.inFlightSinceMs !== null) {
    return fail(19008);
  }
  if (context.mediaDiagnosticCode !== 0 && context.mediaDiagnosticCode !== 19011) {
    return fail(19008);
  }
  if (typeof request.sessionId !== 'string' || !isId(request.sessionId)) {
    if (request.sessionId !== null) return fail(19008);
  }
  if (!Number.isSafeInteger(request.sessionSeq) || request.sessionSeq < 0) {
    return fail(19008);
  }
  if (request.sessionId === null && request.sessionSeq !== 0) return fail(19008);
  if (request.sessionId !== null && request.sessionSeq < 1) return fail(19008);

  if (!isClock(request.nowMs)) return fail(19009);

  const obsId = observation.sessionId ?? null;
  const obsSeq = observation.sessionSeq ?? 0;
  if (obsId !== null) {
    if (request.sessionSeq < obsSeq) return fail(19007);
    if (request.sessionSeq > obsSeq) return fail(19008);
    if (request.sessionId !== obsId) return fail(19008);
  }
  if (observation.receivingAtMs != null && request.nowMs < observation.receivingAtMs) {
    return fail(19009);
  }
  const lastResultAtMs = observation.progress ? observation.progress.lastResultAtMs : null;
  if (lastResultAtMs != null && request.nowMs < lastResultAtMs) return fail(19009);
  if (observation.endedAtMs != null && request.nowMs < observation.endedAtMs) {
    return fail(19009);
  }

  if (ARTIFACT_STATES.has(context.state) && context.artifactId === null) {
    return fail(19014);
  }

  const nowMs = request.nowMs;
  const receivingAtMs = observation.receivingAtMs ?? null;
  const endedAtMs = observation.endedAtMs ?? null;
  const diagnostics = new Set(observation.diagnostics || []);
  const mediaPosition = normalizeMedia(context, diagnostics);

  let statusKey = statusKeyFor(observation, context, nowMs);
  if (statusKey === null) return fail(19014);

  const primary = statusKey === 'receiving' && context.inputKind === 'video'
    ? TEXT.receiving_video : TEXT[statusKey];
  let nextAction = '';
  if (statusKey === 'waiting_data'
      && nowMs - receivingAtMs >= FIRST_DATA_NOTICE_MS) {
    nextAction = WAITING_ADVICE;
  } else if (statusKey === 'ready') {
    nextAction = READY_NEXT;
  } else if (statusKey === 'saved') {
    nextAction = SAVED_NEXT;
  } else if (['receiving', 'no_progress', 'progress_unknown', 'collecting_more'].includes(statusKey)) {
    nextAction = KEEP_SENDING;
  }

  const save = observation.save
    ? { ...observation.save }
    : { phase: 'none', attemptId: null, artifactId: null, errorCode: null };

  return {
    ok: true,
    code: 0,
    data: {
      version: 1,
      sessionId: request.sessionId,
      sessionSeq: request.sessionSeq,
      observationRevision: observation.observationRevision ?? 0,
      businessRevision: context.businessRevision,
      viewAtMs: nowMs,
      state: context.state,
      statusKey,
      primary,
      secondary: '',
      nextAction,
      elapsedMs: projectElapsed(receivingAtMs, endedAtMs, nowMs),
      rate: projectRate(observation, nowMs, receivingAtMs, endedAtMs),
      progress: projectProgress(observation, context, nowMs),
      mediaPosition,
      save,
      controls: { ...context.controls },
      announcementKey: `${statusKey}:${context.artifactId == null ? 'none' : context.artifactId}:${save.attemptId == null ? 'none' : save.attemptId}`,
      diagnosticCodes: [...diagnostics].sort((a, b) => a - b),
    },
  };
}

// --- display-side formatting (T9 sparrow; the full copy matrix lands in T27) --

export function formatElapsed(elapsedMs) {
  if (elapsedMs === null || elapsedMs === undefined) return '';
  return `${(elapsedMs / 1000).toFixed(1)}s`;
}

export function formatRate(rate) {
  if (!rate || rate.phase !== 'active' || rate.bytesPerSecond === null) return '';
  const kib = rate.bytesPerSecond / 1024;
  const value = kib > 0 && kib < 0.1 ? '<0.1' : kib.toFixed(1);
  return `${value} KiB/s（含冗余）`;
}

export function formatProgress(progress) {
  if (!progress) return '';
  switch (progress.kind) {
    case 'estimate': return `${Math.round(progress.ratio * 100)}%`;
    case 'complete': return '100%';
    case 'enough_data': return '数据量已达到，文件尚未完成';
    case 'ambiguous': return '进度无法判定';
    default: return '';
  }
}

export function formatMedia(mediaPosition) {
  if (!mediaPosition) return null;
  const base = `录像位置 ${mediaPosition.positionSeconds.toFixed(1)}s`;
  if (mediaPosition.durationSeconds === null || mediaPosition.fraction === null) {
    return base;
  }
  return `${base} / ${(mediaPosition.fraction * 100).toFixed(0)}%`;
}

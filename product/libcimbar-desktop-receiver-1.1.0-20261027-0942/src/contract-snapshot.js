// The single boundary between the internal session snapshot and the frozen
// receiver-v1 Snapshot contract. The internal shape stays ergonomic
// (sessionSeq, blob-carrying artifact, scheduler stat names); this module is
// the only place the wire shape is produced, so schema drift is caught by one
// test against the contract file itself.
//
// Returns null when there is no session (IF-003 allows a null read result).

const CONTRACT_STATES = new Set([
  'Preparing', 'Receiving', 'Draining', 'Reconstructing', 'Ready',
  'Saving', 'Saved', 'Retryable', 'Stopping', 'Stopped', 'Incomplete',
]);

const MODE_NAMES = { 68: 'B', 67: 'Bm', 66: 'Bu', 4: '4C' };

function contractStats(internalStats, elapsedMs) {
  const submitted = internalStats.submitted || 0;
  const dropped = internalStats.dropped || 0;
  const completed = internalStats.completed || 0;
  const failed = internalStats.failed || 0;
  return {
    capturedFrames: submitted + dropped,
    submittedFrames: submitted,
    processedFrames: completed,
    droppedFrames: dropped + failed,
    inflight: internalStats.inFlight ? 1 : 0,
    elapsedMs,
  };
}

function contractArtifact(artifact) {
  if (!artifact) return null;
  // receiver-v1 Artifact has additionalProperties: false and no Blob field;
  // the bytes stay in memory on the internal side only.
  return {
    artifactId: artifact.artifactId,
    fountainFileId: artifact.fountainFileId,
    suggestedName: artifact.suggestedName,
    byteCount: artifact.byteCount,
    compressedBytes: artifact.compressedBytes,
    mime: artifact.mime || 'application/octet-stream',
  };
}

export function toContractSnapshot(internal, context = {}) {
  if (!internal || !internal.sessionId) return null;

  const state = CONTRACT_STATES.has(internal.state) ? internal.state : 'Stopped';

  let mode = context.mode || 'B';
  if (typeof mode === 'number') {
    if (!MODE_NAMES[mode]) {
      throw new Error(`mode ${mode} is not representable in the receiver-v1 contract`);
    }
    mode = MODE_NAMES[mode];
  }

  const pendingExternal = [];
  if (internal.capturePending) pendingExternal.push('capture_picker');
  for (const item of context.savePending || []) pendingExternal.push(item);

  const lastError = context.lastError && typeof context.lastError === 'object'
    ? context.lastError
    : null;

  return {
    sessionId: internal.sessionId,
    inputKind: internal.inputKind === 'video' ? 'video' : 'live',
    mode,
    state,
    revision: internal.revision,
    inputEnded: internal.inputEnded === true,
    cleanupComplete: internal.cleanupComplete === true,
    pendingExternal,
    artifact: contractArtifact(internal.artifact),
    saveAttemptId: context.saveAttemptId ?? null,
    lastError,
    stats: contractStats(internal.stats || {}, context.elapsedMs ?? null),
    saveStatus: context.saveStatus || 'none',
  };
}

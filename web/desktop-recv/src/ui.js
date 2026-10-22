// Pure view-model helpers for the receiver UI. No DOM here: the tests drive
// these functions directly, the page wires them to elements.

export const STATES = [
  'Idle', 'Preparing', 'Receiving', 'Draining', 'Reconstructing',
  'Ready', 'Saving', 'Saved', 'Retryable', 'Stopping', 'Stopped',
  'Incomplete', 'Error',
];

const IDLE_LIKE = new Set(['Idle', 'Stopped', 'Saved', 'Incomplete', 'Error']);
const STOPPABLE = new Set([
  'Preparing', 'Receiving', 'Draining', 'Reconstructing',
  'Ready', 'Saving', 'Retryable',
]);

function status_text(state, hasArtifact) {
  switch (state) {
    case 'Idle': return 'Ready to receive';
    case 'Preparing': return 'Starting…';
    case 'Receiving': return 'Receiving frames';
    case 'Draining': return 'Finishing the stream';
    case 'Reconstructing': return 'Rebuilding the file';
    case 'Ready': return hasArtifact ? 'File ready to save' : 'File ready';
    case 'Saving': return 'Saving…';
    case 'Saved': return 'Saved';
    case 'Retryable': return 'Save failed — you can retry';
    case 'Stopping': return 'Stopping…';
    case 'Stopped': return 'Stopped';
    case 'Incomplete': return 'Not enough data to rebuild the file';
    case 'Error': return 'Something went wrong';
    default: return state;
  }
}

// Controls follow the session state. An unconverged session cannot start a
// new one; saving is only possible with a real artifact. `cleanupComplete`
// closes the window in which a cancelled capture has already rendered Idle
// while its decoder init is still owned (B-R1). A missing field keeps the
// historical behavior.
export function deriveControls(snapshot, capabilities = {}) {
  const state = snapshot && snapshot.state ? snapshot.state : 'Idle';
  const hasArtifact = !!(snapshot && snapshot.artifact);
  const anyInput = !!(capabilities.realtime || capabilities.videoImport);
  const idleLike = IDLE_LIKE.has(state);
  const cleanupComplete = !snapshot || snapshot.cleanupComplete !== false;
  const saveCapable = capabilities.savePicker !== false;

  return {
    canStart: idleLike && anyInput && cleanupComplete,
    canStop: STOPPABLE.has(state),
    canSave: (state === 'Ready' && hasArtifact && saveCapable) ||
      (state === 'Retryable' && hasArtifact && saveCapable),
    canRetrySave: state === 'Retryable' && hasArtifact && saveCapable,
    canImportVideo: idleLike && !!capabilities.videoImport && cleanupComplete,
    statusText: status_text(state, hasArtifact),
  };
}

// A notice about a source that has not produced valid frames yet. It names
// the source and the mode and never claims completion or failure.
export function noDataHint({ elapsedMs, thresholdMs, sourceLabel, mode }) {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(thresholdMs)) return null;
  if (elapsedMs < thresholdMs) return null;

  const source = sourceLabel || 'the selected source';
  const modeText = mode ? `mode ${mode}` : 'the current mode';
  return {
    level: 'notice',
    text: `No valid frames from ${source} in ${modeText} yet. ` +
      'Check that the sender window is visible and that the mode matches.',
  };
}

// Apply a snapshot only if it is forward progress for the same session, or
// belongs to a newer session. Old sessions, revisions and events are dropped.
export function shouldApplySnapshot(current, incoming, lastEventSeq = 0) {
  if (!incoming) return false;
  if (!current) return true;
  if (incoming.sessionSeq > current.sessionSeq) return true;
  if (incoming.sessionSeq < current.sessionSeq) return false;
  if (incoming.sessionId !== current.sessionId) return false;
  return incoming.revision > current.revision && incoming.eventSeq > lastEventSeq;
}

// The save dialog default must be a safe basename. Empty or unusable names
// fall back to the file id. Collision handling belongs to the system picker.
export function safeSuggestedName(name, fallback) {
  let base = typeof name === 'string' ? name : '';
  base = base.replace(/[\u0000-\u001f\u007f]/g, '');
  base = base.replace(/\\/g, '/');
  const parts = base.split('/');
  base = parts[parts.length - 1].trim();
  if (!base || base === '.' || base === '..') return `${fallback}.bin`;
  return base;
}

// Describe recovery for a registered error. Nothing here may re-open a system
// picker on its own: a fresh user click is required.
export function describeRecovery(code, registry) {
  const entries = Array.isArray(registry) ? registry
    : (registry && Array.isArray(registry.errors) ? registry.errors : []);
  const entry = entries.find((e) => e.code === code);

  if (!entry) {
    return {
      message: 'The operation did not complete. Start a new session to try again.',
      retryAction: 'new_session',
      autoPrompt: false,
      requiresClick: false,
    };
  }

  const retryAction = entry.retryAction || 'new_session';
  return {
    message: entry.message || entry.name,
    retryAction,
    autoPrompt: false,
    requiresClick: retryAction === 'new_click',
  };
}

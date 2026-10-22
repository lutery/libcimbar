// Pure per-leg verdicts for the recorded-input failure journeys (round-3
// external review A-R3) and the artifact-budget journey (A-R2).
//
// A leg verdict answers ONE question: did THIS dispatch fail the way the
// product claims, with evidence that belongs to THIS dispatch? The old
// E2E-15 waitFor scanned the CUMULATIVE log and treated saveDisabled as a
// terminal state, so an OLD error line could satisfy a leg whose import was
// still stuck in Preparing (the reviewer's controlled replay returned PASS
// for exactly that). Every check below therefore reads only the delta since
// a baseline taken immediately before the dispatch:
//
//   baseline = { attemptId, logLength, trailLength }   (snapshot pre-dispatch)
//   delta    = log text appended since baseline.logLength
//   state    = settled page state AFTER the leg:
//              { state (the __state hook object or the internal name),
//                statusTrail, cleanupComplete?, ... }
//   buttons  = { saveDisabled, videoDisabled, stopDisabled? }
//   attemptId = the attempt id AFTER the dispatch
//
// No DOM, no timers, no IO: the runner owns observation, this module only
// judges. Missing product hooks are failed checks with explicit messages -
// the harness never silently downgrades a criterion it cannot observe.

// Restartable terminal states (verdict A-R3 DoD: a failed import must return
// to a terminal state a user can restart from). 'Error' is deliberately NOT
// in this set: it is idle-like for the button derivation, but the rectified
// criteria require one of these four.
export const RESTARTABLE_TERMINALS = ['Idle', 'Incomplete', 'Stopped', 'Saved'];

const isHookMissing = (value) => value === null || value === undefined;

// Accept either the page snapshot ({ state: __state hook object, ... }), the
// __state hook object itself ({ state: 'Idle', ... }), or the bare name.
function internalStateOf(state) {
  if (isHookMissing(state)) return null;
  if (typeof state === 'string') return state;
  if (typeof state !== 'object') return null;
  if (typeof state.state === 'string') return state.state;
  if (state.state && typeof state.state === 'object' && typeof state.state.state === 'string') {
    return state.state.state;
  }
  return null;
}

function cleanupCompleteOf(state) {
  if (isHookMissing(state)) return null;
  if (typeof state === 'object' && 'cleanupComplete' in state) return state.cleanupComplete === true;
  if (typeof state === 'object' && state.state && typeof state.state === 'object'
    && 'cleanupComplete' in state.state) return state.state.cleanupComplete === true;
  return null;
}

// (a) THIS dispatch was ingested: the import identity advanced AND the
// status trail shows the session actually left Idle after the dispatch. A
// baseline of null is the legitimate "no attempt yet" identity on a fresh
// page (null -> video-1 IS an advance); only a missing post-dispatch
// identity or a true non-advance fails.
export function checkIngested({ baseline, attemptId, state }) {
  const failures = [];
  const baseAttempt = baseline ? baseline.attemptId : undefined;
  if (isHookMissing(attemptId)) {
    failures.push('attempt identity is missing after the dispatch (__videoTimeline hook missing)');
  } else if (baseAttempt !== undefined && attemptId === baseAttempt) {
    failures.push(`attempt identity did not advance (baseline=${String(baseAttempt)}, after=${String(attemptId)})`);
  }
  const trail = state ? state.statusTrail : null;
  if (!Array.isArray(trail)) {
    failures.push('__statusTrail hook missing: ingestion cannot be confirmed');
    return { ok: false, failures, leftIdle: false };
  }
  const baseLength = Number.isInteger(baseline && baseline.trailLength) ? baseline.trailLength : 0;
  const since = trail.slice(Math.max(0, baseLength));
  const leftIdle = since.some((entry) => {
    const name = entry && typeof entry === 'object'
      ? (entry.state || entry.status) : entry;
    return typeof name === 'string' && name !== 'Idle';
  });
  if (!leftIdle) {
    failures.push(`the status trail never left Idle after the dispatch (${since.length} new entries)`);
  }
  return { ok: failures.length === 0, failures, leftIdle };
}

// (b) the log DELTA carries the expected error code for this input class.
export function checkExpectedCode(delta, expectedCodes) {
  const text = typeof delta === 'string' ? delta : '';
  const codes = Array.isArray(expectedCodes) ? expectedCodes.map(String) : [];
  const hit = codes.find((code) => text.includes(code)) || null;
  const failures = [];
  if (!hit) {
    failures.push(`the log delta since this dispatch contains none of [${codes.join('|')}] ` +
      `(delta ${text.length} chars)`);
  }
  return { ok: failures.length === 0, failures, hit };
}

// (c) the leg returned to a restartable terminal with a dead save button, a
// live video entry and a converged cleanup. saveDisabled=true alone is NOT
// a terminal state (the old false-green read exactly that).
export function checkRestartableTerminal({ state, buttons }) {
  const failures = [];
  const internal = internalStateOf(state);
  if (internal === null) {
    failures.push('__state hook missing: the terminal state cannot be confirmed');
  } else if (!RESTARTABLE_TERMINALS.includes(internal)) {
    failures.push(`state "${internal}" is not a restartable terminal ` +
      `(${RESTARTABLE_TERMINALS.join('/')})`);
  }
  if (!buttons || buttons.saveDisabled !== true) {
    failures.push('save is not disabled: the leg did not settle without an artifact');
  }
  if (!buttons || buttons.videoDisabled !== false) {
    failures.push('the video entry is not re-enabled: the leg is not restartable');
  }
  const cleanup = cleanupCompleteOf(state);
  if (cleanup !== true) {
    failures.push(`cleanupComplete is not true (got ${String(cleanup)}): resources not converged`);
  }
  return { ok: failures.length === 0, failures, internal, cleanupComplete: cleanup };
}

// (d) the dispatch was not merely refused as busy.
export function checkNotAlreadyActive(delta) {
  const text = typeof delta === 'string' ? delta : '';
  const failures = [];
  if (/already active/i.test(text)) {
    failures.push("the delta contains 'already active': the dispatch was refused, not ingested");
  }
  return { ok: failures.length === 0, failures };
}

// Full per-leg verdict for one bad-recording import. Returns
// { ok, failures, checks } so the record notes can cite each criterion.
export function evaluateVideoFailureLeg({
  baseline, delta, state, buttons, attemptId, expectedCodes,
}) {
  const ingested = checkIngested({ baseline, attemptId, state });
  const code = checkExpectedCode(delta, expectedCodes);
  const terminal = checkRestartableTerminal({ state, buttons });
  const busy = checkNotAlreadyActive(delta);
  const failures = [
    ...ingested.failures, ...code.failures, ...terminal.failures, ...busy.failures,
  ];
  return {
    ok: failures.length === 0,
    failures,
    checks: {
      ingested: ingested.ok,
      leftIdle: ingested.leftIdle,
      expectedCode: code.hit,
      terminal: terminal.internal,
      cleanupComplete: terminal.cleanupComplete,
      notAlreadyActive: busy.ok,
    },
  };
}

// Verdict for the artifact-budget rejection leg (A-R2 / user decision 4):
// the rejection must be logged for THIS dispatch, no artifact may appear,
// and the session must stay controllable (stop available, never a false
// Ready, never hung). Recovery (stop + a hash-clean normal-file roundtrip)
// is judged by the caller with real hashes, not here.
export function evaluateBudgetLeg({
  baseline, delta, state, buttons, attemptId, expectedCode = '15008',
}) {
  const failures = [];
  const text = typeof delta === 'string' ? delta : '';
  const codeHit = text.includes(String(expectedCode));
  if (!codeHit) {
    failures.push(`the log delta since this dispatch does not contain ${expectedCode}`);
  }

  const internal = internalStateOf(state);
  if (internal === 'Ready') {
    failures.push('state reached Ready: an over-budget artifact was accepted (must be rejected)');
  }
  const artifactPresent = state && typeof state === 'object'
    ? (state.hasArtifact === true
      || (state.contractSnapshot && state.contractSnapshot.artifact != null)) : false;
  if (artifactPresent) {
    failures.push('an artifact is present after the over-budget rejection');
  }
  if (!buttons || buttons.saveDisabled !== true) {
    failures.push('save is not disabled: an over-budget payload must leave nothing saveable');
  }
  if (!buttons || buttons.stopDisabled !== false) {
    failures.push('stop is not available: the rejected session must remain controllable');
  }
  // The dispatch itself must have been ingested like any video/live leg when
  // an attempt identity was supplied (live legs may pass null attemptId:
  // there is no video import then, so the check is skipped).
  if (attemptId !== undefined && attemptId !== null) {
    const ingested = checkIngested({ baseline, attemptId, state });
    failures.push(...ingested.failures);
  }
  return {
    ok: failures.length === 0,
    failures,
    checks: { codeHit, internal, artifactPresent, stopAvailable: !!(buttons && buttons.stopDisabled === false) },
  };
}

// Map an input class to the error codes the product may legitimately report
// for it (team-lead decision 2b, round-3 lane): empty and non-video files
// fail the metadata precheck with 13005; a truncated-but-openable container
// is ALSO rejected at the metadata precheck with 13005 on this product
// (MediaRecorder WebM keeps duration Infinity, video-source.js:84-87) and
// would fail mid-read with 13002/13003 - the acceptance intent
// (AC-006/008/014, UAT-L15) is finite/registered/restartable, not a
// specific plan-guessed code, so the corrupt class accepts the registered
// union. The observed code and rejection point are recorded per leg.
export function expectedCodesForBadInput(kind) {
  if (kind === 'empty' || kind === 'text') return ['13005'];
  if (kind === 'corrupt') return ['13005', '13002', '13003'];
  return [];
}

// Which product exit point produced the observed code (for the per-leg
// record): 13005 is the metadata/first-frame precheck, 13002/13003 are the
// decode/step paths.
export function rejectionPointForCode(code) {
  if (String(code) === '13005') return 'metadata_precheck';
  if (String(code) === '13002' || String(code) === '13003') return 'decode_or_step';
  return null;
}

// --- Round-5 A-01: per-exception recovery legs -----------------------------
//
// After EVERY failed recording the same page (no reload) must actually
// rebuild and save a known-good recording before the next bad input
// (UAT-L15). The old journey waited for the video entry to re-enable after
// empty/text/corrupt and recovered ONCE at the end, which the round-5
// verdict rejected. A recovery leg is judged from the app's own evidence:
// the real entry click opened the OS dialog, the app ingested the chosen
// file (a 'recording:' delta), the attempt identity advanced, the session
// reached Ready, the save produced complete/ordered save marks, and the
// external SHA-256 of the saved file equals the fixture. The dialog helper's
// exit code alone is NEVER product evidence (round-3 S-1 protocol): when the
// helper failed AND the app never ingested anything, the leg is a rig
// limitation (NOT_RUN with diagnostics), which still keeps the journey from
// passing.
export function evaluateRecoveryLeg({
  helperExit, openIngested, attemptIdAdvanced, readyReached,
  saveTimingsComplete, hashEqual,
}) {
  const failures = [];
  if (helperExit !== 0) {
    failures.push(`the OS open dialog helper did not exit 0 (exit ${String(helperExit)}): the real entry was not driven`);
  }
  if (openIngested !== true) {
    failures.push("the app never logged 'recording:' for this dispatch: the dialog-selected file was not ingested " +
      '(the helper exit code is not product evidence)');
  }
  if (attemptIdAdvanced !== true) {
    failures.push('the attempt identity did not advance for the recovery import');
  }
  if (readyReached !== true) {
    failures.push('the recovery import never reached Ready (no saveable artifact)');
  }
  if (saveTimingsComplete !== true) {
    failures.push('the successful save has missing or unordered save timings ' +
      '(saveRequestAt/writableAt/writeCloseAt)');
  }
  if (hashEqual !== true) {
    failures.push('the external SHA-256 of the restored file does not equal the fixture');
  }
  const rigLimited = openIngested !== true && helperExit !== 0;
  return {
    ok: failures.length === 0,
    failures,
    rigLimited,
    checks: {
      helperExit,
      openIngested: openIngested === true,
      attemptIdAdvanced: attemptIdAdvanced === true,
      readyReached: readyReached === true,
      saveTimingsComplete: saveTimingsComplete === true,
      hashEqual: hashEqual === true,
    },
  };
}

// --- Round-5 A-02: the recorded last-frame pair -----------------------------
//
// The pair is now ONE getDisplayMedia stream captured by TWO MediaRecorders
// started in the same task (recorder.html __startPairRecording; the shared
// head/tail is proven by video-prefix-check.py and pair-evidence.mjs). The
// acceptance question is no longer "artifactFrameId === presented" (which
// holds structurally on the artifact path) but whether the critical data
// completed in the END SEGMENT of the with clip, while the without clip
// genuinely reached EOF earlier and produced nothing:
//
//   with leg:    real completion media time T* = __videoTimeline.lastUs/1e6
//                (artifactFrameId is a frame IDENTITY, never added to time),
//                T* within END_SEGMENT_TOLERANCE_SEC of the clip's own media
//                duration (parsed from the receiver's open-precheck line),
//                __mediaEnded stays null, the save is hash-clean and its
//                timings are complete/ordered.
//   without leg: __mediaEnded FIRED, the EOF media time is within
//                WITHOUT_EOF_TOLERANCE_SEC of the declared cut, and no
//                artifact exists.
//   pair:        T* > the without clip's own media duration.
//
// Missing hooks are explicit failures, never silent passes. endReason stays
// a diagnostic (releaseInputs stops the source before the run loop can label
// the ending), so it is not a criterion here.
export const END_SEGMENT_TOLERANCE_SEC = 2.0;
export const WITHOUT_EOF_TOLERANCE_SEC = 1.0;

const finiteOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const round1 = (value) => Math.round(value * 10) / 10;

export function evaluateLastFramePair({
  withTStarSec, withDurationSec, withMediaEnded, withSaveHashEqual, withSaveTimingsComplete,
  withoutEofFired, withoutEofMediaTimeSec, withoutDeclaredCutSec, withoutArtifactAbsent,
  withoutDurationSec,
}) {
  const failures = [];
  const tStar = finiteOrNull(withTStarSec);
  const withDuration = finiteOrNull(withDurationSec);
  const eofTime = finiteOrNull(withoutEofMediaTimeSec);
  const declaredCut = finiteOrNull(withoutDeclaredCutSec);
  const withoutDuration = finiteOrNull(withoutDurationSec);

  if (tStar === null) {
    failures.push('the with leg has no real completion media time (__videoTimeline.lastUs missing)');
  }
  if (withDuration === null || withDuration <= 0) {
    failures.push('the with leg has no parsed recording duration (the open-precheck "recording: WxH, D s" line is missing)');
  }
  const endSegmentBoundary = withDuration != null ? withDuration - END_SEGMENT_TOLERANCE_SEC : null;
  const endSegmentOk = tStar != null && endSegmentBoundary != null && tStar >= endSegmentBoundary;
  if (tStar != null && endSegmentBoundary != null && !endSegmentOk) {
    failures.push(`the with leg completed at T*=${tStar}s, more than ${END_SEGMENT_TOLERANCE_SEC}s before the end of its ` +
      `own ${withDuration}s media (boundary ${endSegmentBoundary}s): the critical data did not complete in the end segment`);
  }
  if (withMediaEnded !== null) {
    failures.push(`__mediaEnded must stay null on the with leg (got ${JSON.stringify(withMediaEnded)}): ` +
      'the session must settle at the artifact, not at the natural media end');
  }
  if (withSaveHashEqual !== true) {
    failures.push('the with-leg save is not hash-clean (external SHA-256 of original vs received)');
  }
  if (withSaveTimingsComplete !== true) {
    failures.push('the with-leg save has missing or unordered save timings (saveRequestAt/writableAt/writeCloseAt)');
  }
  if (withoutEofFired !== true) {
    failures.push('the without leg never fired __mediaEnded: it did not reach real EOF');
  }
  if (eofTime === null) {
    failures.push('the without leg has no EOF media time');
  }
  if (declaredCut === null || declaredCut <= 0) {
    failures.push('the pair manifest does not declare a positive cut time (declaredCutMs)');
  }
  const eofBoundary = declaredCut != null ? declaredCut - WITHOUT_EOF_TOLERANCE_SEC : null;
  if (eofTime != null && eofBoundary != null && eofTime < eofBoundary) {
    failures.push(`the without EOF media time ${eofTime}s is more than ${WITHOUT_EOF_TOLERANCE_SEC}s before the declared ` +
      `cut ${declaredCut}s (boundary ${eofBoundary}s): the without clip was truncated, not stopped at the cut`);
  }
  if (withoutArtifactAbsent !== true) {
    failures.push('the without leg left a saveable artifact');
  }
  if (tStar != null && withoutDuration != null && !(tStar > withoutDuration)) {
    failures.push(`pair validity: T*=${tStar}s must exceed the without clip's own media duration ${withoutDuration}s`);
  } else if (withoutDuration === null) {
    failures.push('the without leg has no measured media duration');
  }

  // Leg-level aggregates: the runner derives leg statuses from these (no
  // parallel criterion logic in the runner).
  const saveOk = withSaveHashEqual === true && withSaveTimingsComplete === true;
  const pairValid = tStar != null && withoutDuration != null && tStar > withoutDuration;
  const withLegOk = tStar != null && withDuration != null && endSegmentOk
    && withMediaEnded === null && saveOk;
  const withoutLegOk = withoutEofFired === true && eofTime != null && eofBoundary != null
    && eofTime >= eofBoundary && withoutArtifactAbsent === true;

  // Re-record guidance: the lane re-tunes the declared stop points from the
  // MEASURED T* (withMs = T* + 1.5 s, cut = T* - 1.5 s; at most two
  // calibrations). Produced when end-segment OR pair-validity failed while a
  // real, positive T* exists - a made-up suggestion would be worse than none.
  let rerecord = null;
  if (tStar != null && tStar > 0
      && ((endSegmentBoundary != null && !endSegmentOk)
        || (withoutDuration != null && !pairValid))) {
    rerecord = {
      measuredTStarSec: tStar,
      suggestedWithSeconds: round1(tStar + 1.5),
      suggestedCutSeconds: round1(Math.max(0.5, tStar - 1.5)),
      instruction: `RE-RECORD the pair with --with-seconds ${round1(tStar + 1.5)} --cut-seconds ` +
        `${round1(Math.max(0.5, tStar - 1.5))} (measured T*=${tStar}s)`,
    };
  }

  return {
    ok: failures.length === 0,
    failures,
    rerecord,
    checks: {
      tStarSec: tStar,
      withDurationSec: withDuration,
      endSegmentBoundarySec: endSegmentBoundary,
      endSegment: endSegmentOk,
      mediaEndedNull: withMediaEnded === null,
      saveHashEqual: withSaveHashEqual === true,
      saveTimingsComplete: withSaveTimingsComplete === true,
      withoutEofFired: withoutEofFired === true,
      withoutEofMediaTimeSec: eofTime,
      withoutDeclaredCutSec: declaredCut,
      withoutArtifactAbsent: withoutArtifactAbsent === true,
      pairValidity: pairValid,
      saveOk,
      withLegOk,
      withoutLegOk,
    },
  };
}

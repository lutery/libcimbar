// Pure wall-clock decomposition for one E2E leg (round-5 A-03/B-S1).
//
// The round-4 package measured five successful recorded legs from a snapshot
// taken BEFORE the save, so saveRequestAt/writeCloseAt/saveMs were all null,
// and the live legs' single saveMs mixed the save-dialog wait with the write
// itself. This module turns the receiver's own diagnostics hooks into named
// boundaries and intervals, and provides the explicit assertion the runner
// applies after every executed save:
//
//   marks (all from the product's hooks, never estimated):
//     initStartAt             createClient() entered            (__journey)
//     initReadyAt             client.init() resolved            (__journey)
//     validInputStartAt       first Receiving moment            (__journey)
//     reconstructionDoneAt    the artifact first exists         (__journey)
//     saveRequestAt           SaveController 'selecting' fired  (__journey)
//     createWritableAccessedAt handle.createWritable accessed   (__createWritableAccessedAt)
//     writableAt              createWritable() promise settled  (__writableAt)
//     writeCloseAt            'saved' event (close resolved)    (__journey)
//     lastSaveClickAt         real click on #btn-save           (__lastSaveClickAt)
//
//   intervals:
//     decoderInitMs    = initReadyAt - initStartAt
//     sourceWaitMs     = validInputStartAt - initReadyAt
//     initMs           = validInputStartAt - initStartAt      (decoder init + source wait)
//     reconstructMs    = reconstructionDoneAt - validInputStartAt
//     totalToReadyMs   = reconstructionDoneAt - initStartAt
//     pickerWaitMs     = createWritableAccessedAt - saveRequestAt   (user picks a path)
//     writableOpenMs   = writableAt - createWritableAccessedAt
//     saveWaitMs       = writableAt - saveRequestAt           (picker + open, no write)
//     saveWriteMs      = writeCloseAt - writableAt            (the actual write + close)
//     saveMs           = writeCloseAt - saveRequestAt         (whole save)
//
// A missing mark yields a null interval - never an estimate. After a
// SUCCESSFUL save the three save marks must exist and be ordered; a leg that
// saved a file but cannot name those moments is a measurement failure and
// must fail the leg (assertSaveTimingsComplete), not silently record nulls.

export const SAVE_TIMING_FIELDS = ['saveRequestAt', 'writableAt', 'writeCloseAt'];

const pick = (...values) => values.find((v) => v !== undefined && v !== null) ?? null;
const diff = (a, b) => (a != null && b != null ? a - b : null);

function saveTimelineOf(state) {
  if (Array.isArray(state.saveTimeline)) {
    return state.saveTimeline[state.saveTimeline.length - 1] || {};
  }
  return state.saveTimeline || {};
}

// Accepts the runner's page snapshot ({ journey, videoTimeline, saveTimeline,
// writableAt, createWritableAccessedAt, lastSaveClickAt }) or any object with
// the same hooks. Field aliases are read the same way the runner always has.
export function computeLegTimings(state = {}) {
  const journey = state.journey || {};
  const saveTimeline = saveTimelineOf(state);
  const timeline = state.videoTimeline || {};
  const initStartAt = pick(journey.initStartAt, journey.initStart, journey.initStartedAt);
  const initReadyAt = pick(journey.initReadyAt);
  const validInputStartAt = pick(journey.receivingAt, journey.receivingFirstAt, timeline.presentedAt);
  const reconstructionDoneAt = pick(journey.readyAt, journey.readyFirstAt);
  // A dedicated __saveTimeline (if it ever appears) takes precedence over the
  // page-lifetime __journey marks.
  const saveRequestAt = pick(saveTimeline.saveRequestAt, saveTimeline.requestAt, journey.saveRequestAt);
  const createWritableAccessedAt = pick(state.createWritableAccessedAt, saveTimeline.createWritableAccessedAt);
  const writableAt = pick(state.writableAt, saveTimeline.writableAt);
  const writeCloseAt = pick(saveTimeline.writeCloseAt, saveTimeline.closeAt, journey.writeCloseAt);
  const lastSaveClickAt = pick(state.lastSaveClickAt, saveTimeline.lastSaveClickAt);
  return {
    initStartAt, initReadyAt, validInputStartAt, reconstructionDoneAt,
    saveRequestAt, createWritableAccessedAt, writableAt, writeCloseAt, lastSaveClickAt,
    decoderInitMs: diff(initReadyAt, initStartAt),
    sourceWaitMs: diff(validInputStartAt, initReadyAt),
    initMs: diff(validInputStartAt, initStartAt),
    reconstructMs: diff(reconstructionDoneAt, validInputStartAt),
    totalToReadyMs: diff(reconstructionDoneAt, initStartAt),
    pickerWaitMs: diff(createWritableAccessedAt, saveRequestAt),
    writableOpenMs: diff(writableAt, createWritableAccessedAt),
    saveWaitMs: diff(writableAt, saveRequestAt),
    saveWriteMs: diff(writeCloseAt, writableAt),
    saveMs: diff(writeCloseAt, saveRequestAt),
  };
}

// The post-save assertion: after a successful save, the request, the writable
// open and the write-close must all be real timestamps, in that order. The
// three failures are named individually so a record can cite them.
export function assertSaveTimingsComplete(timings) {
  const t = timings || {};
  const failures = [];
  for (const field of SAVE_TIMING_FIELDS) {
    if (typeof t[field] !== 'number' || !Number.isFinite(t[field])) {
      failures.push(`${field} is missing after a successful save (got ${JSON.stringify(t[field])})`);
    }
  }
  if (failures.length === 0) {
    if (!(t.saveRequestAt <= t.writableAt)) {
      failures.push(`saveRequestAt (${t.saveRequestAt}) is after writableAt (${t.writableAt})`);
    }
    if (!(t.writableAt <= t.writeCloseAt)) {
      failures.push(`writableAt (${t.writableAt}) is after writeCloseAt (${t.writeCloseAt})`);
    }
  }
  return {
    ok: failures.length === 0,
    failures,
    checks: {
      saveRequestAt: typeof t.saveRequestAt === 'number' && Number.isFinite(t.saveRequestAt),
      writableAt: typeof t.writableAt === 'number' && Number.isFinite(t.writableAt),
      writeCloseAt: typeof t.writeCloseAt === 'number' && Number.isFinite(t.writeCloseAt),
      ordered: failures.length === 0,
    },
  };
}

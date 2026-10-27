# Round-12 remediation report (B-R12-1) — product-side TDD

- Branch `receiver-ux-v2`, start HEAD `dc94f92`. Covers only A-R1 and A-R2/B-01; tools-side items (A-R3/A-R4/B-02/S1/S2) and the new run root belong to other batches.
- DoD source: `docs/dev-pipeline/ext-review/round-12-verdict.md` (A-R1, A-R2/B-01); ledger `docs/dev-pipeline/receiver-ux-v2/r12-remediation.md`. Verdict text prevails.
- Method: RED before GREEN. RED = verdict counterexamples as real-module assertions (real ReceiverTelemetry + readView, real createUxDisplay, controlled clock/paint), real failure output logged. No test renamed for green; no existing assertion weakened.

## 0. Overview

| Item | Code | RED (before) | GREEN (after) |
|---|---|---|---|
| A-R1 | `web/desktop-recv/src/ux-view.js` | ux-view 4 fail + ux-telemetry 1 fail (UX-UT-023) = 5 | 0 fail |
| A-R2/B-01 | `web/desktop-recv/src/ux-display.js` | ux-display 5 fail | 0 fail |
| Unit suites | — | — | 12 suites, 213 tests, 0 fail/todo/skip (baseline 202 -> 213, +11) |

RED/GREEN logs: `docs/dev-pipeline/receiver-ux-v2/red-logs/r12-a-r1/` and `.../r12-a-r2/` (real TAP output, UTF-8).

## 1. A-R1: report-degradation display semantics

Files: `web/desktop-recv/src/ux-view.js`, `tests/unit/ux-view.test.mjs`, `tests/unit/ux-telemetry.test.mjs`.

### 1.1 Code changes (ux-view.js)

- New `reportDegraded(progress)`: `progress.lastDataAtMs != null && progress.trustedAtMs != null && progress.lastDataAtMs > progress.trustedAtMs`. Model facts: a good report (single advancing or holding) refreshes `_trustedAtMs` to that frame's receivedAtMs; a data/artifact frame always advances `_lastDataAtMs` (ux-telemetry.js :223, :237-258). Therefore the inequality means the newest report degraded (empty/unavailable). Model and schema untouched.
- `projectProgress`: when `trusted === null/undefined || reportDegraded(progress)`, if `lastDataAtMs != null` return `{kind:'unavailable', ratio:null, asOfMs:null, stale:false, diagnosticCode:<degradation>}`; else `kind:'none'`. The code comes from the extracted shared helper `reportDegradationCode`: largest of REPORT_DEGRADATION_CODES in diagnostics (19001/19002/19003/19004/19015), 0 when none.
- `statusKeyFor`: recent data + degraded report -> `progress_unavailable` (after ambiguity, before `collecting_more`), matching frozen status priority item 4 (module-contract-error-matrix.md:157, cited by the verdict).
- Preserved: model untouched, `.6 -> empty -> .5` still locks 19006; completion and ambiguity branches run first; rate and frame/artifact results unaffected.

Note on scope: the lead message named only the `projectProgress` change; I also routed a degraded report to `progress_unavailable` in `statusKeyFor` because the verdict basis cites contract :157 (recent data + unavailable/empty -> progress_unavailable) and the old evidence criticizes `statusKey=receiving`. Same file, same view-side scope, no schema change.

### 1.2 Tests

- `ux-telemetry.test.mjs` UX-UT-023 rewritten (name unchanged, all original model assertions kept: trusted 0.6 kept, lastAdvance kept, no ambiguity lock, diagnostics once, .7 recovery advances lastAdvance=1500, .5 rollback locks 19006). Added model -> view assertions per report kind: kind 'unavailable', ratio/asOfMs null, stale false, diagnosticCode (0 for empty; 19002/19004/19015 as-is), statusKey 'progress_unavailable', copy `进度暂不可用` (never 60%); recovery -> estimate/0.7/asOfMs 1500/receiving/copy `重建估计约 70%`; rollback -> ambiguous/19006/progress_unknown/copy `进度无法判定`.
- `ux-view.test.mjs` adds R12-A-R1-1..6, all driven by real ReceiverTelemetry + readView with only input and clock controlled:
  1. `.6@1000 -> empty@1100`: unavailable, ratio null, copy not 60%, status progress_unavailable, no `60|%` in primary/secondary.
  2. `.6 -> unavailable(19004)@1100`: diagnosticCode 19004 and diagnosticCodes [19004].
  3. `.6 -> empty -> single .7@1300`: estimate, ratio .7, asOf 1300, receiving.
  4. `.6 -> empty -> single .5`: still 19006 (ambiguous / progress_unknown).
  5. Continuous single stream (6 rising + 1 equal): stays estimate each step.
  6. Degraded vs clean controls with identical bytes: rate (625 B/s, window 2000ms), elapsed, state, controls, save, observationRevision all equal.

### 1.3 Fixture-consistency fix (not an assertion loosening)

UX-UT-043 and UX-UT-047 (enoughObs) fixtures omitted `trustedAtMs` (base default 250) while `lastDataAtMs` was later. The real model cannot produce that with a good report (a good single refreshes trustedAtMs at the same frame), so under the new rule those fixtures correctly read as degraded. To keep the fixtures truthful to what they claim ("a trusted single with data flowing"), `trustedAtMs` now equals the frame time (UX-UT-043: 1000; UX-UT-047 enoughObs: 500). No assertion was changed.

### 1.4 RED evidence (before the fix)

- `node --test --test-reporter=tap web/desktop-recv/tests/unit/ux-view.test.mjs` -> `red-logs/r12-a-r1/ux-view-red.txt`: `# tests 23 / # pass 19 / # fail 4`. Failures R12-A-R1-1/2/3/6, each `expected 'unavailable' / actual 'estimate'`. R12-A-R1-4/5 are regression guards and passed as-is.
- Same command for `ux-telemetry.test.mjs` -> `red-logs/r12-a-r1/ux-telemetry-ut023-red.txt`: `# tests 22 / # pass 21 / # fail 1`, UX-UT-023 `expected 'unavailable' / actual 'estimate'`.
- First combined run of the three UX suites: 10 fail / 47 pass; the failing list maps one-to-one to the verdict counterexamples (.6 -> empty, .6 -> 19004, gate-swallowed 20%, Ready-inside-gate, failed paint, duplicate semantic paint).

### 1.5 GREEN evidence

- `node tools/desktop-recv/run-unit.mjs --all` -> `red-logs/r12-a-r1/run-unit-all-green.txt`: 12 suites, 213 tests, 0 failed/todo/skipped. ux-telemetry 22, ux-view 17 -> 23, ux-display 7 -> 12.
- Focused three suites: `node --test .../ux-view.test.mjs .../ux-display.test.mjs .../ux-telemetry.test.mjs` -> `# tests 57 / # pass 57 / # fail 0`.
- `python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py` -> exit 0, DESIGN_CONTRACT_SHAPES_PASS (20 definitions / 27 examples / 44 shape vectors / 6 interfaces / 15 diagnostics).
- Tool suites (unrelated but re-run on the same build): `node --test tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/process-guard.test.mjs tools/desktop-recv/tests/measure-ux.test.mjs` -> 61/61 pass.

## 2. A-R2 / B-01: display commit semantics, terminal convergence, lastBusiness

File: `web/desktop-recv/src/ux-display.js`; tests: `tests/unit/ux-display.test.mjs`.

### 2.1 Code changes

- `safePaint` returns a boolean: true on a real paint, false after queueing 19012. Nothing is committed on failure.
- `paintBusinessFrom`: compute sections first, never commit before painting. Only after a successful paint commit `lastBusiness` (primary/secondary/nextAction/save) and `announcedKey`; a failed paint leaves both untouched so the next sync retries the same content. Queued diagnostics are cleared only when they were included in a successful paint.
- `maybePaintTelemetryFrom(view, now, {force})`: compute the four texts and their diff first; identical text -> no write. If the 250ms gate blocks, return without committing anything (the next projection recomputes from the newest view). Only after a successful paint commit `lastTelemetry` fields and `lastTelemetryWriteAt = now`. A failed paint commits nothing and is retried next tick.
- Terminal convergence: when `context.state` leaves ACTIVE_STATES, `project()` calls `flushTerminalTelemetry` (force) before `scheduleFor` releases the timer. Exactly this one terminal write may cross the 250ms gate; it is idempotent because a painted projection leaves no diff, so a repeated identical terminal sync writes nothing. The shared 250ms boundary for events/ticks during active receiving is unchanged.
- `flushBusiness` (readView failure path) also clears the diagnostic queue only after a successful paint.
- Unchanged: single-flight refresher, owner-change reset, business/timer immediacy, no-rollback guard, final timer release.

### 2.2 Tests (ux-display.test.mjs, real createUxDisplay + controlled clock/paint/timers)

The shared paint recorder now records only successful paints (`calls` == painted payloads); a throwing paint is a refused write. This matches the new commit semantics; the seven existing display tests were re-traced and still pass.

1. `R12-A-R2-1`: t1000 baseline; t1100 a 20% change is swallowed by the gate and was never claimed as painted; t1250 tick paints the actual `progressText '重建估计约 20%'` and `elapsedText '0.3s'` (value assertions, not call counts).
2. `R12-A-R2-2`: t2000 active paint; t2100 Ready lands inside the gate -> terminal flush paints `重建完成` / empty rate / `1.1s`; timer count 0.
3. `R12-A-R2-3`: (A) converged terminal at 2100, later identical sync at 2600 adds no write; (B) a terminal flush that throws paints nothing and commits nothing, and the next sync at 2700 corrects it with the final values.
4. `R12-A-R2-4`: a telemetry paint that throws at t1300 is not remembered; t1600 retries and paints the same projection; the queued 19012 surfaces on the next announcement.
5. `R12-A-R2-5`: two identical syncs produce exactly one semantic business paint; a time-only tick never repaints semantics while numbers still advance.

### 2.3 RED evidence (before the fix)

- `node --test --test-reporter=tap web/desktop-recv/tests/unit/ux-display.test.mjs` -> `red-logs/r12-a-r2/ux-display-red.txt`: `# tests 12 / # pass 7 / # fail 5`.
- Failure signatures: R2-1 expected `'重建估计约 20%'` but the painted call lacked it (the swallowed value was cached as painted); R2-2 Ready kept the old `'重建估计约 20%'` progress; R2-3/R2-4 showed extra writes (failed/swallowed values counted); R2-5 expected 1 business paint, got 2 (lastBusiness never committed).

### 2.4 GREEN evidence

- `ux-display` -> 12/12 pass (`red-logs/r12-a-r2/ux-display-green.txt`).
- Full unit run (same as 1.5): `red-logs/r12-a-r2/run-unit-all-green.txt`, 12 suites / 213 tests / 0 fail.
- Throttle properties preserved: UX-UT-049 still asserts adjacent telemetry writes at least 250ms apart and business/terminal immediacy; UX-UT-048/050/051/052 and T20/T26 pass unchanged.

## 3. Shared verification summary

- `node tools/desktop-recv/run-unit.mjs --all`: exit 0. contracts 7, session 40, scheduler 6, worker 14, client 15, save 8, video 17, ui 13, evidence 36, ux-telemetry 22, ux-view 23, ux-display 12 = 213 tests, 0 failed / 0 todo / 0 skipped (baseline 202).
- Focused UX suites: 57/57 pass.
- `python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py`: exit 0 (DESIGN_CONTRACT_SHAPES_PASS).
- Tool suites: 61/61 pass.
- Working tree: only the five allowed files modified plus the two red-log directories added; verified with `git status --porcelain`. No commits made (lead-exclusive).

## 4. Honest leftovers

- Live field items were not executed in this batch: no browser/desktop E2E, no real screenshot or timeline re-verification of the terminal-convergence behavior, no real two-input feedback re-check. Per the verdict these belong on a new build: they are planned for B-R12-3 (new run root `20261026-teamexec-10`).
- The A-R1 DoD item "related UT/IAT and real two-input feedback re-verified on the post-remediation build" is therefore open until B-R12-3.
- UX-UT-023 (in ux-telemetry.test.mjs) now also projects the model through readView; the model suite imports `ux-view.js`. This is the intended combined-assertion shape the verdict asked for.
- The fixture-consistency fixes in UX-UT-043/047 are recorded in 1.3; no assertion text was changed anywhere.








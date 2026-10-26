# Round-12 B-R12-3 fix report (r2b): boundary-respecting terminal convergence

- Scope: only `web/desktop-recv/src/ux-display.js` and `web/desktop-recv/tests/unit/ux-display.test.mjs`. No commit.
- Problem: the B-R12-1 terminal convergence forced one numeric write across the shared 250ms gate. The frozen hard invariant `telemetryMinWriteIntervalMs=250` is unqualified, and the A/B live runs showed exactly one sub-250ms interval per round, on the last write.
- Ruling applied: satisfy both obligations at once. The final numbers still converge after Ready/Stopped, but only when the shared boundary is open; otherwise exactly one timer waits for the boundary and then paints. `uxDisplayTimersAfterTermination=0` still holds after convergence.

## 1. Code changes (ux-display.js)

- `maybePaintTelemetryFrom` no longer takes a `force` option. It returns an outcome: `painted` / `noop` / `blocked` / `failed` / `invalid`. Every numeric write still goes through the same `lastTelemetryWriteAt` gate, so the 250ms minimum interval holds by construction (there is no bypass left).
- New `timerMode`: `'refresh'` while an active state keeps its 250ms refresher, `'terminal'` while one convergence write waits for the boundary. A single `timerId` slot is shared; `releaseTimer()` clears both and cancels any pending convergence.
- `scheduleFor(state, now, outcome)`:
  - Active state: cancel a pending terminal wait, keep the one single-flight refresher (unchanged cadence).
  - Terminal state with `blocked`: if a terminal timer is already pending, return (no duplicate scheduling); otherwise arm exactly one timer for `250 - (now - lastTelemetryWriteAt)` ms.
  - Terminal state with `painted` / `noop` / `failed` / `invalid`: release the timer and do not re-arm. A failed convergence is retried by the next sync (never claimed as painted, no autonomous retry that would leave a timer after termination).
- The terminal timer callback re-runs `project()` at the boundary: elapsed is frozen at the endpoint and rate/progress are stable, so the re-projection equals the pending one and paints at a compliant interval; the following `scheduleFor` then sees `painted`/`noop` and releases the timer.
- Business sections still paint immediately on every terminal event (Ready copy, save phase, buttons); only the numeric region waits for the boundary.
- Owner change, `dispose` and `setVisible(false)` all go through `releaseTimer()` and therefore cancel a pending convergence; a stale terminal callback checks the owner seq and never writes.

## 2. Tests (ux-display.test.mjs)

The shared paint recorder now takes an optional clock and exposes `telemetryStamps()`: the wall-clock value of each successful numeric write. Interval assertions use these real write timestamps.

1. `R12-A-R2-2` updated: Ready inside the gate (t2100, last write t2000) -> no numeric write inside the boundary, one convergence timer; at t2250 the re-projection paints `重建完成` / empty rate / `1.1s`; `telemetryStamps` interval is exactly 250ms from the last write; timer count 0 after convergence.
2. `R12-A-R2-2b` new: terminal with the boundary already open (t1400 after a t1000 write) -> immediate flush, interval >= 250ms, no convergence timer.
3. `R12-A-R2-2c` new: repeated syncBusiness at t2150/2200/2249 while pending -> no duplicate scheduling (setTimer count unchanged), exactly one timer, no numeric write inside the boundary; one terminal numeric write total, timer 0 after convergence.
4. `R12-A-R2-2d` new: owner change cancels the pending convergence (the stale terminal callback writes nothing); dispose cancels a re-armed pending convergence.
5. `R12-A-R2-3` updated: (A) after boundary convergence, a later identical sync at 2600 adds no write and no timer; (B) a failed boundary flush paints nothing and leaves no timer, and the next sync at 2700 corrects it with the final values.
6. `UX-UT-049` adapted to the new contract: after Ready the receiving refresher is gone (its callback is undefined) and exactly one convergence timer remains; a Saving event still paints immediately and adds no new timer; a stale refresh tick writes nothing.
7. Preserved and green: R2-1 (gate-swallowed value painted on the tick), R2-4 (paint failure retry), R2-5 (one semantic paint per identical view), UX-UT-048/050/051/052, T20, T26, active-period 250ms cadence, single-flight, business immediacy.



# Run 20261029-teamexec-15 — round-18 re-verification (release 1.2.0)

Round-17 verdict (docs/dev-pipeline/ext-review/round-17-verdict.md) FAILED with
two blocking themes; this root carries the remediation evidence.

- A17-01: the default page-open verdict must carry the exact target URL and a
  launch association; title/page-count changes can never pass.
- B17-01: the native-dialog fallback must prove browser ownership before acting
  on a dialog.

## Identity

| Item | Value |
|---|---|
| attempt | candidate-20261029-02 |
| sourceRevision | 7e34289bd2f4754ea88dbd6ca5fa4e6867117499 (product source; unchanged) |
| harnessRevision | a38230e (see logs/tools-identity.json for the per-tool content SHAs) |
| product manifest | 7a5e5f1a4ac19825c7055ca6ea199d9f6e0914b24ba6b277243c38ff57fb0abf (identical to root13/root14: no product bytes changed) |
| input manifest | 0808a14a95fd… (paths rebound to this root; every files[] SHA re-hashed from this root's disk) |
| staging | build-desktop-recv/runs/20261029-teamexec-15/receiver — byte copy of the root14 candidate; all 27 manifest files re-hashed |
| fixtures | byte copies of the root14 trees (every files[] SHA re-verified) |

## Fixes under test

- `tools/desktop-recv/e2e/page-open-check.mjs` (new): `judgeDefaultPageOpen`
  passes only when the exact target URL is proven by (a) an Edge address bar
  after the launch with the URL absent from the pre-launch snapshot, or (b) an
  msedge-owned socket that dialed the run-time-free target port. Titles are
  diagnostics only. CLI guarded so importing run-e2e is unaffected.
- `tools/desktop-recv/e2e/run-e2e.mjs`: E2E-1's default launch takes a port
  that is TCP-free AND not displayed in any address bar at run time; pre/post
  UIA address-bar snapshots and an owner-resolved netstat watcher are recorded;
  engine-env.txt/page-open.json are written before any throw.
- `tools/desktop-recv/e2e/native-dialog.ps1`: one pure selection rule
  (Select-DialogRecords) serves both the live finder and the new
  `-Action dialog-selftest`; pass 2 accepts a dialog only when the process image
  is msedge.exe and its owner chain reaches a target pid.

## Commands executed

```powershell
node --test tools/desktop-recv/tests/measure-ux.test.mjs tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/process-guard.test.mjs   # 69/69
node tools/desktop-recv/e2e/page-open-check.mjs --selftest              # 8/8
pwsh -NoProfile -File tools/desktop-recv/e2e/native-dialog.ps1 -Action dialog-selftest -SelftestFile tools/desktop-recv/e2e/native-dialog-selftest.json   # 6/6
# log: logs/affected-checks.log (keeps the first run's UX-UT-081/082 failure:
# the new module's unguarded CLI block hijacked importing processes; fixed in a56e74c)
# machine reports: logs/page-open-check-selftest.json, logs/native-dialog-selftest-result.json

node tools/desktop-recv/e2e/run-e2e.mjs --context docs/tests/runs/20261029-teamexec-15/run-context.json --case E2E-1 --launcher-engine ps51
# PASS attempt E2E-1-2026-10-29T10-24-22-281Z-8589dc
# target http://127.0.0.1:8767/ (port picked free and NOT displayed at run
# time); pre snapshot had 11 address-bar values, none the target; the post
# snapshot still showed none (Windows' foreground lock opened the tab in the
# background), and the connection channel proved it: an msedge.exe socket
# ESTABLISHED to 127.0.0.1:8767. live+recorded and the external certutil SHAs
# all equal 2f5a22f9...

node tools/desktop-recv/e2e/run-e2e.mjs --context docs/tests/runs/20261029-teamexec-15/run-context.json --case E2E-2 --launcher-engine ps51
# PASS attempt E2E-2-2026-10-29T10-28-35-200Z-5f9ecd
# occupied port exit 3 readable -> clean relaunch exit 0 -> live save; external
# certutil equal. Both native dialogs resolved in pass 1 (target-owned pid), so
# no cross-process ownership line was exercised in this live run.
```

## Failed first attempt (preserved)

Attempt E2E-1-2026-10-29T10-09-23-203Z-d28bb1 failed with "the target URL was
not found in any address bar after the launch": the new URL requirement worked
as intended, but the launcher's tab opens in the background under the Windows
foreground lock, so no address bar showed it. Evidence preserved at
proof/E2E-1/fail-attempt-d28bb1/ and logs/E2E-1-fail-attempt.log. Fixed by
adding the connection channel (a38230e); the passing attempt above ran under it.

## Honest boundaries

1. E2E-1's page-open PASS rests on the connection channel, not an address bar:
   the tab is a background tab on this host. Both channels are URL-bearing and
   the port was free-and-undisplayed before the launch, so the association
   holds; the evidence records the empty address bars as-is.
2. The live cross-process (utility) dialog positive did not occur in this run —
   E2E-2's picker and save dialog were both target-owned. That positive is
   covered by the dialog-selftest case p1-target-utility-child-accepted
   (chain 333 -> 111, image msedge.exe) which drives the same production rule.
3. The matrix (12/12) was not re-run: round-17 closed it after running it
   against the current tool bytes. Unit suites 222 were not re-run: product and
   core tests unchanged; the affected tool suites (69) and both selftests ran.
4. root13/root14 stay read-only; their PS7/pass evidence remains valid because
   no product bytes changed.
5. E2E-35 / E2E-37 and the seven field journeys remain NOT_RUN by the user's
   standing decisions.

# Run 20261029-teamexec-16 — round-19 re-verification (release 1.2.0)

Round-18 verdict (docs/dev-pipeline/ext-review/round-18-verdict.md) FAILED with
two blocking themes; this root carries the remediation evidence.

- A18-01: the snapshot protocol lines are five fields (SNAP/SNAPW with a title
  that may contain '|'); the round-17 parser required six, so every address-bar
  record was dropped, and the TCP channel alone passed wrong pages/SYN_SENT.
- B18-01: Find-Dialog's pass-2 ownership diagnostics polluted the success
  return stream, so a legal utility dialog returned [String, element].

## Identity

| Item | Value |
|---|---|
| attempt | candidate-20261029-03 |
| sourceRevision | 7e34289bd2f4754ea88dbd6ca5fa4e6867117499 (product source; unchanged) |
| harnessRevision | cd53a20 (see logs/tools-identity.json for the per-tool content SHAs) |
| product manifest | 7a5e5f1a4ac19825c7055ca6ea199d9f6e0914b24ba6b277243c38ff57fb0abf (identical to root13..root15: no product bytes changed) |
| input manifest | 6fe9ce55e0ee… (paths rebound to this root; every files[] SHA re-hashed) |
| staging | build-desktop-recv/runs/20261029-teamexec-16/receiver — byte copy of the root15 candidate; 27/27 re-hashed |
| fixtures | byte copies of the root15 trees (every files[] SHA re-verified) |

## Fixes under test

- page-open-check.mjs: parseSnapshotLines (shared with run-e2e; SNAP/SNAPW/
  SNAPT with '|' in titles), URL-only verdict (exact target URL after the
  launch, absent before it; TCP auxiliary and never passing), selftest feeds
  RAW protocol lines through the real parser (8/8).
- run-e2e.mjs: tab-name protocol, activation of only the tab this launch added
  (per-window diff, SelectionItemPattern), receive legs bind the run-time port,
  and a profile-verified reclaim of a stale automation browser on the fixed
  CDP port (attempt ...-stale-cdp showed the attach-to-stale-browser trap).
- native-dialog.ps1: diagnostics moved to the console stream (Find-Dialog
  returns exactly one element); ownership accepts the journey's browser PROFILE
  (mkdtemp --user-data-dir) in addition to the pid/ancestor chain — the real
  picker's parent was the short-lived launched pid and had exited; hooks
  initialized under StrictMode; dialog-selftest 10/10 incl. the full
  Find-Dialog -> Find-ByName wrapper positive.

## Commands executed

```powershell
node --test tools/desktop-recv/tests/measure-ux.test.mjs tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/process-guard.test.mjs   # 69/69
node tools/desktop-recv/e2e/page-open-check.mjs --selftest              # 8/8 (raw lines -> parser -> judge)
pwsh -NoProfile -File tools/desktop-recv/e2e/native-dialog.ps1 -Action dialog-selftest -SelftestFile tools/desktop-recv/e2e/native-dialog-selftest.json   # 10/10
# log: logs/affected-checks.log; machine reports in logs/*-selftest*.json

node tools/desktop-recv/e2e/run-e2e.mjs --context docs/tests/runs/20261029-teamexec-16/run-context.json --case E2E-1 --launcher-engine ps51
# PASS attempt E2E-1-2026-10-29T12-11-32-658Z-2f9999
# target http://127.0.0.1:8768/ (8767 excluded: a stale tab displayed it);
# pre address bar held only 127.0.0.1:8767, post held exactly 127.0.0.1:8768
# (the tab became active by itself, so no activation was needed); the 4 TCP
# records are auxiliary. live+recorded+external certutil = 2f5a22f9...
# The receiver reclaimed the stale automation browser pid 79176 on CDP 9445
# (profile marker verified) before launching - see logs/E2E-1.log.

node tools/desktop-recv/e2e/run-e2e.mjs --context docs/tests/runs/20261029-teamexec-16/run-context.json --case E2E-2 --launcher-engine ps51
# PASS attempt E2E-2-2026-10-29T12-14-50-698Z-5cc6c5
# occupied port exit 3 readable -> clean relaunch exit 0 -> live save; the
# save-permission dialog was proven by pid-chain AND profile match
# (matchedBy=pid-chain profileMatch=True).
```

## Failed attempts (preserved)

| Attempt | Cause | Evidence |
|---|---|---|
| E2E-1 …-cc0973 | page-open worked (URL 127.0.0.1:8768 in the bar), but launchReceiver still bound the fixed PORT1 (8767, occupied) -> CONNECTION_REFUSED | proof/E2E-1/fail-attempt-cc0973/, logs/E2E-1-fail-attempt.log |
| E2E-1 …-strictmode | StrictMode threw on the unset selftest hook variables before any dialog search | proof/E2E-1/fail-attempt-strictmode/, logs/E2E-1-fail-attempt-strictmode.log |
| E2E-1 …-ownership-refused | the real picker's parent (the launched pid) had exited; chain-only ownership refused a dialog that belongs to this journey's browser (identified by its unique profile) | proof/E2E-1/fail-attempt-ownership-refused/, logs/E2E-1-fail-attempt-ownership.log |
| E2E-1 …-stale-cdp | the previous failed journey's automation Edge still held CDP 9445; the new launch attached to that stale browser and its dialogs were refused | proof/E2E-1/fail-attempt-stale-cdp/, logs/E2E-1-fail-attempt-stale-cdp.log |

## Honest boundaries

1. In the passing E2E-1 the launcher's tab became the active tab by itself, so
   the address-bar channel carried the URL directly and no activation was
   needed; the activation path exists for the background-tab case and is
   exercised by findNewTab/activateEdgeTab wiring but was not triggered here.
2. The dialog selftest's wrapper positive runs the real Find-Dialog ->
   Find-ByName with only the UI root and the CIM chain replaced; the real E2E
   dialogs resolved in pass 1 (target pid) or via pid-chain+profile, and the
   cross-process chain-only positive remains covered by the selftest case
   p1/p3 rather than a live dialog.
3. The matrix (12/12) and unit suites (222) were not re-run: the matrix tool
   and product bytes are unchanged since round-17's live run; the affected tool
   suites (69) and both selftests ran.
4. root13..root15 stay read-only; PS7/pass evidence remains valid because no
   product bytes changed.
5. E2E-35 / E2E-37 and the seven field journeys remain NOT_RUN by the user's
   standing decisions.

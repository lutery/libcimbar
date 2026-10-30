# Run 20261029-teamexec-14 — round-17 re-verification (release 1.2.0)

Round-16 verdict (docs/dev-pipeline/ext-review/round-16-verdict.md) FAILED with
two blocking themes; this root carries the remediation evidence.

- A16-01: the full E2E-1/E2E-2 journeys under real Windows PowerShell 5.1.
- A16-02 / B-R16-1: the launch matrix must never stop a process it did not
  create (identity-verified cleanup, refusals, guard cases).

## Identity

| Item | Value |
|---|---|
| attempt | candidate-20261029-01 |
| sourceRevision | 7e34289bd2f4754ea88dbd6ca5fa4e6867117499 (product source; unchanged) |
| harnessRevision | 58dd622d7482f6729c7dc16b809274f30d64d709 (ps51 engine mode + share-picker fix + launch-scoped page-open evidence) |
| product manifest | 7a5e5f1a4ac19825c7055ca6ea199d9f6e0914b24ba6b277243c38ff57fb0abf (identical to root13: the remediation touched no product bytes) |
| input manifest | a71a787f0cc1253ea382b84bedd3df833159627b84e072b4f72ace3b75e90ec0 |
| staging | build-desktop-recv/runs/20261029-teamexec-14/receiver — byte-for-byte copy of the root13 candidate; all 27 manifest files re-hashed |
| fixtures | byte-for-byte copies of the root13 trees (every files[] SHA re-verified against this root) |

## Commands executed

```powershell
# green sweep (harness ae6f1ae; the two later commits change only E2E harness
# files, which the E2E runs below exercise end-to-end)
node tools/desktop-recv/run-unit.mjs --all                       # 12 suites, 222 tests, 0 failed
node --test tools/desktop-recv/tests/measure-ux.test.mjs tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/process-guard.test.mjs   # 69/69
python tools/desktop-recv/tests/ux-evidence-selftest.py          # 77 cases PASS
python tools/desktop-recv/verify-evidence-selftest.py            # 14 cases PASS
python tools/desktop-recv/e2e/video-prefix-check.py --selftest   # 3/3 PASS
python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py   # DESIGN_CONTRACT_SHAPES_PASS
# log: logs/green-sweep.log

# launch matrix (12 cases, toolSha256 509c671041f6dfa1a1f6dc42583f54daff8b1bd602171e9a42ae42524b4912f0)
node tools/desktop-recv/e2e/ps51-launch-check.mjs --staging build-desktop-recv/runs/20261029-teamexec-14/receiver --run-id 20261029-teamexec-14
# 12/12 PASS; verified cleanup in a/b/c/h4; refusals d/e/f/g/h1/h2 (no server pid) and h3 (identity mismatch, decoy survived)
# log: logs/ps51-launch-check.json|log

# E2E-1 under real Windows PowerShell 5.1 (pwsh hidden from the child PATH)
node tools/desktop-recv/e2e/run-e2e.mjs --context docs/tests/runs/20261029-teamexec-14/run-context.json --case E2E-1 --launcher-engine ps51
# PASS attempt E2E-1-2026-10-29T07-49-08-344Z-363db1
# engine-env: PowerShell 5.1.22621.6133, where pwsh exit 1 under the child PATH,
# launcher's powershell.exe process captured, default launch (no -NoBrowser)
# with page-open evidence (pre/post windows: a new tab opened), live+recorded
# SHA 2f5a22f9... equal, external certutil equal

# E2E-2 under the same engine (failure -> recovery -> live save)
node tools/desktop-recv/e2e/run-e2e.mjs --context docs/tests/runs/20261029-teamexec-14/run-context.json --case E2E-2 --launcher-engine ps51
# PASS attempt E2E-2-2026-10-29T07-51-42-280Z-5d7e6e
# occupied port exit 3 with a readable reason; clean relaunch exit 0; live SHA equal; external certutil equal
```

## Failed first attempt (preserved)

The first E2E-1 ps51 attempt (attempt E2E-1-2026-10-29T07-39-53-727Z-766581)
failed at the capture picker: the native-dialog helper's share-name test
matched a bare 'share' substring and drove an unrelated Chrome window whose
title contained "a-share-mcp"; its retry confirmed the real picker 10 s after
the 30 s page wait expired. Evidence is preserved at
proof/E2E-1/fail-attempt-766581/ (launch-log, observation, results snapshot).
Fix: 11b449b (real picker titles + target-pid preference) and 58dd622
(launch-scoped page-open evidence: fast browser-process poll and a pre/post
window diff so a stale window cannot vouch for this launch). The passing
attempts above ran under 58dd622.

## Tool identity (round-16 S16-02)

logs/tools-identity.json lists the content SHA-256 of ps51-launch-check.mjs,
run-e2e.mjs, run-context.mjs, evidence.mjs, process-guard.mjs and
native-dialog.ps1 at harnessRevision 58dd622; the matrix JSON additionally
carries its own toolSha256.

## Boundaries

- root13 (20261028-teamexec-13) stays read-only; its PS7 E2E evidence remains
  valid because the launch files are byte-identical (product manifest unchanged).
- E2E-35 / E2E-37 and the seven field journeys remain NOT_RUN by the user's
  standing decisions; this root does not change them.

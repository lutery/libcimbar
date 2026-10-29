# Run 20261029-teamexec-17 — round-20 re-verification (release 1.2.0)

Round-19 verdict (docs/dev-pipeline/ext-review/round-19-verdict.md) FAILED with
one new blocking theme (A19-01 = B19-01, deduped): the CDP reclaim stopped any
process whose command line merely contained the `cimbar-e2e-` marker.

## Identity

| Item | Value |
|---|---|
| attempt | candidate-20261029-04 |
| sourceRevision | 7e34289bd2f4754ea88dbd6ca5fa4e6867117499 (product source; unchanged) |
| harnessRevision | 18b7c22 (per-tool SHAs in logs/tools-identity.json) |
| product manifest | 7a5e5f1a4ac19825c7055ca6ea199d9f6e0914b24ba6b277243c38ff57fb0abf (unchanged) |
| input manifest | d4624727633d… (paths rebound; every files[] SHA re-hashed) |
| staging / fixtures | byte copies of root16 (27/27 product files and every fixture SHA re-verified) |

## Fix under test (the minimal fix the verdict allows)

`reclaimStaleAutomationBrowser` is deleted. A busy CDP port now raises a
read-only refusal (`assertCdpPortFree`) that names the occupant's pid, image
and command line and leaves it untouched; the operator must verify and stop a
stale harness browser themselves. No marker/substring test exists in the
preflight, and no Stop-Process call remains in it (checked by reading the whole
function: grep over `assertCdpPortFree` finds none).

## Three legs through the REAL production entry

```powershell
node tools/desktop-recv/e2e/run-e2e.mjs --context docs/tests/runs/20261029-teamexec-17/run-context.json --case E2E-1 --launcher-engine ps51
```

| Leg | Setup | Result |
|---|---|---|
| Refusal A: unrelated python | our own `python <TEMP>\cimbar-e2e-demo\unrelated-server.py --port 9445` (marker only as a script path) held CDP 9445 | attempt `…9235f6` FAIL with `receiver: CDP port 9445 is occupied by pid 63048 (python.exe\|"D:\ProgramData\anaconda3\python.exe" …cimbar-e2e-demo\unrelated-s…`; the occupant was **still alive** after the refusal; we then stopped it by our own handle |
| Refusal B: foreign real Edge | `msedge --user-data-dir=%TEMP%\cimbar-e2e-foreign-<guid> --remote-debugging-port=9445` (ordinary args, marker-ish profile name) | attempt `…9458d9` FAIL with `receiver: CDP port 9445 is occupied by pid 95728 (msedge.exe\|"C:\Program Files\…`; the foreign instance was **still alive** after the refusal; stopped afterwards only after its exact unique profile path was verified |
| Normal leg | CDP 9445 free | attempt `E2E-1-2026-10-29T14-48-12-018Z-7d9540` PASS: address-bar URL `127.0.0.1:8768` (8767 excluded as displayed), pre-bar only `127.0.0.1:8767`, live/recorded/external SHAs equal |

A first normal-leg attempt `…763ff6` also passed (the first occupier launch had
failed to bind because Start-Process split the inline python program); it is
kept under proof/E2E-1/normal-pass/.

Evidence per leg: `proof/E2E-1/refusal-python/`, `proof/E2E-1/refusal-foreign-edge/`
(each with results.json, refusal.log, refusal-message.txt), and the final
`proof/E2E-1/` (page-open.json, engine-env.txt, external-sha.txt). Console
logs: `logs/E2E-1-refusal-python.log`, `logs/E2E-1-refusal-foreign-edge.log`,
`logs/E2E-1.log`.

## Text correction (verdict item 4)

The earlier "profile marker verified" wording described a substring test, not
ownership; it is removed from the code path and replaced by the refusal text.
The round-19 ledger and summary carry the correction.

## Affected checks

`logs/affected-checks.log`: tool suites 69/69, page-open selftest 8/8,
dialog selftest 10/10. Matrix 12/12 and unit 222 were not re-run (unchanged
tools/product; the verdict asks only for the reclaim/refusal legs).

## Boundaries

- E2E-35/37 and the seven field journeys remain NOT_RUN (user's decisions).
- root13..root16 stay read-only; product bytes unchanged.
- The refusal legs' console stderr is empty by design: the runner records the
  refusal in results.json notes, quoted verbatim in each refusal-message.txt.

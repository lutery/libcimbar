# Real local E2E harness (round-1 review A-01)

Dev-only. Drives the **real** receiver and the **real** sender in real Edge
windows, with real OS dialogs. Nothing here ships in the receiver package.

## What is real

| Piece | How |
|---|---|
| Sender | The original project sender (`build-desktop-recv/staging/sender`), real Edge window, real `<input type=file>` |
| Screen capture | Real `getDisplayMedia`; the sender window is auto-selected by its runtime `document.title` (`--auto-select-desktop-capture-source`), or by the real picker driven through `native-dialog.ps1 -Action share` |
| Receiver | `build-desktop-recv/staging/receiver` served on loopback (refreshed by `stage.ps1 -Mode development`) |
| Import | Real `<input type=file>` via Playwright `setInputFiles` (browser-level equivalent of picking a file) |
| Save | Real `showSaveFilePicker` dialog; `native-dialog.ps1 -Action save` only types the path and clicks the dialog's own Save button. The dialog and the file write are genuine |
| Hashes | Node `crypto` (outside the app) over the original and the saved file |

## Setup

```
cd tools/desktop-recv/e2e
npm install        # playwright-core, pinned in package.json
```

Edge must be installed (`channel: 'msedge'`); no browser download happens.

## Run (stage-5 context entry point)

Every receiver-ux-v2 command requires a validated `run-context.json` and only
writes inside that context's own roots; the actual command recipes are in the
"Stage-5 run context" section below.

## Notes

- Native dialogs are Windows UI Automation windows: the script waits for the
  dialog belonging to the Edge process, sets the file-name edit, and invokes
  the confirm button. If the dialog does not appear within the timeout the
  helper exits 1 and the scenario fails — it never fabricates a save.
- A scenario that cannot be reproduced safely (e.g. a real OS-level fault)
  must be recorded as NOT_RUN or covered by an IAT with an explicit scope
  note; it is never silently marked PASS.

## Stage-5 run context (receiver-ux-v2)

Every tool below takes an explicit, validated `run-context.json`; there is no
fallback to the historical run-03 root, the shared staging directory or the v1
planning file. The context is parsed by one module, `run-context.mjs`, shared
by the runner and the recorder.

```
node tools/desktop-recv/e2e/run-e2e.mjs --context <run-context.json> --case <id|group>
node tools/desktop-recv/e2e/run-e2e.mjs --context <json> --validate-only   # identity JSON, no side effects
node tools/desktop-recv/e2e/record-sender.mjs --context <run-context.json> --only full
node tools/desktop-recv/e2e/record-sender.mjs --context <json> --only last --payload-file <input>
pwsh -NoProfile -File tools/desktop-recv/stage.ps1 -RunId <id> -Mode development -StagingRoot <receiver-root>
python tools/desktop-recv/verify-ux-evidence.py --context <run-context.json> --gate local|field
```

`run-context.json` top-level fields (exactly): `version=1, iterationId=receiver-ux-v2,
runId, attemptId, phase, runRoot, stagingRoot, fixtureRoot, planningFile,
methodFile, productManifest, productManifestSha256, sourceRevision,
harnessRevision, inputManifest, inputManifestSha256, legacyThresholdFile`.
`phase` is one of baseline/slice/metrics/media/final/field. Every non-null path
is a canonical repository-relative path; `runRoot` must be
`docs/tests/runs/<runId>`, `stagingRoot` under `build-desktop-recv/runs/<runId>`,
`fixtureRoot` under `runRoot`. Historical runs, the shared staging root, path
escapes (lexical or via links), and a resume with a different
runId/phase/manifest/attempt are refused. Product manifests are re-hashed from
the staged files, never trusted as labels.

UX acceptance evidence lives in `ux-results.json` (own schema, not the v1
Evidence file); `verify-ux-evidence.py` checks the frozen v2 plan's required
UX ids per gate, the per-record plan contract (scope/executor/caseType/AC),
proof references under `proof/<caseId>/<attemptId>/`, assertion-level PASS
with proof files, on-disk hashes for file roundtrips, and finally runs the
legacy `verify-evidence.py` gate on `results.json`. `UX-SLICE`, `UX-IAT`,
`UX-MEDIA-SAVE`, `UX-UI` and `UX-ALL` are registered entry points that
currently exit 4 (not implemented); they never record a PASS.

## Historical diagnostics (do not run)

The files `smoke-live.mjs` and `probe-*.mjs` predate receiver-ux-v2. They are
historical scaffolding, NOT v2 acceptance entry points:

- `smoke-live.mjs` writes into the FROZEN run `docs/tests/runs/20261019-teamexec-02`.
  Running it mutates a read-only historical run; it now refuses to start
  unless the explicit `--legacy-write-frozen-run` switch is passed, and even
  then only for historical traceability.
- `probe-*.mjs` are throwaway capture/save probes used during the original
  harness bring-up. They are read-only kept for context and must not be used
  to produce acceptance evidence.

For all receiver-ux-v2 work use the context commands above. `stage.ps1`
development mode keeps its legacy shared-staging default for the historical
runbook commands; every v2 invocation passes an explicit `-StagingRoot` under
the run's own `stagingRoot` (the context roots are authoritative).

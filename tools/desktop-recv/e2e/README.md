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

## Run

```
node tools/desktop-recv/e2e/smoke-live.mjs     # one live roundtrip smoke
```

Outputs go to `docs/tests/runs/20261019-teamexec-02/proof/` and the run's
`results.json`. The receiver server and the sender HTTP server are started
and stopped by the script.

## Notes

- Native dialogs are Windows UI Automation windows: the script waits for the
  dialog belonging to the Edge process, sets the file-name edit, and invokes
  the confirm button. If the dialog does not appear within the timeout the
  helper exits 1 and the scenario fails — it never fabricates a save.
- A scenario that cannot be reproduced safely (e.g. a real OS-level fault)
  must be recorded as NOT_RUN or covered by an IAT with an explicit scope
  note; it is never silently marked PASS.

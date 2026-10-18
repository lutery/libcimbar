# UAT-L01 / UAT-L02 — independent entry and startup recovery

| Item | Value |
|---|---|
| runId | `20261018-teamexec-01` |
| executedAt | 2026-10-18T16:0x+08:00 (recorded during the browser run) |
| page | `http://127.0.0.1:8766/` |
| browser | Chromium (Playwright), headful, `Cache-Control: no-store` |
| launch | `pwsh -NoProfile -File launch.ps1 -Port 8766 -NoBrowser` → exit 0, HTTP 200 |

## UAT-L01 — clean first start

Observed in the browser after load:

```
title      : Cimbar Desktop Receiver
status     : Ready to receive
mode       : Mode B
caps banner: hidden (no missing capability on localhost)
buttons    : live=enabled video=enabled stop=disabled save=disabled
service worker registrations: 0
console errors: 0
```

The page starts with no manual path edits, no console errors and no Service
Worker registration. Button state matches `deriveControls` for Idle.

Proof: `proof/uat-l01-entry.png`.

## UAT-L02 — startup failure recovery

| Case | Command | Observed |
|---|---|---|
| port already in use | second `launch.ps1 -Port 8766` | exit **3**, message `port 8766 is already in use; stop the other process or pass -Port <other>` |
| missing required files | `launch.ps1` in a directory with only `launch.ps1` + `server.py` | exit **4**, message `missing required file: index.html` |
| python unavailable | code path in `launch.ps1` (checked before start) | exit **2**, message names Python and the manual alternative |

No unrelated processes are killed: the port check uses a loopback
`TcpListener` and only reports.

## Not covered here

- Selecting a source and the permission prompt are UAT-L03+ / E2E-3 (T2.1.b).
- The page's video import path is exercised after the frame scheduler lands.

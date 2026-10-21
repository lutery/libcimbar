# Cimbar Desktop Receiver

Receives a file from an animated cimbar code shown in another window — for
example a cloud desktop you are viewing through Citrix — without using a phone
camera.

## Run

1. Extract the package to any folder. ASCII, spaces, and CJK characters in
   the path are all fine - see the note below.
2. Start it by running `launch.cmd` (double-click, or from a terminal). It
   changes into the package folder and starts the local server; your browser
   opens `http://127.0.0.1:8766/`. Options pass through, e.g.
   `launch.cmd -Port 8767 -NoBrowser`.

   Equivalent: `pwsh -NoProfile -File launch.ps1` (also from any path).

3. Click **Share a window or screen** and pick the window that shows the code,
   or **Import a recording** to decode a video you recorded earlier.
4. When the file has been rebuilt, click **Save file…**.

## Notes

- Path correction (2026-10-21): an earlier revision of this file claimed
  that a path mixing CJK characters and spaces breaks the launcher and that
  pwsh cannot load `launch.ps1` from such a directory by any invocation
  form. That attribution was wrong. The failure came from our own test
  invocation chain, which had copied the package to a GBK-mojibake twin
  directory while the launcher was invoked with the intended codepoints;
  pwsh then reported the genuinely missing file as "cannot be recognized as
  a script file name". The same-machine counterexample and the full E2E-1
  re-run (both `launch.cmd` and absolute `pwsh -File`) pass from a
  CJK+space directory; evidence under
  `docs/tests/runs/20261019-teamexec-02/proof/E2E-1/`. Commit 8c59864 keeps
  the historical (incorrect) attribution.

- The server listens on `127.0.0.1` only and never registers a Service Worker.
- Screen capture and the save picker need a secure context; `localhost` counts.
- This build supports **mode B**. If the sender uses another mode, the frame
  counter stays at zero — check that the sender matches. Note the sender's
  in-page mode switch does not restore a working stream after leaving mode B;
  reload the sender page (its selector defaults to B) if you changed it.
- If the port is busy, start with another one: `launch.cmd -Port 8767`.
- If the server cannot start, the launcher waits for the loopback port, then
  exits non-zero (code 5) and prints the child process error plus the path of
  its diagnostic logs; it never reports success without a listening server.
- If no frames are decoded, make sure the sender window is fully visible and
  not scaled down by the remote-desktop client.

# Cimbar Desktop Receiver

Receives a file from an animated cimbar code shown in another window — for
example a cloud desktop you are viewing through Citrix — without using a phone
camera.

## Run

1. Extract the package to a folder whose path stays ASCII (spaces are fine;
   avoid mixing non-ASCII characters into the path - see the note below).
2. Start it by running `launch.cmd` (double-click, or from a terminal). It
   changes into the package folder and starts the local server; your browser
   opens `http://127.0.0.1:8766/`. Options pass through, e.g.
   `launch.cmd -Port 8767 -NoBrowser`.

   Equivalent on ASCII paths: `pwsh -NoProfile -File launch.ps1`.

3. Click **Share a window or screen** and pick the window that shows the code,
   or **Import a recording** to decode a video you recorded earlier.
4. When the file has been rebuilt, click **Save file…**.

## Notes

- Path caveat (verified on Windows 11, pwsh 7.6.7, system UTF-8 codepage,
  zh-CN locale): a package directory whose path mixes CJK characters and
  spaces breaks the launcher - pwsh cannot load `launch.ps1` from such a
  directory by ANY invocation form (absolute `-File`, relative `-File`
  after cd, `-Command` with Set-Location). Extract to an ASCII path.

## Notes

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

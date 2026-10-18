# Cimbar Desktop Receiver

Receives a file from an animated cimbar code shown in another window — for
example a cloud desktop you are viewing through Citrix — without using a phone
camera.

## Run

1. Extract the package to any folder (spaces and non-ASCII names are fine).
2. Start it:

   ```
   pwsh -NoProfile -File launch.ps1
   ```

3. Your browser opens `http://127.0.0.1:8766/`.
4. Click **Share a window or screen** and pick the window that shows the code,
   or **Import a recording** to decode a video you recorded earlier.
5. When the file has been rebuilt, click **Save file…**.

## Notes

- The server listens on `127.0.0.1` only and never registers a Service Worker.
- Screen capture and the save picker need a secure context; `localhost` counts.
- This build supports **mode B**. If the sender uses another mode, the frame
  counter stays at zero — check that the sender matches.
- If the port is busy, start with another one: `launch.ps1 -Port 8767`.
- If no frames are decoded, make sure the sender window is fully visible and
  not scaled down by the remote-desktop client.

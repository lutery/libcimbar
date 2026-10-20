# Batch L status - real local E2E (run 20261019-teamexec-02)

Updated: 2026-10-20. Source of truth for executed records is `results.json`;
this page summarizes what ran, what did not, and why.

## Executed and PASS

| Journey | Scope of the run |
|---|---|
| E2E-3 | live roundtrips, compressible + incompressible, 3 rounds each (6) |
| E2E-4 | real source picker cancelled, then restart + roundtrip |
| E2E-5 | blank (non-encoding) window, no artifact, stop, reselect + roundtrip |
| E2E-7 | stop spam converges once; fresh session for another file is clean |
| E2E-11 | save dialog cancelled, same artifact saved on retry |
| E2E-12 | CJK/space name: cancel + sentinel intact; overwrite refused in-dialog, then saved under the renamed CJK name (one dialog session) |
| E2E-13 | save disabled while the picker is open; one real save; recorded PASS |
| E2E-14 | REAL sender-window recordings (V-GOOD-C/N), 3 rounds each (6) |
| E2E-15 | empty / non-video / corrupt containers fail finitely; real recording recovers |
| E2E-19 | relay: refresh + page reopen + receiver server restart roundtrips |
| E2E-20 | 10 alternating rounds (live + recorded), every output hashed |

Every PASS above has real artifacts under `proof/<case>/` and external
SHA-256 equality (the gate recomputes the hashes from the files).

## Executed and FAIL (honest)

| Journey | Finding |
|---|---|
| E2E-16 | V-SHORT (400 ms) and V-LAST-without (12 s) correctly end Incomplete, but the complete recording of a 512 KiB random payload also fails to complete. Registered as TD-15 (recorded-video import quality/yield limit); the per-frame import fix is in, the file-quality ceiling remains. See `proof/E2E-16/round-with/observation.txt`. |

## Not executed in this round

| Journey | Why |
|---|---|
| E2E-1 | candidate-package first-launch journey not yet automated end to end |
| E2E-2 | startup-failure recovery (launcher exit codes verified manually in C-01; journey form pending) |
| E2E-6 | stop sharing from the system indicator bar not yet automated |
| E2E-8 | sender mode-mismatch journey not yet automated |
| E2E-9 | DPI/zoom matrix not yet automated |
| E2E-10 | occlusion/minimize journey not yet automated |
| E2E-17 | long-recording midway stop: the large recording session dies before the stop point |
| E2E-18 | 1 MiB incompressible live roundtrip; PASS in results.json |

## Environment notes (reproducible facts)

- The receiver must be a NORMALLY launched Edge attached over CDP: a
  Playwright-launched Edge cannot start cross-window capture on this host
  (NotReadableError).
- Chromium only opens the capture picker and the save dialog while its
  window is the active OS window; the harness wakes the window
  (AttachThreadInput + one real click) before every dialog, which is
  reliable but not perfectly deterministic on this desktop.
- Native dialogs are driven with Win32/UIA (clipboard paste into the
  classic #32770 file dialog, IDOK, overwrite refusal); the dialog and the
  write are real.
- The save-overwrite confirmation ("确认另存为") is a DirectUI task dialog,
  not a classic dialog: its 是(&Y)/否(&N) buttons are Button-class children
  with control id 0 behind CtrlNotifySink hosts, invisible to GetDlgItem and
  to UIA. The helper finds them by window text and clicks BM_CLICK, with the
  dialog's own Alt mnemonic (Alt+Y/N) as the keyboard fallback. This was the
  real cause behind the earlier E2E-12 "app stuck at Saving…" refusals.

## Product defects found and fixed by this run

- 468428c: SaveController stored the unbound global setTimeout; every real
  save crashed with "Illegal invocation" and was reported as 16003.
- 648dacb: the preview element was hidden during recorded import, so the
  per-frame callback never fired; the preview is now visible for video
  sessions.
- 16c367d: a recording imported after a live round kept the old
  MediaStream via srcObject and failed with a spurious 13005.
- eb80706: recorded import now plays every frame (rVFC) instead of
  1/15 s seek-stepping (TD-15).

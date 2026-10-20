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
| E2E-17 | dual-input stop switching: video A stopped mid-way -> live B hash-clean; live A stopped mid-capture -> video B saved hash-clean |
| E2E-14 | REAL sender-window recordings (V-GOOD-C/N), 3 rounds each (6) |
| E2E-15 | empty / non-video / corrupt containers fail finitely; real recording recovers |
| E2E-16 | recorded-EOF/final-frame pair at a 128 KiB incompressible payload: V-SHORT not Ready; V-LAST-without (6 s early portion of the same send) ends Incomplete; V-LAST-with (40 s full send) completes and saves hash-clean |
| E2E-19 | relay: refresh + page reopen + receiver server restart roundtrips |
| E2E-20 | 10 alternating rounds (live + recorded), every output hashed |
| E2E-18 | 1 MiB incompressible live roundtrip; PASS in results.json |
| E2E-2 | occupied-port launch exits 3 with a readable reason; clean relaunch + live roundtrip hash-clean |
| E2E-6 | same-name/same-size A/B: external ends (tab close, window close) settle Incomplete with no phantom artifact; each new session saves hash-B |
| E2E-8 | 4C sender (outside the verified set): no false Ready in 30 s; recovery via sender reload hash-clean (see FAIL notes) |
| E2E-9 | default + window-resize + receiver render-scale 1.5 legs all hash-clean; OS display scaling not covered (matrix claims no such combo) |
| E2E-10 | receiver-in-front roundtrip; sender minimized mid-capture 15 s = no false Ready; restore saves hash-clean |

Every PASS above has real artifacts under `proof/<case>/` and external
SHA-256 equality (the gate recomputes the hashes from the files).

## Executed and FAIL (honest)

| Journey | Finding |
|---|---|
| E2E-1 | pwsh 7 无法从「CJK+空格」目录加载启动脚本（Node 探针验证，非shell污染证据）：绝对 `-File`（首跑，exit 64）、相对 `-File`（cd 后）、env + `Set-Location` + `&` 全部失败；同宿主 pwsh 对正常 ASCII 路径工作正常。cpSync 版包内容正确、文件齐全。修复需平台/打包层（用户侧建议：解压到 ASCII 路径，README 已注明）；launch.cmd shim 保留供正常环境使用。见 `proof/E2E-1/`。注意：早期部分手工矩阵证据被本机交互 shell 的 CJK 乱码污染，已用 Node 探针（全 ASCII 源码 + 码点构建路径）重验并以探针结果为准。 |

The E2E-8 PASS record carries a PRODUCT FINDING: flipping the sender's
in-page mode selector back to B restores the UI class but NOT a decodable
stream (receiver frame-starved 180 s in two runs); recovery works via a
sender page reload (the selector's default is B). Evidence in
`proof/E2E-8/` and the results.json notes.

## Not executed in this round

(none - all 20 local journeys have executed records; E2E-1 is the single
honest FAIL, see above. E2E-21..26 remain field journeys for the user.)

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

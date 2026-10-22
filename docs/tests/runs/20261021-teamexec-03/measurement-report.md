# Measurement report — 20261021-teamexec-03

Performance: NOT_EVALUATED (thresholds not frozen (V-002/V-003 pending); this tool reports measurements only)

## Boundary definitions

| boundary | definition |
|---|---|
| initStartAt | decoder-client init start (__journey.initStartAt, before the Worker is created) |
| initReadyAt | decoder client.init() resolved (__journey.initReadyAt) |
| decoderInit | decoderInitMs = initReadyAt - initStartAt |
| sourceWait | sourceWaitMs = validInputStartAt - initReadyAt (capture/recording start, picker included) |
| validInputStart | the first frame from the selected source accepted by the session (state -> Receiving; for a recording, the first frame actually presented) |
| initTotal | initMs = validInputStartAt - initStartAt (decoder init + source wait) |
| reconstruction | reconstructMs = reconstructionDoneAt - validInputStartAt: fountain decode + decompress |
| totalToReady | totalToReadyMs = reconstructionDoneAt - initStartAt |
| saveRequestAt | SaveController 'selecting' fired (__journey.saveRequestAt) - the save click moment |
| createWritableAccessedAt | the save handle's createWritable getter was accessed (picker resolved) |
| writableAt | createWritable() promise settled (the writable stream exists) |
| writeCloseAt | 'saved' event: write() and close() both resolved |
| pickerWait | pickerWaitMs = createWritableAccessedAt - saveRequestAt (the user picks a path) |
| writableOpen | writableOpenMs = writableAt - createWritableAccessedAt |
| saveWait | saveWaitMs = writableAt - saveRequestAt (picker + open, NO write) |
| saveWrite | saveWriteMs = writeCloseAt - writableAt (the actual write + close) |
| save | saveMs = writeCloseAt - saveRequestAt (whole save = saveWait + saveWrite) |

## Per-leg measurements

### live / compressible / 1MiB

| case | attempt | leg | status | raw B | stream B | artifact B | decoder init ms | source wait ms | init ms | reconstruct ms | total->ready ms | picker wait ms | writable open ms | save wait ms | save write ms | save ms | save timings | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | E2E-18-2026-10-22T07-11-31-383Z-d21d32 | live-c-1mib | PASS | 1048576 | 3354 | 1048576 | 120 | 3971 | 4091 | 249 | 4340 | 4914 | 6 | 4920 | 108 | 5028 | True | True | live capture roundtrip; proof proof/E2E-18/round-live-c-1mib/received.bin |

### live / compressible / 20MiB-over-budget

| case | attempt | leg | status | raw B | stream B | artifact B | decoder init ms | source wait ms | init ms | reconstruct ms | total->ready ms | picker wait ms | writable open ms | save wait ms | save write ms | save ms | save timings | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | E2E-18-2026-10-22T07-11-31-383Z-d21d32 | live-c-20mib-over-budget | PASS | 20971520 | - | - | 398 | 3232 | 3630 | 138 | 3768 | 4867 | 7 | 4874 | 152 | 5026 | True | True | budget 16777216 (build-desktop-recv/staging/receiver/config/profile.json); rejection then stop then hash-clean normal-file recovery |

### live / compressible / 4MiB

| case | attempt | leg | status | raw B | stream B | artifact B | decoder init ms | source wait ms | init ms | reconstruct ms | total->ready ms | picker wait ms | writable open ms | save wait ms | save write ms | save ms | save timings | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | E2E-18-2026-10-22T07-11-31-383Z-d21d32 | live-c-4mib | PASS | 4194304 | 13338 | 4194304 | 453 | 3572 | 4025 | 319 | 4344 | 4332 | 1 | 4333 | 135 | 4468 | True | True | live capture roundtrip; proof proof/E2E-18/round-live-c-4mib/received.bin |

### live / incompressible / 1MiB

| case | attempt | leg | status | raw B | stream B | artifact B | decoder init ms | source wait ms | init ms | reconstruct ms | total->ready ms | picker wait ms | writable open ms | save wait ms | save write ms | save ms | save timings | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | E2E-18-2026-10-22T07-11-31-383Z-d21d32 | live-n-1mib | PASS | 1048576 | 1049244 | 1048576 | 473 | 6226 | 6699 | 17155 | 23854 | 4855 | 6 | 4861 | 129 | 4990 | True | True | live capture roundtrip; proof proof/E2E-18/round-live-n-1mib/received.bin |

### live / incompressible / 20MiB-over-budget

| case | attempt | leg | status | raw B | stream B | artifact B | decoder init ms | source wait ms | init ms | reconstruct ms | total->ready ms | picker wait ms | writable open ms | save wait ms | save write ms | save ms | save timings | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | E2E-18-2026-10-22T07-11-31-383Z-d21d32 | live-n-20mib-over-budget | NOT_RUN | 20971520 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | code-level basis: the receiver has no early artifact-size check. build_artifact (web/desktop-recv/worker/decoder-worker.js:209-246) runs only after the fountain decoder reports a complete file, so an incompressible 20 MiB payload must transfer the full ~20 MiB encoded stream before rejection - unbounded wall time on this rig. The artifact-budget boundary itself is covered by IAT/UT-023 and by the compressible 20 MiB leg, which exercises the real 15008 rejection. The pixel budget is a different (frame-size) boundary and is explicitly NOT a substitute. |

### live / incompressible / 4MiB

| case | attempt | leg | status | raw B | stream B | artifact B | decoder init ms | source wait ms | init ms | reconstruct ms | total->ready ms | picker wait ms | writable open ms | save wait ms | save write ms | save ms | save timings | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | E2E-18-2026-10-22T07-11-31-383Z-d21d32 | live-n-4mib | PASS | 4194304 | 4196892 | 4194304 | 425 | 3505 | 3930 | 67974 | 71904 | 4387 | 6 | 4393 | 153 | 4546 | True | True | live capture roundtrip; proof proof/E2E-18/round-live-n-4mib/received.bin |

### verdict / verdict / legs

| case | attempt | leg | status | raw B | stream B | artifact B | decoder init ms | source wait ms | init ms | reconstruct ms | total->ready ms | picker wait ms | writable open ms | save wait ms | save write ms | save ms | save timings | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-15 | E2E-15-2026-10-22T06-13-41-332Z-a78e7f | real-entry-cancel | PASS | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | real entry (#btn-video click) + OS dialog cancel; no change event may fire |
| E2E-15 | E2E-15-2026-10-22T06-13-41-332Z-a78e7f | recovery-cancel | PASS | - | - | - | - | - | - | - | - | - | - | - | - | - | True | True | real entry + real OS open dialog; success is only the app-side recording: delta plus a hash-clean save |
| E2E-15 | E2E-15-2026-10-22T06-13-41-332Z-a78e7f | empty-import | PASS | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | import-path-only evidence (DataTransfer change event, not the entry) |
| E2E-15 | E2E-15-2026-10-22T06-13-41-332Z-a78e7f | recovery-empty | PASS | - | - | - | - | - | - | - | - | - | - | - | - | - | True | True | real entry + real OS open dialog; success is only the app-side recording: delta plus a hash-clean save |
| E2E-15 | E2E-15-2026-10-22T06-13-41-332Z-a78e7f | text-import | PASS | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | import-path-only evidence (DataTransfer change event, not the entry) |
| E2E-15 | E2E-15-2026-10-22T06-13-41-332Z-a78e7f | recovery-text | PASS | - | - | - | - | - | - | - | - | - | - | - | - | - | True | True | real entry + real OS open dialog; success is only the app-side recording: delta plus a hash-clean save |
| E2E-15 | E2E-15-2026-10-22T06-13-41-332Z-a78e7f | corrupt-import | PASS | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | import-path-only evidence (DataTransfer change event, not the entry) |
| E2E-15 | E2E-15-2026-10-22T06-13-41-332Z-a78e7f | recovery-corrupt | PASS | - | - | - | - | - | - | - | - | - | - | - | - | - | True | True | real entry + real OS open dialog; success is only the app-side recording: delta plus a hash-clean save |

### video / compressible / 4MiB

| case | attempt | leg | status | raw B | stream B | artifact B | decoder init ms | source wait ms | init ms | reconstruct ms | total->ready ms | picker wait ms | writable open ms | save wait ms | save write ms | save ms | save timings | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | E2E-18-2026-10-22T07-11-31-383Z-d21d32 | video-c-4mib | PASS | 4194304 | 13338 | 4194304 | 109 | 538 | 647 | 394 | 1041 | 4298 | 7 | 4305 | 160 | 4465 | True | True | recorded import roundtrip; presented frames=2, lastUs=169000 |

### video / compressible / V-SHORT (400 ms)

| case | attempt | leg | status | raw B | stream B | artifact B | decoder init ms | source wait ms | init ms | reconstruct ms | total->ready ms | picker wait ms | writable open ms | save wait ms | save write ms | save ms | save timings | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-16 | E2E-16-2026-10-22T06-16-42-556Z-9bdbbd | v-short | PASS | - | - | - | 249 | 0 | 249 | - | - | - | - | - | - | - | - | - | a 400 ms real recording must not produce a saveable artifact (import-path-only dispatch) |

### video / incompressible / 128KiB

| case | attempt | leg | status | raw B | stream B | artifact B | decoder init ms | source wait ms | init ms | reconstruct ms | total->ready ms | picker wait ms | writable open ms | save wait ms | save write ms | save ms | save timings | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | E2E-18-2026-10-22T07-11-31-383Z-d21d32 | video-n-128kib | PASS | 131072 | 131184 | 131072 | 115 | 72 | 187 | 15668 | 15855 | 4412 | 7 | 4419 | 119 | 4538 | True | True | recorded import roundtrip; presented frames=98, lastUs=7838000 |

### video / incompressible / 128KiB (with final segment)

| case | attempt | leg | status | raw B | stream B | artifact B | decoder init ms | source wait ms | init ms | reconstruct ms | total->ready ms | picker wait ms | writable open ms | save wait ms | save write ms | save ms | save timings | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-16 | E2E-16-2026-10-22T06-16-42-556Z-9bdbbd | v-last-with | PASS | 131072 | 131184 | 131072 | 111 | 96 | 207 | 17238 | 17445 | 5402 | 4 | 5406 | 100 | 5506 | - | True | completion media time T*=8.869s = lastUs/1e6 (dimensional fix); withDuration=9.3s (open-precheck delta) |

### video / incompressible / 128KiB (without)

| case | attempt | leg | status | raw B | stream B | artifact B | decoder init ms | source wait ms | init ms | reconstruct ms | total->ready ms | picker wait ms | writable open ms | save wait ms | save write ms | save ms | save timings | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-16 | E2E-16-2026-10-22T06-16-42-556Z-9bdbbd | v-last-without | PASS | - | - | - | 95 | 486 | 581 | - | - | - | - | - | - | - | - | - | real EOF media time 6.348s vs declared cut 6.5s; no artifact |

### video / incompressible / 1MiB bounded probe

| case | attempt | leg | status | raw B | stream B | artifact B | decoder init ms | source wait ms | init ms | reconstruct ms | total->ready ms | picker wait ms | writable open ms | save wait ms | save write ms | save ms | save timings | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | E2E-18-2026-10-22T07-11-31-383Z-d21d32 | video-n-1mib-probe | PASS | 1048576 | 1049244 | 1048576 | 140 | 686 | 826 | 144838 | 145664 | 4447 | 8 | 4455 | 109 | 4564 | True | True | recorded import roundtrip; presented frames=965, lastUs=67195000 |

### video / incompressible / 4MiB

| case | attempt | leg | status | raw B | stream B | artifact B | decoder init ms | source wait ms | init ms | reconstruct ms | total->ready ms | picker wait ms | writable open ms | save wait ms | save write ms | save ms | save timings | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | E2E-18-2026-10-22T07-11-31-383Z-d21d32 | video-n-4mib | PASS | 4194304 | 4196892 | 4194304 | 123 | 1930 | 2053 | 598949 | 601002 | 4443 | 4 | 4447 | 158 | 4605 | True | True | recorded import roundtrip; presented frames=3958, lastUs=273831000 |

## Totals

- records: 20 (PASS 20, FAIL 0, NOT_RUN 0)
- legs: 21 (PASS 20, FAIL 0, NOT_RUN 1)


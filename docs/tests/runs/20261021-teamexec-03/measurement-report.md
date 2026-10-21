# Measurement report — 20261021-teamexec-03

Performance: NOT_EVALUATED (thresholds not frozen (V-002/V-003 pending); this tool reports measurements only)

## Boundary definitions

| boundary | definition |
|---|---|
| init | decoder-client init start (before the Worker is created) -> first valid input frame accepted |
| validInputStart | the first frame from the selected source accepted by the session (state -> Receiving; for a recording, the first frame actually presented) |
| reconstruction | valid-input start -> artifact delivered (state -> Ready): fountain decode + decompress |
| save | save click / picker request -> writable stream closed after the last byte (the OS picker interval is included, not separated) |

## Per-leg measurements

### None / None / None

| case | leg | status | raw B | stream B | artifact B | init ms | reconstruct ms | total->ready ms | save ms | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-15 | real-entry-cancel | PASS | - | - | - | - | - | - | - | - | real entry (#btn-video click) + OS dialog cancel; no change event may fire |
| E2E-15 | empty-import | PASS | - | - | - | - | - | - | - | - | import-path-only evidence (DataTransfer change event, not the entry) |
| E2E-15 | text-import | PASS | - | - | - | - | - | - | - | - | import-path-only evidence (DataTransfer change event, not the entry) |
| E2E-15 | corrupt-import | PASS | - | - | - | - | - | - | - | - | import-path-only evidence (DataTransfer change event, not the entry) |
| E2E-15 | real-entry-open | PASS | - | - | - | - | - | - | - | - | real entry (#btn-video click) + OS dialog open; success is only the app-side recording: delta |

### live / compressible / 1MiB

| case | leg | status | raw B | stream B | artifact B | init ms | reconstruct ms | total->ready ms | save ms | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | live-c-1mib | PASS | 1048576 | 3354 | 1048576 | 3979 | 245 | 4224 | 4230 | True | live capture roundtrip; proof proof/E2E-18/round-live-c-1mib/received.bin |

### live / compressible / 20MiB-over-budget

| case | leg | status | raw B | stream B | artifact B | init ms | reconstruct ms | total->ready ms | save ms | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | live-c-20mib-over-budget | PASS | 20971520 | - | - | 3529 | - | - | - | True | budget 16777216 (build-desktop-recv/staging/receiver/config/profile.json); rejection then stop then hash-clean normal-file recovery |

### live / compressible / 4MiB

| case | leg | status | raw B | stream B | artifact B | init ms | reconstruct ms | total->ready ms | save ms | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | live-c-4mib | PASS | 4194304 | 13338 | 4194304 | 3464 | 306 | 3770 | 4148 | True | live capture roundtrip; proof proof/E2E-18/round-live-c-4mib/received.bin |

### live / incompressible / 1MiB

| case | leg | status | raw B | stream B | artifact B | init ms | reconstruct ms | total->ready ms | save ms | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | live-n-1mib | PASS | 1048576 | 1049244 | 1048576 | 3363 | 16240 | 19603 | 4047 | True | live capture roundtrip; proof proof/E2E-18/round-live-n-1mib/received.bin |

### live / incompressible / 20MiB-over-budget

| case | leg | status | raw B | stream B | artifact B | init ms | reconstruct ms | total->ready ms | save ms | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | live-n-20mib-over-budget | NOT_RUN | 20971520 | - | - | - | - | - | - | - | code-level basis: the receiver has no early artifact-size check. build_artifact (web/desktop-recv/worker/decoder-worker.js:209-246) runs only after the fountain decoder reports a complete file, so an incompressible 20 MiB payload must transfer the full ~20 MiB encoded stream before rejection - unbounded wall time on this rig. The artifact-budget boundary itself is covered by IAT/UT-023 and by the compressible 20 MiB leg, which exercises the real 15008 rejection. The pixel budget is a different (frame-size) boundary and is explicitly NOT a substitute. |

### live / incompressible / 4MiB

| case | leg | status | raw B | stream B | artifact B | init ms | reconstruct ms | total->ready ms | save ms | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | live-n-4mib | PASS | 4194304 | 4196892 | 4194304 | 3426 | 67300 | 70726 | 4059 | True | live capture roundtrip; proof proof/E2E-18/round-live-n-4mib/received.bin |

### video / compressible / 4MiB

| case | leg | status | raw B | stream B | artifact B | init ms | reconstruct ms | total->ready ms | save ms | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | video-c-4mib | PASS | 4194304 | 13338 | 4194304 | 696 | 373 | 1069 | - | True | recorded import roundtrip; presented frames=2, lastUs=169000 |

### video / compressible / V-SHORT (400 ms)

| case | leg | status | raw B | stream B | artifact B | init ms | reconstruct ms | total->ready ms | save ms | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-16 | v-short | PASS | - | - | - | 218 | - | - | - | - | a 400 ms real recording must not produce a saveable artifact |

### video / incompressible / 128KiB

| case | leg | status | raw B | stream B | artifact B | init ms | reconstruct ms | total->ready ms | save ms | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | video-n-128kib | PASS | 131072 | 131184 | 131072 | 651 | 17611 | 18262 | - | True | recorded import roundtrip; presented frames=118, lastUs=8028000 |

### video / incompressible / 128KiB (with final segment)

| case | leg | status | raw B | stream B | artifact B | init ms | reconstruct ms | total->ready ms | save ms | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-16 | v-last-with | PASS | 131072 | 131184 | 131072 | 630 | 17350 | 17980 | - | True | completion media time T*=8.028118s from lastUs+artifactFrameId |

### video / incompressible / 128KiB (without)

| case | leg | status | raw B | stream B | artifact B | init ms | reconstruct ms | total->ready ms | save ms | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-16 | v-last-without | PASS | - | - | - | 686 | - | - | - | - | real EOF duration 5.842s; no artifact |

### video / incompressible / 1MiB bounded probe

| case | leg | status | raw B | stream B | artifact B | init ms | reconstruct ms | total->ready ms | save ms | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | video-n-1mib-probe | PASS | 1048576 | 1049244 | 1048576 | 570 | 141731 | 142301 | - | True | recorded import roundtrip; presented frames=975, lastUs=65559000 |

### video / incompressible / 4MiB

| case | leg | status | raw B | stream B | artifact B | init ms | reconstruct ms | total->ready ms | save ms | hash equal | note / basis |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-18 | video-n-4mib | PASS | 4194304 | 4196892 | 4194304 | 1943 | 566085 | 568028 | - | True | recorded import roundtrip; presented frames=3844, lastUs=264821000 |

## Totals

- records: 20 (PASS 19, FAIL 0, NOT_RUN 1)
- legs: 18 (PASS 17, FAIL 0, NOT_RUN 1)


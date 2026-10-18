# RED evidence — run 20261018-teamexec-01

Test-plan.md:38 requires RED, fix and GREEN to be recorded with the run, not
only the final green output. These are the two behaviour reds the fixes came
from, transcribed from the actual runs.

## RED-1 — strict EOF: truncation reported as completion (before 513526f)

Command (WSL2, clean copy `~/t12a-src`, CMD-02 equivalent):

```
cmake --build build-native --target compression_test cimbar_js_test -j4
ctest --test-dir build-native -R '^(compression_test|cimbar_js_test)$' --output-on-failure
```

Observed:

```
./src/lib/compression/test/zstd_decompressorTest.cpp:218: FAILED:
  REQUIRE( dec.frame_ended() )   (in testStrictEof.Truncated)
test cases: 19 | 18 passed | 1 failed
assertions: 95 | 94 passed | 1 failed
```

Cause: `frame_ended()` was the naive placeholder `_inBuff.empty()`, so a
truncated stream (input exhausted, zstd frame not finished) looked complete.
`cimbard_decompress_read` compounded it by discarding `write_once()`'s bool
and returning 0 for both completion and truncation.

Guard cases that were already green (they must stay green after the fix):
UT-049 roundtrip, UT-050 corrupt, UT-052 flush, UT-053 repeated read,
UT-054 chunked write, and the C-ABI export guard.

## RED-2 — export small buffer lost bytes (before the pending guard)

Command:

```
node --test web/desktop-recv/tests/unit/worker.test.mjs
```

Observed:

```
./src/lib/cimbar_js/test/cimbar_recv_jsTest.cpp:185: FAILED:
  REQUIRE( (contents) == (out.str()) )
test cases:   6 |   5 passed | 1 failed
```

Cause: `_pendingOutput` was overwritten by `write_once()` output on the next
call, so a caller buffer smaller than the produced chunk lost the remainder
(~130 KB in this fixture). Fix: only produce more output when the pending
buffer is empty.

## RED-3 — worker policy stub (before 117a9af)

Command:

```
node tools/desktop-recv/run-unit.mjs --suite worker
```

Observed:

```
# tests 6
# pass 1
# fail 5
UNIT SUITE FAILURE: worker: FAILED (fail=5, status=1)
```

Cause: the T1.2.c stub implemented only the init handshake. UT-020..UT-024
failed on real behaviour (BigInt interpretation, heap copy, decompress
failure, artifact budget, asset/export validation), not on missing modules.
UT-019 passed as the init-settle guard.

## GREEN

- Native full suite: 9/9 passed (`cmd-02-gate.log`).
- CMD-05: contracts 7/7, worker 6/6, 0 todo, 0 skipped.
- CMD-07 real browser: IAT-01/02 (see `iat-results.json`).

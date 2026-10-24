// UT-019..UT-024: decoder worker policy, driven through the real worker
// source with a fake Emscripten Module and fake fetch/crypto. VM results
// prove policy only; real bytes are proven in the browser tests.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createHarness, makeFakeModule, frameMessage } from '../helpers/worker-vm.mjs';

function harnessForFountain(value, extraExports = {}) {
  return createHarness({
    module: makeFakeModule(Object.assign({
      _cimbard_scan_extract_decode() { return 625; },
      _cimbard_fountain_decode() { return value; },
      _cimbard_get_filesize() { return 3; },
      _cimbard_get_filename() { return 0; },
      _cimbard_decompress_read() { return 0; }, // immediate strict end
    }, extraExports)),
  });
}

function harnessWithReads(reads, limits = {}, extraExports = {}) {
  let index = 0;
  const h = createHarness({
    module: makeFakeModule(Object.assign({
      _cimbard_scan_extract_decode() { return 625; },
      _cimbard_fountain_decode() { return 0x2an; },
      _cimbard_get_filesize() { return 3; },
      _cimbard_get_decompress_bufsize() { return 8; },
      _cimbard_decompress_read(id, ptr) {
        const chunk = reads[index++];
        if (typeof chunk === 'number') return chunk; // negative error code
        if (!chunk || chunk.length === 0) return 0;
        h.heap().set(chunk, ptr);
        return chunk.length;
      },
    }, extraExports)),
  });
  return h;
}

async function start(h, limits = {}) {
  h.send(h.makeInit({ limits }));
  await h.settle();
}

// Given a fake Module that fires ready twice and then aborts
// When initializing
// Then exactly one terminal init response is posted and failure is ignored
test('UT-019 init settles exactly once', async () => {
  const h = createHarness({ deferReady: true });
  h.send(h.makeInit());
  await h.settle();

  h.context.Module.onRuntimeInitialized();
  h.context.Module.onRuntimeInitialized();
  h.context.Module.onAbort('late abort');

  const events = h.initEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'ready');
});

// Given fountain results of 0n, a negative, and a value above 32 bits
// When a frame result is processed
// Then the sign decides, and positive ids are truncated with asUintN(32)
test('UT-020 BigInt fountain results by sign', async () => {
  const incomplete = harnessForFountain(0n);
  await start(incomplete);
  incomplete.send(frameMessage({ frameId: 1 }));
  assert.equal(incomplete.results()[0].outcome, 'data');
  assert.equal(incomplete.results()[0].bytesDecoded, 625);

  const negative = harnessForFountain(-5n);
  await start(negative);
  negative.send(frameMessage({ frameId: 1 }));
  assert.equal(negative.results()[0].outcome, 'error');
  assert.equal(negative.results()[0].errorCode, 15005);

  const big = harnessForFountain(0x1_0000_0007n);
  await start(big);
  big.send(frameMessage({ frameId: 1 }));
  assert.equal(big.results()[0].outcome, 'artifact');
  assert.equal(big.results()[0].artifact.artifactId, '7');

  // a Number instead of a BigInt is an ABI mismatch, not a silent cast
  const wrongAbi = harnessForFountain(7);
  await start(wrongAbi);
  wrongAbi.send(frameMessage({ frameId: 1 }));
  assert.equal(wrongAbi.results()[0].outcome, 'error');
  assert.equal(wrongAbi.results()[0].errorCode, 15009);
});

// Given decoded bytes living in the WASM heap
// When the artifact is produced and the heap is later clobbered
// Then the Blob keeps the original bytes
test('UT-021 heap output is copied before free', async () => {
  const h = harnessWithReads([[1, 2, 3]]);
  await start(h);
  h.send(frameMessage({ frameId: 1 }));

  const result = h.results()[0];
  assert.equal(result.outcome, 'artifact');

  const before = new Uint8Array(await result.artifact.blob.arrayBuffer());
  assert.deepEqual([...before], [1, 2, 3]);

  h.heap().fill(9, 0, 256);
  const after = new Uint8Array(await result.artifact.blob.arrayBuffer());
  assert.deepEqual([...after], [1, 2, 3]);
});

// Given a positive chunk followed by a negative decompress result
// When the artifact is assembled
// Then no half file is delivered, and a single 0 is enough to finish
test('UT-022 decompress failure never yields a half artifact', async () => {
  const failing = harnessWithReads([[1, 2, 3], -15]);
  await start(failing);
  failing.send(frameMessage({ frameId: 1 }));
  const bad = failing.results()[0];
  assert.equal(bad.outcome, 'error');
  assert.equal(bad.errorCode, 15007);
  assert.equal(bad.artifact, undefined);

  const complete = harnessWithReads([[1, 2, 3], 0]);
  await start(complete);
  complete.send(frameMessage({ frameId: 1 }));
  const good = complete.results()[0];
  assert.equal(good.outcome, 'artifact');
  assert.equal(good.artifact.byteCount, 3);
});

// Given the artifact byte budget and a value one byte above it
// When appending decoded chunks
// Then the boundary is accepted and the overflow is rejected without truncation
test('UT-023 artifact budget boundary', async () => {
  const atLimit = harnessWithReads([[1, 2, 3], 0]);
  await start(atLimit, { maxArtifactBytes: 3 });
  atLimit.send(frameMessage({ frameId: 1 }));
  assert.equal(atLimit.results()[0].outcome, 'artifact');

  const overLimit = harnessWithReads([[1, 2, 3, 4], 0]);
  await start(overLimit, { maxArtifactBytes: 3 });
  overLimit.send(frameMessage({ frameId: 1 }));
  const res = overLimit.results()[0];
  assert.equal(res.outcome, 'error');
  assert.equal(res.errorCode, 15008);
  assert.equal(res.artifact, undefined);
});

// Given bad asset paths, a digest mismatch, a missing frozen export, and an
// init that never becomes ready
// When initializing
// Then each is rejected with its registered code
test('UT-024 asset, digest, export and timeout failures', async () => {
  const badPath = createHarness();
  badPath.send(badPath.makeInit({
    assets: {
      jsPath: '../evil.js',
      wasmPath: 'vendor/cimbar_js.wasm',
      jsSha256: 'a'.repeat(64),
      wasmSha256: 'b'.repeat(64),
    },
  }));
  assert.equal(badPath.initEvents()[0].type, 'init-failed');
  assert.equal(badPath.initEvents()[0].code, 18001);

  // percent-encoded traversal must be rejected before any URL normalization
  const encodedPath = createHarness();
  encodedPath.send(encodedPath.makeInit({
    assets: {
      jsPath: '%2e%2e/evil.js',
      wasmPath: 'vendor/cimbar_js.wasm',
      jsSha256: 'a'.repeat(64),
      wasmSha256: 'b'.repeat(64),
    },
  }));
  assert.equal(encodedPath.initEvents()[0].code, 18001);

  // well-formed digests that do not match the served bytes
  const badDigest = createHarness();
  badDigest.send(badDigest.makeInit({
    assets: {
      jsPath: 'vendor/cimbar_js.js',
      wasmPath: 'vendor/cimbar_js.wasm',
      jsSha256: 'a'.repeat(64),
      wasmSha256: 'b'.repeat(64),
    },
  }));
  await badDigest.settle();
  assert.equal(badDigest.initEvents()[0].type, 'init-failed');
  assert.equal(badDigest.initEvents()[0].code, 18002);

  const missingExport = makeFakeModule();
  delete missingExport._cimbard_scan_extract_decode;
  const hMissing = createHarness({ module: missingExport });
  hMissing.send(hMissing.makeInit());
  await hMissing.settle();
  assert.equal(hMissing.initEvents()[0].type, 'init-failed');
  assert.equal(hMissing.initEvents()[0].code, 15002);

  const hTimeout = createHarness({ deferReady: true });
  hTimeout.send(hTimeout.makeInit({ limits: { initTimeoutMs: 20 } }));
  await hTimeout.settle(80);
  assert.equal(hTimeout.initEvents()[0].type, 'init-failed');
  assert.equal(hTimeout.initEvents()[0].code, 15011);
});

// --- T7 receiver UX observation: UX-UT-001..007 ----------------------------
//
// The optional report read is a side channel. The fake Module stands in for
// the IAT probe; it proves ordering, bounds and degradation policy only, not
// real WASM bytes (those stay a browser-test concern).

const utf8Bytes = (text) => new TextEncoder().encode(text);

// The VM posts realm-local objects; assert.deepEqual compares prototypes, so
// observations cross the boundary through a JSON round-trip first.
const plain = (value) => JSON.parse(JSON.stringify(value));

// A harness whose _cimbard_get_report writes an answer into the 1024-byte
// buffer and returns a caller-chosen length. `answer(module, ptr, callIndex)`
// runs inside the fake export, so it may swap Module.HEAPU8 to simulate heap
// growth. `options.reportExport === false` omits the optional export.
function reportHarness(answer, options = {}) {
  const calls = [];
  const module = makeFakeModule();
  module._cimbard_scan_extract_decode = () => {
    calls.push('scan');
    return options.scan === undefined ? 625 : options.scan;
  };
  module._cimbard_fountain_decode = () => {
    calls.push('fountain');
    return options.fountain === undefined ? 0n : options.fountain;
  };
  if (options.reportExport !== false) {
    module._cimbard_get_report = (ptr) => {
      calls.push('report');
      const reportCalls = calls.filter((name) => name === 'report').length;
      return answer(module, ptr, reportCalls);
    };
  }
  Object.assign(module, options.exports || {});
  const h = createHarness({ module });
  h.calls = calls;
  h.moduleRef = module;
  return h;
}

function answerText(text, declaredLength = null) {
  return (module, ptr) => {
    const bytes = utf8Bytes(text);
    module.HEAPU8.set(bytes, ptr);
    return declaredLength === null ? bytes.length : declaredLength;
  };
}

async function startAndFrame(h, frameId = 1, limits = {}) {
  h.send(h.makeInit({ limits }));
  await h.settle();
  h.send(frameMessage({ frameId }));
  return h.results()[h.results().length - 1];
}

// Given report byte payloads of zero length, [], [0], [0.25], [1.2] and eight
// ratios (plus garbage after the declared length)
// When a data frame is submitted through the real worker entry point
// Then each report is classified from exactly the declared bytes, and the
// original frame result keeps its outcome, frameId and bytesDecoded
test('UX-UT-001 full-length report reads classify empty, single and up to eight streams', async () => {
  const cases = [
    { text: '[]', expected: { state: 'empty', ratios: [], diagnosticCode: 0 } },
    { text: '[0]', expected: { state: 'single', ratios: [0], diagnosticCode: 0 } },
    { text: '[0.25]', expected: { state: 'single', ratios: [0.25], diagnosticCode: 0 } },
    { text: '[1.2]', expected: { state: 'single', ratios: [1.2], diagnosticCode: 0 } },
    {
      text: '[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8]',
      expected: {
        state: 'multiple',
        ratios: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
        diagnosticCode: 19005,
      },
    },
  ];

  for (const item of cases) {
    const h = reportHarness(answerText(item.text));
    const result = await startAndFrame(h, 7);
    assert.equal(result.outcome, 'data', `${item.text}: the original outcome is untouched`);
    assert.equal(result.frameId, 7);
    assert.equal(result.bytesDecoded, 625, `${item.text}: bytesDecoded stays the decoded length`);
    assert.deepEqual(plain(result.uxObservation), { version: 1, report: item.expected },
      `${item.text}: the report is classified exactly`);
    assert.equal(h.results().length, 1, 'one frame still yields exactly one business result');
  }

  // Zero length must not re-parse a previous frame's buffer contents.
  const zero = reportHarness((module, ptr, call) => {
    if (call === 1) {
      module.HEAPU8.set(utf8Bytes('[0.9]'), ptr);
      return 5;
    }
    return 0; // no bytes written: the stale [0.9] must not be re-read
  });
  zero.send(zero.makeInit());
  await zero.settle();
  zero.send(frameMessage({ frameId: 1 }));
  zero.send(frameMessage({ frameId: 2 }));
  const [first, second] = zero.results();
  assert.deepEqual(Array.from(first.uxObservation.report.ratios), [0.9]);
  assert.deepEqual(plain(second.uxObservation.report),
    { state: 'empty', ratios: [], diagnosticCode: 0 },
    'a zero-length read is empty, never stale buffer text');
  assert.equal(second.bytesDecoded, 625);

  // Only the declared n bytes are parsed; trailing garbage is not JSON input.
  const trailing = reportHarness(answerText('[0.4]GARBAGE', 5));
  const trailingResult = await startAndFrame(trailing);
  assert.deepEqual(plain(trailingResult.uxObservation.report),
    { state: 'single', ratios: [0.4], diagnosticCode: 0 });
});

// Given a fake Module with every frozen core export but no get_report
// When init completes and a data frame is decoded
// Then ready and the data still flow, and the report is unavailable/19001
// (never a 15002 missing-export failure)
test('UX-UT-002 an absent optional report export does not block init or data', async () => {
  const h = reportHarness(() => { throw new Error('must not be called'); },
    { reportExport: false });
  const result = await startAndFrame(h);

  const init = h.initEvents();
  assert.equal(init.length, 1);
  assert.equal(init[0].type, 'ready', 'the optional export is not a REQUIRED_EXPORT');
  assert.equal(result.outcome, 'data');
  assert.equal(result.bytesDecoded, 625);
  assert.deepEqual(plain(result.uxObservation),
    { version: 1, report: { state: 'unavailable', ratios: [], diagnosticCode: 19001 } });
  assert.equal(h.results().length, 1, 'no retry and no extra decode for a missing capability');
});

// Given a 1024-byte report buffer, a 1023-byte valid JSON text, and return
// lengths of 1024, 1025, -1, 1.5, NaN, Infinity and an unsafe integer
// When each is read through a data frame
// Then 1023 bytes parse, >= 1024 is 19003, and illegal lengths are 19002;
// none of them is partially trusted or turned into a frame error
test('UX-UT-003 the report length boundary rejects truncation and illegal returns', async () => {
  const padded = `[0.5]${' '.repeat(1023 - 5)}`;
  assert.equal(padded.length, 1023);
  const full = reportHarness(answerText(padded));
  const fullResult = await startAndFrame(full);
  assert.deepEqual(plain(fullResult.uxObservation.report),
    { state: 'single', ratios: [0.5], diagnosticCode: 0 },
    '1023 complete bytes are parsed as-is');

  const padded1024 = `[0.5]${' '.repeat(1024 - 5)}`;
  assert.equal(padded1024.length, 1024);
  const atLimit = reportHarness(answerText(padded1024));
  const atLimitResult = await startAndFrame(atLimit);
  assert.deepEqual(plain(atLimitResult.uxObservation.report),
    { state: 'unavailable', ratios: [], diagnosticCode: 19003 });

  const overLimit = reportHarness(answerText('[0.5]', 1025));
  const overLimitResult = await startAndFrame(overLimit);
  assert.deepEqual(plain(overLimitResult.uxObservation.report),
    { state: 'unavailable', ratios: [], diagnosticCode: 19003 },
    'the first half of the buffer is never parsed as a fallback');

  const illegal = [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1];
  for (const n of illegal) {
    const h = reportHarness(answerText('[0.5]', n));
    const result = await startAndFrame(h);
    assert.deepEqual(plain(result.uxObservation.report),
      { state: 'unavailable', ratios: [], diagnosticCode: 19002 },
      `length ${n} is unavailable/19002`);
    assert.equal(result.outcome, 'data', 'a bad length never becomes a frame_error');
    assert.equal(result.bytesDecoded, 625);
  }
});

// Given truncated JSON, non-array JSON, negative/string/overflowing ratios,
// a nine-item array and invalid UTF-8 (plus a mixed valid/invalid array)
// When each is read, and the next real data frame carries [0.7]
// Then the whole report is rejected with 19004 and the next frame recovers
test('UX-UT-004 invalid JSON and UTF-8 reject the whole report without partial trust', async () => {
  const invalidUtf8 = new Uint8Array([0xff, 0xfe, 0x5b, 0x5d]); // never valid UTF-8
  const answers = [
    answerText('{"ratios":[0.2'),
    answerText('{"a":1}'),
    answerText('null'),
    answerText('"0.2"'),
    answerText('[-0.1]'),
    answerText('["0.2"]'),
    answerText('[0.2,-0.1]'),
    answerText('[1e309]'),
    answerText('[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9]'),
    (module, ptr) => {
      module.HEAPU8.set(invalidUtf8, ptr);
      return invalidUtf8.length;
    },
    answerText('[0.7]'),
  ];
  const h = reportHarness((module, ptr, call) => answers[call - 1](module, ptr));
  h.send(h.makeInit());
  await h.settle();
  for (let frameId = 1; frameId <= answers.length; frameId += 1) {
    h.send(frameMessage({ frameId }));
  }
  const results = h.results();
  assert.equal(results.length, answers.length, 'every frame yields exactly one result');
  for (let i = 0; i < answers.length - 1; i += 1) {
    assert.deepEqual(plain(results[i].uxObservation.report),
      { state: 'unavailable', ratios: [], diagnosticCode: 19004 },
      `invalid report #${i + 1} is rejected as a whole`);
    assert.equal(results[i].outcome, 'data');
    assert.equal(results[i].bytesDecoded, 625);
  }
  assert.deepEqual(plain(results[results.length - 1].uxObservation.report),
    { state: 'single', ratios: [0.7], diagnosticCode: 0 },
    'the next real data frame reads the report again instead of restarting');
});

// Given a Module spy that records scan, fountain and report calls
// When no_data, error, wrong-ABI, data and artifact frames are processed
// Then data reads scan -> fountain -> report, artifact reads the report
// before any build_artifact export, and no_data/error never read it
test('UX-UT-005 the report is sampled only after a non-negative fountain result and before the artifact', async () => {
  const data = reportHarness(answerText('[0.2]'));
  const dataResult = await startAndFrame(data);
  assert.deepEqual(data.calls, ['scan', 'fountain', 'report'],
    'data: scan, fountain, then the report');
  assert.equal(dataResult.outcome, 'data');

  const artifactCalls = [];
  const artifact = reportHarness(answerText('[0.2]'), {
    fountain: 0x2an,
    exports: {
      _cimbard_get_filesize() { artifactCalls.push('filesize'); return 3; },
      _cimbard_get_filename() { artifactCalls.push('filename'); return 0; },
      _cimbard_decompress_read() { artifactCalls.push('decompress'); return 0; },
    },
  });
  artifact.send(artifact.makeInit());
  await artifact.settle();
  artifact.send(frameMessage({ frameId: 1 }));
  const artifactResult = artifact.results()[0];
  assert.deepEqual(artifact.calls, ['scan', 'fountain', 'report'],
    'the report is read before the build exports run');
  assert.ok(artifactCalls.indexOf('filesize') >= 0);
  assert.equal(artifactResult.outcome, 'artifact');
  assert.deepEqual(plain(artifactResult.uxObservation.report),
    { state: 'single', ratios: [0.2], diagnosticCode: 0 },
    'the pre-build sample survives the artifact path');

  for (const scan of [0, -3]) {
    const noData = reportHarness(answerText('[0.2]'), { scan });
    const noDataResult = await startAndFrame(noData);
    assert.equal(noDataResult.outcome, 'no_data');
    assert.deepEqual(noData.calls, ['scan'], 'no_data never reads the report');
    assert.equal(noDataResult.uxObservation, undefined,
      'no_data does not attach an observation');
  }

  const error = reportHarness(answerText('[0.2]'), { fountain: -5n });
  const errorResult = await startAndFrame(error);
  assert.equal(errorResult.outcome, 'error');
  assert.equal(errorResult.errorCode, 15005);
  assert.deepEqual(error.calls, ['scan', 'fountain'], 'a negative result is not sampled');

  const wrongAbi = reportHarness(answerText('[0.2]'), { fountain: 7 });
  const wrongAbiResult = await startAndFrame(wrongAbi);
  assert.equal(wrongAbiResult.outcome, 'error');
  assert.equal(wrongAbiResult.errorCode, 15009);
  assert.deepEqual(wrongAbi.calls, ['scan', 'fountain'],
    'an ABI mismatch is not sampled either');
});

// Given a fake get_report that grows Module.HEAPU8 and writes the new answer
// into the new heap, plus malloc/free spies
// When several data frames run and the worker is closed twice
// Then the current heap is read, one 1024-byte buffer is reused for the
// worker lifetime, the parsed values survive heap clobbers, and close frees
// it exactly once
test('UX-UT-006 the report reads the current heap with one reused buffer', async () => {
  const mallocSizes = [];
  const freed = [];
  let reportPtr = null;
  const h = reportHarness((module, ptr, call) => {
    const live = h.context.Module; // the Module the worker actually reads
    if (call === 1) {
      live.HEAPU8.set(utf8Bytes('[0.25]'), ptr); // stale value in the old heap
      live.HEAPU8 = new Uint8Array(4 * 1024 * 1024); // simulated heap growth
      live.HEAPU8.set(utf8Bytes('[0.75]'), ptr); // the answer lives in the new heap
      return 6;
    }
    live.HEAPU8.set(utf8Bytes('[0.5]'), ptr);
    return 5;
  });
  const baseMalloc = h.moduleRef._malloc.bind(h.moduleRef);
  h.moduleRef._malloc = (size) => {
    mallocSizes.push(size);
    const ptr = baseMalloc(size);
    if (size === 1024) reportPtr = ptr;
    return ptr;
  };
  const baseFree = h.moduleRef._free.bind(h.moduleRef);
  h.moduleRef._free = (ptr) => {
    freed.push(ptr);
    return baseFree(ptr);
  };

  h.send(h.makeInit());
  await h.settle();
  h.send(frameMessage({ frameId: 1 }));
  h.send(frameMessage({ frameId: 2 }));
  h.send(frameMessage({ frameId: 3 }));
  const [first, second] = h.results();
  assert.deepEqual(Array.from(first.uxObservation.report.ratios), [0.75],
    'the current heap wins over the pre-growth view');
  assert.deepEqual(Array.from(second.uxObservation.report.ratios), [0.5]);

  const reportMallocs = mallocSizes.filter((size) => size === 1024);
  assert.equal(reportMallocs.length, 1, 'one 1024-byte report buffer for the worker lifetime');
  assert.ok(Number.isSafeInteger(reportPtr), 'the report buffer has a stable pointer');

  h.heap().fill(9, 0, 4096); // clobber the heap after parsing
  assert.deepEqual(Array.from(first.uxObservation.report.ratios), [0.75],
    'the parsed observation is detached from the mutable heap view');

  h.send({ type: 'close' });
  h.send({ type: 'close' });
  assert.ok(freed.length >= 1, 'close releases the reused buffers');
  assert.equal(freed.filter((ptr) => ptr === reportPtr).length, 1,
    'the report buffer is freed exactly once');
});

// Given a report read that fails (malloc 0/throws, get_report throws, bad
// JSON), and independent core failures (decompress -15, over budget)
// When the frame runs through the real worker entry
// Then only the report degrades; a valid report never masks a core failure
// and every frame still yields exactly one business result
test('UX-UT-007 report failures stay local and never mask core decode errors', async () => {
  // malloc returns 0 for the report buffer only
  const zeroMalloc = reportHarness(answerText('[0.2]'));
  const baseZeroMalloc = zeroMalloc.moduleRef._malloc.bind(zeroMalloc.moduleRef);
  zeroMalloc.moduleRef._malloc = (size) => (size === 1024 ? 0 : baseZeroMalloc(size));
  const zeroResult = await startAndFrame(zeroMalloc);
  assert.deepEqual(plain(zeroResult.uxObservation.report),
    { state: 'unavailable', ratios: [], diagnosticCode: 19002 });
  assert.equal(zeroResult.outcome, 'data');
  assert.equal(zeroResult.bytesDecoded, 625);

  // malloc throws for the report buffer only
  const throwMalloc = reportHarness(answerText('[0.2]'));
  const baseThrowMalloc = throwMalloc.moduleRef._malloc.bind(throwMalloc.moduleRef);
  throwMalloc.moduleRef._malloc = (size) => {
    if (size === 1024) throw new Error('out of memory');
    return baseThrowMalloc(size);
  };
  const throwResult = await startAndFrame(throwMalloc);
  assert.deepEqual(plain(throwResult.uxObservation.report),
    { state: 'unavailable', ratios: [], diagnosticCode: 19002 });
  assert.equal(throwResult.outcome, 'data');

  // get_report throws
  const throwing = reportHarness(() => { throw new Error('export exploded'); });
  const throwingResult = await startAndFrame(throwing);
  assert.deepEqual(plain(throwingResult.uxObservation.report),
    { state: 'unavailable', ratios: [], diagnosticCode: 19002 });
  assert.equal(throwingResult.outcome, 'data');

  // a valid report must not mask a real decompress failure
  const failingBuild = reportHarness(answerText('[0.2]'), {
    fountain: 0x2an,
    exports: {
      _cimbard_get_filesize() { return 3; },
      _cimbard_decompress_read() { return -15; },
    },
  });
  const failed = await startAndFrame(failingBuild);
  assert.equal(failed.outcome, 'error');
  assert.equal(failed.errorCode, 15007, 'the core failure keeps its original code');
  assert.equal(failed.uxObservation, undefined, 'a valid report never dresses up an error');

  // a valid report must not mask the artifact budget error
  const overBudget = reportHarness(answerText('[0.2]'), {
    fountain: 0x2an,
    exports: {
      _cimbard_get_filesize() { return 3; },
      _cimbard_decompress_read(id, ptr, cap) {
        return cap >= 3 ? 3 : 0; // first read yields 3 bytes: over the budget of 2
      },
    },
  });
  overBudget.send(overBudget.makeInit({ limits: { maxArtifactBytes: 2 } }));
  await overBudget.settle();
  overBudget.send(frameMessage({ frameId: 1 }));
  const over = overBudget.results()[0];
  assert.equal(over.outcome, 'error');
  assert.equal(over.errorCode, 15008);
  assert.equal(over.uxObservation, undefined);

  // a failed report does not block a strict-EOF artifact
  const strict = reportHarness(() => { throw new Error('report down'); },
    { fountain: 0x2an, exports: { _cimbard_get_filesize() { return 3; } } });
  const strictResult = await startAndFrame(strict);
  assert.equal(strictResult.outcome, 'artifact');
  assert.ok(strictResult.artifact, 'the strict-EOF artifact is still delivered');
  assert.deepEqual(plain(strictResult.uxObservation.report),
    { state: 'unavailable', ratios: [], diagnosticCode: 19002 });

  assert.equal(zeroMalloc.results().length, 1, 'one business result per frame');
  assert.equal(throwing.results().length, 1);
});

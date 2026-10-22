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

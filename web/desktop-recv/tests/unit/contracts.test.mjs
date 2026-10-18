// UT-001..UT-006: contract helpers. Real assertions against the frozen
// error-code registry; no placeholder cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  LIMITS_DEFAULT,
  rgbaBytes,
  assertNativeArrayBuffer,
  assertExactFrameLength,
  assertArtifactBlob,
  parseFountainResult,
  createRequestRegistry,
  makeErrorEnvelope,
} from '../../src/contracts.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CODES = JSON.parse(
  readFileSync(join(HERE, '../../../../docs/design-catalog/contracts/error-codes.json'), 'utf8')
).errors;

// Given a plain object masquerading as an ArrayBuffer
// When it is validated
// Then it is rejected and never reaches WASM
test('UT-001 rejects non-native frame payloads', () => {
  assert.throws(() => assertNativeArrayBuffer({ byteLength: 24 }), TypeError);
  assert.throws(() => assertNativeArrayBuffer(new Uint8Array(24)), TypeError);
  assert.throws(() => assertNativeArrayBuffer(null), TypeError);

  const ok = new ArrayBuffer(24);
  assert.equal(assertNativeArrayBuffer(ok), ok);
});

// Given a 2x3 frame with 23/24/25 bytes
// When the exact length is checked
// Then only 24 passes; nothing is truncated or padded
test('UT-002 RGBA length is exact', () => {
  assert.equal(rgbaBytes(2, 3), 24);
  assert.throws(() => assertExactFrameLength(new ArrayBuffer(23), 2, 3), RangeError);
  assert.equal(assertExactFrameLength(new ArrayBuffer(24), 2, 3), 24);
  assert.throws(() => assertExactFrameLength(new ArrayBuffer(25), 2, 3), RangeError);
});

// Given the pixel budget, the value just above it, and overflowing products
// When validated before allocation
// Then out-of-budget is rejected; the boundary matches exactly
test('UT-003 pixel budget boundary', () => {
  assert.equal(LIMITS_DEFAULT.maxFramePixels, 4194304);
  assert.equal(rgbaBytes(2048, 2048), 16777216);
  assert.throws(() => rgbaBytes(2049, 2048), RangeError);
  assert.throws(() => rgbaBytes(1e9, 1e9), RangeError);
  assert.throws(() => rgbaBytes(-1, 10), RangeError);
  assert.throws(() => rgbaBytes(2.5, 10), RangeError);
});

// Given the same requestId with the same File object, then a different File
// When claiming the id
// Then identity is idempotent and a different object is a conflict
test('UT-004 File object identity dedup', () => {
  const reg = createRequestRegistry();
  const file = new File(['x'], 'a.bin');
  assert.equal(reg.claim('r1', file), 'claimed');
  assert.equal(reg.claim('r1', file), 'idempotent');
  assert.equal(reg.claim('r1', new File(['x'], 'a.bin')), 'conflict');
  assert.equal(reg.claim('r2', file), 'claimed');
  assert.equal(reg.size(), 2);
});

// Given a Blob whose size differs from the artifact metadata
// When accepted
// Then it is rejected and never reaches Ready
test('UT-005 native Blob must match artifact metadata', () => {
  const blob = new Blob([new Uint8Array([1, 2, 3])]);
  assert.equal(assertArtifactBlob(blob, { byteLength: 3 }), blob);
  assert.throws(() => assertArtifactBlob(blob, { byteLength: 4 }), RangeError);
  assert.throws(() => assertArtifactBlob(new Uint8Array(3), { byteLength: 3 }), TypeError);
  assert.throws(() => assertArtifactBlob(blob, null), TypeError);
});

// Given all 53 registered codes and an unknown native error
// When building envelopes
// Then code/name/retryAction match the registry, and unknown is never named
test('UT-006 error registration stays consistent', () => {
  assert.equal(CODES.length, 53);
  for (const entry of CODES) {
    const env = makeErrorEnvelope(entry.code, CODES);
    assert.equal(env.ok, false);
    assert.equal(env.code, entry.code);
    assert.equal(env.error.name, entry.name);
    assert.equal(env.error.retryAction, entry.retryAction);
  }

  const unknown = makeErrorEnvelope(12345, CODES);
  assert.equal(unknown.code, 90001);
  assert.equal(unknown.error.name, 'UNEXPECTED_INTERNAL');
  assert.equal(unknown.error.retryAction, 'new_session');
});

// Guard the BigInt ABI helper here as well: it is the reason UT-020 exists.
test('UT-020 helper parses fountain BigInt by sign', () => {
  assert.deepEqual(parseFountainResult(0n), { kind: 'incomplete' });
  assert.deepEqual(parseFountainResult(-5n), { kind: 'error', code: 5 });
  assert.deepEqual(parseFountainResult(7n), { kind: 'artifact', id: 7 });
  assert.equal(parseFountainResult(0x1_0000_0007n).id, 7);
  assert.throws(() => parseFountainResult(7), TypeError);
});

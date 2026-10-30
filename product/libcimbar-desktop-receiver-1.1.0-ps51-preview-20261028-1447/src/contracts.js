// Pure contract helpers shared by the worker, the client, and the UI.
// No DOM, no WASM, no I/O: everything here is unit-testable in plain Node.

export const LIMITS_DEFAULT = Object.freeze({
  maxFramePixels: 4194304,      // 2048 x 2048
  maxArtifactBytes: 16777216,   // 16 MiB
  inflightLimit: 1,
  initTimeoutMs: 30000,
  frameTimeoutMs: 30000,
});

// RGBA byte count for a frame, rejecting anything outside the pixel budget.
// Mirrors the plan's rgbaBytes(): a boundary check, not a schema substitute.
export function rgbaBytes(width, height, maxPixels = LIMITS_DEFAULT.maxFramePixels) {
  const pixels = width * height;
  const bytes = pixels * 4;
  if (!Number.isSafeInteger(width) || width <= 0 ||
      !Number.isSafeInteger(height) || height <= 0 ||
      !Number.isSafeInteger(pixels) || pixels > maxPixels ||
      !Number.isSafeInteger(bytes)) {
    throw new RangeError('invalid frame');
  }
  return bytes;
}

// The frame payload must be a native ArrayBuffer (what structured clone
// actually delivers), never an object that merely looks like one.
export function assertNativeArrayBuffer(value) {
  if (!(value instanceof ArrayBuffer)) {
    throw new TypeError('frame payload must be a native ArrayBuffer');
  }
  return value;
}

// Exact RGBA length. Never truncate and never pad.
export function assertExactFrameLength(buffer, width, height, maxPixels) {
  const expected = rgbaBytes(width, height, maxPixels);
  if (buffer.byteLength !== expected) {
    throw new RangeError(`frame byteLength ${buffer.byteLength} != ${expected}`);
  }
  return expected;
}

// A rebuilt artifact must be a real Blob whose size matches its metadata.
export function assertArtifactBlob(blob, artifact) {
  if (!(blob instanceof Blob)) {
    throw new TypeError('artifact must be a Blob');
  }
  if (!artifact || typeof artifact.byteLength !== 'number') {
    throw new TypeError('artifact metadata missing');
  }
  if (blob.size !== artifact.byteLength) {
    throw new RangeError(`artifact size ${blob.size} != metadata ${artifact.byteLength}`);
  }
  return blob;
}

// Fountain results cross the WASM boundary as int64 -> BigInt.
// 0n = keep going, negative = error, positive = completed file id.
export function parseFountainResult(value) {
  if (typeof value !== 'bigint') {
    throw new TypeError('fountain result must be BigInt (WASM_BIGINT ABI)');
  }
  if (value < 0n) {
    return { kind: 'error', code: Number(-value) };
  }
  if (value === 0n) {
    return { kind: 'incomplete' };
  }
  return { kind: 'artifact', id: Number(BigInt.asUintN(32, value)) };
}

// A request id is idempotent only for the same payload object identity.
// A different object under the same requestId is a conflict.
export function createRequestRegistry() {
  const seen = new Map();
  return {
    claim(requestId, payload) {
      if (seen.has(requestId)) {
        return seen.get(requestId) === payload ? 'idempotent' : 'conflict';
      }
      seen.set(requestId, payload);
      return 'claimed';
    },
    has(requestId) {
      return seen.has(requestId);
    },
    size() {
      return seen.size;
    },
  };
}

// Errors are registry-driven: the contract's error-codes.json is the single
// source of truth. An unknown code is never given an invented name.
// The produced Error object matches receiver-v1.schema (required: code, name,
// message, retryAction, details; additionalProperties: false).
export function makeErrorEnvelope(code, registry, detail) {
  const lookup = (c) => {
    if (registry instanceof Map) return registry.get(c);
    if (Array.isArray(registry)) return registry.find((e) => e.code === c);
    if (registry && typeof registry === 'object') return registry[c];
    return undefined;
  };

  let entry = lookup(code);
  if (!entry) {
    entry = lookup(90001);
    if (!entry) {
      return {
        ok: false,
        code: 90001,
        error: {
          code: 90001,
          name: 'UNEXPECTED_INTERNAL',
          message: 'internal error',
          retryAction: 'new_session',
          details: {},
        },
      };
    }
    code = 90001;
  }

  const text = (typeof detail === 'string' && detail.length ? detail : entry.message) || entry.name;
  const error = {
    code,
    name: entry.name,
    message: text.slice(0, 256),
    retryAction: entry.retryAction,
    details: {},
  };
  return { ok: false, code, error };
}

// Asset paths must stay inside the receiver root: no scheme, no absolute path,
// no drive letter, no parent traversal, and no percent-encoding (WHATWG URL
// treats %2e%2e as '..', which would bypass a literal check).
export function isSafeRelativePath(value) {
  if (!value || typeof value !== 'string') return false;
  if (/^[A-Za-z]:/.test(value)) return false;
  if (value.startsWith('/') || value.startsWith('\\')) return false;
  if (value.includes('://')) return false;
  if (value.includes('%')) return false;
  if (value.split(/[\\/]/).includes('..')) return false;
  return true;
}

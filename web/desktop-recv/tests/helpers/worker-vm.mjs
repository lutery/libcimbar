// Loads worker/decoder-worker.js inside a Node VM with a fake self, a fake
// Emscripten Module, and fake fetch/crypto so the worker's runtime digest
// verification (C-07) can be exercised for real.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(HERE, '..', '..', 'worker', 'decoder-worker.js');
const HEAP_SIZE = 4 * 1024 * 1024;

const DEFAULT_JS_BYTES = new TextEncoder().encode('// fake emscripten loader\n');
const DEFAULT_WASM_BYTES = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

export function digestHex(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

export function makeFakeModule(overrides = {}) {
  const heap = new Uint8Array(HEAP_SIZE);
  let next = 64;
  const module = {
    HEAPU8: heap,
    _malloc(size) {
      const ptr = next;
      next += Math.max(8, size | 0);
      if (next >= HEAP_SIZE) throw new Error('fake heap exhausted');
      return ptr;
    },
    _free() {},
    _cimbard_configure_decode() {},
    _cimbard_get_bufsize() { return 1250; },
    _cimbard_scan_extract_decode() { return 0; },
    _cimbard_fountain_decode() { return 0n; },
    _cimbard_get_filesize() { return 0; },
    _cimbard_get_filename() { return 0; },
    _cimbard_get_decompress_bufsize() { return 131072; },
    _cimbard_decompress_read() { return 0; },
  };
  return Object.assign(module, overrides);
}

export function createHarness(options = {}) {
  const posted = [];
  const calls = [];
  const fakeModule = options.module || makeFakeModule();
  const deferReady = options.deferReady === true;
  const jsBytes = options.jsBytes || DEFAULT_JS_BYTES;
  const wasmBytes = options.wasmBytes || DEFAULT_WASM_BYTES;
  const files = {
    'vendor/cimbar_js.js': jsBytes,
    'vendor/cimbar_js.wasm': wasmBytes,
  };

  const context = {
    console,
    setTimeout,
    clearTimeout,
    BigInt,
    Blob,
    ArrayBuffer,
    Uint8Array,
    Uint16Array,
    Uint32Array,
    DataView,
    TextDecoder,
    TextEncoder,
    Error,
    TypeError,
    RangeError,
    Math,
    Number,
    Object,
    Array,
    String,
    JSON,
    crypto: globalThis.crypto,
    fetch: async (url) => {
      const key = String(url);
      const match = Object.keys(files).find((k) => key.endsWith(k));
      if (!match) {
        return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
      }
      const bytes = files[match];
      return { ok: true, status: 200, arrayBuffer: async () => bytes.slice(0).buffer };
    },
    self: {
      postMessage(msg, transfer) { posted.push({ msg, transfer: transfer || [] }); },
    },
    importScripts(url) {
      calls.push(url);
      Object.assign(context.Module, fakeModule);
      if (!deferReady && typeof context.Module.onRuntimeInitialized === 'function') {
        context.Module.onRuntimeInitialized();
      }
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(WORKER_PATH, 'utf8'), context, { filename: 'decoder-worker.js' });

  return {
    context,
    posted,
    calls,
    module: fakeModule,
    send(msg) { context.self.onmessage({ data: msg }); },
    heap() { return context.Module.HEAPU8; },
    results() {
      return posted.filter((p) => p.msg.type === 'frame-result').map((p) => p.msg);
    },
    initEvents() {
      return posted
        .filter((p) => p.msg.type === 'ready' || p.msg.type === 'init-failed')
        .map((p) => p.msg);
    },
    makeInit(overrides = {}) {
      const base = {
        type: 'init',
        mode: 68,
        assets: {
          jsPath: 'vendor/cimbar_js.js',
          wasmPath: 'vendor/cimbar_js.wasm',
          jsSha256: digestHex(jsBytes),
          wasmSha256: digestHex(wasmBytes),
        },
        limits: {
          maxFramePixels: 4194304,
          maxArtifactBytes: 16777216,
          initTimeoutMs: 30000,
          frameTimeoutMs: 30000,
        },
      };
      const merged = Object.assign({}, base, overrides);
      merged.assets = Object.assign({}, base.assets, overrides.assets || {});
      merged.limits = Object.assign({}, base.limits, overrides.limits || {});
      return merged;
    },
    async settle(ms = 30) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
  };
}

export function frameMessage(overrides = {}) {
  const width = overrides.width || 2;
  const height = overrides.height || 3;
  const pixels = new ArrayBuffer(width * height * 4);
  new Uint8Array(pixels).fill(7);
  return Object.assign({
    type: 'frame',
    frameId: 1,
    width,
    height,
    byteLength: width * height * 4,
    pixels,
  }, overrides);
}

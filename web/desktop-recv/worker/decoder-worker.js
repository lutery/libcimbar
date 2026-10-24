'use strict';
// Classic worker (importScripts), one WASM instance per session.
// Module must exist before the Emscripten loader runs, so it is declared at
// top level. The policy is unit-tested through a VM fake (UT-019..024); real
// bytes are proven in the browser tests.
//
// Note: this file cannot import src/contracts.js (classic worker), so the two
// small validators below mirror it deliberately.

var Module = {
  locateFile: function (path) {
    if (!path.endsWith('.wasm')) throw new Error('unexpected loader resource');
    return _assets ? resolve_asset(_assets.wasmUrl) : path;
  },
  onRuntimeInitialized: function () { on_wasm_ready(); },
  onAbort: function (reason) { settle_init(false, 15003, String(reason || 'abort')); },
};

// Asset paths are relative to the receiver root, not to this worker's URL.
// worker/decoder-worker.js -> ../../ = receiver root. In the VM harness there
// is no location; paths are passed through unchanged.
function resolve_asset(path) {
  if (self.location && self.location.href) {
    return new URL(path, new URL('../', self.location.href)).href;
  }
  return path;
}

// C-07 (装配/M06): the running worker must hash the bytes it is about to load
// and compare them with the AssetSet. Checking only at staging time lets a
// swapped or stale file pass silently.
function digest_of_fetch(url) {
  return fetch(url, { cache: 'no-store' }).then(function (res) {
    if (!res.ok) throw new Error('fetch ' + url + ' -> ' + res.status);
    return res.arrayBuffer();
  }).then(function (bytes) {
    return crypto.subtle.digest('SHA-256', bytes);
  }).then(function (digest) {
    var view = new Uint8Array(digest);
    var hex = '';
    for (var i = 0; i < view.length; i++) hex += ('0' + view[i].toString(16)).slice(-2);
    return hex;
  });
}

function verify_assets(assets) {
  return digest_of_fetch(resolve_asset(assets.jsPath)).then(function (hex) {
    if (hex !== assets.jsSha256) {
      settle_init(false, 18002, 'js digest mismatch');
      return false;
    }
    return digest_of_fetch(resolve_asset(assets.wasmPath)).then(function (wasmHex) {
      if (wasmHex !== assets.wasmSha256) {
        settle_init(false, 18002, 'wasm digest mismatch');
        return false;
      }
      return true;
    });
  }).catch(function (e) {
    settle_init(false, 18001, String((e && e.message) || e));
    return false;
  });
}

var REQUIRED_EXPORTS = [
  '_cimbard_configure_decode',
  '_cimbard_get_bufsize',
  '_cimbard_scan_extract_decode',
  '_cimbard_fountain_decode',
  '_cimbard_get_filename',
  '_cimbard_get_filesize',
  '_cimbard_decompress_read',
  '_cimbard_get_decompress_bufsize',
];

var DEFAULT_LIMITS = {
  maxFramePixels: 4194304,
  maxArtifactBytes: 16777216,
  initTimeoutMs: 30000,
  frameTimeoutMs: 30000,
};

var _assets = null;
var _limits = DEFAULT_LIMITS;
var _mode = 68;
var _settled = false;
var _ready = false;
var _initTimer = null;
var _lastFrameId = 0;
var _inFlight = false;
var _buffers = { img: null, fountain: null, dec: null, name: null, uxReport: null };

function post(msg, transfer) { self.postMessage(msg, transfer || []); }

function settle_init(ok, code, detail) {
  if (_settled) return;
  _settled = true;
  _ready = ok;
  if (_initTimer) { clearTimeout(_initTimer); _initTimer = null; }
  if (ok) post({ type: 'ready', mode: _mode });
  else post({ type: 'init-failed', code: code, detail: detail });
}

function is_safe_relative_path(value) {
  if (!value || typeof value !== 'string') return false;
  if (/^[A-Za-z]:/.test(value)) return false;
  if (value.charAt(0) === '/' || value.charAt(0) === '\\') return false;
  if (value.indexOf('://') >= 0) return false;
  if (value.indexOf('%') >= 0) return false; // %2e%2e normalizes to '..' in URL
  if (value.split(/[\\/]/).indexOf('..') >= 0) return false;
  return true;
}

function rgba_bytes(width, height, maxPixels) {
  var pixels = width * height;
  var bytes = pixels * 4;
  if (!Number.isSafeInteger(width) || width <= 0 ||
      !Number.isSafeInteger(height) || height <= 0 ||
      !Number.isSafeInteger(pixels) || pixels > maxPixels ||
      !Number.isSafeInteger(bytes)) {
    return -1;
  }
  return bytes;
}

function ensure_buffer(name, size) {
  var buff = _buffers[name];
  if (!buff || buff.length < size) {
    if (buff) {
      try { Module._free(buff.byteOffset); } catch (e) { /* already freed */ }
    }
    var ptr = Module._malloc(size);
    if (!ptr) throw new Error('malloc failed: ' + name);
    buff = new Uint8Array(Module.HEAPU8.buffer, ptr, size);
    _buffers[name] = buff;
  } else if (buff.buffer !== Module.HEAPU8.buffer) {
    buff = new Uint8Array(Module.HEAPU8.buffer, buff.byteOffset, buff.length);
    _buffers[name] = buff;
  }
  return buff;
}

function on_wasm_ready() {
  try {
    if (!_assets) {
      settle_init(false, 15011, 'init never received');
      return;
    }
    for (var i = 0; i < REQUIRED_EXPORTS.length; i++) {
      if (typeof Module[REQUIRED_EXPORTS[i]] !== 'function') {
        settle_init(false, 15002, 'missing export ' + REQUIRED_EXPORTS[i]);
        return;
      }
    }
    Module._cimbard_configure_decode(_mode);
    var bufsize = Module._cimbard_get_bufsize();
    if (!Number.isSafeInteger(bufsize) || bufsize <= 0) {
      settle_init(false, 15004, 'bad fountain bufsize');
      return;
    }
    ensure_buffer('fountain', bufsize);
    settle_init(true);
  } catch (e) {
    settle_init(false, 15001, String((e && e.message) || e));
  }
}

var SUPPORTED_MODES = [4, 8, 66, 67, 68];

function handle_init(msg) {
  if (_settled) {
    post({ type: 'init-failed', code: 11003, detail: 'init already settled' });
    return;
  }

  if (SUPPORTED_MODES.indexOf(msg.mode) < 0) {
    settle_init(false, 10001, 'unsupported mode ' + msg.mode);
    return;
  }
  _mode = msg.mode;
  _limits = Object.assign({}, DEFAULT_LIMITS, msg.limits || {});

  var assets = msg.assets || {};
  if (!is_safe_relative_path(assets.jsPath) || !is_safe_relative_path(assets.wasmPath)) {
    settle_init(false, 18001, 'unsafe asset path');
    return;
  }
  if (!/^[0-9a-f]{64}$/.test(assets.jsSha256 || '') ||
      !/^[0-9a-f]{64}$/.test(assets.wasmSha256 || '')) {
    settle_init(false, 18003, 'asset digests missing or malformed');
    return;
  }

  _assets = { jsUrl: assets.jsPath, wasmUrl: assets.wasmPath };
  _initTimer = setTimeout(function () {
    settle_init(false, 15011, 'init timeout');
  }, _limits.initTimeoutMs);

  verify_assets(assets).then(function (ok) {
    if (!ok) return; // settle_init already reported the reason
    try {
      importScripts(resolve_asset(assets.jsPath));
    } catch (e) {
      settle_init(false, 15001, String((e && e.message) || e));
    }
  });
}

function build_artifact(fileId) {
  var compressedBytes = Module._cimbard_get_filesize(fileId);
  if (!Number.isSafeInteger(compressedBytes) || compressedBytes < 0) {
    return { error: 15006 };
  }
  if (compressedBytes > _limits.maxArtifactBytes) {
    return { error: 15008 };
  }

  var nameBuff = ensure_buffer('name', 512);
  var nameLen = Module._cimbard_get_filename(fileId, nameBuff.byteOffset, nameBuff.length);
  if (!Number.isSafeInteger(nameLen)) return { error: 15006 };
  if (nameLen < 0) return { error: 15006 };

  var suggestedName = '';
  if (nameLen > 0) {
    var nameBytes = new Uint8Array(Module.HEAPU8.buffer, nameBuff.byteOffset, nameLen).slice();
    suggestedName = new TextDecoder('utf-8').decode(nameBytes);
  }

  var decSize = Module._cimbard_get_decompress_bufsize();
  if (!Number.isSafeInteger(decSize) || decSize <= 0) return { error: 15004 };
  var dec = ensure_buffer('dec', decSize);

  var parts = [];
  var total = 0;
  var completed = false;
  for (var guard = 0; guard < 1000000; guard++) {
    var n;
    try {
      n = Module._cimbard_decompress_read(fileId, dec.byteOffset, dec.length);
    } catch (e) {
      return { error: 15003 };
    }
    if (!Number.isSafeInteger(n)) return { error: 15003 };
    if (n === 0) { completed = true; break; } // strict end of frame
    if (n < 0) return { error: n === -16 ? 15012 : 15007 };
    if (total + n > _limits.maxArtifactBytes) return { error: 15008 };
    // copy out of the heap before any further WASM call can move or free it
    parts.push(new Uint8Array(Module.HEAPU8.buffer, dec.byteOffset, n).slice());
    total += n;
  }
  // the loop guard is a safety net, not a success path: never ship a partial file
  if (!completed) return { error: 15003 };

  var blob = new Blob(parts, { type: 'application/octet-stream' });
  return {
    value: {
      artifactId: String(fileId),
      fountainFileId: fileId.toString(16).padStart(8, '0'),
      suggestedName: suggestedName || (fileId + '.' + compressedBytes),
      byteCount: blob.size,
      compressedBytes: compressedBytes,
      mime: 'application/octet-stream',
      blob: blob,
    },
  };
}

// Optional UX report read (UX-01, receiver-ux-v2). The recipe is literal:
// local catches only — a read failure degrades the report and must never
// reach the original frame_error path. One 1024-byte buffer is reused for
// the worker lifetime per the bivalent ensure_buffer lifecycle.
function read_report() {
  function unavailable(code) {
    return { state: 'unavailable', ratios: [], diagnosticCode: code };
  }
  if (typeof Module._cimbard_get_report !== 'function') return unavailable(19001);
  var text;
  var bytes;
  try {
    var buff = ensure_buffer('uxReport', 1024);
    var n = Module._cimbard_get_report(buff.byteOffset, 1024);
    if (!Number.isSafeInteger(n) || n < 0) return unavailable(19002);
    if (n >= 1024) return unavailable(19003);
    if (n === 0) return { state: 'empty', ratios: [], diagnosticCode: 0 };
    // get_report may have re-grown the heap; re-copy from the CURRENT heap
    // by the returned length; NUL termination is not assumed.
    bytes = Module.HEAPU8.slice(buff.byteOffset, buff.byteOffset + n);
    if (bytes.length !== n) return unavailable(19002);
  } catch (error) { return unavailable(19002); }
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    var ratios = JSON.parse(text);
    if (!Array.isArray(ratios) || ratios.length > 8 ||
        !ratios.every(function (v) { return Number.isFinite(v) && v >= 0; })) {
      return unavailable(19004);
    }
    return {
      state: ratios.length === 0 ? 'empty' : ratios.length === 1 ? 'single' : 'multiple',
      ratios: ratios,
      diagnosticCode: ratios.length > 1 ? 19005 : 0,
    };
  } catch (error) { return unavailable(19004); }
}

// Attach the observation only after a non-negative fountain result and only
// before build_artifact touches the stream; no_data/error never sample.
function sample_ux_observation() {
  try {
    return { version: 1, report: read_report() };
  } catch (error) {
    return { version: 1, report: { state: 'unavailable', ratios: [], diagnosticCode: 19002 } };
  }
}

function frame_error(frameId, code) {
  post({ type: 'frame-result', frameId: frameId, outcome: 'error', errorCode: code });
}

function handle_frame(msg) {
  if (!_ready) {
    frame_error(msg && msg.frameId, 11003);
    return;
  }

  var frameId = msg.frameId;
  if (!Number.isSafeInteger(frameId) || frameId <= _lastFrameId || _inFlight) {
    frame_error(frameId, 14005);
    return;
  }
  _lastFrameId = frameId;

  var img = null;
  _inFlight = true;
  try {
    var pixels = msg.pixels;
    if (!(pixels instanceof ArrayBuffer)) {
      frame_error(frameId, 14001);
      return;
    }
    var expected = rgba_bytes(msg.width, msg.height, _limits.maxFramePixels);
    if (expected < 0 || pixels.byteLength !== expected) {
      frame_error(frameId, 14001);
      return;
    }

    img = ensure_buffer('img', pixels.byteLength);
    img.set(new Uint8Array(pixels));

    var fountain = ensure_buffer('fountain', 1);
    var len = Module._cimbard_scan_extract_decode(
      img.byteOffset, msg.width, msg.height, 4, fountain.byteOffset, fountain.length
    );
    if (!Number.isSafeInteger(len)) { frame_error(frameId, 15003); return; }
    if (len <= 0) {
      // -3 / 0 are normal no-data, not failures
      post({ type: 'frame-result', frameId: frameId, outcome: 'no_data', bytesDecoded: 0 });
      return;
    }

    var fountainResult;
    try {
      fountainResult = Module._cimbard_fountain_decode(fountain.byteOffset, len);
    } catch (e) {
      frame_error(frameId, 15003);
      return;
    }
    if (typeof fountainResult !== 'bigint') {
      frame_error(frameId, 15009); // WASM_BIGINT ABI mismatch
      return;
    }
    if (fountainResult < 0n) {
      frame_error(frameId, 15005);
      return;
    }
    if (fountainResult === 0n) {
      post({
        type: 'frame-result',
        frameId: frameId,
        outcome: 'data',
        bytesDecoded: len,
        uxObservation: sample_ux_observation(),
      });
      return;
    }

    var fileId = Number(BigInt.asUintN(32, fountainResult));
    var uxObservation = sample_ux_observation();
    var artifact = build_artifact(fileId);
    if (artifact.error) {
      frame_error(frameId, artifact.error);
      return;
    }
    post({
      type: 'frame-result',
      frameId: frameId,
      outcome: 'artifact',
      bytesDecoded: len,
      artifact: artifact.value,
      uxObservation: uxObservation,
    });
  } catch (e) {
    // frame-stage unexpected failure is a runtime failure, not an init failure
    frame_error(frameId, 15003);
  } finally {
    _inFlight = false;
    void img;
  }
}

function handle_close() {
  for (var name in _buffers) {
    var buff = _buffers[name];
    if (buff) {
      try { Module._free(buff.byteOffset); } catch (e) { /* ignore */ }
      _buffers[name] = null;
    }
  }
  _ready = false;
  if (typeof self.close === 'function') self.close();
}

self.onmessage = function (event) {
  var msg = event && event.data;
  if (!msg || typeof msg.type !== 'string') return;
  if (msg.type === 'init') { handle_init(msg); return; }
  if (msg.type === 'frame') { handle_frame(msg); return; }
  if (msg.type === 'close') { handle_close(); return; }
};

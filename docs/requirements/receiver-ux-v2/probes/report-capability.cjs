// Requirements feasibility probe only: real shipped WASM, synthetic fountain
// packets. This does not exercise image capture, the product UI, or field E2E.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

async function main() {
  const root = path.resolve(process.argv[2] ||
    'product/libcimbar-desktop-receiver-1.0.0-20261022-2252/vendor');
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const Module = {
    wasmBinary: fs.readFileSync(path.join(root, 'cimbar_js.wasm')),
    locateFile: (file) => path.join(root, file),
    print: () => {},
    printErr: () => {},
    onRuntimeInitialized: () => resolveReady(),
    onAbort: (reason) => rejectReady(new Error(String(reason))),
  };
  const context = {
    Module, require, process, __dirname: root,
    __filename: path.join(root, 'cimbar_js.js'), console, WebAssembly,
    TextDecoder, TextEncoder, setTimeout, clearTimeout, performance, URL, Buffer,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(context.__filename, 'utf8'), context);
  let timer;
  try {
    await Promise.race([ready, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('WASM init timeout')), 12000);
    })]);
  } finally {
    clearTimeout(timer);
  }
  const m = context.Module;
  assert.equal(typeof m._cimbard_get_report, 'function');
  m._cimbard_configure_decode(68);
  // Mode B: (4 symbol bits + 2 color bits) * scalar 2 = 12 chunks/frame.
  // Source: Config.h / GridConf.h. This fixture is deliberately mode-specific.
  const chunkSize = m._cimbard_get_bufsize() / 12;
  assert.ok(Number.isSafeInteger(chunkSize) && chunkSize > 6);
  const packet = m._malloc(chunkSize);
  const output = m._malloc(1024);
  const report = () => {
    const length = m._cimbard_get_report(output, 1024);
    return new TextDecoder().decode(m.HEAPU8.slice(output, output + length));
  };
  const decode = (encodeId, blockId) => {
    const data = new Uint8Array(chunkSize);
    const size = 20000;
    data[0] = (encodeId & 0x7f) | ((size >> 17) & 0x80);
    data[1] = (size >> 16) & 0xff;
    data[2] = (size >> 8) & 0xff;
    data[3] = size & 0xff;
    data[4] = blockId >> 8;
    data[5] = blockId & 0xff;
    m.HEAPU8.set(data, packet);
    assert.equal(m._cimbard_fountain_decode(packet, chunkSize), 0n);
    return JSON.parse(report());
  };
  try {
    const initial = report();
    const first = decode(3, 0);
    const repeated = decode(3, 0);
    const next = decode(3, 1);
    const mixed = decode(4, 0);
    assert.equal(first.length, 1);
    assert.ok(first[0] > 0);
    assert.deepEqual(repeated, first);
    assert.ok(next[0] > first[0]);
    assert.equal(mixed.length, 2);
    console.log(JSON.stringify({
      kind: 'requirements_feasibility_only', mode: 68, realPackagedWasm: true,
      chunkSize, initialReport: initial, first, repeated, next, mixed,
      duplicateDoesNotAdvance: true, freshBlockAdvances: true,
      multipleStreamsHaveNoIdsInReport: true,
      exercised: 'synthetic fountain packets directly into shipped WASM',
      notExercised: ['screen capture', 'new UI', 'field E2E', 'file completion'],
      repositoryWritesByProbe: 0,
    }, null, 2));
  } finally {
    m._free(packet);
    m._free(output);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// IAT-01 (browser half): a REAL cimbar frame must decode to 7500 bytes in the
// final WASM worker - the same number the native C++ test asserts.
import { DecoderClient, } from '../../src/decoder-client.js';
import { loadAssetSet, makeLimits } from './native-payload.mjs';

async function loadSamplePixels(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`sample fetch failed: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0);
  const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
  return { width: bitmap.width, height: bitmap.height, pixels: image.data.buffer };
}

export async function runWasmRoundtrip(record) {
  const assets = await loadAssetSet();
  const worker = new Worker(new URL('../../worker/decoder-worker.js', import.meta.url));
  const client = new DecoderClient(worker);

  try {
    await client.init({ mode: 68, assets, limits: makeLimits() });

    const sample = await loadSamplePixels(new URL('./fixtures/4cecc30f.png', import.meta.url));
    const result = await client.submitFrame(sample);

    // One sample frame carries the whole compressed file, so the fountain may
    // complete immediately (artifact) or still be accumulating (data).
    // 7500 fountain bytes and a 7538-byte artifact match the native C++ test.
    const decoded = result.outcome === 'data' || result.outcome === 'artifact';
    const artifactOk = result.outcome !== 'artifact' || result.artifact.byteCount === 7538;
    record('IAT-01 wasm roundtrip', decoded && result.bytesDecoded === 7500 && artifactOk,
      `outcome=${result.outcome} bytesDecoded=${result.bytesDecoded} ` +
      `artifactBytes=${result.artifact ? result.artifact.byteCount : 'n/a'} ` +
      `expected=7500/7538`);
  } finally {
    client.close();
  }
}

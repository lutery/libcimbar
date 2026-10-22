// IAT-02: the real worker must accept a native ArrayBuffer through
// structured clone and answer with a frame result. An empty frame is expected
// to be no_data - this proves transport and the scan path, not decoding.
import { DecoderClient } from '../../src/decoder-client.js';

export async function loadAssetSet() {
  const root = new URL('../../', import.meta.url).href;
  const manifest = await (await fetch(new URL('config/asset-set.json', root))).json();
  return manifest;
}

export function makeLimits(overrides = {}) {
  return Object.assign({
    maxFramePixels: 4194304,
    maxArtifactBytes: 16777216,
    initTimeoutMs: 30000,
    frameTimeoutMs: 30000,
  }, overrides);
}

export async function runNativePayload(record) {
  const assets = await loadAssetSet();
  const worker = new Worker(new URL('../../worker/decoder-worker.js', import.meta.url));
  const client = new DecoderClient(worker);

  try {
    const ready = await client.init({ mode: 68, assets, limits: makeLimits() });

    const width = 64;
    const height = 64;
    const pixels = new ArrayBuffer(width * height * 4);
    new Uint8Array(pixels).fill(0x11);

    const result = await client.submitFrame({ width, height, pixels });
    record('IAT-02 native payload', result.outcome === 'no_data',
      `mode=${ready.mode} outcome=${result.outcome}`);
  } finally {
    client.close();
  }
}

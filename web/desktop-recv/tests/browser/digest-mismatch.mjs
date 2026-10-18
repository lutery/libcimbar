// IAT-03: the worker's runtime digest check (C-07/M06) must reject a manifest
// that does not match the served bytes. This is a negative browser case: it
// can only pass if the running worker actually hashes the assets.
import { DecoderClient } from '../../src/decoder-client.js';
import { loadAssetSet, makeLimits } from './native-payload.mjs';

export async function runDigestMismatch(record) {
  const assets = await loadAssetSet();
  const tampered = Object.assign({}, assets, { wasmSha256: '0'.repeat(64) });

  const worker = new Worker(new URL('../../worker/decoder-worker.js', import.meta.url));
  const client = new DecoderClient(worker);

  try {
    await client.init({ mode: 68, assets: tampered, limits: makeLimits() });
    record('IAT-03 digest mismatch rejected', false, 'init unexpectedly succeeded');
  } catch (error) {
    record('IAT-03 digest mismatch rejected', error.code === 18002, `code=${error.code}`);
  } finally {
    client.close();
  }
}

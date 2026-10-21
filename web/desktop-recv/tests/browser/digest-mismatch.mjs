// IAT-03: the worker's runtime digest check (C-07/M06) must reject a manifest
// that does not match the served bytes. This is a negative browser case: it
// can only pass if the running worker actually hashes the assets.
//
// Round-3 A-R1/B-R1: the protocol init-failed branch must release the worker
// itself. The terminate counter is read BEFORE any safety-net close(), so a
// close() can no longer mask a leaking init-failed path.
import { DecoderClient } from '../../src/decoder-client.js';
import { loadAssetSet, makeLimits } from './native-payload.mjs';

export async function runDigestMismatch(record) {
  const assets = await loadAssetSet();
  const tampered = Object.assign({}, assets, { wasmSha256: '0'.repeat(64) });

  const worker = new Worker(new URL('../../worker/decoder-worker.js', import.meta.url));
  const realTerminate = worker.terminate.bind(worker);
  let terminateCount = 0;
  worker.terminate = () => {
    terminateCount += 1;
    return realTerminate();
  };
  const client = new DecoderClient(worker);

  let code = null;
  try {
    await client.init({ mode: 68, assets: tampered, limits: makeLimits() });
  } catch (error) {
    code = error.code;
  }

  // The client's own failure path must already have released the worker; this
  // close() is only a safety net and must not be the reason terminate ran.
  record('IAT-03 digest mismatch rejected',
    code === 18002 && terminateCount >= 1,
    `code=${code} terminates=${terminateCount}`);
  client.close();
}

// Stage-5 browser IAT for receiver-ux-v2 (T19).
//
// Groups run against the REAL receiver page (normal Edge + CDP) loading the
// FINAL staged modules and the real vendor WASM. Injections are explicit IAT
// adapters; scope=unit_integration; results are written to iat-results.json
// (never to the v1 results.json, never into ux-results.json).
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

// In-page setup for group 01: ONE persistent worker + client on the page
// (window.__iat01) so the CDP worker-handle injection stays on the SAME
// worker across submits. Each submit draws fresh pixels (the buffer is
// transferred and neutered per submit).
const IAT01_SETUP = `
  (async () => {
    window.__iat01 = await (async () => {
      const { DecoderClient } = await import('/src/decoder-client.js');
      const assets = await (await fetch('/config/asset-set.json')).json();
      const worker = new Worker('/worker/decoder-worker.js');
      const client = new DecoderClient(worker, { initTimeoutMs: 20000, frameTimeoutMs: 20000 });
      await client.init({ mode: 68, assets, limits: {} });
      return { worker, client, assets };
    })();
  })()
`;
const IAT01_SUBMIT = `
  (async () => {
    window.__iat01_submit = async (base64) => {
      const png = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
      const result = await window.__iat01.client.submitFrame({
        width: bitmap.width, height: bitmap.height, pixels: image.data.buffer,
      });
      return {
        outcome: result.outcome,
        bytes: result.bytesDecoded,
        observation: result.uxObservation || null,
        size: { width: bitmap.width, height: bitmap.height },
      };
    };
  })()
`;
const IAT01_SUBMIT_BLANK = `
  (async () => {
    window.__iat01_submitBlank = async () => {
      const size = 1024;
      const data = new Uint8ClampedArray(size * size * 4);
      const result = await window.__iat01.client.submitFrame({ width: size, height: size, pixels: data.buffer });
      return { outcome: result.outcome, bytes: result.bytesDecoded, observation: result.uxObservation || null };
    };
  })()
`;

async function findDecoderWorkerHandle(page) {
  let match = null;
  const sources = [page.workers ? page.workers() : [], page.context().workers ? page.context().workers() : []];
  for (const list of sources) {
    if (!Array.isArray(list)) continue;
    for (const worker of list) {
      if (worker.url().includes('decoder-worker')) match = worker;
    }
  }
  return match;
}

// ------------------------------------------------------------------ group 01
async function group01RealWasmReportBypass(stack, deps, addAssert) {
  const page = stack.receiver.page;
  await page.waitForFunction(() => typeof window.__state === 'string', null, { timeout: 30000 });
  const frameBase64 = deps.codeFrameBase64;
  if (!frameBase64) throw new Error('code frame fixture missing');

  await page.evaluate(IAT01_SETUP);
  await page.evaluate(IAT01_SUBMIT);
  await page.evaluate(IAT01_SUBMIT_BLANK);

  const baseline = await page.evaluate((base64) => window.__iat01_submit(base64), frameBase64);
  addAssert(
    'UX-IAT-01-A1',
    'real WASM decodes the captured code frame to a data outcome',
    `outcome=${baseline.outcome} bytes=${baseline.bytes} frame=${baseline.size.width}x${baseline.size.height}`,
    baseline.outcome === 'data' && baseline.bytes > 0,
  );
  addAssert(
    'UX-IAT-01-A2',
    'the positive case carries a valid optional report observation',
    JSON.stringify(baseline.observation),
    baseline.observation !== null && baseline.observation.version === 1
      && baseline.observation.report && baseline.observation.report.state !== 'unavailable'
      && Array.isArray(baseline.observation.report.ratios)
      && baseline.observation.report.ratios.every((value) => Number.isFinite(value) && value >= 0),
  );

  const blank = await page.evaluate(() => window.__iat01_submitBlank());
  addAssert(
    'UX-IAT-01-A3',
    'a no_data outcome never reads the shared report buffer',
    JSON.stringify(blank),
    blank.outcome === 'no_data' && blank.observation === null,
  );

  // Fault adapters IN the real worker; each adapter submits the SAME real
  // frame again - the original outcome must be identical, only the report
  // degrades, and restoring the original export brings the report back.
  const workerHandle = await findDecoderWorkerHandle(page);
  if (!workerHandle) throw new Error('decoder worker not exposed over CDP; cannot inject fault adapters');
  await workerHandle.evaluate(() => {
    self.__savedGetReport = Module._cimbard_get_report;
  });
  const adapters = [
    { name: 'missing-export-19001', script: 'delete Module._cimbard_get_report;', code: 19001 },
    { name: 'negative-length-19002', script: 'Module._cimbard_get_report = function () { return -1; };', code: 19002 },
    { name: 'truncated-1024-19003', script: 'Module._cimbard_get_report = function () { return 1024; };', code: 19003 },
    { name: 'bad-text-19004', script: 'Module._cimbard_get_report = function () { return 1023; };', code: 19004 },
  ];
  let adaptersOk = true;
  const adapterRows = [];
  for (const adapter of adapters) {
    await workerHandle.evaluate(adapter.script);
    const row = await page.evaluate((base64) => window.__iat01_submit(base64), frameBase64);
    const degraded = row.observation && row.observation.report
      && row.observation.report.state === 'unavailable'
      && row.observation.report.diagnosticCode === adapter.code;
    const outcomeUnchanged = row.outcome === baseline.outcome && row.bytes === baseline.bytes;
    adapterRows.push({ adapter: adapter.name, outcome: row.outcome, bytes: row.bytes,
      code: row.observation && row.observation.report && row.observation.report.diagnosticCode });
    if (!degraded || !outcomeUnchanged) adaptersOk = false;
  }
  await workerHandle.evaluate(() => {
    Module._cimbard_get_report = self.__savedGetReport;
    delete self.__savedGetReport;
  });
  const restored = await page.evaluate((base64) => window.__iat01_submit(base64), frameBase64);
  const restoredOk = restored.observation && restored.observation.report
    && restored.observation.report.state !== 'unavailable';

  addAssert(
    'UX-IAT-01-A4',
    'each report fault adapter degrades ONLY the report; the frame outcome stays identical',
    JSON.stringify(adapterRows),
    adaptersOk,
  );
  addAssert(
    'UX-IAT-01-A5',
    'removing the adapter restores the real report export',
    `state=${restored.observation && restored.observation.report && restored.observation.report.state} outcome=${restored.outcome}`,
    restoredOk && restored.outcome === baseline.outcome,
  );

  const closed = await page.evaluate(async () => {
    await window.__iat01.client.close();
    return window.__iat01.client.pendingSubmission();
  });
  addAssert(
    'UX-IAT-01-A6',
    'client close clears the pending submission metadata',
    JSON.stringify(closed),
    closed === null,
  );
}

export { group01RealWasmReportBypass, findDecoderWorkerHandle, sleep };

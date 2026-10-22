// Capability inspection. MUST NOT trigger any permission prompt: it only
// reads what the environment exposes. Capture and save pickers additionally
// require a secure context, so they are reported unavailable without one.
export const CAPABILITY_KEYS = [
  'secureContext', 'displayCapture', 'savePicker', 'wasm', 'worker', 'blob',
  'realtime', 'videoImport',
];

export function inspectCapabilities(env = globalThis) {
  const navigatorRef = env.navigator || {};
  const media = navigatorRef.mediaDevices || {};
  const secure = env.isSecureContext === true;

  const captureApi = typeof media.getDisplayMedia === 'function';
  const saveApi = typeof env.showSaveFilePicker === 'function';
  const wasm = typeof env.WebAssembly === 'object' &&
    env.WebAssembly !== null &&
    typeof env.WebAssembly.instantiate === 'function';
  const worker = typeof env.Worker === 'function';
  const blob = typeof env.Blob === 'function';

  const displayCapture = secure && captureApi;
  const savePicker = secure && saveApi;
  const realtime = displayCapture && wasm && worker;
  const videoImport = wasm && worker && blob;

  const reasons = [];
  if (!secure) reasons.push('a secure context (https or localhost) is required');
  if (!captureApi) reasons.push('screen capture is not available');
  if (!saveApi) reasons.push('the save picker is not available');
  if (!wasm) reasons.push('WebAssembly is not available');
  if (!worker) reasons.push('Web Workers are not available');

  return {
    secureContext: secure,
    displayCapture,
    savePicker,
    wasm,
    worker,
    blob,
    realtime,
    videoImport,
    reasons,
  };
}

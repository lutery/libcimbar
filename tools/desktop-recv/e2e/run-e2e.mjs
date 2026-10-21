// Real local E2E runner (round-1 review A-01).
//
// Receiver: a NORMALLY launched Edge (not Playwright-launched) attached over
// CDP. This host's Edge rejects cross-window capture from Playwright's
// automation instance with NotReadableError, while a normal instance captures
// real windows reliably. Sender: the original project sender, real Edge
// window, real file input. Dialogs: real OS dialogs driven by
// native-dialog.ps1 (typing/clicks only).
//
// Usage:
//   node run-e2e.mjs --case SMOKE
//   node run-e2e.mjs --case E2E-3  --source window
//   node run-e2e.mjs --case E2E-14
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readResults, sha256File, upsertResult, roundtripRecord, writeProof, writeResults,
} from './evidence.mjs';
import {
  evaluateBudgetLeg, evaluateVideoFailureLeg, expectedCodesForBadInput, RESTARTABLE_TERMINALS,
} from './leg-verdict.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const STAGING = join(REPO, 'build-desktop-recv', 'staging');
// Round-3 rectification: the user decided on a new run directory and a full
// re-run; run-02 is preserved untouched and no PASS is copied forward.
const RUN = join(REPO, 'docs', 'tests', 'runs', '20261021-teamexec-03');
const FIXTURES = join(REPO, 'docs', 'tests', 'runs', '20261018-teamexec-01', 'fixtures');
const PLANNING = join(REPO, 'docs', 'tests', 'planning-cases.json');
const SENDER_PORT = 8811;
const RECEIVER_PORT = 8771;
const DEBUG_PORT = 9445;
const RECORDER_PORT = 8790;        // serves the recording rig page (record-sender uses it too)
const RECORDER_DEBUG_PORT = 9453;  // separate from the receiver's CDP port
const SENDER_TITLE = 'CIMBAR-SENDER-WINDOW';
const NATIVE_HELPER = join(HERE, 'native-dialog.ps1');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
}
const CASE = args.get('case');
const SOURCE = args.get('source') || 'window';
if (!CASE) { console.error('usage: node run-e2e.mjs --case <CASE> [--source window|screen]'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...parts) => console.log(new Date().toISOString(), ...parts);

function startServer(command, argv, name) {
  const child = spawn(command, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (c) => process.stdout.write(`[${name}] ${c}`));
  child.stderr.on('data', (c) => process.stdout.write(`[${name}] ${c}`));
  return child;
}

async function waitHttp(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const response = await fetch(url); if (response.ok) return; } catch (e) { /* up soon */ }
    await sleep(200);
  }
  throw new Error(`endpoint did not come up: ${url}`);
}

function runHelper(helperArgs, pid = 0) {
  return new Promise((resolvePromise) => {
    const extra = pid > 0 ? ['-ProcessId', String(pid)] : [];
    const helper = spawn('pwsh', ['-NoProfile', '-File', NATIVE_HELPER, ...helperArgs, ...extra],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    helper.stdout.on('data', (c) => { out += c; process.stdout.write(`[helper] ${c}`); });
    helper.stderr.on('data', (c) => { out += c; process.stdout.write(`[helper] ${c}`); });
    helper.on('exit', (code) => resolvePromise({ code, out }));
  });
}

async function findEdgePid(profile) {
  for (let i = 0; i < 50; i += 1) {
    const pid = await new Promise((resolvePid) => {
      const ps = spawn('powershell', ['-NoProfile', '-Command',
        `$p = Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${profile}*' } | Select-Object -First 1; if ($p) { $p.ProcessId }`],
      { stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      ps.stdout.on('data', (c) => { out += c; });
      ps.on('exit', () => resolvePid(Number(out.trim()) || 0));
    });
    if (pid > 0) return pid;
    await sleep(300);
  }
  return 0;
}

async function pageState(page) {
  return page.evaluate(() => {
    const video = document.getElementById('preview');
    const videoButton = document.getElementById('btn-video');
    return {
      status: document.getElementById('status').textContent,
      log: document.getElementById('log').textContent,
      hasStream: !!video.srcObject,
      videoW: video.videoWidth,
      videoH: video.videoHeight,
      saveDisabled: document.getElementById('btn-save').disabled,
      stopDisabled: document.getElementById('btn-stop').disabled,
      artifactName: document.getElementById('artifact-name').textContent,
      artifactSize: document.getElementById('artifact-size').textContent,
      gdmError: window.__gdmError || null,
      saveError: window.__saveError || null,
      pickerResolved: window.__pickerResolved || null,
      writableCreated: window.__writableCreated === true,
      writeSucceeded: window.__writeSucceeded === true,
      createWritableAccessed: window.__createWritableAccessed === true,
      saveClicks: window.__saveClicks || 0,
      lastCaughtError: window.__lastCaughtError || null,
      stats: (window.__lastStats) || null,
      mediaError: window.__mediaError || null,
      mediaEnded: window.__mediaEnded || null,
      playError: window.__playError || null,
      // Round-3 A-R3/A-R2 product hooks. Read by name; a missing hook stays
      // null and the leg verdicts fail honestly instead of guessing.
      // __state is the internal state NAME (app.js writes snapshot.state);
      // cleanupComplete and artifact sizes live on the contract snapshot;
      // __journey carries init/receiving/ready/saved and the save marks.
      state: window.__state || null,
      cleanupComplete: (window.__contractSnapshot
        && typeof window.__contractSnapshot.cleanupComplete === 'boolean')
        ? window.__contractSnapshot.cleanupComplete : null,
      attemptId: (window.__videoTimeline && window.__videoTimeline.attemptId !== undefined)
        ? window.__videoTimeline.attemptId : null,
      statusTrail: Array.isArray(window.__statusTrail) ? window.__statusTrail : null,
      journey: window.__journey || null,
      videoTimeline: window.__videoTimeline || null,
      saveTimeline: window.__saveTimeline || null,
      videoDisabled: !!(videoButton && videoButton.disabled),
      contractSnapshot: window.__contractSnapshot || null,
    };
  });
}

// --- Round-3 A-R3/A-R2: per-leg observation helpers -------------------------

function internalStateOf(state) {
  const raw = state ? state.state : null;
  if (!raw) return null;
  if (typeof raw === 'string') return raw;
  return typeof raw.state === 'string' ? raw.state : null;
}

// A baseline is taken immediately BEFORE a dispatch. Verdicts read only the
// delta since it: an error line from an earlier leg can never satisfy a new
// leg (the reviewer's controlled replay did exactly that against the old
// cumulative-log waitFor).
function legBaseline(state) {
  return {
    logLength: (state.log || '').length,
    attemptId: state.attemptId === undefined ? null : state.attemptId,
    trailLength: Array.isArray(state.statusTrail) ? state.statusTrail.length : null,
    internalState: internalStateOf(state),
  };
}

function logDelta(baseline, state) {
  return (state.log || '').slice(baseline.logLength || 0);
}

// A bad-recording leg settles only on its own evidence: a restartable
// terminal state, a live video entry and a converged cleanup. saveDisabled
// is NOT an ending - the old runner treated it as one.
async function settleVideoLeg(page, { timeoutMs = 45000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = await pageState(page);
  while (Date.now() < deadline) {
    last = await pageState(page);
    const internal = internalStateOf(last);
    if (internal !== null && RESTARTABLE_TERMINALS.includes(internal)
        && last.videoDisabled === false && last.cleanupComplete === true) {
      return { settled: true, state: last };
    }
    await sleep(500);
  }
  return { settled: false, state: last };
}

// __journey marks are page-lifetime FIRSTS (app.js recordJourney keeps the
// first Receiving/Ready/Saved moment, and the first save request/close). A
// matrix runs many legs on one page, so each measured leg clears the
// diagnostics object immediately BEFORE its dispatch; the marks then describe
// that leg alone. Diagnostics-only field: product behavior is untouched.
async function resetJourneyMarks(page) {
  await page.evaluate(() => { window.__journey = {}; }).catch(() => {});
}

async function waitVideoEntryReady(page, timeoutMs = 20000) {
  await page.waitForFunction(() => {
    const button = document.getElementById('btn-video');
    return !!button && !button.disabled;
  }, null, { timeout: timeoutMs });
}

// Wall-clock boundaries from the receiver's own hooks (see summarize.py for
// the definitions). Field names are read with aliases because the hooks are
// product-side; a missing hook yields null, never an estimate.
function legTimings(state) {
  const pick = (...values) => values.find((v) => v !== undefined && v !== null) ?? null;
  const journey = state.journey || {};
  // The product currently records the save marks on __journey; a dedicated
  // __saveTimeline (if it ever appears) takes precedence.
  const saveTimeline = Array.isArray(state.saveTimeline)
    ? (state.saveTimeline[state.saveTimeline.length - 1] || {})
    : (state.saveTimeline || {});
  const timeline = state.videoTimeline || {};
  const initStartAt = pick(journey.initStartAt, journey.initStart, journey.initStartedAt);
  const initReadyAt = pick(journey.initReadyAt);
  const validInputStartAt = pick(journey.receivingAt, journey.receivingFirstAt, timeline.presentedAt);
  const reconstructionDoneAt = pick(journey.readyAt, journey.readyFirstAt);
  const saveRequestAt = pick(saveTimeline.saveRequestAt, saveTimeline.requestAt, journey.saveRequestAt);
  const writeCloseAt = pick(saveTimeline.writeCloseAt, saveTimeline.closeAt, journey.writeCloseAt);
  const diff = (a, b) => (a != null && b != null ? a - b : null);
  return {
    initStartAt, initReadyAt, validInputStartAt, reconstructionDoneAt, saveRequestAt, writeCloseAt,
    initMs: diff(validInputStartAt, initStartAt),
    reconstructMs: diff(reconstructionDoneAt, validInputStartAt),
    totalToReadyMs: diff(reconstructionDoneAt, initStartAt),
    saveMs: diff(writeCloseAt, saveRequestAt),
  };
}

function legSizes(state, rawBytes) {
  const snapshot = state.contractSnapshot || {};
  const artifact = snapshot.artifact || {};
  return {
    rawBytes: rawBytes ?? null,
    streamBytes: artifact.compressedBytes ?? null,
    artifactBytes: artifact.byteCount ?? null,
  };
}

function legButtons(state) {
  return {
    saveDisabled: state.saveDisabled,
    videoDisabled: state.videoDisabled,
    stopDisabled: state.stopDisabled,
  };
}

async function screenshot(page, caseId, name) {
  const target = join(RUN, 'proof', caseId, 'screens', name);
  mkdirSync(dirname(target), { recursive: true });
  await page.screenshot({ path: target });
  return `proof/${caseId}/screens/${name}`;
}

async function launchReceiver(port = RECEIVER_PORT) {
  const profile = mkdtempSync(join(tmpdir(), 'cimbar-e2e-'));
  const child = spawn(EDGE, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    '--disable-features=Translate,TranslateUI',
    '--disable-translate',
    '--window-position=1180,0',
    '--window-size=1380,900',
    `http://127.0.0.1:${port}/`,
  ], { stdio: 'ignore' });

  let connected = null;
  for (let i = 0; i < 60 && !connected; i += 1) {
    await sleep(300);
    try { connected = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`); }
    catch (e) { /* not up yet */ }
  }
  if (!connected) throw new Error('normal Edge did not expose CDP');
  const context = connected.contexts()[0];
  const page = context.pages()[0] || await context.newPage();
  // Install the diagnostics at CONTEXT level so a page created later (the
  // E2E-19 close/reopen leg) gets the same capture/save tracing as the
  // original page. Page-level scripts do not follow new tabs.
  await context.addInitScript(() => {
    const original = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = async (constraints) => {
      try { return await original(constraints); }
      catch (error) { window.__gdmError = { name: error.name, message: error.message }; throw error; }
    };
    // Record exactly which save API throws and with what raw error: the app
    // only surfaces the mapped 16003.
    const originalPicker = window.showSaveFilePicker.bind(window);
    window.showSaveFilePicker = async (options) => {
      try {
        const handle = await originalPicker(options);
        window.__pickerResolved = { name: handle.name, kind: handle.kind, at: Date.now() };
        // Access-tracing getter: distinguishes "createWritable was never
        // called" from "called but never settled".
        const descriptor = Object.getOwnPropertyDescriptor(FileSystemFileHandle.prototype, 'createWritable');
        Object.defineProperty(handle, 'createWritable', {
          get() {
            window.__createWritableAccessed = true;
            window.__createWritableAccessedAt = Date.now();
            return function (...args) {
              const result = descriptor.value.apply(this, args);
              Promise.resolve(result).then(() => {
                window.__writableCreated = true;
                window.__writableAt = Date.now();
              }, (error) => {
                window.__saveError = { at: 'instance.createWritable', name: error.name, message: error.message };
              });
              return result;
            };
          },
        });
        return handle;
      } catch (error) {
        window.__saveError = { at: 'showSaveFilePicker', name: error.name, message: error.message };
        throw error;
      }
    };
    if (window.FileSystemWritableFileStream && FileSystemWritableFileStream.prototype.write) {
      const originalWrite = FileSystemWritableFileStream.prototype.write;
      FileSystemWritableFileStream.prototype.write = async function (...args) {
        try {
          await originalWrite.apply(this, args);
          window.__writeSucceeded = true;
        } catch (error) {
          window.__saveError = { at: 'write', name: error.name, message: error.message };
          throw error;
        }
      };
    }
    // Count every real click on the Save button (capture phase, so a stray
    // keystroke-activated button press is visible too).
    document.addEventListener('click', (event) => {
      const target = event.composedPath()[0];
      const button = target && target.closest ? target.closest('#btn-save') : null;
      if (button) {
        window.__saveClicks = (window.__saveClicks || 0) + 1;
        window.__lastSaveClickAt = Date.now();
      }
    }, true);
    // The save controller discards the raw rejection it maps to 16003.
    // Record the last error seen by ANY .catch() so the discarded exception
    // (with its stack) becomes visible.
    const originalCatch = Promise.prototype.catch;
    Promise.prototype.catch = function (onRejected) {
      return originalCatch.call(this, (error) => {
        if (error instanceof Error) {
          window.__lastCaughtError = {
            name: error.name,
            message: error.message,
            stack: String(error.stack || '').split('\n').slice(0, 4).join(' | '),
            at: Date.now(),
          };
        }
        return onRejected(error);
      });
    };
    // Recorded-video diagnostics (harness-side only): media element errors,
    // play() rejections and ended events name why a video session dies.
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...playArgs) {
      const result = originalPlay.apply(this, playArgs);
      if (result && typeof result.catch === 'function') {
        result.catch((error) => {
          window.__playError = { name: error.name, message: error.message, at: Date.now() };
        });
      }
      return result;
    };
    document.addEventListener('error', (event) => {
      const target = event.target;
      if (target && (target.tagName === 'VIDEO' || target.tagName === 'AUDIO')) {
        window.__mediaError = {
          tag: target.tagName,
          code: target.error ? target.error.code : null,
          message: target.error ? target.error.message : null,
          at: Date.now(),
        };
      }
    }, true);
    document.addEventListener('ended', (event) => {
      const target = event.target;
      if (target && target.tagName === 'VIDEO') {
        window.__mediaEnded = { at: Date.now(), duration: target.duration, currentTime: target.currentTime };
      }
    }, true);
  });
  await page.goto(`http://127.0.0.1:${port}/`);
  try {
    await page.waitForSelector('#btn-video', { timeout: 60000 });
  } catch (error) {
    const url = page.url();
    const length = await page.content().then((c) => c.length).catch(() => -1);
    const shot = join(RUN, 'proof', 'diagnostics', 'receiver-page.png');
    mkdirSync(dirname(shot), { recursive: true });
    await page.screenshot({ path: shot }).catch(() => {});
    console.error(`receiver page did not load: url=${url} contentLength=${length} screenshot=${shot}`);
    throw error;
  }
  const pid = await findEdgePid(profile);
  if (!pid) throw new Error('could not resolve the normal Edge pid for this profile');
  return { child, profile, pid, browser: connected, page };
}

async function launchStack({ withSender = true } = {}) {
  const senderServer = withSender
    ? startServer('python', ['-m', 'http.server', String(SENDER_PORT), '--bind', '127.0.0.1',
      '--directory', join(STAGING, 'sender')], 'sender-http')
    : null;
  const receiverServer = startServer('python', [join(STAGING, 'receiver', 'server.py'),
    '--port', String(RECEIVER_PORT), '--directory', join(STAGING, 'receiver')], 'receiver-http');
  if (withSender) await waitHttp(`http://127.0.0.1:${SENDER_PORT}/`);
  await waitHttp(`http://127.0.0.1:${RECEIVER_PORT}/`);

  let senderBrowser = null; let senderPage = null;
  if (withSender) {
    senderBrowser = await chromium.launch({
      channel: 'msedge', headless: false,
      args: ['--window-position=0,0', '--window-size=1180,900',
        '--disable-features=Translate,TranslateUI', '--disable-translate', '--lang=en-US',
        '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
    });
    senderPage = await senderBrowser.newPage();
    await senderPage.goto(`http://127.0.0.1:${SENDER_PORT}/`);
  }

  const receiver = await launchReceiver();

  return {
    senderServer, receiverServer, senderBrowser, senderPage, receiver,
    async close() {
      await closeReceiver(receiver);
      await Promise.allSettled([senderBrowser && senderBrowser.close()]);
      if (senderServer) senderServer.kill();
      // Read the property, not the captured local: a scenario may replace
      // the receiver server (E2E-19 restarts it), and killing the stale
      // original leaks the replacement, which then keeps this process alive.
      if (this.receiverServer) this.receiverServer.kill();
      if (this.receiverServer !== receiverServer) receiverServer.kill();
    },
  };
}

// Detach CDP and stop the normal-Edge instance by its unique profile marker.
async function closeReceiver(receiver) {
  await receiver.browser.close().catch(() => {}); // detach
  const killer = spawn('powershell', ['-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${receiver.profile}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
  { stdio: 'ignore' });
  await new Promise((r) => killer.on('exit', r));
}

// A sender-only environment for journeys that launch their own receiver
// (E2E-1/2: the packaged launcher's server).
async function startSenderOnly() {
  const senderServer = startServer('python', ['-m', 'http.server', String(SENDER_PORT),
    '--bind', '127.0.0.1', '--directory', join(STAGING, 'sender')], 'sender-http');
  await waitHttp(`http://127.0.0.1:${SENDER_PORT}/`);
  const senderBrowser = await chromium.launch({
    channel: 'msedge', headless: false,
    args: ['--window-position=0,0', '--window-size=1180,900',
      '--disable-features=Translate,TranslateUI', '--disable-translate', '--lang=en-US',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
  });
  const senderPage = await senderBrowser.newPage();
  await senderPage.goto(`http://127.0.0.1:${SENDER_PORT}/`);
  return {
    senderServer, senderBrowser, senderPage,
    async close() {
      await Promise.allSettled([senderBrowser.close()]);
      senderServer.kill();
    },
  };
}

// ShowWindow on the sender's OS window, found by its page title (the page
// pins CIMBAR-SENDER-WINDOW). cmd: 6 = minimize, 9 = restore.
async function setSenderWindowState(nameMatch, cmd) {
  const script = `
Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System; using System.Runtime.InteropServices;
public class WinState {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
}
'@
$AE=[System.Windows.Automation.AutomationElement]
$cond=New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty,[System.Windows.Automation.ControlType]::Window)
$tops=$AE::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,$cond)
foreach($t in $tops){ if ("$($t.Current.Name)" -match '${nameMatch}') {
  [WinState]::ShowWindow([IntPtr]$t.Current.NativeWindowHandle, ${cmd}) | Out-Null
  'DONE'; break
} }
`;
  await new Promise((resolveState) => {
    const ps = spawn('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' });
    ps.on('exit', resolveState);
  });
  await sleep(400);
}

async function loadSenderFile(senderPage, filePath) {
  await senderPage.setInputFiles('#file_input', filePath);
  await sleep(1200);
  // The sender rewrites document.title when playback starts ("Cimbar: name"),
  // so the capture title is applied after loading and kept pinned. The page
  // is also marked not-translatable so Edge's translate bubble never covers
  // the code area.
  await senderPage.evaluate((title) => {
    document.documentElement.setAttribute('translate', 'no');
    document.documentElement.lang = 'en';
    document.title = title;
    setInterval(() => { if (document.title !== title) document.title = title; }, 250);
  }, SENDER_TITLE);
  await sleep(400);
}

// Chromium only opens the capture picker while its window is the active OS
// window. Bring the receiver to the front and deliver one real mouse click
// on a safe header area so the window is genuinely activated.
async function wakeWindow(pid) {
  if (!pid) return;
  const script = `
Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System; using System.Runtime.InteropServices;
public class Wake {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  public static void Activate(IntPtr h) {
    IntPtr fg = GetForegroundWindow(); uint p; uint ft = GetWindowThreadProcessId(fg, out p); uint self = GetCurrentThreadId();
    bool att = ft != 0 && ft != self && AttachThreadInput(self, ft, true);
    if (IsIconic(h)) ShowWindow(h, 9);
    SetForegroundWindow(h);
    if (att) AttachThreadInput(self, ft, false);
  }
  public static void ClickSafe(int x, int y) {
    SetCursorPos(x, y); System.Threading.Thread.Sleep(80);
    mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero); mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
  }
}
'@
$AE=[System.Windows.Automation.AutomationElement]
$cond=New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty,[System.Windows.Automation.ControlType]::Window)
$tops=$AE::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,$cond)
foreach($t in $tops){ if ($t.Current.ProcessId -eq ${pid}) {
  $r=$t.Current.BoundingRectangle
  [Wake]::Activate([IntPtr]$t.Current.NativeWindowHandle)
  Start-Sleep -Milliseconds 250
  [Wake]::ClickSafe([int]($r.Left + 300), [int]($r.Top + 12))
  'WOKEN'; break
} }
`;
  await new Promise((resolveWake) => {
    const ps = spawn('powershell', ['-NoProfile', '-Command', script],
      { stdio: ['ignore', 'ignore', 'ignore'] });
    ps.on('exit', resolveWake);
  });
  await sleep(400);
}

async function attachCapture(page, source, pid = 0, { retries = 2, readyTimeoutMs = 180000 } = {}) {
  const helperArgs = ['-Action', 'share', '-Tab', source === 'screen' ? 'screen' : 'window',
    '-TimeoutSec', '30'];
  if (source === 'window') helperArgs.push('-SourceTitle', SENDER_TITLE);

  for (let attempt = 0; ; attempt += 1) {
    await page.evaluate(() => { window.__gdmError = null; }).catch(() => {});
    await wakeWindow(pid);
    const helperPromise = runHelper(helperArgs, pid);
    await page.bringToFront();
    await sleep(200);
    await page.waitForFunction(() => !document.getElementById('btn-live').disabled, null, { timeout: 30000 });
    await clickButton(page, '#btn-live', 'share');
    const helper = await helperPromise;
    if (helper.code !== 0) {
      if (attempt < retries) {
        console.log(`[capture] attempt ${attempt + 1}: picker not found; retrying once`);
        await sleep(2500);
        continue;
      }
      const state = await pageState(page).catch(() => null);
      console.error('--- capture helper failure diagnostics ---');
      console.error('app state:', JSON.stringify(state));
      throw new Error(`capture helper failed: ${helper.out}`);
    }

    const deadline = Date.now() + readyTimeoutMs;
    let last = null;
    let gdmError = null;
    while (Date.now() < deadline) {
      last = await pageState(page);
      if (!last.saveDisabled) return last;
      if (last.gdmError) { gdmError = last.gdmError; break; }
      await sleep(1000);
    }
    if (gdmError) {
      // A cancel/denied picker is a real user situation; the journey
      // continues with one more real click, exactly like a user retrying.
      if (attempt < retries && /NotAllowed|Permission denied/i.test(`${gdmError.name} ${gdmError.message}`)) {
        console.log(`[capture] attempt ${attempt + 1} denied (${gdmError.name}); retrying once`);
        await sleep(2500);
        continue;
      }
      const error = new Error(`getDisplayMedia failed: ${gdmError.name}: ${gdmError.message}`);
      error.state = last;
      throw error;
    }
    const error = new Error(`receiver never reached Ready (status=${last && last.status})`);
    error.state = last;
    throw error;
  }
}

async function dumpWindows() {
  const script = `
Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes
$AE=[System.Windows.Automation.AutomationElement]
$cond=New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty,[System.Windows.Automation.ControlType]::Window)
$wins=$AE::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,$cond)
foreach($w in $wins){ "$($w.Current.ProcessId) | $($w.Current.ClassName) | $($w.Current.Name)" }
`;
  return new Promise((resolveDump) => {
    const ps = spawn('powershell', ['-NoProfile', '-Command', script],
      { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    ps.stdout.on('data', (c) => { out += c; });
    ps.on('exit', () => resolveDump(out.trim()));
  });
}

async function dismissEdgePromos(pid) {
  if (!pid) return;
  const script = `
Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes
$AE=[System.Windows.Automation.AutomationElement]
$CT=[System.Windows.Automation.ControlType]
$wc=New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty,$CT::Window)
$tops=$AE::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,$wc)
foreach($t in $tops){
  if ($t.Current.ProcessId -ne ${pid}) { continue }
  $nested=$t.FindAll([System.Windows.Automation.TreeScope]::Descendants,$wc)
  foreach($n in $nested){
    if ("$($n.Current.Name)" -match '同步用户配置|Sync your profile') {
      $bc=New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty,$CT::Button)
      $buttons=$n.FindAll([System.Windows.Automation.TreeScope]::Descendants,$bc)
      foreach($b in $buttons){ if ("$($b.Current.Name)" -match '^明白$|^Got it$') { $inv=$null; if ($b.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$inv)) { $inv.Invoke(); 'DISMISSED'; break } } }
    }
  }
}
`;
  await new Promise((resolveDismiss) => {
    const ps = spawn('powershell', ['-NoProfile', '-Command', script],
      { stdio: ['ignore', 'ignore', 'ignore'] });
    ps.on('exit', resolveDismiss);
  });
}

async function foregroundWindow(pid) {
  if (!pid) return;
  const script = `
Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System; using System.Runtime.InteropServices;
public class Fg {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  public static bool Force(IntPtr h) {
    IntPtr fg = GetForegroundWindow(); uint p; uint ft = GetWindowThreadProcessId(fg, out p); uint self = GetCurrentThreadId();
    bool att = ft != 0 && ft != self && AttachThreadInput(self, ft, true);
    if (IsIconic(h)) ShowWindow(h, 9);
    bool ok = SetForegroundWindow(h);
    if (att) AttachThreadInput(self, ft, false);
    return ok;
  }
}
'@
$AE=[System.Windows.Automation.AutomationElement]
$cond=New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty,[System.Windows.Automation.ControlType]::Window)
$tops=$AE::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,$cond)
foreach($t in $tops){ if ($t.Current.ProcessId -eq ${pid}) { [Fg]::Force([IntPtr]$t.Current.NativeWindowHandle) | Out-Null; 'FOREGROUNDED'; break } }
`;
  await new Promise((resolveFg) => {
    const ps = spawn('powershell', ['-NoProfile', '-Command', script],
      { stdio: ['ignore', 'pipe', 'ignore'] });
    ps.on('exit', resolveFg);
  });
}

async function captureDesktop(targetPath) {
  const script = `
Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing
$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height
$g=[System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size)
$bmp.Save('${targetPath.replace(/\\/g, '\\\\')}',[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
`;
  await new Promise((resolveShot) => {
    const ps = spawn('powershell', ['-NoProfile', '-Command', script],
      { stdio: ['ignore', 'ignore', 'ignore'] });
    ps.on('exit', resolveShot);
  });
}

async function saveArtifact(page, targetPath, pid = 0) {
  // The proof directories belong to this tool; a stale artifact from an
  // earlier failed round must not block (or be silently overwritten by) a
  // fresh save.
  if (existsSync(targetPath)) rmSync(targetPath);
  await wakeWindow(pid);
  const helperPromise = runHelper(['-Action', 'save', '-Path', targetPath, '-TimeoutSec', '40'], pid);
  await clickButton(page, '#btn-save', 'save');
  const helper = await helperPromise;
  if (helper.code !== 0) {
    const state = await pageState(page);
    const windows = await dumpWindows();
    const shot = join(RUN, 'proof', 'smoke', 'save-failure-desktop.png');
    mkdirSync(dirname(shot), { recursive: true });
    await captureDesktop(shot);
    console.error('--- save failure diagnostics ---');
    console.error('app status:', state.status);
    console.error('app log:', state.log);
    console.error('desktop screenshot:', shot);
    throw new Error(`save helper failed: ${helper.out}`);
  }
  // The write completes after the dialog resolves; wait until the app
  // reports the attempt as saved before the caller hashes the file. Capture
  // the desktop right away: a missed write-permission prompt shows here.
  const postShot = join(RUN, 'proof', 'smoke', 'post-save-desktop.png');
  mkdirSync(dirname(postShot), { recursive: true });
  await captureDesktop(postShot);
  const savedDeadline = Date.now() + 20000;
  while (Date.now() < savedDeadline) {
    const state = await pageState(page);
    if (state.status === 'Saved') break;
    if (/save failed/i.test(state.log)) {
      throw new Error(`the app reported a failed save: ${state.log.slice(-160)} | raw: ${JSON.stringify({
        saveError: state.saveError,
        pickerResolved: state.pickerResolved,
        writableCreated: state.writableCreated,
        writeSucceeded: state.writeSucceeded,
        createWritableAccessed: state.createWritableAccessed,
        saveClicks: state.saveClicks,
        lastCaughtError: state.lastCaughtError,
      })}`);
    }
    await sleep(500);
  }
  const finalState = await pageState(page);
  if (finalState.status !== 'Saved') {
    throw new Error(`the app never reported Saved (status=${finalState.status}) | raw: ${JSON.stringify({
      saveError: finalState.saveError,
      pickerResolved: finalState.pickerResolved,
      writableCreated: finalState.writableCreated,
      writeSucceeded: finalState.writeSucceeded,
      log: finalState.log.slice(-160),
    })}`);
  }
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && !existsSync(targetPath)) await sleep(250);
  if (!existsSync(targetPath)) throw new Error('saved file did not appear');
  return statSync(targetPath).size;
}

async function liveRoundtrip(stack, { caseId, file, round, source, resetMarks = false, readyTimeoutMs = 180000 }) {
  const fixture = isAbsolute(file) ? file : join(FIXTURES, file);
  const received = join(RUN, 'proof', caseId, `round-${round}`, 'received.bin');
  mkdirSync(dirname(received), { recursive: true });

  await loadSenderFile(stack.senderPage, fixture);
  await stack.senderPage.bringToFront();
  await sleep(300);
  await stack.receiver.page.bringToFront();
  await sleep(300);
  // Measured legs clear the page-lifetime journey marks right before the
  // dispatch, so the marks describe THIS leg (see resetJourneyMarks).
  if (resetMarks) await resetJourneyMarks(stack.receiver.page);

  const state = await attachCapture(stack.receiver.page, source, stack.receiver.pid, { readyTimeoutMs });
  log(`round ${round}: ${state.status} artifact=${state.artifactName} ${state.artifactSize}`);
  await screenshot(stack.receiver.page, caseId, `round-${round}-ready.png`);
  await saveArtifact(stack.receiver.page, received, stack.receiver.pid);
  const after = await pageState(stack.receiver.page);
  await screenshot(stack.receiver.page, caseId, `round-${round}-saved.png`);
  writeProof(RUN, caseId, `round-${round}/log.txt`,
    `status=${after.status}\nartifact=${after.artifactName} ${after.artifactSize}\nlog=${after.log}\n`);
  return { fixture, received, state: after };
}

async function videoRoundtrip(stack, { caseId, videoPath, originalPath, round, readyTimeoutMs = 240000 }) {
  const received = join(RUN, 'proof', caseId, `round-${round}`, 'received.bin');
  mkdirSync(dirname(received), { recursive: true });

  await importVideo(stack.receiver.page, videoPath);
  const deadline = Date.now() + readyTimeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await pageState(stack.receiver.page);
    if (!last.saveDisabled) break;
    await sleep(1000);
  }
  if (!last || last.saveDisabled) {
    throw new Error(`video session never reached Ready (status=${last && last.status}) | log=${JSON.stringify(last && last.log)} | gdm=${JSON.stringify(last && last.gdmError)}`);
  }
  await screenshot(stack.receiver.page, caseId, `round-${round}-ready.png`);
  await saveArtifact(stack.receiver.page, received, stack.receiver.pid);
  await screenshot(stack.receiver.page, caseId, `round-${round}-saved.png`);
  return { fixture: originalPath, videoPath, received, state: await pageState(stack.receiver.page) };
}

// Import a recording through the real file input: the file is handed to the
// input the same way the browser's own file dialog does it (DataTransfer),
// and the app's change handler runs unchanged. (Playwright's setInputFiles
// times out on this hidden input over a CDP connection.)
async function importVideo(page, videoPath) {
  const base64 = readFileSync(videoPath).toString('base64');
  await page.evaluate(async (encoded) => {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const file = new File([bytes], 'recording.webm', { type: 'video/webm' });
    const input = document.getElementById('file-input');
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, base64);
}

// --- Round-3 A-R2: in-journey recording rig (E2E-18 video legs) ------------
//
// The recorded-scale legs need a clip of a payload that only exists inside
// this run (the extended fixtures), so the same rig record-sender.mjs uses is
// embedded here: a normally launched Edge loads recorder.html, the real share
// picker is driven by native-dialog.ps1, and MediaRecorder captures the
// sender window for the requested duration. Bounds are declared by the CALLER
// before recording and recorded into the leg even when the bound aborts it.

async function launchRecorderPage() {
  const profile = mkdtempSync(join(tmpdir(), 'cimbar-e2e-rec-'));
  spawn(EDGE, [
    `--remote-debugging-port=${RECORDER_DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
    '--disable-features=Translate,TranslateUI', '--lang=en-US',
    '--window-position=1180,0', '--window-size=1180,900',
    `http://127.0.0.1:${RECORDER_PORT}/recorder.html`,
  ], { stdio: 'ignore' });
  let connected = null;
  for (let i = 0; i < 60 && !connected; i += 1) {
    await sleep(300);
    try { connected = await chromium.connectOverCDP(`http://127.0.0.1:${RECORDER_DEBUG_PORT}`); }
    catch (e) { /* not up yet */ }
  }
  if (!connected) throw new Error('recorder Edge did not expose CDP');
  const context = connected.contexts()[0];
  const page = context.pages()[0] || await context.newPage();
  await page.goto(`http://127.0.0.1:${RECORDER_PORT}/recorder.html`);
  await page.waitForSelector('#rec', { timeout: 30000 });
  const pid = await findEdgePid(profile);
  if (!pid) throw new Error('could not resolve the recorder Edge pid for this profile');
  return { profile, pid, browser: connected, page };
}

async function recordSenderClip(stack, { seconds, clipPath }) {
  await stack.senderPage.bringToFront();
  await sleep(300);
  // recorder.html lives in this tool's directory; serve it for the duration
  // of the recording only (record-sender.mjs does the same on this port).
  const recorderServer = startServer('python', ['-m', 'http.server', String(RECORDER_PORT),
    '--bind', '127.0.0.1', '--directory', HERE], 'recorder-http');
  try {
    await waitHttp(`http://127.0.0.1:${RECORDER_PORT}/recorder.html`);
    const recorder = await launchRecorderPage();
    try {
      await wakeWindow(recorder.pid);
      const helperPromise = runHelper(['-Action', 'share', '-Tab', 'window',
        '-SourceTitle', SENDER_TITLE, '-TimeoutSec', '30'], recorder.pid);
      const evaluatePromise = recorder.page.evaluate((ms) => window.__startRecording(ms), seconds * 1000);
      const [helper, result] = await Promise.all([helperPromise, evaluatePromise]);
      if (helper.code !== 0) throw new Error(`recording picker helper failed: ${helper.out}`);
      if (!result.ok) throw new Error(`recording failed: ${result.name}: ${result.message}`);
      const buffer = Buffer.from(result.base64, 'base64');
      mkdirSync(dirname(clipPath), { recursive: true });
      writeFileSync(clipPath, buffer);
      return { bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') };
    } finally {
      await closeReceiver(recorder).catch(() => {});
    }
  } finally {
    recorderServer.kill();
  }
}

// The extended matrix fixtures are generated deterministically by
// create-fixtures.py --extended (idempotent: same seed, same bytes).
async function ensureExtendedFixtures() {
  const result = await runCaptured('python', [
    join(REPO, 'tools', 'desktop-recv', 'create-fixtures.py'),
    '--root', RUN, '--extended',
  ], { cwd: REPO });
  const text = Buffer.concat([result.stdout, result.stderr]).toString('utf8');
  if (result.code !== 0) {
    throw new Error(`create-fixtures.py --extended failed (exit ${result.code}): ${text.slice(-400)}`);
  }
  return JSON.parse(readFileSync(join(RUN, 'fixtures-ext', 'manifest.json'), 'utf8'));
}

// The artifact budget actually configured for the staged receiver (never an
// assumed number): the profile the worker loads mirrors contracts.js.
function actualArtifactBudget() {
  const source = 'build-desktop-recv/staging/receiver/config/profile.json';
  try {
    const profile = JSON.parse(readFileSync(join(STAGING, 'receiver', 'config', 'profile.json'), 'utf8'));
    if (Number.isSafeInteger(profile.maxArtifactBytes)) {
      return { maxArtifactBytes: profile.maxArtifactBytes, source };
    }
  } catch (error) { /* unreadable profile is recorded below */ }
  return { maxArtifactBytes: null, source: `unreadable: ${source}` };
}

async function clickButton(page, selector, label) {
  try {
    await page.click(selector, { timeout: 15000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      status: document.getElementById('status') ? document.getElementById('status').textContent : null,
      saveDisabled: document.getElementById('btn-save') ? document.getElementById('btn-save').disabled : null,
      stopDisabled: document.getElementById('btn-stop') ? document.getElementById('btn-stop').disabled : null,
    })).catch(() => null);
    throw new Error(`click ${label} (${selector}) failed: ${error.message} | state=${JSON.stringify(state)}`);
  }
}

async function waitFor(page, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await pageState(page);
    if (predicate(last)) return last;
    await sleep(500);
  }
  throw new Error(`timeout waiting for ${label} (status=${last && last.status}) | ${JSON.stringify(last)}`);
}

// Start a capture and wait only for the stream (used by no-data journeys).
async function startCapture(stack, sourceTitle = SENDER_TITLE, { retries = 2 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    await wakeWindow(stack.receiver.pid);
    const helperPromise = runHelper(['-Action', 'share', '-Tab', 'window', '-SourceTitle', sourceTitle,
      '-TimeoutSec', '30'], stack.receiver.pid);
    await stack.receiver.page.bringToFront();
    await sleep(200);
    await stack.receiver.page.waitForFunction(
      () => !document.getElementById('btn-live').disabled, null, { timeout: 30000 });
    await clickButton(stack.receiver.page, '#btn-live', 'share');
    const helper = await helperPromise;
    if (helper.code === 0) break;
    if (attempt < retries) {
      console.log(`[capture] attempt ${attempt + 1}: picker not found; retrying once`);
      await sleep(2500);
      continue;
    }
    throw new Error(`capture helper failed: ${helper.out}`);
  }
  return waitFor(stack.receiver.page, (s) => s.hasStream, 20000, 'capture stream');
}

async function stopSession(stack) {
  const state = await pageState(stack.receiver.page);
  if (state.stopDisabled) {
    throw new Error(`stop is disabled at this point (status=${state.status}) | ${JSON.stringify({
      saveDisabled: state.saveDisabled, log: state.log.slice(-160),
    })}`);
  }
  await clickButton(stack.receiver.page, '#btn-stop', 'stop');
  return waitFor(stack.receiver.page, (s) => /stopped/i.test(s.status), 20000, 'stopped state');
}

// ---------------------------------------------------------------------------
// Encoding-boundary audit for the packaged-launch journey (E2E-1).
//
// The directory name is built from CODEPOINTS, never from a pasted literal:
// whatever encoding the file travels through, the test path cannot silently
// change. (The 8c59864 FAIL came from a package copied under a GBK-mojibake
// twin name while the launcher was invoked with the intended codepoints;
// pwsh then reported the genuinely missing file as "cannot be recognized as
// a script file name", which was misread as a platform defect.)
// (U+4E2D U+6587 U+0020 U+76EE U+5F55 U+0020 U+89E3 U+538B; no literal here)
const CJK_SPACE_DIR = String.fromCodePoint(0x4E2D, 0x6587, 0x20, 0x76EE, 0x5F55, 0x20, 0x89E3, 0x538B);

const codepointsOf = (value) => Array.from(value,
  (ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');

const utf8HexOf = (value) => Buffer.from(value, 'utf8').toString('hex').toUpperCase();

const bytesHex = (buffer, limit = 2048) => {
  const shown = buffer.subarray(0, Math.min(buffer.length, limit));
  const hex = shown.toString('hex').toUpperCase().replace(/(..)(?=.)/g, '$1 ');
  return buffer.length > limit ? `${hex} ... (${buffer.length} bytes, first ${limit} shown)` : hex;
};

const describeBoundary = (label, value) =>
  `${label}: text=${JSON.stringify(value)} codepoints=[${codepointsOf(value)}] utf8hex=${utf8HexOf(value)}`;

// Run a process to completion and keep stdout/stderr as BYTES: a mojibake
// round-trip can render plausibly while the bytes differ, so the audit
// records the hex the child actually emitted.
function runCaptured(command, argv, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, argv, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = []; const err = [];
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    child.on('error', rejectPromise);
    child.on('exit', (code, signal) => resolvePromise({
      code, signal, stdout: Buffer.concat(out), stderr: Buffer.concat(err),
    }));
  });
}

// Decode once as UTF-8 and once as the system ANSI/OEM codepage (936 here),
// so the evidence shows which reading is coherent.
function decodeBoth(buffer) {
  const utf8 = buffer.toString('utf8');
  let gbk = null;
  try { gbk = new TextDecoder('gbk').decode(buffer); } catch (error) { gbk = null; }
  return { utf8, gbk };
}

// fs.cpSync takes a C++ fast path (fsBinding.cpSyncCopyDir) whenever no
// filter is supplied. On this host (Node v22.23.1, Windows, ACP/OEM 936)
// that path writes a non-ASCII destination as a GBK-mojibake twin directory
// and leaves the intended directory EMPTY - silently. Reproduced in
// isolation: mkdirSync/writeFileSync/copyFileSync and cpSync's JavaScript
// path (forced with filter) all handle the same codepoints correctly.
// Copy entry by entry so the package lands where the audit looks for it.
function copyTreeSync(src, dest) {
  const info = statSync(src);
  if (info.isDirectory()) {
    mkdirSync(dest, { recursive: true });
    for (const name of readdirSync(src)) copyTreeSync(join(src, name), join(dest, name));
    return;
  }
  copyFileSync(src, dest);
}

// Filesystem proof, BEFORE any pwsh call: the package must live at exactly
// the codepoint-built path. Every sibling is listed with its codepoints, so
// a twin directory (e.g. a GBK-mojibake name left by an earlier run) is
// visible in the evidence instead of being mistaken for a loader failure.
function auditDestination(dest, audit) {
  audit.push(describeBoundary('boundary 1 (JS string) dest', dest));
  const parent = dirname(dest);
  const siblings = readdirSync(parent);
  audit.push(`boundary 2 (fs) parent ${parent} has ${siblings.length} entries:`);
  for (const name of siblings) audit.push(`  sibling ${describeBoundary('name', name)}`);
  const exact = siblings.filter((name) => name === CJK_SPACE_DIR).length;
  audit.push(`boundary 2 (fs) entries whose name is EXACTLY the codepoint name: ${exact}`);
  if (exact !== 1) {
    throw new Error(`expected exactly one directory with the exact codepoint name, found ${exact}`);
  }
  const info = statSync(dest);
  audit.push(`boundary 2 (fs) dest isDirectory=${info.isDirectory()}`);
  if (!info.isDirectory()) throw new Error('the codepoint destination is not a directory');
  const entries = readdirSync(dest);
  audit.push(`boundary 2 (fs) dest entries (${entries.length}): ${entries.join(', ')}`);
  for (const required of ['launch.cmd', 'launch.ps1', 'server.py', 'index.html',
    'config/asset-set.json', 'vendor/cimbar_js.wasm']) {
    const target = join(dest, required);
    const present = existsSync(target);
    audit.push(`boundary 2 (fs) required ${required} exists=${present} at ${describeBoundary('path', target)}`);
    if (!present) throw new Error(`package incomplete at the codepoint path: ${required} is missing`);
  }
}

const ENV_PROBE = [
  '$ErrorActionPreference = "Stop"',
  '"PSVersion=" + $PSVersionTable.PSVersion.ToString()',
  '"WinSystemLocale=" + (Get-WinSystemLocale).Name',
  '"Culture=" + (Get-Culture).Name',
  '"ConsoleInputCP=" + [Console]::InputEncoding.CodePage',
  '"ConsoleOutputCP=" + [Console]::OutputEncoding.CodePage',
  '$nls = Get-ItemProperty "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Nls\\CodePage"',
  '"ACP=" + $nls.ACP',
  '"OEMCP=" + $nls.OEMCP',
].join('; ');

// launch.ps1 starts the packaged server as a detached child and exits; the
// journey owns that process, so stop it when the journey ends. The command
// line is checked first, so a recycled pid is never killed.
async function stopPackagedServer(pid, dest) {
  if (!pid || !dest) return;
  const escaped = dest.replace(/'/g, "''");
  const script = '$p = Get-CimInstance Win32_Process -Filter "ProcessId=' + pid + '" -ErrorAction SilentlyContinue; '
    + `if ($p -and $p.CommandLine -like '*${escaped}*') { Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue; 'stopped' } else { 'not-ours' }`;
  await new Promise((resolveStop) => {
    const ps = spawn('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' });
    ps.on('exit', resolveStop);
    ps.on('error', resolveStop);
  });
}

const SCENARIOS = {
  SMOKE: async (stack, source) => {
    const result = await liveRoundtrip(stack, {
      caseId: 'smoke', file: join('compressible', 'sample-text-2.bin'), round: '1', source,
    });
    const original = sha256File(result.fixture);
    const received = sha256File(result.received);
    log(`SMOKE original=${original.slice(0, 12)} received=${received.slice(0, 12)} equal=${original === received}`);
    return original === received;
  },
  // E2E-1: candidate-package first launch from a CJK+space directory.
  //
  // Re-verification after the 8c59864 FAIL. That run blamed pwsh's -File
  // loader for rejecting CJK+space paths; the real cause was a corrupted
  // path in this test chain: the package had been copied under a
  // GBK-mojibake twin name while the launcher was invoked with the intended
  // codepoints, so pwsh reported a genuinely missing file ("cannot be
  // recognized as a script file name", exit 64). This scenario now builds
  // the name from codepoints, proves the filesystem matches before any
  // process starts, and logs the bytes at every boundary.
  'E2E-1': async (stack) => {
    const fixture = join(FIXTURES, 'compressible', 'sample-text-2.bin');
    const audit = [];
    let launchLog = null;
    let serverPid = 0;
    let receiver = null;
    let sender = null;
    let dest = null;
    const PORT1 = 8767; // the README's documented example port
    try {
      const cjkRoot = join(tmpdir(), 'cimbar-e2e-1');
      dest = join(cjkRoot, CJK_SPACE_DIR);
      rmSync(dest, { recursive: true, force: true });
      mkdirSync(dest, { recursive: true });
      copyTreeSync(join(STAGING, 'receiver'), dest);
      const launchDir = join(cjkRoot, 'plain-cwd');
      mkdirSync(launchDir, { recursive: true });
      auditDestination(dest, audit);

      // Environment facts: locale, console codepages, chcp's own answer.
      const envProbe = await runCaptured('pwsh', ['-NoProfile', '-Command', ENV_PROBE], { cwd: launchDir });
      audit.push(`env pwsh -Command exit=${envProbe.code}`);
      audit.push(`env pwsh text:\n${decodeBoth(envProbe.stdout).utf8.trim()}`);
      const chcp = await runCaptured('cmd.exe', ['/d', '/s', '/c', 'chcp'], { cwd: launchDir });
      const chcpText = decodeBoth(chcp.stdout);
      audit.push(`env chcp exit=${chcp.code} utf8=${JSON.stringify(chcpText.utf8.trim())} ` +
        `gbk=${JSON.stringify(chcpText.gbk ? chcpText.gbk.trim() : null)} hex=${bytesHex(chcp.stdout)}`);

      // Boundary 3: spawn argv -> pwsh -> script. A probe INSIDE the package
      // prints what the child actually received, so the path is observable on
      // both sides of the CreateProcessW boundary.
      const probePath = join(dest, 'encoding-probe.ps1');
      writeFileSync(probePath, [
        '$p = $PSCommandPath',
        "$codes = ($p.ToCharArray() | ForEach-Object { 'U+{0:X4}' -f [int]$_ }) -join ' '",
        "$hex = -join ([Text.Encoding]::UTF8.GetBytes($p) | ForEach-Object { $_.ToString('X2') })",
        'Write-Output "probe PSCommandPath=$p"',
        'Write-Output "probe codepoints=$codes"',
        'Write-Output "probe utf8hex=$hex"',
        'Write-Output "probe PSScriptRoot=$PSScriptRoot"',
      ].join('\r\n'), 'ascii');
      const probeArgs = ['-NoProfile', '-File', probePath];
      audit.push(`boundary 3 (spawn argv) ${JSON.stringify(probeArgs)}`);
      probeArgs.forEach((value, index) => audit.push(`  argv[${index}] ${describeBoundary('arg', value)}`));
      const probe = await runCaptured('pwsh', probeArgs, { cwd: launchDir });
      const probeText = decodeBoth(probe.stdout).utf8;
      audit.push(`boundary 3 (pwsh echo) exit=${probe.code} stdout hex=${bytesHex(probe.stdout)}`);
      audit.push(`boundary 3 (pwsh echo) text:\n${probeText.trim()}`);
      if (probe.code !== 0) throw new Error(`encoding probe exited ${probe.code}: ${probeText.trim()}`);
      if (!probeText.includes(codepointsOf(CJK_SPACE_DIR))) {
        throw new Error('the child pwsh did not echo the CJK+space codepoints');
      }
      if (!probeText.includes(utf8HexOf(CJK_SPACE_DIR))) {
        throw new Error('the child pwsh did not echo the CJK+space UTF-8 bytes');
      }

      // Boundary 3b: the exact form that failed in 8c59864 (absolute -File
      // from a different cwd). -Help loads and parses the launcher, then
      // exits 0 without binding the port.
      const helpArgs = ['-NoProfile', '-File', join(dest, 'launch.ps1'), '-Help'];
      audit.push(`boundary 3b (spawn argv) ${JSON.stringify(helpArgs)}`);
      helpArgs.forEach((value, index) => audit.push(`  argv[${index}] ${describeBoundary('arg', value)}`));
      const help = await runCaptured('pwsh', helpArgs, { cwd: launchDir });
      const helpText = decodeBoth(help.stdout).utf8;
      audit.push(`boundary 3b (absolute -File) exit=${help.code} ` +
        `stdout hex=${bytesHex(help.stdout)} stderr hex=${bytesHex(help.stderr)}`);
      audit.push(`boundary 3b (absolute -File) text:\n${helpText.trim()}`);
      if (help.code !== 0) {
        throw new Error(`pwsh -File absolute exited ${help.code}: ${decodeBoth(help.stderr).utf8.trim()}`);
      }
      if (!/usage: pwsh/i.test(helpText)) throw new Error('the launcher did not print its usage');

      // Boundary 4: the README-documented form (launch.cmd) from a different
      // cwd. cmd /s /c strips the FIRST and LAST quote on the line, so the
      // command is wrapped in an extra pair; without it cmd splits at the
      // first space (verified in isolation on this host).
      const cmdPath = join(dest, 'launch.cmd');
      const commandLine = `""${cmdPath}" -Port ${PORT1} -NoBrowser"`;
      audit.push(`boundary 4 (documented form) cmd.exe /d /s /c ${commandLine} cwd=${launchDir}`);
      audit.push(describeBoundary('boundary 4 launch.cmd', cmdPath));
      const launcher = spawn('cmd.exe', ['/d', '/s', '/c', commandLine],
        { cwd: launchDir, stdio: ['ignore', 'pipe', 'pipe'], windowsVerbatimArguments: true });
      const launchOut = []; const launchErr = [];
      launcher.stdout.on('data', (chunk) => launchOut.push(chunk));
      launcher.stderr.on('data', (chunk) => launchErr.push(chunk));
      launchLog = {
        code: await new Promise((r) => launcher.on('exit', r)),
        out: Buffer.concat(launchOut),
        err: Buffer.concat(launchErr),
      };
      const launchText = decodeBoth(Buffer.concat([launchLog.out, launchLog.err]));
      audit.push(`boundary 4 exit=${launchLog.code}`);
      audit.push(`boundary 4 stdout hex=${bytesHex(launchLog.out)}`);
      audit.push(`boundary 4 stderr hex=${bytesHex(launchLog.err)}`);
      audit.push(`boundary 4 stdout text: utf8=${JSON.stringify(launchText.utf8)} ` +
        `gbk=${JSON.stringify(launchText.gbk)}`);
      if (launchLog.code !== 0) {
        throw new Error(`launch.cmd exited ${launchLog.code}: ` +
          `${launchText.utf8.trim() || (launchText.gbk || '').trim()}`);
      }
      const pidMatch = /server pid (\d+)/.exec(launchText.utf8);
      if (pidMatch) serverPid = Number(pidMatch[1]);
      await waitHttp(`http://127.0.0.1:${PORT1}/`);
      const served = await (await fetch(`http://127.0.0.1:${PORT1}/config/asset-set.json`)).json();
      audit.push(`boundary 4 served assetSetId=${served.assetSetId} ` +
        `wasmSha256=${String(served.wasmSha256).slice(0, 16)}...`);

      sender = await startSenderOnly();
      receiver = await launchReceiver(PORT1);
      await loadSenderFile(sender.senderPage, fixture);
      await sender.senderPage.bringToFront();
      await sleep(300);
      await receiver.page.bringToFront();
      await sleep(300);
      const state = await attachCapture(receiver.page, 'window', receiver.pid);
      log(`e2e-1: live ${state.status} artifact=${state.artifactName}`);
      const livePath = join(RUN, 'proof', 'E2E-1', 'live', 'received.bin');
      mkdirSync(dirname(livePath), { recursive: true });
      await saveArtifact(receiver.page, livePath, receiver.pid);
      const liveEqual = sha256File(fixture) === sha256File(livePath);
      await sleep(1000);
      await importVideo(receiver.page, join(RUN, 'fixtures-media', 'V-GOOD-C.webm'));
      await waitFor(receiver.page, (s) => !s.saveDisabled, 240000, 'recorded import Ready');
      const recordedPath = join(RUN, 'proof', 'E2E-1', 'recorded', 'received.bin');
      mkdirSync(dirname(recordedPath), { recursive: true });
      await saveArtifact(receiver.page, recordedPath, receiver.pid);
      const recordedEqual = sha256File(fixture) === sha256File(recordedPath);
      await screenshot(receiver.page, 'E2E-1', 'packaged-receiver.png');

      const liveSha = sha256File(livePath);
      const recordedSha = sha256File(recordedPath);
      const originalSha = sha256File(fixture);
      writeProof(RUN, 'E2E-1', 'launch-log.txt', [
        `E2E-1 re-verification (${new Date().toISOString()})`,
        'Retraction: the 8c59864 FAIL ("pwsh cannot load from CJK+space") was a corrupted',
        'path in this test chain, not a platform defect. The original evidence is preserved',
        'at proof/E2E-1/first-run-fail/; this file is the re-verification record.',
        '',
        ...audit,
        '',
        `original sha256=${originalSha}`,
        `live      sha256=${liveSha} equal=${liveEqual}`,
        `recorded  sha256=${recordedSha} equal=${recordedEqual}`,
      ].join('\n'));
      const pass = liveEqual && recordedEqual;
      const record = roundtripRecord({
        caseId: 'E2E-1', originalPath: fixture, receivedPath: recordedPath, runDir: RUN,
        notes: 'filled by the caller below',
      });
      upsertResult(RUN, {
        ...record,
        result: pass ? 'PASS' : 'FAIL',
        notes: `packaged first launch from a codepoint-built CJK+space dir (${dest}); ` +
          `README-documented launch.cmd exit=${launchLog.code}; pwsh -File absolute preflight ` +
          `exit=${help.code}; live equal=${liveEqual} (${liveSha.slice(0, 12)}), V-GOOD-C recorded ` +
          `import equal=${recordedEqual} (${recordedSha.slice(0, 12)}); RETRACTION: the 8c59864 FAIL ` +
          'blamed a pwsh CJK+space platform defect, but the cause was a corrupted path in the test ' +
          'invocation chain (package copied under a GBK-mojibake twin name); original evidence ' +
          'preserved at proof/E2E-1/first-run-fail/',
      });
      return pass;
    } catch (error) {
      const launchText = launchLog
        ? decodeBoth(Buffer.concat([launchLog.out, launchLog.err])).utf8
        : '(launcher not started)';
      try {
        writeProof(RUN, 'E2E-1', 'launch-log.txt', [
          `E2E-1 failure (${new Date().toISOString()})`,
          `launch exit=${launchLog ? launchLog.code : 'n/a'}`,
          launchText,
          '',
          'encoding audit:',
          ...audit,
          '',
          String(error.stack || error.message),
        ].join('\n'));
        const observation = join(RUN, 'proof', 'E2E-1', 'observation.txt');
        mkdirSync(dirname(observation), { recursive: true });
        writeFileSync(observation, `E2E-1 observation (${new Date().toISOString()})\n${error.message}\n`);
      } catch (writeError) {
        console.error('could not write the E2E-1 failure evidence:', writeError);
      }
      upsertResult(RUN, {
        caseId: 'E2E-1', scope: 'local_simulated', caseType: 'negative_or_lifecycle', result: 'FAIL',
        executedBy: 'executor',
        proofRefs: ['proof/E2E-1/observation.txt'],
        notes: `packaged-launch re-verification did not complete: ${String(error.message).slice(0, 160)}`,
      });
      return false;
    } finally {
      if (receiver) await closeReceiver(receiver).catch(() => {});
      if (sender) await sender.close().catch(() => {});
      await stopPackagedServer(serverPid, dest).catch(() => {});
    }
  },
  // E2E-2: startup-failure recovery. With the port occupied, launch.ps1 must
  // exit non-zero with a readable reason; after freeing it, a clean relaunch
  // serves a usable page that completes a live roundtrip.
  'E2E-2': async (stack) => {
    const fixture = join(FIXTURES, 'compressible', 'sample-text-2.bin');
    try {
      const PORT2 = 8766;
      const launchArgs = ['-NoProfile', '-File', join(STAGING, 'receiver', 'launch.ps1'),
        '-Port', String(PORT2), '-NoBrowser'];
      const occupier = spawn('powershell', ['-NoProfile', '-Command',
        `$l=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,${PORT2}); $l.Start(); Start-Sleep -Seconds 90; $l.Stop()`],
        { stdio: 'ignore' });
      await sleep(1500);
      let busyLog = ''; let busyCode = null;
      const busyLauncher = spawn('pwsh', launchArgs, { cwd: tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
      busyLauncher.stdout.on('data', (c) => { busyLog += c; });
      busyLauncher.stderr.on('data', (c) => { busyLog += c; });
      busyCode = await new Promise((r) => busyLauncher.on('exit', r));
      writeProof(RUN, 'E2E-2', 'launch-busy.log.txt', `exit=${busyCode}\n${busyLog}`);
      if (busyCode === 0) throw new Error('launch.ps1 succeeded while the port was occupied');
      const busyReason = /already in use|端口/i.test(busyLog);
      if (!busyReason) throw new Error(`non-zero launch had no readable port reason: ${busyLog}`);
      occupier.kill();
      await sleep(1000);
      let okLog = ''; let okCode = null;
      const okLauncher = spawn('pwsh', launchArgs, { cwd: tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
      okLauncher.stdout.on('data', (c) => { okLog += c; });
      okLauncher.stderr.on('data', (c) => { okLog += c; });
      okCode = await new Promise((r) => okLauncher.on('exit', r));
      if (okCode !== 0) throw new Error(`clean relaunch failed (${okCode}): ${okLog}`);
      await waitHttp(`http://127.0.0.1:${PORT2}/`);
      const sender = await startSenderOnly();
      const receiver = await launchReceiver(PORT2);
      try {
        await loadSenderFile(sender.senderPage, fixture);
        await sender.senderPage.bringToFront();
        await sleep(300);
        await receiver.page.bringToFront();
        await sleep(300);
        const state = await attachCapture(receiver.page, 'window', receiver.pid);
        const livePath = join(RUN, 'proof', 'E2E-2', 'live', 'received.bin');
        mkdirSync(dirname(livePath), { recursive: true });
        await saveArtifact(receiver.page, livePath, receiver.pid);
        const liveEqual = sha256File(fixture) === sha256File(livePath);
        writeProof(RUN, 'E2E-2', 'launch-ok.log.txt', `exit=${okCode}\n${okLog}`);
        await screenshot(receiver.page, 'E2E-2', 'recovered-receiver.png');
        const record = roundtripRecord({
          caseId: 'E2E-2', originalPath: fixture, receivedPath: livePath, runDir: RUN,
          notes: 'filled by the caller below',
        });
        upsertResult(RUN, {
          ...record,
          result: liveEqual ? 'PASS' : 'FAIL',
          notes: `occupied-port launch exited ${busyCode} with a readable reason=${busyReason}; ` +
            `clean relaunch exit=${okCode}; recovery live roundtrip equal=${liveEqual}`,
        });
        return busyReason && liveEqual;
      } finally {
        await closeReceiver(receiver);
        await sender.close();
      }
    } catch (error) {
      const observation = join(RUN, 'proof', 'E2E-2', 'observation.txt');
      mkdirSync(dirname(observation), { recursive: true });
      writeFileSync(observation, `E2E-2 observation (${new Date().toISOString()})\n${error.message}\n`);
      upsertResult(RUN, {
        caseId: 'E2E-2', scope: 'local_simulated', caseType: 'negative_or_lifecycle', result: 'FAIL',
        executedBy: 'executor',
        proofRefs: ['proof/E2E-2/observation.txt'],
        notes: `startup-failure journey did not complete: ${String(error.message).slice(0, 160)}`,
      });
      return false;
    }
  },
  // E2E-3: live roundtrip, both data classes x 3 rounds.
  'E2E-3': async (stack, source) => {
    const rounds = [];
    for (const [label, file] of [
      ['compressible', join('compressible', 'sample-text-2.bin')],
      ['incompressible', join('incompressible', 'sample-random-2.bin')],
    ]) {
      for (let i = 1; i <= 3; i += 1) {
        rounds.push(await liveRoundtrip(stack, { caseId: 'E2E-3', file, round: `${label}-${i}`, source }));
      }
    }
    const pairs = rounds.map((entry) => ({
      original: sha256File(entry.fixture), received: sha256File(entry.received),
    }));
    const allEqual = pairs.every((pair) => pair.original === pair.received);
    upsertResult(RUN, {
      ...roundtripRecord({
        caseId: 'E2E-3',
        originalPath: rounds[0].fixture,
        receivedPath: rounds[0].received,
        runDir: RUN,
        notes: `live x ${rounds.length} rounds (2 classes x 3); all ${pairs.length} pairs equal=${allEqual}; per-round proof under proof/E2E-3/round-*`,
      }),
      result: allEqual ? 'PASS' : 'FAIL',
    });
    return allEqual;
  },
  // E2E-14: recorded import of REAL sender-window videos (2 classes x 3).
  'E2E-14': async (stack) => {
    const media = join(RUN, 'fixtures-media');
    const rounds = [];
    for (const [label, video, original] of [
      ['compressible', 'V-GOOD-C.webm', join('compressible', 'sample-text-2.bin')],
      ['incompressible', 'V-GOOD-N.webm', join('incompressible', 'sample-random-2.bin')],
    ]) {
      for (let i = 1; i <= 3; i += 1) {
        rounds.push(await videoRoundtrip(stack, {
          caseId: 'E2E-14', videoPath: join(media, video), originalPath: join(FIXTURES, original),
          round: `${label}-${i}`,
        }));
      }
    }
    const pairs = rounds.map((entry) => ({
      original: sha256File(entry.fixture), received: sha256File(entry.received),
    }));
    const allEqual = pairs.every((pair) => pair.original === pair.received);
    upsertResult(RUN, {
      ...roundtripRecord({
        caseId: 'E2E-14',
        originalPath: rounds[0].fixture,
        receivedPath: rounds[0].received,
        runDir: RUN,
        notes: `real sender-window recordings (V-GOOD-C/N) x ${rounds.length} rounds; all pairs equal=${allEqual}; video sha256 ${sha256File(rounds[0].videoPath).slice(0, 12)}…`,
      }),
      result: allEqual ? 'PASS' : 'FAIL',
    });
    return allEqual;
  },
  // E2E-4: cancel the real source picker, then restart and complete.
  'E2E-4': async (stack) => {
    await loadSenderFile(stack.senderPage, join(FIXTURES, 'compressible', 'sample-text-1.bin'));
    const cancelPromise = runHelper(['-Action', 'share-cancel', '-TimeoutSec', '20'], stack.receiver.pid);
    await clickButton(stack.receiver.page, '#btn-live', 'share');
    const cancel = await cancelPromise;
    if (cancel.code !== 0) throw new Error(`share-cancel failed: ${cancel.out}`);
    const rejected = await waitFor(stack.receiver.page, (s) => /12002/.test(s.log) && !s.hasStream,
      15000, 'picker rejection');
    const round = await liveRoundtrip(stack, {
      caseId: 'E2E-4', file: join('compressible', 'sample-text-1.bin'), round: 'restart', source: 'window',
    });
    const equal = sha256File(round.fixture) === sha256File(round.received);
    upsertResult(RUN, {
      ...roundtripRecord({
        caseId: 'E2E-4', originalPath: round.fixture, receivedPath: round.received, runDir: RUN,
        notes: `picker cancel -> ${rejected.status} (12002) -> restart -> roundtrip equal=${equal}`,
      }),
      result: equal ? 'PASS' : 'FAIL',
    });
    return equal;
  },
  // E2E-5: share a blank (non-encoding) window -> no data -> stop -> reselect.
  'E2E-5': async (stack) => {
    try {
      await stack.senderPage.evaluate((title) => {
        document.title = title;
        setInterval(() => { if (document.title !== title) document.title = title; }, 250);
      }, SENDER_TITLE);
      await sleep(300);
      await stack.senderPage.bringToFront();
      await sleep(300);
      await stack.receiver.page.bringToFront();
      await sleep(300);
      const capture = await startCapture(stack);
      await sleep(7000); // let the no-data notice window pass
      // Round-7 B-3a: the capture-time snapshot cannot prove anything about
      // the observation window. Read the page state AFTER the window and
      // assert the absence of an artifact from that reading.
      const afterWindow = await pageState(stack.receiver.page);
      const stillNoArtifact = afterWindow.saveDisabled === true;
      await stopSession(stack);
      const round = await liveRoundtrip(stack, {
        caseId: 'E2E-5', file: join('compressible', 'sample-text-2.bin'), round: 'reselect', source: 'window',
      });
      const equal = sha256File(round.fixture) === sha256File(round.received);
      upsertResult(RUN, {
        ...roundtripRecord({
          caseId: 'E2E-5', originalPath: round.fixture, receivedPath: round.received, runDir: RUN,
          notes: `blank window: capture status=${capture.status}; after the 7 s observation window ` +
            `status=${afterWindow.status} saveDisabled=${afterWindow.saveDisabled} ` +
            `artifact=${JSON.stringify(afterWindow.artifactName)}; stop -> reselect sender -> equal=${equal}`,
        }),
        result: stillNoArtifact && equal ? 'PASS' : 'FAIL',
      });
      return stillNoArtifact && equal;
    } catch (error) {
      const observation = join(RUN, 'proof', 'E2E-5', 'observation.txt');
      mkdirSync(dirname(observation), { recursive: true });
      writeFileSync(observation, `E2E-5 observation (${new Date().toISOString()})\n${error.message}\n`);
      upsertResult(RUN, {
        caseId: 'E2E-5', scope: 'local_simulated', caseType: 'negative_or_lifecycle', result: 'FAIL',
        executedBy: 'executor',
        proofRefs: ['proof/E2E-5/observation.txt'],
        notes: `blank-window/recovery journey did not complete: ${String(error.message).slice(0, 160)}`,
      });
      return false;
    }
  },
  // E2E-8: mode mismatch. The support matrix verifies ONLY mode B (68);
  // 4C is outside the verified set ("8C/Bu/Bm 模式解码" is listed as not
  // claimed, and 模式 B（68） is the only verified mode). The sender is
  // switched to 4C: the receiver must NOT reach Ready/artifact within a
  // bounded window (no false completion), then a stop and a switch back to
  // B recovers with a hash-clean roundtrip.
  'E2E-8': async (stack) => {
    const fixture = join(FIXTURES, 'compressible', 'sample-text-2.bin');
    try {
      await loadSenderFile(stack.senderPage, fixture);
      await stack.senderPage.evaluate(() => Main.setMode('4C'));
      await sleep(800);
      const modeApplied = await stack.senderPage.evaluate(
        () => document.getElementById('nav-container').className.includes('mode-4c'));
      if (!modeApplied) throw new Error('the sender did not switch to 4C (still mode-b)');
      await stack.senderPage.bringToFront();
      await sleep(300);
      await stack.receiver.page.bringToFront();
      await sleep(300);
      await startCapture(stack);
      const before = Date.now();
      let mismatchState = null;
      const deadline = before + 30000;
      while (Date.now() < deadline) {
        mismatchState = await pageState(stack.receiver.page);
        if (mismatchState.status === 'File ready to save' || mismatchState.saveDisabled === false) {
          throw new Error(`FALSE COMPLETION in 4C mode after ${Date.now() - before} ms: ${JSON.stringify(mismatchState)}`);
        }
        if (/went wrong/i.test(mismatchState.status)) break;
        await sleep(500);
        }
      const noFalseReady = mismatchState.saveDisabled === true;
      const elapsed = Date.now() - before;
      log(`[e2e-8] 4C bounded window: no Ready within ${elapsed} ms, status="${mismatchState.status}"`);
      await screenshot(stack.receiver.page, 'E2E-8', 'mode-4c-no-ready.png');
      await stopSession(stack);
      // PRODUCT FINDING (documented in the record): flipping the sender's
      // in-page mode selector back to B restores the UI class but NOT a
      // decodable stream - the receiver stayed frame-starved for 180 s in
      // two runs. The user-path recovery is a sender page reload (the
      // selector's default is B), which is what this journey does.
      await stack.senderPage.evaluate(() => Main.setMode('B'));
      await sleep(500);
      const flipBackClass = await stack.senderPage.evaluate(
        () => document.getElementById('nav-container').className);
      await stack.senderPage.reload();
      await sleep(1200);
      let round = null;
      try {
        round = await liveRoundtrip(stack, {
          caseId: 'E2E-8', file: join('compressible', 'sample-text-2.bin'), round: 'recover-B', source: 'window',
        });
      } catch (attachError) {
        if (attachError.state) {
          writeProof(RUN, 'E2E-8', 'recover-state.json', JSON.stringify(attachError.state, null, 2));
        }
        throw attachError;
      }
      const equal = sha256File(round.fixture) === sha256File(round.received);
      writeProof(RUN, 'E2E-8', 'log.txt', [
        'support matrix: "模式 | B（68） | IAT-01/05 实测" is the only verified mode;',
        '非支持表 lists "8C/Bu/Bm 模式解码" as not claimed - 4C is outside the',
        'verified set, and the receiver never claims 4C support.',
        `4C mismatch: no Ready within ${elapsed} ms (status="${mismatchState.status}", no artifact)`,
        `switch back to B: roundtrip equal=${equal}`,
      ].join('\n') + '\n');
      const pass = noFalseReady && equal;
      const record = roundtripRecord({
        caseId: 'E2E-8', originalPath: round.fixture, receivedPath: round.received, runDir: RUN,
        notes: 'filled by the caller below',
      });
      upsertResult(RUN, {
        ...record,
        result: pass ? 'PASS' : 'FAIL',
        notes: `4C sender (outside the matrix's verified mode B): no Ready in ${elapsed} ms, no false ` +
          `artifact; in-page flip-back to B does NOT restore a decodable stream (180 s frame-starved, ` +
          `PRODUCT FINDING); sender reload with default B recovers, roundtrip equal=${equal}; ` +
          'matrix quoted: "模式 | B（68） | IAT-01/05 实测" (verified), "8C/Bu/Bm 模式解码" not claimed',
      });
      return pass;
    } catch (error) {
      const observation = join(RUN, 'proof', 'E2E-8', 'observation.txt');
      mkdirSync(dirname(observation), { recursive: true });
      writeFileSync(observation, `E2E-8 observation (${new Date().toISOString()})\n${error.message}\n`);
      upsertResult(RUN, {
        caseId: 'E2E-8', scope: 'local_simulated', caseType: 'negative_or_lifecycle', result: 'FAIL',
        executedBy: 'executor',
        proofRefs: ['proof/E2E-8/observation.txt'],
        notes: `mode-mismatch journey did not complete: ${String(error.message).slice(0, 160)}`,
      });
      return false;
    }
  },
  // E2E-9: DPI/zoom/window-size. The support matrix claims NO specific
  // non-default DPI/zoom combos ("其他 DPI / 缩放组合 | 需真实桌面交互"),
  // so the truthful scope is: default roundtrip, real window resizes, and
  // a real rendered-scale change (CDP setPageScaleFactor 1.5 on the
  // receiver), plus the honest statement that OS display scaling is not
  // covered here (not automatable; the matrix does not claim it either).
  'E2E-9': async (stack) => {
    try {
      const file = join('compressible', 'sample-text-2.bin');
      const legs = [];
      const run = async (label) => {
        const round = await liveRoundtrip(stack, {
          caseId: 'E2E-9', file, round: label, source: 'window',
        });
        return sha256File(round.fixture) === sha256File(round.received);
      };
      legs.push({ label: 'default', equal: await run('default') });
      await stack.senderPage.setViewportSize({ width: 900, height: 700 });
      const cdp = await stack.receiver.page.context().newCDPSession(stack.receiver.page);
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.5 });
      await sleep(800);
      legs.push({ label: 'sender 900x700 + receiver render scale 1.5', equal: await run('small-scaled') });
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.0 });
      await stack.senderPage.setViewportSize({ width: 1400, height: 950 });
      await sleep(800);
      legs.push({ label: 'sender 1400x950, scale back to 1.0', equal: await run('large-default-scale') });
      await stack.senderPage.setViewportSize({ width: 1180, height: 900 });
      const allEqual = legs.every((leg) => leg.equal);
      writeProof(RUN, 'E2E-9', 'log.txt', [
        ...legs.map((leg) => `${leg.label}: equal=${leg.equal}`),
        'OS display scaling is NOT covered: not automatable from this harness and',
        'the support matrix claims no such combo ("其他 DPI / 缩放组合 | 需真实桌面交互（E2E-9）").',
        'The decode path samples the video element intrinsic size, so render scale',
        'changes do not silently resample the transfer (hash equality proves it).',
      ].join('\n') + '\n');
      const record = roundtripRecord({
        caseId: 'E2E-9', originalPath: join(FIXTURES, file), receivedPath: join(RUN, 'proof', 'E2E-9', 'round-large-default-scale', 'received.bin'), runDir: RUN,
        notes: 'filled by the caller below',
      });
      upsertResult(RUN, {
        ...record,
        result: allEqual ? 'PASS' : 'FAIL',
        notes: `3 window/zoom legs all hash-clean=${allEqual} (default; sender 900x700 + receiver render ` +
          'scale 1.5; sender 1400x950 + scale 1.0). OS display scaling not covered (not automatable; ' +
          'matrix claims no such combo: "其他 DPI / 缩放组合 | 需真实桌面交互（E2E-9）")',
      });
      return allEqual;
    } catch (error) {
      const observation = join(RUN, 'proof', 'E2E-9', 'observation.txt');
      mkdirSync(dirname(observation), { recursive: true });
      writeFileSync(observation, `E2E-9 observation (${new Date().toISOString()})\n${error.message}\n`);
      upsertResult(RUN, {
        caseId: 'E2E-9', scope: 'local_simulated', caseType: 'negative_or_lifecycle', result: 'FAIL',
        executedBy: 'executor',
        proofRefs: ['proof/E2E-9/observation.txt'],
        notes: `DPI/zoom journey did not complete: ${String(error.message).slice(0, 160)}`,
      });
      return false;
    }
  },
  // E2E-10: focus / occlusion / minimize. Leg 1: the normal flow with the
  // receiver page in front. Leg 2: minimize the sender window mid-capture -
  // no frames must NOT produce a false success (finite state, no phantom
  // artifact) - then restore: the transfer completes and saves hash-clean.
  'E2E-10': async (stack) => {
    try {
      // 1 MiB random: live transfer takes tens of seconds, so a minimize at
      // ~2 s is genuinely mid-transfer (a 64 KiB payload completes before
      // the starvation window could be tested, which run 1 proved).
      const bigFile = join(RUN, 'fixtures-media', 'payload-1m-e2e10.bin');
      writeFileSync(bigFile, randomBytes(1048576));
      const file = bigFile;
      const front = async () => {
        await stack.senderPage.bringToFront();
        await sleep(300);
        await stack.receiver.page.bringToFront();
        await sleep(300);
      };
      const frontRound = await liveRoundtrip(stack, {
        caseId: 'E2E-10', file: join(FIXTURES, 'incompressible', 'sample-random-2.bin'), round: 'receiver-front', source: 'window',
      });
      const frontEqual = sha256File(frontRound.fixture) === sha256File(frontRound.received);
      log(`[e2e-10] receiver-front roundtrip equal=${frontEqual}`);

      await loadSenderFile(stack.senderPage, file);
      await front();
      await startCapture(stack);
      await waitFor(stack.receiver.page, (s) => /Receiving frames/.test(s.status), 30000, 'receiving');
      await setSenderWindowState('CIMBAR-SENDER-WINDOW', 6);
      const before = Date.now();
      let minState = null;
      const deadline = before + 15000;
      while (Date.now() < deadline) {
        minState = await pageState(stack.receiver.page);
        if (minState.status === 'File ready to save' || minState.saveDisabled === false) {
          throw new Error(`FALSE COMPLETION while the sender was minimized: ${JSON.stringify(minState)}`);
        }
        await sleep(500);
      }
      const noFalseReady = minState.saveDisabled === true;
      log(`[e2e-10] minimized 15 s: no false Ready, status="${minState.status}"`);
      await screenshot(stack.receiver.page, 'E2E-10', 'minimized-no-frames.png');
      await setSenderWindowState('CIMBAR-SENDER-WINDOW', 9);
      await waitFor(stack.receiver.page, (s) => !s.saveDisabled, 180000, 'restored transfer Ready');
      const savedPath = join(RUN, 'proof', 'E2E-10', 'restored', 'received.bin');
      mkdirSync(dirname(savedPath), { recursive: true });
      await saveArtifact(stack.receiver.page, savedPath, stack.receiver.pid);
      const restoredEqual = sha256File(file) === sha256File(savedPath);
      writeProof(RUN, 'E2E-10', 'log.txt', [
        `receiver-in-front roundtrip equal=${frontEqual}`,
        `sender minimized 15 s mid-capture: no false Ready (status="${minState.status}"), no artifact`,
        `restore -> transfer completes, save equal=${restoredEqual}`,
        'occlusion variant is covered by the minimize leg: both deprive the capture of frames',
        'and the app-visible contract (no false success while starved, recovery on supply) is the same',
      ].join('\n') + '\n');
      const pass = frontEqual && noFalseReady && restoredEqual;
      const record = roundtripRecord({
        caseId: 'E2E-10', originalPath: file, receivedPath: savedPath, runDir: RUN,
        notes: 'filled by the caller below',
      });
      upsertResult(RUN, {
        ...record,
        result: pass ? 'PASS' : 'FAIL',
        notes: `receiver-front roundtrip equal=${frontEqual}; sender minimized mid-capture 15 s: ` +
          `no false Ready (status="${minState.status}"), no artifact; restore -> save equal=${restoredEqual}; ` +
          'occlusion covered by the minimize leg (same starve/recover contract)',
      });
      return pass;
    } catch (error) {
      const observation = join(RUN, 'proof', 'E2E-10', 'observation.txt');
      mkdirSync(dirname(observation), { recursive: true });
      writeFileSync(observation, `E2E-10 observation (${new Date().toISOString()})\n${error.message}\n`);
      upsertResult(RUN, {
        caseId: 'E2E-10', scope: 'local_simulated', caseType: 'negative_or_lifecycle', result: 'FAIL',
        executedBy: 'executor',
        proofRefs: ['proof/E2E-10/observation.txt'],
        notes: `focus/occlusion journey did not complete: ${String(error.message).slice(0, 160)}`,
      });
      return false;
    }
  },
  // E2E-11: cancel the save dialog, then save the same artifact again.
  'E2E-11': async (stack) => {
    await loadSenderFile(stack.senderPage, join(FIXTURES, 'compressible', 'sample-text-2.bin'));
    await stack.senderPage.bringToFront();
    await sleep(300);
    await stack.receiver.page.bringToFront();
    await sleep(300);
    const ready = await attachCapture(stack.receiver.page, 'window', stack.receiver.pid);
    await screenshot(stack.receiver.page, 'E2E-11', 'ready.png');
    const cancelPromise = runHelper(['-Action', 'save-cancel', '-TimeoutSec', '20'], stack.receiver.pid);
    await stack.receiver.page.click('#btn-save');
    const cancel = await cancelPromise;
    if (cancel.code !== 0) throw new Error(`save-cancel failed: ${cancel.out}`);
    const cancelled = await waitFor(stack.receiver.page, (s) => /save cancelled/i.test(s.log),
      15000, 'save cancelled');
    const received = join(RUN, 'proof', 'E2E-11', 'retry', 'received.bin');
    mkdirSync(dirname(received), { recursive: true });
    await saveArtifact(stack.receiver.page, received, stack.receiver.pid);
    const equal = sha256File(join(FIXTURES, 'compressible', 'sample-text-2.bin')) === sha256File(received);
    upsertResult(RUN, {
      ...roundtripRecord({
        caseId: 'E2E-11', originalPath: join(FIXTURES, 'compressible', 'sample-text-2.bin'),
        receivedPath: received, runDir: RUN,
        notes: `save cancelled (${cancelled.status}) -> same artifact saved on retry -> equal=${equal}`,
      }),
      result: equal ? 'PASS' : 'FAIL',
    });
    return equal;
  },
  // E2E-15: bad recordings fail finitely PER LEG; the REAL entry cancels and
  // reselects; a real recording recovers.
  //
  // Round-3 A-R3: every leg is judged against a baseline taken immediately
  // before its dispatch (leg-verdict.mjs): attempt identity advanced, status
  // trail left Idle, the LOG DELTA carries this leg's expected code, and the
  // session returned to a restartable terminal with cleanup converged. The
  // old waitFor scanned the cumulative log and accepted saveDisabled as an
  // ending, so an OLD 13005 line let a still-Preparing import pass - the
  // reviewer reproduced exactly that.
  //
  // The empty/text/corrupt legs dispatch through the hidden input with a
  // DataTransfer change event: they are IMPORT-PATH-ONLY evidence (the app's
  // import handling after the change event), NOT entry evidence. The
  // open-cancel/open legs drive the real #btn-video entry and the real OS
  // file dialog; the recovery roundtrip uses the dialog-selected file.
  'E2E-15': async (stack) => {
    const media = join(RUN, 'fixtures-media');
    const badDir = join(media, 'bad');
    mkdirSync(badDir, { recursive: true });
    const realVideo = readFileSync(join(media, 'V-GOOD-C.webm'));
    writeFileSync(join(badDir, 'empty.webm'), Buffer.alloc(0));
    writeFileSync(join(badDir, 'text.webm'), Buffer.from('this is not a video container'));
    writeFileSync(join(badDir, 'corrupt.webm'), realVideo.subarray(0, 40000));
    const page = stack.receiver.page;
    const legs = [];

    // Real-entry cancel leg FIRST, while the page is genuinely Idle: click
    // #btn-video (the real entry), cancel the real OS file dialog. No change
    // event may fire: the log delta stays empty, the state stays Idle, the
    // attempt identity does not move and the entry stays usable.
    const cancelBaseline = legBaseline(await pageState(page));
    const cancelHelperPromise = runHelper(['-Action', 'open-cancel', '-TimeoutSec', '20'], stack.receiver.pid);
    await clickButton(page, '#btn-video', 'video entry (cancel)');
    const cancelHelper = await cancelHelperPromise;
    // A bounded observation window for the ABSENCE of a change event (an
    // observation, not a settle-wait).
    await sleep(1500);
    const afterCancel = await pageState(page);
    const cancelDelta = logDelta(cancelBaseline, afterCancel);
    const cancelState = internalStateOf(afterCancel);
    const cancelFailures = [];
    if (cancelHelper.code !== 0) cancelFailures.push(`open-cancel helper exit ${cancelHelper.code}: ${cancelHelper.out.slice(-200)}`);
    if (cancelDelta.length !== 0) cancelFailures.push(`a change event/log line appeared after cancel: ${JSON.stringify(cancelDelta.slice(-160))}`);
    // A cancel must not move the session at all: the state before the click
    // is still the state after it, and that state is restartable. This leg
    // runs first, so the expected state is literally Idle.
    if (cancelState !== 'Idle') {
      cancelFailures.push(`state after cancel is ${String(cancelState)}, expected Idle`);
    }
    if (cancelState !== cancelBaseline.internalState) {
      cancelFailures.push(`state changed on a cancelled dialog: ${String(cancelBaseline.internalState)} -> ${String(cancelState)}`);
    }
    if (afterCancel.attemptId !== cancelBaseline.attemptId) cancelFailures.push('the attempt identity moved on a cancelled dialog');
    if (afterCancel.videoDisabled !== false) cancelFailures.push('the video entry is disabled after cancel');
    legs.push({
      id: 'real-entry-cancel',
      path: 'real entry (#btn-video) + OS dialog cancel',
      status: cancelFailures.length === 0 ? 'PASS' : 'FAIL',
      basis: cancelFailures.length === 0 ? null : cancelFailures.join('; '),
      helperExit: cancelHelper.code,
      logDelta: cancelDelta,
      failures: cancelFailures,
      attemptId: afterCancel.attemptId,
      notes: 'real entry (#btn-video click) + OS dialog cancel; no change event may fire',
    });

    // Bulk bad legs through the app's own import path (DataTransfer). They run
    // AFTER the cancel leg: the verdict module is what keeps them honest, not
    // the order.
    for (const [name, kind] of [
      ['empty.webm', 'empty'], ['text.webm', 'text'], ['corrupt.webm', 'corrupt'],
    ]) {
      const baseline = legBaseline(await pageState(page));
      await importVideo(page, join(badDir, name));
      const settled = await settleVideoLeg(page, { timeoutMs: 45000 });
      const delta = logDelta(baseline, settled.state);
      const verdict = evaluateVideoFailureLeg({
        baseline,
        delta,
        state: settled.state,
        buttons: legButtons(settled.state),
        attemptId: settled.state.attemptId,
        expectedCodes: expectedCodesForBadInput(kind),
      });
      legs.push({
        id: `${kind}-import`,
        path: 'import (DataTransfer dispatch)',
        status: verdict.ok ? 'PASS' : 'FAIL',
        basis: verdict.ok ? null : verdict.failures.join('; '),
        settled: settled.settled,
        checks: verdict.checks,
        failures: verdict.failures,
        logDelta: delta.slice(-400),
        attemptId: settled.state.attemptId,
        notes: 'import-path-only evidence (DataTransfer change event, not the entry)',
      });
      // The next leg waits for the VIDEO ENTRY to be usable again, not a sleep.
      await waitVideoEntryReady(page).catch(() => {});
    }

    // Real-entry open leg: click #btn-video again and drive the REAL open
    // dialog to the good recording. Success is ONLY the app-side change
    // event (a 'recording:' line in the delta); the helper's exit code alone
    // never counts.
    const openBaseline = legBaseline(await pageState(page));
    const openHelperPromise = runHelper(['-Action', 'open', '-Path', join(media, 'V-GOOD-C.webm'), '-TimeoutSec', '40'], stack.receiver.pid);
    await clickButton(page, '#btn-video', 'video entry (open)');
    const openHelper = await openHelperPromise;
    let openState = null;
    let openIngested = false;
    try {
      openState = await waitFor(page, (s) => (s.log || '').slice(openBaseline.logLength).includes('recording:'),
        60000, 'real-entry import ingested (recording: delta)');
      openIngested = true;
    } catch (error) {
      openState = await pageState(page);
    }
    const openDelta = logDelta(openBaseline, openState);
    const openFailures = [];
    if (!openIngested) {
      openFailures.push(`the app never logged 'recording:' after the open dialog (helper exit ${openHelper.code}); ` +
        `the helper's output is not evidence of success (delta ${JSON.stringify(openDelta.slice(-200))})`);
    }
    if (openState.attemptId === openBaseline.attemptId) {
      openFailures.push('the attempt identity did not advance for the dialog-selected import');
    }
    legs.push({
      id: 'real-entry-open',
      path: 'real entry (#btn-video) + OS dialog open, recovery recording',
      status: openFailures.length === 0 ? 'PASS' : 'FAIL',
      basis: openFailures.length === 0 ? null : openFailures.join('; '),
      helperExit: openHelper.code,
      logDelta: openDelta.slice(-400),
      failures: openFailures,
      attemptId: openState.attemptId,
      notes: 'real entry (#btn-video click) + OS dialog open; success is only the app-side recording: delta',
    });

    const fixture = join(FIXTURES, 'compressible', 'sample-text-2.bin');
    let receivedPath = null;
    let equal = false;
    let recoveryError = null;
    if (openIngested) {
      // Recovery roundtrip from the DIALOG-SELECTED import: wait for the
      // artifact, save through the real save dialog, compare bytes.
      try {
        await waitFor(page, (s) => !s.saveDisabled, 240000, 'dialog-selected import Ready');
        receivedPath = join(RUN, 'proof', 'E2E-15', 'recovery', 'received.bin');
        mkdirSync(dirname(receivedPath), { recursive: true });
        await saveArtifact(page, receivedPath, stack.receiver.pid);
        equal = sha256File(fixture) === sha256File(receivedPath);
      } catch (error) {
        recoveryError = String(error.message || error);
      }
    }
    const allLegs = legs.every((leg) => leg.status === 'PASS');
    const pass = allLegs && equal && !recoveryError;
    const measurement = { legs };
    if (receivedPath && existsSync(receivedPath)) {
      upsertResult(RUN, {
        ...roundtripRecord({
          caseId: 'E2E-15', originalPath: fixture, receivedPath, runDir: RUN,
          measurement,
          notes: `per-leg verdicts (attempt identity + status trail + log delta + restartable terminal): ` +
            legs.map((l) => `${l.id}=${l.status}`).join(', ') +
            '; empty/text/corrupt legs are IMPORT-PATH-ONLY evidence (DataTransfer dispatch); the entry ' +
            'legs used the real #btn-video click and the real OS file dialog; ' +
            `recovery roundtrip from the dialog-selected recording equal=${equal}` +
            (recoveryError ? `; recovery error: ${recoveryError}` : ''),
        }),
        result: pass ? 'PASS' : 'FAIL',
      });
      return pass;
    }
    // No saveable artifact exists this attempt: keep an honest FAIL record
    // with the attempt marker's zero received hash and an observation file.
    const observation = join(RUN, 'proof', 'E2E-15', 'observation.txt');
    mkdirSync(dirname(observation), { recursive: true });
    writeFileSync(observation, [
      `E2E-15 observation (${new Date().toISOString()})`,
      ...legs.map((l) => `${l.id}: ${l.status} ${(l.basis || '')}`),
      recoveryError ? `recovery error: ${recoveryError}` : 'no dialog-selected import reached a save',
    ].join('\n') + '\n');
    upsertResult(RUN, {
      caseId: 'E2E-15', scope: 'local_simulated', caseType: 'file_roundtrip', result: 'FAIL',
      executedBy: 'executor',
      referenceSha256: sha256File(fixture), receivedSha256: '0'.repeat(64),
      proofRefs: ['proof/E2E-15/observation.txt'], measurement,
      notes: `no saveable artifact: ${legs.map((l) => `${l.id}=${l.status}`).join(', ')}` +
        (recoveryError ? `; recovery error: ${recoveryError}` : ''),
    });
    return false;
  },
  // E2E-16: recorded EOF and the final key frame, as a PAIRED construction.
  //
  // Round-3 A-R3: V-LAST-with and V-LAST-without are recorded from a
  // RELOADED sender before each clip (record-sender.mjs), so both start at
  // the sender's frame 0 and share the encoded trace prefix. That makes the
  // causal claim checkable per leg:
  //   with leg:    endReason='eof', completion media time T* = lastUs +
  //                artifactFrameId, and __mediaEnded stays NULL (the session
  //                stops at the artifact; no infinite replay), then save+hash.
  //   without leg: REAL EOF (__mediaEnded fired), its own lastUs < T*, no
  //                artifact.
  //   validity:    T* > the without clip's own media duration; when that does
  //                not hold the pair proves nothing and the journey fails
  //                with the re-record instruction (raise --without-seconds).
  'E2E-16': async (stack) => {
    const media = join(RUN, 'fixtures-media');
    const original = join(media, 'payload-128k-random.bin');
    const page = stack.receiver.page;
    const timelinesDir = join(RUN, 'proof', 'E2E-16', 'timelines');
    mkdirSync(timelinesDir, { recursive: true });
    const timelineRefs = [];
    const writeTimeline = (name, data) => {
      const rel = `proof/E2E-16/timelines/${name}`;
      writeFileSync(join(RUN, rel), `${JSON.stringify(data, null, 2)}\n`);
      timelineRefs.push(rel);
      return rel;
    };
    const resetMediaHooks = () => page.evaluate(() => {
      window.__mediaEnded = null;
    }).catch(() => {});

    for (const required of ['V-SHORT.webm', 'V-LAST-with.webm', 'V-LAST-without.webm', 'payload-128k-random.bin']) {
      if (!existsSync(join(media, required))) {
        throw new Error(`${required} is missing from ${media}: record the pair first ` +
          '(node record-sender.mjs --only last)');
      }
    }

    // Leg 1: V-SHORT must end finite without an artifact.
    await resetMediaHooks();
    await resetJourneyMarks(page);
    await importVideo(page, join(media, 'V-SHORT.webm'));
    const shortSettled = await settleVideoLeg(page, { timeoutMs: 90000 });
    const shortState = shortSettled.state;
    const shortInternal = internalStateOf(shortState);
    const shortOk = shortSettled.settled && shortState.saveDisabled === true && shortInternal !== 'Ready';
    const shortLeg = {
      id: 'v-short',
      inputKind: 'video',
      dataClass: 'compressible',
      tier: 'V-SHORT (400 ms)',
      status: shortOk ? 'PASS' : 'FAIL',
      basis: shortOk ? null : `settled=${shortSettled.settled}, internal=${shortInternal}, saveDisabled=${shortState.saveDisabled}`,
      timings: legTimings(shortState),
      sizes: legSizes(shortState, null),
      notes: 'a 400 ms real recording must not produce a saveable artifact',
    };
    writeTimeline('v-short.json', {
      leg: 'v-short', settled: shortSettled.settled, internal: shortInternal,
      saveDisabled: shortState.saveDisabled, mediaEnded: shortState.mediaEnded,
      videoTimeline: shortState.videoTimeline, attemptId: shortState.attemptId,
    });
    await waitVideoEntryReady(page).catch(() => {});

    // Leg 2: V-LAST-without must reach REAL EOF, present LESS media time than
    // the with-leg's completion T*, and leave no artifact.
    await resetMediaHooks();
    await resetJourneyMarks(page);
    await importVideo(page, join(media, 'V-LAST-without.webm'));
    let withoutEof = null;
    try {
      withoutEof = await waitFor(page, (s) => s.mediaEnded != null, 180000, 'V-LAST-without real EOF');
    } catch (error) {
      withoutEof = await pageState(page);
    }
    const withoutSettled = await settleVideoLeg(page, { timeoutMs: 60000 });
    const withoutState = withoutSettled.state;
    const withoutEnded = withoutState.mediaEnded || withoutEof.mediaEnded || null;
    const withoutDurationSec = withoutEnded
      ? (Number.isFinite(withoutEnded.duration) && withoutEnded.duration > 0
        ? withoutEnded.duration
        : (Number.isFinite(withoutEnded.currentTime) ? withoutEnded.currentTime : null))
      : null;
    const withoutLastUs = withoutState.videoTimeline ? withoutState.videoTimeline.lastUs : null;

    // Leg 3: V-LAST-with must reach Ready and rebuild the payload.
    await resetMediaHooks();
    await resetJourneyMarks(page);
    const withBaseline = legBaseline(await pageState(page));
    await importVideo(page, join(media, 'V-LAST-with.webm'));
    let withState = null;
    try {
      // Ready, or a settled terminal without an artifact (classified below).
      withState = await waitFor(page, (s) => !s.saveDisabled
        || (RESTARTABLE_TERMINALS.includes(internalStateOf(s))
          && s.cleanupComplete === true && s.videoDisabled === false),
      480000, 'V-LAST-with Ready');
    } catch (error) {
      withState = await pageState(page);
    }
    const timeline = withState.videoTimeline || {};
    const hasT = Number.isFinite(timeline.lastUs) && Number.isFinite(timeline.artifactFrameId);
    const tStarUs = hasT ? timeline.lastUs + timeline.artifactFrameId : null;
    const tStarSec = tStarUs != null ? tStarUs / 1e6 : null;
    const endReason = timeline.endReason ?? null;
    const withReady = !withState.saveDisabled;
    const withEndedNull = withState.mediaEnded == null;

    let receivedPath = null;
    let equal = false;
    let saveFailure = null;
    if (withReady) {
      try {
        receivedPath = join(RUN, 'proof', 'E2E-16', 'round-with', 'received.bin');
        mkdirSync(dirname(receivedPath), { recursive: true });
        await saveArtifact(page, receivedPath, stack.receiver.pid);
        equal = sha256File(original) === sha256File(receivedPath);
      } catch (error) {
        saveFailure = String(error.message || error);
      }
    }

    const withoutBeforeT = withoutLastUs != null && tStarUs != null && withoutLastUs < tStarUs;
    const withoutOk = withoutEnded != null && withoutState.saveDisabled === true && withoutBeforeT;
    const withOk = withReady && endReason === 'eof' && withEndedNull && equal && !saveFailure;
    const pairValid = tStarSec != null && withoutDurationSec != null && tStarSec > withoutDurationSec;
    const suggestedWithoutSeconds = pairValid ? null : (tStarSec != null ? Math.ceil(tStarSec + 2) : null);

    writeTimeline('v-last-without.json', {
      leg: 'v-last-without', settled: withoutSettled.settled,
      mediaEnded: withoutEnded, durationSec: withoutDurationSec,
      videoTimeline: withoutState.videoTimeline, attemptId: withoutState.attemptId,
    });
    const withDeltaTail = logDelta(withBaseline, withState).slice(-400);
    writeTimeline('v-last-with.json', {
      leg: 'v-last-with', ready: withReady, endReason, mediaEnded: withState.mediaEnded,
      lastUs: timeline.lastUs ?? null, artifactFrameId: timeline.artifactFrameId ?? null,
      tStarUs, tStarSec, formula: 'tStarUs = lastUs + artifactFrameId (plan Domain H)',
      videoTimeline: withState.videoTimeline, attemptId: withState.attemptId,
      saveFailure, logDelta: withDeltaTail,
    });

    const legs = [
      shortLeg,
      {
        id: 'v-last-without',
        inputKind: 'video', dataClass: 'incompressible', tier: '128KiB (without)',
        status: withoutOk ? 'PASS' : 'FAIL',
        basis: withoutOk ? null : `realEof=${withoutEnded != null}, saveDisabled=${withoutState.saveDisabled}, ` +
          `lastUs=${String(withoutLastUs)} < T*=${String(tStarUs)} = ${withoutBeforeT}`,
        timings: legTimings(withoutState), sizes: legSizes(withoutState, null),
        notes: `real EOF duration ${withoutDurationSec}s; no artifact`,
      },
      {
        id: 'v-last-with',
        inputKind: 'video', dataClass: 'incompressible', tier: '128KiB (with final segment)',
        status: withOk ? 'PASS' : 'FAIL',
        basis: withOk ? null : `ready=${withReady}, endReason=${String(endReason)}, ` +
          `mediaEndedNull=${withEndedNull}, equal=${equal}, saveFailure=${String(saveFailure)}, ` +
          `delta=${JSON.stringify(withDeltaTail)}`,
        timings: legTimings(withState),
        sizes: legSizes(withState, statSync(original).size),
        hashes: { original: sha256File(original), received: receivedPath && existsSync(receivedPath) ? sha256File(receivedPath) : null, equal },
        notes: `completion media time T*=${tStarSec}s from lastUs+artifactFrameId`,
      },
    ];
    const pair = {
      tStarUs, tStarSec, withoutDurationSec, withoutLastUs,
      validity: pairValid,
      criterion: 'T* (with-leg completion media time) must exceed the without clip\'s own media duration',
      suggestedWithoutSeconds,
    };
    const measurement = { legs, pair, timelines: timelineRefs };
    const pass = legs.every((leg) => leg.status === 'PASS') && pairValid;

    if (receivedPath && existsSync(receivedPath)) {
      upsertResult(RUN, {
        ...roundtripRecord({
          caseId: 'E2E-16', originalPath: original, receivedPath, runDir: RUN, measurement,
          notes: `V-SHORT not Ready; V-LAST-without real EOF (duration ${withoutDurationSec}s, lastUs ${withoutLastUs}) ` +
            `with no artifact and lastUs < T*=${tStarSec}s; V-LAST-with endReason=${endReason}, ` +
            `__mediaEnded=${withEndedNull ? 'null' : 'FIRED'}, save hash-clean=${equal}; ` +
            `pair validity T*>without duration=${pairValid}` +
            (pairValid ? '' : `; RE-RECORD: raise --without-seconds to at least ${suggestedWithoutSeconds}`),
        }),
        result: pass ? 'PASS' : 'FAIL',
      });
      return pass;
    }
    // No artifact: write an honest FAIL record with an observation and the
    // attempt marker's zero received hash.
    const observation = join(RUN, 'proof', 'E2E-16', 'observation.txt');
    mkdirSync(dirname(observation), { recursive: true });
    writeFileSync(observation, [
      `E2E-16 observation (${new Date().toISOString()})`,
      ...legs.map((leg) => `${leg.id}: ${leg.status} ${leg.basis || ''}`),
      `pair: ${JSON.stringify(pair)}`,
      saveFailure ? `save failure: ${saveFailure}` : 'the with leg never reached Ready',
    ].join('\n') + '\n');
    upsertResult(RUN, {
      caseId: 'E2E-16', scope: 'local_simulated', caseType: 'file_roundtrip', result: 'FAIL',
      executedBy: 'executor',
      referenceSha256: sha256File(original), receivedSha256: '0'.repeat(64),
      proofRefs: ['proof/E2E-16/observation.txt', ...timelineRefs], measurement,
      notes: `no saveable artifact this attempt: ${legs.map((leg) => `${leg.id}=${leg.status}`).join(', ')}; ` +
        `T*=${String(tStarSec)}s vs without duration ${String(withoutDurationSec)}s`,
    });
    return false;
  },
  // E2E-17: dual-input stop switching (both journey legs). Leg 1: stop
  // video A genuinely mid-way, then a live B roundtrip must be hash-clean
  // (no A pollution). Leg 2: stop a live session mid-capture, then import
  // video B and save hash-clean. V-LAST-with is the only fixture that can
  // be stopped mid-way: its payload never completes (TD-15), playback runs
  // ~31 s wall for 14.9 s of metadata, and open() itself takes ~20 s, so
  // the stop ~1.5 s after the recording line is far from either end.
  // V-GOOD-C completes its artifact 0.2 s into playback (compressible
  // payload, few frames) and is therefore unusable for a mid-stop.
  'E2E-17': async (stack) => {
    const media = join(RUN, 'fixtures-media');
    try {
      // Leg 1: video A mid-stop -> live B.
      await importVideo(stack.receiver.page, join(media, 'V-LAST-with.webm'));
      await waitFor(stack.receiver.page, (s) => /recording:/.test(s.log), 60000, 'video A started');
      await sleep(1500);
      await stopSession(stack);
      await screenshot(stack.receiver.page, 'E2E-17', 'leg1-stopped.png');
      const round = await liveRoundtrip(stack, {
        caseId: 'E2E-17', file: join('incompressible', 'sample-random-2.bin'), round: 'live-B', source: 'window',
      });
      const leg1Equal = sha256File(round.fixture) === sha256File(round.received);
      log(`[e2e-17] leg1 stop-video -> live-B equal=${leg1Equal}`);

      // Leg 2: live A mid-stop -> video B. The sender still carries
      // sample-random-2 from leg 1, which is exactly the content B must not
      // be polluted with (B is the compressible text payload). startCapture
      // waits only for the stream: attachCapture would run the session all
      // the way to Ready and the mid-capture stop would never be midway.
      await stack.senderPage.bringToFront();
      await sleep(300);
      await stack.receiver.page.bringToFront();
      await sleep(300);
      await startCapture(stack);
      await waitFor(stack.receiver.page, (s) => /Receiving frames/.test(s.status), 30000, 'live A receiving');
      await sleep(1500);
      await stopSession(stack);
      await screenshot(stack.receiver.page, 'E2E-17', 'leg2-live-stopped.png');
      await importVideo(stack.receiver.page, join(media, 'V-GOOD-C.webm'));
      await waitFor(stack.receiver.page, (s) => s.status === 'File ready to save', 120000, 'video B ready');
      const target = join(RUN, 'proof', 'E2E-17', 'video-B', 'received.bin');
      mkdirSync(dirname(target), { recursive: true });
      await saveArtifact(stack.receiver.page, target, stack.receiver.pid);
      const videoB = join(FIXTURES, 'compressible', 'sample-text-2.bin');
      const leg2Equal = sha256File(videoB) === sha256File(target);
      await screenshot(stack.receiver.page, 'E2E-17', 'leg2-saved.png');
      log(`[e2e-17] leg2 stop-live -> video-B equal=${leg2Equal}`);

      writeProof(RUN, 'E2E-17', 'log.txt', [
        `leg1: video A (V-LAST-with, never completes) stopped mid-way -> live B (sample-random-2) equal=${leg1Equal}`,
        `leg1 received sha256=${sha256File(round.received)}`,
        `leg2: live A (sample-random-2) stopped mid-capture -> video B (V-GOOD-C) equal=${leg2Equal}`,
        `leg2 received sha256=${sha256File(target)}; expected ${sha256File(videoB)}`,
      ].join('\n') + '\n');
      const original = join(FIXTURES, 'incompressible', 'sample-random-2.bin');
      const record = roundtripRecord({
        caseId: 'E2E-17', originalPath: original, receivedPath: round.received, runDir: RUN,
        notes: 'filled by the caller below',
      });
      const pass = leg1Equal && leg2Equal;
      upsertResult(RUN, {
        ...record,
        result: pass ? 'PASS' : 'FAIL',
        notes: `leg1 stop-video A -> live B equal=${leg1Equal}; ` +
          `leg2 stop-live A -> video B equal=${leg2Equal} (V-GOOD-C output hash=${sha256File(target).slice(0, 12)}…); ` +
          'A contents never pollute B in either direction',
      });
      return pass;
    } catch (error) {
      const observation = join(RUN, 'proof', 'E2E-17', 'observation.txt');
      mkdirSync(dirname(observation), { recursive: true });
      writeFileSync(observation, `E2E-17 observation (${new Date().toISOString()})\n${error.message}\n`);
      upsertResult(RUN, {
        caseId: 'E2E-17', scope: 'local_simulated', caseType: 'negative_or_lifecycle', result: 'FAIL',
        executedBy: 'executor',
        proofRefs: ['proof/E2E-17/observation.txt'],
        notes: `dual-input stop-switch journey did not complete: ${String(error.message).slice(0, 160)}`,
      });
      return false;
    }
  },
  // DIAG-17 (diagnostic): import one recording and print every state/log
  // transition with timestamps. --video selects the file, --stopms clicks
  // stop that many ms after the import begins (unused by default; kept for
  // reproducing the E2E-17 stop-timing diagnosis).
  'DIAG-17': async (stack) => {
    const video = args.get('video') || 'V-GOOD-C.webm';
    const stopMs = Number(args.get('stopms') || '-1');
    const started = Date.now();
    await importVideo(stack.receiver.page, join(RUN, 'fixtures-media', video));
    let lastStatus = null; let lastLogLen = 0; let stopClicked = stopMs < 0;
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      const s = await pageState(stack.receiver.page);
      if (s.status !== lastStatus) {
        log(`[diag] t=${Date.now() - started}ms status="${s.status}" saveDisabled=${s.saveDisabled}`);
        lastStatus = s.status;
      }
      const text = s.log || '';
      if (text.length > lastLogLen) {
        const added = text.slice(lastLogLen).trim();
        if (added) log(`[diag] t=${Date.now() - started}ms log+: ${added.split('\n').join(' | ')}`);
        lastLogLen = text.length;
      }
      if (s.mediaError || s.playError || s.mediaEnded) {
        log(`[diag] t=${Date.now() - started}ms media: err=${JSON.stringify(s.mediaError)} play=${JSON.stringify(s.playError)} ended=${JSON.stringify(s.mediaEnded)}`);
        await stack.receiver.page.evaluate(() => {
          window.__mediaError = null; window.__playError = null; window.__mediaEnded = null;
        }).catch(() => {});
      }
      if (!stopClicked && Date.now() - started >= stopMs) {
        const before = s.status;
        await stack.receiver.page.click('#btn-stop', { timeout: 5000 })
          .catch((error) => log(`[diag] stop click failed: ${error.message}`));
        log(`[diag] t=${Date.now() - started}ms stop clicked (state before: "${before}")`);
        stopClicked = true;
      }
      if (s.status === 'Saved' || s.status === 'Stopped' ||
          /not enough|went wrong|ready to save/i.test(s.status)) break;
      await sleep(100);
    }
    const final = await pageState(stack.receiver.page);
    log(`[diag] final status="${final.status}" saveDisabled=${final.saveDisabled} log=${JSON.stringify(final.log)}`);
    return true;
  },
  // E2E-19: refresh, a REAL page close/reopen, and a server restart keep
  // working. Round-7 B-3b: the plan's second step is "close the page and open
  // it again", which is not a reload - the old page is really closed and a
  // fresh page is navigated to the receiver URL.
  'E2E-19': async (stack) => {
    const file = join('compressible', 'sample-text-2.bin');
    const results = [];
    try {
      results.push(await liveRoundtrip(stack, { caseId: 'E2E-19', file, round: 'before-reload', source: 'window' }));
      await stack.receiver.page.reload();
      await sleep(1200);
      results.push(await liveRoundtrip(stack, { caseId: 'E2E-19', file, round: 'after-reload', source: 'window' }));
      // Close the receiver page for real. A blank keep-alive tab keeps the
      // Edge window alive while the last receiver tab is closed; that tab is
      // then navigated to the receiver URL, so the leg runs in a fresh page.
      const context = stack.receiver.page.context();
      const oldPage = stack.receiver.page;
      const keepAlive = await context.newPage();
      await oldPage.close();
      const oldClosed = oldPage.isClosed();
      await keepAlive.goto(`http://127.0.0.1:${RECEIVER_PORT}/`);
      await keepAlive.waitForSelector('#btn-video', { timeout: 60000 });
      stack.receiver.page = keepAlive;
      log(`[e2e-19] old page closed=${oldClosed}; fresh page=${keepAlive.url()}`);
      results.push(await liveRoundtrip(stack, { caseId: 'E2E-19', file, round: 'after-reopen', source: 'window' }));
      // server restart
      stack.receiverServer.kill();
      await sleep(1000);
      const restarted = startServer('python', [join(STAGING, 'receiver', 'server.py'),
        '--port', String(RECEIVER_PORT), '--directory', join(STAGING, 'receiver')], 'receiver-http2');
      await waitHttp(`http://127.0.0.1:${RECEIVER_PORT}/`);
      stack.receiverServer = restarted;
      await stack.receiver.page.goto(`http://127.0.0.1:${RECEIVER_PORT}/`);
      await sleep(800);
      results.push(await liveRoundtrip(stack, { caseId: 'E2E-19', file, round: 'after-restart', source: 'window' }));
      const pairs = results.map((entry) => sha256File(entry.fixture) === sha256File(entry.received));
      const allEqual = pairs.every(Boolean);
      const pass = oldClosed && allEqual;
      upsertResult(RUN, {
        ...roundtripRecord({
          caseId: 'E2E-19', originalPath: results[0].fixture, receivedPath: results[0].received, runDir: RUN,
          notes: `before reload, after reload, after real page close/reopen, after server restart: ` +
            `${results.length} roundtrips, all equal=${allEqual}`,
        }),
        result: pass ? 'PASS' : 'FAIL',
        notes: `reload + REAL close/reopen (old page isClosed=${oldClosed}; fresh page loaded #btn-video) ` +
          `+ receiver server restart: ${results.length} roundtrips, all equal=${allEqual}; ` +
          'PASS requires the old page to be closed',
      });
      return pass;
    } catch (error) {
      const observation = join(RUN, 'proof', 'E2E-19', 'observation.txt');
      mkdirSync(dirname(observation), { recursive: true });
      writeFileSync(observation, `E2E-19 observation (${new Date().toISOString()})\n${error.message}\n`);
      upsertResult(RUN, {
        caseId: 'E2E-19', scope: 'local_simulated', caseType: 'negative_or_lifecycle', result: 'FAIL',
        executedBy: 'executor',
        proofRefs: ['proof/E2E-19/observation.txt'],
        notes: `refresh/close-reopen/server-restart journey did not complete: ${String(error.message).slice(0, 160)}`,
      });
      return false;
    }
  },
  // E2E-12: a Chinese/space target name saves correctly, and a same-name
  // overwrite is never silent: the confirmation is refused, the sentinel
  // stays byte-identical, and the same dialog session then saves under a
  // new name (refuse-then-rename), so the app settles Saved instead of
  // hanging in Saving….
  'E2E-12': async (stack) => {
    const fixture = join(FIXTURES, 'compressible', 'sample-text-2.bin');
    try {
      await loadSenderFile(stack.senderPage, fixture);
      await stack.senderPage.bringToFront();
      await sleep(300);
      await stack.receiver.page.bringToFront();
      await sleep(300);
      await attachCapture(stack.receiver.page, 'window', stack.receiver.pid);
      const dir = join(RUN, 'proof', 'E2E-12');
      const target = join(dir, '中文 名字.bin');
      const renamed = join(dir, '中文 名字-2.bin');
      mkdirSync(dir, { recursive: true });
      writeFileSync(target, 'SENTINEL');
      rmSync(renamed, { force: true });

      // Journey step 1: the suggested name must be a safe basename, not the
      // generic 'file' fallback.
      const ready = await pageState(stack.receiver.page);
      const suggested = ready.artifactName;
      const suggestedOk = /^[^\\/]+$/.test(suggested) && suggested !== 'file';
      log(`[e2e-12] suggested name: "${suggested}" ok=${suggestedOk}`);

      // Phase A: cancel the dialog on the same name; the sentinel must stay.
      await wakeWindow(stack.receiver.pid);
      const cancelPromise = runHelper(['-Action', 'save-cancel', '-TimeoutSec', '20'], stack.receiver.pid);
      await clickButton(stack.receiver.page, '#btn-save', 'save cancel');
      const cancel = await cancelPromise;
      if (cancel.code !== 0) throw new Error(`save-cancel failed: ${cancel.out}`);
      await waitFor(stack.receiver.page, (s) => /save cancelled/i.test(s.log),
        15000, 'save cancelled');
      const sentinelAfterCancel = readFileSync(target, 'utf8') === 'SENTINEL';

      // Phase B: the same name again — the browser shows the overwrite
      // confirmation; refuse it (no silent overwrite; sentinel untouched),
      // then finish the save under a new name in the SAME dialog session,
      // so the app's picker promise settles like any real save.
      await wakeWindow(stack.receiver.pid);
      const overwritePromise = runHelper(['-Action', 'save', '-Path', target,
        '-OnOverwrite', 'refuse', '-RenameTo', renamed, '-TimeoutSec', '60'], stack.receiver.pid);
      await clickButton(stack.receiver.page, '#btn-save', 'save same name');
      const overwrite = await overwritePromise;
      const refused = overwrite.code === 0 && /overwrite refused/.test(overwrite.out);
      const sentinelIntact = readFileSync(target, 'utf8') === 'SENTINEL';
      log(`[e2e-12] refused=${refused} sentinelIntact=${sentinelIntact}`);
      log(`[e2e-12] helper: ${overwrite.out.trim().split('\n').join(' | ')}`);

      // The picker resolved via the rename: the app must reach Saved, never
      // stuck in Saving….
      const settled = await waitFor(stack.receiver.page,
        (s) => s.status === 'Saved' || /retry|went wrong/i.test(s.status),
        20000, 'the save to settle after the rename');
      const savedOk = settled.status === 'Saved';
      const equal = existsSync(renamed) && sha256File(fixture) === sha256File(renamed);
      await screenshot(stack.receiver.page, 'E2E-12', 'after-rename-save.png');
      writeProof(RUN, 'E2E-12', 'log.txt', [
        `suggested=${suggested} suggestedOk=${suggestedOk}`,
        `cancel phase: sentinel intact=${sentinelAfterCancel}`,
        `refuse phase: refused=${refused} sentinel intact=${sentinelIntact}`,
        `rename save: app status=${settled.status} renamedExists=${existsSync(renamed)} equal=${equal}`,
        `helper stdout: ${overwrite.out.trim()}`,
      ].join('\n') + '\n');

      const record = roundtripRecord({
        caseId: 'E2E-12', originalPath: fixture, receivedPath: renamed, runDir: RUN,
        notes: 'filled by the caller below',
      });
      const pass = suggestedOk && sentinelAfterCancel && refused && sentinelIntact && savedOk && equal;
      upsertResult(RUN, {
        ...record,
        result: pass ? 'PASS' : 'FAIL',
        notes: `cancel: sentinel intact=${sentinelAfterCancel}; refuse-then-rename: refused=${refused}, ` +
          `sentinel intact=${sentinelIntact}, app=${settled.status}, renamed save equal=${equal}; ` +
          `suggested name "${suggested}" safe=${suggestedOk}`,
      });
      return pass;
    } catch (error) {
      const observation = join(RUN, 'proof', 'E2E-12', 'observation.txt');
      mkdirSync(dirname(observation), { recursive: true });
      writeFileSync(observation, `E2E-12 observation (${new Date().toISOString()})\n${error.message}\n`);
      upsertResult(RUN, {
        caseId: 'E2E-12', scope: 'local_simulated', caseType: 'negative_or_lifecycle', result: 'FAIL',
        executedBy: 'executor',
        proofRefs: ['proof/E2E-12/observation.txt'],
        notes: `refuse-then-rename journey did not complete: ${String(error.message).slice(0, 160)}`,
      });
      return false;
    }
  },
  // E2E-13: a rapid double save yields exactly one attempt (the button is
  // disabled while the picker is open); the modal cancel leaves the session
  // retryable and the artifact intact. Failures are recorded, not thrown:
  // a dialog/helper failure must leave an honest FAIL in results.json.
  'E2E-13': async (stack) => {
    const pid = stack.receiver.pid;
    const fixture = join(FIXTURES, 'compressible', 'sample-text-2.bin');
    try {
      await loadSenderFile(stack.senderPage, fixture);
      await stack.senderPage.bringToFront();
      await sleep(300);
      await stack.receiver.page.bringToFront();
      await sleep(300);
      await attachCapture(stack.receiver.page, 'window', stack.receiver.pid);
      const target = join(RUN, 'proof', 'E2E-13', 'one-save.bin');
      mkdirSync(dirname(target), { recursive: true });
      rmSync(target, { force: true }); // a stale proof file would turn this save into an overwrite refusal
      const helperPromise = runHelper(['-Action', 'save', '-Path', target, '-TimeoutSec', '40'], pid);
      await wakeWindow(pid);
      await clickButton(stack.receiver.page, '#btn-save', 'save first');
      const during = await waitFor(stack.receiver.page,
        (s) => s.saveDisabled === true, 8000, 'save disabled while the picker is open');
      const secondBlocked = during.saveDisabled === true;
      const helper = await helperPromise;
      if (helper.code !== 0) {
        // Judge by the file, not by the helper's exit code (work order item
        // 2): only a real save counts, so record the helper output and fail
        // honestly if no verified save followed.
        const afterHelper = await pageState(stack.receiver.page);
        const fileOk = existsSync(target) && sha256File(fixture) === sha256File(target);
        if (!fileOk || afterHelper.status !== 'Saved') {
          throw new Error(`save helper failed and no real save followed: ${helper.out}`);
        }
      }
      await waitFor(stack.receiver.page, (s) => s.status === 'Saved', 20000, 'saved');
      const equal = sha256File(fixture) === sha256File(target);
      const state = await pageState(stack.receiver.page);
      const record = roundtripRecord({
        caseId: 'E2E-13', originalPath: fixture, receivedPath: target, runDir: RUN,
        notes: 'filled by the caller below',
      });
      upsertResult(RUN, {
        ...record,
        result: secondBlocked && equal ? 'PASS' : 'FAIL',
        notes: `save button disabled while the picker is open=${secondBlocked}; single save equal=${equal}; status=${state.status}`,
      });
      return secondBlocked && equal;
    } catch (error) {
      const observation = join(RUN, 'proof', 'E2E-13', 'observation.txt');
      mkdirSync(join(RUN, 'proof', 'E2E-13'), { recursive: true });
      writeFileSync(observation, `E2E-13 observation (${new Date().toISOString()})\n${error.message}\n`);
      upsertResult(RUN, {
        caseId: 'E2E-13', scope: 'local_simulated', caseType: 'negative_or_lifecycle', result: 'FAIL',
        executedBy: 'executor',
        proofRefs: ['proof/E2E-13/observation.txt'],
        notes: `save journey did not complete: ${String(error.message).slice(0, 160)}`,
      });
      return false;
    }
  },
  // E2E-18: extended scale and artifact-budget matrix (round-3 A-R2).
  //
  // ONE record carries the whole matrix; every planned leg gets an explicit
  // status (PASS or NOT_RUN-with-basis), so no leg can be silently omitted.
  // Nested measurement.legs[] carries sizes, the wall-clock boundaries from
  // the receiver hooks and per-leg hashes; summarize.py renders it. The
  // matrix (plan Phase 3):
  //   live compressible/incompressible 1 MiB + 4 MiB            executed
  //   recorded compressible 4 MiB                                executed
  //   recorded incompressible 128 KiB (existing pair)            executed
  //   recorded incompressible 1 MiB                              bounded probe
  //   recorded incompressible 4 MiB                              disposition of the probe
  //   live compressible 20 MiB over budget                       executed (15008 + recovery)
  //   live incompressible 20 MiB over budget                     NOT_RUN, code-level basis
  // Failure attribution follows the round-3 user protocol: an insufficient
  // or invalid recording is a rig/input-evidence problem (NOT_RUN with
  // basis); sufficient presented frames without a rebuild is a receiver-side
  // finding (FAIL, reported as a new finding).
  'E2E-18': async (stack) => {
    const ext = join(RUN, 'fixtures-ext');
    const manifest = await ensureExtendedFixtures();
    const extFile = (relative) => join(ext, relative);
    const page = stack.receiver.page;
    const legs = [];
    let canonicalRound = null;
    const statBytes = (path) => { try { return statSync(path).size; } catch (error) { return null; } };

    const liveLeg = async ({ id, file, dataClass, tier }) => {
      try {
        const round = await liveRoundtrip(stack, {
          caseId: 'E2E-18', file, round: id, source: 'window', resetMarks: true,
          // The 4 MiB incompressible leg needs a longer Ready bound than the
          // 180 s default (live delivery of that class is minutes on this rig).
          readyTimeoutMs: 600000,
        });
        const after = await pageState(page);
        const originalSha = sha256File(round.fixture);
        const receivedSha = sha256File(round.received);
        const equal = originalSha === receivedSha;
        if (!canonicalRound && equal) canonicalRound = round;
        legs.push({
          id, inputKind: 'live', dataClass, tier,
          status: equal ? 'PASS' : 'FAIL',
          basis: equal ? null : 'roundtrip hashes differ',
          sizes: legSizes(after, statBytes(round.fixture)),
          timings: legTimings(after),
          hashes: { original: originalSha, received: receivedSha, equal },
          notes: `live capture roundtrip; proof proof/E2E-18/round-${id}/received.bin`,
        });
      } catch (error) {
        legs.push({
          id, inputKind: 'live', dataClass, tier, status: 'FAIL',
          basis: String(error.message || error).slice(0, 400),
          sizes: { rawBytes: statBytes(file), streamBytes: null, artifactBytes: null },
          timings: null,
          hashes: { original: existsSync(file) ? sha256File(file) : null, received: null, equal: false },
          notes: 'live leg did not complete',
        });
        // Leave no stuck session behind for the next leg.
        try {
          const state = await pageState(page);
          if (state.stopDisabled === false) await stopSession(stack);
        } catch (stopError) { /* the next leg reports its own state */ }
      }
    };

    // One recorded-input leg. `bounds` are declared by the caller BEFORE
    // recording and are recorded even when they abort the leg.
    const videoLeg = async ({ id, clipPath, payloadPath, dataClass, tier, bounds = null, readyTimeoutMs, recording = null }) => {
      const legBase = { id, inputKind: 'video', dataClass, tier, bounds, recording };
      await resetJourneyMarks(page);
      const baseline = legBaseline(await pageState(page));
      try {
        await importVideo(page, clipPath);
      } catch (error) {
        legs.push({ ...legBase, status: 'FAIL', basis: `import dispatch failed: ${error.message}` });
        return;
      }
      let readyState = null;
      let timedOut = false;
      // Wait for a saveable artifact OR a settled terminal without one: a
      // rejected/broken import must be classified now, not after the bound.
      const settledOrReady = (s) => !s.saveDisabled
        || (RESTARTABLE_TERMINALS.includes(internalStateOf(s))
          && s.cleanupComplete === true && s.videoDisabled === false);
      try {
        readyState = await waitFor(page, settledOrReady, readyTimeoutMs, `${id} recorded import Ready`);
        timedOut = readyState.saveDisabled !== false;
      } catch (error) {
        timedOut = true;
        readyState = await pageState(page);
      }
      const timeline = readyState.videoTimeline || {};
      const presented = Number.isFinite(timeline.presented) ? timeline.presented : null;
      const lastUs = timeline.lastUs ?? null;
      if (readyState.saveDisabled === false) {
        try {
          const received = join(RUN, 'proof', 'E2E-18', `round-${id}`, 'received.bin');
          mkdirSync(dirname(received), { recursive: true });
          await saveArtifact(page, received, stack.receiver.pid);
          const originalSha = sha256File(payloadPath);
          const receivedSha = sha256File(received);
          const equal = originalSha === receivedSha;
          if (!canonicalRound && equal) canonicalRound = { fixture: payloadPath, received };
          legs.push({
            ...legBase, status: equal ? 'PASS' : 'FAIL',
            basis: equal ? null : 'roundtrip hashes differ',
            sizes: legSizes(readyState, statBytes(payloadPath)),
            timings: legTimings(readyState),
            hashes: { original: originalSha, received: receivedSha, equal },
            notes: `recorded import roundtrip; presented frames=${String(presented)}, lastUs=${String(lastUs)}`,
          });
        } catch (error) {
          legs.push({
            ...legBase, status: 'FAIL', basis: `save failed: ${error.message}`,
            sizes: legSizes(readyState, statBytes(payloadPath)), timings: legTimings(readyState),
          });
        }
        return;
      }
      // No artifact: split the attribution per the user protocol.
      const deltaTail = logDelta(baseline, readyState).slice(-300);
      if (presented == null || presented === 0) {
        legs.push({
          ...legBase, status: 'NOT_RUN',
          basis: `insufficient-valid-recording (rig/input evidence): presented frames=${String(presented)}, ` +
            `lastUs=${String(lastUs)}, timedOut=${timedOut}, internal=${String(internalStateOf(readyState))}, ` +
            `delta=${JSON.stringify(deltaTail)}`,
          timings: legTimings(readyState), sizes: legSizes(readyState, statBytes(payloadPath)),
          notes: 'rig/input-evidence problem; NOT a receiver verdict',
        });
        return;
      }
      legs.push({
        ...legBase, status: 'FAIL',
        basis: `receiver-side: ${presented} frames presented (lastUs=${String(lastUs)}) but no rebuild within ${readyTimeoutMs} ms ` +
          `(delta=${JSON.stringify(deltaTail)})`,
        timings: legTimings(readyState), sizes: legSizes(readyState, statBytes(payloadPath)),
        notes: 'NEW FINDING: sufficient valid recording but no rebuild - receiver-side investigation required',
      });
    };

    // 1-4: live legs, both data classes at 1 MiB and 4 MiB.
    await liveLeg({ id: 'live-c-1mib', file: extFile('compressible/ext-text-1mib.bin'), dataClass: 'compressible', tier: '1MiB' });
    await liveLeg({ id: 'live-c-4mib', file: extFile('compressible/ext-text-4mib.bin'), dataClass: 'compressible', tier: '4MiB' });
    await liveLeg({ id: 'live-n-1mib', file: extFile('incompressible/ext-random-1mib.bin'), dataClass: 'incompressible', tier: '1MiB' });
    await liveLeg({ id: 'live-n-4mib', file: extFile('incompressible/ext-random-4mib.bin'), dataClass: 'incompressible', tier: '4MiB' });

    // 5: recorded compressible 4 MiB. Existing video tiers are covered by
    // E2E-14 (V-GOOD-C / V-GOOD-N, 64 KiB class) and E2E-16 (128 KiB pair);
    // they are not re-recorded here.
    {
      const bounds = { recordSeconds: 60, maxRecordBytes: 268435456, importWaitMs: 300000 };
      const payload = extFile('compressible/ext-text-4mib.bin');
      const id = 'video-c-4mib';
      await loadSenderFile(stack.senderPage, payload);
      const clipPath = join(RUN, 'fixtures-media', 'E2E18-V-C-4mib.webm');
      let recording = null;
      let recError = null;
      try {
        recording = await recordSenderClip(stack, { seconds: bounds.recordSeconds, clipPath });
      } catch (error) { recError = String(error.message || error); }
      if (!recording) {
        legs.push({ id, inputKind: 'video', dataClass: 'compressible', tier: '4MiB', bounds,
          status: 'NOT_RUN', basis: `recording failed (rig): ${recError}`,
          notes: 'no clip was produced; rig/input-evidence problem' });
      } else if (recording.bytes > bounds.maxRecordBytes) {
        legs.push({ id, inputKind: 'video', dataClass: 'compressible', tier: '4MiB', bounds,
          status: 'NOT_RUN', basis: `recording exceeded the declared byte bound (${recording.bytes} > ${bounds.maxRecordBytes})`,
          notes: 'rig bound aborted the leg before import' });
      } else {
        await videoLeg({ id, clipPath, payloadPath: payload, dataClass: 'compressible', tier: '4MiB',
          bounds, readyTimeoutMs: bounds.importWaitMs,
          recording: { bytes: recording.bytes, sha256: recording.sha256, seconds: bounds.recordSeconds } });
      }
    }

    // 6: recorded incompressible 128 KiB from the existing real pair.
    {
      const id = 'video-n-128kib';
      const clip = join(RUN, 'fixtures-media', 'V-LAST-with.webm');
      const payload = join(RUN, 'fixtures-media', 'payload-128k-random.bin');
      if (!existsSync(clip) || !existsSync(payload)) {
        legs.push({ id, inputKind: 'video', dataClass: 'incompressible', tier: '128KiB',
          status: 'NOT_RUN',
          basis: `existing recorded fixture missing (${!existsSync(clip) ? 'V-LAST-with.webm' : 'payload-128k-random.bin'}); ` +
            'run node record-sender.mjs --only last first' });
      } else {
        await videoLeg({ id, clipPath: clip, payloadPath: payload, dataClass: 'incompressible', tier: '128KiB',
          readyTimeoutMs: 480000 });
      }
    }

    // 7: bounded 1 MiB incompressible probe. The bounds are declared HERE,
    // before recording, and are carried into the leg even on failure.
    let probeOutcome = null;
    {
      const id = 'video-n-1mib-probe';
      const bounds = {
        recordSeconds: 150,          // recording length bound (sender trace coverage)
        maxRecordBytes: 268435456,   // 256 MiB clip cap: a runaway recording is aborted, not imported
        importWaitMs: 600000,        // bounded import wait
      };
      const payload = extFile('incompressible/ext-random-1mib.bin');
      await loadSenderFile(stack.senderPage, payload);
      const clipPath = join(RUN, 'fixtures-media', 'E2E18-V-N-1mib-probe.webm');
      let recording = null;
      let recError = null;
      try {
        recording = await recordSenderClip(stack, { seconds: bounds.recordSeconds, clipPath });
      } catch (error) { recError = String(error.message || error); }
      if (!recording) {
        legs.push({ id, inputKind: 'video', dataClass: 'incompressible', tier: '1MiB bounded probe', bounds,
          status: 'NOT_RUN', basis: `recording failed (rig): ${recError}`,
          notes: 'rig/input-evidence problem; NOT a receiver verdict' });
      } else if (recording.bytes > bounds.maxRecordBytes) {
        legs.push({ id, inputKind: 'video', dataClass: 'incompressible', tier: '1MiB bounded probe', bounds,
          status: 'NOT_RUN', basis: `recording exceeded the declared byte bound (${recording.bytes} > ${bounds.maxRecordBytes})`,
          notes: 'rig bound aborted the leg before import' });
      } else {
        await videoLeg({ id, clipPath, payloadPath: payload, dataClass: 'incompressible', tier: '1MiB bounded probe',
          bounds, readyTimeoutMs: bounds.importWaitMs,
          recording: { bytes: recording.bytes, sha256: recording.sha256, seconds: bounds.recordSeconds } });
      }
      probeOutcome = legs[legs.length - 1];
    }

    // 8: recorded incompressible 4 MiB - disposition decided by the probe.
    {
      const id = 'video-n-4mib';
      const payload = extFile('incompressible/ext-random-4mib.bin');
      if (probeOutcome && probeOutcome.status === 'PASS') {
        const bounds = { recordSeconds: 600, maxRecordBytes: 1073741824, importWaitMs: 900000 };
        await loadSenderFile(stack.senderPage, payload);
        const clipPath = join(RUN, 'fixtures-media', 'E2E18-V-N-4mib.webm');
        let recording = null;
        let recError = null;
        try {
          recording = await recordSenderClip(stack, { seconds: bounds.recordSeconds, clipPath });
        } catch (error) { recError = String(error.message || error); }
        if (!recording) {
          legs.push({ id, inputKind: 'video', dataClass: 'incompressible', tier: '4MiB', bounds,
            status: 'NOT_RUN', basis: `recording failed (rig): ${recError}`,
            notes: 'the 1 MiB probe passed, but the 4 MiB recording failed; rig/input-evidence problem' });
        } else if (recording.bytes > bounds.maxRecordBytes) {
          legs.push({ id, inputKind: 'video', dataClass: 'incompressible', tier: '4MiB', bounds,
            status: 'NOT_RUN', basis: `recording exceeded the declared byte bound (${recording.bytes} > ${bounds.maxRecordBytes})`,
            notes: 'rig bound aborted the leg before import' });
        } else {
          await videoLeg({ id, clipPath, payloadPath: payload, dataClass: 'incompressible', tier: '4MiB',
            bounds, readyTimeoutMs: bounds.importWaitMs,
            recording: { bytes: recording.bytes, sha256: recording.sha256, seconds: bounds.recordSeconds } });
        }
      } else {
        legs.push({
          id, inputKind: 'video', dataClass: 'incompressible', tier: '4MiB',
          status: 'NOT_RUN',
          basis: `disposition from the bounded 1 MiB probe (${probeOutcome ? probeOutcome.status : 'missing'}): ` +
            `${probeOutcome && probeOutcome.basis ? probeOutcome.basis : 'the probe did not establish the 1 MiB class'}`,
          scopeRevisionProposal: 'DRAFT ONLY - NOT APPLIED, pending user confirmation: revise the E2E-18 matrix ' +
            'entry "recorded incompressible 4 MiB" from executed to NOT_RUN with the measured 1 MiB probe as the ' +
            'declared rig ceiling, and record the probe outcome in the support matrix, decision log and gate ' +
            'sub-items. The frozen test plan is not edited until the user confirms. Historical results are not re-judged.',
          sizes: { rawBytes: statBytes(payload), streamBytes: null, artifactBytes: null },
          timings: null,
          notes: 'the 4 MiB incompressible recording exceeds the class the 1 MiB probe could establish; see basis',
        });
      }
    }

    // 9: live compressible 20 MiB over budget: 15008 rejection, stop, then a
    // hash-clean normal-file recovery (the user decision requires the real
    // artifact-budget rejection; a pixel-budget refusal is not a substitute).
    {
      const id = 'live-c-20mib-over-budget';
      const payload = extFile('over-budget/ext-text-20mib.bin');
      const budget = actualArtifactBudget();
      const baseline = legBaseline(await pageState(page));
      const leg = {
        id, inputKind: 'live', dataClass: 'compressible', tier: '20MiB-over-budget',
        budget, rejection: null, recovery: null,
        sizes: { rawBytes: statBytes(payload), streamBytes: null, artifactBytes: null },
      };
      try {
        await loadSenderFile(stack.senderPage, payload);
        await stack.senderPage.bringToFront();
        await sleep(300);
        await page.bringToFront();
        await sleep(300);
        await resetJourneyMarks(page);
        await startCapture(stack);
        let hit = null;
        const deadline = Date.now() + 900000;
        while (Date.now() < deadline) {
          const state = await pageState(page);
          if (logDelta(baseline, state).includes('15008')) { hit = state; break; }
          if (internalStateOf(state) === 'Ready' || state.saveDisabled === false) {
            throw new Error(`FALSE COMPLETION: an over-budget payload reached a saveable artifact ` +
              `(internal=${String(internalStateOf(state))})`);
          }
          await sleep(500);
        }
        if (!hit) throw new Error('no 15008 rejection within 900 s (the payload never completed or was never rejected)');
        const verdict = evaluateBudgetLeg({
          baseline, delta: logDelta(baseline, hit), state: hit,
          buttons: legButtons(hit), expectedCode: '15008',
        });
        leg.rejection = {
          code: '15008',
          delta: logDelta(baseline, hit).slice(-400),
          checks: verdict.checks,
          failures: verdict.failures,
          compression: {
            preCompressionBytes: statBytes(payload),
            postCompressionBytes: null,
            note: 'a rejected artifact surfaces no compressedBytes; the recovery roundtrip records the stream size. ' +
              'The compressible choice keeps the fountain stream small while its decompressed output exceeds the budget.',
          },
        };
        leg.sizes = legSizes(hit, statBytes(payload));
        leg.timings = legTimings(hit);
        await stopSession(stack);
        const round = await liveRoundtrip(stack, {
          caseId: 'E2E-18', file: join('compressible', 'sample-text-2.bin'), round: 'budget-recovery', source: 'window',
        });
        const after = await pageState(page);
        const originalSha = sha256File(round.fixture);
        const receivedSha = sha256File(round.received);
        const equal = originalSha === receivedSha;
        leg.recovery = {
          equal, original: originalSha, received: receivedSha,
          streamBytes: legSizes(after, null).streamBytes,
          artifactBytes: legSizes(after, null).artifactBytes,
          timings: legTimings(after),
        };
        if (!canonicalRound && equal) canonicalRound = round;
        leg.hashes = { original: originalSha, received: receivedSha, equal };
        leg.status = verdict.ok && equal ? 'PASS' : 'FAIL';
        leg.basis = leg.status === 'PASS' ? null
          : [...verdict.failures, equal ? null : 'recovery roundtrip hashes differ'].filter(Boolean).join('; ');
        leg.notes = `budget ${String(budget.maxArtifactBytes)} (${budget.source}); rejection then stop then ` +
          'hash-clean normal-file recovery';
      } catch (error) {
        leg.status = 'FAIL';
        leg.basis = String(error.message || error).slice(0, 400);
        leg.hashes = leg.hashes || { original: existsSync(payload) ? sha256File(payload) : null, received: null, equal: false };
        try {
          const state = await pageState(page);
          if (state.stopDisabled === false) await stopSession(stack);
        } catch (stopError) { /* the record reports the original failure */ }
      }
      legs.push(leg);
    }

    // 10: live incompressible 20 MiB over budget - NOT_RUN with the code-level
    // basis (the user decision explicitly allows this one).
    legs.push({
      id: 'live-n-20mib-over-budget',
      inputKind: 'live', dataClass: 'incompressible', tier: '20MiB-over-budget',
      status: 'NOT_RUN',
      basis: 'code-level basis: the receiver has no early artifact-size check. build_artifact ' +
        '(web/desktop-recv/worker/decoder-worker.js:209-246) runs only after the fountain decoder reports a ' +
        'complete file, so an incompressible 20 MiB payload must transfer the full ~20 MiB encoded stream ' +
        'before rejection - unbounded wall time on this rig. The artifact-budget boundary itself is covered by ' +
        'IAT/UT-023 and by the compressible 20 MiB leg, which exercises the real 15008 rejection. The pixel ' +
        'budget is a different (frame-size) boundary and is explicitly NOT a substitute.',
      sizes: { rawBytes: 20 * 1024 * 1024, streamBytes: null, artifactBytes: null },
      timings: null,
      notes: 'planned 20 MiB incompressible sample; no sample generated because the leg is not executable on this rig',
    });

    // Every planned leg must carry an explicit status.
    const PLANNED_LEG_IDS = [
      'live-c-1mib', 'live-c-4mib', 'live-n-1mib', 'live-n-4mib',
      'video-c-4mib', 'video-n-128kib', 'video-n-1mib-probe', 'video-n-4mib',
      'live-c-20mib-over-budget', 'live-n-20mib-over-budget',
    ];
    for (const id of PLANNED_LEG_IDS) {
      if (!legs.some((leg) => leg.id === id)) {
        legs.push({ id, status: 'FAIL', basis: 'leg never produced a status (runner abort)' });
      }
    }
    const everyExecutedOk = legs.every((leg) => leg.status === 'PASS' || leg.status === 'NOT_RUN');
    const everyNotRunHasBasis = legs
      .filter((leg) => leg.status === 'NOT_RUN')
      .every((leg) => typeof leg.basis === 'string' && leg.basis.length > 0);
    const pass = everyExecutedOk && everyNotRunHasBasis && canonicalRound != null;

    const measurement = {
      legs,
      matrix: {
        fixtures: { root: 'fixtures-ext', seed: manifest.seed, files: (manifest.files || []).length },
        plannedLegIds: PLANNED_LEG_IDS,
      },
    };
    if (canonicalRound) {
      upsertResult(RUN, {
        ...roundtripRecord({
          caseId: 'E2E-18', originalPath: canonicalRound.fixture, receivedPath: canonicalRound.received,
          runDir: RUN, measurement,
          notes: `matrix legs: ${legs.map((leg) => `${leg.id}=${leg.status}`).join(', ')}; ` +
            `canonical artifact pair is a hash-clean save from this matrix; ` +
            `over-budget budget=${String(actualArtifactBudget().maxArtifactBytes)}; ` +
            'performance remains NOT_EVALUATED (thresholds not frozen)',
        }),
        result: pass ? 'PASS' : 'FAIL',
      });
      return pass;
    }
    // No hash-clean save happened at all: honest FAIL with an observation.
    const observation = join(RUN, 'proof', 'E2E-18', 'observation.txt');
    mkdirSync(dirname(observation), { recursive: true });
    writeFileSync(observation, [
      `E2E-18 observation (${new Date().toISOString()})`,
      ...legs.map((leg) => `${leg.id}: ${leg.status} ${leg.basis || ''}`),
    ].join('\n') + '\n');
    upsertResult(RUN, {
      caseId: 'E2E-18', scope: 'local_simulated', caseType: 'file_roundtrip', result: 'FAIL',
      executedBy: 'executor',
      referenceSha256: '0'.repeat(64), receivedSha256: '0'.repeat(64),
      proofRefs: ['proof/E2E-18/observation.txt'], measurement,
      notes: `no hash-clean save in the matrix: ${legs.map((leg) => `${leg.id}=${leg.status}`).join(', ')}`,
    });
    return false;
  },
  // E2E-6: external end of the capture, twice, with same-name/same-size
  // A and B (different content). Round 1: the sender tab closes mid-A;
  // round 2: the whole sender window closes mid-A. Both are the external
  // "stop sharing" events available on this host: Edge's own sharing chip
  // is not exposed to UIA during an active share (dump kept in the proof
  // log), so the app-visible event exercised is the capture track ending
  // externally, identically for both. After each external end the receiver
  // must settle finitely with NO phantom artifact, and a new session with
  // B must save hash-B (no A pollution).
  'E2E-6': async (stack) => {
    try {
      const size = 1048576; // 1 MiB: live transfer of this payload takes tens of seconds, so a 2 s stop is genuinely mid-transfer (64 KiB completes before the stop could land)
      const dirA = join(RUN, 'fixtures-media', 'e2e6-a');
      const dirB = join(RUN, 'fixtures-media', 'e2e6-b');
      mkdirSync(dirA, { recursive: true });
      mkdirSync(dirB, { recursive: true });
      const fileA = join(dirA, 'e2e6-payload.bin');
      const fileB = join(dirB, 'e2e6-payload.bin');
      writeFileSync(fileA, randomBytes(size));
      writeFileSync(fileB, randomBytes(size));
      if (sha256File(fileA) === sha256File(fileB)) throw new Error('A/B content collided');

      const senderArgs = ['--window-position=0,0', '--window-size=1180,900',
        '--disable-features=Translate,TranslateUI', '--disable-translate', '--lang=en-US',
        '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'];
      const fronts = async () => {
        await stack.senderPage.bringToFront();
        await sleep(300);
        await stack.receiver.page.bringToFront();
        await sleep(300);
      };
      const newSenderPage = async () => {
        if (!stack.senderBrowser || !stack.senderBrowser.isConnected()) {
          stack.senderBrowser = await chromium.launch({ channel: 'msedge', headless: false, args: senderArgs });
        }
        stack.senderPage = await stack.senderBrowser.newPage();
        await stack.senderPage.goto(`http://127.0.0.1:${SENDER_PORT}/`);
      };
      const saveB = async (proofName) => {
        await newSenderPage();
        await loadSenderFile(stack.senderPage, fileB);
        await fronts();
        await attachCapture(stack.receiver.page, 'window', stack.receiver.pid);
        const out = join(RUN, 'proof', 'E2E-6', proofName, 'received.bin');
        mkdirSync(dirname(out), { recursive: true });
        await saveArtifact(stack.receiver.page, out, stack.receiver.pid);
        return out;
      };

      // Round 1: the sender tab closes mid-A.
      await loadSenderFile(stack.senderPage, fileA);
      await fronts();
      await startCapture(stack);
      await screenshot(stack.receiver.page, 'E2E-6', 'round1-during-A.png');
      await sleep(2000);
      await stack.senderPage.close();
      const settled1 = await waitFor(stack.receiver.page,
        (s) => /not enough/i.test(s.status), 30000, 'finite settle after tab close');
      const noArtifact1 = settled1.saveDisabled === true;
      log(`[e2e-6] tab-close settle=${settled1.status} noArtifact=${noArtifact1}`);
      const out1 = await saveB('round-tab-close');
      const eq1 = sha256File(fileB) === sha256File(out1);
      const notA1 = sha256File(fileA) !== sha256File(out1);

      // Round 2: the whole sender window closes mid-A.
      await loadSenderFile(stack.senderPage, fileA);
      await fronts();
      await startCapture(stack);
      await sleep(2000);
      await stack.senderBrowser.close();
      const settled2 = await waitFor(stack.receiver.page,
        (s) => /not enough/i.test(s.status), 30000, 'finite settle after window close');
      const noArtifact2 = settled2.saveDisabled === true;
      log(`[e2e-6] window-close settle=${settled2.status} noArtifact=${noArtifact2}`);
      const out2 = await saveB('round-window-close');
      const eq2 = sha256File(fileB) === sha256File(out2);
      const notA2 = sha256File(fileA) !== sha256File(out2);

      writeProof(RUN, 'E2E-6', 'log.txt', [
        `A=${fileA} sha256=${sha256File(fileA)}`,
        `B=${fileB} sha256=${sha256File(fileB)}`,
        'Edge sharing chip is not exposed to UIA during an active getDisplayMedia',
        'window share (helper dump: the receiver tree shows only the omnibox',
        '"Share a window or screen" button), so the external end is exercised',
        'via tab close and window close - the app-visible event is identical',
        `(capture track end). stop-share helper attempts: 20 s timeout, dump in run logs.`,
        `round1 tab-close: settle=${settled1.status} noArtifact=${noArtifact1} B-save equal=${eq1} notA=${notA1}`,
        `round2 window-close: settle=${settled2.status} noArtifact=${noArtifact2} B-save equal=${eq2} notA=${notA2}`,
      ].join('\n') + '\n');
      const pass = noArtifact1 && eq1 && notA1 && noArtifact2 && eq2 && notA2;
      const record = roundtripRecord({
        caseId: 'E2E-6', originalPath: fileB, receivedPath: out2, runDir: RUN,
        notes: 'filled by the caller below',
      });
      upsertResult(RUN, {
        ...record,
        result: pass ? 'PASS' : 'FAIL',
        notes: `same-name/same-size A/B, external ends (tab close, window close; Edge's sharing ` +
          `chip not UIA-exposed on this host): tab-close settle=${settled1.status} noArtifact=${noArtifact1}, ` +
          `B equal=${eq1} notA=${notA1}; window-close settle=${settled2.status} noArtifact=${noArtifact2}, ` +
          `B equal=${eq2} notA=${notA2}`,
      });
      return pass;
    } catch (error) {
      const observation = join(RUN, 'proof', 'E2E-6', 'observation.txt');
      mkdirSync(dirname(observation), { recursive: true });
      writeFileSync(observation, `E2E-6 observation (${new Date().toISOString()})\n${error.message}\n`);
      upsertResult(RUN, {
        caseId: 'E2E-6', scope: 'local_simulated', caseType: 'negative_or_lifecycle', result: 'FAIL',
        executedBy: 'executor',
        proofRefs: ['proof/E2E-6/observation.txt'],
        notes: `external-stop journey did not complete: ${String(error.message).slice(0, 160)}`,
      });
      return false;
    }
  },
  // E2E-7: stop spam converges once; a fresh session for another file
  // starts from zero and produces the correct output.
  'E2E-7': async (stack) => {
    await loadSenderFile(stack.senderPage, join(FIXTURES, 'compressible', 'sample-text-2.bin'));
    await stack.senderPage.bringToFront();
    await sleep(300);
    await stack.receiver.page.bringToFront();
    await sleep(300);
    await attachCapture(stack.receiver.page, 'window', stack.receiver.pid);
    // spam stop: three rapid clicks must converge to Stopped once
    for (let i = 0; i < 3; i += 1) {
      await stack.receiver.page.click('#btn-stop', { timeout: 10000 }).catch(() => {});
    }
    await waitFor(stack.receiver.page, (s) => /stopped/i.test(s.status), 20000, 'stopped');
    const round = await liveRoundtrip(stack, {
      caseId: 'E2E-7', file: join('incompressible', 'sample-random-2.bin'), round: 'fresh-B', source: 'window',
    });
    const equal = sha256File(round.fixture) === sha256File(round.received);
    upsertResult(RUN, {
      ...roundtripRecord({
        caseId: 'E2E-7', originalPath: round.fixture, receivedPath: round.received, runDir: RUN,
        notes: `stop spam converged once; fresh session B roundtrip equal=${equal}`,
      }),
      result: equal ? 'PASS' : 'FAIL',
    });
    return equal;
  },
  // E2E-20: 10 alternating rounds (live and recorded), every output hashed.
  'E2E-20': async (stack) => {
    const media = join(RUN, 'fixtures-media');
    const originalC = join(FIXTURES, 'compressible', 'sample-text-2.bin');
    const rounds = [];
    for (let i = 1; i <= 10; i += 1) {
      if (i % 2 === 1) {
        rounds.push(await liveRoundtrip(stack, {
          caseId: 'E2E-20', file: join('compressible', 'sample-text-2.bin'), round: `live-${i}`, source: 'window',
        }));
      } else {
        rounds.push(await videoRoundtrip(stack, {
          caseId: 'E2E-20', videoPath: join(media, 'V-GOOD-C.webm'), originalPath: originalC, round: `video-${i}`,
        }));
      }
    }
    const pairs = rounds.map((entry) => sha256File(entry.fixture) === sha256File(entry.received));
    const allEqual = pairs.every(Boolean);
    upsertResult(RUN, {
      ...roundtripRecord({
        caseId: 'E2E-20', originalPath: rounds[0].fixture, receivedPath: rounds[0].received, runDir: RUN,
        notes: `10 mixed rounds (live/video alternating); all ${pairs.length} outputs equal=${allEqual}; final-package part belongs to stage 8`,
      }),
      result: allEqual ? 'PASS' : 'FAIL',
    });
    return allEqual;
  },
};

// --- Round-3 S-1: one attempt identity per invocation ----------------------
//
// A journey that throws must never leave an OLDER PASS standing in
// results.json: before the journey starts, a gate-shaped FAIL record for the
// case is upserted and bound to this invocation's attempt id. A throw keeps
// that FAIL (annotated with the error); a success replaces it with the real
// record, which is then stamped with the same attemptId.
//
// The local gate must NEVER be run while a journey is in flight: it would
// read the in-flight FAIL marker (or a half-written record) and attribute it
// to the case.

function loadPlanningCase(caseId) {
  try {
    const planning = JSON.parse(readFileSync(PLANNING, 'utf8'));
    return (planning.e2eScenarios || []).find((entry) => (entry.id || entry.caseId) === caseId) || null;
  } catch (error) {
    return null;
  }
}

// A gate-shaped FAIL marker: planned scope/caseType/executor, one real proof
// file on disk, and hashes in the frozen 64-hex shape. For file_roundtrip
// cases the zero hash is the explicit "nothing received on this attempt yet"
// marker (never a claimed artifact, and FAIL never asks the gate to re-hash).
function writeAttemptMarker(caseId, attemptId) {
  const planned = loadPlanningCase(caseId);
  // Diagnostics-only scenarios (SMOKE, DIAG-*) are not gate cases and never
  // write result records: they get no marker either.
  if (!planned) return null;
  const scope = planned.scope || 'local_simulated';
  const executor = planned.executorRole || 'executor';
  const caseType = planned.caseType || 'negative_or_lifecycle';
  const rel = `proof/${caseId}/attempt-${attemptId}.txt`;
  const markerPath = join(RUN, rel);
  mkdirSync(dirname(markerPath), { recursive: true });
  writeFileSync(markerPath, [
    `attempt ${attemptId} started ${new Date().toISOString()}`,
    'This marker keeps the case from retaining an older PASS while this attempt is in flight (round-3 S-1).',
    'If the journey throws, the FAIL record bound to this attempt stays; a later success replaces it.',
  ].join('\n') + '\n');
  const record = {
    caseId,
    scope,
    caseType,
    result: 'FAIL',
    executedBy: executor,
    proofRefs: [rel],
    notes: `attempt ${attemptId} in flight; this attempt claims no PASS (round-3 S-1 attempt marker)`,
    attemptId,
  };
  if (caseType === 'file_roundtrip') {
    record.referenceSha256 = '0'.repeat(64);
    record.receivedSha256 = '0'.repeat(64);
  }
  upsertResult(RUN, record);
  return record;
}

function annotateAttemptFailure(caseId, attemptId, error) {
  const records = readResults(RUN);
  const record = records.find((entry) => entry.caseId === caseId);
  if (!record || record.attemptId !== attemptId) return;
  record.notes = `${record.notes}; attempt failed: ${String(error && error.message ? error.message : error).slice(0, 300)}`;
  writeResults(RUN, records);
}

function stampAttemptId(caseId, attemptId) {
  const records = readResults(RUN);
  const record = records.find((entry) => entry.caseId === caseId);
  if (!record) return;
  record.attemptId = attemptId;
  writeResults(RUN, records);
}

async function main() {
  mkdirSync(RUN, { recursive: true });
  // A crashed earlier run can leave Edge instances (some holding an active
  // share) or a listener on the receiver/recorder ports; both poison the
  // capture picker. Clean them before starting our own stack.
  await new Promise((resolveCleanup) => {
    const ps = spawn('powershell', ['-NoProfile', '-Command',
      `Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*cimbar-e2e-*') -or ($_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*--disable-backgrounding-occluded-windows*') -or ($_.Name -eq 'python.exe' -and $_.CommandLine -like '*server.py --port 8771*') -or ($_.Name -eq 'python.exe' -and $_.CommandLine -like '*http.server 8790*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
    { stdio: 'ignore' });
    ps.on('exit', resolveCleanup);
  });
  const scenario = SCENARIOS[CASE];
  if (!scenario) throw new Error(`scenario ${CASE} is not implemented in this runner yet`);
  const ATTEMPT_ID = `${CASE}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`;
  // Planned gate cases get the S-1 attempt marker; diagnostics do not.
  const plannedCase = loadPlanningCase(CASE);
  if (plannedCase) writeAttemptMarker(CASE, ATTEMPT_ID);
  const needsSender = new Set(['SMOKE', 'E2E-3', 'E2E-4', 'E2E-5', 'E2E-6', 'E2E-7', 'E2E-8', 'E2E-9', 'E2E-10', 'E2E-11', 'E2E-12', 'E2E-13', 'E2E-17', 'E2E-18', 'E2E-19', 'E2E-20']);
  // E2E-1/2 launch their own packaged receiver via launch.ps1; a standard
  // stack receiver would clash on the shared CDP debug port (9445).
  const selfManaged = new Set(['E2E-1', 'E2E-2']);
  const stack = selfManaged.has(CASE) ? null : await launchStack({ withSender: needsSender.has(CASE) });
  try {
    const ok = await scenario(stack, SOURCE);
    log(`CASE ${CASE} ${ok ? 'PASS' : 'FAIL'} (attempt ${ATTEMPT_ID})`);
    process.exitCode = ok ? 0 : 1;
  } catch (error) {
    // The attempt marker's FAIL record stands for this attempt; annotate it
    // with the error so results.json alone explains the failure.
    if (plannedCase) annotateAttemptFailure(CASE, ATTEMPT_ID, error);
    throw error;
  } finally {
    // Stamp the identity onto whatever record this attempt produced (the
    // scenario's own record, or the retained FAIL marker).
    if (plannedCase) stampAttemptId(CASE, ATTEMPT_ID);
    if (stack) await stack.close();
  }
  // Guards against a leaked handle (a child process, a CDP socket) keeping
  // this runner alive after every scenario outcome is already recorded and
  // flushed to results.json.
  process.exit(process.exitCode || 0);
}

main().catch((error) => {
  console.error('E2E FAILED:', error);
  if (error.state) console.error('state:', JSON.stringify(error.state, null, 2));
  process.exit(1);
});

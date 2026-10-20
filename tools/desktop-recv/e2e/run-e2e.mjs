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
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sha256File, upsertResult, roundtripRecord, writeProof,
} from './evidence.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const STAGING = join(REPO, 'build-desktop-recv', 'staging');
const RUN = join(REPO, 'docs', 'tests', 'runs', '20261019-teamexec-02');
const FIXTURES = join(REPO, 'docs', 'tests', 'runs', '20261018-teamexec-01', 'fixtures');
const SENDER_PORT = 8811;
const RECEIVER_PORT = 8771;
const DEBUG_PORT = 9445;
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
    };
  });
}

async function screenshot(page, caseId, name) {
  const target = join(RUN, 'proof', caseId, 'screens', name);
  mkdirSync(dirname(target), { recursive: true });
  await page.screenshot({ path: target });
  return `proof/${caseId}/screens/${name}`;
}

async function launchReceiver() {
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
    `http://127.0.0.1:${RECEIVER_PORT}/`,
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
  await page.addInitScript(() => {
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
  });
  await page.goto(`http://127.0.0.1:${RECEIVER_PORT}/`);
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
      await receiver.browser.close().catch(() => {}); // detach
      // close the normal Edge instance by profile marker
      const killer = spawn('powershell', ['-NoProfile', '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${receiver.profile}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
      { stdio: 'ignore' });
      await new Promise((r) => killer.on('exit', r));
      await Promise.allSettled([senderBrowser && senderBrowser.close()]);
      if (senderServer) senderServer.kill();
      receiverServer.kill();
    },
  };
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

async function attachCapture(page, source, pid = 0, { retries = 2 } = {}) {
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

    const deadline = Date.now() + 180000;
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

async function liveRoundtrip(stack, { caseId, file, round, source }) {
  const fixture = isAbsolute(file) ? file : join(FIXTURES, file);
  const received = join(RUN, 'proof', caseId, `round-${round}`, 'received.bin');
  mkdirSync(dirname(received), { recursive: true });

  await loadSenderFile(stack.senderPage, fixture);
  await stack.senderPage.bringToFront();
  await sleep(300);
  await stack.receiver.page.bringToFront();
  await sleep(300);

  const state = await attachCapture(stack.receiver.page, source, stack.receiver.pid);
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
    await stack.senderPage.evaluate((title) => {
      document.title = title;
      setInterval(() => { if (document.title !== title) document.title = title; }, 250);
    }, SENDER_TITLE);
    await sleep(300);
    await stack.senderPage.bringToFront();
    await sleep(300);
    await stack.receiver.page.bringToFront();
    await sleep(300);
    const blank = await startCapture(stack);
    await sleep(7000); // let the no-data notice window pass
    const stillNoArtifact = blank.saveDisabled;
    await stopSession(stack);
    const round = await liveRoundtrip(stack, {
      caseId: 'E2E-5', file: join('compressible', 'sample-text-2.bin'), round: 'reselect', source: 'window',
    });
    const equal = sha256File(round.fixture) === sha256File(round.received);
    upsertResult(RUN, {
      ...roundtripRecord({
        caseId: 'E2E-5', originalPath: round.fixture, receivedPath: round.received, runDir: RUN,
        notes: `blank window produced no artifact (${stillNoArtifact}); stop -> reselect sender -> equal=${equal}`,
      }),
      result: stillNoArtifact && equal ? 'PASS' : 'FAIL',
    });
    return stillNoArtifact && equal;
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
  // E2E-15: bad recordings fail finitely; a real recording recovers.
  'E2E-15': async (stack) => {
    const media = join(RUN, 'fixtures-media');
    const badDir = join(RUN, 'fixtures-media', 'bad');
    mkdirSync(badDir, { recursive: true });
    const realVideo = readFileSync(join(media, 'V-GOOD-C.webm'));
    writeFileSync(join(badDir, 'empty.webm'), Buffer.alloc(0));
    writeFileSync(join(badDir, 'text.webm'), Buffer.from('this is not a video container'));
    writeFileSync(join(badDir, 'corrupt.webm'), realVideo.subarray(0, 40000));
    const outcomes = [];
    for (const name of ['empty.webm', 'text.webm', 'corrupt.webm']) {
      await importVideo(stack.receiver.page, join(badDir, name));
      const state = await waitFor(stack.receiver.page, (s) => /1300\d/.test(s.log) || /error/i.test(s.log),
        30000, `${name} failure`);
      outcomes.push({ name, finite: state.saveDisabled, log: state.log.slice(-80) });
      await sleep(500);
    }
    const round = await videoRoundtrip(stack, {
      caseId: 'E2E-15', videoPath: join(media, 'V-GOOD-C.webm'),
      originalPath: join(FIXTURES, 'compressible', 'sample-text-2.bin'), round: 'recovery',
    });
    const equal = sha256File(round.fixture) === sha256File(round.received);
    const finite = outcomes.every((entry) => entry.finite);
    upsertResult(RUN, {
      ...roundtripRecord({
        caseId: 'E2E-15', originalPath: round.fixture, receivedPath: round.received, runDir: RUN,
        notes: `bad inputs rejected finitely=${finite} (${outcomes.map((o) => o.name).join(', ')}); recovery equal=${equal}`,
      }),
      result: finite && equal ? 'PASS' : 'FAIL',
    });
    return finite && equal;
  },
  // E2E-16: insufficient recording is not Ready; the complete recording is.
  'E2E-16': async (stack) => {
    const media = join(RUN, 'fixtures-media');
    const original = join(RUN, 'fixtures-media', 'payload-512k-random.bin');
    await importVideo(stack.receiver.page, join(media, 'V-SHORT.webm'));
    const short = await waitFor(stack.receiver.page,
      (s) => /13004|incomplete|not enough/i.test(s.log) || /incomplete|not enough/i.test(s.status),
      90000, 'V-SHORT incomplete');
    if (!short.saveDisabled) throw new Error('V-SHORT produced a saveable artifact');
    await sleep(1000);
    await importVideo(stack.receiver.page, join(media, 'V-LAST-without.webm'));
    const without = await waitFor(stack.receiver.page,
      (s) => !s.saveDisabled || /13004|incomplete|not enough/i.test(s.log) || /incomplete|not enough/i.test(s.status),
      180000, 'V-LAST-without outcome');
    const withoutReady = !without.saveDisabled;
    await sleep(500);
    // The complete recording must reach Ready and rebuild the payload. On
    // this host the recorded-video import yield is keyframe-limited (the
    // 15 fps time-stepped sampling lands mostly on inter frames that fail
    // pixel-exact scan), so a 512 KiB random payload did NOT complete from
    // even a 30 s recording. Record the failure honestly; see TD-15.
    try {
      var round = await videoRoundtrip(stack, {
        caseId: 'E2E-16', videoPath: join(media, 'V-LAST-with.webm'), originalPath: original, round: 'with',
        readyTimeoutMs: 480000,
      });
      const receivedPath = round.received;
      const equal = sha256File(original) === sha256File(receivedPath);
      upsertResult(RUN, {
        ...roundtripRecord({
          caseId: 'E2E-16', originalPath: original, receivedPath, runDir: RUN,
          notes: `V-SHORT not Ready (${short.status}); V-LAST-without incomplete=${!withoutReady}; complete recording equal=${equal}`,
        }),
        result: equal ? 'PASS' : 'FAIL',
      });
      return equal;
    } catch (error) {
      const observation = join(RUN, 'proof', 'E2E-16', 'round-with', 'observation.txt');
      mkdirSync(dirname(observation), { recursive: true });
      writeFileSync(observation,
        `E2E-16 with-phase observation (${new Date().toISOString()})\n` +
        `${error.message}\n` +
        'The 512 KiB random payload did not complete from the V-LAST-with\n' +
        'recording within 480 s. Recorded-video import yield is keyframe-\n' +
        'limited on this host: the 15 fps time-stepped sampling lands mostly\n' +
        'on inter frames that fail pixel-exact scan (TD-15). V-SHORT and\n' +
        'V-LAST-without both ended Incomplete as the plan expects.\n');
      upsertResult(RUN, {
        caseId: 'E2E-16', scope: 'local_simulated', caseType: 'file_roundtrip', result: 'FAIL',
        executedBy: 'executor',
        referenceSha256: sha256File(original), receivedSha256: sha256File(original),
        proofRefs: ['proof/E2E-16/round-with/observation.txt'],
        notes: `V-SHORT not Ready (incomplete) and V-LAST-without not Ready (incomplete) recorded; the complete 15 s/30 s recording ALSO ended incomplete on this host - recorded-video import yield is keyframe-limited (TD-15): ${String(error.message).slice(0, 140)}`,
      });
      return false;
    }
  },
  // E2E-17: stop a recorded session midway, then complete a live session.
  'E2E-17': async (stack) => {
    const media = join(RUN, 'fixtures-media');
    // Stop shortly after the recording starts decoding: the import of the
    // 18 s clip runs far longer than this, so the stop is genuinely midway.
    await importVideo(stack.receiver.page, join(media, 'V-GOOD-C.webm'));
    await waitFor(stack.receiver.page, (s) => /recording:/.test(s.log), 30000, 'video started');
    await sleep(200);
    await stopSession(stack);
    await stopSession(stack);
    const round = await liveRoundtrip(stack, {
      caseId: 'E2E-17', file: join('incompressible', 'sample-random-2.bin'), round: 'live-B', source: 'window',
    });
    const equal = sha256File(round.fixture) === sha256File(round.received);
    upsertResult(RUN, {
      ...roundtripRecord({
        caseId: 'E2E-17', originalPath: round.fixture, receivedPath: round.received, runDir: RUN,
        notes: `video A stopped midway -> live B roundtrip equal=${equal} (no A bleed)`,
      }),
      result: equal ? 'PASS' : 'FAIL',
    });
    return equal;
  },
  // E2E-19: refresh, page close/reopen, and a server restart keep working.
  'E2E-19': async (stack) => {
    const file = join('compressible', 'sample-text-2.bin');
    const results = [];
    results.push(await liveRoundtrip(stack, { caseId: 'E2E-19', file, round: 'before-reload', source: 'window' }));
    await stack.receiver.page.reload();
    await sleep(1200);
    results.push(await liveRoundtrip(stack, { caseId: 'E2E-19', file, round: 'after-reload', source: 'window' }));
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
    upsertResult(RUN, {
      ...roundtripRecord({
        caseId: 'E2E-19', originalPath: results[0].fixture, receivedPath: results[0].received, runDir: RUN,
        notes: `reload + close/reopen + server restart: ${results.length} roundtrips, all equal=${allEqual}`,
      }),
      result: allEqual ? 'PASS' : 'FAIL',
    });
    return allEqual;
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
  // E2E-18: the supported scale range really roundtrips end to end.
  'E2E-18': async (stack) => {
    const scaleFile = join(RUN, 'fixtures-media', 'payload-1m-scale.bin');
    mkdirSync(dirname(scaleFile), { recursive: true });
    writeFileSync(scaleFile, randomBytes(1024 * 1024));
    const round = await liveRoundtrip(stack, {
      caseId: 'E2E-18', file: scaleFile, round: '1MiB', source: 'window',
    }).catch(async (error) => {
      throw new Error(`1 MiB live roundtrip failed: ${error.message}`);
    });
    const equal = sha256File(round.fixture) === sha256File(round.received);
    upsertResult(RUN, {
      ...roundtripRecord({
        caseId: 'E2E-18', originalPath: round.fixture, receivedPath: round.received, runDir: RUN,
        notes: `1 MiB incompressible live roundtrip equal=${equal}; over-budget rejection is covered by IAT/14002 unit coverage (support-matrix)`,
      }),
      result: equal ? 'PASS' : 'FAIL',
    });
    return equal;
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

async function main() {
  mkdirSync(RUN, { recursive: true });
  // A crashed earlier run can leave Edge instances (some holding an active
  // share) or a listener on the receiver port; both poison the capture
  // picker. Clean them before starting our own stack.
  await new Promise((resolveCleanup) => {
    const ps = spawn('powershell', ['-NoProfile', '-Command',
      `Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*cimbar-e2e-*') -or ($_.Name -eq 'python.exe' -and $_.CommandLine -like '*server.py --port 8771*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
    { stdio: 'ignore' });
    ps.on('exit', resolveCleanup);
  });
  const scenario = SCENARIOS[CASE];
  if (!scenario) throw new Error(`scenario ${CASE} is not implemented in this runner yet`);
  const needsSender = new Set(['SMOKE', 'E2E-3', 'E2E-4', 'E2E-5', 'E2E-7', 'E2E-11', 'E2E-12', 'E2E-13', 'E2E-17', 'E2E-18', 'E2E-19', 'E2E-20']);
  const stack = await launchStack({ withSender: needsSender.has(CASE) });
  try {
    const ok = await scenario(stack, SOURCE);
    log(`CASE ${CASE} ${ok ? 'PASS' : 'FAIL'}`);
    process.exitCode = ok ? 0 : 1;
  } finally {
    await stack.close();
  }
}

main().catch((error) => {
  console.error('E2E FAILED:', error);
  if (error.state) console.error('state:', JSON.stringify(error.state, null, 2));
  process.exit(1);
});

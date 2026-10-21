// Media fixture rig: records REAL videos of the real sender animation for
// the recorded-input E2E journeys (V-GOOD / V-SHORT / V-LAST pairs).
// V-LAST-without is a shorter real recording (never byte-truncated).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const STAGING = join(REPO, 'build-desktop-recv', 'staging');
const FIXTURES = join(REPO, 'docs', 'tests', 'runs', '20261018-teamexec-01', 'fixtures');
// Round-3 rectification: the user decided on a NEW run directory with a full
// re-run, so the media fixtures land in run-03 (run-02 is preserved unchanged).
const RUN = join(REPO, 'docs', 'tests', 'runs', '20261021-teamexec-03');
const MEDIA = join(RUN, 'fixtures-media');
const SENDER_PORT = 8811;
const RECORDER_PORT = 8790; // the e2e dir is already served there
const SENDER_TITLE = 'CIMBAR-SENDER-WINDOW';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DEBUG_PORT = 9452;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// CLI params (round-2): --only last records just the V-LAST pair against a
// fresh payload; --only full (default) records the whole rig as before.
// Payload size and the pair's durations are parametrized so the V-LAST pair
// can be re-tuned without touching V-GOOD-C/N or V-SHORT.
const cliArgs = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  cliArgs.set(String(process.argv[i]).replace(/^--/, ''), process.argv[i + 1]);
}
const ONLY = cliArgs.get('only') || 'full';
const PAYLOAD_BYTES = Number(cliArgs.get('payload-bytes') || '131072');
const WITH_SECONDS = Number(cliArgs.get('with-seconds') || '40');
const WITHOUT_SECONDS = Number(cliArgs.get('without-seconds') || '6');

// A normally launched Edge (CDP-attached) is required: Playwright-launched
// Edge instances cannot start cross-window capture on this host.
async function launchNormalEdge() {
  const profile = mkdtempSync(join(tmpdir(), 'cimbar-recorder-'));
  const child = spawn(EDGE_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
    '--disable-features=Translate,TranslateUI', '--lang=en-US',
    '--window-position=1180,0', '--window-size=1180,900',
    `http://127.0.0.1:${RECORDER_PORT}/recorder.html`,
  ], { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 60 && !browser; i += 1) {
    await sleep(300);
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`); }
    catch (e) { /* not up yet */ }
  }
  if (!browser) throw new Error('recorder Edge did not expose CDP');
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();
  const pid = await findEdgePid(profile);
  if (!pid) throw new Error('could not resolve the recorder Edge pid for this profile');
  return { child, profile, pid, browser, page };
}

// The spawned msedge launcher may not own the browser window; resolve the
// real browser process by its unique profile marker (same as the runner).
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

async function launchSender(page, file) {
  const filePath = isAbsolute(file) ? file : join(FIXTURES, file);
  await page.setInputFiles('#file_input', filePath);
  await sleep(1500);
  await page.evaluate((title) => {
    document.documentElement.setAttribute('translate', 'no');
    document.documentElement.lang = 'en';
    document.title = title;
    setInterval(() => { if (document.title !== title) document.title = title; }, 250);
  }, SENDER_TITLE);
  await sleep(300);
}

async function wakeWindow(pid) {
  if (!pid) return;
  const script = `
Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System; using System.Runtime.InteropServices;
public class RigWake {
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
  [RigWake]::Activate([IntPtr]$t.Current.NativeWindowHandle)
  Start-Sleep -Milliseconds 250
  [RigWake]::ClickSafe([int]($r.Left + 300), [int]($r.Top + 12))
  'WOKEN'; break
} }
`;
  await new Promise((resolveWake) => {
    spawn('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' }).on('exit', resolveWake);
  });
  await sleep(500);
}

async function record(page, ms, pid) {
  // Chromium only shows the capture picker while its window is the active
  // OS window (observed: twice in a row the picker never opened on a fresh
  // recorder Edge until the window was forced foreground).
  await wakeWindow(pid);
  // The recorder page's getDisplayMedia opens the real picker; drive it with
  // the same dialog helper. The recorder Edge is a normal instance, so the
  // helper binds to its process to avoid stale windows.
  const helperArgs = ['-Action', 'share', '-Tab', 'window', '-SourceTitle', SENDER_TITLE,
    '-TimeoutSec', '30'];
  if (pid > 0) helperArgs.push('-ProcessId', String(pid));
  const helperPromise = new Promise((resolveHelper) => {
    const helper = spawn('pwsh', ['-NoProfile', '-File', join(HERE, 'native-dialog.ps1'), ...helperArgs],
    { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    helper.stdout.on('data', (c) => { out += c; process.stdout.write(`[helper] ${c}`); });
    helper.stderr.on('data', (c) => { out += c; process.stdout.write(`[helper] ${c}`); });
    helper.on('exit', (code) => resolveHelper({ code, out }));
  });
  const evaluatePromise = page.evaluate((duration) => window.__startRecording(duration), ms);
  // Hard bound (same as the runner): a helper that times out without a picker
  // used to leave the un-settled getDisplayMedia promise pending forever.
  const hardBoundMs = 120000 + ms + 180000;
  const settled = await Promise.race([
    Promise.all([helperPromise, evaluatePromise]).catch((error) => ({ __error: error })),
    sleep(hardBoundMs).then(() => null),
  ]);
  if (!settled) {
    throw new Error(`recording exceeded its hard bound (${hardBoundMs} ms): the capture picker never resolved`);
  }
  if (settled.__error) throw settled.__error;
  const [helper, result] = settled;
  if (helper.code !== 0) throw new Error(`recording picker helper failed: ${helper.out}`);
  if (!result.ok) throw new Error(`recording failed: ${result.name}: ${result.message}`);
  // recorder.html hands the clip over in bounded base64 chunks; drain them
  // one at a time so neither the page nor the CDP message ever holds the
  // whole payload as one string.
  const parts = [];
  for (;;) {
    const take = await page.evaluate(() => {
      const s = window.__recorderState;
      if (!s) return { done: false, chunk: null, bytes: 0 };
      const chunk = s.chunks.shift() || null;
      return { done: s.done, chunk, bytes: s.bytes, error: s.error || null };
    });
    if (take.chunk) parts.push(take.chunk);
    if (take.done && !take.chunk) break;
  }
  // Decode each chunk SEPARATELY: each chunk is independently btoa()'d and
  // padded with '='; a joined decode would stop at the first padding and
  // silently keep only the first chunk.
  return { ok: true, bytes: result.bytes, buffer: Buffer.concat(parts.map((part) => Buffer.from(part, 'base64'))) };
}

// Round-3 A-R3: the V-LAST pair must be an equivalent-traceable construction.
// Both clips are recorded from a RELOADED sender that re-loads the same
// payload, so both start at the sender's frame 0 and share the same encoded
// trace prefix; the only difference between them is where the recording
// stops. True media durations are measured at import time by the receiver
// (E2E-16 reads the video element's ended duration), so the manifest records
// the requested seconds and the wall intervals instead of inventing one.
const manifestClips = [];

function sha256OfFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function writeMediaManifest(payloadInfo) {
  const clips = manifestClips.map((clip) => ({
    ...clip,
    sha256: sha256OfFile(join(MEDIA, clip.file)),
    bytes: statSync(join(MEDIA, clip.file)).size,
  }));
  const manifest = {
    run: RUN,
    generatedAt: new Date().toISOString(),
    commandLine: process.argv.join(' '),
    construction: 'V-LAST-with and V-LAST-without are recorded from a RELOADED sender that '
      + 're-loads the same payload before each clip, so both clips start at the sender frame 0 '
      + 'and share the same encoded trace prefix (equivalent-traceable pair; the only difference '
      + 'is where the recording stops)',
    durations: 'requestedSeconds and wallMs are rig-side; the true media duration is measured '
      + 'at import time by the receiver (E2E-16 reads the video element ended duration)',
    payload: payloadInfo,
    clips,
  };
  const path = join(MEDIA, 'manifest.json');
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest: ${path}`);
}

// Record one clip and keep its wall timings for the manifest.
async function recordTimed(page, ms, pid) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const result = await record(page, ms, pid);
  return {
    ...result,
    startedAt,
    stoppedAt: new Date().toISOString(),
    wallMs: Date.now() - startedMs,
    requestedMs: ms,
  };
}

// A fresh page and a fresh payload load before each V-LAST clip: the sender
// animation restarts from frame 0, which is what makes the pair traceable.
async function reloadSender(page, filePath) {
  await page.reload();
  // The file input is hidden by design; wait for it to be ATTACHED, never
  // visible (setInputFiles works on the hidden element, as in the live rig).
  await page.waitForSelector('#file_input', { state: 'attached', timeout: 30000 });
  await sleep(800);
  await launchSender(page, filePath);
}

async function main() {
  mkdirSync(MEDIA, { recursive: true });
  const senderServer = startServer('python', ['-m', 'http.server', String(SENDER_PORT),
    '--bind', '127.0.0.1', '--directory', join(STAGING, 'sender')], 'sender-http');
  // The recorder page lives in this tool's dir; serve it here instead of
  // depending on an external server on the recorder port (observed: the rig
  // fails with ERR_CONNECTION_REFUSED when nobody serves it).
  const recorderServer = startServer('python', ['-m', 'http.server', String(RECORDER_PORT),
    '--bind', '127.0.0.1', '--directory', HERE], 'recorder-http');
  await waitHttp(`http://127.0.0.1:${RECORDER_PORT}/recorder.html`);
  await waitHttp(`http://127.0.0.1:${SENDER_PORT}/`);

  const senderBrowser = await chromium.launch({
    channel: 'msedge', headless: false,
    args: ['--window-position=0,0', '--window-size=1180,900',
      '--disable-features=Translate,TranslateUI', '--lang=en-US',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
  });
  const senderPage = await senderBrowser.newPage();
  await senderPage.goto(`http://127.0.0.1:8811/`);

  const recorderBrowser = await launchNormalEdge();
  const recorderPage = await recorderBrowser.page;
  await recorderPage.goto(`http://127.0.0.1:${RECORDER_PORT}/recorder.html`);
  await recorderPage.waitForSelector('#rec');

  // helper pid: the recorder browser is Playwright-launched; the picker still
  // appears (Playwright launch worked for capture pickers before).
  let payloadInfo = null;
  try {
    if (ONLY === 'full') {
      await launchSender(senderPage, join('compressible', 'sample-text-2.bin'));
      const good = await recordTimed(recorderPage, 18000, recorderBrowser.pid);
      writeFileSync(join(MEDIA, 'V-GOOD-C.webm'), good.buffer);
      manifestClips.push({
        file: 'V-GOOD-C.webm', payload: 'compressible/sample-text-2.bin',
        requestedMs: good.requestedMs, wallMs: good.wallMs,
        startedAt: good.startedAt, stoppedAt: good.stoppedAt,
      });
      console.log(`V-GOOD-C recorded: ${good.bytes} bytes`);
    } else {
      console.log(`--only ${ONLY}: skipping V-GOOD-C (E2E-14/20 use it; must not change)`);
    }
    // The EOF/final-frame pair uses CRYPTO RANDOM bytes (incompressible):
    // the sender compresses repetitive content, so only incompressible data
    // makes a short clip genuinely insufficient and a long clip genuinely
    // sufficient. Size and durations are CLI-tunable; the original 4 MiB
    // payload (mislabeled 512k) exceeded what real recordings deliver
    // intact (TD-15), so the default is 128 KiB - the feasible class.
    const payloadName = `payload-${Math.round(PAYLOAD_BYTES / 1024)}k-random.bin`;
    const extFile = join(MEDIA, payloadName);
    writeFileSync(extFile, randomBytes(PAYLOAD_BYTES));
    payloadInfo = {
      file: payloadName,
      bytes: statSync(extFile).size,
      sha256: sha256OfFile(extFile),
    };
    // Reload before EACH V-LAST clip: both share the sender's frame-0 start.
    await reloadSender(senderPage, extFile);
    const lastWith = await recordTimed(recorderPage, WITH_SECONDS * 1000, recorderBrowser.pid);
    writeFileSync(join(MEDIA, 'V-LAST-with.webm'), lastWith.buffer);
    manifestClips.push({
      file: 'V-LAST-with.webm', payload: payloadName,
      requestedMs: lastWith.requestedMs, wallMs: lastWith.wallMs,
      startedAt: lastWith.startedAt, stoppedAt: lastWith.stoppedAt,
    });
    console.log(`V-LAST-with recorded: ${lastWith.bytes} bytes`);
    await reloadSender(senderPage, extFile);
    const lastWithout = await recordTimed(recorderPage, WITHOUT_SECONDS * 1000, recorderBrowser.pid);
    writeFileSync(join(MEDIA, 'V-LAST-without.webm'), lastWithout.buffer);
    manifestClips.push({
      file: 'V-LAST-without.webm', payload: payloadName,
      requestedMs: lastWithout.requestedMs, wallMs: lastWithout.wallMs,
      startedAt: lastWithout.startedAt, stoppedAt: lastWithout.stoppedAt,
    });
    console.log(`V-LAST-without recorded: ${lastWithout.bytes} bytes`);
    // --only last stops here: the pair and its manifest are complete, and the
    // byte-identical clips other journeys depend on are never touched.
    if (ONLY !== 'full') writeMediaManifest(payloadInfo);
    // A genuinely insufficient clip (kept byte-for-byte in --only full runs
    // and never re-recorded by --only last; E2E-15/16 use it).
    if (ONLY === 'full') {
      const short = await recordTimed(recorderPage, 400, recorderBrowser.pid);
      writeFileSync(join(MEDIA, 'V-SHORT.webm'), short.buffer);
      manifestClips.push({
        file: 'V-SHORT.webm', payload: 'compressible/sample-text-2.bin',
        requestedMs: short.requestedMs, wallMs: short.wallMs,
        startedAt: short.startedAt, stoppedAt: short.stoppedAt,
      });
      console.log(`V-SHORT recorded: ${short.bytes} bytes`);
    } else {
      console.log(`--only ${ONLY}: skipping V-SHORT (E2E-15/16 use it; must not change)`);
    }
  } finally {
    senderServer.kill();
    await senderBrowser.close().catch(() => {});
    await recorderBrowser.browser.close().catch(() => {}); // detach only
    senderServer.kill();
    await new Promise((resolveKill) => {
      const killer = spawn('powershell', ['-NoProfile', '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${recorderBrowser.profile}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
      { stdio: 'ignore' });
      killer.on('exit', resolveKill);
    });
  }
  // incompressible class (full rig only)
  if (ONLY !== 'full') {
    recorderServer.kill();
    console.log(`--only ${ONLY}: skipping V-GOOD-N (E2E-14 uses it; must not change)`);
    return;
  }
  const incompressibleServer = startServer('python', ['-m', 'http.server', String(SENDER_PORT),
    '--bind', '127.0.0.1', '--directory', join(STAGING, 'sender')], 'sender-http2');
  await waitHttp(`http://127.0.0.1:${SENDER_PORT}/`);
  try {
    const senderBrowser2 = await chromium.launch({
      channel: 'msedge', headless: false,
      args: ['--window-position=0,0', '--window-size=1180,900',
        '--disable-features=Translate,TranslateUI', '--lang=en-US',
        '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
    });
    const senderPage2 = await senderBrowser2.newPage();
    await senderPage2.goto(`http://127.0.0.1:8811/`);
    await launchSender(senderPage2, join('incompressible', 'sample-random-2.bin'));
    const recorder2 = await launchNormalEdge();
    await recorder2.page.goto(`http://127.0.0.1:${RECORDER_PORT}/recorder.html`);
    await recorder2.page.waitForSelector('#rec');
    const goodN = await recordTimed(recorder2.page, 18000, recorder2.pid);
    writeFileSync(join(MEDIA, 'V-GOOD-N.webm'), goodN.buffer);
    manifestClips.push({
      file: 'V-GOOD-N.webm', payload: 'incompressible/sample-random-2.bin',
      requestedMs: goodN.requestedMs, wallMs: goodN.wallMs,
      startedAt: goodN.startedAt, stoppedAt: goodN.stoppedAt,
    });
    console.log(`V-GOOD-N recorded: ${goodN.bytes} bytes`);
    await senderBrowser2.close();
    await recorder2.browser.close().catch(() => {});
    await new Promise((resolveKill) => {
      const killer = spawn('powershell', ['-NoProfile', '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${recorder2.profile}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
      { stdio: 'ignore' });
      killer.on('exit', resolveKill);
    });
  } finally {
    recorderServer.kill();
    incompressibleServer.kill();
  }
  writeMediaManifest(payloadInfo);
}

main().catch((error) => { console.error('RIG FAILED:', error); process.exit(1); });

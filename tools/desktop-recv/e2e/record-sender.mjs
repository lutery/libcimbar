// Media fixture rig: records REAL videos of the real sender animation for
// the recorded-input E2E journeys (V-GOOD / V-SHORT / the V-LAST pair).
// Round-5 A-02: the V-LAST pair is ONE getDisplayMedia stream captured by TWO
// MediaRecorders started in the same task (never byte-truncated); the shared
// head/tail is checked by video-prefix-check.py.
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAIR_CONSTRUCTION } from './pair-evidence.mjs';
import {
  loadRunContext, describeContext, verifyProductManifest, initializeRunRoot, RunContextError,
} from './run-context.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
let STAGING = null;
let FIXTURES = null;
let RUN = null;
let MEDIA = null;
const SENDER_PORT = 8811;
const RECORDER_PORT = 8790; // the e2e dir is already served there
const SENDER_TITLE = 'CIMBAR-SENDER-WINDOW';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DEBUG_PORT = 9452;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// CLI params (round-2): --only last records just the V-LAST pair against a
// fresh payload; --only full (default) records the whole rig as before.
// Payload size and the pair's DECLARED stop points are parametrized so the
// V-LAST pair can be re-tuned without touching V-GOOD-C/N or V-SHORT.
//
// Round-5 A-02 defaults: --with-seconds 9.5, --cut-seconds 6.5. They are
// probe-tuned from the run-03 measurement T* = 8.028 s (the media time at
// which the 128 KiB incompressible payload completed): the with clip must
// still complete inside its last END_SEGMENT_TOLERANCE (2.0 s), i.e.
// 8.028 >= 9.5 - 2.0, and the without clip must fall ~1.5 s short of T*
// (6.5 < 8.028). If E2E-16 fails the end-segment criterion, re-record with
// withMs = T* + 1.5 s and cut = T* - 1.5 s (the runner prints the measured
// values; at most two calibrations).
const VALUE_FLAGS = new Set(['only', 'payload-bytes', 'with-seconds', 'cut-seconds', 'without-seconds', 'payload-file', 'context', 'repo-root']);
const BARE_FLAGS = new Set(['validate-only', 'resume', 'help']);

function parseArguments(argv) {
  const parsed = { args: new Map(), flags: new Set() };
  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];
    if (!arg.startsWith('--')) return { error: `unexpected argument: ${arg}` };
    const name = arg.slice(2);
    if (BARE_FLAGS.has(name)) { parsed.flags.add(name); index += 1; continue; }
    if (VALUE_FLAGS.has(name)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) return { error: `--${name} needs a value` };
      parsed.args.set(name, value);
      index += 2;
      continue;
    }
    return { error: `unknown argument: ${arg}` };
  }
  return parsed;
}
const HELP = `usage: node tools/desktop-recv/e2e/record-sender.mjs --context <run-context.json> [--only full|last] [options]

  --context <json>    REQUIRED. Validated run context owning every output
                      root; no fallback to the historical run-03 media root.
  --only full|last    full = whole rig; last = the V-LAST pair only.
  --payload-file <f>  --only last records the pair against this real input
                      file instead of generating a payload.
  --with-seconds, --cut-seconds, --without-seconds, --payload-bytes
                      declared stop points and payload size (see notes above).
  --validate-only     parse + validate the context and print its identity
                      JSON; no file write, no browser, no server.
  --repo-root <dir>   resolve repo-relative context paths against <dir>
                      (development/fixture use; default: this checkout).
  --resume            explicitly resume the named run identity.

  Exit: 0 recorded, 1 rig failure, 2 bad/missing arguments,
        3 invalid context/refused build, 5 run-root guard.`;

const cliArgs = new Map();
const cliFlags = new Set();
{
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.error) {
    console.error(parsed.error);
    console.error(HELP);
    process.exit(2);
  }
  for (const [name, value] of parsed.args) cliArgs.set(name, value);
  for (const flag of parsed.flags) cliFlags.add(flag);
}
if (cliFlags.has('help')) { console.log(HELP); process.exit(0); }

let CONTEXT = null;
if (!cliArgs.get('context')) {
  console.error('missing required --context <run-context.json>; the recorder never falls back to a historical root');
  console.error(HELP);
  process.exit(2);
}
try {
  CONTEXT = loadRunContext(cliArgs.get('context'), { repoRoot: cliArgs.get('repo-root') });
} catch (error) {
  console.error(error && error.message ? error.message : String(error));
  process.exit(3);
}
if (cliFlags.has('validate-only')) {
  console.log(JSON.stringify(describeContext(CONTEXT)));
  process.exit(0);
}

const ONLY = cliArgs.get('only') || 'full';
if (ONLY !== 'full' && ONLY !== 'last') {
  console.error(`--only must be full or last (got ${ONLY})`);
  process.exit(2);
}
const PAYLOAD_FILE = cliArgs.get('payload-file') || null;
if (PAYLOAD_FILE && !existsSync(resolve(PAYLOAD_FILE))) {
  console.error(`--payload-file not found: ${PAYLOAD_FILE}`);
  process.exit(2);
}
const PAYLOAD_BYTES = Number(cliArgs.get('payload-bytes') || '131072');
const WITH_SECONDS = Number(cliArgs.get('with-seconds') || '9.5');
// --without-seconds is the pre-round-5 name of the same declared stop point;
// it stays accepted so an old reproduction command still records a pair.
const CUT_SECONDS = Number(cliArgs.get('cut-seconds') || cliArgs.get('without-seconds') || '6.5');
const WITH_MS = Math.round(WITH_SECONDS * 1000);
const CUT_MS = Math.round(CUT_SECONDS * 1000);

// All output roots come from the validated context; there is no default.
function applyContextRoots(context) {
  RUN = context.abs.runRoot;
  STAGING = context.abs.stagingRoot;
  FIXTURES = context.abs.fixtureRoot;
  MEDIA = join(context.abs.fixtureRoot, 'fixtures-media');
}

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

// Round-5 A-02: the V-LAST pair is a SAME-STREAM construction. One
// getDisplayMedia stream feeds two MediaRecorders started in the same task
// (recorder.html __startPairRecording); the without clip stops at the
// declared cut and the with clip at its declared duration. The pair is never
// byte-truncated, and the shared head/tail is verified on the produced files
// by video-prefix-check.py, whose JSON is embedded below. True media
// durations and the completion media time T* are measured at import time by
// the receiver (E2E-16), never invented here.
const manifestClips = [];
// Filled by the pair path; written into the manifest by writeMediaManifest.
let pairInfo = null;
let prefixCheck = null;

function sha256OfFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// Run the cv2 checker over the produced pair. A failing check never aborts
// the rig: the manifest must carry the honest result so E2E-16's pair gate
// can reject it with the checker's own numbers.
function runPrefixCheck(withPath, withoutPath, cutMs) {
  const jsonPath = join(MEDIA, 'prefix-check.json');
  if (existsSync(jsonPath)) writeFileSync(jsonPath, '');
  const check = spawnSync('python', [
    join(HERE, 'video-prefix-check.py'),
    '--with', withPath,
    '--without', withoutPath,
    '--cut-ms', String(cutMs),
    '--json', jsonPath,
  ], { encoding: 'utf8' });
  if (check.stdout) process.stdout.write(`[prefix-check] ${check.stdout}`);
  if (check.stderr) process.stdout.write(`[prefix-check] ${check.stderr}`);
  if (existsSync(jsonPath) && statSync(jsonPath).size > 0) {
    const parsed = JSON.parse(readFileSync(jsonPath, 'utf8'));
    if (parsed.verdict !== 'PASS') {
      console.warn('[prefix-check] the pair did NOT pass the shared head/tail check; '
        + 'E2E-16 will reject it at the pair-integrity gate');
    }
    return parsed;
  }
  return {
    verdict: 'FAIL',
    error: `video-prefix-check.py produced no JSON (exit ${String(check.status)})`,
    stderr: String(check.stderr || '').slice(-400),
  };
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
    construction: PAIR_CONSTRUCTION,
    pair: pairInfo,
    prefixCheck,
    durations: 'requestedMs/declaredCutMs/startEpochMs/wallStopAt are rig-side declarations; the true media '
      + 'duration and the completion media time T* are measured at import time by the receiver (E2E-16 reads the '
      + 'video element ended event and __videoTimeline.lastUs)',
    payload: payloadInfo,
    clips,
  };
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  const path = join(MEDIA, 'manifest.json');
  writeFileSync(path, text);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stamped = join(MEDIA, `manifest-${stamp}.json`);
  writeFileSync(stamped, text);
  console.log(`manifest: ${path}`);
  console.log(`manifest (stamped copy): ${stamped}`);
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

// Record the same-stream pair: ONE getDisplayMedia stream, TWO MediaRecorders
// started in the same task (recorder.html __startPairRecording). Drains both
// chunk sets through window.__pairState exactly like the single-clip path.
async function recordPair(page, { withMs, withoutCutMs }, pid) {
  await wakeWindow(pid);
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
  const evaluatePromise = page.evaluate(
    (config) => window.__startPairRecording(config),
    { withMs, withoutCutMs }
  );
  const hardBoundMs = 120000 + withMs + 180000;
  const settled = await Promise.race([
    Promise.all([helperPromise, evaluatePromise]).catch((error) => ({ __error: error })),
    sleep(hardBoundMs).then(() => null),
  ]);
  if (!settled) {
    throw new Error(`pair recording exceeded its hard bound (${hardBoundMs} ms): the capture picker never resolved`);
  }
  if (settled.__error) throw settled.__error;
  const [helper, result] = settled;
  if (helper.code !== 0) throw new Error(`recording picker helper failed: ${helper.out}`);
  if (!result.ok) throw new Error(`pair recording failed: ${result.name}: ${result.message}`);

  const take = () => page.evaluate(() => {
    const state = window.__pairState;
    const side = (value) => ({
      chunk: value.chunks.shift() || null,
      done: value.done,
      bytes: value.bytes,
      error: value.error || null,
      stopAt: value.stopAt || null,
    });
    return { meta: state.meta, with: side(state.with), without: side(state.without) };
  });
  const withParts = [];
  const withoutParts = [];
  let last = null;
  for (;;) {
    last = await take();
    if (last.with.chunk) withParts.push(last.with.chunk);
    if (last.without.chunk) withoutParts.push(last.without.chunk);
    if (last.with.error || last.without.error) {
      throw new Error(`pair recording failed: with=${String(last.with.error)} without=${String(last.without.error)}`);
    }
    if (last.with.done && !last.with.chunk && last.without.done && !last.without.chunk) break;
    await sleep(50);
  }
  // Decode each chunk SEPARATELY (each is independently btoa()'d and padded).
  const withBuffer = Buffer.concat(withParts.map((part) => Buffer.from(part, 'base64')));
  const withoutBuffer = Buffer.concat(withoutParts.map((part) => Buffer.from(part, 'base64')));
  return {
    withBuffer,
    withoutBuffer,
    meta: last.meta,
    withStopAt: last.with.stopAt,
    withoutStopAt: last.without.stopAt,
  };
}

async function recordPairTimed(page, { withMs, withoutCutMs }, pid) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const result = await recordPair(page, { withMs, withoutCutMs }, pid);
  return {
    ...result,
    startedAt,
    stoppedAt: new Date().toISOString(),
    wallMs: Date.now() - startedMs,
    requestedWithMs: withMs,
    requestedCutMs: withoutCutMs,
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
  // Refuse an invalid build or a foreign run root before starting anything.
  try {
    verifyProductManifest(CONTEXT);
  } catch (error) {
    console.error(error && error.message ? error.message : String(error));
    process.exit(3);
  }
  try {
    initializeRunRoot(CONTEXT, { resume: cliFlags.has('resume') });
  } catch (error) {
    console.error(error && error.message ? error.message : String(error));
    process.exit(5);
  }
  applyContextRoots(CONTEXT);
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
    const payloadName = PAYLOAD_FILE
      ? basename(resolve(PAYLOAD_FILE))
      : `payload-${Math.round(PAYLOAD_BYTES / 1024)}k-random.bin`;
    const extFile = join(MEDIA, payloadName);
    // Round-5 lane: the payload bytes are REUSED when the file already exists
    // (T* was measured against exactly those bytes; regenerating would change
    // them silently). Only a missing file is generated fresh, and that is
    // recorded in the manifest like any regeneration.
    let payloadReused = false;
    if (PAYLOAD_FILE) {
      writeFileSync(extFile, readFileSync(resolve(PAYLOAD_FILE)));
      console.log(`payload COPIED from --payload-file: ${PAYLOAD_FILE} -> ${payloadName}`);
    } else if (existsSync(extFile) && statSync(extFile).size === PAYLOAD_BYTES) {
      payloadReused = true;
      console.log(`payload REUSED (not regenerated): ${payloadName}`);
    } else {
      writeFileSync(extFile, randomBytes(PAYLOAD_BYTES));
      console.log(`payload generated: ${payloadName}`);
    }
    payloadInfo = {
      file: payloadName,
      bytes: statSync(extFile).size,
      sha256: sha256OfFile(extFile),
    };
    // Round-5 A-02: ONE continuous sender playback, ONE getDisplayMedia
    // stream, TWO MediaRecorders started in the same task. The without clip
    // stops at the declared cut, the with clip at its declared duration -
    // the pair shares its encoded head/tail by construction, and the cv2
    // checker proves it on the produced files.
    await reloadSender(senderPage, extFile);
    const pair = await recordPairTimed(recorderPage,
      { withMs: WITH_MS, withoutCutMs: CUT_MS }, recorderBrowser.pid);
    writeFileSync(join(MEDIA, 'V-LAST-with.webm'), pair.withBuffer);
    writeFileSync(join(MEDIA, 'V-LAST-without.webm'), pair.withoutBuffer);
    const isoFromMs = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);
    pairInfo = {
      construction: 'same-stream-two-recorders',
      startEpochMs: pair.meta.startEpochMs,
      declaredCutMs: CUT_MS,
      withMs: WITH_MS,
      mimeType: pair.meta.mimeType,
      videoBitsPerSecond: pair.meta.videoBitsPerSecond,
      startedInSameTask: pair.meta.startedInSameTask === true,
      withFile: 'V-LAST-with.webm',
      withoutFile: 'V-LAST-without.webm',
      withStopAtMs: pair.withStopAt,
      withoutStopAtMs: pair.withoutStopAt,
      // Provenance: the payload bytes were REUSED from the on-disk file (not
      // regenerated), so the pair was recorded against the same bytes T* was
      // measured on. The sha256 makes that claim checkable in the manifest.
      payloadReused,
      payloadSha256: payloadInfo ? payloadInfo.sha256 : null,
    };
    manifestClips.push({
      file: 'V-LAST-with.webm', role: 'with', payload: payloadName,
      requestedMs: WITH_MS, declaredCutMs: CUT_MS, startEpochMs: pair.meta.startEpochMs,
      wallStopAt: isoFromMs(pair.withStopAt), wallStopAtMs: pair.withStopAt,
      wallMs: pair.wallMs, startedAt: pair.startedAt, stoppedAt: pair.stoppedAt,
    });
    manifestClips.push({
      file: 'V-LAST-without.webm', role: 'without', payload: payloadName,
      requestedMs: CUT_MS, declaredCutMs: CUT_MS, startEpochMs: pair.meta.startEpochMs,
      wallStopAt: isoFromMs(pair.withoutStopAt), wallStopAtMs: pair.withoutStopAt,
      wallMs: pair.wallMs, startedAt: pair.startedAt, stoppedAt: pair.stoppedAt,
    });
    console.log(`V-LAST-with recorded: ${pair.withBuffer.length} bytes (declared ${WITH_MS} ms)`);
    console.log(`V-LAST-without recorded: ${pair.withoutBuffer.length} bytes (declared cut ${CUT_MS} ms)`);
    prefixCheck = runPrefixCheck(join(MEDIA, 'V-LAST-with.webm'),
      join(MEDIA, 'V-LAST-without.webm'), CUT_MS);
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

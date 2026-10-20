// Media fixture rig: records REAL videos of the real sender animation for
// the recorded-input E2E journeys (V-GOOD / V-SHORT / V-LAST pairs).
// V-LAST-without is a shorter real recording (never byte-truncated).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const STAGING = join(REPO, 'build-desktop-recv', 'staging');
const FIXTURES = join(REPO, 'docs', 'tests', 'runs', '20261018-teamexec-01', 'fixtures');
const MEDIA = join(REPO, 'docs', 'tests', 'runs', '20261019-teamexec-02', 'fixtures-media');
const SENDER_PORT = 8811;
const RECORDER_PORT = 8790; // the e2e dir is already served there
const SENDER_TITLE = 'CIMBAR-SENDER-WINDOW';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DEBUG_PORT = 9452;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  return { child, profile, browser, page };
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

async function record(page, ms, pid) {
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
  const [helper, result] = await Promise.all([helperPromise, evaluatePromise]);
  if (helper.code !== 0) throw new Error(`recording picker helper failed: ${helper.out}`);
  if (!result.ok) throw new Error(`recording failed: ${result.name}: ${result.message}`);
  return result;
}

async function main() {
  mkdirSync(MEDIA, { recursive: true });
  const senderServer = startServer('python', ['-m', 'http.server', String(SENDER_PORT),
    '--bind', '127.0.0.1', '--directory', join(STAGING, 'sender')], 'sender-http');
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
  try {
    await launchSender(senderPage, join('compressible', 'sample-text-2.bin'));
    const good = await record(recorderPage, 18000, recorderBrowser.pid);
    writeFileSync(join(MEDIA, 'V-GOOD-C.webm'), Buffer.from(good.base64, 'base64'));
    console.log(`V-GOOD-C recorded: ${good.bytes} bytes`);
    // The EOF/final-frame pair uses a 4 MiB payload of CRYPTO RANDOM bytes:
    // the sender compresses repetitive content, so only incompressible data
    // makes a short clip genuinely insufficient (0.8 s carries ~1.3 MB) and
    // a 20 s clip genuinely sufficient.
    const extFile = join(MEDIA, 'payload-512k-random.bin');
    const ext = randomBytes(4 * 1024 * 1024);
    writeFileSync(extFile, ext);
    await launchSender(senderPage, extFile);
    const lastWith = await record(recorderPage, 15000, recorderBrowser.pid);
    writeFileSync(join(MEDIA, 'V-LAST-with.webm'), Buffer.from(lastWith.base64, 'base64'));
    console.log(`V-LAST-with recorded: ${lastWith.bytes} bytes`);
    const lastWithout = await record(recorderPage, 12000, recorderBrowser.pid);
    writeFileSync(join(MEDIA, 'V-LAST-without.webm'), Buffer.from(lastWithout.base64, 'base64'));
    console.log(`V-LAST-without recorded: ${lastWithout.bytes} bytes`);
    // a genuinely insufficient clip: 2 s carries well under half of the
    // 1 MiB payload, so the decoder must end Incomplete.
    const short = await record(recorderPage, 400, recorderBrowser.pid);
    writeFileSync(join(MEDIA, 'V-SHORT.webm'), Buffer.from(short.base64, 'base64'));
    console.log(`V-SHORT recorded: ${short.bytes} bytes`);
  } finally {
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
  // incompressible class
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
    const goodN = await record(recorder2.page, 18000, recorder2.pid);
    writeFileSync(join(MEDIA, 'V-GOOD-N.webm'), Buffer.from(goodN.base64, 'base64'));
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
    incompressibleServer.kill();
  }
}

main().catch((error) => { console.error('RIG FAILED:', error); process.exit(1); });

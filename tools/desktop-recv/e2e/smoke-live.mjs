// Smoke: one real live roundtrip (E2E-3 shape) to validate the harness.
// Sender: the original web sender (staging copy), real Edge window, real
// file input. Receiver: staging receiver served on loopback, real Edge
// window with auto-selected real window capture, real system save dialog
// driven by native-dialog.ps1. Hashes are computed outside the app.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const STAGING = join(REPO, 'build-desktop-recv', 'staging');
const RUN = join(REPO, 'docs', 'tests', 'runs', '20261019-teamexec-02');
const SENDER_PORT = 8811;
const RECEIVER_PORT = 8771;
const SENDER_TITLE = 'CIMBAR-SENDER-WINDOW';
const FIXTURE = join(REPO, 'docs', 'tests', 'runs', '20261018-teamexec-01', 'fixtures', 'compressible', 'sample-text-2.bin');
const SAVE_DIR = join(RUN, 'proof', 'smoke');
const SAVE_PATH = join(SAVE_DIR, 'smoke-received.bin');

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (label) => console.log(`${new Date().toISOString()} STEP ${label}`);

function startServer(command, args, name) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.on('error', (error) => console.error(`[${name}] spawn error`, error));
  child.on('exit', (code) => console.log(`[${name}] exited ${code}`));
  return child;
}

async function waitHttp(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (e) { /* not up yet */ }
    await sleep(200);
  }
  throw new Error(`endpoint did not come up: ${url}`);
}

async function run() {
  mkdirSync(SAVE_DIR, { recursive: true });
  if (!existsSync(FIXTURE)) throw new Error(`fixture missing: ${FIXTURE}`);
  const originalHash = sha256(FIXTURE);

  const senderServer = startServer('python', ['-m', 'http.server', String(SENDER_PORT),
    '--bind', '127.0.0.1', '--directory', join(STAGING, 'sender')], 'sender-http');
  const receiverServer = startServer('python', [join(STAGING, 'receiver', 'server.py'),
    '--port', String(RECEIVER_PORT), '--directory', join(STAGING, 'receiver')], 'receiver-http');

  let senderBrowser; let receiverBrowser;
  try {
    step('wait sender endpoint');
    await waitHttp(`http://127.0.0.1:${SENDER_PORT}/`);
    step('wait receiver endpoint');
    await waitHttp(`http://127.0.0.1:${RECEIVER_PORT}/`);
    step('launch sender edge');
    senderBrowser = await chromium.launch({
      channel: 'msedge',
      headless: false,
      args: [
        '--window-position=0,0',
        '--window-size=1180,900',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    });
    const senderPage = await senderBrowser.newPage();
    step('sender goto');
    await senderPage.goto(`http://127.0.0.1:${SENDER_PORT}/`);
    step('sender setInputFiles');
    await senderPage.setInputFiles('#file_input', FIXTURE);
    await sleep(2000); // let the animation start
    // The sender rewrites document.title when playback starts ("Cimbar: name"),
    // so the capture title is applied after loading and kept pinned.
    await senderPage.evaluate((title) => {
      document.title = title;
      setInterval(() => { if (document.title !== title) document.title = title; }, 250);
    }, SENDER_TITLE);
    await sleep(500);
    await senderPage.screenshot({ path: join(SAVE_DIR, 'sender-animating.png') });
    step('sender animating');

    step('launch receiver edge');
    receiverBrowser = await chromium.launch({
      channel: 'msedge',
      headless: false,
      args: [
        // This host's GPU capture backend rejects cross-window sources with
        // NotReadableError; the software capture path is the real OS path
        // and works. Real picker + UIA selection stays in place.
        '--disable-gpu',
        '--window-position=1180,0',
        '--window-size=1380,900',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    });
    step('receiver newPage');
    const page = await receiverBrowser.newPage();
    await page.addInitScript(() => {
      const original = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getDisplayMedia = async (constraints) => {
        try {
          return await original(constraints);
        } catch (error) {
          window.__gdmError = { name: error.name, message: error.message };
          throw error;
        }
      };
    });
    step('receiver goto');
    await page.goto(`http://127.0.0.1:${RECEIVER_PORT}/`);
    await page.screenshot({ path: join(SAVE_DIR, 'receiver-idle.png') });
    step('receiver idle');

    // Window capture needs the sender window to be actually composed. Bring
    // both automation windows to the front (they are side-by-side), with the
    // receiver last so its picker is interactable. Otherwise a maximized
    // user window keeps the sender occluded and WGC refuses with
    // NotReadableError.
    await senderPage.bringToFront();
    await sleep(400);
    await page.bringToFront();
    await sleep(400);

    await page.click('#btn-live');
    step('receiver clicked share');
    const diagnostics = [];
    const poller = setInterval(async () => {
      try {
        const info = await page.evaluate(() => {
          const video = document.getElementById('preview');
          return {
            status: document.getElementById('status').textContent,
            log: document.getElementById('log').textContent.split('\n').slice(-4),
            hasStream: !!video.srcObject,
            videoW: video.videoWidth,
            videoH: video.videoHeight,
            saveDisabled: document.getElementById('btn-save').disabled,
            gdmError: window.__gdmError || null,
          };
        });
        diagnostics.push({ at: Date.now(), ...info });
        console.log('[state]', JSON.stringify(info));
      } catch (e) {
        console.log('[state] page closed');
      }
    }, 3000);
    // If the auto-select flag works, capture starts without a picker.
    const shareHelper = spawn('pwsh', ['-NoProfile', '-File', join(HERE, 'native-dialog.ps1'),
      '-Action', 'share', '-SourceTitle', SENDER_TITLE, '-TimeoutSec', '20'], { stdio: ['ignore', 'pipe', 'pipe'] });
    shareHelper.stdout.on('data', (c) => process.stdout.write(`[share] ${c}`));
    shareHelper.stderr.on('data', (c) => process.stdout.write(`[share] ${c}`));
    shareHelper.on('exit', (code) => console.log(`[share] exited ${code}`));

    try {
      await page.waitForFunction(() => !document.getElementById('btn-save').disabled, null,
        { timeout: 90000, polling: 500 });
    } catch (error) {
      clearInterval(poller);
      await page.screenshot({ path: join(SAVE_DIR, 'failure.png') });
      writeFileSync(join(SAVE_DIR, 'failure-diagnostics.json'),
        JSON.stringify(diagnostics, null, 2));
      throw error;
    }
    clearInterval(poller);
    step('receiver ready');
    await page.screenshot({ path: join(SAVE_DIR, 'receiver-ready.png') });
    const artifactName = await page.textContent('#artifact-name');
    const artifactSize = await page.textContent('#artifact-size');
    console.log(`READY name=${artifactName} size=${artifactSize}`);

    if (existsSync(SAVE_PATH)) throw new Error(`save target already exists: ${SAVE_PATH}`);
    const saveHelper = spawn('pwsh', ['-NoProfile', '-File', join(HERE, 'native-dialog.ps1'),
      '-Action', 'save', '-Path', SAVE_PATH, '-TimeoutSec', '30'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let saveOut = '';
    saveHelper.stdout.on('data', (c) => { saveOut += c; });
    saveHelper.stderr.on('data', (c) => { saveOut += c; });

    await page.click('#btn-save');
    const savePoller = setInterval(async () => {
      try {
        const info = await page.evaluate(() => ({
          status: document.getElementById('status').textContent,
          log: document.getElementById('log').textContent.split('\n').slice(-4),
          saveDisabled: document.getElementById('btn-save').disabled,
        }));
        console.log('[save-state]', JSON.stringify(info));
      } catch (e) { /* page closed */ }
    }, 2000);
    const saveCode = await new Promise((r) => saveHelper.on('exit', r));
    clearInterval(savePoller);
    console.log(`SAVE_HELPER exit=${saveCode} ${saveOut.trim()}`);
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && !existsSync(SAVE_PATH)) await sleep(250);
    if (!existsSync(SAVE_PATH)) throw new Error('saved file did not appear');
    await page.screenshot({ path: join(SAVE_DIR, 'receiver-saved.png') });

    const receivedHash = sha256(SAVE_PATH);
    const result = {
      case: 'smoke-live',
      executedAt: new Date().toISOString(),
      fixture: FIXTURE,
      fixtureBytes: statSync(FIXTURE).size,
      receivedBytes: statSync(SAVE_PATH).size,
      originalSha256: originalHash,
      receivedSha256: receivedHash,
      equal: originalHash === receivedHash,
      artifactName,
      artifactSize,
    };
    writeFileSync(join(SAVE_DIR, 'smoke-result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (!result.equal) throw new Error('hash mismatch');
  } finally {
    await Promise.allSettled([senderBrowser && senderBrowser.close(), receiverBrowser && receiverBrowser.close()]);
    senderServer.kill(); receiverServer.kill();
  }
}

run().catch((error) => { console.error('SMOKE FAILED:', error); process.exit(1); });

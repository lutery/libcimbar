// Probe: determine which getDisplayMedia source class can actually start
// on this machine (window capture returned NotReadableError). Opens a blank
// page with its own button, drives the real picker through native-dialog.ps1
// with the requested tab, and reports the stream/error.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const STAGING = join(REPO, 'build-desktop-recv', 'staging');
const PORT = 8773;
const TAB = process.argv[2] || 'screen';
const SOURCE = process.argv[3] || '';
const CHANNEL = process.argv[4] || 'msedge';
const PROCESS = process.argv[5] || CHANNEL;
const EXTRA = (process.argv[6] || '').split(',').filter(Boolean);

const server = spawn('python', [join(STAGING, 'receiver', 'server.py'),
  '--port', String(PORT), '--directory', join(STAGING, 'receiver')], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await sleep(800);
  const browser = await chromium.launch({
    channel: CHANNEL, headless: false,
    args: ['--window-position=1180,0', '--window-size=1380,900',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
      ...EXTRA],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.evaluate(() => {
    document.body.innerHTML = '<button id="go" style="width:200px;height:80px">capture</button>';
    window.__result = null;
    document.getElementById('go').onclick = async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        window.__result = { ok: true, tracks: stream.getTracks().length };
      } catch (error) {
        window.__result = { ok: false, name: error.name, message: error.message };
      }
    };
  });
  await page.click('#go');
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await page.evaluate(() => { window.__result = null; });
    await page.click('#go');
    const helperArgs = ['-NoProfile', '-File', join(HERE, 'native-dialog.ps1'),
      '-Action', 'share', '-Tab', TAB, '-TimeoutSec', '20', '-ProcessName', PROCESS];
    if (SOURCE) helperArgs.push('-SourceTitle', SOURCE);
    const helper = spawn('pwsh', helperArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    helper.stdout.on('data', (c) => process.stdout.write(`[helper] ${c}`));
    helper.stderr.on('data', (c) => process.stdout.write(`[helper] ${c}`));
    const helperCode = await new Promise((r) => helper.on('exit', r));
    console.log(`ATTEMPT=${attempt} HELPER_EXIT=${helperCode}`);

    let result = null;
    for (let i = 0; i < 30 && !result; i += 1) {
      await sleep(300);
      result = await page.evaluate(() => window.__result);
    }
    console.log(`ATTEMPT=${attempt} TAB=${TAB} RESULT=${JSON.stringify(result)}`);
  }
  await browser.close();
} finally {
  server.kill();
}

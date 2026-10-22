// Probe: is cross-window capture blocked by Playwright's launch args or by
// the machine? Launches Edge manually with a debug port and connects over
// CDP, then runs the receiver's own capture flow.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const STAGING = join(REPO, 'build-desktop-recv', 'staging');
const PORT = 8774;
const DEBUG_PORT = 9333;
const SOURCE = process.argv[2] || 'Untitled - Notepad';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('python', [join(STAGING, 'receiver', 'server.py'),
  '--port', String(PORT), '--directory', join(STAGING, 'receiver')], { stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'edge-cdp-'));

let browser;
try {
  await sleep(800);
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    `http://127.0.0.1:${PORT}/`,
  ], { stdio: 'ignore', detached: false });

  let version = null;
  for (let i = 0; i < 50 && !version; i += 1) {
    await sleep(300);
    try {
      version = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
    } catch (e) { /* not up yet */ }
  }
  if (!version) throw new Error('edge debug endpoint did not start');

  browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
  const context = browser.contexts()[0];
  let page = context.pages()[0];
  if (!page) page = await context.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.click('#btn-live');

  const helper = spawn('pwsh', ['-NoProfile', '-File', join(HERE, 'native-dialog.ps1'),
    '-Action', 'share', '-SourceTitle', SOURCE, '-TimeoutSec', '20'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
  helper.stdout.on('data', (c) => process.stdout.write(`[helper] ${c}`));
  helper.stderr.on('data', (c) => process.stdout.write(`[helper] ${c}`));
  const code = await new Promise((r) => helper.on('exit', r));
  console.log(`HELPER_EXIT=${code}`);

  let state = null;
  for (let i = 0; i < 40 && !state; i += 1) {
    await sleep(300);
    state = await page.evaluate(() => {
      const video = document.getElementById('preview');
      const log = document.getElementById('log').textContent;
      const preparing = document.getElementById('status').textContent;
      if (log.includes('12002')) return { ok: false, log, status: preparing };
      if (video.videoWidth > 0) return { ok: true, videoW: video.videoWidth, log };
      return null;
    });
  }
  console.log(`MANUAL_EDGE RESULT=${JSON.stringify(state)}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}

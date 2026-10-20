// Probe: keep the real getDisplayMedia picker on screen for inspection.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const STAGING = join(REPO, 'build-desktop-recv', 'staging');
const RECEIVER_PORT = 8772;

const server = spawn('python', [join(STAGING, 'receiver', 'server.py'),
  '--port', String(RECEIVER_PORT), '--directory', join(STAGING, 'receiver')],
{ stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await sleep(800);
  const browser = await chromium.launch({
    channel: 'msedge', headless: false,
    args: ['--window-position=1180,0', '--window-size=1380,900',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${RECEIVER_PORT}/`);
  await page.click('#btn-live');
  console.log('picker should be open for 120s');
  await sleep(120000);
  await browser.close();
} finally {
  server.kill();
}

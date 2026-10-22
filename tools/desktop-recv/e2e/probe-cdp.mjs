// Probe: window capture through a NORMALLY launched Edge (CDP attach),
// instead of a Playwright-launched browser.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEBUG_PORT = process.env.CDP_PORT || '9444';
const SOURCE = process.argv[2] || 'Orca';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
const context = browser.contexts()[0];
const page = context.pages()[0] || await context.newPage();
await page.goto('http://127.0.0.1:8790/manual-capture-check.html');
await page.click('#go');

const helper = spawn('pwsh', ['-NoProfile', '-File', join(HERE, 'native-dialog.ps1'),
  '-Action', 'share', '-Tab', 'window', '-SourceTitle', SOURCE, '-TimeoutSec', '20'],
{ stdio: ['ignore', 'pipe', 'pipe'] });
helper.stdout.on('data', (c) => process.stdout.write(`[helper] ${c}`));
helper.stderr.on('data', (c) => process.stdout.write(`[helper] ${c}`));
const code = await new Promise((r) => helper.on('exit', r));
console.log(`HELPER_EXIT=${code}`);

let out = 'not run';
for (let i = 0; i < 40 && out === 'not run'; i += 1) {
  await sleep(300);
  out = await page.textContent('#out');
}
console.log(`CDP_CAPTURE RESULT=${out}`);
await browser.close().catch(() => {}); // detaches only; Edge stays open

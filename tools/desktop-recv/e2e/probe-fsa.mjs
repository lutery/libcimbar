// Probe: capture the EXACT FSA write error in a fresh Edge with feature
// overrides, driving the manual page's save test through the helper.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_SAFE = resolve(HERE, '..', '..', '..');

const DEBUG_PORT = 9450;
const profile = mkdtempSync(join(tmpdir(), 'cimbar-fsa-probe-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FEATURES = process.argv[2] || 'FileSystemAccessPersistentPermissions';

const edge = spawn(EDGE, [
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
  `--disable-features=Translate,TranslateUI,${FEATURES}`,
  'http://127.0.0.1:8790/manual-capture-check.html',
], { stdio: 'ignore' });

let browser = null;
try {
  for (let i = 0; i < 60 && !browser; i += 1) {
    await sleep(300);
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`); } catch (e) { /* wait */ }
  }
  if (!browser) throw new Error('CDP did not start');
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();
  await page.goto('http://127.0.0.1:8790/manual-capture-check.html');

  // Save OUTSIDE the profile dir (Chromium refuses FSA writes inside it).
  const target = join(REPO_SAFE, 'fsa-probe.bin');
  const helper = spawn('pwsh', ['-NoProfile', '-File', join(import.meta.dirname, 'native-dialog.ps1'),
    '-Action', 'save', '-Path', target, '-TimeoutSec', '30'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  helper.stdout.on('data', (c) => { out += c; process.stdout.write(`[helper] ${c}`); });
  helper.stderr.on('data', (c) => { out += c; process.stdout.write(`[helper] ${c}`); });
  await page.click('#save');
  const code = await new Promise((r) => helper.on('exit', r));
  await sleep(2000);
  const pageOut = await page.textContent('#out').catch(() => 'page gone');
  console.log(`FEATURES=${FEATURES} HELPER_EXIT=${code}`);
  console.log(`PAGE_OUT: ${pageOut}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  const killer = spawn('powershell', ['-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${profile}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
  { stdio: 'ignore' });
  await new Promise((r) => killer.on('exit', r));
}

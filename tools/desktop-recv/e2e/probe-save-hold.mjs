// Hold the real save dialog open for inspection/screenshot.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEBUG_PORT = 9447;
const profile = mkdtempSync(join(tmpdir(), 'cimbar-save-hold-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const edge = spawn(EDGE, [
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
  '--disable-features=Translate,TranslateUI', '--disable-translate',
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
  await page.click('#save');
  console.log('SAVE DIALOG OPEN - holding 120s');
  await sleep(120000);
} finally {
  if (browser) await browser.close().catch(() => {});
  const killer = spawn('powershell', ['-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${profile}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
  { stdio: 'ignore' });
  await new Promise((r) => killer.on('exit', r));
}

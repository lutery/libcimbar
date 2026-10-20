// Probe: dump the real showSaveFilePicker dialog structure (Chromium nested
// views dialog). Launches a normal Edge with CDP, clicks the save test
// button, and prints the UIA subtree of the dialog window.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEBUG_PORT = 9446;
const profile = mkdtempSync(join(tmpdir(), 'cimbar-save-probe-'));
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
  await sleep(2500);

  const script = `
Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes
$AE=[System.Windows.Automation.AutomationElement]
$CT=[System.Windows.Automation.ControlType]
$wc=New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty,$CT::Window)
$tops=$AE::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,$wc)
foreach($top in $tops){
  if ("$($top.Current.ClassName)" -notlike 'Chrome*') { continue }
  "TOP pid=$($top.Current.ProcessId) class=$($top.Current.ClassName) name=$($top.Current.Name)"
  $nested=$top.FindAll([System.Windows.Automation.TreeScope]::Descendants,$wc)
  foreach($n in $nested){
    "  NEST pid=$($n.Current.ProcessId) class=$($n.Current.ClassName) name=$($n.Current.Name)"
    $all=$n.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
    foreach($e in $all){
      if ("$($e.Current.ControlType.ProgrammaticName)" -eq 'ControlType.Edit') {
        "    EDIT id=$($e.Current.AutomationId) class=$($e.Current.ClassName) name=$($e.Current.Name)"
      }
    }
    foreach($e in $all){
      if ("$($e.Current.ControlType.ProgrammaticName)" -eq 'ControlType.Button') {
        "    BUTTON id=$($e.Current.AutomationId) class=$($e.Current.ClassName) name=$($e.Current.Name)"
      }
    }
  }
}
`;
  const ps = spawn('powershell', ['-NoProfile', '-Command', script], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  ps.stdout.on('data', (c) => { out += c; });
  ps.stderr.on('data', (c) => { out += c; });
  await new Promise((r) => ps.on('exit', r));
  console.log(out.slice(0, 12000));

  // Now drive the real dialog through the helper's keyboard path.
  const target = join(profile, 'probe-saved.txt');
  const helper = spawn('pwsh', ['-NoProfile', '-File', join(import.meta.dirname, 'native-dialog.ps1'),
    '-Action', 'save', '-Path', target, '-TimeoutSec', '25'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
  let helperOut = '';
  helper.stdout.on('data', (c) => { helperOut += c; });
  helper.stderr.on('data', (c) => { helperOut += c; });
  const helperCode = await new Promise((r) => helper.on('exit', r));
  console.log(`SAVE_HELPER exit=${helperCode}\n${helperOut}`);
  const shotScript = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing
$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height
$g=[System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size)
$bmp.Save('C:\\Users\\admin\\AppData\\Local\\Temp\\probe-save-desktop.png',[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()`;
  await new Promise((r) => {
    const ps = spawn('powershell', ['-NoProfile', '-Command', shotScript], { stdio: 'ignore' });
    ps.on('exit', r);
  });
  console.log('DESKTOP_SHOT saved');
  await sleep(1500);
  const pageState = await page.textContent('#out').catch(() => 'page gone');
  console.log('PAGE_OUT:', pageState);
  console.log('FILE_EXISTS:', existsSync(target));
} finally {
  if (browser) await browser.close().catch(() => {});
  const killer = spawn('powershell', ['-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${profile}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
  { stdio: 'ignore' });
  await new Promise((r) => killer.on('exit', r));
}

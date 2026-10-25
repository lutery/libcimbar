// Stage-5 live A/B legs (T31c): 5 pairs in the frozen AB/BA order, each side
// one REAL 30-second live activity window (real sender window, real
// getDisplayMedia through the OS picker on a normally launched Edge). Side A
// runs the baseline receiver build, side B the candidate build. Per side we
// check the ORIGINAL business invariants (single-flight, real settlement) and
// - candidate only - the UX feedback layer (numeric/status updates, telemetry
// write interval >=250ms, display clock released after the real stop). RTT
// values are recorded as advisory only, never judged.
//
// Usage:
//   node live-legs.mjs --context <candidate ctx> --baseline-context <ctx> \
//        --method <performance-method.json> [--repo-root <dir>] [--validate-only]
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SENDER_PORT = 8811;
const RECEIVER_PORT = 8771;
const DEBUG_PORT = 9445;
const SENDER_TITLE = 'CIMBAR-SENDER-WINDOW';
const ACTIVE_WINDOW_SECONDS = 30;
const NATIVE_HELPER = join(HERE, 'native-dialog.ps1');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

function parseArgs(argv) {
  const out = { values: new Map(), help: false };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--help') { out.help = true; i += 1; continue; }
    if (['--context', '--baseline-context', '--method', '--repo-root'].includes(arg)) {
      out.values.set(arg.slice(2), argv[i + 1]);
      i += 2; continue;
    }
    if (arg === '--validate-only') { out.values.set('validate-only', '1'); i += 1; continue; }
    return { error: `unknown argument: ${arg}` };
  }
  return out;
}

const HELP = `usage: node tools/desktop-recv/e2e/live-legs.mjs --context <candidate ctx> --baseline-context <ctx> --method <json> [--validate-only] [--repo-root <dir>]

  Collects the frozen liveObservation legs: 5 pairs AB/BA/AB/BA/AB, each side
  a REAL 30s live window (normal Edge receiver + real sender + OS picker).
  Output: <runRoot>/measurements/ux-overhead/<attemptId>/live/{rounds,summary.json}
  Exit: 0 all sides valid, 1 any side invalid/failed (raw rounds still kept),
  2 bad arguments, 3 pre-run validation failure.`;

// --- small helpers (kept local so this tool stays standalone) -------------
function startServer(command, argv, name) {
  const child = spawn(command, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (c) => process.stdout.write(`[${name}] ${c}`));
  child.stderr.on('data', (c) => process.stdout.write(`[${name}] ${c}`));
  return child;
}

async function waitHttp(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { const response = await fetch(url); if (response.ok) return; } catch (e) { /* up soon */ }
    await sleep(200);
  }
  throw new Error(`endpoint did not come up: ${url}`);
}

function runHelper(helperArgs, pid = 0) {
  return new Promise((resolvePromise) => {
    const extra = pid > 0 ? ['-ProcessId', String(pid)] : [];
    const helper = spawn('pwsh', ['-NoProfile', '-File', NATIVE_HELPER, ...helperArgs, ...extra],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    helper.stdout.on('data', (c) => { out += c; process.stdout.write(`[helper] ${c}`); });
    helper.stderr.on('data', (c) => { out += c; process.stdout.write(`[helper] ${c}`); });
    helper.on('exit', (code) => resolvePromise({ code, out }));
  });
}

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

async function killByProfile(profile) {
  await new Promise((resolveKill) => {
    const killer = spawn('powershell', ['-NoProfile', '-Command',
      `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${profile}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
    { stdio: 'ignore' });
    killer.on('exit', resolveKill);
  });
}

async function assertPortsFree(ports) {
  const busy = await new Promise((resolveBusy) => {
    const ps = spawn('powershell', ['-NoProfile', '-Command',
      `$busy = @(); foreach ($p in @(${ports.join(',')})) { $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $busy += $p } }; ConvertTo-Json -Compress @($busy)`],
    { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    ps.stdout.on('data', (c) => { out += c; });
    ps.on('exit', () => resolveBusy(out.trim()));
  });
  if (busy && busy !== '[]' && busy !== '') {
    throw new Error(`port(s) already in use: ${busy} - refusing to kill the owner`);
  }
}

// The same observer measure-ux uses (identical bytes keep the instrumentation
// identity comparable across tools).
const OBSERVER = await import(pathToFileURL(join(HERE, 'measure-ux.mjs')).href).then((m) => m.OBSERVER_SCRIPT);

// --- one side -------------------------------------------------------------
async function runSide({ side, pairIndex, build, liveInput }) {
  const startedAtIso = new Date().toISOString();
  const senderServer = startServer('python', ['-m', 'http.server', String(SENDER_PORT),
    '--bind', '127.0.0.1', '--directory', join(build.stagingRoot, 'sender')], `sender-${side}`);
  const receiverServer = startServer('python', [join(build.receiverDir, 'server.py'),
    '--port', String(RECEIVER_PORT), '--directory', build.receiverDir], `receiver-${side}`);
  let senderBrowser = null;
  let receiver = null;
  const result = {
    side, pairIndex, startedAtIso, samples: [], frames: null, telemetryWrites: null,
    telemetryArmed: null, observations: {},
  };
  try {
    await waitHttp(`http://127.0.0.1:${SENDER_PORT}/`);
    await waitHttp(`http://127.0.0.1:${RECEIVER_PORT}/`);

    // Sender: a real Edge window playing the shared 1MiB input.
    const { chromium } = await import(pathToFileURL(join(HERE, 'node_modules', 'playwright-core', 'index.js')).href)
      .then((m) => (m.chromium ? m : m.default));
    senderBrowser = await chromium.launch({
      channel: 'msedge', headless: false,
      args: ['--window-position=0,0', '--window-size=1180,900',
        '--disable-features=Translate,TranslateUI', '--lang=en-US',
        '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
    });
    const senderPage = await senderBrowser.newPage();
    await senderPage.goto(`http://127.0.0.1:${SENDER_PORT}/`);
    await senderPage.setInputFiles('#file_input', liveInput);
    await sleep(1200);
    await senderPage.evaluate((title) => {
      document.documentElement.setAttribute('translate', 'no');
      document.documentElement.lang = 'en';
      document.title = title;
      setInterval(() => { if (document.title !== title) document.title = title; }, 250);
    }, SENDER_TITLE);
    await sleep(400);

    // Receiver: a NORMALLY launched Edge (CDP attached) - required for real
    // cross-window capture on this host - with the observer injected.
    const profile = mkdtempSync(join(tmpdir(), `cimbar-live-${side}-`));
    spawn(EDGE, [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
      '--disable-features=Translate,TranslateUI,msSleepingTabs,CalculateNativeWinOcclusion',
      '--disable-translate', '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
      '--window-position=1180,0', '--window-size=1380,900',
      `http://127.0.0.1:${RECEIVER_PORT}/`,
    ], { stdio: 'ignore' });
    let browser = null;
    for (let i = 0; i < 60 && !browser; i += 1) {
      await sleep(300);
      try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`); } catch (e) { /* not up yet */ }
    }
    if (!browser) throw new Error('receiver Edge did not expose CDP');
    const context = browser.contexts()[0];
    await context.addInitScript(OBSERVER);
    // addInitScript applies to FUTURE navigations: the page launched by Edge
    // was already loaded, so re-navigate once to install the observer.
    let page = context.pages().find((p) => p.url().includes(`127.0.0.1:${RECEIVER_PORT}`));
    if (!page) page = await context.newPage();
    await page.goto(`http://127.0.0.1:${RECEIVER_PORT}/`);
    await page.waitForFunction(() => typeof window.__state === 'string', null, { timeout: 60000 });
    const pid = await findEdgePid(profile);
    receiver = { browser, page, profile, pid };

    // Real share picker: the receiver captures the real sender window.
    const helperPromise = runHelper(['-Action', 'share', '-Tab', 'window',
      '-SourceTitle', SENDER_TITLE, '-TimeoutSec', '40'], pid);
    await page.bringToFront();
    await sleep(300);
    await page.waitForFunction(() => !document.getElementById('btn-live').disabled, null, { timeout: 30000 });
    await page.click('#btn-live');
    const helper = await helperPromise;
    result.observations.shareHelperExit = helper.code;
    await page.waitForFunction(() => window.__state === 'Receiving', null, { timeout: 60000 });

    // The 30s activity window: sample the real page every ~2s.
    const windowStart = Date.now();
    while (Date.now() - windowStart < ACTIVE_WINDOW_SECONDS * 1000) {
      const probe = await page.evaluate(() => ({
        at: Date.now(),
        state: window.__state || null,
        primary: (document.getElementById('ux-primary') || {}).textContent || '',
        elapsed: (document.getElementById('ux-elapsed') || {}).textContent || '',
        rate: (document.getElementById('ux-rate') || {}).textContent || '',
        revision: (window.__contractSnapshot || {}).revision ?? null,
        submitted: ((window.__contractSnapshot || {}).stats || {}).submittedFrames ?? null,
        previewVideoWidth: (document.getElementById('preview') || {}).videoWidth || 0,
      }));
      result.samples.push(probe);
      await sleep(2000);
    }

    // Real stop + release evidence.
    const stopDisabled = await page.evaluate(() => document.getElementById('btn-stop').disabled);
    if (!stopDisabled) await page.click('#btn-stop');
    await page.waitForFunction(() => ['Stopped', 'Idle'].includes(window.__state)
      && !document.getElementById('preview').srcObject, null, { timeout: 30000 });
    const frozenA = await page.evaluate(() => ({
      state: window.__state,
      elapsed: (document.getElementById('ux-elapsed') || {}).textContent || '',
      primary: (document.getElementById('ux-primary') || {}).textContent || '',
    }));
    await sleep(1600);
    const frozenB = await page.evaluate(() => ({
      state: window.__state,
      elapsed: (document.getElementById('ux-elapsed') || {}).textContent || '',
      primary: (document.getElementById('ux-primary') || {}).textContent || '',
    }));
    result.observations.afterStop = { frozenA, frozenB };

    const observer = await page.evaluate(() => {
      const o = window.__uxObserver;
      return o ? { frames: o.frames, telemetryWrites: o.telemetryWrites,
        telemetryArmed: o.telemetryArmed === true } : null;
    });
    result.frames = observer ? observer.frames : [];
    result.telemetryWrites = observer ? observer.telemetryWrites : [];
    result.telemetryArmed = observer ? observer.telemetryArmed : null;
    result.stoppedAtIso = new Date().toISOString();
    return result;
  } finally {
    if (receiver) {
      await receiver.browser.close().catch(() => {});
      await killByProfile(receiver.profile);
    }
    if (senderBrowser) await senderBrowser.close().catch(() => {});
    senderServer.kill();
    receiverServer.kill();
    await sleep(600);
  }
}

function judgeSide(record, side) {
  const violations = [];
  const frames = record.frames || [];
  const writes = record.telemetryWrites || [];
  // single-flight from the frame intervals on the same performance clock:
  // an exact sweep over half-open [t0, settled) intervals (end before start
  // at equal timestamps so touching frames never count as overlap).
  const events = [];
  for (const frame of frames) {
    if (!Number.isFinite(frame.t0Ms) || !Number.isFinite(frame.settledAtMs)) continue;
    if (frame.settledAtMs < frame.t0Ms) continue;
    events.push([frame.t0Ms, 1], [frame.settledAtMs, -1]);
  }
  events.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  let current = 0;
  let maxInFlight = 0;
  for (const [, delta] of events) {
    current += delta;
    if (current > maxInFlight) maxInFlight = current;
  }
  record.maxInFlight = maxInFlight;
  const okFrames = frames.filter((f) => f.ok).length;
  record.okFrameCount = okFrames;
  if (record.maxInFlight > 1) violations.push(`maxInFlight=${record.maxInFlight} (single-flight broken)`);
  if (okFrames === 0) violations.push('no settled frames during the 30s window (no real settlement)');
  // Data must actually flow during the window.
  const revisions = record.samples.map((s) => s.revision).filter((v) => v !== null);
  const revisionGrew = revisions.length >= 2 && revisions[revisions.length - 1] > revisions[0];
  record.revisionGrew = revisionGrew;
  if (!revisionGrew) violations.push('business revision did not grow during the 30s window (no real data)');
  const submittedLast = Math.max(...record.samples.map((s) => s.submitted ?? 0));
  record.submittedLast = submittedLast;
  if (side === 'B') {
    // Candidate-only UX layer checks.
    if (record.telemetryArmed !== true) violations.push('telemetry area not armed');
    let minGap = null;
    for (let i = 1; i < writes.length; i += 1) {
      const gap = writes[i] - writes[i - 1];
      if (minGap === null || gap < minGap) minGap = gap;
    }
    record.minTelemetryGapMs = minGap;
    if (writes.length >= 2 && minGap !== null && minGap < 250 - 1e-9) {
      violations.push(`telemetry write interval ${minGap.toFixed(1)}ms < 250ms`);
    }
    const numericChanges = record.samples.filter((s, i, all) => i > 0 && s.elapsed !== all[i - 1].elapsed).length;
    record.numericChanges = numericChanges;
    if (numericChanges === 0) violations.push('numeric feedback never updated during the window');
    const statusChanges = record.samples.filter((s, i, all) => i > 0 && s.primary !== all[i - 1].primary).length;
    record.statusChanges = statusChanges;
    const stop = record.observations.afterStop;
    const frozen = stop && stop.frozenA.elapsed === stop.frozenB.elapsed && stop.frozenA.elapsed !== '';
    record.clockReleasedAfterStop = Boolean(frozen);
    if (!frozen) violations.push('display clock did not freeze after the real stop');
  }
  record.rttAdvisory = {
    p50: percentile(frames.filter((f) => f.ok).map((f) => f.rttMs).sort((a, b) => a - b), 50),
    p95: percentile(frames.filter((f) => f.ok).map((f) => f.rttMs).sort((a, b) => a - b), 95),
    note: 'advisory only; live sampling is never the primary metric',
  };
  record.violations = violations;
  record.valid = violations.length === 0;
  return record;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

// --- main ------------------------------------------------------------------
async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) { console.error(parsed.error); console.error(HELP); process.exit(2); }
  if (parsed.help) { console.log(HELP); process.exit(0); }
  const contextPath = parsed.values.get('context');
  const baselinePath = parsed.values.get('baseline-context');
  const methodPath = parsed.values.get('method');
  if (!contextPath || !baselinePath || !methodPath) {
    console.error('--context, --baseline-context and --method are required');
    console.error(HELP);
    process.exit(2);
  }
  const { loadRunContext } = await import(pathToFileURL(join(HERE, 'run-context.mjs')).href);
  let candidate;
  let baseline;
  try {
    candidate = loadRunContext(contextPath, { repoRoot: parsed.values.get('repo-root') });
    baseline = loadRunContext(baselinePath, { repoRoot: parsed.values.get('repo-root') });
  } catch (error) {
    console.error(`CONTEXT REFUSED: ${error.message}`);
    process.exit(3);
  }
  if (candidate.phase !== 'final') {
    console.error(`E_CONTEXT_PHASE: live legs need the final candidate context (got ${candidate.phase})`);
    process.exit(3);
  }
  const method = JSON.parse(readFileSync(resolve(REPO, methodPath), 'utf8'));
  const live = method.liveObservation || {};
  if (live.pairs !== 5 || JSON.stringify(live.order) !== JSON.stringify(['AB', 'BA', 'AB', 'BA', 'AB'])) {
    console.error('E_METHOD_FROZEN: liveObservation pairs/order must stay 5 and the frozen AB/BA order');
    process.exit(3);
  }
  // Shared 1MiB live input with identical SHA on both sides.
  const candidateLive = JSON.parse(readFileSync(candidate.abs.inputManifest, 'utf8')).liveInput;
  const baselineLivePath = join(baseline.abs.runRoot, 'fixtures-ext', 'incompressible', 'ext-random-1mib.bin');
  if (!candidateLive || !existsSync(baselineLivePath)) {
    console.error('E_INPUT_MISSING: both sides need the shared 1MiB live input');
    process.exit(3);
  }
  const candidateLivePath = resolve(candidate.repoRoot, ...candidateLive.path.split('/'));
  const liveSha = sha256(readFileSync(candidateLivePath));
  const baselineSha = sha256(readFileSync(baselineLivePath));
  if (liveSha !== baselineSha) {
    console.error(`E_INPUT_SHA: live inputs differ between sides (${liveSha.slice(0, 12)} vs ${baselineSha.slice(0, 12)})`);
    process.exit(3);
  }
  const outputDir = join(candidate.abs.runRoot, 'measurements', 'ux-overhead', candidate.attemptId, 'live');
  if (existsSync(join(outputDir, 'summary.json'))) {
    console.error(`E_OUTPUT_EXISTS: ${join(outputDir, 'summary.json')} already exists; live legs are write-once per attempt`);
    process.exit(3);
  }
  if (parsed.values.get('validate-only')) {
    console.log(JSON.stringify({
      kind: 'live-legs-plan', candidate: candidate.runId, baseline: baseline.runId,
      attemptId: candidate.attemptId, pairs: 5, order: live.order,
      activeWindowSeconds: ACTIVE_WINDOW_SECONDS, liveInputSha256: liveSha, outputDir,
    }, null, 2));
    process.exit(0);
  }

  mkdirSync(join(outputDir, 'rounds'), { recursive: true });
  const rounds = [];
  let allValid = true;
  const sequence = [];
  for (const entry of live.order) {
    sequence.push({ first: entry[0], second: entry[1] });
  }
  let pair = 0;
  for (const entry of sequence) {
    pair += 1;
    for (const sideLetter of [entry.first, entry.second]) {
      const build = sideLetter === 'A'
        ? { stagingRoot: baseline.abs.stagingRoot, receiverDir: join(baseline.abs.stagingRoot, 'receiver') }
        : { stagingRoot: candidate.abs.stagingRoot, receiverDir: join(candidate.abs.stagingRoot, 'receiver') };
      const liveInput = sideLetter === 'A' ? baselineLivePath : candidateLivePath;
      await assertPortsFree([SENDER_PORT, RECEIVER_PORT, DEBUG_PORT]);
      console.log(`live pair ${pair} side ${sideLetter}: starting`);
      let record;
      try {
        record = await runSide({ side: sideLetter, pairIndex: pair, build, liveInput });
        judgeSide(record, sideLetter);
      } catch (error) {
        record = { side: sideLetter, pairIndex: pair, collectionError: String((error && error.message) || error) };
        record.valid = false;
      }
      rounds.push(record);
      writeFileSync(join(outputDir, 'rounds', `pair-${pair}-${sideLetter}.json`),
        `${JSON.stringify(record, null, 2)}\n`);
      console.log(`live pair ${pair} side ${sideLetter}: ${record.valid ? 'VALID' : `INVALID (${(record.violations || [record.collectionError]).join('; ')})`}`);
      if (!record.valid) allValid = false;
    }
  }
  const sidesValid = { A: rounds.filter((r) => r.side === 'A' && r.valid).length,
    B: rounds.filter((r) => r.side === 'B' && r.valid).length };
  const summary = {
    kind: 'live-legs-summary', attemptId: candidate.attemptId, pairs: 5,
    order: live.order, activeWindowSeconds: ACTIVE_WINDOW_SECONDS,
    liveInputSha256: liveSha, sidesValid, verdict: allValid ? 'PASS' : 'FAIL',
    invalidRounds: rounds.filter((r) => !r.valid).map((r) => `pair-${r.pairIndex}-${r.side}`),
    advisory: 'RTT values in the rounds are advisory only; the primary metrics stay on the recorded legs',
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(allValid ? 0 : 1);
}

main().catch((error) => { console.error('LIVE LEGS FAILED:', error); process.exit(1); });

// T6 baseline preflight: ONE real video import on the verified baseline
// build, recording the raw timing chain (journey marks, status trail,
// processed frames). This is a measurability check, NOT a performance PASS.
//
// Usage:
//   node baseline-preflight.mjs --context <run-context.json> --video <clip>
//        [--repo-root <dir>] [--attempt <id>] [--help]
//
// Exit: 0 Ready observed; 1 not Ready / import failure; 2 bad arguments;
//       3 invalid context; 5 run-root guard.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeRunRoot, loadRunContext, verifyProductManifest } from './run-context.mjs';
import { assertPortsFree, recordProcesses } from './process-guard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const RECEIVER_PORT = 8771;
const DEBUG_PORT = 9445;
const CASE_ID = 'baseline-preflight';

const HELP = `usage: node tools/desktop-recv/e2e/baseline-preflight.mjs --context <json> --video <clip> [options]

  --context <json>   REQUIRED baseline run context (phase=baseline).
  --video <file>     the real recorded clip to import through the page's
                     file input (browser-level setInputFiles equivalent).
  --repo-root <dir>  resolve repo-relative context paths against <dir>.
  --attempt <id>     attempt id for proof/baseline-preflight/<id>/ (default preflight-001).
  --help             this text.

  Exit: 0 Ready observed, 1 not Ready, 2 bad arguments, 3 invalid context,
        5 run-root guard.`;

function parseArgs(argv) {
  const out = { values: new Map(), help: false };
  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];
    if (arg === '--help') { out.help = true; index += 1; continue; }
    if (['--context', '--video', '--repo-root', '--attempt'].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) return { error: `${arg} needs a value` };
      out.values.set(arg.slice(2), value);
      index += 2;
      continue;
    }
    return { error: `unknown argument: ${arg}` };
  }
  return out;
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const log = (...parts) => console.log(new Date().toISOString(), ...parts);

function startServer(command, argv, name) {
  const child = spawn(command, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  return child;
}

async function waitHttp(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { const response = await fetch(url); if (response.ok) return; } catch (error) { /* up soon */ }
    await sleep(200);
  }
  throw new Error(`endpoint did not come up: ${url}`);
}

async function findEdgePid(profile) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const pid = await new Promise((resolvePid) => {
      const ps = spawn('powershell', ['-NoProfile', '-Command',
        `$p = Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${profile}*' } | Select-Object -First 1; if ($p) { $p.ProcessId }`],
      { stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      ps.stdout.on('data', (chunk) => { out += chunk; });
      ps.on('exit', () => resolvePid(Number(out.trim()) || 0));
    });
    if (pid > 0) return pid;
    await sleep(300);
  }
  return 0;
}
async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) { console.error(parsed.error); console.error(HELP); process.exit(2); }
  if (parsed.help) { console.log(HELP); process.exit(0); }
  const contextPath = parsed.values.get('context');
  const videoPath = parsed.values.get('video');
  if (!contextPath || !videoPath) {
    console.error('--context and --video are required');
    console.error(HELP);
    process.exit(2);
  }
  if (!existsSync(videoPath)) { console.error(`video not found: ${videoPath}`); process.exit(2); }

  let context;
  try {
    context = loadRunContext(contextPath, { repoRoot: parsed.values.get('repo-root') });
  } catch (error) {
    console.error(error.message);
    process.exit(3);
  }
  if (context.phase !== 'baseline') {
    console.error(`E_CONTEXT_PHASE: the baseline preflight requires phase=baseline (got ${context.phase})`);
    process.exit(3);
  }
  try { verifyProductManifest(context); } catch (error) { console.error(error.message); process.exit(3); }
  try { initializeRunRoot(context, { resume: true }); } catch (error) { console.error(error.message); process.exit(5); }

  const receiverDir = join(context.abs.stagingRoot, 'receiver');
  if (!existsSync(join(receiverDir, 'server.py'))) {
    console.error(`baseline receiver not staged: ${receiverDir}`);
    process.exit(3);
  }

  const attemptId = parsed.values.get('attempt') || 'preflight-001';
  const proofDir = join(context.abs.runRoot, 'proof', CASE_ID, attemptId);
  mkdirSync(proofDir, { recursive: true });
  const proofVideo = join(proofDir, 'imported.webm');
  copyFileSync(videoPath, proofVideo);
  const videoBytes = statSync(proofVideo).size;
  const videoSha = sha256(readFileSync(proofVideo));

  await assertPortsFree([RECEIVER_PORT, DEBUG_PORT]);
  const receiverServer = startServer('python', [join(receiverDir, 'server.py'),
    '--port', String(RECEIVER_PORT), '--directory', receiverDir], 'receiver-http');
  const profile = mkdtempSync(join(tmpdir(), 'cimbar-e2e-base-'));
  spawn(EDGE, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
    '--disable-features=Translate,TranslateUI', '--lang=en-US',
    '--window-position=0,0', '--window-size=1280,900',
    `http://127.0.0.1:${RECEIVER_PORT}/`,
  ], { stdio: 'ignore' });

  let pid = 0;
  let browser = null;
  let exitCode = 1;
  const observation = {
    version: 1,
    iterationId: 'receiver-ux-v2',
    runId: context.runId,
    attemptId,
    caseId: CASE_ID,
    startedAt: new Date().toISOString(),
    video: { sourcePath: videoPath, proofRef: `proof/${CASE_ID}/${attemptId}/imported.webm`, sha256: videoSha, bytes: videoBytes },
  };
  try {
    await waitHttp(`http://127.0.0.1:${RECEIVER_PORT}/`);
    for (let attempt = 0; attempt < 60 && !browser; attempt += 1) {
      await sleep(300);
      try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`); } catch (error) { /* not up yet */ }
    }
    if (!browser) throw new Error('receiver Edge did not expose CDP');
    pid = await findEdgePid(profile);
    if (pid) recordProcesses(context.abs.runRoot, [{ pid, kind: 'receiver-edge' }]);
    recordProcesses(context.abs.runRoot, [{ pid: receiverServer.pid, kind: 'receiver-server' }]);

    const page = browser.contexts()[0].pages()[0] || await browser.contexts()[0].newPage();
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const ready = await page.evaluate(() => Boolean(window.__journey && window.__journey.initReadyAt)).catch(() => false);
      if (ready) break;
      await sleep(250);
    }
    const startedAt = Date.now();
    await page.setInputFiles('#file-input', videoPath);
    const terminal = new Set(['Ready', 'Incomplete', 'Stopped', 'Idle']);
    let state = null;
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      state = await page.evaluate(() => window.__state).catch(() => null);
      if (terminal.has(state)) break;
      await sleep(100);
    }
    await sleep(500);
    const captured = await page.evaluate(() => ({
      state: window.__state || null,
      journey: window.__journey || null,
      statusTrail: window.__statusTrail || [],
      lastStats: window.__lastStats || null,
      contractSnapshot: window.__contractSnapshot || null,
      statusText: (document.getElementById('status') || {}).textContent || null,
    }));
    const journey = captured.journey || {};
    const stats = (captured.contractSnapshot && captured.contractSnapshot.stats) || captured.lastStats || {};
    const artifact = captured.contractSnapshot ? captured.contractSnapshot.artifact : null;
    observation.observedState = captured.state;
    observation.statusText = captured.statusText;
    observation.journey = journey;
    observation.timing = {
      initStartAt: journey.initStartAt || null,
      initReadyAt: journey.initReadyAt || null,
      receivingAt: journey.receivingAt || null,
      readyAt: journey.readyAt || null,
      initMs: (journey.initReadyAt && journey.initStartAt) ? journey.initReadyAt - journey.initStartAt : null,
      readyMs: (journey.readyAt && journey.receivingAt) ? journey.readyAt - journey.receivingAt : null,
      wallMs: Date.now() - startedAt,
    };
    observation.stats = stats;
    observation.processedFrames = Number.isFinite(stats.processedFrames) ? stats.processedFrames : null;
    observation.artifact = artifact ? {
      byteCount: artifact.byteCount, suggestedName: artifact.suggestedName, mime: artifact.mime,
    } : null;
    observation.statusTrail = captured.statusTrail;
    observation.contractSnapshot = captured.contractSnapshot;
    exitCode = captured.state === 'Ready' ? 0 : 1;
  } catch (error) {
    observation.error = String((error && error.message) || error);
    console.error('PREFLIGHT FAILED:', error);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (pid) {
      await new Promise((resolveKill) => {
        const killer = spawn('powershell', ['-NoProfile', '-Command',
          `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${profile}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
        { stdio: 'ignore' });
        killer.on('exit', resolveKill);
      });
    }
    receiverServer.kill();
  }
  observation.finishedAt = new Date().toISOString();
  observation.result = exitCode === 0 ? 'READY_OBSERVED' : 'NOT_READY';
  writeFileSync(join(proofDir, 'observation.json'), `${JSON.stringify(observation, null, 2)}\n`);
  const summary = {
    version: 1,
    iterationId: 'receiver-ux-v2',
    runId: context.runId,
    phase: context.phase,
    attemptId,
    caseId: CASE_ID,
    observedAt: observation.finishedAt,
    video: observation.video,
    productManifestSha256: context.productManifestSha256,
    state: observation.observedState || null,
    timing: observation.timing || null,
    processedFrames: observation.processedFrames ?? null,
    artifact: observation.artifact || null,
    result: observation.result,
    note: 'T6 baseline preflight only: proves the baseline is measurable; it is NOT a candidate performance PASS and carries no threshold verdict.',
  };
  writeFileSync(join(context.abs.runRoot, 'baseline-observation.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(exitCode);
}

main().catch((error) => {
  console.error('PREFLIGHT FAILED:', error);
  process.exit(1);
});

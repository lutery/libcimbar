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

// The single live judge lives in the pure calculator so the UX gate can
// re-judge the SAME raw files (round-12 A-R3 + B-02). Imported lazily inside
// main() because this module also runs as a CLI.
let judgeLiveSideRef = null;
async function liveJudge() {
  if (!judgeLiveSideRef) {
    judgeLiveSideRef = await import(pathToFileURL(join(HERE, 'measure-ux-calc.mjs')).href)
      .then((m) => m.judgeLiveSide);
  }
  return judgeLiveSideRef;
}

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

    // The 30s activity window: sample the real page every ~2s. The window
    // ends EARLY the moment a sample is not Receiving (an early Ready is a
    // failed round - A-R3 forbids padding the sleep to 30s), and every sample
    // carries the page's own session identity and performance.now anchor so
    // the judge can place settlements INSIDE the observed window.
    const windowStart = Date.now();
    let span = 0;
    while (true) {
      const probe = await page.evaluate(() => ({
        at: Date.now(),
        perfNow: performance.now(),
        state: window.__state || null,
        primary: (document.getElementById('ux-primary') || {}).textContent || '',
        elapsed: (document.getElementById('ux-elapsed') || {}).textContent || '',
        rate: (document.getElementById('ux-rate') || {}).textContent || '',
        sessionId: (window.__contractSnapshot || {}).sessionId ?? null,
        // The frozen wire contract does not carry sessionSeq today; read it
        // defensively so a future contract addition tightens the check
        // without a tool change (the judge falls back to sessionId).
        sessionSeq: (window.__contractSnapshot || {}).sessionSeq ?? null,
        revision: (window.__contractSnapshot || {}).revision ?? null,
        submitted: ((window.__contractSnapshot || {}).stats || {}).submittedFrames ?? null,
        previewVideoWidth: (document.getElementById('preview') || {}).videoWidth || 0,
      }));
      probe.atMs = probe.at - windowStart;
      result.samples.push(probe);
      if (probe.state !== 'Receiving') {
        result.observations.earlyStop = {
          index: result.samples.length, atMs: probe.atMs, state: probe.state,
          note: 'the window stopped at the first non-Receiving sample; the round is not padded to 30s',
        };
        break;
      }
      span = probe.at - windowStart;
      if (span >= ACTIVE_WINDOW_SECONDS * 1000) break;
      await sleep(2000);
    }
    result.observations.sampleSpanMs = result.samples.length
      ? result.samples[result.samples.length - 1].at - result.samples[0].at : 0;

    // Real stop + release evidence. A failed stop sub-leg must NOT discard the
    // raw window samples: the failure is recorded and the judge refuses the
    // round (clock not frozen), with the raw evidence still on disk.
    try {
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
    } catch (error) {
      result.observations.stopError = String((error && error.message) || error);
    }

    try {
      const observer = await page.evaluate(() => {
        const o = window.__uxObserver;
        return o ? { frames: o.frames, telemetryWrites: o.telemetryWrites,
          telemetryArmed: o.telemetryArmed === true } : null;
      });
      result.frames = observer ? observer.frames : [];
      result.telemetryWrites = observer ? observer.telemetryWrites : [];
      result.telemetryArmed = observer ? observer.telemetryArmed : null;
    } catch (error) {
      result.observations.observerError = String((error && error.message) || error);
      result.frames = result.frames || [];
      result.telemetryWrites = result.telemetryWrites || [];
      result.telemetryArmed = result.telemetryArmed === undefined ? null : result.telemetryArmed;
    }
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

// The live judge itself lives in measure-ux-calc.mjs (A-R3): the window must
// be one session in Receiving for >=30s with a real settlement inside it.
async function judgeSide(record, side) {
  const judge = await liveJudge();
  return judge(record, side);
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
  // Calibrated live input (A-R3): the CANDIDATE manifest must bind the live
  // sample (path + SHA). The BASELINE side uses its own manifest binding when
  // present, otherwise the candidate's sample basename is mapped into the
  // baseline's T31c layout <baseline runRoot>/fixtures-ext/incompressible/.
  // Both files are re-hashed from disk before a browser starts and the two
  // SHAs must be equal (a shared sample keeps the legs comparable). The
  // baseline root is READ-ONLY: when the calibrated sample is absent the run
  // refuses and the lead decides how to provide/lock it - this tool never
  // writes into an old run root. 09b bound a 1MiB sample that naturally
  // reached Ready in ~18s, so the calibration sample must stay Receiving for
  // the full 30s; an early Ready is reported as 样本不足 and stays invalid.
  const manifestLiveBinding = (manifest) => {
    const live = manifest.liveInput;
    if (live && typeof live.path === 'string' && typeof live.sha256 === 'string'
      && /^[0-9a-f]{64}$/.test(live.sha256)) {
      return { path: live.path, sha256: live.sha256, bytes: live.bytes, binding: 'liveInput' };
    }
    return null;
  };
  const verifyLiveFile = (context, live, label) => {
    const abs = resolve(context.repoRoot, ...live.path.split('/'));
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      throw new Error(`E_INPUT_MISSING: the ${label} live input is not on disk: ${live.path}`);
    }
    const actual = sha256(readFileSync(abs));
    if (actual !== live.sha256) {
      throw new Error(`E_INPUT_SHA: the ${label} live input on disk (${actual.slice(0, 12)})`
        + ` does not match its manifest/lock (${live.sha256.slice(0, 12)})`);
    }
    return {
      path: abs,
      relativePath: live.path,
      sha256: actual,
      bytes: typeof live.bytes === 'number' ? live.bytes : statSync(abs).size,
      binding: live.binding,
    };
  };
  let candidateLiveInput;
  let baselineLiveInput;
  try {
    const candidateBinding = manifestLiveBinding(JSON.parse(readFileSync(candidate.abs.inputManifest, 'utf8')));
    if (!candidateBinding) {
      throw new Error('E_INPUT_MISSING: the candidate input manifest does not bind a liveInput (path + 64-hex sha256)');
    }
    candidateLiveInput = verifyLiveFile(candidate, candidateBinding, 'candidate');
    const baselineBinding = manifestLiveBinding(JSON.parse(readFileSync(baseline.abs.inputManifest, 'utf8')));
    if (baselineBinding) {
      baselineLiveInput = verifyLiveFile(baseline, baselineBinding, 'baseline');
    } else {
      const basename = candidateLiveInput.relativePath.split('/').pop();
      const inferredRel = `${baseline.runRoot}/fixtures-ext/incompressible/${basename}`;
      const inferredAbs = resolve(baseline.repoRoot, ...inferredRel.split('/'));
      if (!existsSync(inferredAbs) || !statSync(inferredAbs).isFile()) {
        throw new Error(`E_INPUT_MISSING: the baseline run root has no live sample ${inferredRel}`
          + ' (inferred by basename from the candidate liveInput). The baseline root is read-only;'
          + ' the lead must decide how to provide/lock the calibrated sample - this tool writes nothing there.');
      }
      baselineLiveInput = verifyLiveFile(baseline, {
        path: inferredRel,
        sha256: candidateLiveInput.sha256,
        bytes: null,
        binding: 'basename-inferred',
      }, 'baseline');
    }
  } catch (error) {
    console.error(error.message);
    process.exit(3);
  }
  if (candidateLiveInput.sha256 !== baselineLiveInput.sha256) {
    console.error(`E_INPUT_SHA: live inputs differ between sides (${candidateLiveInput.sha256.slice(0, 12)}`
      + ` [${candidateLiveInput.binding}] vs ${baselineLiveInput.sha256.slice(0, 12)} [${baselineLiveInput.binding}])`);
    process.exit(3);
  }
  const liveSha = candidateLiveInput.sha256;
  const outputDir = join(candidate.abs.runRoot, 'measurements', 'ux-overhead', candidate.attemptId, 'live');
  // --validate-only is a PREFLIGHT: it validates the contexts, the method and
  // both calibrated input bindings (which is exactly what B-R12-3 needs before
  // an expensive run) and writes nothing, so it is answered before the
  // write-once guard. A real run still refuses an existing attempt below.
  if (parsed.values.get('validate-only')) {
    console.log(JSON.stringify({
      kind: 'live-legs-plan', candidate: candidate.runId, baseline: baseline.runId,
      attemptId: candidate.attemptId, pairs: 5, order: live.order,
      activeWindowSeconds: ACTIVE_WINDOW_SECONDS,
      liveInputSha256: liveSha,
      liveInputBytes: candidateLiveInput.bytes,
      liveInputPaths: { A: baselineLiveInput.relativePath, B: candidateLiveInput.relativePath },
      liveInputBindings: { A: baselineLiveInput.binding, B: candidateLiveInput.binding },
      liveInputNote: 'the sample must stay in Receiving for >=30s; a naturally shorter receive'
        + ' is reported as 样本不足 and stays invalid (never padded)',
      outputDir,
      outputExists: existsSync(join(outputDir, 'summary.json')),
    }, null, 2));
    process.exit(0);
  }
  if (existsSync(join(outputDir, 'summary.json'))) {
    console.error(`E_OUTPUT_EXISTS: ${join(outputDir, 'summary.json')} already exists; live legs are write-once per attempt`);
    process.exit(3);
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
      const liveInput = sideLetter === 'A' ? baselineLiveInput.path : candidateLiveInput.path;
      await assertPortsFree([SENDER_PORT, RECEIVER_PORT, DEBUG_PORT]);
      console.log(`live pair ${pair} side ${sideLetter}: starting`);
      let record;
      try {
        record = await runSide({ side: sideLetter, pairIndex: pair, build, liveInput });
        await judgeSide(record, sideLetter);
      } catch (error) {
        record = { side: sideLetter, pairIndex: pair, collectionError: String((error && error.message) || error) };
        record.valid = false;
      }
      rounds.push(record);
      writeFileSync(join(outputDir, 'rounds', `pair-${pair}-${sideLetter}.json`),
        `${JSON.stringify(record, null, 2)}\n`);
      const reasons = record.violationMessages
        || (record.violations || []).map((v) => (typeof v === 'string' ? v : `${v.code}: ${v.detail}`));
      console.log(`live pair ${pair} side ${sideLetter}: ${record.valid ? 'VALID' : `INVALID (${(reasons.length ? reasons : [record.collectionError]).join('; ')})`}`);
      if (!record.valid) allValid = false;
    }
  }
  const sidesValid = { A: rounds.filter((r) => r.side === 'A' && r.valid).length,
    B: rounds.filter((r) => r.side === 'B' && r.valid).length };
  const shortWindows = rounds.filter((r) => !r.collectionError
    && typeof r.windowObservedMs === 'number' && r.windowObservedMs < ACTIVE_WINDOW_SECONDS * 1000)
    .map((r) => ({ round: `pair-${r.pairIndex}-${r.side}`, windowObservedMs: r.windowObservedMs }));
  const summary = {
    kind: 'live-legs-summary', attemptId: candidate.attemptId, pairs: 5,
    order: live.order, activeWindowSeconds: ACTIVE_WINDOW_SECONDS,
    liveInputSha256: liveSha,
    liveInputBytes: candidateLiveInput.bytes,
    liveInputPaths: { A: baselineLiveInput.relativePath, B: candidateLiveInput.relativePath },
    liveInputBindings: { A: baselineLiveInput.binding, B: candidateLiveInput.binding },
    windowObservedMs: Object.fromEntries(rounds.map(
      (r) => [`pair-${r.pairIndex}-${r.side}`, r.windowObservedMs ?? null],
    )),
    firstNonReceiving: Object.fromEntries(rounds.map(
      (r) => [`pair-${r.pairIndex}-${r.side}`, r.firstNonReceiving ?? null],
    )),
    rawSampleCounts: Object.fromEntries(rounds.map(
      (r) => [`pair-${r.pairIndex}-${r.side}`, Array.isArray(r.samples) ? r.samples.length : 0],
    )),
    rawSamplesNote: 'every raw sample per side stays in live/rounds/pair-<n>-<side>.json (never deleted)',
    calibration: {
      activeWindowSeconds: ACTIVE_WINDOW_SECONDS,
      sampleInsufficient: shortWindows.length > 0,
      note: shortWindows.length > 0
        ? `样本不足: ${shortWindows.map((entry) => `${entry.round} 只观察到 ${entry.windowObservedMs}ms < 30000ms`).join('; ')}`
          + '；未补睡，按真实覆盖判 invalid'
        : '每个实时侧别都在同一 session 的 Receiving 状态下观察到 >=30s 窗口',
      shortWindows,
    },
    sidesValid, verdict: allValid ? 'PASS' : 'FAIL',
    invalidRounds: rounds.filter((r) => !r.valid).map((r) => `pair-${r.pairIndex}-${r.side}`),
    advisory: 'RTT values in the rounds are advisory only; the primary metrics stay on the recorded legs',
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(allValid ? 0 : 1);
}

main().catch((error) => { console.error('LIVE LEGS FAILED:', error); process.exit(1); });

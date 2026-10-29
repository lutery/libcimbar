// PS 5.1 launcher launch-matrix check (release 1.2.0, affected-surface re-verification).
//
// Machine-readable matrix over the BUILT staging receiver: Windows PowerShell
// 5.1 direct launch, launch.cmd's pwsh7 branch and its 5.1 fallback branch
// (PATH stripped of every pwsh directory at the subprocess level), the
// HTTP-served bytes (index.html + vendor/cimbar_js.wasm must equal the staging
// files byte for byte), and the launcher's failure exits 2/3/4/5.
//
// Round-16 A16-02 / B-R16-1: cleanup only ever stops a process that is PROVEN
// to be this launch's server — its command line must carry the staging
// server.py path and --directory root (normalized exact match), its executable
// must be the python resolved on PATH, and it must have been created by this
// launch. A failed launch (no "server pid N") never triggers any cleanup, a
// pre-occupied port aborts the case and leaves the foreign listener alive, and
// a busy port is never used as a reason to stop the port's owner. Guard cases
// h1-h3 prove the refusal branches with real OS processes; h4 proves the
// positive verified cleanup.
//
// Usage:
//   node tools/desktop-recv/e2e/ps51-launch-check.mjs --staging <receiver-dir> \
//        [--run-id 20261028-teamexec-13] [--repo-root <dir>]
//
// Exit: 0 every case passed, 1 at least one case failed, 2 bad arguments,
//       3 staging receiver incomplete.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = process.env.PS51_REPO_ROOT || resolve(HERE, '..', '..', '..');

// Tee console output so the human-readable .log is the literal run transcript.
const logLines = [];
const rawLog = console.log.bind(console);
console.log = (...parts) => {
  const line = parts.map((p) => (typeof p === 'string' ? p : String(p))).join(' ');
  logLines.push(line);
  rawLog(line);
};

const HELP = `usage: node tools/desktop-recv/e2e/ps51-launch-check.mjs --staging <receiver-dir> [options]

  --staging <dir>    REQUIRED. The built staging receiver directory (repo
                     relative or absolute); must hold launch.ps1/launch.cmd/
                     server.py/index.html/vendor/cimbar_js.wasm.
  --run-id <id>      run root id (default 20261028-teamexec-13); logs land in
                     docs/tests/runs/<id>/logs/ps51-launch-check.json|.log
  --repo-root <dir>  resolve repo-relative paths against <dir> (default: this
                     checkout).

  Cases a-g are the launch matrix; h1-h4 are the round-16 cleanup guard cases.
  Exit: 0 all cases pass, 1 at least one FAIL, 2 bad arguments, 3 incomplete staging.`;

const WINPS = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const WHERE = 'C:\\Windows\\System32\\where.exe';
const SYSTEM_PATH = [
  'C:\\WINDOWS\\system32',
  'C:\\WINDOWS',
  'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0',
];

function parseArgs(argv) {
  const out = { values: new Map(), error: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { out.help = true; continue; }
    if (arg === '--staging' || arg === '--run-id' || arg === '--repo-root') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) return { error: `${arg} needs a value` };
      out.values.set(arg.slice(2), value);
      i += 1;
      continue;
    }
    return { error: `unknown argument: ${arg}` };
  }
  return out;
}

const parsed = parseArgs(process.argv.slice(2));
if (parsed.error || parsed.help) {
  if (parsed.error) console.error(parsed.error);
  console.error(HELP);
  process.exit(parsed.error ? 2 : 0);
}
const stagingArg = parsed.values.get('staging');
if (!stagingArg) {
  console.error('--staging <receiver-dir> is required');
  console.error(HELP);
  process.exit(2);
}
const RUN_ID = parsed.values.get('run-id') || '20261028-teamexec-13';
const REPO_ROOT = resolve(parsed.values.get('repo-root') || REPO);
const STAGING = isAbsolute(stagingArg) ? stagingArg : resolve(REPO_ROOT, stagingArg);
const RUN_ROOT = join(REPO_ROOT, 'docs', 'tests', 'runs', RUN_ID);
const LOG_DIR = join(RUN_ROOT, 'logs');
const STARTED_AT = new Date();

const REQUIRED = ['launch.ps1', 'launch.cmd', 'server.py', 'index.html', 'config/asset-set.json', 'vendor/cimbar_js.wasm'];
const missing = REQUIRED.filter((rel) => !existsSync(join(STAGING, rel)));
if (missing.length > 0) {
  console.error(`staging receiver incomplete, missing: ${missing.join(', ')} (${STAGING})`);
  process.exit(3);
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const sha256File = (path) => sha256(readFileSync(path));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- child-process plumbing -------------------------------------------------

function run(command, args, options = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd || REPO_ROOT,
      env: options.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsVerbatimArguments: options.windowsVerbatimArguments === true,
    });
    const out = [];
    const err = [];
    child.stdout.on('data', (c) => out.push(c));
    child.stderr.on('data', (c) => err.push(c));
    child.on('error', (e) => resolveRun({ code: -1, error: e, stdout: Buffer.concat(out), stderr: Buffer.concat(err) }));
    child.on('exit', (code) => resolveRun({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err) }));
  });
}

const text = (buffer) => buffer.toString('utf8');

function childEnv(pathValue) {
  return { ...process.env, PATH: pathValue };
}

// --- port plumbing ----------------------------------------------------------

function listenOnce(port) {
  return new Promise((resolveListen) => {
    const server = net.createServer();
    server.once('error', () => resolveListen(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolveListen(true));
    });
  });
}

function occupyPort(port) {
  return new Promise((resolveOccupy) => {
    const server = net.createServer();
    server.once('error', () => resolveOccupy(null));
    server.listen(port, '127.0.0.1', () => resolveOccupy(server));
  });
}

function portConnectable(port, timeoutMs = 2000) {
  return new Promise((resolveProbe) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (value) => { socket.destroy(); resolveProbe(value); };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });
}

async function waitPortFree(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await listenOnce(port)) return true;
    await sleep(250);
  }
  return false;
}

// --- process identity (round-16 A16-02) -------------------------------------

// Key=value probe of one pid through CIM. Never writes, never kills.
async function probeProcess(pid) {
  const script = [
    `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -ErrorAction SilentlyContinue`,
    "if (-not $p) { 'found=0'; exit 0 }",
    "'found=1'",
    "'name=' + $p.Name",
    "'exe=' + $p.ExecutablePath",
    "'cmd=' + $p.CommandLine",
    "'created=' + $p.CreationDate.ToString('o')",
    "'parent=' + $p.ParentProcessId",
  ].join('; ');
  const probe = await run(WINPS, ['-NoProfile', '-Command', script]);
  const out = { found: false, name: null, exe: null, cmd: null, created: null, parent: null };
  for (const line of text(probe.stdout).split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index);
    const value = line.slice(index + 1);
    if (key === 'found') out.found = value === '1';
    else if (key in out) out[key] = value;
  }
  return out;
}

// Windows command-line tokenizer: split on whitespace outside double quotes,
// with \" as an escaped literal quote (the launcher's Quote-Argument shape).
function splitCommandLine(line) {
  const tokens = [];
  let current = '';
  let inQuotes = false;
  let started = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '\\' && line[i + 1] === '"') { current += '"'; i += 1; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else if (ch === '"') {
      inQuotes = true;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started || current.length > 0) { tokens.push(current); current = ''; started = false; }
    } else {
      current += ch;
    }
  }
  if (started || current.length > 0) tokens.push(current);
  return tokens;
}

const normalizePath = (value) => resolve(String(value)).replace(/[\\/]+/g, '\\').toLowerCase();

// Verify the recorded pid really is THIS launch's server before any stop.
// Facts checked: exact staging server.py argument, exact --directory root,
// executable equals the python resolved on PATH, creation after the launch.
function verifyServerIdentity(proc, expectations) {
  const reasons = [];
  if (!proc.found) {
    reasons.push('process not found (already exited or pid recycled)');
    return { ok: false, reasons };
  }
  const tokens = splitCommandLine(proc.cmd || '');
  const serverIdx = tokens.findIndex((t) => normalizePath(t) === normalizePath(expectations.serverPath));
  if (serverIdx < 0) reasons.push(`command line has no exact staging server.py argument (${expectations.serverPath})`);
  const dirIdx = tokens.indexOf('--directory');
  if (dirIdx < 0 || dirIdx + 1 >= tokens.length) reasons.push('command line has no --directory argument');
  else if (normalizePath(tokens[dirIdx + 1]) !== normalizePath(expectations.directory)) {
    reasons.push(`--directory ${tokens[dirIdx + 1]} is not the staging root ${expectations.directory}`);
  }
  if (normalizePath(proc.exe || '') !== normalizePath(expectations.pythonExe)) {
    reasons.push(`executable ${proc.exe} is not the resolved python ${expectations.pythonExe}`);
  }
  const created = Date.parse(proc.created || '');
  if (!Number.isFinite(created)) reasons.push('creation time unreadable');
  else if (created < expectations.launchStartedAtMs - 3000) reasons.push('process predates this launch');
  return { ok: reasons.length === 0, reasons };
}

// Stop the server of THIS launch only. Refusals are recorded, never retried
// through the port owner: a busy port is a symptom, not an entitlement.
async function stopVerifiedServer(serverPid, expectations, port, note) {
  if (!Number.isSafeInteger(serverPid) || serverPid <= 0) {
    note(`cleanup refused: no server pid was reported (pid=${serverPid}); no process is touched`);
    return { attempted: false, cleaned: false, facts: null, refused: 'no-server-pid' };
  }
  const proc = await probeProcess(serverPid);
  const verdict = verifyServerIdentity(proc, expectations);
  const facts = {
    pid: serverPid,
    found: proc.found,
    verified: verdict.ok,
    reasons: verdict.reasons,
    cmdLine: proc.cmd || null,
    exe: proc.exe || null,
    created: proc.created || null,
  };
  if (!verdict.ok) {
    note(`cleanup refused (pid ${serverPid}): ${verdict.reasons.join('; ')}`);
    return { attempted: true, cleaned: false, facts, refused: 'identity-mismatch' };
  }
  await run(WINPS, ['-NoProfile', '-Command', `Stop-Process -Id ${serverPid} -Force -ErrorAction SilentlyContinue`]);
  note(`stop: verified Stop-Process -Id ${serverPid}`);
  const free = await waitPortFree(port, 6000);
  if (!free) {
    note(`port ${port} is still busy after the verified stop; diagnostics only, no further process is touched`);
  }
  return { attempted: true, cleaned: free, facts, refused: null };
}

async function fetchOk(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return { ok: true, status: response.status, body: Buffer.from(await response.arrayBuffer()) };
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) { lastError = error; }
    await sleep(250);
  }
  return { ok: false, error: String(lastError && lastError.message || lastError) };
}

// --- case bookkeeping -------------------------------------------------------

const cases = [];

function newCase(id, title) {
  const entry = { id, title, checks: [], pass: true, cleanup: null };
  cases.push(entry);
  return {
    entry,
    check(name, ok, detail) {
      entry.checks.push({ name, ok: ok === true, detail: detail === undefined ? null : String(detail).slice(0, 400) });
      if (ok !== true) entry.pass = false;
      console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail !== undefined ? ` :: ${String(detail).slice(0, 160)}` : ''}`);
      return ok === true;
    },
    note(line) {
      entry.checks.push({ name: `note: ${line}`, ok: null, detail: null });
    },
    setCleanup(value) { entry.cleanup = value; },
  };
}

const tempDirs = [];
function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

// --- environment construction (hard preflight) ------------------------------

console.log(`ps51-launch-check: staging ${STAGING}`);
console.log(`ps51-launch-check: run root ${RUN_ROOT}`);

const fullPath = process.env.PATH || '';
const wherePython = await run(WHERE, ['python'], { env: childEnv(fullPath) });
const pythonExe = text(wherePython.stdout).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] || '';
if (wherePython.code !== 0 || !pythonExe) {
  console.error(`preflight: where python failed under the full PATH (exit ${wherePython.code})`);
  process.exit(3);
}
const pythonDir = dirname(pythonExe);
const winpsPath = [...SYSTEM_PATH, pythonDir].join(';');
const noPythonPath = SYSTEM_PATH.join(';');
let noPwshPath = winpsPath;
// strip any entry whose path mentions pwsh (defensive; SYSTEM_PATH never does)
noPwshPath = noPwshPath.split(';').filter((entry) => !/pwsh/i.test(entry)).join(';');

const envChecks = [];
{
  const pwshFull = await run(WHERE, ['pwsh'], { env: childEnv(fullPath) });
  const pwshStripped = await run(WHERE, ['pwsh'], { env: childEnv(noPwshPath) });
  const pythonWinps = await run(WHERE, ['python'], { env: childEnv(winpsPath) });
  const version = await run(WINPS, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { env: childEnv(winpsPath) });
  envChecks.push(
    { name: 'where pwsh exit0 under full PATH (pwsh7 present)', ok: pwshFull.code === 0, detail: `exit=${pwshFull.code}` },
    { name: 'where pwsh exit!=0 under pwsh-stripped PATH', ok: pwshStripped.code !== 0, detail: `exit=${pwshStripped.code}` },
    { name: 'where python exit0 under winps PATH', ok: pythonWinps.code === 0, detail: `exit=${pythonWinps.code} first=${text(pythonWinps.stdout).split(/\r?\n/)[0]}` },
    { name: 'powershell.exe 5.1 major version = 5', ok: text(version.stdout).trim() === '5', detail: `major=${text(version.stdout).trim()} exit=${version.code}` },
  );
  if (envChecks.some((c) => !c.ok)) {
    for (const c of envChecks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.name} :: ${c.detail}`);
    console.error('PS51-LAUNCH-CHECK FAIL (environment preflight)');
    process.exit(3);
  }
}
console.log(`env: python dir ${pythonDir}`);
console.log(`env: winpsPath ${winpsPath}`);
console.log('env: preflight ok (pwsh present in full PATH, absent in stripped PATH, python on winps PATH, PS 5.1)');

// --- shared positive-launch helper ------------------------------------------

const stagingIndexSha = sha256File(join(STAGING, 'index.html'));
const stagingWasmSha = sha256File(join(STAGING, 'vendor', 'cimbar_js.wasm'));
const stagingIndexBytes = statSync(join(STAGING, 'index.html')).size;
const stagingWasmBytes = statSync(join(STAGING, 'vendor', 'cimbar_js.wasm')).size;

async function positiveLaunch({ engine, engineArgs, env, envLabel, port, caseId, title, prechecks = [], verbatim = false }) {
  const c = newCase(caseId, title);
  for (const pre of prechecks) c.check(pre.name, pre.ok, pre.detail);
  const portFree = await listenOnce(port);
  c.check('precondition: port free before launch', portFree, `port=${port}`);
  if (!portFree) {
    c.note('port pre-occupied: this case aborts without touching the port owner (round-16 A16-02)');
    c.setCleanup({ attempted: false, cleaned: null, refused: 'port-preoccupied' });
    return c;
  }
  const launchStartedAtMs = Date.now();
  const launchOut = [];
  const launchErr = [];
  const child = spawn(engine, engineArgs, { cwd: tmpdir(), env, stdio: ['ignore', 'pipe', 'pipe'], windowsVerbatimArguments: verbatim });
  child.stdout.on('data', (chunk) => launchOut.push(chunk));
  child.stderr.on('data', (chunk) => launchErr.push(chunk));
  const code = await new Promise((r) => child.on('exit', r));
  const stdoutText = text(Buffer.concat(launchOut));
  const stderrText = text(Buffer.concat(launchErr));
  c.note(`env=${envLabel} port=${port} exit=${code}`);
  c.note(`stdout=${JSON.stringify(stdoutText.trim().slice(0, 300))}`);
  if (stderrText.trim()) c.note(`stderr=${JSON.stringify(stderrText.trim().slice(0, 300))}`);
  c.check('launcher exit code 0', code === 0, `exit=${code}`);

  const pidMatch = /server pid (\d+)/.exec(stdoutText);
  const serverPid = pidMatch ? Number(pidMatch[1]) : 0;
  c.check('stdout reports "server pid N"', serverPid > 0, pidMatch ? `pid=${serverPid}` : 'no match');

  const index = await fetchOk(`http://127.0.0.1:${port}/`);
  const wasm = index.ok ? await fetchOk(`http://127.0.0.1:${port}/vendor/cimbar_js.wasm`) : { ok: false, error: 'index fetch failed first' };
  c.check('GET / -> 200', index.ok === true && index.status === 200, index.ok ? `status=${index.status}` : index.error);
  if (index.ok) c.check('index.html bytes equal staging (sha256)', sha256(index.body) === stagingIndexSha,
    `${sha256(index.body).slice(0, 12)} vs ${stagingIndexSha.slice(0, 12)} (${index.body.length}/${stagingIndexBytes} bytes)`);
  c.check('GET /vendor/cimbar_js.wasm -> 200', wasm.ok === true && wasm.status === 200, wasm.ok ? `status=${wasm.status}` : wasm.error);
  if (wasm.ok) c.check('cimbar_js.wasm bytes equal staging (sha256)', sha256(wasm.body) === stagingWasmSha,
    `${sha256(wasm.body).slice(0, 12)} vs ${stagingWasmSha.slice(0, 12)} (${wasm.body.length}/${stagingWasmBytes} bytes)`);

  const expectations = {
    serverPath: join(STAGING, 'server.py'),
    directory: STAGING,
    pythonExe,
    launchStartedAtMs,
  };
  if (serverPid > 0) {
    const cleanup = await stopVerifiedServer(serverPid, expectations, port, (line) => c.note(line));
    c.setCleanup(cleanup);
    c.check('server identity verified for cleanup', cleanup.facts !== null && cleanup.facts.verified === true,
      cleanup.facts ? JSON.stringify(cleanup.facts.reasons) : 'no facts');
    c.check('port free after verified Stop-Process', cleanup.cleaned === true, `port=${port}`);
  } else {
    c.note('cleanup skipped: no "server pid N" was reported; no process is touched');
    c.setCleanup({ attempted: false, cleaned: null, refused: 'no-server-pid' });
  }
  return c;
}

// --- cases ------------------------------------------------------------------

const LAUNCH_PS1 = join(STAGING, 'launch.ps1');
const LAUNCH_CMD = join(STAGING, 'launch.cmd');
const PORT_A = 18771;
const PORT_B = 18772;
const PORT_D = 18773;
const PORT_C = 18774;

// a. Windows PowerShell 5.1 direct launch.
console.log('[a] 5.1 direct launch (powershell.exe -ExecutionPolicy Bypass)');
await positiveLaunch({
  engine: WINPS,
  engineArgs: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', LAUNCH_PS1, '-Port', String(PORT_A), '-NoBrowser'],
  env: childEnv(winpsPath),
  envLabel: 'winpsPath',
  port: PORT_A,
  caseId: 'a',
  title: '5.1 direct launch serves index.html and wasm byte-identically',
});

// b. launch.cmd normal branch (pwsh 7 on PATH).
console.log('[b] launch.cmd normal branch (pwsh7 on PATH)');
const cmdLineB = `""${LAUNCH_CMD}" -Port ${PORT_B} -NoBrowser"`;
const wherePwshB = await run(WHERE, ['pwsh'], { env: childEnv(fullPath) });
await positiveLaunch({
  engine: 'cmd.exe',
  engineArgs: ['/d', '/s', '/c', cmdLineB],
  env: childEnv(fullPath),
  envLabel: 'fullPath',
  port: PORT_B,
  caseId: 'b',
  title: 'launch.cmd pwsh7 branch serves index.html and wasm byte-identically',
  verbatim: true,
  prechecks: [{ name: 'precondition: where pwsh exit0 under full PATH', ok: wherePwshB.code === 0, detail: `exit=${wherePwshB.code}` }],
});

// c. launch.cmd fallback branch (no pwsh anywhere on PATH).
console.log('[c] launch.cmd fallback branch (pwsh stripped from PATH)');
const cmdLineC = `""${LAUNCH_CMD}" -Port ${PORT_C} -NoBrowser"`;
const wherePwshC = await run(WHERE, ['pwsh'], { env: childEnv(noPwshPath) });
await positiveLaunch({
  engine: 'cmd.exe',
  engineArgs: ['/d', '/s', '/c', cmdLineC],
  env: childEnv(noPwshPath),
  envLabel: 'noPwshPath',
  port: PORT_C,
  caseId: 'c',
  title: 'launch.cmd 5.1 fallback serves index.html and wasm byte-identically',
  verbatim: true,
  prechecks: [{ name: 'precondition: where pwsh exit!=0 under noPwshPath (branch takes 5.1)', ok: wherePwshC.code !== 0, detail: `exit=${wherePwshC.code}; PATH=${noPwshPath}` }],
});

// d. Port already in use -> exit 3 with a readable reason. The occupier is our
// own in-process listener; the launcher must never learn or touch its pid, and
// this case asserts the listener is still alive after the failed launch.
console.log('[d] port occupied -> exit 3');
{
  const c = newCase('d', '5.1 launch on an occupied port exits 3 with "already in use"');
  const occupier = await occupyPort(PORT_D);
  c.check('precondition: our own node listener holds the port', occupier !== null, `port=${PORT_D}`);
  const busy = await run(WINPS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', LAUNCH_PS1,
    '-Port', String(PORT_D), '-NoBrowser'], { env: childEnv(winpsPath), cwd: tmpdir() });
  c.note(`stdout=${JSON.stringify(text(busy.stdout).trim().slice(0, 200))}`);
  c.check('exit code 3', busy.code === 3, `exit=${busy.code}`);
  c.check('stderr contains "already in use"', /already in use/.test(text(busy.stderr)), text(busy.stderr).trim().slice(0, 200));
  c.check('our listener still holds the port after the failed launch', await portConnectable(PORT_D), `port=${PORT_D}`);
  c.setCleanup({ attempted: false, cleaned: null, refused: 'no-server-pid', listenerKept: true });
  if (occupier) await new Promise((r) => occupier.close(r));
  c.check('port free after our own occupier close', await waitPortFree(PORT_D), `port=${PORT_D}`);
}

// e. Missing files: only launch.ps1 present -> exit 4.
console.log('[e] missing server.py -> exit 4');
{
  const c = newCase('e', 'launcher in a directory without server.py exits 4');
  const lone = tempDir('ps51-e-');
  cpSync(LAUNCH_PS1, join(lone, 'launch.ps1'));
  const probe = await run(WINPS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    join(lone, 'launch.ps1'), '-Port', '18775', '-NoBrowser'], { env: childEnv(winpsPath), cwd: tmpdir() });
  c.note(`dir=${lone}`);
  c.check('exit code 4', probe.code === 4, `exit=${probe.code}`);
  c.check('stderr contains "server.py not found"', /server\.py not found/.test(text(probe.stderr)),
    text(probe.stderr).trim().slice(0, 200));
  c.setCleanup({ attempted: false, cleaned: null, refused: 'no-server-pid' });
}

// f. No python on PATH -> exit 2.
console.log('[f] python absent -> exit 2');
{
  const c = newCase('f', 'launcher without python on PATH exits 2');
  const probe = await run(WINPS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', LAUNCH_PS1,
    '-Port', '18776', '-NoBrowser'], { env: childEnv(noPythonPath), cwd: tmpdir() });
  c.note(`PATH=${noPythonPath}`);
  c.check('exit code 2', probe.code === 2, `exit=${probe.code}`);
  c.check('stderr contains "python is not available"', /python is not available/.test(text(probe.stderr)),
    text(probe.stderr).trim().slice(0, 200));
  c.setCleanup({ attempted: false, cleaned: null, refused: 'no-server-pid' });
}

// g. The server process dies immediately: exit 5 with the real cause. 5.1
// cannot read Start-Process's exit code after the child exits (handle gone),
// so it must say "unknown code" while still surfacing the stderr marker and
// the diagnostic log paths; pwsh 7 reports the actual "code 23".
console.log('[g] server exits immediately (fake server.py sys.exit(23))');
const fakeServer = [
  'import sys',
  "sys.stderr.write('PS51-QUICK-EXIT-MARKER fake server exiting on purpose\\n')",
  'sys.stderr.flush()',
  'sys.exit(23)',
  '',
].join('\n');
const pwshExe = text(wherePwshB.stdout).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] || 'pwsh';
{
  const c = newCase('g51', '5.1 launcher reports exit 5 + unknown code + marker + diagnostic logs');
  const copyDir = tempDir('ps51-g51-');
  cpSync(STAGING, copyDir, { recursive: true });
  writeFileSync(join(copyDir, 'server.py'), fakeServer, 'ascii');
  c.note(`copy=${copyDir} fake server exits 23 after the stderr marker`);
  const probe = await run(WINPS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    join(copyDir, 'launch.ps1'), '-Port', '18777', '-NoBrowser'], { env: childEnv(winpsPath), cwd: tmpdir() });
  const errText = text(probe.stderr);
  c.note(`stdout=${JSON.stringify(text(probe.stdout).trim().slice(0, 200))}`);
  c.note(`stderr=${JSON.stringify(errText.trim().slice(0, 500))}`);
  c.check('exit code 5', probe.code === 5, `exit=${probe.code}`);
  c.check('stderr contains "unknown code"', /unknown code/.test(errText), 'expected the 5.1 "exited with an unknown code" branch');
  c.check('stderr contains the fake-server marker', /PS51-QUICK-EXIT-MARKER/.test(errText), 'the child stderr must be surfaced');
  c.check('stderr contains "diagnostic logs:"', /diagnostic logs:/.test(errText), 'diagnostic log paths must be printed');
  c.check('port free (fake server exited by itself)', await waitPortFree(18777, 3000), 'port=18777');
  c.setCleanup({ attempted: false, cleaned: null, refused: 'no-server-pid' });
}
{
  const c = newCase('g7', 'pwsh7 launcher reports exit 5 + the real server code 23');
  const copyDir = tempDir('ps51-g7-');
  cpSync(STAGING, copyDir, { recursive: true });
  writeFileSync(join(copyDir, 'server.py'), fakeServer, 'ascii');
  c.note(`copy=${copyDir} engine=${pwshExe}`);
  const probe = await run(pwshExe, ['-NoProfile', '-File',
    join(copyDir, 'launch.ps1'), '-Port', '18778', '-NoBrowser'], { env: childEnv(fullPath), cwd: tmpdir() });
  const errText = text(probe.stderr);
  c.note(`stdout=${JSON.stringify(text(probe.stdout).trim().slice(0, 200))}`);
  c.note(`stderr=${JSON.stringify(errText.trim().slice(0, 500))}`);
  c.check('exit code 5', probe.code === 5, `exit=${probe.code}`);
  c.check('stderr contains "code 23"', /code 23/.test(errText), 'pwsh 7 keeps the child handle and must report the real code');
  c.check('port free (fake server exited by itself)', await waitPortFree(18778, 3000), 'port=18778');
  c.setCleanup({ attempted: false, cleaned: null, refused: 'no-server-pid' });
}

// --- round-16 cleanup guard cases (A16-02 / B-R16-1) ------------------------

const guardExpectationsFor = (launchStartedAtMs) => ({
  serverPath: join(STAGING, 'server.py'),
  directory: STAGING,
  pythonExe,
  launchStartedAtMs,
});

// h1. Our own unrelated listener occupies the port: the failed launch reports
// no pid, and the cleanup decision must refuse without touching the listener.
console.log('[h1] own unrelated listener -> cleanup refused, listener kept');
{
  const c = newCase('h1', 'cleanup refuses when no pid was reported and keeps the unrelated listener');
  const port = 18781;
  const occupier = await occupyPort(port);
  c.check('precondition: our own node listener holds the port', occupier !== null, `port=${port}`);
  const launchedAt = Date.now();
  const busy = await run(WINPS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', LAUNCH_PS1,
    '-Port', String(port), '-NoBrowser'], { env: childEnv(winpsPath), cwd: tmpdir() });
  c.check('launcher exit code 3', busy.code === 3, `exit=${busy.code}`);
  const decision = await stopVerifiedServer(0, guardExpectationsFor(launchedAt), port, (line) => c.note(line));
  c.check('cleanup refused with no-server-pid', decision.refused === 'no-server-pid' && decision.attempted === false,
    JSON.stringify(decision));
  c.check('unrelated listener still holds the port (not killed)', await portConnectable(port), `port=${port}`);
  c.setCleanup(decision);
  if (occupier) await new Promise((r) => occupier.close(r));
  c.check('port free after our own occupier close', await waitPortFree(port), `port=${port}`);
}

// h2. No pid obtained and the port is free: "port free" is not an entitlement
// to act, so the cleanup must still do nothing.
console.log('[h2] launch failed with no pid (port free) -> cleanup refused');
{
  const c = newCase('h2', 'cleanup refuses when the launch failed without a pid (port free is not entitlement)');
  const lone = tempDir('ps51-h2-');
  cpSync(LAUNCH_PS1, join(lone, 'launch.ps1'));
  const port = 18782;
  const launchedAt = Date.now();
  const probe = await run(WINPS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    join(lone, 'launch.ps1'), '-Port', String(port), '-NoBrowser'], { env: childEnv(winpsPath), cwd: tmpdir() });
  c.check('launcher exit code 4', probe.code === 4, `exit=${probe.code}`);
  c.check('port is free before the cleanup decision', await listenOnce(port), `port=${port}`);
  const decision = await stopVerifiedServer(0, guardExpectationsFor(launchedAt), port, (line) => c.note(line));
  c.check('cleanup refused with no-server-pid', decision.refused === 'no-server-pid' && decision.attempted === false,
    JSON.stringify(decision));
  c.setCleanup(decision);
}

// h3. A pid exists but its identity does not match this launch (decoy python
// process): the verified cleanup must refuse and the decoy must survive.
console.log('[h3] foreign/decoy pid -> identity mismatch -> cleanup refused');
{
  const c = newCase('h3', 'cleanup refuses a pid whose identity is not this launch\'s server');
  const decoy = spawn(pythonExe, ['-c', 'import time; time.sleep(30)'], { stdio: 'ignore' });
  const decoyPid = decoy.pid;
  const launchedAt = Date.now();
  await sleep(800);
  const before = await probeProcess(decoyPid);
  c.check('precondition: decoy process exists', before.found === true, `pid=${decoyPid} name=${before.name}`);
  const decision = await stopVerifiedServer(decoyPid, guardExpectationsFor(launchedAt), 18784, (line) => c.note(line));
  c.check('cleanup refused with identity-mismatch', decision.refused === 'identity-mismatch', JSON.stringify(decision.facts && decision.facts.reasons));
  const after = await probeProcess(decoyPid);
  c.check('decoy still alive after the refused cleanup', after.found === true, `pid=${decoyPid}`);
  c.setCleanup(decision);
  decoy.kill();
  await sleep(500);
}

// h4. Positive guard: a real launch's own server is stopped by the verified
// cleanup, with the identity facts recorded.
console.log('[h4] real server -> verified cleanup positive');
{
  const c = newCase('h4', 'verified cleanup stops this launch\'s real server (positive)');
  const port = 18783;
  const launchedAt = Date.now();
  const launch = await run(WINPS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', LAUNCH_PS1,
    '-Port', String(port), '-NoBrowser'], { env: childEnv(winpsPath), cwd: tmpdir() });
  const pidMatch = /server pid (\d+)/.exec(text(launch.stdout));
  const serverPid = pidMatch ? Number(pidMatch[1]) : 0;
  c.check('launcher exit code 0', launch.code === 0, `exit=${launch.code}`);
  c.check('stdout reports "server pid N"', serverPid > 0, pidMatch ? `pid=${serverPid}` : 'no match');
  if (serverPid > 0) {
    const decision = await stopVerifiedServer(serverPid, guardExpectationsFor(launchedAt), port, (line) => c.note(line));
    c.check('identity verified', decision.facts !== null && decision.facts.verified === true,
      decision.facts ? JSON.stringify(decision.facts.reasons) : 'no facts');
    c.check('cleanup stopped the server and the port is free', decision.cleaned === true, `port=${port}`);
    c.setCleanup(decision);
  } else {
    c.setCleanup({ attempted: false, cleaned: null, refused: 'no-server-pid' });
  }
}

// --- summary + artifacts ----------------------------------------------------

console.log('');
console.log('per-case verdicts:');
for (const entry of cases) {
  console.log(`  ${entry.pass ? 'PASS' : 'FAIL'}  [${entry.id}] ${entry.title}`);
}
const failed = cases.filter((entry) => !entry.pass);
const verdict = failed.length === 0 ? 'PASS' : 'FAIL';
console.log('');
console.log(`PS51-LAUNCH-CHECK ${verdict}`);

mkdirSync(LOG_DIR, { recursive: true });
const report = {
  tool: 'ps51-launch-check',
  version: 2,
  toolPath: fileURLToPath(import.meta.url),
  toolSha256: sha256File(fileURLToPath(import.meta.url)),
  runId: RUN_ID,
  stagingRoot: STAGING,
  stagingServerPath: join(STAGING, 'server.py'),
  repoRoot: REPO_ROOT,
  startedAt: STARTED_AT.toISOString(),
  finishedAt: new Date().toISOString(),
  environment: {
    fullPath,
    pythonDir,
    pythonExe,
    winpsPath,
    noPwshPath,
    noPythonPath,
    pwshExe,
    preflight: envChecks,
  },
  staging: {
    indexHtml: { sha256: stagingIndexSha, bytes: stagingIndexBytes },
    cimbarJsWasm: { sha256: stagingWasmSha, bytes: stagingWasmBytes },
  },
  cases: cases.map((entry) => ({
    id: entry.id,
    title: entry.title,
    pass: entry.pass,
    cleanup: entry.cleanup,
    checks: entry.checks,
  })),
  summary: { total: cases.length, passed: cases.length - failed.length, failed: failed.length },
  verdict,
};
const jsonPath = join(LOG_DIR, 'ps51-launch-check.json');
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const logPath = join(LOG_DIR, 'ps51-launch-check.log');
writeFileSync(logPath, `${logLines.join('\n')}\n`, 'utf8');
rawLog(`wrote ${jsonPath}`);
rawLog(`wrote ${logPath}`);

// Cleanup: every temp copy and any stray listener is already stopped by the
// cases; remove the temp directories so nothing leaks out of %TEMP%.
for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });

process.exit(verdict === 'PASS' ? 0 : 1);

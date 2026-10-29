// Round-19 A19-01 RED: the CURRENT reclaimStaleAutomationBrowser (round-19
// bytes) run with real OS calls against an unrelated PYTHON listener on 9445
// whose command line merely contains the 'cimbar-e2e-' marker. The current
// function must issue a real Stop-Process and report a "reclaim" - the defect
// the verdict describes. The killed process is our own child, so the RED is
// safe; it is the exact production function body, verbatim.
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WINPS = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
const PORT = 9445;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bindProbe(port) {
  return new Promise((resolveProbe) => {
    const server = net.createServer();
    server.once('error', () => resolveProbe(false));
    server.listen(port, '127.0.0.1', () => { server.close(() => resolveProbe(true)); });
  });
}

function runCaptured(command, argv) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = []; const err = [];
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    child.on('error', () => resolvePromise({ code: -1, stdout: '', stderr: '' }));
    child.on('exit', (code) => resolvePromise({
      code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'),
    }));
  });
}

// VERBATIM current function from run-e2e.mjs (round-19 bytes).
async function reclaimStaleAutomationBrowser(port, label) {
  if (await bindProbe(port)) return null;
  const netstat = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
  let ownerPid = 0;
  for (const line of String(netstat.stdout || '').split(/\r?\n/)) {
    const match = new RegExp(`^\\s*TCP\\s+127\\.0\\.0\\.1:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`).exec(line);
    if (match) { ownerPid = Number(match[1]); break; }
  }
  if (!ownerPid) throw new Error(`${label}: CDP port ${port} is busy but no listening owner was found`);
  const probe = await runCaptured(WINPS, ['-NoProfile', '-Command',
    `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${ownerPid}" -ErrorAction SilentlyContinue; if($p){$p.CommandLine}`]);
  const cmd = probe.stdout.trim();
  if (!/cimbar-e2e-/i.test(cmd)) {
    throw new Error(`${label}: CDP port ${port} is owned by pid ${ownerPid}, which is not a harness ` +
      `automation browser (no cimbar-e2e- profile marker); refusing to touch it`);
  }
  await runCaptured(WINPS, ['-NoProfile', '-Command',
    `Stop-Process -Id ${ownerPid} -Force -ErrorAction SilentlyContinue`]);
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await bindProbe(port)) {
      console.log(`[${label}] reclaimed stale automation browser pid ${ownerPid} on CDP port ${port} (profile marker verified)`);
      return { pid: ownerPid, port };
    }
    await sleep(250);
  }
  throw new Error(`${label}: reclaimed pid ${ownerPid} but CDP port ${port} is still busy`);
}

// An unrelated python listener whose command line contains the marker only as
// an ordinary path fragment.
const markerPath = join(HERE, 'cimbar-e2e-demo', 'unrelated-server.py');
const python = spawn('python', ['-c',
  `# ${markerPath}\nimport socket,time\ns=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)\n` +
  `s.bind(('127.0.0.1', ${PORT})); s.listen(1)\nprint('READY', flush=True)\ntime.sleep(120)\n`],
{ stdio: ['ignore', 'pipe', 'pipe'] });
let ready = false;
python.stdout.on('data', (chunk) => { if (chunk.toString().includes('READY')) ready = true; });
let pythonExit = null;
python.on('exit', (code, signal) => { pythonExit = { code, signal, at: new Date().toISOString() }; });

await sleep(2500);
const record = { pythonPid: python.pid, port: PORT, markerPath, ready, pythonExitBefore: pythonExit };
try {
  const result = await reclaimStaleAutomationBrowser(PORT, 'receiver');
  record.reclaimResult = result;
} catch (error) {
  record.reclaimError = String(error && error.message || error);
}
await sleep(3000);
record.pythonExitAfter = pythonExit;
record.killedByOldReclaim = pythonExit !== null && record.reclaimResult && record.reclaimResult.pid === python.pid;
if (pythonExit === null) {
  python.kill();
  record.killedByOwnerDuringCleanup = true;
}
writeFileSync(join(HERE, 'a19-01-red.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
writeFileSync(join(HERE, 'a19-01-red.log'), [
  'A19-01 RED (round-19 bytes; verbatim reclaimStaleAutomationBrowser, real OS calls)',
  `occupier: python pid=${python.pid} listening on 127.0.0.1:${PORT}; command line contains the marker only as a path fragment: ${markerPath}`,
  'reclaimResult: ' + JSON.stringify(record.reclaimResult || null),
  'reclaimError: ' + (record.reclaimError || 'none'),
  'python exit after the call: ' + JSON.stringify(pythonExit),
  'defect reproduced (old reclaim stopped an unrelated python process): ' + record.killedByOldReclaim,
  '',
].join('\n'), 'utf8');
console.log('A19-01-RED pythonPid=' + python.pid + ' reclaimPid=' + (record.reclaimResult && record.reclaimResult.pid) +
  ' pythonExited=' + (pythonExit !== null) + ' reproduced=' + record.killedByOldReclaim);

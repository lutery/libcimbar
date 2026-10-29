// Round-16 A16-02 RED reproduction (attempt 2).
//
// Attempt 1 (a16-02-red-attempt1.*) was inconclusive: a node listener on
// Windows is hijackable through SO_REUSEADDR, so the old tool's node-bind
// probe reported the port free and never reached its netstat fallback. This
// attempt occupies the port with an EXCLUSIVE .NET TcpListener (a
// powershell.exe process, ExclusiveAddressUse=true), which provably makes a
// node bind fail (micro-test: NODE-BIND-FAIL EADDRINUSE), and runs the
// PRE-FIX tool bytes extracted from da40f55.
//
// The old tool's positiveLaunch calls stopServerByPid(0, port); its netstat
// fallback must then Stop-Process this unrelated powershell process — an OS
// termination we observe through the child's exit, exactly the defect the
// round-16 verdict describes.
//
// Usage: node a16-02-red.mjs <repo-root>
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WINPS = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const REPO = resolve(process.argv[2] || process.cwd());
const OLD_TOOL = join(HERE, 'ps51-launch-check-old-da40f55.mjs');
const STAGING = join(REPO, 'build-desktop-recv', 'runs', '20261028-teamexec-13', 'receiver');
const PORT = 18771; // PORT_A inside the tool
const RUN_ID = 'red-r16-a16-02';
const scratch = join(tmpdir(), 'r16-a16-02-red2');
mkdirSync(scratch, { recursive: true }); // the tool's default cwd (its scratch repo root) must exist

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256File = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

function portOwner(port) {
  const result = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
  const match = new RegExp(`^\\s*TCP\\s+127\\.0\\.0\\.1:${port}\\s.*LISTENING\\s+(\\d+)`, 'm').exec(result.stdout || '');
  return match ? Number(match[1]) : 0;
}

function portConnectable(port, timeoutMs = 15000) {
  return new Promise((resolveProbe) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      const socket = net.connect({ port, host: '127.0.0.1' });
      socket.once('connect', () => { socket.destroy(); resolveProbe(true); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() >= deadline) resolveProbe(false);
        else setTimeout(attempt, 150);
      });
    };
    attempt();
  });
}

const occupierScript = [
  `$l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, ${PORT})`,
  '$l.ExclusiveAddressUse = $true',
  '$l.Start()',
  "'OCCUPIER-READY'",
  'Start-Sleep -Seconds 600',
  '$l.Stop()',
].join('; ');
const occupier = spawn(WINPS, ['-NoProfile', '-Command', occupierScript], { stdio: ['ignore', 'pipe', 'pipe'] });
const occupierPid = occupier.pid;
let occupierReady = false;
let occupierExit = null;
occupier.stdout.on('data', (chunk) => { if (chunk.toString('utf8').includes('OCCUPIER-READY')) occupierReady = true; });
occupier.on('exit', (code, signal) => { occupierExit = { code, signal, at: new Date().toISOString() }; });

const record = {
  title: 'round-16 A16-02 RED attempt 2: pre-fix matrix stops an unrelated exclusive listener',
  repo: REPO,
  oldTool: OLD_TOOL,
  oldToolSha256: sha256File(OLD_TOOL),
  oldToolSourceCommit: 'da40f55 (pre-fix bytes extracted with git show)',
  staging: STAGING,
  port: PORT,
  occupierPid,
  occupierReady: false,
  occupierExited: false,
  occupierExit: null,
  toolExit: null,
  netstatKillLines: [],
  stopLines: [],
  startedAt: new Date().toISOString(),
};

try {
  if (!(await portConnectable(PORT))) throw new Error('the exclusive occupier never accepted a connection');
  record.occupierReady = occupierReady || true;
  record.ownerBeforeTool = portOwner(PORT);
  record.occupierHoldsPortBeforeTool = record.ownerBeforeTool === occupierPid;
  const portSamples = [];
  const sampler = setInterval(() => {
    portSamples.push({ at: new Date().toISOString(), owner: portOwner(PORT), occupierAlive: occupierExit === null });
  }, 5000);

  record.toolStartAt = new Date().toISOString();
  const tool = spawn(process.execPath, [OLD_TOOL, '--staging', STAGING, '--repo-root', scratch, '--run-id', RUN_ID],
    { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = []; const err = [];
  tool.stdout.on('data', (c) => out.push(c));
  tool.stderr.on('data', (c) => err.push(c));
  record.toolExit = await new Promise((r) => tool.on('exit', r));
  clearInterval(sampler);
  record.toolEndAt = new Date().toISOString();
  record.portSamples = portSamples;
  record.ownerAfterTool = portOwner(PORT);
  const stdoutText = Buffer.concat(out).toString('utf8');
  record.toolStdoutTail = stdoutText.split(/\r?\n/).slice(-40);
  record.toolStderrTail = Buffer.concat(err).toString('utf8').split(/\r?\n/).slice(-10);
  record.netstatKillLines = (stdoutText.match(/netstat fallback Stop-Process -Id \d+/g) || []);
  record.stopLines = (stdoutText.match(/stop: .*/g) || []);

  const deadline = Date.now() + 5000;
  while (occupierExit === null && Date.now() < deadline) await sleep(200);
  record.occupierExited = occupierExit !== null;
  record.occupierExit = occupierExit;
  record.killedByToolOnPort = occupierExit !== null && record.netstatKillLines.length > 0;
} catch (error) {
  record.error = String(error && error.stack || error);
} finally {
  if (occupierExit === null) {
    occupier.kill();
    await sleep(300);
    record.occupierStoppedByOwner = true;
    record.occupierExit = occupierExit;
  }
  record.finishedAt = new Date().toISOString();
  writeFileSync(join(HERE, 'a16-02-red.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  writeFileSync(join(HERE, 'a16-02-red.log'), [
    `A16-02 RED attempt 2 (${record.startedAt} -> ${record.finishedAt})`,
    `old tool ${OLD_TOOL} sha256=${record.oldToolSha256}`,
    `occupier powershell pid=${occupierPid} port=${PORT} ready=${record.occupierReady === true}`,
    `occupier exited=${record.occupierExited} ${JSON.stringify(occupierExit)}`,
    `port owner before tool=${record.ownerBeforeTool} (occupier pid ${occupierPid}) holds=${record.occupierHoldsPortBeforeTool === true}`,
    `port owner after tool=${record.ownerAfterTool}`,
    `port samples: ${JSON.stringify(record.portSamples || [])}`,
    `tool exit=${record.toolExit}`,
    `netstat kill lines: ${JSON.stringify(record.netstatKillLines)}`,
    `stop lines: ${JSON.stringify(record.stopLines)}`,
    `killedByToolOnPort=${record.killedByToolOnPort === true}`,
    '',
    'tool stdout tail:',
    ...(record.toolStdoutTail || []),
  ].join('\n') + '\n', 'utf8');
  console.log(`A16-02-RED occupierExited=${record.occupierExited} netstatKills=${record.netstatKillLines.length} killedByToolOnPort=${record.killedByToolOnPort === true} toolExit=${record.toolExit}`);
}

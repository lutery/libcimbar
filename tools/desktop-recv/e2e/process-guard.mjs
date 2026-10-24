// Stage-5 process guard (T4 review Blocking 1).
//
// Rules:
//  * never kill by port, generic browser flag or process name;
//  * a process is stopped only when it was RECORDED by this run in
//    <runRoot>/pids.json AND its live command line still contains every
//    recorded marker (fail-closed: an entry without markers is never killed);
//  * a busy port is an explicit error; the owner process is left alone.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export class ProcessGuardError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProcessGuardError';
  }
}

// Markers are command-line substrings that identify OUR process. The profile
// prefix is the dedicated cimbar-e2e- temp profile of the normal-Edge
// receiver; --remote-debugging-pipe is Playwright's own child marker and is
// only ever combined with a pid THIS run recorded.
export const KIND_MARKERS = {
  'receiver-server': ['server.py', '--port 8771'],
  'sender-http': ['http.server', '8811'],
  'recorder-http': ['http.server', '8790'],
  'receiver-edge': ['cimbar-e2e-'],
  'recorder-edge': ['cimbar-e2e-rec-'],
  'playwright-edge': ['--remote-debugging-pipe'],
};

export function recordProcesses(runRoot, entries) {
  for (const entry of entries) {
    if (!entry || !Number.isSafeInteger(entry.pid) || entry.pid <= 0) {
      throw new ProcessGuardError(`invalid pid entry: ${JSON.stringify(entry)}`);
    }
    if (!KIND_MARKERS[entry.kind]) {
      throw new ProcessGuardError(`unknown process kind: ${entry.kind}`);
    }
  }
  mkdirSync(runRoot, { recursive: true });
  const path = join(runRoot, 'pids.json');
  // Merge with what this run already recorded; a restarted server or a second
  // browser must not erase the earlier pids.
  const merged = new Map();
  if (existsSync(path)) {
    try {
      const existing = JSON.parse(readFileSync(path, 'utf8'));
      for (const entry of Array.isArray(existing.entries) ? existing.entries : []) {
        merged.set(entry.pid, entry);
      }
    } catch (error) {
      // An unreadable previous record is replaced (the guard never kills
      // what it cannot verify anyway).
    }
  }
  for (const entry of entries) merged.set(entry.pid, entry);
  writeFileSync(path, `${JSON.stringify({ version: 1, entries: [...merged.values()] }, null, 2)}\n`);
  return path;
}

function runPowerShellJson(script) {
  const proc = spawnSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    timeout: 60000,
  });
  if (proc.status !== 0) {
    throw new ProcessGuardError(`process guard helper failed: ${(proc.stderr || '').trim()}`);
  }
  const text = (proc.stdout || '').trim();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ProcessGuardError(`process guard helper returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

// Reclaim only pids recorded by this run whose command line still matches.
// A missing pids.json means nothing is killed at all.
export async function cleanupRecordedProcesses(runRoot) {
  const path = join(runRoot, 'pids.json');
  if (!existsSync(path)) return { recorded: 0, killed: [], skipped: [] };
  let payload;
  try {
    payload = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new ProcessGuardError(`pids.json is not valid JSON: ${path}`);
  }
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  if (entries.length === 0) return { recorded: 0, killed: [], skipped: [] };
  const spec = entries.map((entry) => ({
    pid: entry.pid,
    markers: Array.isArray(entry.markers) && entry.markers.length > 0
      ? entry.markers
      : (KIND_MARKERS[entry.kind] || []),
  }));
  const json = JSON.stringify(spec).replace(/'/g, "''");
  // ConvertTo-Json is avoided on purpose: a one-element PowerShell array
  // serializes as a scalar and would silently hide the recorded pid.
  const script = `
$spec = '${json}' | ConvertFrom-Json
$killed = @(); $skipped = @()
foreach ($item in @($spec)) {
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($item.pid)" -ErrorAction SilentlyContinue
  if (-not $proc) { $skipped += [int]$item.pid; continue }
  $cmd = [string]$proc.CommandLine
  $matched = $true
  foreach ($marker in @($item.markers)) { if ($cmd -notlike ('*' + [string]$marker + '*')) { $matched = $false } }
  if ($matched -and @($item.markers).Count -gt 0) {
    Stop-Process -Id ([int]$item.pid) -Force -ErrorAction SilentlyContinue
    $killed += [int]$item.pid
  } else {
    $skipped += [int]$item.pid
  }
}
$out = '{"killed":[' + ($killed -join ',') + '],"skipped":[' + ($skipped -join ',') + ']}'
$out`;
  const result = runPowerShellJson(script);
  return {
    recorded: entries.length,
    killed: Array.isArray(result.killed) ? result.killed : [],
    skipped: Array.isArray(result.skipped) ? result.skipped : [],
  };
}

// Explicit refusal when a port this run needs is already listening. The
// owner process is never touched; the operator resolves the conflict.
export async function assertPortsFree(ports) {
  const list = [...new Set(ports)].filter((port) => Number.isSafeInteger(port) && port > 0 && port < 65536);
  if (list.length === 0) return;
  const script = `$busy = @(); foreach ($p in @(${list.join(',')})) { $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $busy += $p } }; ConvertTo-Json -Compress -Depth 3 @{ busy = @($busy) }`;
  const result = runPowerShellJson(script);
  const busy = Array.isArray(result.busy) ? result.busy : [];
  if (busy.length > 0) {
    throw new ProcessGuardError(
      `port(s) already in use: ${busy.join(', ')}; refusing to kill the owner process - free the port or use the context's own ports`,
    );
  }
}

// Real-behaviour tests for the stage-5 process guard (T4 review Blocking 1).
//
// The guard may only stop processes recorded by THIS run (pids.json in the
// run root) after a command-line re-check, or processes matched by the
// dedicated cimbar-e2e profile prefix. It never kills by port or by generic
// browser flags; a busy port is an explicit non-zero refusal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ProcessGuardError,
  assertPortsFree,
  cleanupRecordedProcesses,
  recordProcesses,
} from '../e2e/process-guard.mjs';

function tempRunRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'ux-procguard-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('no pid file: cleanup kills nothing and reports an empty result', async (t) => {
  const runRoot = tempRunRoot(t);
  const result = await cleanupRecordedProcesses(runRoot);
  assert.equal(result.recorded, 0);
  assert.deepEqual(result.killed, []);
  assert.deepEqual(result.skipped, []);
});

test('a recorded pid whose command line does not match is never killed', async (t) => {
  const runRoot = tempRunRoot(t);
  // A real live process that is NOT ours: its command line cannot contain the
  // receiver-server markers, so the guard must leave it running.
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
  t.after(() => child.kill());
  recordProcesses(runRoot, [{ pid: child.pid, kind: 'receiver-server' }]);
  const result = await cleanupRecordedProcesses(runRoot);
  assert.equal(result.killed.includes(child.pid), false);
  assert.equal(result.skipped.includes(child.pid), true);
  assert.equal(child.exitCode, null, 'the foreign process must still be alive');
});

test('stale recorded pids are skipped, never fatal', async (t) => {
  const runRoot = tempRunRoot(t);
  recordProcesses(runRoot, [{ pid: 999999, kind: 'sender-http' }]);
  const result = await cleanupRecordedProcesses(runRoot);
  assert.deepEqual(result.killed, []);
  assert.equal(result.skipped.length, 1);
});

test('an occupied port is refused with an explicit error and no process kill', async (t) => {
  const server = createServer((request, response) => response.end('busy'));
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  t.after(() => server.close());
  const port = server.address().port;
  await assert.rejects(() => assertPortsFree([port]), (error) => {
    assert.ok(error instanceof ProcessGuardError);
    assert.match(error.message, new RegExp(String(port)));
    assert.match(error.message, /refusing to kill/i);
    return true;
  });
});

test('free ports pass', async () => {
  const server = createServer();
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const port = server.address().port;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  await assert.doesNotReject(() => assertPortsFree([port]));
});

test('the pid file is canonical, bounded and rejects bad entries', (t) => {
  const runRoot = tempRunRoot(t);
  recordProcesses(runRoot, [{ pid: 123, kind: 'receiver-server' }]);
  const payload = JSON.parse(readFileSync(join(runRoot, 'pids.json'), 'utf8'));
  assert.equal(payload.version, 1);
  assert.deepEqual(payload.entries, [{ pid: 123, kind: 'receiver-server' }]);
  assert.throws(
    () => recordProcesses(runRoot, [{ pid: -1, kind: 'receiver-server' }]),
    (error) => error instanceof ProcessGuardError,
  );
  assert.throws(
    () => recordProcesses(runRoot, [{ pid: 5, kind: 'unknown-kind' }]),
    (error) => error instanceof ProcessGuardError,
  );
});

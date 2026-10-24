#!/usr/bin/env node
/**
 * CMD-05: run the desktop receiver unit suites explicitly.
 *
 * Every suite is enumerated by name; nothing is discovered by glob. A suite
 * that contains `test.todo(` or `test.skip(` is rejected, because a green
 * exit with pending cases is not a pass. A suite that runs zero tests is
 * rejected as well.
 *
 * Usage:
 *   node tools/desktop-recv/run-unit.mjs --all
 *   node tools/desktop-recv/run-unit.mjs --suite contracts --suite worker
 *   node tools/desktop-recv/run-unit.mjs --help
 *
 * Exit: 0 pass, 1 a suite failed, 2 bad arguments, 3 a required suite is missing.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const UNIT = join(REPO, 'web', 'desktop-recv', 'tests', 'unit');

// The suites promised by the test plan plus the client suite added by the
// round-1 external-review rectification (A-03 watchdog convergence) and the
// receiver-ux-v2 observation suites (T10: ux-telemetry, ux-view, ux-display).
// `--all` requires all of them; partial runs use --suite until later tasks land.
const ALL_SUITES = ['contracts', 'session', 'scheduler', 'worker', 'client', 'save', 'video', 'ui', 'evidence', 'ux-telemetry', 'ux-view', 'ux-display'];

const HELP = `usage: node tools/desktop-recv/run-unit.mjs (--all | --suite <name>...) [--help]

  --all             require and run all ${ALL_SUITES.length} suites
  --suite <name>    run one suite (repeatable); one of:
                    ${ALL_SUITES.join(', ')}
  --help            this text

  Exit: 0 pass, 1 failure, 2 bad arguments, 3 required suite missing.`;

function parseArgs(argv) {
  const out = { all: false, suites: [], help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    if (a === '--all') { out.all = true; continue; }
    if (a === '--suite') {
      const name = argv[++i];
      if (!name) return { error: '--suite needs a name' };
      if (!ALL_SUITES.includes(name)) return { error: `unknown suite: ${name}` };
      out.suites.push(name);
      continue;
    }
    return { error: `unknown argument: ${a}` };
  }
  return out;
}

function suitePath(name) {
  return join(UNIT, `${name}.test.mjs`);
}

function checkSuiteSource(name, path) {
  const src = readFileSync(path, 'utf8');
  if (/test\.todo\s*\(/.test(src)) return `${name}: contains test.todo`;
  if (/test\.skip\s*\(/.test(src)) return `${name}: contains test.skip`;
  return null;
}

function runSuite(name) {
  const path = suitePath(name);
  const res = spawnSync(
    process.execPath,
    ['--test', '--test-reporter=tap', path],
    { cwd: REPO, encoding: 'utf8' }
  );
  const output = `${res.stdout || ''}${res.stderr || ''}`;

  const tests = Number((output.match(/^# tests (\d+)$/m) || [])[1] || 0);
  const fail = Number((output.match(/^# fail (\d+)$/m) || [])[1] || 0);
  const todo = Number((output.match(/^# todo (\d+)$/m) || [])[1] || 0);
  const skipped = Number((output.match(/^# skipped (\d+)$/m) || [])[1] || 0);

  if (res.status !== 0 || fail > 0) {
    console.error(output);
    return `${name}: FAILED (fail=${fail}, status=${res.status})`;
  }
  if (tests === 0) return `${name}: ran 0 tests`;
  if (todo > 0 || skipped > 0) return `${name}: has todo/skipped cases (${todo}/${skipped})`;

  console.log(`${name}: ${tests} tests, 0 failed, 0 todo, 0 skipped`);
  return null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) { console.error(args.error); console.error(HELP); return 2; }
  if (args.help) { console.log(HELP); return 0; }
  if (!args.all && args.suites.length === 0) { console.error('nothing to run'); console.error(HELP); return 2; }

  const wanted = args.all ? ALL_SUITES : args.suites;
  const missing = wanted.filter((name) => !existsSync(suitePath(name)));
  if (args.all && missing.length) {
    console.error(`missing suites (required by --all): ${missing.join(', ')}`);
    console.error('use --suite for a partial run until later tasks land');
    return 3;
  }

  const problems = [];
  for (const name of wanted) {
    const path = suitePath(name);
    if (!existsSync(path)) { problems.push(`${name}: missing`); continue; }
    const sourceProblem = checkSuiteSource(name, path);
    if (sourceProblem) { problems.push(sourceProblem); continue; }
    const runProblem = runSuite(name);
    if (runProblem) problems.push(runProblem);
  }

  if (problems.length) {
    console.error('UNIT SUITE FAILURE:');
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`UNIT SUITES PASS (${wanted.length} suite(s))`);
  return 0;
}

process.exit(main());

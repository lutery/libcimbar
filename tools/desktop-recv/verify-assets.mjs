#!/usr/bin/env node
/**
 * Verify the staged desktop receiver asset set (CMD-04).
 *
 * Rejects, with a non-zero exit:
 *   - path traversal, absolute paths, drive letters, or URLs in asset paths
 *   - files that do not exist, or whose SHA-256 differs from the manifest
 *   - a strict-EOF claim that is not bound to the same WASM digest
 *   - evidence without a real gate log (a bare "strictEofVerified: true"
 *     is not accepted)
 *
 * Usage:
 *   node tools/desktop-recv/verify-assets.mjs [--root <dir>] [--repo <dir>]
 *   node tools/desktop-recv/verify-assets.mjs --help
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';

const HELP = `usage: node tools/desktop-recv/verify-assets.mjs [--root <dir>] [--repo <dir>]

  --root  staging root (default: build-desktop-recv/staging/receiver)
  --repo  repo root (default: discovered by walking up for CMakeLists.txt)

  Exit: 0 pass, 1 verification failed, 2 bad arguments.`;

function parseArgs(argv) {
  const out = { root: null, repo: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    if (a === '--root') { out.root = argv[++i]; continue; }
    if (a === '--repo') { out.repo = argv[++i]; continue; }
    return { error: `unknown argument: ${a}` };
  }
  return out;
}

function findRepoRoot(start) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, 'CMakeLists.txt'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function isSafeRelativePath(value) {
  if (!value || typeof value !== 'string') return false;
  if (/^[A-Za-z]:/.test(value)) return false;
  if (value.startsWith('/') || value.startsWith('\\')) return false;
  if (value.includes('://')) return false;
  if (value.split(/[\\/]/).includes('..')) return false;
  return true;
}

function resolvesUnder(root, rel) {
  const base = resolve(root) + sep;
  const abs = resolve(root, rel);
  return abs.startsWith(base);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) { console.error(args.error); console.error(HELP); return 2; }
  if (args.help) { console.log(HELP); return 0; }

  const repo = args.repo ? resolve(args.repo) : findRepoRoot(process.cwd());
  if (!repo) { console.error('repo root not found (pass --repo)'); return 2; }

  const root = args.root ? resolve(args.root) : join(repo, 'build-desktop-recv/staging/receiver');
  const failures = [];
  const add = (m) => failures.push(m);

  const assetSetPath = join(root, 'config/asset-set.json');
  if (!existsSync(assetSetPath)) { console.error(`missing ${assetSetPath}`); return 1; }

  let assets;
  try { assets = JSON.parse(readFileSync(assetSetPath, 'utf8')); }
  catch (e) { console.error(`asset-set.json is not valid JSON: ${e.message}`); return 1; }

  for (const key of ['assetSetId', 'sourceRevision', 'jsPath', 'wasmPath', 'jsSha256', 'wasmSha256', 'strictEofEvidenceRef']) {
    if (!(key in assets)) add(`asset-set.json missing field: ${key}`);
  }
  if ('strictEofVerified' in assets) {
    add('asset-set.json uses the bare strictEofVerified flag; bind real evidence via strictEofEvidenceRef instead');
  }
  if (typeof assets.sourceRevision === 'string' && !/^[0-9a-f]{7,40}$/.test(assets.sourceRevision)) {
    add(`sourceRevision is not 7-40 hex chars: ${assets.sourceRevision}`);
  }

  for (const key of ['jsPath', 'wasmPath', 'strictEofEvidenceRef']) {
    if (!isSafeRelativePath(assets[key])) add(`${key} is not a safe relative path: ${assets[key]}`);
  }

  const files = [
    ['jsPath', 'jsSha256'],
    ['wasmPath', 'wasmSha256'],
  ];
  for (const [pathKey, digestKey] of files) {
    if (!isSafeRelativePath(assets[pathKey])) continue;
    if (!resolvesUnder(root, assets[pathKey])) { add(`${pathKey} escapes the staging root`); continue; }
    const abs = resolve(root, assets[pathKey]);
    if (!existsSync(abs)) { add(`${pathKey} does not exist: ${abs}`); continue; }
    const actual = sha256File(abs);
    if (typeof assets[digestKey] !== 'string' || !/^[0-9a-f]{64}$/.test(assets[digestKey])) {
      add(`${digestKey} is not a 64-char lowercase hex digest`);
    } else if (actual !== assets[digestKey]) {
      add(`${pathKey} digest mismatch: declared ${assets[digestKey]}, actual ${actual}`);
    }
  }

  if (isSafeRelativePath(assets.strictEofEvidenceRef)) {
    const evidencePath = resolve(repo, assets.strictEofEvidenceRef);
    if (!evidencePath.startsWith(resolve(repo) + sep)) {
      add('strictEofEvidenceRef escapes the repo root');
    } else if (!existsSync(evidencePath)) {
      add(`strict-EOF evidence missing: ${evidencePath}`);
    } else {
      let ev;
      try { ev = JSON.parse(readFileSync(evidencePath, 'utf8')); }
      catch (e) { add(`strict-EOF evidence is not valid JSON: ${e.message}`); ev = null; }
      if (ev) {
        if (ev.wasmSha256 !== assets.wasmSha256) add('strict-EOF evidence is bound to a different WASM digest');
        if (ev.jsSha256 !== assets.jsSha256) add('strict-EOF evidence is bound to a different JS digest');
        if (ev.sourceRevision !== assets.sourceRevision) add('strict-EOF evidence was produced from a different source revision');
        if (ev.gateResult !== 'PASS') add(`strict-EOF evidence gateResult is ${ev.gateResult}, not PASS`);
        if (!Array.isArray(ev.cases) || !['UT-049','UT-050','UT-051','UT-052','UT-053','UT-054'].every((c) => ev.cases.includes(c))) {
          add('strict-EOF evidence does not list all of UT-049..UT-054');
        }
        if (!isSafeRelativePath(ev.gateLogPath)) {
          add('strict-EOF evidence gateLogPath is not a safe relative path');
        } else {
          const logPath = resolve(repo, ev.gateLogPath);
          if (!logPath.startsWith(resolve(repo) + sep) || !existsSync(logPath)) {
            add(`strict-EOF gate log missing: ${ev.gateLogPath}`);
          } else if (sha256File(logPath) !== ev.gateLogSha256) {
            add('strict-EOF gate log digest does not match the evidence');
          } else {
            // re-derive the gate from the log itself, not from evidence fields
            const logText = readFileSync(logPath, 'utf8');
            const markers = ['100% tests passed', 'compression_test', 'cimbar_js_test',
              'UT-049', 'UT-050', 'UT-051', 'UT-052', 'UT-053', 'UT-054', 'testStrictEof'];
            for (const marker of markers) {
              if (!logText.includes(marker)) add(`gate log missing marker: ${marker}`);
            }
          }
        }
      }
    }
  }

  if (failures.length) {
    console.error('ASSET VERIFICATION FAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    return 1;
  }

  console.log('ASSET VERIFICATION PASS');
  console.log(`  assetSetId : ${assets.assetSetId}`);
  console.log(`  revision   : ${assets.sourceRevision}`);
  console.log(`  jsSha256   : ${assets.jsSha256}`);
  console.log(`  wasmSha256 : ${assets.wasmSha256}`);
  console.log(`  evidence   : ${assets.strictEofEvidenceRef}`);
  return 0;
}

process.exit(main());

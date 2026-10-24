// Stage-5 run context: the ONE parser shared by the E2E runner, the media
// recorder and (through its --validate CLI) verify-ux-evidence.py.
//
// The context is the only source of run/staging/fixture/planning roots. There
// is no fallback to the historical run-03 root: without a valid context a tool
// refuses to start. Every path must be a canonical repository-relative path
// and must resolve inside the declared allowed root; a historical run output
// is never accepted, a resume must name the same run identity, and product
// manifests are re-hashed from disk instead of being trusted as labels.
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = resolve(HERE, '..', '..', '..');

export const RUN_CONTEXT_VERSION = 1;
export const ITERATION_ID = 'receiver-ux-v2';
export const PHASES = ['baseline', 'slice', 'metrics', 'media', 'final', 'field'];
export const RUN_CONTEXT_FIELDS = [
  'version', 'iterationId', 'runId', 'attemptId', 'phase',
  'runRoot', 'stagingRoot', 'fixtureRoot', 'planningFile', 'methodFile',
  'productManifest', 'productManifestSha256', 'sourceRevision', 'harnessRevision',
  'inputManifest', 'inputManifestSha256', 'legacyThresholdFile',
];
// Frozen history: read-only forever. A context may never write into these.
export const HISTORICAL_RUN_IDS = [
  '20261018-teamexec-01', '20261019-teamexec-02', '20261021-teamexec-03',
];
const PATH_FIELDS = [
  'runRoot', 'stagingRoot', 'fixtureRoot', 'planningFile', 'methodFile',
  'productManifest', 'inputManifest', 'legacyThresholdFile',
];
const OPTIONAL_PATH_FIELDS = new Set([
  'productManifest', 'inputManifest', 'legacyThresholdFile',
]);
const IDENTITY_FIELDS = ['runId', 'phase', 'productManifestSha256', 'attemptId'];
const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const REVISION_RE = /^[0-9a-f]{7,64}$/;
const SHA_RE = /^[0-9a-f]{64}$/;

export class RunContextError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'RunContextError';
    this.code = code;
  }
}

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function failPath(field, value, why) {
  throw new RunContextError(
    'E_CONTEXT_PATH',
    `${field} is not a canonical repository-relative path (${why}): ${String(value)}`,
  );
}

// A canonical repo-relative path uses forward slashes, has no drive letter,
// no URI scheme, no leading slash and no empty/dot/parent segment.
export function assertCanonicalRepoPath(field, value) {
  if (typeof value !== 'string' || value.length === 0) failPath(field, value, 'empty');
  if (value.includes('\0')) failPath(field, value, 'NUL byte');
  if (/[\u0000-\u001f]/.test(value)) failPath(field, value, 'control character');
  if (value.includes('\\')) failPath(field, value, 'backslash separator');
  if (value.includes('://')) failPath(field, value, 'URI scheme');
  if (/^[A-Za-z]:/.test(value)) failPath(field, value, 'drive letter');
  if (value.startsWith('/')) failPath(field, value, 'absolute path');
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    failPath(field, value, 'empty, dot or parent segment');
  }
  if (value.endsWith('/')) failPath(field, value, 'trailing separator');
}

function lexicallyInside(parent, child) {
  const fold = process.platform === 'win32' ? (text) => text.toLowerCase() : (text) => text;
  const rel = relative(fold(parent), fold(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function realpathNormalized(path) {
  const real = realpathSync.native(path);
  return real.startsWith('\\\\?\\') ? real.slice(4) : real;
}

// Resolve the deepest existing ancestor and require it to be inside the
// declared root's real path. A junction/symlink pointing outside the allowed
// root is therefore refused even when the lexical path looks clean.
function assertRealContained(rootAbs, candidateAbs) {
  let probe = candidateAbs;
  while (!existsSync(probe)) {
    const parent = dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  let rootProbe = rootAbs;
  while (!existsSync(rootProbe)) {
    const parent = dirname(rootProbe);
    if (parent === rootProbe) break;
    rootProbe = parent;
  }
  if (!existsSync(probe) || !existsSync(rootProbe)) return;
  if (!lexicallyInside(realpathNormalized(rootProbe), realpathNormalized(probe))) {
    throw new RunContextError(
      'E_CONTEXT_PATH',
      `resolved path escapes its declared root through a link: ${candidateAbs}`,
    );
  }
}

function absFromRepo(repoRoot, rel) {
  return resolve(repoRoot, ...rel.split('/'));
}

function isHistoricalPath(rel) {
  const folded = foldCase(rel);
  return HISTORICAL_RUN_IDS.some((runId) => (
    folded === `docs/tests/runs/${foldCase(runId)}`
    || folded.startsWith(`docs/tests/runs/${foldCase(runId)}/`)
  ));
}

// T5/S3 (T4 review): the historical guard is case-folded because the host
// filesystem is case-insensitive; a case variant must fail closed.
function foldCase(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function checkManifestPair(raw, fileField, shaField) {
  const file = raw[fileField];
  const sha = raw[shaField];
  if (file === null) {
    if (sha !== null) {
      throw new RunContextError('E_CONTEXT_SHA', `${shaField} must be null when ${fileField} is null`);
    }
    return;
  }
  if (typeof sha !== 'string' || !SHA_RE.test(sha)) {
    throw new RunContextError('E_CONTEXT_SHA', `${shaField} must be 64 lowercase hex characters`);
  }
}

function checkIdentityFields(raw) {
  if (typeof raw.runId !== 'string' || !RUN_ID_RE.test(raw.runId)) {
    throw new RunContextError('E_CONTEXT_RUN_ID', `runId has an invalid shape: ${String(raw.runId)}`);
  }
  if (typeof raw.attemptId !== 'string' || !RUN_ID_RE.test(raw.attemptId)) {
    throw new RunContextError('E_CONTEXT_ATTEMPT_ID', `attemptId has an invalid shape: ${String(raw.attemptId)}`);
  }
  for (const field of ['sourceRevision', 'harnessRevision']) {
    if (typeof raw[field] !== 'string' || !REVISION_RE.test(raw[field])) {
      throw new RunContextError('E_CONTEXT_REVISION', `${field} must be a 7-64 character lowercase hex revision`);
    }
  }
}

function checkStructuredRoots(raw) {
  const expectedRunRoot = `docs/tests/runs/${raw.runId}`;
  if (raw.runRoot !== expectedRunRoot) {
    throw new RunContextError(
      'E_CONTEXT_RUN_ROOT',
      `runRoot must be exactly ${expectedRunRoot} (got ${raw.runRoot})`,
    );
  }
  const stagingPrefix = `build-desktop-recv/runs/${raw.runId}`;
  const stagingRoot = raw.stagingRoot;
  if (stagingRoot === 'build-desktop-recv/staging' || stagingRoot.startsWith('build-desktop-recv/staging/')) {
    throw new RunContextError(
      'E_CONTEXT_STAGING_ROOT',
      `stagingRoot may not be the shared staging directory: ${stagingRoot}`,
    );
  }
  if (stagingRoot !== stagingPrefix && !stagingRoot.startsWith(`${stagingPrefix}/`)) {
    throw new RunContextError(
      'E_CONTEXT_STAGING_ROOT',
      `stagingRoot must live under ${stagingPrefix} (got ${stagingRoot})`,
    );
  }
  if (!raw.fixtureRoot.startsWith(`${raw.runRoot}/`)) {
    throw new RunContextError(
      'E_CONTEXT_FIXTURE_ROOT',
      `fixtureRoot must be a strict subdirectory of ${raw.runRoot} (got ${raw.fixtureRoot})`,
    );
  }
}

// Parse + validate one run-context.json. Never writes, never spawns.
// options: { repoRoot, resume } (resume is consumed by initializeRunRoot).
export function loadRunContext(contextPath, options = {}) {
  const repoRoot = resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const absoluteContext = resolve(contextPath);
  if (!existsSync(absoluteContext)) {
    throw new RunContextError('E_CONTEXT_MISSING', `run context not found: ${absoluteContext}`);
  }
  let bytes;
  try {
    bytes = readFileSync(absoluteContext);
  } catch (error) {
    throw new RunContextError('E_CONTEXT_MISSING', `run context is not a readable file: ${absoluteContext} (${error.code || error.message})`);
  }
  let raw;
  try {
    raw = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new RunContextError('E_CONTEXT_JSON', `invalid JSON in ${absoluteContext}: ${error.message}`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new RunContextError('E_CONTEXT_JSON', `run context must be a JSON object: ${absoluteContext}`);
  }

  const keys = Object.keys(raw);
  const missing = RUN_CONTEXT_FIELDS.filter((field) => !keys.includes(field));
  const extra = keys.filter((key) => !RUN_CONTEXT_FIELDS.includes(key));
  if (missing.length > 0 || extra.length > 0) {
    throw new RunContextError(
      'E_CONTEXT_FIELDS',
      `run context fields do not match the frozen contract: missing [${missing.join(', ')}] extra [${extra.join(', ')}]`,
    );
  }
  if (raw.version !== RUN_CONTEXT_VERSION) {
    throw new RunContextError('E_CONTEXT_VERSION', `unsupported run context version: ${raw.version}`);
  }
  if (raw.iterationId !== ITERATION_ID) {
    throw new RunContextError('E_CONTEXT_ITERATION', `unexpected iterationId: ${raw.iterationId}`);
  }
  checkIdentityFields(raw);
  if (!PHASES.includes(raw.phase)) {
    throw new RunContextError('E_CONTEXT_PHASE', `unknown phase '${raw.phase}'; expected one of ${PHASES.join(', ')}`);
  }
  for (const field of PATH_FIELDS) {
    const value = raw[field];
    if (value === null && OPTIONAL_PATH_FIELDS.has(field)) continue;
    assertCanonicalRepoPath(field, value);
  }
  checkManifestPair(raw, 'productManifest', 'productManifestSha256');
  checkManifestPair(raw, 'inputManifest', 'inputManifestSha256');
  checkStructuredRoots(raw);
  if (HISTORICAL_RUN_IDS.some((id) => foldCase(id) === foldCase(raw.runId))) {
    throw new RunContextError(
      'E_CONTEXT_HISTORY',
      `runId ${raw.runId} is a historical run; historical outputs are read-only`,
    );
  }
  for (const field of PATH_FIELDS) {
    if (raw[field] !== null && isHistoricalPath(raw[field])) {
      throw new RunContextError(
        'E_CONTEXT_HISTORY',
        `${field} points into a historical run: ${raw[field]}`,
      );
    }
  }

  const absolute = {};
  for (const field of PATH_FIELDS) {
    absolute[field] = raw[field] === null ? null : absFromRepo(repoRoot, raw[field]);
  }
  return Object.freeze({
    ...raw,
    repoRoot,
    contextPath: absoluteContext,
    contextSha256: sha256(bytes),
    abs: Object.freeze(absolute),
  });
}

// The identity printed by --validate/--validate-only. Runner and recorder
// print this exact object, which is how tests prove they share one parser.
export function describeContext(context) {
  return {
    version: context.version,
    iterationId: context.iterationId,
    runId: context.runId,
    attemptId: context.attemptId,
    phase: context.phase,
    runRoot: context.runRoot,
    stagingRoot: context.stagingRoot,
    fixtureRoot: context.fixtureRoot,
    productManifestSha256: context.productManifestSha256,
    contextSha256: context.contextSha256,
  };
}

function contextJsonText(context) {
  const ordered = {};
  for (const field of RUN_CONTEXT_FIELDS) ordered[field] = context[field];
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

function readStoredIdentity(storedPath) {
  const stored = JSON.parse(readFileSync(storedPath, 'utf8'));
  return stored;
}

function compareIdentity(stored, context) {
  const mismatches = [];
  for (const field of IDENTITY_FIELDS) {
    if (stored[field] !== context[field]) {
      mismatches.push(`${field} (stored ${String(stored[field])}, requested ${String(context[field])})`);
    }
  }
  return mismatches;
}

// Create the run root for a fresh execution, or accept an existing root only
// when it stores the SAME identity (or an explicit resume names it). A root
// that belongs to another attempt/build is never overwritten.
export function initializeRunRoot(context, options = {}) {
  const runRootAbs = context.abs.runRoot;
  const storedPath = join(runRootAbs, 'run-context.json');
  if (existsSync(storedPath)) {
    let stored;
    try {
      stored = readStoredIdentity(storedPath);
    } catch (error) {
      throw new RunContextError('E_CONTEXT_RESUME_MISSING', `stored run context is unreadable: ${storedPath}`);
    }
    const mismatches = compareIdentity(stored, context);
    if (mismatches.length > 0) {
      if (!options.resume) {
        throw new RunContextError(
          'E_CONTEXT_RUN_EXISTS',
          `run root ${context.runRoot} already belongs to a different run identity (${mismatches.join('; ')}); an explicit resume is required`,
        );
      }
      throw new RunContextError(
        'E_CONTEXT_RESUME_MISMATCH',
        `resume identity mismatch: ${mismatches.join('; ')}`,
      );
    }
    return { created: false, resumed: Boolean(options.resume) };
  }
  if (existsSync(runRootAbs) && readdirSync(runRootAbs).length > 0) {
    if (options.resume) {
      throw new RunContextError(
        'E_CONTEXT_RESUME_MISSING',
        `run root ${context.runRoot} has no stored run-context.json to resume`,
      );
    }
    throw new RunContextError(
      'E_CONTEXT_RUN_EXISTS',
      `run root ${context.runRoot} already exists and is not empty`,
    );
  }
  mkdirSync(runRootAbs, { recursive: true });
  writeFileSync(storedPath, contextJsonText(context));
  return { created: true, resumed: false };
}

// proof/<caseId>/<attemptId>/ is immutable: an existing attempt is never
// reopened, so an older attempt's originals cannot be overwritten.
export function ensureAttemptDir(context, caseId, attemptId) {
  for (const [name, value] of [['caseId', caseId], ['attemptId', attemptId]]) {
    if (typeof value !== 'string' || !RUN_ID_RE.test(value)) {
      throw new RunContextError('E_CONTEXT_PATH', `invalid ${name} for a proof directory: ${String(value)}`);
    }
  }
  const rel = `proof/${caseId}/${attemptId}`;
  const dir = resolveRunPath(context, rel, { root: 'runRoot' });
  if (existsSync(dir)) {
    throw new RunContextError('E_ATTEMPT_EXISTS', `attempt directory already exists and is never overwritten: ${rel}`);
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Resolve a path inside one of the context roots, refusing escapes both
// lexically (../, drive, URI, backslash) and through existing links.
export function resolveRunPath(context, relativePath, options = {}) {
  const rootName = options.root || 'runRoot';
  const rootAbs = context.abs[rootName];
  if (!rootAbs) {
    throw new RunContextError('E_CONTEXT_ROOT', `unknown or null context root: ${rootName}`);
  }
  assertCanonicalRepoPath('path', relativePath);
  const candidate = resolve(rootAbs, ...relativePath.split('/'));
  if (!lexicallyInside(rootAbs, candidate)) {
    throw new RunContextError('E_CONTEXT_PATH', `resolved path escapes ${rootName}: ${relativePath}`);
  }
  assertRealContained(rootAbs, candidate);
  return candidate;
}

// Re-hash the real product files under stagingRoot and compare them with the
// manifest entries. The manifest's own digest is recomputed too: editing the
// JSON without updating the run context is refused.
export function verifyProductManifest(context) {
  if (!context.productManifest || context.productManifestSha256 === null) {
    throw new RunContextError('E_MANIFEST_MISSING', 'the run context does not bind a product manifest');
  }
  const manifestPath = context.abs.productManifest;
  if (!existsSync(manifestPath)) {
    throw new RunContextError('E_MANIFEST_MISSING', `product manifest not found: ${context.productManifest}`);
  }
  const bytes = readFileSync(manifestPath);
  const actualSha = sha256(bytes);
  if (actualSha !== context.productManifestSha256) {
    throw new RunContextError(
      'E_MANIFEST_SHA',
      `product manifest SHA-256 does not match the run context (disk ${actualSha.slice(0, 12)}... vs context ${context.productManifestSha256.slice(0, 12)}...)`,
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new RunContextError('E_MANIFEST_FORMAT', `product manifest is not valid JSON: ${error.message}`);
  }
  if (!manifest || manifest.version !== RUN_CONTEXT_VERSION || manifest.iterationId !== ITERATION_ID) {
    throw new RunContextError('E_MANIFEST_FORMAT', 'product manifest version/iterationId do not match the frozen contract');
  }
  assertCanonicalRepoPath('productManifest.base', manifest.base);
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new RunContextError('E_MANIFEST_FORMAT', 'product manifest needs a non-empty files array');
  }
  const seen = new Set();
  for (const entry of manifest.files) {
    if (!entry || typeof entry !== 'object') {
      throw new RunContextError('E_MANIFEST_FORMAT', 'product manifest entries must be objects');
    }
    assertCanonicalRepoPath('productManifest.files.path', entry.path);
    if (seen.has(entry.path)) {
      throw new RunContextError('E_MANIFEST_FORMAT', `duplicate file entry: ${entry.path}`);
    }
    seen.add(entry.path);
    if (typeof entry.sha256 !== 'string' || !SHA_RE.test(entry.sha256)) {
      throw new RunContextError('E_MANIFEST_FORMAT', `file entry needs a 64-hex sha256: ${entry.path}`);
    }
  }
  const paths = manifest.files.map((entry) => entry.path);
  for (let index = 1; index < paths.length; index += 1) {
    if (!(paths[index - 1] < paths[index])) {
      throw new RunContextError(
        'E_MANIFEST_FORMAT',
        `files must be sorted by path: '${paths[index - 1]}' then '${paths[index]}'`,
      );
    }
  }
  const baseAbs = resolveRunPath(context, manifest.base, { root: 'stagingRoot' });
  const files = [];
  for (const entry of manifest.files) {
    const fileAbs = join(baseAbs, ...entry.path.split('/'));
    if (!lexicallyInside(baseAbs, fileAbs)) {
      throw new RunContextError('E_CONTEXT_PATH', `manifest file escapes the base directory: ${entry.path}`);
    }
    assertRealContained(baseAbs, fileAbs);
    if (!existsSync(fileAbs) || !statSync(fileAbs).isFile()) {
      throw new RunContextError('E_MANIFEST_FILE', `product file not found under staging: ${entry.path}`);
    }
    const hash = sha256(readFileSync(fileAbs));
    if (hash !== entry.sha256) {
      throw new RunContextError('E_MANIFEST_FILE', `product file SHA-256 mismatch: ${entry.path}`);
    }
    files.push({ path: entry.path, sha256: entry.sha256, bytes: entry.bytes, abs: fileAbs });
  }
  return { manifest, files, manifestPath, manifestSha256: actualSha };
}

// T5/S5 (T4 review): the verified sender package is copied READ-ONLY into
// <stagingRoot>/sender before any server starts. Its delivery manifest is
// re-checked file by file, and an existing staging copy from a different
// package is never silently overwritten.
function defaultSenderPackage(repoRoot) {
  const productDir = join(repoRoot, 'product');
  if (!existsSync(productDir)) {
    throw new RunContextError('E_SENDER_PACKAGE', `no product/ directory under ${repoRoot}`);
  }
  const candidates = readdirSync(productDir)
    .filter((name) => name.startsWith('cimbar-sender-') && !name.endsWith('.zip'))
    .filter((name) => statSync(join(productDir, name)).isDirectory())
    .sort();
  if (candidates.length === 0) {
    throw new RunContextError('E_SENDER_PACKAGE', 'no verified cimbar-sender package under product/');
  }
  return join(productDir, candidates[candidates.length - 1]);
}

function readSenderManifest(sourceDir) {
  const manifestPath = join(sourceDir, 'DELIVERY-MANIFEST.txt');
  if (!existsSync(manifestPath)) {
    throw new RunContextError('E_SENDER_MANIFEST', `sender package has no DELIVERY-MANIFEST.txt: ${sourceDir}`);
  }
  const manifestBytes = readFileSync(manifestPath);
  const entries = [];
  for (const line of manifestBytes.toString('utf8').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const match = /^([0-9a-f]{64})\s+(\d+)\s+(.+)$/.exec(line.trim());
    if (!match) throw new RunContextError('E_SENDER_MANIFEST', `unparsable delivery manifest line: ${line}`);
    const rel = match[3].trim().replace(/\\/g, '/');
    assertCanonicalRepoPath('DELIVERY-MANIFEST entry', rel);
    entries.push({ path: rel, sha256: match[1], bytes: Number(match[2]) });
  }
  if (entries.length === 0) throw new RunContextError('E_SENDER_MANIFEST', 'sender delivery manifest is empty');
  return { manifestPath, manifestSha256: sha256(manifestBytes), entries };
}

export function stageVerifiedSender(context, options = {}) {
  const sourceDir = resolve(options.sourceDir || defaultSenderPackage(context.repoRoot));
  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    throw new RunContextError('E_SENDER_PACKAGE', `verified sender package not found: ${sourceDir}`);
  }
  if (lexicallyInside(sourceDir, context.abs.runRoot) || lexicallyInside(sourceDir, context.abs.stagingRoot)) {
    throw new RunContextError('E_SENDER_PACKAGE', 'the sender source may not live inside the run or staging root');
  }
  const { manifestSha256, entries } = readSenderManifest(sourceDir);
  for (const entry of entries) {
    const fileAbs = resolve(sourceDir, ...entry.path.split('/'));
    if (!lexicallyInside(sourceDir, fileAbs)) {
      throw new RunContextError('E_SENDER_MANIFEST', `manifest entry escapes the package: ${entry.path}`);
    }
    if (!existsSync(fileAbs) || !statSync(fileAbs).isFile()) {
      throw new RunContextError('E_SENDER_MANIFEST', `sender file missing: ${entry.path}`);
    }
    if (sha256(readFileSync(fileAbs)) !== entry.sha256) {
      throw new RunContextError('E_SENDER_MANIFEST', `sender file SHA-256 mismatch: ${entry.path}`);
    }
  }
  return stageSenderEntries(context, sourceDir, manifestSha256, entries);
}

function stageSenderEntries(context, sourceDir, manifestSha256, entries) {
  const targetDir = join(context.abs.stagingRoot, 'sender');
  const markerPath = join(targetDir, '.sender-staged.json');
  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    let marker = null;
    try { marker = JSON.parse(readFileSync(markerPath, 'utf8')); } catch { marker = null; }
    if (!marker || marker.sourceManifestSha256 !== manifestSha256) {
      throw new RunContextError('E_SENDER_STAGED_MISMATCH', `staging already holds a different sender copy: ${targetDir}`);
    }
    for (const entry of entries) {
      const fileAbs = join(targetDir, ...entry.path.split('/'));
      if (!existsSync(fileAbs) || sha256(readFileSync(fileAbs)) !== entry.sha256) {
        throw new RunContextError('E_SENDER_STAGED_MISMATCH', `staged sender file drifted: ${entry.path}`);
      }
    }
    return {
      reused: true, sourceDir, targetDir,
      files: entries.map((entry) => entry.path), sourceManifestSha256: manifestSha256,
    };
  }
  mkdirSync(targetDir, { recursive: true });
  for (const entry of entries) {
    const sourceAbs = resolve(sourceDir, ...entry.path.split('/'));
    const targetAbs = join(targetDir, ...entry.path.split('/'));
    mkdirSync(dirname(targetAbs), { recursive: true });
    writeFileSync(targetAbs, readFileSync(sourceAbs));
  }
  writeFileSync(markerPath, `${JSON.stringify({ version: 1, sourceManifestSha256: manifestSha256, files: entries }, null, 2)}\n`);
  return {
    reused: false, sourceDir, targetDir,
    files: entries.map((entry) => entry.path), sourceManifestSha256: manifestSha256,
  };
}

// Baseline and candidate (or any two builds) may never share a run or
// staging root; equal or nested roots are refused.
export function assertDistinctContexts(...contexts) {
  const list = contexts.length === 1 && Array.isArray(contexts[0]) ? contexts[0] : contexts;
  for (let left = 0; left < list.length; left += 1) {
    for (let right = left + 1; right < list.length; right += 1) {
      for (const field of ['runRoot', 'stagingRoot']) {
        const a = list[left].abs[field];
        const b = list[right].abs[field];
        const equal = a === b || (lexicallyInside(a, b) && lexicallyInside(b, a));
        if (equal) {
          throw new RunContextError(
            'E_CONTEXT_ROOTS_EQUAL',
            `${field} is the same for two builds: ${list[left][field]} vs ${list[right][field]}`,
          );
        }
        if (lexicallyInside(a, b) || lexicallyInside(b, a)) {
          throw new RunContextError(
            'E_CONTEXT_ROOTS_OVERLAP',
            `${field} overlaps between two builds: ${list[left][field]} vs ${list[right][field]}`,
          );
        }
      }
    }
  }
  return true;
}

const HELP = `usage: node run-context.mjs --validate <run-context.json> [--repo-root <dir>]

  --validate <file>   parse + validate a run context; prints its canonical
                      identity JSON on stdout. No file is written and no
                      process is started.
  --repo-root <dir>   resolve repository-relative paths against <dir>
                      (defaults to this checkout; used by fixture tests).
  --help              this text.

  Exit: 0 valid, 2 bad arguments, 3 invalid/missing context.`;

function parseCliArgs(argv) {
  const result = { help: false, validate: null, repoRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') { result.help = true; continue; }
    if (arg === '--validate' || arg === '--repo-root') {
      const value = argv[index + 1];
      if (!value) return { error: `${arg} needs a value` };
      if (arg === '--validate') result.validate = value;
      else result.repoRoot = value;
      index += 1;
      continue;
    }
    return { error: `unknown argument: ${arg}` };
  }
  return result;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed.error) {
    console.error(parsed.error);
    console.error(HELP);
    process.exit(2);
  }
  if (parsed.help) {
    console.log(HELP);
    process.exit(0);
  }
  if (!parsed.validate) {
    console.error('--validate <run-context.json> is required');
    console.error(HELP);
    process.exit(2);
  }
  try {
    const context = loadRunContext(parsed.validate, { repoRoot: parsed.repoRoot });
    // --validate output is for other tools (verify-ux-evidence.py): the
    // identity plus the resolved absolute roots. The runner/recorder keep
    // printing describeContext() only for --validate-only.
    const raw = {};
    for (const field of RUN_CONTEXT_FIELDS) raw[field] = context[field];
    console.log(JSON.stringify({
      identity: describeContext(context),
      context: raw,
      repoRoot: context.repoRoot,
      contextPath: context.contextPath,
      abs: context.abs,
    }));
  } catch (error) {
    console.error(error && error.message ? error.message : String(error));
    process.exit(3);
  }
}




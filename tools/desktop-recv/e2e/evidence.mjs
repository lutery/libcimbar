// Evidence writer for the real E2E run. Records follow the frozen vocabulary
// (web/desktop-recv/src/evidence.js); a file_roundtrip PASS record lists the
// reference and received byte artifacts as proofRefs[0] and [1], which is
// exactly what verify-evidence.py re-hashes.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function readResults(runDir) {
  const path = join(runDir, 'results.json');
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeResults(runDir, records) {
  mkdirSync(runDir, { recursive: true });
  const path = join(runDir, 'results.json');
  writeFileSync(path, `${JSON.stringify(records, null, 2)}\n`);
  return path;
}

// Insert or replace one case record (last write wins inside this tool; the
// gate treats duplicate ids in the file as a violation, so we keep one).
export function upsertResult(runDir, record) {
  const records = readResults(runDir).filter((entry) => entry.caseId !== record.caseId);
  records.push(record);
  records.sort((a, b) => String(a.caseId).localeCompare(String(b.caseId), 'en', { numeric: true }));
  writeResults(runDir, records);
  return record;
}

// Copy a byte artifact into the run dir (proof/<caseId>/...) and return the
// run-relative path.
export function copyArtifact(runDir, caseId, sourcePath, targetName) {
  const targetDir = join(runDir, 'proof', caseId);
  mkdirSync(targetDir, { recursive: true });
  const target = join(targetDir, targetName);
  writeFileSync(target, readFileSync(sourcePath));
  return { rel: `proof/${caseId}/${targetName}`, abs: target, sha256: sha256File(target), bytes: statSync(target).size };
}

export function writeProof(runDir, caseId, name, content) {
  const targetDir = join(runDir, 'proof', caseId);
  mkdirSync(targetDir, { recursive: true });
  const target = join(targetDir, name);
  writeFileSync(target, content);
  return `proof/${caseId}/${name}`;
}

// A file roundtrip record: PASS with real artifacts and external hashes.
export function roundtripRecord({ caseId, originalPath, receivedPath, runDir, notes = '', extra = {} }) {
  const original = copyArtifact(runDir, caseId, originalPath, 'original.bin');
  const received = copyArtifact(runDir, caseId, receivedPath, 'received.bin');
  const equal = original.sha256 === received.sha256;
  return {
    caseId,
    scope: 'local_simulated',
    caseType: 'file_roundtrip',
    result: equal ? 'PASS' : 'FAIL',
    executedBy: 'executor',
    referenceSha256: original.sha256,
    receivedSha256: received.sha256,
    proofRefs: [original.rel, received.rel],
    notes: notes || (equal
      ? `external SHA-256 equal (${original.bytes} bytes)`
      : `external SHA-256 differ (${original.sha256} vs ${received.sha256})`),
    ...extra,
  };
}

// A lifecycle/negative record with screenshots/logs as proof.
export function lifecycleRecord({ caseId, result, runDir, proofFiles = [], notes = '', extra = {} }) {
  return {
    caseId,
    scope: 'local_simulated',
    caseType: 'negative_or_lifecycle',
    result,
    executedBy: 'executor',
    proofRefs: proofFiles,
    notes,
    ...extra,
  };
}

export function ensureDir(path) {
  mkdirSync(dirname(path), { recursive: true });
}

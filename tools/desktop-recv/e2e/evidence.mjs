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

// Round-3 S-1 / A-R2: records may carry a per-invocation attempt identity
// and a nested measurement block. Both are additive: the frozen top-level
// vocabulary (scope/caseType/result/executedBy/hashes/proofRefs) is written
// exactly as before, and NOT_RUN rules stay keyed on their own fields.
function attachAttemptFields(record, { attemptId, measurement } = {}) {
  if (attemptId !== undefined && attemptId !== null) record.attemptId = attemptId;
  if (measurement !== undefined && measurement !== null) record.measurement = measurement;
  return record;
}

// A file roundtrip record: PASS with real artifacts and external hashes.
// Round-5: extraProofRefs appends more on-disk proof references AFTER the
// canonical pair (proofRefs[0] stays the original, [1] the received file),
// so a journey can attach the manifest/prefix/timeline proof without
// breaking the artifact convention the gate re-hashes.
export function roundtripRecord({
  caseId, originalPath, receivedPath, runDir, notes = '', extra = {},
  attemptId, measurement, extraProofRefs = [],
}) {
  const original = copyArtifact(runDir, caseId, originalPath, 'original.bin');
  const received = copyArtifact(runDir, caseId, receivedPath, 'received.bin');
  const equal = original.sha256 === received.sha256;
  return attachAttemptFields({
    caseId,
    scope: 'local_simulated',
    caseType: 'file_roundtrip',
    result: equal ? 'PASS' : 'FAIL',
    executedBy: 'executor',
    referenceSha256: original.sha256,
    receivedSha256: received.sha256,
    proofRefs: [original.rel, received.rel, ...extraProofRefs],
    notes: notes || (equal
      ? `external SHA-256 equal (${original.bytes} bytes)`
      : `external SHA-256 differ (${original.sha256} vs ${received.sha256})`),
    ...extra,
  }, { attemptId, measurement });
}

// A lifecycle/negative record with screenshots/logs as proof.
export function lifecycleRecord({
  caseId, result, runDir, proofFiles = [], notes = '', extra = {}, attemptId, measurement,
}) {
  return attachAttemptFields({
    caseId,
    scope: 'local_simulated',
    caseType: 'negative_or_lifecycle',
    result,
    executedBy: 'executor',
    proofRefs: proofFiles,
    notes,
    ...extra,
  }, { attemptId, measurement });
}

export function ensureDir(path) {
  mkdirSync(dirname(path), { recursive: true });
}

// Round-12 S-1: per-leg execution attribution, applied at the FINAL record
// write (the S-1 attempt wrapper in run-e2e.mjs). A leg that already carries
// executedInAttempt was executed in an earlier attempt (carried through a
// --legs merge) and keeps its origin; a freshly executed leg receives the
// current attempt id. The record-level attemptId names the attempt that
// wrote the record (the merge attempt), never the carried executions.
// Mutates and returns the record; a record without legs is returned as-is.
export function stampLegAttempts(record, attemptId) {
  const legs = record && record.measurement && Array.isArray(record.measurement.legs)
    ? record.measurement.legs : [];
  for (const leg of legs) {
    if (leg && !leg.executedInAttempt) leg.executedInAttempt = attemptId;
  }
  return record;
}

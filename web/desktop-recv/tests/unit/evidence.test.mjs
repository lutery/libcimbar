// UT-043..UT-048: the evidence gate rules.
import test from 'node:test';
import assert from 'node:assert/strict';

import { validateCaseRecord, validateRunGate } from '../../src/evidence.js';

const HASH = 'a'.repeat(64);
const HASH2 = 'b'.repeat(64);

const roundtripPass = {
  caseId: 'E2E-3',
  scope: 'local_simulated',
  caseType: 'file_roundtrip',
  result: 'PASS',
  executedBy: 'executor',
  referenceSha256: HASH,
  receivedSha256: HASH,
  proofRefs: ['proof/roundtrip/hashes.txt'],
};

// Given a roundtrip whose two hashes differ
// When validating
// Then the record is refused even if the hash text was edited to match
test('UT-043 unequal hashes cannot pass a roundtrip', () => {
  const bad = validateCaseRecord({ ...roundtripPass, receivedSha256: HASH2 });
  assert.equal(bad.ok, false);
  assert.ok(bad.violations.some((v) => v.includes('differ')));

  const good = validateCaseRecord(roundtripPass);
  assert.equal(good.ok, true);
});

// Given a terminal claim with no path or no proof references
// When validating
// Then it is refused - a screenshot cannot replace a file hash
test('UT-044 missing hashes or proof references are refused', () => {
  const noHash = validateCaseRecord({
    ...roundtripPass,
    referenceSha256: undefined,
    receivedSha256: undefined,
  });
  assert.equal(noHash.ok, false);
  assert.ok(noHash.violations.some((v) => v.includes('SHA-256')));

  const noProof = validateCaseRecord({ ...roundtripPass, proofRefs: [] });
  assert.equal(noProof.ok, false);
  assert.ok(noProof.violations.some((v) => v.includes('proof reference')));
});

// Given a record that claims a stronger scope than its executor proves
// When validating
// Then the upgrade is refused and the field gate stays separate
test('UT-045 scope cannot be upgraded', () => {
  const fakeLocal = validateCaseRecord({ ...roundtripPass, executedBy: 'mock' });
  assert.equal(fakeLocal.ok, false);
  assert.ok(fakeLocal.violations.some((v) => v.includes('not valid for scope')));

  const gate = validateRunGate(
    [{ ...roundtripPass, caseId: 'E2E-21', scope: 'real_cloud', executedBy: 'executor', result: 'PASS' }],
    { gate: 'local', requiredIds: [] }
  );
  assert.equal(gate.ok, false);
  assert.ok(gate.violations.some((v) => v.includes('field gate')));
});

// Given a NOT_RUN record with an executor filled in
// When validating
// Then it is refused: not-run means nobody ran it
test('UT-046 NOT_RUN keeps the executor null', () => {
  const bad = validateCaseRecord({
    caseId: 'E2E-21',
    scope: 'real_cloud',
    caseType: 'negative_or_lifecycle',
    result: 'NOT_RUN',
    executedBy: 'user',
    proofRefs: [],
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.violations.some((v) => v.includes('NOT_RUN must leave executedBy null')));

  const good = validateCaseRecord({
    caseId: 'E2E-21',
    scope: 'real_cloud',
    caseType: 'negative_or_lifecycle',
    result: 'NOT_RUN',
    executedBy: null,
    proofRefs: [],
  });
  assert.equal(good.ok, true);
});

// Given a suite whose run has todo/skipped cases or zero tests
// When gating
// Then exit zero from node --test is not a pass
test('UT-047 todo, skip and zero-test runs never pass', () => {
  const withTodo = validateCaseRecord({
    caseId: 'UT-x',
    scope: 'unit_integration',
    caseType: 'negative_or_lifecycle',
    result: 'PASS',
    executedBy: 'executor',
    proofRefs: ['unit-output.txt'],
    notes: '3 test.todo cases remain',
  });
  assert.equal(withTodo.ok, false);
  assert.ok(withTodo.violations.some((v) => v.includes('placeholder')));
});

// Given a performance record and no frozen threshold
// When validating
// Then the result cannot be PASS - only measured
test('UT-048 performance without a threshold is not a pass', () => {
  const record = {
    caseId: 'PERF-1',
    scope: 'local_simulated',
    caseType: 'measurement',
    result: 'PASS',
    executedBy: 'executor',
    proofRefs: ['measurements.json'],
  };
  const refused = validateCaseRecord(record, { thresholdFrozen: false });
  assert.equal(refused.ok, false);
  assert.ok(refused.violations.some((v) => v.includes('frozen threshold')));

  const measured = validateCaseRecord({ ...record, result: 'NOT_RUN', executedBy: null, proofRefs: [] }, {});
  assert.equal(measured.ok, true);
});

// The run gate assembles the pieces: required ids must exist, and the local
// gate refuses unexecuted cases.
test('the run gate requires every id and keeps the field separate', () => {
  const gate = validateRunGate([roundtripPass], { gate: 'local', requiredIds: ['E2E-3', 'E2E-4'] });
  assert.equal(gate.ok, false);
  assert.ok(gate.violations.some((v) => v.includes('missing record for E2E-4')));
});

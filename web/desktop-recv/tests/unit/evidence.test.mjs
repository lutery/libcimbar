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
  const gate = validateRunGate([roundtripPass], {
    gate: 'local',
    required: [
      { id: 'E2E-3', scope: 'local_simulated', executor: 'executor', caseType: 'file_roundtrip' },
      { id: 'E2E-4', scope: 'local_simulated', executor: 'executor', caseType: 'file_roundtrip' },
    ],
    artifactsVerified: { 'E2E-3': { reference: HASH, received: HASH } },
  });
  assert.equal(gate.ok, false);
  assert.ok(gate.violations.some((v) => v.includes('missing record for E2E-4')));
});

// --- Round-1 external review A-04/B-S01: a gate is a claim about work ---

const plannedLocal = (id) => ({
  id, scope: 'local_simulated', executor: 'executor', caseType: 'file_roundtrip',
});

// Given a required local journey recorded honestly as FAIL
// When gating
// Then the gate is red: FAIL is terminal but never a pass
test('UT-073 a required FAIL does not satisfy the gate', () => {
  const failed = { ...roundtripPass, result: 'FAIL' };
  const gate = validateRunGate([failed], {
    gate: 'local',
    required: [plannedLocal('E2E-3')],
    artifactsVerified: { 'E2E-3': { reference: HASH, received: HASH } },
  });
  assert.equal(gate.ok, false);
  assert.ok(gate.violations.some((v) => v.includes('requires result PASS')));
});

// Given a required local journey recorded under a mocked/unit scope
// When gating
// Then the scope downgrade is refused: a unit test cannot stand in for E2E
test('UT-074 a unit_integration record cannot stand in for a local journey', () => {
  const mocked = {
    caseId: 'E2E-3',
    scope: 'unit_integration',
    caseType: 'negative_or_lifecycle',
    result: 'PASS',
    executedBy: 'executor',
    proofRefs: ['unit-output.txt'],
  };
  const gate = validateRunGate([mocked], { gate: 'local', required: [plannedLocal('E2E-3')] });
  assert.equal(gate.ok, false);
  assert.ok(gate.violations.some((v) => v.includes('scope must be local_simulated')));
});

// Given a field gate over NOT_RUN placeholders
// When gating
// Then it fails: an unexecuted field stays unexecuted, never a green gate
test('UT-075 a field gate over NOT_RUN placeholders fails', () => {
  const placeholder = {
    caseId: 'E2E-21',
    scope: 'real_cloud',
    caseType: 'negative_or_lifecycle',
    result: 'NOT_RUN',
    executedBy: null,
    proofRefs: [],
  };
  const gate = validateRunGate([placeholder], {
    gate: 'field',
    required: [{
      id: 'E2E-21', scope: 'real_cloud', executor: 'user', caseType: 'negative_or_lifecycle',
    }],
  });
  assert.equal(gate.ok, false);
  assert.ok(gate.violations.some((v) => v.includes('requires result PASS')));
});

// Given a file roundtrip PASS with metadata-equal hashes
// When the gate has no verified on-disk artifacts (or they differ)
// Then the pass is refused; only recomputed equal artifacts satisfy it
test('UT-076 file_roundtrip PASS requires verified on-disk artifacts', () => {
  const required = [plannedLocal('E2E-3')];
  const missing = validateRunGate([roundtripPass], { gate: 'local', required });
  assert.equal(missing.ok, false);
  assert.ok(missing.violations.some((v) => v.includes('verified on-disk artifacts')));

  const mismatched = validateRunGate([roundtripPass], {
    gate: 'local',
    required,
    artifactsVerified: { 'E2E-3': { reference: HASH2, received: HASH } },
  });
  assert.equal(mismatched.ok, false);
  assert.ok(mismatched.violations.some((v) => v.includes('reference artifact hash')));

  const verified = validateRunGate([roundtripPass], {
    gate: 'local',
    required,
    artifactsVerified: { 'E2E-3': { reference: HASH, received: HASH } },
  });
  assert.equal(verified.ok, true, verified.violations.join('; '));
});

// Given a terminal record that does not name its executor
// When validating
// Then it is refused: a null executor cannot skip the scope/proof checks
test('UT-077 a terminal record must name its executor', () => {
  const record = validateCaseRecord({
    caseId: 'E2E-3',
    scope: 'local_simulated',
    caseType: 'negative_or_lifecycle',
    result: 'PASS',
    executedBy: null,
    proofRefs: ['proof/log.txt'],
  });
  assert.equal(record.ok, false);
  assert.ok(record.violations.some((v) => v.includes('must name its executor')));
});

// Given a measurement PASS with an explicitly frozen threshold
// When validating
// Then it is allowed; without the frozen threshold it stays refused
test('UT-078 measurement PASS needs the frozen threshold', () => {
  const record = {
    caseId: 'PERF-1',
    scope: 'local_simulated',
    caseType: 'measurement',
    result: 'PASS',
    executedBy: 'executor',
    proofRefs: ['measurements.json'],
  };
  assert.equal(validateCaseRecord(record, { thresholdFrozen: false }).ok, false);
  assert.equal(validateCaseRecord(record, { thresholdFrozen: true }).ok, true);
});

// Given two records for the same case id
// When gating
// Then the duplicate is a violation instead of silently winning
test('UT-079 duplicate case records are refused', () => {
  const gate = validateRunGate([roundtripPass, { ...roundtripPass, result: 'FAIL' }], {
    gate: 'local',
    required: [plannedLocal('E2E-3')],
    artifactsVerified: { 'E2E-3': { reference: HASH, received: HASH } },
  });
  assert.equal(gate.ok, false);
  assert.ok(gate.violations.some((v) => v.includes('duplicate record for E2E-3')));
});

// Round-7 B-1: the plan declares each journey's type. A record cannot
// relabel a planned file roundtrip as a lifecycle case and keep PASS by
// leaving only a log behind.
test('UT-083 a relabelled caseType cannot pass a planned file roundtrip', () => {
  const relabelled = {
    caseId: 'E2E-3',
    scope: 'local_simulated',
    caseType: 'negative_or_lifecycle',
    result: 'PASS',
    executedBy: 'executor',
    proofRefs: ['proof/log.txt'],
  };
  const gate = validateRunGate([relabelled], {
    gate: 'local',
    required: [plannedLocal('E2E-3')],
  });
  assert.equal(gate.ok, false);
  assert.ok(gate.violations.some((v) => v.includes('caseType must be file_roundtrip per the plan')));
});

// A required scenario whose plan omits the type is refused (fail closed):
// an undeclared type would let any label through.
test('UT-084 a planned scenario without a caseType is refused', () => {
  const gate = validateRunGate([roundtripPass], {
    gate: 'local',
    required: [{ id: 'E2E-3', scope: 'local_simulated', executor: 'executor' }],
    artifactsVerified: { 'E2E-3': { reference: HASH, received: HASH } },
  });
  assert.equal(gate.ok, false);
  assert.ok(gate.violations.some((v) => v.includes('does not declare a caseType')));
});

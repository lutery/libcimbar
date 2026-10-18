// Evidence gate rules (M08). Pure functions: a record is either acceptable
// as claimed or it lists violations. The python tools apply the same rules
// to the run directory; this module is the unit-testable reference.
export const SCOPES = ['unit_integration', 'local_simulated', 'real_cloud', 'document_qa'];
export const RESULTS = ['PASS', 'FAIL', 'NOT_RUN'];
export const TERMINAL_RESULTS = ['PASS', 'FAIL'];

const EXECUTORS = {
  unit_integration: ['executor'],
  local_simulated: ['executor'],
  real_cloud: ['user'],
  document_qa: ['executor'],
};
const CASE_TYPES = ['file_roundtrip', 'negative_or_lifecycle', 'measurement'];

// A record for one planned case. The rules mirror test-plan.md:
// - PASS with a file_roundtrip caseType requires both hashes, equal, and at
//   least one proof reference (a screenshot is not a file hash).
// - NOT_RUN requires the executor and all measurements to be null.
// - Scope cannot be upgraded: a recorded executor must match the scope.
// - Performance cases cannot PASS without a frozen threshold.
export function validateCaseRecord(record, context = {}) {
  const violations = [];
  if (!record) {
    return { ok: false, violations: ['missing record'] };
  }

  const scope = record.scope;
  if (!SCOPES.includes(scope)) violations.push(`unknown scope: ${scope}`);
  if (!RESULTS.includes(record.result)) violations.push(`unknown result: ${record.result}`);
  if (record.caseType && !CASE_TYPES.includes(record.caseType)) {
    violations.push(`caseType ${record.caseType} is outside the frozen vocabulary`);
  }

  const terminal = TERMINAL_RESULTS.includes(record.result);

  if (record.result === 'NOT_RUN') {
    for (const field of ['executedBy', 'elapsedMs', 'processedFps', 'receivedSha256']) {
      if (record[field] !== null && record[field] !== undefined) {
        violations.push(`NOT_RUN must leave ${field} null`);
      }
    }
  }

  if (terminal && (!Array.isArray(record.proofRefs) || record.proofRefs.length < 1)) {
    violations.push('a terminal result needs at least one proof reference');
  }

  if (terminal && record.caseType === 'file_roundtrip') {
    const { originalSha256, receivedSha256 } = record;
    if (typeof originalSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(originalSha256 || '')) {
      violations.push('file_roundtrip PASS/FAIL needs the original SHA-256');
    }
    if (typeof receivedSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(receivedSha256 || '')) {
      violations.push('file_roundtrip PASS/FAIL needs the received SHA-256');
    }
    if (originalSha256 && receivedSha256 && originalSha256 !== receivedSha256 && record.result === 'PASS') {
      violations.push('hashes differ: the roundtrip cannot be PASS');
    }
  }

  if (terminal && scope === 'real_cloud' && record.executedBy !== 'user') {
    violations.push('real_cloud records must be executed by the user');
  }
  if (record.executedBy && Array.isArray(record.proofRefs) === false) {
    violations.push('executed records need proof references');
  }
  if (record.executedBy && EXECUTORS[scope] && !EXECUTORS[scope].includes(record.executedBy)) {
    violations.push(`executedBy ${record.executedBy} is not valid for scope ${scope}`);
  }

  if (record.caseType === 'performance' && record.result === 'PASS' && !context.thresholdFrozen) {
    violations.push('performance cannot PASS without a frozen threshold');
  }

  if (typeof record.notes === 'string' && /TODO|FIXME|placeholder/i.test(record.notes)) {
    violations.push('notes contain placeholder markers');
  }

  return { ok: violations.length === 0, violations };
}

// A whole-run gate: every required id must be recorded, local claims must not
// rest on mocked scopes, and the field gate stays separate.
export function validateRunGate(records, options = {}) {
  const gate = options.gate || 'local';
  const violations = [];

  const required = options.requiredIds || [];
  const byId = new Map(records.map((record) => [record.caseId, record]));

  for (const id of required) {
    const record = byId.get(id);
    if (!record) {
      violations.push(`missing record for ${id}`);
      continue;
    }
    const verdict = validateCaseRecord(record, { thresholdFrozen: options.thresholdFrozen });
    if (!verdict.ok) {
      for (const violation of verdict.violations) violations.push(`${id}: ${violation}`);
    }
    if (gate === 'local' && record.result === 'NOT_RUN') {
      violations.push(`${id}: the local gate requires an executed result`);
    }
  }

  for (const record of records) {
    if (record.scope === 'real_cloud' && record.result !== 'NOT_RUN' && gate === 'local') {
      // field results are recorded in the field gate, never folded in here
      violations.push(`${record.caseId}: real_cloud results belong to the field gate`);
    }
  }

  return { ok: violations.length === 0, violations };
}

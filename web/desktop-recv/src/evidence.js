// Evidence gate rules (M08). Pure functions: a record is either acceptable
// as claimed or it lists violations. The python tool applies the same rules
// to the run directory; this module is the unit-testable reference.
//
// Round-1 external review A-04/B-S01: a valid-looking record is not a pass.
// A gate requires each planned scenario to be PASS with the planned scope
// and executor, real on-disk proof, and (for file roundtrips) recomputed
// artifact hashes. FAIL/NOT_RUN never satisfy a gate, and a mocked scope
// cannot stand in for a local journey.
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
// - a terminal result (PASS or FAIL) must name its executor and carry at
//   least one proof reference; a null executor cannot skip the checks.
// - PASS with a file_roundtrip caseType requires both hashes, equal. The
//   run gate additionally requires the byte artifacts to be verified.
// - NOT_RUN requires the executor and all measurements to be null.
// - Scope cannot be upgraded: a recorded executor must match the scope.
// - A measurement cannot PASS without a frozen threshold.
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
  const proofRefs = Array.isArray(record.proofRefs) ? record.proofRefs : [];

  if (record.result === 'NOT_RUN') {
    for (const field of ['executedBy', 'elapsedMs', 'processedFps', 'receivedSha256']) {
      if (record[field] !== null && record[field] !== undefined) {
        violations.push(`NOT_RUN must leave ${field} null`);
      }
    }
  }

  if (terminal) {
    // A terminal claim must say who ran it; otherwise the scope pairing and
    // the on-disk proof checks could be skipped entirely.
    if (record.executedBy !== 'executor' && record.executedBy !== 'user') {
      violations.push('a terminal result must name its executor (executor|user)');
    }
    if (proofRefs.length < 1) {
      violations.push('a terminal result needs at least one proof reference');
    }
    if (record.caseType === 'file_roundtrip') {
      const { referenceSha256, receivedSha256 } = record;
      if (typeof referenceSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(referenceSha256 || '')) {
        violations.push('file_roundtrip PASS/FAIL needs the reference SHA-256');
      }
      if (typeof receivedSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(receivedSha256 || '')) {
        violations.push('file_roundtrip PASS/FAIL needs the received SHA-256');
      }
      if (referenceSha256 && receivedSha256 && referenceSha256 !== receivedSha256 && record.result === 'PASS') {
        violations.push('hashes differ: the roundtrip cannot be PASS');
      }
    }
  }

  if (terminal && scope === 'real_cloud' && record.executedBy !== 'user') {
    violations.push('real_cloud records must be executed by the user');
  }
  if (record.executedBy && proofRefs.length === 0) {
    violations.push('executed records need proof references');
  }
  if (record.executedBy && EXECUTORS[scope] && !EXECUTORS[scope].includes(record.executedBy)) {
    violations.push(`executedBy ${record.executedBy} is not valid for scope ${scope}`);
  }

  if (record.caseType === 'measurement' && record.result === 'PASS' && !context.thresholdFrozen) {
    violations.push('measurement cannot PASS without a frozen threshold');
  }

  if (typeof record.notes === 'string' && /TODO|FIXME|placeholder/i.test(record.notes)) {
    violations.push('notes contain placeholder markers');
  }

  return { ok: violations.length === 0, violations };
}

// A whole-run gate. Required scenarios carry the scope/executor/caseType the
// plan declared; the gate refuses anything that does not match. For local and
// field runs alike:
// - every required id must be recorded and PASS;
// - scope/executor must equal the planned values;
// - the record's caseType must equal the planned caseType; a record cannot
//   relabel a file roundtrip as a lifecycle case to skip artifact checks;
// - a PLANNED file_roundtrip PASS additionally needs on-disk artifact
//   verification supplied through options.artifactsVerified[id] =
//   {reference, received} (the python tool computes those by hashing the two
//   artifact files);
// - duplicate case ids are a violation;
// - real_cloud results never fold into the local gate.
export function validateRunGate(records, options = {}) {
  const gate = options.gate || 'local';
  const violations = [];

  const fallbackScope = gate === 'local' ? 'local_simulated' : 'real_cloud';
  const fallbackExecutor = gate === 'local' ? 'executor' : 'user';
  const required = options.required
    || (options.requiredIds || []).map((id) => ({
      id, scope: fallbackScope, executor: fallbackExecutor,
    }));

  const byId = new Map();
  for (const record of records) {
    if (byId.has(record.caseId)) {
      violations.push(`duplicate record for ${record.caseId}`);
      continue;
    }
    byId.set(record.caseId, record);
  }

  for (const spec of required) {
    const record = byId.get(spec.id);
    if (!record) {
      violations.push(`missing record for ${spec.id}`);
      continue;
    }
    const verdict = validateCaseRecord(record, { thresholdFrozen: options.thresholdFrozen });
    if (!verdict.ok) {
      for (const violation of verdict.violations) violations.push(`${spec.id}: ${violation}`);
    }
    if (record.result !== 'PASS') {
      violations.push(`${spec.id}: the ${gate} gate requires result PASS (got ${record.result})`);
    }
    const expectedScope = spec.scope || fallbackScope;
    const expectedExecutor = spec.executor || fallbackExecutor;
    if (record.scope !== expectedScope) {
      violations.push(`${spec.id}: scope must be ${expectedScope} for the ${gate} gate (got ${record.scope})`);
    }
    if (record.executedBy !== expectedExecutor) {
      violations.push(`${spec.id}: executedBy must be ${expectedExecutor} for the ${gate} gate (got ${record.executedBy})`);
    }
    if (!spec.caseType) {
      // Fail closed: a required scenario without a planned type could
      // otherwise be relabelled at will.
      violations.push(`${spec.id}: the plan does not declare a caseType`);
    } else if (record.caseType !== spec.caseType) {
      violations.push(`${spec.id}: caseType must be ${spec.caseType} per the plan (got ${record.caseType})`);
    }
    if (spec.caseType === 'file_roundtrip' && record.result === 'PASS') {
      const verified = options.artifactsVerified && options.artifactsVerified[spec.id];
      if (!verified) {
        violations.push(`${spec.id}: file_roundtrip PASS requires verified on-disk artifacts`);
      } else {
        if (verified.reference !== record.referenceSha256) {
          violations.push(`${spec.id}: reference artifact hash does not match the record`);
        }
        if (verified.received !== record.receivedSha256) {
          violations.push(`${spec.id}: received artifact hash does not match the record`);
        }
      }
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

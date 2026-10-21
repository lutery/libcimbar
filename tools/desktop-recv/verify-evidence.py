#!/usr/bin/env python3
"""CMD-09: verify the evidence of a run against the gate rules.

The rules mirror web/desktop-recv/src/evidence.js (the unit-tested
reference); this tool applies them to the run directory on disk.

A gate is a claim about executed work, not about record shape:
  local   E2E-1..20 must each be PASS, scope local_simulated, executed by
          the implementer (executor), with the caseType the plan declared.
          Every planned file_roundtrip PASS must have the reference and
          received byte artifacts on disk, and their SHA-256 values are
          RECOMPUTED here and compared with the record.
  field   E2E-21..26 must each be PASS, scope real_cloud, executed by the
          user, with the planned caseType. A field gate over NOT_RUN
          placeholders fails (exit != 0).

FAIL is never a pass; NOT_RUN is never a pass; a mocked/unit scope never
satisfies a local journey; metadata-equal hashes without real artifacts
are rejected; a record cannot relabel its caseType to skip the artifact
checks the plan requires. A measurement PASS needs an explicitly frozen
threshold (--thresholds <json with {"frozen": true}>).
"""
import argparse
import hashlib
import json
import os
import re
import sys

SCOPES = {"unit_integration", "local_simulated", "real_cloud", "document_qa"}
RESULTS = {"PASS", "FAIL", "NOT_RUN"}
TERMINAL = {"PASS", "FAIL"}
# Frozen receiver-v1 Evidence vocabulary.
EXECUTORS = {
    "unit_integration": {"executor"},
    "local_simulated": {"executor"},
    "real_cloud": {"user"},
    "document_qa": {"executor"},
}
CASE_TYPES = {"file_roundtrip", "negative_or_lifecycle", "measurement"}
GATE_RULES = {
    "local": {"scope": "local_simulated", "executor": "executor"},
    "field": {"scope": "real_cloud", "executor": "user"},
}


def file_sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_record(record, context):
    violations = []
    scope = record.get("scope")
    result = record.get("result")

    if scope not in SCOPES:
        violations.append(f"unknown scope: {scope}")
    if result not in RESULTS:
        violations.append(f"unknown result: {result}")

    case_type = record.get("caseType")
    proof_refs = record.get("proofRefs") or []
    terminal = result in TERMINAL

    if case_type not in CASE_TYPES:
        violations.append(f"caseType {case_type} is outside the frozen vocabulary")

    if result == "NOT_RUN":
        for field in ("executedBy", "elapsedMs", "processedFps", "receivedSha256"):
            if record.get(field) is not None:
                violations.append(f"NOT_RUN must leave {field} null")
    elif terminal:
        # A terminal claim must say who ran it; a null executor cannot skip
        # the scope pairing or the on-disk proof checks.
        if record.get("executedBy") not in ("executor", "user"):
            violations.append("a terminal result must name its executor (executor|user)")
        if not proof_refs:
            violations.append("a terminal result needs at least one proof reference")
        if case_type == "file_roundtrip":
            reference = record.get("referenceSha256") or ""
            received = record.get("receivedSha256") or ""
            if not re.fullmatch(r"[0-9a-f]{64}", reference):
                violations.append("file_roundtrip needs the reference SHA-256")
            if not re.fullmatch(r"[0-9a-f]{64}", received):
                violations.append("file_roundtrip needs the received SHA-256")
            if reference and received and reference != received and result == "PASS":
                violations.append("hashes differ: the roundtrip cannot be PASS")

    executor = record.get("executedBy")
    if executor:
        if not proof_refs:
            violations.append("executed records need proof references")
        if scope in EXECUTORS and executor not in EXECUTORS[scope]:
            violations.append(f"executedBy {executor} is not valid for scope {scope}")

    if case_type == "measurement" and result == "PASS" and not context.get("thresholdFrozen"):
        violations.append("measurement cannot PASS without a frozen threshold")

    notes = record.get("notes") or ""
    if isinstance(notes, str) and re.search(r"TODO|FIXME|placeholder", notes, re.I):
        violations.append("notes contain placeholder markers")

    return violations


def plan_rows(planning_path, gate):
    """Required scenarios from the plan, with their intended scope/executor.

    The plan is the source of truth for what each journey is supposed to be;
    a record cannot silently downgrade its scope or executor.
    """
    with open(planning_path, encoding="utf-8") as handle:
        data = json.load(handle)
    rows = []
    for case in data.get("e2eScenarios") or []:
        case_id = case.get("caseId") or case.get("id") or ""
        match = re.fullmatch(r"E2E-(\d+)", case_id)
        if not match:
            continue
        number = int(match.group(1))
        # E2E-1..20 are the implementer's local journeys; 21..26 are the field
        if not ((gate == "local" and 1 <= number <= 20)
                or (gate == "field" and 21 <= number <= 26)):
            continue
        rows.append({
            "id": case_id,
            "scope": case.get("scope") or GATE_RULES[gate]["scope"],
            "executor": case.get("executorRole") or GATE_RULES[gate]["executor"],
            # The plan declares what kind of journey this is. The gate
            # cross-checks the record against it, so a file roundtrip cannot
            # be relabelled as a lifecycle case to skip the artifact checks.
            "caseType": case.get("caseType"),
        })
    return rows


def verify_artifacts(run_dir, record):
    """Recompute the hashes of the two byte artifacts of a file roundtrip.

    Convention: proofRefs[0] is the original/reference file, proofRefs[1] is
    the received file written by the save path. Metadata-equal hashes are
    not enough; the bytes themselves are hashed here.
    """
    violations = []
    refs = record.get("proofRefs") or []
    if len(refs) < 2:
        return ["file_roundtrip PASS needs the reference and received artifacts "
                "as the first two proofRefs"]
    for label, ref, expected in (
            ("reference", refs[0], record.get("referenceSha256")),
            ("received", refs[1], record.get("receivedSha256"))):
        path = os.path.join(run_dir, ref)
        if not os.path.isfile(path):
            violations.append(f"{label} artifact not found on disk: {ref}")
            continue
        actual = file_sha256(path)
        if actual != expected:
            violations.append(
                f"{label} artifact SHA-256 does not match the record "
                f"(disk {actual[:12]}... vs record {(expected or '')[:12]}...)")
    return violations


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True)
    parser.add_argument("--gate", choices=("local", "field"), default="local")
    parser.add_argument("--planning", default="docs/tests/planning-cases.json")
    parser.add_argument("--thresholds", default=None,
                        help='JSON file with {"frozen": true} once thresholds are confirmed')
    args = parser.parse_args()

    run_dir = args.run
    results_path = os.path.join(run_dir, "results.json")
    if not os.path.isfile(results_path):
        print(f"no results.json in {run_dir}", file=sys.stderr)
        return 2

    with open(results_path, encoding="utf-8") as handle:
        records = json.load(handle)

    threshold_frozen = False
    if args.thresholds:
        with open(args.thresholds, encoding="utf-8") as handle:
            threshold_frozen = bool(json.load(handle).get("frozen"))
    context = {"thresholdFrozen": threshold_frozen}

    rows = plan_rows(args.planning, args.gate)
    if not rows:
        print(f"no required cases for gate {args.gate} in {args.planning}",
              file=sys.stderr)
        return 2

    violations = []

    # Duplicate case ids are a violation: silently keeping the last record
    # would let an earlier PASS be overwritten by whatever came later.
    by_id = {}
    for record in records:
        case_id = record.get("caseId")
        if case_id in by_id:
            violations.append(f"duplicate record for {case_id}")
            continue
        by_id[case_id] = record

    for row in rows:
        case_id = row["id"]
        record = by_id.get(case_id)
        if record is None:
            violations.append(f"missing record for {case_id}")
            continue
        violations.extend(f"{case_id}: {v}" for v in validate_record(record, context))

        if record.get("result") != "PASS":
            violations.append(
                f"{case_id}: the {args.gate} gate requires result PASS "
                f"(got {record.get('result')})")
        if record.get("scope") != row["scope"]:
            violations.append(
                f"{case_id}: scope must be {row['scope']} for the {args.gate} gate "
                f"(got {record.get('scope')})")
        if record.get("executedBy") != row["executor"]:
            violations.append(
                f"{case_id}: executedBy must be {row['executor']} for the "
                f"{args.gate} gate (got {record.get('executedBy')})")
        planned_type = row.get("caseType")
        if not planned_type:
            # Fail closed: a required scenario without a planned type could
            # otherwise be relabelled at will.
            violations.append(f"{case_id}: the plan does not declare a caseType")
        elif record.get("caseType") != planned_type:
            violations.append(
                f"{case_id}: caseType must be {planned_type} per the plan "
                f"(got {record.get('caseType')})")
        # Artifact verification is keyed on the PLANNED type, not the
        # record's own label: even a relabelled record must still produce
        # the byte artifacts its journey promises.
        if planned_type == "file_roundtrip" and record.get("result") == "PASS":
            violations.extend(f"{case_id}: {v}" for v in verify_artifacts(run_dir, record))

    # every claimed proof reference must exist on disk (all records, not just
    # the required journeys)
    for record in records:
        case_id = record.get("caseId")
        for ref in record.get("proofRefs") or []:
            if not os.path.isfile(os.path.join(run_dir, ref)):
                violations.append(f"{case_id}: proof ref not found on disk: {ref}")

    if args.gate == "local":
        for record in records:
            if record.get("scope") == "real_cloud" and record.get("result") not in (None, "NOT_RUN"):
                violations.append(
                    f"{record.get('caseId')}: real_cloud results belong to the field gate")

    if violations:
        print(f"GATE {args.gate}: FAIL ({len(violations)} violation(s))")
        for violation in violations:
            print(f"  - {violation}")
        return 1

    print(f"GATE {args.gate}: PASS ({len(rows)} required cases)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

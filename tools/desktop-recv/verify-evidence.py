#!/usr/bin/env python3
"""CMD-09: verify the evidence of a run against the gate rules.

The rules mirror web/desktop-recv/src/evidence.js (the unit-tested
reference); this tool applies them to the run directory on disk:

  results.json    one record per executed case (or NOT_RUN placeholders)
  planning case ids come from docs/tests/planning-cases.json

Gates:
  local   every local_simulated case in the required set must be executed
          (PASS with valid evidence); real_cloud records must stay NOT_RUN
          here - they belong to the field gate.
  field   the real_cloud cases; everything else is out of scope.

A failing gate is the honest state while cases remain unexecuted; it never
fabricates a pass.
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

    terminal = result in TERMINAL
    proof_refs = record.get("proofRefs") or []

    if record.get("caseType") not in CASE_TYPES:
        violations.append(f"caseType {record.get('caseType')} is outside the frozen vocabulary")

    if result == "NOT_RUN":
        for field in ("executedBy", "elapsedMs", "processedFps", "receivedSha256"):
            value = record.get(field)
            if value not in (None,):
                violations.append(f"NOT_RUN must leave {field} null")
    elif terminal:
        if not proof_refs:
            violations.append("a terminal result needs at least one proof reference")
        if record.get("caseType") == "file_roundtrip":
            reference = record.get("referenceSha256") or ""
            received = record.get("receivedSha256") or ""
            if not re.fullmatch(r"[0-9a-f]{64}", reference):
                violations.append("file_roundtrip needs the reference SHA-256")
            if not re.fullmatch(r"[0-9a-f]{64}", received):
                violations.append("file_roundtrip needs the received SHA-256")
            if (reference and received and reference != received
                    and result == "PASS"):
                violations.append("hashes differ: the roundtrip cannot be PASS")

    executor = record.get("executedBy")
    if executor:
        if not proof_refs:
            violations.append("executed records need proof references")
        if scope in EXECUTORS and executor not in EXECUTORS[scope]:
            violations.append(f"executedBy {executor} is not valid for scope {scope}")

    if record.get("caseType") == "performance" and result == "PASS" and not context.get("thresholdFrozen"):
        violations.append("performance cannot PASS without a frozen threshold")

    notes = record.get("notes") or ""
    if isinstance(notes, str) and re.search(r"TODO|FIXME|placeholder", notes, re.I):
        violations.append("notes contain placeholder markers")

    return violations


def required_ids(planning_path, gate):
    with open(planning_path, encoding="utf-8") as handle:
        data = json.load(handle)
    cases = data.get("e2eScenarios") or []
    wanted = []
    for case in cases:
        case_id = case.get("caseId") or case.get("id") or ""
        match = re.fullmatch(r"E2E-(\d+)", case_id)
        if not match:
            continue
        number = int(match.group(1))
        # E2E-1..20 are the implementer's local journeys; 21..26 are the field
        if (gate == "local" and 1 <= number <= 20) or (gate == "field" and 21 <= number <= 26):
            wanted.append(case_id)
    return wanted


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True)
    parser.add_argument("--gate", choices=("local", "field"), default="local")
    parser.add_argument("--planning", default="docs/tests/planning-cases.json")
    args = parser.parse_args()

    run_dir = args.run
    results_path = os.path.join(run_dir, "results.json")
    if not os.path.isfile(results_path):
        print(f"no results.json in {run_dir}", file=sys.stderr)
        return 2

    with open(results_path, encoding="utf-8") as handle:
        records = json.load(handle)

    violations = []

    by_id = {record.get("caseId"): record for record in records}

    wanted = required_ids(args.planning, args.gate)
    for case_id in wanted:
        record = by_id.get(case_id)
        if record is None:
            violations.append(f"missing record for {case_id}")
            continue
        violations.extend(f"{case_id}: {v}" for v in validate_record(record, {}))

        if args.gate == "local" and record.get("result") == "NOT_RUN":
            violations.append(f"{case_id}: the local gate requires an executed result")

    # every EXECUTED record's proof references must exist on disk (not just
    # the required journey ids)
    for record in records:
        if record.get("executedBy") is None:
            continue
        case_id = record.get("caseId")
        for ref in record.get("proofRefs") or []:
            ref_path = os.path.join(run_dir, ref)
            if not os.path.isfile(ref_path):
                violations.append(f"{case_id}: proof ref not found on disk: {ref}")

    for record in records:
        if record.get("scope") == "real_cloud" and record.get("result") not in (None, "NOT_RUN"):
            if args.gate == "local":
                violations.append(f"{record.get('caseId')}: real_cloud results belong to the field gate")

    if violations:
        print(f"GATE {args.gate}: FAIL ({len(violations)} violation(s))")
        for violation in violations:
            print(f"  - {violation}")
        return 1

    print(f"GATE {args.gate}: PASS ({len(wanted)} required cases)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

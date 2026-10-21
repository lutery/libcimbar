#!/usr/bin/env python3
"""Negative/positive matrix for verify-evidence.py (round-1 review A-04).

Builds throwaway run directories under a temp root and asserts the actual
CLI exit codes:

  verified file roundtrip        -> 0   (positive)
  field lifecycle PASS           -> 0   (positive)
  FAIL record                    -> 1
  NOT_RUN record                 -> 1
  mocked scope standing in       -> 1
  missing proof file             -> 1
  unequal hashes claimed PASS    -> 1
  equal metadata, unequal bytes  -> 1
  measurement PASS, no threshold -> 1
  measurement PASS + frozen      -> 0   (positive)
  field gate over NOT_RUN        -> 1
  duplicate case id              -> 1
  relabelled caseType            -> 1   (round-7 B-1)
  plan without a caseType        -> 1   (round-7 B-1)

The planning fixture declares a caseType for every scenario, matching
docs/tests/planning-cases.json. The gate cross-checks the record against it.

Run: python tools/desktop-recv/verify-evidence-selftest.py
Exit: 0 all cases behaved as required, 1 otherwise.
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
VERIFY = os.path.join(HERE, "verify-evidence.py")
HASH_A = "a" * 64
HASH_B = "b" * 64


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        digest.update(handle.read())
    return digest.hexdigest()


def scenario_planning(path, gate, ids, case_types=None):
    """Write a planning fixture. Defaults mirror the real plan: local
    journeys are file roundtrips, field journeys are lifecycle cases.
    A per-id value overrides; an explicit None omits the field."""
    case_types = case_types or {}
    scenarios = []
    for case_id in ids:
        number = int(case_id.split("-")[1])
        if gate == "local" and number <= 20:
            scope, executor = "local_simulated", "executor"
            default_type = "file_roundtrip"
        else:
            scope, executor = "real_cloud", "user"
            default_type = "negative_or_lifecycle"
        entry = {
            "id": case_id,
            "scope": scope,
            "executorRole": executor,
        }
        if case_id in case_types:
            if case_types[case_id] is not None:
                entry["caseType"] = case_types[case_id]
        else:
            entry["caseType"] = default_type
        scenarios.append(entry)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump({"e2eScenarios": scenarios}, handle)


def run_case(name, records, gate, ids, expect, extra_files=None, thresholds=None,
             case_types=None, expect_text=None):
    root = tempfile.mkdtemp(prefix="evidence-selftest-")
    run_dir = os.path.join(root, "run")
    os.makedirs(run_dir)
    planning = os.path.join(root, "planning.json")
    scenario_planning(planning, gate, ids, case_types)
    with open(os.path.join(run_dir, "results.json"), "w", encoding="utf-8") as handle:
        json.dump(records, handle)
    for relative, content in (extra_files or {}).items():
        target = os.path.join(run_dir, relative)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as handle:
            handle.write(content)
    command = [sys.executable, VERIFY, "--run", run_dir, "--gate", gate,
               "--planning", planning]
    if thresholds:
        command.extend(["--thresholds", thresholds])
    result = subprocess.run(command, capture_output=True, text=True)
    ok = result.returncode == expect
    if expect_text and expect_text not in result.stdout:
        ok = False
    print(f"{'ok  ' if ok else 'FAIL'} {name}: exit={result.returncode} expected={expect}")
    if not ok:
        print(result.stdout)
        print(result.stderr)
    return ok


def main():
    ok = []
    payload = b"same bytes"
    digest = hashlib.sha256(payload).hexdigest()
    verified = {
        "caseId": "E2E-3",
        "scope": "local_simulated",
        "caseType": "file_roundtrip",
        "result": "PASS",
        "executedBy": "executor",
        "referenceSha256": digest,
        "receivedSha256": digest,
        "proofRefs": ["proof/orig.bin", "proof/recv.bin"],
    }
    artifacts = {"proof/orig.bin": payload, "proof/recv.bin": payload}
    ok.append(run_case("verified file roundtrip", [verified], "local", ["E2E-3"], 0,
                       artifacts))

    # A lifecycle journey genuinely planned as lifecycle passes the gate.
    field_lifecycle = {
        "caseId": "E2E-23",
        "scope": "real_cloud",
        "caseType": "negative_or_lifecycle",
        "result": "PASS",
        "executedBy": "user",
        "proofRefs": ["proof/log.txt"],
    }
    ok.append(run_case("field lifecycle PASS", [field_lifecycle], "field", ["E2E-23"], 0,
                       {"proof/log.txt": b"ran"}))

    # Negatives below use the same planned file_roundtrip journey.
    ok.append(run_case("FAIL does not pass", [{**verified, "result": "FAIL"}],
                       "local", ["E2E-3"], 1, artifacts))
    ok.append(run_case("NOT_RUN does not pass", [{**verified, "result": "NOT_RUN",
                                                  "executedBy": None, "proofRefs": []}],
                       "local", ["E2E-3"], 1))
    ok.append(run_case("mocked scope cannot stand in",
                       [{**verified, "scope": "unit_integration"}],
                       "local", ["E2E-3"], 1, artifacts))
    ok.append(run_case("missing proof file", [verified], "local", ["E2E-3"], 1))
    ok.append(run_case("unequal hashes claimed PASS",
                       [{**verified, "referenceSha256": HASH_A, "receivedSha256": HASH_B}],
                       "local", ["E2E-3"], 1, artifacts))
    ok.append(run_case("equal metadata but unequal bytes",
                       [{**verified, "referenceSha256": HASH_A, "receivedSha256": HASH_A,
                         "proofRefs": ["proof/orig.bin", "proof/recv.bin"]}],
                       "local", ["E2E-3"], 1,
                       {"proof/orig.bin": b"original", "proof/recv.bin": b"received"}))

    measurement = {**verified, "caseType": "measurement"}
    measurement_type = {"E2E-3": "measurement"}
    ok.append(run_case("measurement without threshold", [measurement],
                       "local", ["E2E-3"], 1, artifacts, case_types=measurement_type))
    root = tempfile.mkdtemp(prefix="evidence-thresholds-")
    thresholds = os.path.join(root, "thresholds.json")
    with open(thresholds, "w", encoding="utf-8") as handle:
        json.dump({"frozen": True}, handle)
    ok.append(run_case("measurement with frozen threshold", [measurement],
                       "local", ["E2E-3"], 0, artifacts,
                       thresholds=thresholds, case_types=measurement_type))

    field_placeholder = {
        "caseId": "E2E-23",
        "scope": "real_cloud",
        "caseType": "negative_or_lifecycle",
        "result": "NOT_RUN",
        "executedBy": None,
        "proofRefs": [],
    }
    ok.append(run_case("field gate over NOT_RUN", [field_placeholder],
                       "field", ["E2E-23"], 1))
    ok.append(run_case("duplicate case id", [verified, dict(verified)],
                       "local", ["E2E-3"], 1, artifacts))

    # Round-7 B-1: a file roundtrip relabelled as a lifecycle case (log only)
    # must be refused, and so must a plan that does not declare a type.
    relabelled = {
        "caseId": "E2E-3",
        "scope": "local_simulated",
        "caseType": "negative_or_lifecycle",
        "result": "PASS",
        "executedBy": "executor",
        "proofRefs": ["proof/log.txt"],
    }
    ok.append(run_case("relabelled caseType cannot pass", [relabelled],
                       "local", ["E2E-3"], 1, {"proof/log.txt": b"ran"},
                       expect_text="caseType must be file_roundtrip per the plan"))
    ok.append(run_case("plan without a caseType is refused", [verified],
                       "local", ["E2E-3"], 1, artifacts,
                       case_types={"E2E-3": None},
                       expect_text="does not declare a caseType"))

    if all(ok):
        print(f"SELFTEST PASS ({len(ok)} cases)")
        return 0
    print(f"SELFTEST FAIL ({len(ok) - sum(ok)} of {len(ok)} cases)")
    return 1


if __name__ == "__main__":
    sys.exit(main())

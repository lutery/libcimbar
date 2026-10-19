#!/usr/bin/env python3
"""Negative/positive matrix for verify-evidence.py (round-1 review A-04).

Builds throwaway run directories under a temp root and asserts the actual
CLI exit codes:

  PASS record                    -> 0   (positive)
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
  verified file roundtrip        -> 0   (positive)

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


def scenario_planning(path, gate, ids):
    scenarios = []
    for case_id in ids:
        number = int(case_id.split("-")[1])
        if gate == "local" and number <= 20:
            scope, executor = "local_simulated", "executor"
        else:
            scope, executor = "real_cloud", "user"
        scenarios.append({
            "id": case_id,
            "scope": scope,
            "executorRole": executor,
        })
    with open(path, "w", encoding="utf-8") as handle:
        json.dump({"e2eScenarios": scenarios}, handle)


def run_case(name, records, gate, ids, expect, extra_files=None, thresholds=None):
    root = tempfile.mkdtemp(prefix="evidence-selftest-")
    run_dir = os.path.join(root, "run")
    os.makedirs(run_dir)
    planning = os.path.join(root, "planning.json")
    scenario_planning(planning, gate, ids)
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
    print(f"{'ok  ' if ok else 'FAIL'} {name}: exit={result.returncode} expected={expect}")
    if not ok:
        print(result.stdout)
        print(result.stderr)
    return ok


def main():
    good_local = {
        "caseId": "E2E-1",
        "scope": "local_simulated",
        "caseType": "negative_or_lifecycle",
        "result": "PASS",
        "executedBy": "executor",
        "proofRefs": ["proof/log.txt"],
    }
    ok = []
    ok.append(run_case("positive local PASS", [good_local], "local", ["E2E-1"], 0,
                       {"proof/log.txt": b"ran"}))
    ok.append(run_case("FAIL does not pass", [{**good_local, "result": "FAIL"}],
                       "local", ["E2E-1"], 1, {"proof/log.txt": b"ran"}))
    ok.append(run_case("NOT_RUN does not pass", [{**good_local, "result": "NOT_RUN",
                                                  "executedBy": None, "proofRefs": []}],
                       "local", ["E2E-1"], 1))
    ok.append(run_case("mocked scope cannot stand in",
                       [{**good_local, "scope": "unit_integration"}],
                       "local", ["E2E-1"], 1, {"proof/log.txt": b"ran"}))
    ok.append(run_case("missing proof file", [good_local], "local", ["E2E-1"], 1))
    ok.append(run_case("unequal hashes claimed PASS",
                       [{**good_local, "caseType": "file_roundtrip",
                         "referenceSha256": HASH_A, "receivedSha256": HASH_B}],
                       "local", ["E2E-1"], 1, {"proof/log.txt": b"ran"}))
    ok.append(run_case("equal metadata but unequal bytes",
                       [{**good_local, "caseType": "file_roundtrip",
                         "referenceSha256": HASH_A, "receivedSha256": HASH_A,
                         "proofRefs": ["proof/orig.bin", "proof/recv.bin"]}],
                       "local", ["E2E-1"], 1,
                       {"proof/orig.bin": b"original", "proof/recv.bin": b"received"}))
    measurement = {**good_local, "caseType": "measurement"}
    ok.append(run_case("measurement without threshold", [measurement],
                       "local", ["E2E-1"], 1, {"proof/log.txt": b"ran"}))
    root = tempfile.mkdtemp(prefix="evidence-thresholds-")
    thresholds = os.path.join(root, "thresholds.json")
    with open(thresholds, "w", encoding="utf-8") as handle:
        json.dump({"frozen": True}, handle)
    ok.append(run_case("measurement with frozen threshold", [measurement],
                       "local", ["E2E-1"], 0, {"proof/log.txt": b"ran"},
                       thresholds=thresholds))
    field_placeholder = {
        "caseId": "E2E-21",
        "scope": "real_cloud",
        "caseType": "negative_or_lifecycle",
        "result": "NOT_RUN",
        "executedBy": None,
        "proofRefs": [],
    }
    ok.append(run_case("field gate over NOT_RUN", [field_placeholder],
                       "field", ["E2E-21"], 1))
    ok.append(run_case("duplicate case id", [good_local, dict(good_local)],
                       "local", ["E2E-1"], 1, {"proof/log.txt": b"ran"}))

    root = tempfile.mkdtemp(prefix="evidence-roundtrip-")
    original = os.path.join(root, "orig.bin")
    received = os.path.join(root, "recv.bin")
    with open(original, "wb") as handle:
        handle.write(b"same bytes")
    with open(received, "wb") as handle:
        handle.write(b"same bytes")
    digest = sha256(original)
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
    ok.append(run_case("verified file roundtrip", [verified], "local", ["E2E-3"], 0,
                       {"proof/orig.bin": b"same bytes", "proof/recv.bin": b"same bytes"}))

    if all(ok):
        print(f"SELFTEST PASS ({len(ok)} cases)")
        return 0
    print(f"SELFTEST FAIL ({len(ok) - sum(ok)} of {len(ok)} cases)")
    return 1


if __name__ == "__main__":
    sys.exit(main())

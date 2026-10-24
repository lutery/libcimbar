#!/usr/bin/env python3
"""Real-behaviour selftest for verify-ux-evidence.py (UX-UT-088..095).

Every case builds an actual throwaway repo root (FX-RUN-TEMP / FX-GATE-DISK /
FX-FROZEN-PLAN style) and asserts the exit code of the real CLI. The positive
cases prove that a complete old+new evidence set passes, so a verifier that
rejects everything cannot masquerade as a gate. The negative cases prove that
missing UX ids, wrong build/input/attempt bindings, metadata-equal hashes,
scope/executor/caseType upgrades, duplicate or extra ids, assertion-less
records, stale phases and legacy-threshold substitution all fail.

Until tools/desktop-recv/verify-ux-evidence.py (and its run-context parser)
exists, the preflight below fails and this selftest is RED for the missing
module - the intended stage-5 state.

Run: python tools/desktop-recv/tests/ux-evidence-selftest.py
Exit: 0 every required behaviour held, 1 otherwise.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
VERIFY_UX = os.path.join(TOOLS, "verify-ux-evidence.py")
VERIFY_LEGACY = os.path.join(TOOLS, "verify-evidence.py")
RUN_CONTEXT = os.path.join(TOOLS, "e2e", "run-context.mjs")

LOCAL_LEGACY = ["E2E-%d" % number for number in range(1, 21)]
LOCAL_UX = ["E2E-%d" % number for number in range(27, 39)]
FIELD_LEGACY = ["E2E-%d" % number for number in range(21, 27)]
FIELD_UX = ["E2E-39"]

# Case types and acceptance ids are the frozen v2 machine-plan values
# (docs/tests/receiver-ux-v2/planning-cases.json). The fixture plan below
# repeats them so the verifier is exercised on the real contract.
UX_TYPES = {case_id: "file_roundtrip" for case_id in LOCAL_UX}
UX_TYPES["E2E-36"] = "negative_or_lifecycle"
UX_TYPES["E2E-37"] = "negative_or_lifecycle"
UX_TYPES["E2E-38"] = "measurement"
UX_TYPES["E2E-39"] = "file_roundtrip"

UX_AC = {
    "E2E-27": ["AC-015", "AC-016", "AC-017", "AC-018", "AC-020", "AC-022", "AC-024"],
    "E2E-28": ["AC-015", "AC-016", "AC-017", "AC-018", "AC-020", "AC-024"],
    "E2E-29": ["AC-015", "AC-016", "AC-017", "AC-018", "AC-020", "AC-024"],
    "E2E-30": ["AC-018", "AC-019", "AC-020", "AC-021", "AC-022", "AC-024"],
    "E2E-31": ["AC-015", "AC-016", "AC-017", "AC-018", "AC-019", "AC-020", "AC-022", "AC-024"],
    "E2E-32": ["AC-016", "AC-018", "AC-019", "AC-020", "AC-021", "AC-022", "AC-024"],
    "E2E-33": ["AC-018", "AC-020", "AC-021", "AC-022", "AC-024"],
    "E2E-34": ["AC-020", "AC-021", "AC-022", "AC-024"],
    "E2E-35": ["AC-015", "AC-017", "AC-018", "AC-021", "AC-022", "AC-024"],
    "E2E-36": ["AC-018", "AC-019", "AC-020", "AC-022", "AC-024"],
    "E2E-37": ["AC-018", "AC-019", "AC-020", "AC-022", "AC-024"],
    "E2E-38": ["AC-023", "AC-024"],
    "E2E-39": ["AC-015", "AC-016", "AC-017", "AC-018", "AC-019", "AC-020", "AC-022", "AC-024"],
}

PLAN_REL = "docs/tests/receiver-ux-v2/frozen-plan-fixture.json"
METHOD_REL = "docs/plans/receiver-ux-v2/performance-method-fixture.json"


def plan_fixture():
    scenarios = []
    for number in range(1, 21):
        scenarios.append({
            "id": "E2E-%d" % number, "gate": "local", "scope": "local_simulated",
            "executorRole": "executor", "caseType": "file_roundtrip",
            "acceptanceIds": ["AC-001"], "required": True,
        })
    for number in range(21, 27):
        if number == 26:
            case_type = "measurement"
        elif number in (23, 24):
            case_type = "negative_or_lifecycle"
        else:
            case_type = "file_roundtrip"
        scenarios.append({
            "id": "E2E-%d" % number, "gate": "field", "scope": "real_cloud",
            "executorRole": "user", "caseType": case_type,
            "acceptanceIds": ["AC-011"], "required": True,
        })
    for case_id in LOCAL_UX + FIELD_UX:
        field = case_id == "E2E-39"
        scenarios.append({
            "id": case_id, "gate": "field" if field else "local",
            "scope": "real_cloud" if field else "local_simulated",
            "executorRole": "user" if field else "executor",
            "caseType": UX_TYPES[case_id], "acceptanceIds": UX_AC[case_id],
            "required": True,
        })
    return {
        "kind": "receiver-ux-v2-plan-fixture",
        "version": 1,
        "iterationId": "receiver-ux-v2",
        "gates": {
            "local": {"legacyRequired": LOCAL_LEGACY, "uxRequired": LOCAL_UX},
            "field": {"legacyRequired": FIELD_LEGACY, "uxRequired": FIELD_UX},
        },
        "e2eScenarios": scenarios,
    }


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def put(root, rel, data):
    if isinstance(data, str):
        data = data.encode("utf-8")
    path = os.path.join(root, *rel.split("/"))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(data)
    return path


def write_json(root, rel, value):
    return put(root, rel, json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def new_repo():
    return tempfile.mkdtemp(prefix="ux-evidence-selftest-")


def build_run(repo, gate, phase=None, legacy_threshold=False):
    """Materialise a run root + context + product/input manifests.

    Returns the absolute run root and the metadata the record builders need.
    """
    run_id = "20261024-uxgate-%s" % gate
    attempt_id = "attempt-001"
    phase = phase or ("field" if gate == "field" else "final")
    receiver_rel = "build-desktop-recv/runs/%s/receiver" % run_id
    product_files = {
        "index.html": b"<!doctype html><title>receiver</title>\n",
        "src/app.js": b"export const app = true;\n",
        "vendor/cimbar_js.wasm": b"\x00asm",
        "worker/decoder-worker.js": b"self.onmessage = function () {};\n",
    }
    for rel, data in product_files.items():
        put(repo, "%s/%s" % (receiver_rel, rel), data)
    manifest = {
        "version": 1,
        "iterationId": "receiver-ux-v2",
        "base": "receiver",
        "files": [
            {"path": rel, "sha256": sha_bytes(data), "bytes": len(data)}
            for rel, data in sorted(product_files.items())
        ],
    }
    manifest_rel = "docs/tests/runs/%s/product-manifest.json" % run_id
    manifest_bytes = (json.dumps(manifest, indent=2) + "\n").encode("utf-8")
    put(repo, manifest_rel, manifest_bytes)
    manifest_sha = sha_bytes(manifest_bytes)
    input_rel = "docs/tests/runs/%s/input-manifest.json" % run_id
    input_bytes = (json.dumps({"inputs": []}, indent=2) + "\n").encode("utf-8")
    put(repo, input_rel, input_bytes)
    write_json(repo, PLAN_REL, plan_fixture())
    write_json(repo, METHOD_REL, {
        "version": 1, "kind": "frozen_method_only", "frozen": True,
        "iterationId": "receiver-ux-v2", "productAcceptance": "NOT_RUN",
    })
    threshold_rel = None
    if legacy_threshold:
        threshold_rel = "docs/tests/runs/%s/legacy-threshold.json" % run_id
        write_json(repo, threshold_rel, {"frozen": True})
    run_root_rel = "docs/tests/runs/%s" % run_id
    context = {
        "version": 1,
        "iterationId": "receiver-ux-v2",
        "runId": run_id,
        "attemptId": attempt_id,
        "phase": phase,
        "runRoot": run_root_rel,
        "stagingRoot": "build-desktop-recv/runs/%s" % run_id,
        "fixtureRoot": "%s/fixtures" % run_root_rel,
        "planningFile": PLAN_REL,
        "methodFile": METHOD_REL,
        "productManifest": manifest_rel,
        "productManifestSha256": manifest_sha,
        "sourceRevision": "a" * 40,
        "harnessRevision": "b" * 40,
        "inputManifest": input_rel,
        "inputManifestSha256": sha_bytes(input_bytes),
        "legacyThresholdFile": threshold_rel,
    }
    context_path = put(repo, "%s/run-context.json" % run_root_rel,
                       json.dumps(context, indent=2) + "\n")
    return {
        "repo": repo,
        "run_id": run_id,
        "attempt_id": attempt_id,
        "phase": phase,
        "run_root_rel": run_root_rel,
        "run_root": os.path.join(repo, *run_root_rel.split("/")),
        "context": context,
        "context_path": context_path,
        "manifest_sha": manifest_sha,
        "threshold_rel": threshold_rel,
    }


def legacy_record(case_id, run, scope, executor, case_type,
                  attempt_id="attempt-001", payload=b"legacy-bytes"):
    """A legacy results.json record for one planned scenario."""
    proof_dir = "proof/%s/%s" % (case_id, attempt_id)
    record = {
        "caseId": case_id,
        "scope": scope,
        "caseType": case_type,
        "result": "PASS",
        "executedBy": executor,
        "notes": "%s legacy journey" % case_id,
    }
    if case_type == "file_roundtrip":
        orig = "%s/original.bin" % proof_dir
        recv = "%s/received.bin" % proof_dir
        put(run["run_root"], orig, payload)
        put(run["run_root"], recv, payload)
        record["referenceSha256"] = sha_bytes(payload)
        record["receivedSha256"] = sha_bytes(payload)
        record["proofRefs"] = [orig, recv]
    else:
        log = "%s/log.txt" % proof_dir
        put(run["run_root"], log, b"ran")
        record["proofRefs"] = [log]
    return record


CHECKS = []


def ux_record(case_id, run, attempt_id=None, case_type=None, scope=None,
              executor=None, payload=None, **overrides):
    attempt_id = attempt_id or run["attempt_id"]
    case_type = case_type or UX_TYPES[case_id]
    field = case_id == "E2E-39"
    scope = scope or ("real_cloud" if field else "local_simulated")
    executor = executor or ("user" if field else "executor")
    proof_dir = "proof/%s/%s" % (case_id, attempt_id)
    assertion_one = "%s/assertion-1.log" % proof_dir
    assertion_two = "%s/assertion-2.log" % proof_dir
    put(run["run_root"], assertion_one, b"assertion one observed")
    put(run["run_root"], assertion_two, b"assertion two observed")
    reference = None
    received = None
    if case_type == "file_roundtrip":
        payload = payload if payload is not None else ("%s-payload" % case_id).encode("utf-8")
        orig = "%s/original.bin" % proof_dir
        recv = "%s/received.bin" % proof_dir
        put(run["run_root"], orig, payload)
        put(run["run_root"], recv, payload)
        proof_refs = [orig, recv, assertion_one, assertion_two]
        reference = sha_bytes(payload)
        received = sha_bytes(payload)
    else:
        log = "%s/log.txt" % proof_dir
        put(run["run_root"], log, b"journey log")
        proof_refs = [log, assertion_one, assertion_two]
    record = {
        "caseId": case_id,
        "attemptId": attempt_id,
        "scope": scope,
        "caseType": case_type,
        "result": "PASS",
        "executedBy": executor,
        "acceptanceIds": list(UX_AC[case_id]),
        "productManifestSha256": run["manifest_sha"],
        "startedAt": "2026-10-24T10:00:00Z",
        "finishedAt": "2026-10-24T10:00:05Z",
        "proofRefs": proof_refs,
        "assertions": [
            {"id": "%s-A1" % case_id,
             "expected": "saved bytes equal the reference",
             "observed": "sha256 equal", "result": "PASS",
             "proofRef": assertion_one},
            {"id": "%s-A2" % case_id,
             "expected": "status shows the real receiving state",
             "observed": "status snapshot recorded", "result": "PASS",
             "proofRef": assertion_two},
        ],
        "referenceSha256": reference,
        "receivedSha256": received,
        "notes": "%s executed in this run" % case_id,
    }
    record.update(overrides)
    return record


def ux_results(run, records):
    return {
        "version": 1,
        "iterationId": "receiver-ux-v2",
        "runId": run["run_id"],
        "productManifestSha256": run["manifest_sha"],
        "records": records,
    }


def write_results(run, legacy_records, ux_records, ux_payload=None):
    write_json(run["run_root"], "results.json", legacy_records)
    write_json(run["run_root"], "ux-results.json",
               ux_payload if ux_payload is not None else ux_results(run, ux_records))


def complete_local(repo):
    run = build_run(repo, "local")
    legacy = [legacy_record(case_id, run, "local_simulated", "executor",
                            "file_roundtrip") for case_id in LOCAL_LEGACY]
    ux = [ux_record(case_id, run) for case_id in LOCAL_UX]
    write_results(run, legacy, ux)
    return run, legacy, ux


def complete_field(repo, legacy_threshold=True):
    run = build_run(repo, "field", legacy_threshold=legacy_threshold)
    legacy = []
    for case_id in FIELD_LEGACY:
        if case_id == "E2E-26":
            case_type = "measurement"
        elif case_id in ("E2E-23", "E2E-24"):
            case_type = "negative_or_lifecycle"
        else:
            case_type = "file_roundtrip"
        legacy.append(legacy_record(case_id, run, "real_cloud", "user", case_type))
    ux = [ux_record(case_id, run) for case_id in FIELD_UX]
    write_results(run, legacy, ux)
    return run, legacy, ux


def run_gate(run, gate, extra=None):
    command = [sys.executable, VERIFY_UX, "--context", run["context_path"],
               "--gate", gate, "--repo-root", run["repo"]]
    if extra:
        command.extend(extra)
    proc = subprocess.run(command, capture_output=True)
    return (proc.returncode,
            proc.stdout.decode("utf-8", "replace"),
            proc.stderr.decode("utf-8", "replace"))


def check(name, ok, detail=""):
    CHECKS.append(bool(ok))
    print(("ok   " if ok else "FAIL ") + name)
    if not ok and detail:
        print(detail)
    return bool(ok)


def expect(name, run, gate, expected, expect_text=None, extra=None,
           unchanged=None):
    before = None
    if unchanged:
        with open(unchanged, "rb") as handle:
            before = handle.read()
    code, out, err = run_gate(run, gate, extra)
    ok = code == expected
    if expect_text is not None:
        ok = ok and (expect_text in out or expect_text in err)
    if unchanged:
        with open(unchanged, "rb") as handle:
            ok = ok and handle.read() == before
    return check(name, ok, "exit=%s expected=%s\nstdout:\n%s\nstderr:\n%s"
                 % (code, expected, out, err))


def main():
    # ---- preflight: the stage-5 modules must exist ----------------------
    missing = [path for path in (VERIFY_UX, RUN_CONTEXT)
               if not os.path.isfile(path)]
    if missing:
        for path in missing:
            print("FAIL preflight: missing %s (module missing)" % path)
        print("SELFTEST FAIL (module missing)")
        return 1
    if not os.path.isfile(VERIFY_LEGACY):
        print("FAIL preflight: missing %s" % VERIFY_LEGACY)
        print("SELFTEST FAIL (environment)")
        return 1

    repos = []

    def repo():
        path = new_repo()
        repos.append(path)
        return path

    try:
        # ---- CLI contract ----------------------------------------------
        proc = subprocess.run([sys.executable, VERIFY_UX, "--help"],
                              capture_output=True)
        help_text = (proc.stdout + proc.stderr).decode("utf-8", "replace")
        check("help exits 0 and documents --context/--gate",
              proc.returncode == 0 and "--context" in help_text
              and "--gate" in help_text,
              "exit=%s\n%s" % (proc.returncode, help_text))

        proc = subprocess.run([sys.executable, VERIFY_UX], capture_output=True)
        check("missing arguments exit 2", proc.returncode == 2,
              "exit=%s" % proc.returncode)

        proc = subprocess.run([sys.executable, VERIFY_UX, "--context", "x",
                               "--gate", "unknown"], capture_output=True)
        check("unknown gate exits 2", proc.returncode == 2,
              "exit=%s" % proc.returncode)

        probe_repo = repo()
        absent = os.path.join(probe_repo, "docs", "tests", "runs", "absent",
                              "run-context.json")
        expect("missing context file is refused",
               {"repo": probe_repo, "context_path": absent}, "local", 3)
        put(probe_repo, "broken.json", "{ not json")
        expect("broken context JSON is refused",
               {"repo": probe_repo,
                "context_path": os.path.join(probe_repo, "broken.json")},
               "local", 3)

        # ---- UX-UT-088: complete evidence passes ------------------------
        local_repo = repo()
        run, _legacy, _ux = complete_local(local_repo)
        expect("UX-UT-088 complete local old+new gate passes", run, "local", 0)

        field_repo = repo()
        run, _legacy, _ux = complete_field(field_repo, legacy_threshold=True)
        expect("UX-UT-088 complete field gate passes", run, "field", 0)

        # Field evidence that was not executed stays NOT_RUN: the gate is
        # non-zero and the verifier never rewrites the claim to PASS.
        not_run_repo = repo()
        run = build_run(not_run_repo, "field", legacy_threshold=True)
        legacy = []
        for case_id in FIELD_LEGACY:
            if case_id == "E2E-26":
                case_type = "measurement"
            elif case_id in ("E2E-23", "E2E-24"):
                case_type = "negative_or_lifecycle"
            else:
                case_type = "file_roundtrip"
            legacy.append(legacy_record(case_id, run, "real_cloud", "user",
                                        case_type))
        ux = [ux_record("E2E-39", run, result="NOT_RUN", executedBy=None,
                        startedAt=None, finishedAt=None, referenceSha256=None,
                        receivedSha256=None, proofRefs=[], assertions=[],
                        notes="field not executed: requires the user cloud desktop")]
        write_results(run, legacy, ux)
        ux_path = os.path.join(run["run_root"], "ux-results.json")
        expect("field gate over NOT_RUN is non-zero", run, "field", 1,
               unchanged=ux_path)
        check("NOT_RUN evidence is preserved on disk", True)

        # ---- UX-UT-089: every missing UX id fails the local gate -------
        for missing_id in LOCAL_UX:
            case_repo = repo()
            run, legacy, ux = complete_local(case_repo)
            kept = [record for record in ux if record["caseId"] != missing_id]
            write_results(run, legacy, kept)
            expect("UX-UT-089 missing %s fails the local gate" % missing_id,
                   run, "local", 1, expect_text=missing_id)

        # An empty UX required list cannot silently shrink the gate.
        empty_repo = repo()
        run, legacy, ux = complete_local(empty_repo)
        plan = plan_fixture()
        plan["gates"]["local"]["uxRequired"] = []
        write_json(empty_repo, PLAN_REL, plan)
        expect("UX-UT-089 empty uxRequired cannot exempt the gate",
               run, "local", 1)

        # ---- UX-UT-090: wrong build/input/run bindings -----------------
        wrong_repo = repo()
        run, legacy, ux = complete_local(wrong_repo)
        bad = ux_results(run, ux)
        bad["runId"] = "20261024-other-run"
        write_results(run, legacy, ux, ux_payload=bad)
        expect("wrong runId is refused", run, "local", 1)

        wrong_repo = repo()
        run, legacy, ux = complete_local(wrong_repo)
        ux[0]["productManifestSha256"] = "f" * 64
        write_results(run, legacy, ux)
        expect("wrong product manifest sha in a record is refused",
               run, "local", 1)

        wrong_repo = repo()
        run, legacy, ux = complete_local(wrong_repo)
        tampered = os.path.join(wrong_repo, "build-desktop-recv", "runs",
                                run["run_id"], "receiver", "src", "app.js")
        with open(tampered, "wb") as handle:
            handle.write(b"product bytes changed after the manifest")
        expect("product bytes changed after the manifest are refused",
               run, "local", 1)

        wrong_repo = repo()
        run, legacy, ux = complete_local(wrong_repo)
        context = dict(run["context"])
        context["inputManifestSha256"] = "e" * 64
        put(wrong_repo, "%s/run-context.json" % run["run_root_rel"],
            json.dumps(context, indent=2) + "\n")
        expect("input manifest sha mismatch is refused", run, "local", 1)

        # ---- UX-UT-091: metadata-equal hashes are not enough -----------
        fake_repo = repo()
        run, legacy, ux = complete_local(fake_repo)
        received_rel = ux[0]["proofRefs"][1]
        put(run["run_root"], received_rel, b"different received bytes")
        expect("equal metadata but different received bytes is refused",
               run, "local", 1)

        fake_repo = repo()
        run, legacy, ux = complete_local(fake_repo)
        os.remove(os.path.join(run["run_root"],
                               *ux[1]["proofRefs"][1].split("/")))
        expect("missing received artifact is refused", run, "local", 1)

        fake_repo = repo()
        run, legacy, ux = complete_local(fake_repo)
        ux[0]["proofRefs"] = ["../20261021-teamexec-03/results.json"]
        expect("escaping proofRef is refused", run, "local", 1)

        fake_repo = repo()
        run, legacy, ux = complete_local(fake_repo)
        ux[0]["proofRefs"] = []
        expect("empty proofRefs on PASS is refused", run, "local", 1)

        # ---- UX-UT-092: scope/executor/caseType upgrades ----------------
        for name, overrides, needle in [
            ("mock scope cannot pass a local journey",
             {"scope": "unit_integration"}, "scope"),
            ("executor cannot impersonate the user",
             {"executedBy": "user"}, "executedBy"),
            ("caseType cannot be relabelled to skip the artifact checks",
             {"caseType": "negative_or_lifecycle"}, "caseType"),
        ]:
            upgrade_repo = repo()
            run, legacy, ux = complete_local(upgrade_repo)
            ux[0].update(overrides)
            write_results(run, legacy, ux)
            expect(name, run, "local", 1, expect_text=needle)

        not_run_clean_repo = repo()
        run, legacy, ux = complete_local(not_run_clean_repo)
        ux[0].update({"result": "NOT_RUN", "executedBy": "executor",
                      "startedAt": "2026-10-24T10:00:00Z"})
        write_results(run, legacy, ux)
        expect("NOT_RUN with an executor/time claim is refused",
               run, "local", 1)

        # ---- UX-UT-093: duplicates, extra ids and overwritten attempts --
        duplicate_repo = repo()
        run, legacy, ux = complete_local(duplicate_repo)
        write_results(run, legacy, ux + [dict(ux[0])])
        expect("duplicate caseId is refused", run, "local", 1)

        extra_repo = repo()
        run, legacy, ux = complete_local(extra_repo)
        extra = ux_record("E2E-27", run, attempt_id="attempt-extra")
        extra["caseId"] = "E2E-99"
        write_results(run, legacy, ux + [extra])
        expect("unplanned extra UX id is refused", run, "local", 1)

        stale_repo = repo()
        run, legacy, ux = complete_local(stale_repo)
        ux[0]["attemptId"] = "attempt-002"
        write_results(run, legacy, ux)
        expect("record claiming an attempt/proof mismatch is refused",
               run, "local", 1)

        # ---- UX-UT-094: assertion-level evidence ------------------------
        assertion_repo = repo()
        run, legacy, ux = complete_local(assertion_repo)
        ux[0]["assertions"] = []
        write_results(run, legacy, ux)
        expect("record PASS with empty assertions is refused", run, "local", 1)

        assertion_repo = repo()
        run, legacy, ux = complete_local(assertion_repo)
        ux[0]["assertions"][0]["observed"] = ""
        write_results(run, legacy, ux)
        expect("assertion with empty observed is refused", run, "local", 1)

        assertion_repo = repo()
        run, legacy, ux = complete_local(assertion_repo)
        ux[0]["assertions"][1]["result"] = "FAIL"
        write_results(run, legacy, ux)
        expect("non-PASS assertion fails the case", run, "local", 1)

        assertion_repo = repo()
        run, legacy, ux = complete_local(assertion_repo)
        proof_rel = ux[0]["assertions"][0]["proofRef"]
        os.remove(os.path.join(run["run_root"], *proof_rel.split("/")))
        write_results(run, legacy, ux)
        expect("assertion without its proof file is refused", run, "local", 1)

        # ---- UX-UT-095: partial phases and methods are not final proof --
        slice_repo = repo()
        run = build_run(slice_repo, "local", phase="slice")
        legacy = [legacy_record(case_id, run, "local_simulated", "executor",
                                "file_roundtrip")
                  for case_id in LOCAL_LEGACY]
        ux = [ux_record(case_id, run) for case_id in LOCAL_UX]
        write_results(run, legacy, ux)
        expect("slice context cannot prove the final local gate",
               run, "local", 1)

        threshold_repo = repo()
        run, legacy, ux = complete_field(threshold_repo, legacy_threshold=False)
        expect("legacy field measurement without a bound threshold is refused",
               run, "field", 1)

        local_for_field_repo = repo()
        run, legacy, ux = complete_local(local_for_field_repo)
        expect("local evidence cannot prove the field gate", run, "field", 1)

        old_schema_repo = repo()
        run, legacy, ux = complete_local(old_schema_repo)
        write_results(run, legacy + [dict(ux[0])], [])
        expect("UX records inside results.json do not satisfy the UX gate",
               run, "local", 1)

        relabel_repo = repo()
        run, legacy, ux = complete_local(relabel_repo)
        legacy[0]["caseType"] = "negative_or_lifecycle"
        write_results(run, legacy, ux)
        expect("v1 results.json still follows the legacy gate rules",
               run, "local", 1,
               expect_text="caseType must be file_roundtrip per the plan")

        passed = sum(1 for ok in CHECKS if ok)
        if passed == len(CHECKS):
            print("SELFTEST PASS (%d cases)" % len(CHECKS))
            return 0
        print("SELFTEST FAIL (%d of %d cases)"
              % (len(CHECKS) - passed, len(CHECKS)))
        return 1
    finally:
        for path in repos:
            shutil.rmtree(path, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())

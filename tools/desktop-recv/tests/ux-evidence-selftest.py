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
import importlib.util
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
CALC_CLI = os.path.join(TOOLS, "e2e", "measure-ux-calc.mjs")

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
REPO_ROOT = os.path.dirname(os.path.dirname(TOOLS))
REAL_METHOD = os.path.join(REPO_ROOT, "docs", "plans", "receiver-ux-v2",
                           "performance-method.json")

# Frozen step counts per UX case (the real planning file has 4/5/6/... steps;
# the fixture keeps the same shape so the coverage rule is exercised).
UX_STEPS = {case_id: 2 for case_id in LOCAL_UX}
UX_STEPS.update({
    "E2E-27": 6, "E2E-28": 5, "E2E-29": 5, "E2E-30": 4, "E2E-31": 4,
    "E2E-32": 4, "E2E-33": 4, "E2E-34": 4, "E2E-35": 4, "E2E-36": 4,
    "E2E-37": 4, "E2E-38": 5, "E2E-39": 5,
})

# The measurement fixture's real bytes: the input manifest binds them by SHA,
# the measurement input.json claims the same values, and the recompute CLI
# re-hashes the files it is pointed at. (The SHA constants are derived below,
# after sha_bytes is defined.)
MEAS_INPUT = b"ux-measurement-primary-input"
MEAS_MEDIA = b"ux-measurement-media"
MEAS_LIVE = b"ux-measurement-live-input"
MEAS_FRAMES = 35
MEAS_BASE_READY = [1000, 1100, 1000, 1200, 1100]
MEAS_CAND_READY = [1150, 1250, 1200, 1300, 1200]
MEAS_BASE_RTT = 44
MEAS_CAND_RTT = 46
_INSTRUMENTATION_SHA = None


def steps_fixture(count):
    return [
        {"action": "fixture step %d action" % number,
         "expected": "fixture step %d expected" % number,
         "evidence": ["fixture step %d evidence" % number]}
        for number in range(1, count + 1)
    ]


def instrumentation_sha():
    """The observer SHA the calculator embeds (asked from node once)."""
    global _INSTRUMENTATION_SHA
    if _INSTRUMENTATION_SHA is None:
        node = shutil.which("node")
        if not node:
            raise RuntimeError("node is required for the measurement fixture")
        calc = os.path.join(TOOLS, "e2e", "measure-ux-calc.mjs")
        from pathlib import Path
        calc_url = Path(calc).as_uri()
        proc = subprocess.run(
            [node, "-e",
             "import(process.argv[1]).then(m=>console.log(m.INSTRUMENTATION_SHA256))",
             calc_url],
            capture_output=True, timeout=60,
        )
        if proc.returncode != 0:
            raise RuntimeError("cannot read INSTRUMENTATION_SHA256: %s"
                               % proc.stderr.decode("utf-8", "replace")[:300])
        _INSTRUMENTATION_SHA = proc.stdout.decode("utf-8").strip()
    return _INSTRUMENTATION_SHA


def method_bytes():
    with open(REAL_METHOD, "rb") as handle:
        return handle.read()


def plan_fixture():
    scenarios = []
    for number in range(1, 21):
        scenarios.append({
            "id": "E2E-%d" % number, "gate": "local", "scope": "local_simulated",
            "executorRole": "executor", "caseType": "file_roundtrip",
            "acceptanceIds": ["AC-001"], "required": True,
            "steps": steps_fixture(3),
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
            "steps": steps_fixture(3),
        })
    for case_id in LOCAL_UX + FIELD_UX:
        field = case_id == "E2E-39"
        scenarios.append({
            "id": case_id, "gate": "field" if field else "local",
            "scope": "real_cloud" if field else "local_simulated",
            "executorRole": "user" if field else "executor",
            "caseType": UX_TYPES[case_id], "acceptanceIds": UX_AC[case_id],
            "required": True, "steps": steps_fixture(UX_STEPS[case_id]),
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


MEAS_INPUT_SHA = sha_bytes(MEAS_INPUT)
MEAS_MEDIA_SHA = sha_bytes(MEAS_MEDIA)
MEAS_LIVE_SHA = sha_bytes(MEAS_LIVE)


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
    # The input manifest binds the primary/media/live inputs by SHA; the files
    # are materialised so the recompute CLI can re-hash them.
    run_root_rel = "docs/tests/runs/%s" % run_id
    fixtures = {
        "primary-input.bin": MEAS_INPUT,
        "media.webm": MEAS_MEDIA,
        "live-input.bin": MEAS_LIVE,
    }
    for name, data in fixtures.items():
        put(repo, "%s/fixtures/%s" % (run_root_rel, name), data)
    input_rel = "docs/tests/runs/%s/input-manifest.json" % run_id
    input_manifest = {
        "version": 1,
        "iterationId": "receiver-ux-v2",
        "runId": run_id,
        "phase": phase,
        "primaryInput": {
            "path": "docs/tests/runs/%s/fixtures/primary-input.bin" % run_id,
            "sha256": MEAS_INPUT_SHA, "bytes": len(MEAS_INPUT),
        },
        "media": {"withSha256": MEAS_MEDIA_SHA},
        "liveInput": {
            "path": "docs/tests/runs/%s/fixtures/live-input.bin" % run_id,
            "sha256": MEAS_LIVE_SHA, "bytes": len(MEAS_LIVE),
        },
        "files": [
            {"path": "docs/tests/runs/%s/fixtures/primary-input.bin" % run_id,
             "sha256": MEAS_INPUT_SHA, "bytes": len(MEAS_INPUT), "role": "fixture"},
            {"path": "docs/tests/runs/%s/fixtures/media.webm" % run_id,
             "sha256": MEAS_MEDIA_SHA, "bytes": len(MEAS_MEDIA), "role": "media"},
            {"path": "docs/tests/runs/%s/fixtures/live-input.bin" % run_id,
             "sha256": MEAS_LIVE_SHA, "bytes": len(MEAS_LIVE), "role": "fixture"},
        ],
    }
    input_bytes = (json.dumps(input_manifest, indent=2) + "\n").encode("utf-8")
    put(repo, input_rel, input_bytes)
    write_json(repo, PLAN_REL, plan_fixture())
    # The measurement PASS path re-validates the FULL frozen method, so the
    # fixture carries the real frozen bytes (never a loosened stub).
    put(repo, METHOD_REL, method_bytes())
    threshold_rel = None
    if legacy_threshold:
        threshold_rel = "docs/tests/runs/%s/legacy-threshold.json" % run_id
        write_json(repo, threshold_rel, {"frozen": True})
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
    reference = None
    received = None
    if case_type == "file_roundtrip":
        payload = payload if payload is not None else ("%s-payload" % case_id).encode("utf-8")
        orig = "%s/original.bin" % proof_dir
        recv = "%s/received.bin" % proof_dir
        put(run["run_root"], orig, payload)
        put(run["run_root"], recv, payload)
        proof_refs = [orig, recv]
        reference = sha_bytes(payload)
        received = sha_bytes(payload)
    else:
        log = "%s/log.txt" % proof_dir
        put(run["run_root"], log, b"journey log")
        proof_refs = [log]
    # Canonical step ids only: <caseId>-S<n> (or a single uppercase letter
    # sub-suffix). A PASS record must cover every frozen step.
    assertions = []
    for number in range(1, UX_STEPS[case_id] + 1):
        proof = "%s/step-%02d.log" % (proof_dir, number)
        put(run["run_root"], proof, ("step %d observed" % number).encode("utf-8"))
        assertions.append({
            "id": "%s-S%02d" % (case_id, number),
            "expected": "frozen %s step %d expected" % (case_id, number),
            "observed": "step %d observed in this run" % number,
            "result": "PASS",
            "proofRef": proof,
        })
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
        "assertions": assertions,
        "referenceSha256": reference,
        "receivedSha256": received,
        "notes": "%s executed in this run" % case_id,
    }
    record.update(overrides)
    return record


# --- the measurement fixture (E2E-38) -------------------------------------
# A complete measurement directory as measure-ux writes it: a run root copy
# with rounds/ + live/rounds/, and the proof copy the journey record points at
# (no rounds/, mirroring the real ui-journeys copy). The claims are computed
# here independently and the gate's calculator must reproduce them.

def _measurement_env():
    return {
        "wasmSha256": sha_bytes(b"\x00asm"),
        "inputSha256": MEAS_INPUT_SHA,
        "mediaSha256": MEAS_MEDIA_SHA,
        "browserVersion": "edge-fixture",
        "mode": "B",
        "viewport": {"width": 1280, "height": 800},
        "deviceScaleFactor": 1,
        "screenResolution": {"width": 1920, "height": 1080},
        "powerMode": "balanced",
        "instrumentationSha256": instrumentation_sha(),
    }


def _median(values):
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2


def measurement_round(side, pair_index, warmup, ready_ms, rtt_ms):
    frames = []
    for index in range(MEAS_FRAMES):
        t0 = 1000 + index * 100
        frames.append({"seq": index + 1, "t0Ms": t0, "settledAtMs": t0 + rtt_ms,
                       "ok": True, "rttMs": rtt_ms})
    env = _measurement_env()
    return {
        "side": side,
        "pairIndex": pair_index,
        "slot": 0 if warmup else (1 if side == "A" else 2),
        "warmup": warmup,
        "journey": {"receivingAt": 5000, "readyAt": 5000 + ready_ms},
        "frames": frames,
        "telemetryWrites": [1000, 1300, 1600],
        "telemetryArmed": True,
        "env": env,
        "inputSha256": MEAS_INPUT_SHA,
        "mediaSha256": MEAS_MEDIA_SHA,
    }


def live_round(side, pair_index):
    samples = []
    for index in range(16):
        samples.append({
            "at": 1000000 + index * 2000,
            "atMs": index * 2000,
            "perfNow": 5000 + index * 2000,
            "state": "Receiving",
            "primary": "正在等待有效数据" if index == 0 else "正在接收数据",
            "elapsed": "%.1fs" % (index * 2),
            "rate": "60.0 KiB/s（含冗余）",
            "sessionId": "sess-fixture",
            "sessionSeq": 7,
            "revision": 2,
            "submitted": 1 + index,
        })
    frames = []
    for index in range(60):
        t0 = 5200 + index * 500
        frames.append({"seq": index + 1, "t0Ms": t0, "settledAtMs": t0 + 60,
                       "ok": True, "rttMs": 60})
    return {
        "side": side,
        "pairIndex": pair_index,
        "startedAtIso": "2026-10-24T10:00:00Z",
        "samples": samples,
        "frames": frames,
        "telemetryWrites": [5100 + index * 260 for index in range(60)],
        "telemetryArmed": True,
        "observations": {"afterStop": {
            "frozenA": {"state": "Stopped", "elapsed": "32.0s", "primary": "已停止"},
            "frozenB": {"state": "Stopped", "elapsed": "32.0s", "primary": "已停止"},
        }},
        "violations": [],
        "valid": True,
    }


def _metric(name, baseline, candidate):
    if name == "readyMs":
        factor, allowance = 1.1, 250
        limit = baseline * factor + allowance
        formula = "candidateMedian <= baselineMedian * 1.10 + 250"
    elif name == "frameRttP50Ms":
        factor, allowance = 1.1, 2
        limit = max(baseline * factor, baseline + allowance)
        formula = "candidateMedian <= max(baselineMedian * 1.10, baselineMedian + 2)"
    else:
        factor, allowance = 1.15, 5
        limit = max(baseline * factor, baseline + allowance)
        formula = "candidateMedian <= max(baselineMedian * 1.15, baselineMedian + 5)"
    return {
        "metric": name, "baselineMedian": baseline, "candidateMedian": candidate,
        "baselineRounds": 5, "candidateRounds": 5,
        "relativeFactor": factor, "absoluteAllowanceMs": allowance, "formula": formula,
        "limit": limit, "marginMs": limit - candidate, "pass": candidate <= limit,
    }


def _summary_side(role, ready_values, rtt):
    return {
        "role": role,
        "rounds": 5,
        "pairIndexes": [1, 2, 3, 4, 5],
        "readyMsValues": list(ready_values),
        "readyMsMedian": _median(ready_values),
        "rttP50Values": [rtt] * 5,
        "rttP50Median": rtt,
        "rttP95Values": [rtt] * 5,
        "rttP95Median": rtt,
        "frameCounts": [MEAS_FRAMES] * 5,
        "frameCountTotal": MEAS_FRAMES * 5,
    }


def measurement_files(run):
    method_sha = sha_bytes(method_bytes())
    instrumentation = instrumentation_sha()
    files = {}
    files["run.json"] = {
        "outputVersion": 1,
        "kind": "ux-overhead-ab",
        "startedAtIso": "2026-10-24T10:00:00.000Z",
        "finishedAtIso": "2026-10-24T10:10:00.000Z",
        "methodSha256": method_sha,
        "instrumentationSha256": instrumentation,
        "candidate": {
            "runId": run["run_id"], "attemptId": run["attempt_id"],
            "phase": run["phase"], "productManifestSha256": run["manifest_sha"],
        },
        "baseline": {
            "runId": "20261024-uxgate-baseline", "attemptId": "baseline-001",
            "phase": "baseline", "productManifestSha256": "b" * 64,
        },
        "plan": {"pairs": 5, "order": ["AB", "BA", "AB", "BA", "AB"],
                 "warmupPerBuild": 1, "minSettledFrames": 30,
                 "telemetryMinWriteIntervalMs": 250},
        "verdict": "PASS",
    }
    files["environment.json"] = {"matchedEnvironment": ["wasmSha256"],
                                 "sides": {"A": _measurement_env(), "B": _measurement_env()}}
    files["input.json"] = {
        "inputSha256": MEAS_INPUT_SHA, "mediaSha256": MEAS_MEDIA_SHA,
        "inputBytes": len(MEAS_INPUT),
        "inputPath": "docs/tests/runs/%s/fixtures/primary-input.bin" % run["run_id"],
        "mediaPath": "docs/tests/runs/%s/fixtures/media.webm" % run["run_id"],
        "sides": {"A": {"inputManifest": "fixture"}, "B": {"inputManifest": "fixture"}},
        "frozenAnchor": "fixture",
    }
    files["manifest.json"] = {"methodSha256": method_sha, "sides": {"A": None, "B": None}}
    files["summary.json"] = {
        "outputVersion": 1,
        "methodSha256": method_sha,
        "instrumentationSha256": instrumentation,
        "counting": {"gate": "okFrameCount", "note": "settledFrameCount is recorded per round"},
        "sides": {
            "A": _summary_side("baseline", MEAS_BASE_READY, MEAS_BASE_RTT),
            "B": _summary_side("candidate", MEAS_CAND_READY, MEAS_CAND_RTT),
        },
    }
    cell = lambda ready, rtt: {
        "readyMs": ready, "p50Ms": rtt, "p95Ms": rtt, "okFrameCount": MEAS_FRAMES,
        "rejectedFrameCount": 0, "maxInFlight": 1, "minTelemetryGapMs": 300,
        "telemetryArmed": True, "collectionError": None, "exclusionReason": None,
    }
    files["comparison.json"] = {
        "outputVersion": 1,
        "methodSha256": method_sha,
        "instrumentationSha256": instrumentation,
        "validPairs": 5,
        "pairs": [
            {"pair": index + 1, "valid": True, "reason": None,
             "a": cell(MEAS_BASE_READY[index], MEAS_BASE_RTT),
             "b": cell(MEAS_CAND_READY[index], MEAS_CAND_RTT)}
            for index in range(5)
        ],
        "metrics": {
            "readyMs": _metric("readyMs", _median(MEAS_BASE_READY), _median(MEAS_CAND_READY)),
            "frameRttP50Ms": _metric("frameRttP50Ms", MEAS_BASE_RTT, MEAS_CAND_RTT),
            "frameRttP95Ms": _metric("frameRttP95Ms", MEAS_BASE_RTT, MEAS_CAND_RTT),
        },
        "verdict": "PASS",
        "reasons": [],
        "formulaSource": "fixture",
    }
    files["invalid-rounds.json"] = {
        "count": 2,
        "rounds": [
            {"file": "rounds/warmup-%s.json" % side, "side": side, "pairIndex": 0,
             "warmup": True, "reason": "E_WARMUP", "detail": None}
            for side in ("A", "B")
        ],
    }
    files["live/summary.json"] = {
        "kind": "live-legs-summary",
        "attemptId": run["attempt_id"],
        "pairs": 5,
        "order": ["AB", "BA", "AB", "BA", "AB"],
        "activeWindowSeconds": 30,
        "liveInputSha256": MEAS_LIVE_SHA,
        "sidesValid": {"A": 5, "B": 5},
        "verdict": "PASS",
        "invalidRounds": [],
        "advisory": "RTT values are advisory only",
        "generatedAt": "2026-10-24T10:20:00.000Z",
    }
    return files


def measurement_round_files(run):
    rounds = {
        "warmup-A.json": measurement_round("A", 0, True, 1000, MEAS_BASE_RTT),
        "warmup-B.json": measurement_round("B", 0, True, 1100, MEAS_CAND_RTT),
    }
    for index in range(5):
        rounds["pair-%d-A.json" % (index + 1)] = measurement_round(
            "A", index + 1, False, MEAS_BASE_READY[index], MEAS_BASE_RTT)
        rounds["pair-%d-B.json" % (index + 1)] = measurement_round(
            "B", index + 1, False, MEAS_CAND_READY[index], MEAS_CAND_RTT)
    return rounds


def measurement_original_dir(run):
    return os.path.join(run["run_root"], "measurements", "ux-overhead", run["attempt_id"])


def measurement_proof_rel(run, case_id="E2E-38"):
    return "proof/%s/%s/measurements" % (case_id, run["attempt_id"])


def build_measurement(run):
    """Write the original measurement dir and its proof copy (no rounds/)."""
    files = measurement_files(run)
    rounds = measurement_round_files(run)
    original = measurement_original_dir(run)
    for rel, value in files.items():
        write_json(original, rel, value)
    for name, value in rounds.items():
        write_json(original, "rounds/" + name, value)
    for index in range(1, 6):
        for side in ("A", "B"):
            write_json(original, "live/rounds/pair-%d-%s.json" % (index, side),
                       live_round(side, index))
    proof_rel = measurement_proof_rel(run)
    for name in ("run.json", "environment.json", "input.json", "manifest.json",
                 "summary.json", "comparison.json"):
        write_json(run["run_root"], proof_rel + "/" + name, files[name])
    write_json(run["run_root"], proof_rel + "/live/summary.json", files["live/summary.json"])
    for index in range(1, 6):
        for side in ("A", "B"):
            write_json(run["run_root"],
                       proof_rel + "/live/rounds/pair-%d-%s.json" % (index, side),
                       live_round(side, index))
    return original


def measurement_record(run, case_id="E2E-38"):
    build_measurement(run)
    proof_rel = measurement_proof_rel(run, case_id)
    refs = [proof_rel + "/summary.json", proof_rel + "/comparison.json",
            proof_rel + "/live/summary.json"]
    assertions = []
    for number in range(1, UX_STEPS[case_id] + 1):
        assertions.append({
            "id": "%s-S%02d" % (case_id, number),
            "expected": "frozen %s step %d is evidenced by the measurement" % (case_id, number),
            "observed": "recomputed from the raw measurement files",
            "result": "PASS",
            "proofRef": refs[0],
        })
    return {
        "caseId": case_id,
        "attemptId": run["attempt_id"],
        "scope": "local_simulated",
        "caseType": "measurement",
        "result": "PASS",
        "executedBy": "executor",
        "acceptanceIds": list(UX_AC[case_id]),
        "productManifestSha256": run["manifest_sha"],
        "startedAt": "2026-10-24T10:00:00Z",
        "finishedAt": "2026-10-24T10:10:00Z",
        "proofRefs": refs,
        "assertions": assertions,
        "referenceSha256": None,
        "receivedSha256": None,
        "notes": "%s measurement executed in this run" % case_id,
    }


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
    ux = [(measurement_record(run) if case_id == "E2E-38" else ux_record(case_id, run))
          for case_id in LOCAL_UX]
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


# --- Round-13 tool negatives: real CLI / real validate_ux_record -----------
# S2: every negative below drives a REAL entry point. The measurement is a
# copy of the real root11 evidence placed in an OS temp run root (root11
# itself stays read-only), and the consistent-FAIL case calls the real
# validate_ux_record from verify-ux-evidence.py instead of a helper stub.

ROOT11_RUN_REL = "docs/tests/runs/20261026-teamexec-11"
ROOT11_RUN = os.path.join(REPO_ROOT, *ROOT11_RUN_REL.split("/"))
ROOT11_CONTEXT = os.path.join(ROOT11_RUN, "run-context.json")
ROOT11_ATTEMPT = "candidate-20261026-01"
ROOT11_MEAS_REL = "measurements/ux-overhead/%s" % ROOT11_ATTEMPT
ROOT11_MEAS = os.path.join(ROOT11_RUN, *ROOT11_MEAS_REL.split("/"))
ROOT11_PROOF_ATTEMPT = "UX-UI-2026-10-26T09-58-29-387Z-423ba5"

_VERIFIER = None


def load_verifier():
    """Import the real verifier module; validate_ux_record is the entry."""
    global _VERIFIER
    if _VERIFIER is None:
        spec = importlib.util.spec_from_file_location("verify_ux_evidence_r13", VERIFY_UX)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _VERIFIER = module
    return _VERIFIER


def read_json(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def write_json_abs(path, value):
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def root11_available():
    return (os.path.isfile(ROOT11_CONTEXT)
            and os.path.isdir(ROOT11_MEAS)
            and os.path.isfile(os.path.join(ROOT11_RUN, "ux-results.json"))
            and os.path.isdir(os.path.join(ROOT11_RUN, "proof", "E2E-38",
                                           ROOT11_PROOF_ATTEMPT)))


def copy_root11_measurement(temp_root):
    """Copy the real root11 measurement into a throwaway run root.

    The copy sits at the same run-root-relative path the calculator resolves
    a proof copy to, so the CLI recomputes the copy itself instead of being
    redirected to the (read-only) original.
    """
    run_root = os.path.join(temp_root, "run-root")
    target = os.path.join(run_root, "measurements", "ux-overhead", ROOT11_ATTEMPT)
    shutil.copytree(ROOT11_MEAS, target)
    return run_root, target


def run_calc(run_root, measurement_dir, context=True):
    """Drive the real recompute CLI (the gate's own subprocess command)."""
    node = shutil.which("node")
    command = [node, CALC_CLI, "--recompute", run_root, measurement_dir,
               "--method", REAL_METHOD]
    if context:
        command += ["--context", ROOT11_CONTEXT]
    proc = subprocess.run(command, capture_output=True, timeout=180)
    stdout = proc.stdout.decode("utf-8", "replace")
    stderr = proc.stderr.decode("utf-8", "replace")
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError:
        payload = None
    return proc.returncode, payload, stdout, stderr


def violation_codes(payload):
    entries = (payload or {}).get("violations") or []
    return [entry.get("code") for entry in entries if isinstance(entry, dict)]


def recomputed_round_codes(payload):
    """Round-level judge codes from stats.measurements[*].roundViolations."""
    measurements = ((payload or {}).get("stats") or {}).get("measurements") or []
    codes = []
    for measurement in measurements:
        if not isinstance(measurement, dict):
            continue
        for entry in measurement.get("roundViolations") or []:
            if isinstance(entry, dict):
                codes.append(entry.get("code"))
    return codes


def tamper_rounds(meas_dir, field, value):
    rounds_dir = os.path.join(meas_dir, "rounds")
    for name in sorted(os.listdir(rounds_dir)):
        if not name.endswith(".json"):
            continue
        path = os.path.join(rounds_dir, name)
        record = read_json(path)
        record[field] = value
        write_json_abs(path, record)


def tamper_binding(kind, meas_dir):
    """Break exactly one build/input/media/live identity in the temp copy."""
    if kind == "product":
        path = os.path.join(meas_dir, "run.json")
        run = read_json(path)
        run["candidate"]["productManifestSha256"] = "f" * 64
        write_json_abs(path, run)
    elif kind == "candidate-missing":
        path = os.path.join(meas_dir, "run.json")
        run = read_json(path)
        run.pop("candidate", None)
        write_json_abs(path, run)
    elif kind == "input":
        path = os.path.join(meas_dir, "input.json")
        data = read_json(path)
        data["inputSha256"] = "f" * 64
        write_json_abs(path, data)
        tamper_rounds(meas_dir, "inputSha256", "f" * 64)
    elif kind == "media":
        path = os.path.join(meas_dir, "input.json")
        data = read_json(path)
        data["mediaSha256"] = "f" * 64
        write_json_abs(path, data)
        tamper_rounds(meas_dir, "mediaSha256", "f" * 64)
    elif kind == "live":
        path = os.path.join(meas_dir, "live", "summary.json")
        data = read_json(path)
        data["liveInputSha256"] = "e" * 64
        write_json_abs(path, data)
    else:
        raise AssertionError("unknown binding tamper: %s" % kind)


def zero_round_rtt_with_claims(meas_dir):
    """A self-consistent RTT lie: rttMs=0 in one raw round AND every derived
    claim rewritten to 0, so only the raw start/end timestamps contradict it.
    """
    path = os.path.join(meas_dir, "rounds", "pair-1-B.json")
    record = read_json(path)
    for frame in record["frames"]:
        if frame.get("ok") is True:
            frame["rttMs"] = 0
    write_json_abs(path, record)
    summary_path = os.path.join(meas_dir, "summary.json")
    summary = read_json(summary_path)
    side = summary["sides"]["B"]
    side["rttP50Values"][0] = 0
    side["rttP95Values"][0] = 0
    side["rttP50Median"] = _median(side["rttP50Values"])
    side["rttP95Median"] = _median(side["rttP95Values"])
    write_json_abs(summary_path, summary)
    comparison_path = os.path.join(meas_dir, "comparison.json")
    comparison = read_json(comparison_path)
    comparison["pairs"][0]["b"]["p50Ms"] = 0
    comparison["pairs"][0]["b"]["p95Ms"] = 0
    write_json_abs(comparison_path, comparison)


def settle_before_submit(meas_dir):
    """Move one raw settlement before its own submission, claims untouched."""
    path = os.path.join(meas_dir, "rounds", "pair-1-B.json")
    record = read_json(path)
    for frame in record["frames"]:
        if frame.get("ok") is True:
            frame["settledAtMs"] = frame["t0Ms"] - 1
            break
    write_json_abs(path, record)


def root11_e2e38_record():
    payload = read_json(os.path.join(ROOT11_RUN, "ux-results.json"))
    return [record for record in payload["records"]
            if record.get("caseId") == "E2E-38"][0]


def measurement_scenario():
    return {
        "id": "E2E-38", "gate": "local", "scope": "local_simulated",
        "executorRole": "executor", "caseType": "measurement",
        "acceptanceIds": ["AC-023", "AC-024"], "required": True,
        "steps": steps_fixture(5),
    }


def root11_context_payload(run_root):
    return {
        "identity": {},
        "context": read_json(ROOT11_CONTEXT),
        "repoRoot": REPO_ROOT,
        "abs": {"runRoot": run_root, "methodFile": REAL_METHOD},
    }


def validate_record_violations(record, scenario, context_payload):
    """Call the REAL validate_ux_record (no helper reimplementation)."""
    violations = []
    load_verifier().validate_ux_record(
        record, scenario, context_payload, "local", violations,
        context_path=ROOT11_CONTEXT, repo_root=None)
    return violations


def make_root11_consistent_fail(temp_root):
    """root11 copy with every B-side ready pushed +60s, claims rewritten so
    the calculator derives a self-consistent FAIL (median 75060ms > 17528.8).
    """
    run_root, meas_dir = copy_root11_measurement(temp_root)
    proof_dir = os.path.join(run_root, "proof", "E2E-38", ROOT11_PROOF_ATTEMPT,
                             "measurements")
    shutil.copytree(os.path.join(ROOT11_RUN, "proof", "E2E-38",
                                 ROOT11_PROOF_ATTEMPT, "measurements"), proof_dir)
    for index in range(1, 6):
        path = os.path.join(meas_dir, "rounds", "pair-%d-B.json" % index)
        record = read_json(path)
        record["journey"]["readyAt"] += 60000
        if isinstance(record.get("readyMs"), (int, float)):
            record["readyMs"] += 60000
        write_json_abs(path, record)
    summary_path = os.path.join(meas_dir, "summary.json")
    summary = read_json(summary_path)
    side = summary["sides"]["B"]
    side["readyMsValues"] = [value + 60000 for value in side["readyMsValues"]]
    side["readyMsMedian"] = _median(side["readyMsValues"])
    write_json_abs(summary_path, summary)
    comparison_path = os.path.join(meas_dir, "comparison.json")
    comparison = read_json(comparison_path)
    for pair in comparison["pairs"]:
        pair["b"]["readyMs"] += 60000
    metric = comparison["metrics"]["readyMs"]
    metric["candidateMedian"] = side["readyMsMedian"]
    metric["limit"] = (metric["baselineMedian"] * metric["relativeFactor"]
                       + metric["absoluteAllowanceMs"])
    metric["marginMs"] = metric["limit"] - metric["candidateMedian"]
    metric["pass"] = metric["candidateMedian"] <= metric["limit"]
    comparison["verdict"] = "FAIL"
    comparison["reasons"] = [{
        "code": "E_THRESHOLD", "metric": "readyMs",
        "detail": "readyMs: candidate median %s > limit %s (%s)"
                  % (metric["candidateMedian"], metric["limit"], metric["formula"]),
    }]
    write_json_abs(comparison_path, comparison)
    run_path = os.path.join(meas_dir, "run.json")
    run = read_json(run_path)
    run["verdict"] = "FAIL"
    write_json_abs(run_path, run)
    for name in ("run.json", "summary.json", "comparison.json"):
        shutil.copyfile(os.path.join(meas_dir, name), os.path.join(proof_dir, name))
    return run_root, meas_dir


def make_consistent_not_run(run):
    """The selftest measurement fixture with one collection error: four valid
    pairs, every metric still passing, verdict NOT_RUN - fully self-consistent.
    """
    original = measurement_original_dir(run)
    proof_dir = os.path.join(run["run_root"], *measurement_proof_rel(run).split("/"))
    rounds_path = os.path.join(original, "rounds", "pair-5-B.json")
    record = read_json(rounds_path)
    record["collectionError"] = {"kind": "environment",
                                 "message": "fixture: pair 5 collection failed"}
    write_json_abs(rounds_path, record)
    summary_path = os.path.join(original, "summary.json")
    summary = read_json(summary_path)
    for side_name, ready, rtt in (
        ("A", MEAS_BASE_READY[:4], MEAS_BASE_RTT),
        ("B", MEAS_CAND_READY[:4], MEAS_CAND_RTT),
    ):
        side = summary["sides"][side_name]
        side["rounds"] = 4
        side["pairIndexes"] = [1, 2, 3, 4]
        side["readyMsValues"] = list(ready)
        side["readyMsMedian"] = _median(ready)
        side["rttP50Values"] = [rtt] * 4
        side["rttP50Median"] = rtt
        side["rttP95Values"] = [rtt] * 4
        side["rttP95Median"] = rtt
        side["frameCounts"] = [MEAS_FRAMES] * 4
        side["frameCountTotal"] = MEAS_FRAMES * 4
    write_json_abs(summary_path, summary)
    comparison_path = os.path.join(original, "comparison.json")
    comparison = read_json(comparison_path)
    comparison["validPairs"] = 4
    comparison["verdict"] = "NOT_RUN"
    comparison["reasons"] = [{
        "code": "E_PAIRS",
        "detail": "fewer than 5 valid pairs (4); the measurement is not decidable",
    }]
    ready_metric = comparison["metrics"]["readyMs"]
    ready_metric["baselineRounds"] = 4
    ready_metric["candidateRounds"] = 4
    ready_metric["baselineMedian"] = _median(MEAS_BASE_READY[:4])
    ready_metric["candidateMedian"] = _median(MEAS_CAND_READY[:4])
    ready_metric["limit"] = ready_metric["baselineMedian"] * 1.1 + 250
    ready_metric["marginMs"] = ready_metric["limit"] - ready_metric["candidateMedian"]
    ready_metric["pass"] = ready_metric["candidateMedian"] <= ready_metric["limit"]
    for name in ("frameRttP50Ms", "frameRttP95Ms"):
        comparison["metrics"][name]["baselineRounds"] = 4
        comparison["metrics"][name]["candidateRounds"] = 4
    pair_five = comparison["pairs"][4]
    pair_five["valid"] = False
    pair_five["reason"] = "E_COLLECTION_ERROR"
    pair_five["b"]["collectionError"] = dict(record["collectionError"])
    pair_five["b"]["exclusionReason"] = "E_COLLECTION_ERROR"
    write_json_abs(comparison_path, comparison)
    invalid_path = os.path.join(original, "invalid-rounds.json")
    invalid = read_json(invalid_path)
    invalid["count"] = 4
    invalid["rounds"] = list(invalid["rounds"]) + [
        {"file": "rounds/pair-5-A.json", "side": "A", "pairIndex": 5,
         "warmup": False, "reason": "E_COLLECTION_ERROR", "detail": None},
        {"file": "rounds/pair-5-B.json", "side": "B", "pairIndex": 5,
         "warmup": False, "reason": "E_COLLECTION_ERROR", "detail": None},
    ]
    write_json_abs(invalid_path, invalid)
    run_path = os.path.join(original, "run.json")
    run_json = read_json(run_path)
    run_json["verdict"] = "NOT_RUN"
    write_json_abs(run_path, run_json)
    for name in ("run.json", "summary.json", "comparison.json"):
        shutil.copyfile(os.path.join(original, name), os.path.join(proof_dir, name))


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
        with open(ux_path, encoding="utf-8") as handle:
            preserved = json.load(handle)
        not_run_record = [record for record in preserved["records"]
                          if record.get("caseId") == "E2E-39"][0]
        check("NOT_RUN evidence is preserved as NOT_RUN on disk",
              not_run_record.get("result") == "NOT_RUN"
              and not_run_record.get("executedBy") is None)

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
        write_results(run, legacy, ux)
        expect("escaping proofRef is refused", run, "local", 1)

        fake_repo = repo()
        run, legacy, ux = complete_local(fake_repo)
        ux[0]["proofRefs"] = []
        write_results(run, legacy, ux)
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

        # ---- T3 adversarial: borrowed, forged and mis-bound evidence ----
        adv_repo = repo()
        run, legacy, ux = complete_local(adv_repo)
        ux[0]["startedAt"] = "2026-10-24T10:00:09Z"
        ux[0]["finishedAt"] = "2026-10-24T10:00:01Z"
        write_results(run, legacy, ux)
        expect("reversed claim timeline is refused", run, "local", 1)

        adv_repo = repo()
        run, legacy, ux = complete_local(adv_repo)
        ux[0].update({"result": "NOT_RUN", "executedBy": None, "startedAt": None,
                      "finishedAt": None, "referenceSha256": None,
                      "receivedSha256": "a" * 64})
        write_results(run, legacy, ux)
        expect("NOT_RUN with a received hash is refused", run, "local", 1)

        adv_repo = repo()
        run, legacy, ux = complete_local(adv_repo)
        borrowed = ux_record("E2E-27", run, attempt_id="attempt-002")
        ux[0]["proofRefs"] = borrowed["proofRefs"]
        ux[0]["assertions"] = borrowed["assertions"]
        write_results(run, legacy, ux)
        expect("proof borrowed from another attempt is refused", run, "local", 1)

        adv_repo = repo()
        run, legacy, ux = complete_local(adv_repo)
        ux[0]["caseId"] = "e2e-27"
        write_results(run, legacy, ux)
        expect("case-folded caseId is not the planned case", run, "local", 1)

        adv_repo = repo()
        run, legacy, ux = complete_local(adv_repo)
        ux[0]["proofRefs"] = [ref.replace("/", "\\") for ref in ux[0]["proofRefs"]]
        write_results(run, legacy, ux)
        expect("backslash proofRefs are refused", run, "local", 1)

        adv_repo = repo()
        run, legacy, ux = complete_field(adv_repo)
        ux[0]["scope"] = "local_simulated"
        write_results(run, legacy, ux)
        expect("field record claiming the local scope is refused", run, "field", 1)

        adv_repo = repo()
        run, legacy, ux = complete_local(adv_repo)
        second = ux_record("E2E-27", run, attempt_id="attempt-002")
        write_results(run, legacy, ux + [second])
        expect("same case executed twice is a duplicate, not a merge", run, "local", 1)

        env_repo = repo()
        run, legacy, ux = complete_local(env_repo)
        plan_path = os.path.join(env_repo, *PLAN_REL.split("/"))
        os.remove(plan_path)
        os.makedirs(plan_path)
        expect("planning path that is a directory is an environment refusal",
               run, "local", 3)

        # ---- Round-12 B-02: prove the claimed properties, not the metadata
        # (1) original and received bytes DIFFER while each SHA is correct.
        unequal_repo = repo()
        run, legacy, ux = complete_local(unequal_repo)
        target = [entry for entry in ux if entry["caseId"] == "E2E-27"][0]
        other = b"different received bytes with a correct sha"
        put(run["run_root"], target["proofRefs"][1], other)
        target["receivedSha256"] = sha_bytes(other)
        write_results(run, legacy, ux)
        expect("original and received bytes differ (each SHA correct) is refused",
               run, "local", 1, expect_text="differ")

        # (2) every frozen step assertion deleted, one unknown id left behind.
        deleted_repo = repo()
        run, legacy, ux = complete_local(deleted_repo)
        target = [entry for entry in ux if entry["caseId"] == "E2E-30"][0]
        target["assertions"] = [{
            "id": "E2E-30-UNPLANNED", "expected": "x", "observed": "y",
            "result": "PASS", "proofRef": target["proofRefs"][0],
        }]
        write_results(run, legacy, ux)
        expect("deleting every frozen step and keeping an unknown id is refused",
               run, "local", 1, expect_text="S01")

        # (3) a replaced step id (-held) must not stand for the frozen step.
        held_repo = repo()
        run, legacy, ux = complete_local(held_repo)
        target = [entry for entry in ux if entry["caseId"] == "E2E-35"][0]
        target["assertions"][1]["id"] = "E2E-35-S02-held"
        write_results(run, legacy, ux)
        expect("a -held replacement id is refused even when a PASS remains",
               run, "local", 1, expect_text="non-canonical")

        # (4) lowercase sub-suffix ids are not canonical either.
        lower_repo = repo()
        run, legacy, ux = complete_local(lower_repo)
        target = [entry for entry in ux if entry["caseId"] == "E2E-27"][0]
        target["assertions"].append(dict(target["assertions"][0], id="E2E-27-S01b"))
        write_results(run, legacy, ux)
        expect("a lowercase step sub-suffix id is refused", run, "local", 1,
               expect_text="non-canonical")

        # (5) a measurement PASS with no raw/pair/summary, only proof text.
        fake_measure_repo = repo()
        run, legacy, ux = complete_local(fake_measure_repo)
        target = [entry for entry in ux if entry["caseId"] == "E2E-38"][0]
        proof_rel = "proof/E2E-38/%s/proof.txt" % run["attempt_id"]
        put(run["run_root"], proof_rel, b"proof text only")
        target.update({
            "proofRefs": [proof_rel],
            "assertions": [{"id": "E2E-38-UNKNOWN", "expected": "x", "observed": "y",
                            "result": "PASS", "proofRef": proof_rel}],
        })
        write_results(run, legacy, ux)
        expect("a measurement PASS without any raw data is refused",
               run, "local", 1)

        # (6) a deleted raw round in the original measurement.
        missing_raw_repo = repo()
        run, legacy, ux = complete_local(missing_raw_repo)
        os.remove(os.path.join(measurement_original_dir(run), "rounds", "pair-3-B.json"))
        expect("a missing recorded raw round is refused", run, "local", 1,
               expect_text="RAW_MISSING")

        # (7) a tampered summary claim in the original measurement.
        tamper_repo = repo()
        run, legacy, ux = complete_local(tamper_repo)
        summary_path = os.path.join(measurement_original_dir(run), "summary.json")
        with open(summary_path, encoding="utf-8") as handle:
            summary = json.load(handle)
        summary["sides"]["B"]["readyMsMedian"] += 500
        write_json(measurement_original_dir(run), "summary.json", summary)
        expect("a tampered summary number is refused", run, "local", 1,
               expect_text="TAMPERED")

        # (8) an early-Ready live window (the 09b shape).
        early_live_repo = repo()
        run, legacy, ux = complete_local(early_live_repo)
        early = live_round("A", 1)
        for index, sample in enumerate(early["samples"]):
            if index >= 9:
                sample["state"] = "Ready"
                sample["primary"] = "文件已接收完成，请保存"
        proof_live_rounds = os.path.join(
            run["run_root"], *measurement_proof_rel(run).split("/"), "live", "rounds")
        for base in (os.path.join(measurement_original_dir(run), "live", "rounds"),
                     proof_live_rounds):
            write_json(base, "pair-1-A.json", early)
        expect("an early-Ready live window is refused", run, "local", 1,
               expect_text="WINDOW_SHORT")

        # (9) a raw threshold breach that the record still claims as PASS.
        breach_repo = repo()
        run, legacy, ux = complete_local(breach_repo)
        for index in range(1, 6):
            path = os.path.join(measurement_original_dir(run), "rounds",
                                "pair-%d-B.json" % index)
            with open(path, encoding="utf-8") as handle:
                record = json.load(handle)
            for frame in record["frames"]:
                frame["settledAtMs"] = frame["t0Ms"] + 90
                frame["rttMs"] = 90
            write_json(measurement_original_dir(run), "rounds/pair-%d-B.json" % index, record)
        expect("a raw threshold breach is refused", run, "local", 1,
               expect_text="VERDICT_MISMATCH")

        # (10) a missing live leg raw file.
        missing_live_repo = repo()
        run, legacy, ux = complete_local(missing_live_repo)
        os.remove(os.path.join(measurement_original_dir(run), "live", "rounds", "pair-4-A.json"))
        expect("a missing live leg raw file is refused", run, "local", 1)

        # (11) Round-13 B-R1(a): a SELF-CONSISTENT NOT_RUN (four valid pairs,
        # every metric still passing) must be refused by the outer gate; the
        # calculator's "ok" only means the recomputation succeeded.
        notrun_repo = repo()
        run, legacy, ux = complete_local(notrun_repo)
        make_consistent_not_run(run)
        expect("a self-consistent NOT_RUN measurement is refused by the UX gate",
               run, "local", 1, expect_text="verdict")

        # ---- Round-13 A13-01 / B-R1: real CLI + real validate_ux_record ----
        if not root11_available():
            check("preflight: root11 measurement/context/proof available", False,
                  "root11 evidence is missing; the round-13 real negatives cannot run")
        else:
            # Positive: the real root11 evidence still recomputes clean with
            # the real run context (no regression from the binding fix).
            code, payload, out, err = run_calc(ROOT11_RUN, ROOT11_MEAS)
            check("A13-01 root11 real measurement + real context recomputes clean",
                  code == 0 and (payload or {}).get("ok") is True
                  and not violation_codes(payload),
                  "exit=%s\nstdout:\n%s\nstderr:\n%s"
                  % (code, out[:4000], err[:2000]))

            # Positive: an untouched OS-temp copy must also pass, so the
            # copy mechanics themselves never change the verdict.
            temp = repo()
            run_root, meas_dir = copy_root11_measurement(temp)
            code, payload, out, err = run_calc(run_root, meas_dir)
            check("A13-01 an untampered root11 copy still recomputes clean",
                  code == 0 and (payload or {}).get("ok") is True,
                  "exit=%s\nstdout:\n%s\nstderr:\n%s"
                  % (code, out[:4000], err[:2000]))

            # Negatives: each build/input/media/live identity is tampered in
            # an OS-temp copy; the REAL CLI with the REAL root11 context must
            # refuse and name the binding (empty expected is never a pass).
            for kind, expected_code in (
                ("product", "E_BUILD_BINDING"),
                ("candidate-missing", "E_BUILD_BINDING"),
                ("input", "E_INPUT_BINDING"),
                ("media", "E_INPUT_BINDING"),
                ("live", "E_LIVE_INPUT_BINDING"),
            ):
                temp = repo()
                run_root, meas_dir = copy_root11_measurement(temp)
                tamper_binding(kind, meas_dir)
                code, payload, out, err = run_calc(run_root, meas_dir)
                codes = violation_codes(payload)
                check("A13-01 %s tamper is refused by the real CLI (names %s)"
                      % (kind, expected_code),
                      code != 0 and expected_code in codes,
                      "exit=%s codes=%s\nstdout:\n%s\nstderr:\n%s"
                      % (code, codes, out[:4000], err[:2000]))

            # B-R1(b): the redundant rttMs is cross-checked against the raw
            # timestamps; a self-consistent zero-RTT lie is refused.
            temp = repo()
            run_root, meas_dir = copy_root11_measurement(temp)
            zero_round_rtt_with_claims(meas_dir)
            code, payload, out, err = run_calc(run_root, meas_dir)
            round_codes = recomputed_round_codes(payload)
            check("B-R1(b) self-consistent rttMs=0 (raw timestamps unchanged) is refused",
                  code != 0 and "E_RTT_MISMATCH" in round_codes,
                  "exit=%s round codes=%s\nstdout:\n%s\nstderr:\n%s"
                  % (code, round_codes, out[:6000], err[:2000]))

            # B-R1(b): a settlement before its own submission is refused.
            temp = repo()
            run_root, meas_dir = copy_root11_measurement(temp)
            settle_before_submit(meas_dir)
            code, payload, out, err = run_calc(run_root, meas_dir)
            round_codes = recomputed_round_codes(payload)
            check("B-R1(b) settledAtMs < t0Ms is refused by the real CLI",
                  code != 0 and "E_RTT" in round_codes,
                  "exit=%s round codes=%s\nstdout:\n%s\nstderr:\n%s"
                  % (code, round_codes, out[:6000], err[:2000]))

            # B-R1(a): a self-consistent FAIL (75060ms vs 17528.8ms limit)
            # must be refused by the REAL validate_ux_record, not accepted
            # because the calculator exited 0.
            temp = repo()
            fail_root, _fail_meas = make_root11_consistent_fail(temp)
            fail_violations = validate_record_violations(
                root11_e2e38_record(), measurement_scenario(),
                root11_context_payload(fail_root))
            check("B-R1(a) consistent FAIL is refused by the real validate_ux_record",
                  any("verdict" in violation and "FAIL" in violation
                      for violation in fail_violations),
                  "violations:\n%s" % "\n".join(fail_violations)[:6000])

            # Positive: the real root11 record + measurement still has zero
            # violations through the same real function.
            positive_violations = validate_record_violations(
                root11_e2e38_record(), measurement_scenario(),
                root11_context_payload(ROOT11_RUN))
            check("B-R1(a) root11 real E2E-38 record + measurement has zero violations",
                  positive_violations == [],
                  "violations:\n%s" % "\n".join(positive_violations)[:6000])

        # ---- T5 (S4): a junction inside the run root must not redirect
        # proof reads. The outside file deliberately MATCHES the record's
        # received hash, so only realpath containment can refuse it.
        junction_repo = repo()
        run, legacy, ux = complete_local(junction_repo)
        outside = os.path.join(junction_repo, "outside-proof")
        os.makedirs(outside)
        with open(os.path.join(outside, "received.bin"), "wb") as handle:
            handle.write(b"E2E-27-payload")
        link = os.path.join(run["run_root"], "proof", "E2E-27",
                            run["attempt_id"], "link")
        created = False
        try:
            import _winapi
            _winapi.CreateJunction(outside, link)
            created = True
        except Exception as error:  # noqa: BLE001 - host may forbid junctions
            print("note: junction creation unavailable (%s); "
                  "realpath containment is exercised by the node suite" % error)
        if created:
            original_ref = ux[0]["proofRefs"][0]
            assertion_refs = ux[0]["proofRefs"][2:]
            ux[0]["proofRefs"] = [
                original_ref,
                "proof/E2E-27/%s/link/received.bin" % run["attempt_id"],
            ] + assertion_refs
            write_results(run, legacy, ux)
            expect("junction inside the run root cannot redirect proof reads",
                   run, "local", 1)

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

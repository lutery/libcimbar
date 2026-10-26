#!/usr/bin/env python3
"""Stage-5 UX evidence gate (recipe A total exit).

Enforces, for one frozen v2 plan + one run root:
  * the run context is valid for the gate: local requires phase == final,
    field requires phase == field; the context is validated by the same
    e2e/run-context.mjs parser the runner/recorder use (single source of
    truth); product/input manifest digests are re-hashed from disk
  * ux-results.json: exact top-level structure, per-record frozen-plan
    contract (scope/executor/caseType/acceptanceIds), attempt binding
    (proof under proof/<caseId>/<attemptId>/), every proofRef/assertion on
    disk, assertion-level PASS, and file_roundtrip artifacts re-hashed
  * the legacy gate (verify-evidence.py) on results.json with the same plan
A missing UX id, an unplanned id, an upgraded scope/executor/caseType,
metadata-equal hashes without real bytes, an assertion without proof, a
stale phase and an unbound legacy threshold all fail (exit 1). A missing
context/manifest is an environment refusal (exit 3); bad CLI is exit 2.
Reading never writes; NOT_RUN records are never rewritten anywhere.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
VERIFY_LEGACY = os.path.join(HERE, "verify-evidence.py")
RUN_CONTEXT_CLI = os.path.join(HERE, "e2e", "run-context.mjs")
CALC_CLI = os.path.join(HERE, "e2e", "measure-ux-calc.mjs")

ITERATION_ID = "receiver-ux-v2"
GATE_PHASES = {"local": "final", "field": "field"}
LEGACY_RANGES = {"local": (1, 20), "field": (21, 26)}
SCOPES = {"unit_integration", "local_simulated", "real_cloud", "document_qa"}
EXECUTORS = {
    "unit_integration": {"executor"},
    "local_simulated": {"executor"},
    "real_cloud": {"user"},
    "document_qa": {"executor"},
}
CASE_TYPES = {"file_roundtrip", "negative_or_lifecycle", "measurement"}
ACCEPTANCE_IDS = {"AC-%03d" % number for number in range(15, 25)}
UX_RECORD_FIELDS = [
    "caseId", "attemptId", "scope", "caseType", "result", "executedBy",
    "acceptanceIds", "productManifestSha256", "startedAt", "finishedAt",
    "proofRefs", "assertions", "referenceSha256", "receivedSha256", "notes",
]
UX_TOP_FIELDS = {"version", "iterationId", "runId", "productManifestSha256", "records"}
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
TIMESTAMP_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$")


class ContextError(Exception):
    """Environment/context refusal: the gate cannot even run (exit 3)."""


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_hex64(value):
    return isinstance(value, str) and SHA_RE.fullmatch(value) is not None


def canonical_rel(value):
    """Mirror of the node rule: canonical repository-relative path."""
    if not isinstance(value, str) or not value:
        return False
    if any(ord(char) < 32 for char in value):
        return False
    if "\\" in value or "://" in value:
        return False
    if re.match(r"^[A-Za-z]:", value):
        return False
    if value.startswith("/"):
        return False
    return all(segment not in ("", ".", "..") for segment in value.split("/"))


def resolve_inside(root, rel):
    """Resolve a canonical relative path and require it to stay under root.

    Mirrors the node parser: containment is checked against the REAL path of
    the deepest existing ancestor, so a junction inside the run root that
    points outside cannot redirect proof reads.
    """
    if not canonical_rel(rel):
        return None
    root_norm = os.path.normpath(root)
    candidate = os.path.normpath(os.path.join(root_norm, *rel.split("/")))
    if candidate != root_norm and not candidate.lower().startswith(root_norm.lower() + os.sep):
        return None
    probe = candidate
    while probe and not os.path.exists(probe):
        parent = os.path.dirname(probe)
        if parent == probe:
            probe = ""
            break
        probe = parent
    root_probe = root_norm
    while root_probe and not os.path.exists(root_probe):
        parent = os.path.dirname(root_probe)
        if parent == root_probe:
            root_probe = ""
            break
        root_probe = parent
    if probe and root_probe:
        real = os.path.realpath(probe)
        real_root = os.path.realpath(root_probe)
        if real != real_root and not real.lower().startswith(real_root.lower() + os.sep):
            return None
    return candidate


def load_context(context_path, repo_root):
    """Parse + validate the context through the shared node parser."""
    node = shutil.which("node")
    if not node:
        raise ContextError("node not found on PATH; the shared run-context parser is required")
    command = [node, RUN_CONTEXT_CLI, "--validate", context_path]
    if repo_root:
        command += ["--repo-root", repo_root]
    try:
        proc = subprocess.run(command, capture_output=True, timeout=30)
    except subprocess.TimeoutExpired:
        raise ContextError("run-context validation timed out after 30s")
    stdout = proc.stdout.decode("utf-8", "replace")
    stderr = proc.stderr.decode("utf-8", "replace")
    if proc.returncode != 0:
        raise ContextError(stderr.strip() or "run-context validation failed (exit %d)" % proc.returncode)
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError:
        raise ContextError("run-context validation printed invalid JSON: %s" % stdout[:400])
    for field in ("identity", "context", "repoRoot", "abs"):
        if field not in payload:
            raise ContextError("run-context validation output lacks %s" % field)
    return payload


def verify_product_files(data, staging_root):
    """Re-hash every product file named by the manifest; refuse format drift."""
    violations = []
    try:
        manifest = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return ["product manifest is not valid JSON"]
    if manifest.get("version") != 1 or manifest.get("iterationId") != ITERATION_ID:
        return ["product manifest version/iterationId do not match the frozen contract"]
    base = manifest.get("base")
    if not canonical_rel(base):
        return ["product manifest base is not a canonical relative path: %r" % (base,)]
    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        return ["product manifest needs a non-empty files array"]
    seen = set()
    paths = []
    for entry in files:
        if not isinstance(entry, dict):
            violations.append("product manifest entries must be objects")
            continue
        rel = entry.get("path")
        if not canonical_rel(rel):
            violations.append("product manifest file path is not canonical: %r" % (rel,))
            continue
        if rel in seen:
            violations.append("duplicate product manifest entry: %s" % rel)
        seen.add(rel)
        if not is_hex64(entry.get("sha256")):
            violations.append("product manifest entry lacks a 64-hex sha256: %s" % rel)
        paths.append(rel)
    for previous, current in zip(paths, paths[1:]):
        if not previous < current:
            violations.append("product manifest files are not sorted: %s then %s" % (previous, current))
            break
    base_abs = resolve_inside(staging_root, base)
    if base_abs is None:
        violations.append("product manifest base escapes the staging root: %s" % base)
        return violations
    for entry in files:
        if not isinstance(entry, dict):
            continue
        rel = entry.get("path")
        if not canonical_rel(rel):
            continue
        file_abs = resolve_inside(base_abs, rel)
        if file_abs is None:
            violations.append("product manifest entry escapes the base: %s" % rel)
            continue
        if not os.path.isfile(file_abs):
            violations.append("product file not found under staging: %s" % rel)
        elif sha_file(file_abs) != entry.get("sha256"):
            violations.append("product file SHA-256 mismatch: %s" % rel)
    return violations


def verify_bindings(context_payload, violations):
    """Context-level build/input bindings, re-hashed from disk."""
    context = context_payload["context"]
    abs_paths = context_payload["abs"]
    if context["productManifest"] is None or context["productManifestSha256"] is None:
        violations.append("run context does not bind a product manifest")
    else:
        path = abs_paths["productManifest"]
        if not os.path.isfile(path):
            violations.append("product manifest not found: %s" % context["productManifest"])
        else:
            with open(path, "rb") as handle:
                data = handle.read()
            if sha_bytes(data) != context["productManifestSha256"]:
                violations.append("product manifest SHA-256 does not match the run context")
            else:
                violations.extend(verify_product_files(data, abs_paths["stagingRoot"]))
    if context["inputManifest"] is None or context["inputManifestSha256"] is None:
        violations.append("run context does not bind an input manifest")
    else:
        path = abs_paths["inputManifest"]
        if not os.path.isfile(path):
            violations.append("input manifest not found: %s" % context["inputManifest"])
        elif sha_file(path) != context["inputManifestSha256"]:
            violations.append("input manifest SHA-256 does not match the run context")


def load_plan(planning_path, gate, violations):
    """Read the frozen machine plan and derive the per-gate required lists."""
    if not os.path.isfile(planning_path):
        raise ContextError("planning file not found: %s" % planning_path)
    try:
        with open(planning_path, encoding="utf-8") as handle:
            plan = json.load(handle)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ContextError("planning file is not a readable JSON file: %s (%s)"
                           % (planning_path, error))
    gate_config = (plan.get("gates") or {}).get(gate)
    if not isinstance(gate_config, dict):
        violations.append("plan has no gate configuration for %s" % gate)
        gate_config = {}
    ux_required = gate_config.get("uxRequired")
    legacy_required = gate_config.get("legacyRequired")
    if not isinstance(ux_required, list) or not ux_required:
        violations.append("gate %s has an empty/invalid uxRequired list; it cannot exempt the UX gate" % gate)
        ux_required = []
    if not isinstance(legacy_required, list) or not legacy_required:
        violations.append("gate %s has an empty/invalid legacyRequired list" % gate)
        legacy_required = []
    scenarios = {}
    for scenario in plan.get("e2eScenarios") or []:
        case_id = scenario.get("id") or scenario.get("caseId")
        if case_id:
            scenarios[case_id] = scenario
    derived_ux = [
        case_id for case_id, scenario in scenarios.items()
        if scenario.get("gate") == gate and scenario.get("required")
        and case_id not in legacy_required
    ]
    for case_id in derived_ux:
        if case_id not in ux_required:
            violations.append(
                "plan lists %s as a required %s UX scenario but omits it from uxRequired" % (case_id, gate))
    for case_id in ux_required:
        scenario = scenarios.get(case_id)
        if scenario is None:
            violations.append("uxRequired %s has no scenario in the plan" % case_id)
        elif scenario.get("gate") != gate or not scenario.get("required"):
            violations.append("uxRequired %s is not a required %s scenario" % (case_id, gate))
    low, high = LEGACY_RANGES[gate]
    for case_id in legacy_required:
        match = re.fullmatch(r"E2E-(\d+)", str(case_id))
        scenario = scenarios.get(case_id)
        if not match or scenario is None:
            violations.append("legacyRequired %s has no E2E scenario in the plan" % case_id)
        elif not low <= int(match.group(1)) <= high:
            violations.append("legacyRequired %s is outside the %s legacy range" % (case_id, gate))
    return {"scenarios": scenarios, "ux_required": ux_required, "legacy_required": legacy_required}


def load_ux_results(run_root, context, violations):
    """Read ux-results.json (separate from the v1 results.json)."""
    path = os.path.join(run_root, "ux-results.json")
    if not os.path.isfile(path):
        violations.append("no ux-results.json in the run root; UX evidence is separate from results.json")
        return None
    try:
        with open(path, encoding="utf-8") as handle:
            payload = json.load(handle)
    except (UnicodeDecodeError, json.JSONDecodeError):
        violations.append("ux-results.json is not valid JSON")
        return None
    if not isinstance(payload, dict):
        violations.append("ux-results.json must be a JSON object")
        return None
    missing = UX_TOP_FIELDS - set(payload)
    extra = set(payload) - UX_TOP_FIELDS
    if missing or extra:
        violations.append("ux-results.json top-level fields mismatch: missing %s extra %s"
                          % (sorted(missing), sorted(extra)))
    if payload.get("version") != 1:
        violations.append("ux-results.json version must be 1")
    if payload.get("iterationId") != ITERATION_ID:
        violations.append("ux-results.json iterationId must be %s" % ITERATION_ID)
    if payload.get("runId") != context["runId"]:
        violations.append("ux-results.json runId %r does not match the run context %r"
                          % (payload.get("runId"), context["runId"]))
    if payload.get("productManifestSha256") != context["productManifestSha256"]:
        violations.append("ux-results.json productManifestSha256 does not match the run context")
    records = payload.get("records")
    if not isinstance(records, list):
        violations.append("ux-results.json records must be an array")
        return None
    return payload


def is_timestamp(value):
    return isinstance(value, str) and TIMESTAMP_RE.fullmatch(value) is not None


def parse_timestamp(value):
    from datetime import datetime
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


# --- round-12 B-02 helpers -------------------------------------------------

def assertion_step(case_id, assertion_id):
    """Classify one assertion id against the frozen step-id convention.

    Returns (step_number, canonical):
      * (n, True)  for the canonical form `<caseId>-S<n>` or `<caseId>-S<n>-<A-Z>`
      * (None, True) for a supplementary id that does not claim a step at all
      * (None, False) for a step-shaped but non-canonical id (`-S02-held`,
        `-S01b`, `-S04-stop`, ...): a replacement id can never stand for a
        frozen step it did not execute.
    """
    prefix = "%s-S" % case_id
    if assertion_id != prefix and not assertion_id.startswith(prefix):
        return (None, True)
    rest = assertion_id[len(prefix):]
    match = re.fullmatch(r"(\d+)(?:-([A-Z]))?", rest)
    if not match:
        return (None, False)
    return (int(match.group(1)), True)


def check_step_coverage(case_id, scenario, assertions, prefix, violations):
    """Every frozen step needs its own PASS assertion; no fake replacements."""
    steps = scenario.get("steps")
    if not isinstance(steps, list) or not steps:
        violations.append(prefix + "the frozen plan declares no steps for this case;"
                          " complete coverage cannot be proven")
        return
    required = set(range(1, len(steps) + 1))
    covered = set()
    for assertion in assertions:
        if not isinstance(assertion, dict):
            continue
        assertion_id = assertion.get("id")
        if not isinstance(assertion_id, str):
            continue
        number, canonical = assertion_step(case_id, assertion_id)
        if not canonical:
            violations.append(prefix + "assertion id %r is a non-canonical/replaced step id"
                              " (expected %s-S{n} or %s-S{n}-<A-Z>)" % (assertion_id, case_id, case_id))
            continue
        if number is None:
            continue
        if number not in required:
            violations.append(prefix + "assertion id %r claims step S%d which the frozen case"
                              " does not have" % (assertion_id, number))
            continue
        covered.add(number)
    for number in sorted(required - covered):
        violations.append(prefix + "frozen step S%02d has no PASS assertion covering it" % number)


def measurement_dir_of_ref(ref):
    """The measurement directory a proofRef points into (if any)."""
    norm = ref.replace("\\", "/")
    for suffix in ("/live/summary.json", "/summary.json", "/comparison.json"):
        if norm.endswith(suffix):
            base = norm[: -len(suffix)]
            if suffix == "/live/summary.json":
                return base[:-len("/live")] if base.endswith("/live") else None
            return base if base.endswith("/measurements") else None
    return None


def run_measurement_recompute(measurement_rel, context_payload, context_path, repo_root,
                              prefix, violations):
    """Re-run the pure calculator over the raw files (B-02).

    The calculator re-derives every recorded number and live-side verdict and
    refuses a tampered summary, a missing raw pair file, a short/early-Ready
    live window and an input/build that is no longer bound to this context.
    """
    run_root = context_payload["abs"]["runRoot"]
    measurement_abs = resolve_inside(run_root, measurement_rel)
    if measurement_abs is None or not os.path.isdir(measurement_abs):
        violations.append(prefix + "measurement evidence directory not found on disk: %s"
                          % measurement_rel)
        return
    for required in ("summary.json", "comparison.json",
                     os.path.join("live", "summary.json")):
        if not os.path.isfile(os.path.join(measurement_abs, required)):
            violations.append(prefix + "measurement evidence is incomplete: missing %s"
                              % required.replace(os.sep, "/"))
    node = shutil.which("node")
    if not node:
        violations.append(prefix + "measurement recompute needs node on PATH")
        return
    method_abs = context_payload["abs"]["methodFile"]
    command = [node, CALC_CLI, "--recompute", run_root, measurement_abs,
               "--method", method_abs]
    if context_path:
        command += ["--context", context_path]
    if repo_root:
        command += ["--repo-root", repo_root]
    try:
        proc = subprocess.run(command, capture_output=True, timeout=180)
    except subprocess.TimeoutExpired:
        violations.append(prefix + "measurement recompute timed out after 180s")
        return
    stdout = proc.stdout.decode("utf-8", "replace")
    stderr = proc.stderr.decode("utf-8", "replace")
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError:
        payload = None
    if payload is None:
        violations.append(prefix + "measurement recompute printed no JSON (exit %d): %s"
                          % (proc.returncode, (stderr or stdout)[:300]))
        return
    if proc.returncode != 0 or payload.get("ok") is not True:
        entries = payload.get("violations") or []
        shown = 0
        for entry in entries:
            if shown >= 12:
                violations.append(prefix + "measurement recompute: ... and %d more"
                                  % (len(entries) - shown))
                break
            if isinstance(entry, dict):
                violations.append(prefix + "measurement recompute refused [%s]: %s"
                                  % (entry.get("code"), str(entry.get("detail"))[:240]))
                shown += 1
        if shown == 0:
            violations.append(prefix + "measurement recompute refused (exit %d)" % proc.returncode)


def validate_ux_record(record, scenario, context_payload, gate, violations,
                       context_path=None, repo_root=None):
    """One UX record against the frozen plan contract and real disk state."""
    case_id = record.get("caseId")
    prefix = "%s: " % case_id
    missing = [field for field in UX_RECORD_FIELDS if field not in record]
    if missing:
        violations.append(prefix + "record lacks required fields: %s" % ", ".join(missing))
    planned_type = scenario.get("caseType")
    planned_scope = scenario.get("scope")
    planned_executor = scenario.get("executorRole")
    planned_ac = set(scenario.get("acceptanceIds") or [])
    result = record.get("result")
    if result != "PASS":
        violations.append(prefix + "the %s gate requires result PASS (got %r)" % (gate, result))
    if record.get("scope") != planned_scope:
        violations.append(prefix + "scope must be %s per the plan (got %r)" % (planned_scope, record.get("scope")))
    if record.get("executedBy") != planned_executor:
        violations.append(prefix + "executedBy must be %s per the plan (got %r)" % (planned_executor, record.get("executedBy")))
    if not planned_type:
        violations.append(prefix + "the plan does not declare a caseType")
    elif record.get("caseType") != planned_type:
        violations.append(prefix + "caseType must be %s per the plan (got %r)" % (planned_type, record.get("caseType")))
    if record.get("productManifestSha256") != context_payload["context"]["productManifestSha256"]:
        violations.append(prefix + "productManifestSha256 does not match the run context")
    acceptance = record.get("acceptanceIds")
    if not isinstance(acceptance, list) or not acceptance:
        violations.append(prefix + "acceptanceIds must be a non-empty array")
    else:
        unknown = [value for value in acceptance if value not in ACCEPTANCE_IDS]
        if unknown:
            violations.append(prefix + "acceptanceIds outside AC-015..AC-024: %s" % unknown)
        if set(acceptance) != planned_ac:
            violations.append(prefix + "acceptanceIds %s do not match the plan %s"
                              % (sorted(set(acceptance)), sorted(planned_ac)))
    attempt_id = record.get("attemptId")
    if not isinstance(attempt_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", attempt_id):
        violations.append(prefix + "attemptId has an invalid shape: %r" % (attempt_id,))

    if result == "NOT_RUN":
        for field in ("executedBy", "startedAt", "finishedAt", "referenceSha256", "receivedSha256"):
            if record.get(field) is not None:
                violations.append(prefix + "NOT_RUN must leave %s null" % field)
        if not isinstance(record.get("notes"), str) or not record.get("notes").strip():
            violations.append(prefix + "NOT_RUN must explain the reason in notes")
        # A NOT_RUN record may carry no assertions at all, but it must never
        # carry PASS assertions that pretend a frozen step was executed.
        assertions = record.get("assertions")
        if isinstance(assertions, list):
            fake = [entry for entry in assertions
                    if isinstance(entry, dict) and entry.get("result") == "PASS"]
            if fake:
                violations.append(prefix + "NOT_RUN must not carry PASS assertions"
                                  " (fake step coverage)")
        return
    for field in ("startedAt", "finishedAt"):
        if not is_timestamp(record.get(field)):
            violations.append(prefix + "%s must be an ISO-8601 timestamp with a zone" % field)
    if is_timestamp(record.get("startedAt")) and is_timestamp(record.get("finishedAt")):
        if parse_timestamp(record["finishedAt"]) < parse_timestamp(record["startedAt"]):
            violations.append(prefix + "finishedAt is before startedAt")
    proof_refs = record.get("proofRefs")
    if not isinstance(proof_refs, list) or not proof_refs:
        violations.append(prefix + "a terminal record needs at least one proof reference")
        proof_refs = []
    attempt_prefix = "proof/%s/%s/" % (case_id, attempt_id)
    run_root = context_payload["abs"]["runRoot"]
    for ref in proof_refs:
        path = resolve_inside(run_root, ref) if canonical_rel(ref) else None
        if path is None:
            violations.append(prefix + "proofRef is not a canonical path inside the run root: %r" % (ref,))
            continue
        if not ref.startswith(attempt_prefix):
            violations.append(prefix + "proofRef is outside the claimed attempt directory %s: %s"
                              % (attempt_prefix, ref))
        if not os.path.isfile(path):
            violations.append(prefix + "proofRef not found on disk: %s" % ref)
    if planned_type == "file_roundtrip":
        if len(proof_refs) < 2:
            violations.append(prefix + "file_roundtrip needs the original and received files as the first two proofRefs")
        else:
            for label, ref, expected in (
                ("reference", proof_refs[0], record.get("referenceSha256")),
                ("received", proof_refs[1], record.get("receivedSha256")),
            ):
                if not is_hex64(expected):
                    violations.append(prefix + "%sSha256 must be 64 lowercase hex" % label)
                    continue
                path = resolve_inside(run_root, ref) if canonical_rel(ref) else None
                if path is None or not os.path.isfile(path):
                    violations.append(prefix + "%s artifact not found on disk: %r" % (label, ref))
                elif sha_file(path) != expected:
                    violations.append(prefix + "%s artifact SHA-256 does not match the record" % label)
            # Round-12 B-02: re-hashing each side against its own claim is not
            # enough - the original and the received bytes must be EQUAL.
            reference_sha = record.get("referenceSha256")
            received_sha = record.get("receivedSha256")
            if is_hex64(reference_sha) and is_hex64(received_sha) and reference_sha != received_sha:
                violations.append(prefix + "the original and received artifacts differ"
                                  " (referenceSha256 != receivedSha256): a roundtrip must reproduce"
                                  " the original bytes")
    else:
        for field in ("referenceSha256", "receivedSha256"):
            value = record.get(field)
            if value is not None and not is_hex64(value):
                violations.append(prefix + "%s must be null or 64 lowercase hex" % field)

    assertions = record.get("assertions")
    if not isinstance(assertions, list) or not assertions:
        violations.append(prefix + "record PASS needs assertion-level evidence (assertions is empty)")
    else:
        for index, assertion in enumerate(assertions):
            label = prefix + "assertion[%d]" % index
            if not isinstance(assertion, dict):
                violations.append(label + " must be an object")
                continue
            for field in ("id", "expected", "observed", "result", "proofRef"):
                if field not in assertion:
                    violations.append(label + " lacks %s" % field)
            for field in ("id", "expected", "observed"):
                value = assertion.get(field)
                if not isinstance(value, str) or not value.strip():
                    violations.append(label + " %s must be a non-empty string" % field)
            if assertion.get("result") != "PASS":
                violations.append(label + " result must be PASS (got %r)" % assertion.get("result"))
            ref = assertion.get("proofRef")
            path = resolve_inside(run_root, ref) if canonical_rel(ref) else None
            if path is None:
                violations.append(label + " proofRef is not canonical inside the run root: %r" % (ref,))
                continue
            if not ref.startswith(attempt_prefix):
                violations.append(label + " proofRef is outside the claimed attempt directory: %s" % ref)
            if not os.path.isfile(path):
                violations.append(label + " proofRef not found on disk: %s" % ref)
        # Round-12 B-02: every frozen step of this case must be covered by a
        # canonical step assertion; a deleted step or a replaced id
        # (`-held`, lowercase suffix) fails even when the record still passes.
        check_step_coverage(case_id, scenario, assertions, prefix, violations)
    if planned_type == "measurement" and result == "PASS":
        method_abs = context_payload["abs"]["methodFile"]
        method_rel = context_payload["context"]["methodFile"]
        if not os.path.isfile(method_abs):
            violations.append(prefix + "measurement PASS requires the frozen method file: %s" % method_rel)
        else:
            try:
                with open(method_abs, encoding="utf-8") as handle:
                    method = json.load(handle)
            except (UnicodeDecodeError, json.JSONDecodeError):
                violations.append(prefix + "measurement method file is not valid JSON: %s" % method_rel)
            else:
                if method.get("frozen") is not True:
                    violations.append(prefix + "measurement PASS requires method.frozen == true")
        # Round-12 B-02: a measurement PASS must bind the COMPLETE raw
        # measurement (recorded pairs + the 5x30s live window) and the gate
        # re-runs the calculator over those raw files instead of trusting the
        # written verdict.
        measurement_dirs = []
        for ref in proof_refs:
            if not isinstance(ref, str) or not canonical_rel(ref):
                continue
            directory = measurement_dir_of_ref(ref)
            if directory and directory not in measurement_dirs:
                measurement_dirs.append(directory)
        if not measurement_dirs:
            violations.append(prefix + "measurement PASS needs its summary/comparison/live"
                              " files under proof/<caseId>/<attempt>/measurements/")
        else:
            live_bound = any(str(ref).replace("\\", "/").endswith("/measurements/live/summary.json")
                             for ref in proof_refs if isinstance(ref, str))
            if not live_bound:
                violations.append(prefix + "measurement PASS must bind the live 5x30s summary"
                                  " as a proofRef")
            for directory in measurement_dirs:
                run_measurement_recompute(directory, context_payload, context_path,
                                          repo_root, prefix, violations)


def run_legacy_gate(context_payload, gate):
    """Run the existing v1 gate on results.json with the same frozen plan."""
    context = context_payload["context"]
    abs_paths = context_payload["abs"]
    command = [
        sys.executable, VERIFY_LEGACY,
        "--run", abs_paths["runRoot"],
        "--gate", gate,
        "--planning", abs_paths["planningFile"],
    ]
    if context.get("legacyThresholdFile"):
        command += ["--thresholds", abs_paths["legacyThresholdFile"]]
    return subprocess.run(command, capture_output=True)


def run_gate(context_payload, gate, context_path=None, repo_root=None):
    """Return every violation; an empty list is the only PASS."""
    violations = []
    context = context_payload["context"]
    identity = context_payload["identity"]
    run_root = context_payload["abs"]["runRoot"]
    if identity["phase"] != GATE_PHASES[gate]:
        violations.append("phase %r cannot prove the %s gate (requires phase %r)"
                          % (identity["phase"], gate, GATE_PHASES[gate]))
    verify_bindings(context_payload, violations)
    plan = load_plan(context_payload["abs"]["planningFile"], gate, violations)
    if context.get("legacyThresholdFile") and context.get("legacyThresholdFile") == context.get("methodFile"):
        violations.append("the frozen UX method file cannot stand in for the legacy performance threshold")
    payload = load_ux_results(run_root, context, violations)
    records = (payload or {}).get("records") or []
    by_id = {}
    for record in records:
        if not isinstance(record, dict):
            violations.append("ux-results records must be objects")
            continue
        case_id = record.get("caseId")
        if case_id in by_id:
            violations.append("duplicate ux-results record for %s" % case_id)
            continue
        by_id[case_id] = record
    for case_id in plan["ux_required"]:
        record = by_id.get(case_id)
        if record is None:
            violations.append("missing UX record for required case %s" % case_id)
            continue
        scenario = plan["scenarios"].get(case_id) or {}
        validate_ux_record(record, scenario, context_payload, gate, violations,
                           context_path=context_path, repo_root=repo_root)
    planned = set(plan["ux_required"])
    for case_id in by_id:
        if case_id not in planned:
            violations.append("unplanned UX record %r in ux-results.json" % (case_id,))
    legacy = run_legacy_gate(context_payload, gate)
    if legacy.returncode != 0:
        violations.append("legacy gate failed (exit %d); results.json is still governed by verify-evidence.py"
                          % legacy.returncode)
        text = (legacy.stdout + legacy.stderr).decode("utf-8", "replace")
        for line in [line for line in text.splitlines() if line.strip()][:40]:
            violations.append("legacy: " + line)
    return violations


def main():
    parser = argparse.ArgumentParser(
        description="Stage-5 UX evidence gate (recipe A total exit).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--context", required=True,
                        help="validated run-context.json for this run")
    parser.add_argument("--gate", required=True, choices=("local", "field"),
                        help="local requires phase=final; field requires phase=field")
    parser.add_argument("--repo-root", default=None,
                        help="resolve repo-relative context paths against this directory (tests/development)")
    args = parser.parse_args()
    try:
        context_payload = load_context(args.context, args.repo_root)
    except ContextError as error:
        print("CONTEXT REFUSED: %s" % error, file=sys.stderr)
        return 3
    try:
        violations = run_gate(context_payload, args.gate,
                              context_path=args.context, repo_root=args.repo_root)
    except ContextError as error:
        print("CONTEXT REFUSED: %s" % error, file=sys.stderr)
        return 3
    if violations:
        print("UX GATE %s: FAIL (%d violation(s))" % (args.gate, len(violations)))
        for violation in violations:
            print("  - %s" % violation)
        return 1
    print("UX GATE %s: PASS" % args.gate)
    return 0


if __name__ == "__main__":
    sys.exit(main())
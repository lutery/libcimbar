"""Validate design metadata only; this is not a product or E2E test runner."""
import copy
import hashlib
import json
from pathlib import Path

from jsonschema import Draft202012Validator


CONTRACTS = Path(__file__).resolve().parent
REPO = Path(__file__).resolve().parents[4]


def reject_nonfinite(value):
    raise ValueError(f"Non-JSON numeric constant: {value}")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_nonfinite)


def semantic_digest(value):
    canonical = json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def main():
    schema = read_json(CONTRACTS / "ux-telemetry.schema.json")
    Draft202012Validator.check_schema(schema)
    defs = schema["$defs"]
    def check_refs(value):
        if isinstance(value, dict):
            if "$ref" in value:
                assert value["$ref"].startswith("#/$defs/")
                assert value["$ref"][len("#/$defs/"):] in defs
            for child in value.values():
                check_refs(child)
        elif isinstance(value, list):
            for child in value:
                check_refs(child)
    check_refs(schema)
    validators = {
        name: Draft202012Validator({"$defs": defs, "$ref": f"#/$defs/{name}"})
        for name in defs
    }
    errors = []
    examples = read_json(CONTRACTS / "examples.json")["examples"]
    vectors = read_json(CONTRACTS / "validation-vectors.json")
    ids = [row["id"] for row in examples]
    assert len(ids) == len(set(ids)), "Duplicate example ids"
    vector_ids = [row["id"] for row in vectors["vectors"]]
    assert len(vector_ids) == len(set(vector_ids)), "Duplicate vector ids"
    for row in examples:
        issues = list(validators[row["definition"]].iter_errors(row["data"]))
        if issues:
            errors.append(f"example {row['id']}: {issues[0].message}")
    for row in vectors["vectors"]:
        valid = validators[row["definition"]].is_valid(row["data"])
        expected = row["expectShape"] == "accept"
        if valid != expected:
            errors.append(f"vector {row['id']}: actual={valid}, expected={expected}")
    assert {row["interface"] for row in examples} == {f"UX-0{i}" for i in range(1, 7)}

    config = read_json(CONTRACTS / "ux-display-config.json")
    assert config["rateBucketCount"] * config["rateBucketMs"] == config["rateWindowMaxMs"]
    assert config["rateWindowMaxMs"] == 3000
    assert config["rateWarmupMs"] == 1000
    assert config["processingNoticeMs"] < config["noDataNoticeMs"]
    assert config["reportBufferBytes"] == 1024 and config["maxReportStreams"] == 8
    assert config["includesRedundancy"] is True and config["performanceSLA"] is False

    registry = read_json(CONTRACTS / "ux-diagnostics.json")
    diagnostic_codes = [entry["code"] for entry in registry["errors"]]
    names = [entry["name"] for entry in registry["errors"]]
    assert len(diagnostic_codes) == len(set(diagnostic_codes)) == 15
    assert len(names) == len(set(names))
    assert diagnostic_codes == list(range(19001, 19016))
    assert all(entry["fatalToReception"] is False for entry in registry["errors"])
    assert set(defs["UxFailure"]["properties"]["code"]["enum"]) == set(diagnostic_codes)
    matrix = (CONTRACTS.parent / "module-contract-error-matrix.md").read_text(encoding="utf-8")
    for entry in registry["errors"]:
        assert f"{entry['code']} {entry['name']}" in matrix
    for value in range(15, 25):
        assert f"| AC-{value:03} |" in matrix

    old_schema_path = REPO / "docs/design-catalog/contracts/receiver-v1.schema.json"
    old_errors_path = REPO / "docs/design-catalog/contracts/error-codes.json"
    old_schema = read_json(old_schema_path)
    old_registry = read_json(old_errors_path)
    # JSON semantics are frozen; CRLF/indentation changes on checkout are not
    # interface changes. Current-turn byte preservation is audited separately.
    assert semantic_digest(old_schema) == (
        "eda48270b347934585ce07964c171f7b2376731b6b44d9d7d3b538a3ee1df1c2"
    )
    assert semantic_digest(old_registry) == (
        "f7dc9e157abe139e47a04e67fb7f7d9e7c7ad4b79f6e217513a7a6a82f8c6128"
    )
    reformatted = json.dumps(old_schema, ensure_ascii=True, indent=4).replace("\n", "\r\n")
    assert semantic_digest(json.loads(reformatted)) == semantic_digest(old_schema)
    old_codes = {entry["code"] for entry in old_registry["errors"]}
    assert set(diagnostic_codes).isdisjoint(old_codes)
    saved_codes = set(defs["SaveRequest"]["properties"]["errorCode"]["anyOf"][0]["enum"])
    assert saved_codes == old_codes, "Saved error-code enum diverged from original registry"

    old_snapshot = {
        "sessionId": "s1", "inputKind": "live", "mode": "B", "state": "Receiving",
        "revision": 3, "inputEnded": False, "cleanupComplete": True,
        "pendingExternal": [], "artifact": None, "saveAttemptId": None,
        "lastError": None, "saveStatus": "none",
        "stats": {"capturedFrames": 0, "submittedFrames": 0, "processedFrames": 0,
                  "droppedFrames": 0, "inflight": 0, "elapsedMs": None},
    }
    old_validator = Draft202012Validator({"$defs": old_schema["$defs"], "$ref": "#/$defs/Snapshot"})
    assert old_validator.is_valid(old_snapshot), "Original positive Snapshot fixture is invalid"
    with_ux = copy.deepcopy(old_snapshot)
    with_ux["uxObservation"] = {"version": 1}
    assert not old_validator.is_valid(with_ux), "v1 must reject extra UX top-level field"
    with_stat = copy.deepcopy(old_snapshot)
    with_stat["stats"]["recognizedBytes"] = 625
    assert not old_validator.is_valid(with_stat), "v1 stats must remain separate"
    with_code = copy.deepcopy(old_snapshot)
    with_code["lastError"] = {
        "code": 19001, "name": "REPORT_EXPORT_MISSING", "message": "not available",
        "retryAction": "wait", "details": {},
    }
    assert not old_validator.is_valid(with_code), "v1 must reject internal diagnostics"
    if errors:
        raise AssertionError("\n".join(errors))
    print(json.dumps({
        "result": "DESIGN_CONTRACT_SHAPES_PASS", "definitions": len(defs),
        "examples": len(examples), "shapeVectors": len(vectors["vectors"]),
        "interfaces": 6, "diagnostics": len(diagnostic_codes), "acTracked": 10,
        "v1Isolation": "1 positive, 3 negative shape checks; semantic fingerprints unchanged; CRLF-safe",
        "implementationCases": f"{len(vectors['implementationCases'])} NOT_RUN",
        "productAcceptance": "NOT_RUN",
    }, ensure_ascii=True))


if __name__ == "__main__":
    main()

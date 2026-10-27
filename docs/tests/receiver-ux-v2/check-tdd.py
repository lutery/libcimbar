"""Verify TDD planning artifacts and skeleton refusal, never product tests."""
import ast
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

sys.dont_write_bytecode = True
import catalog

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def require(ok, message):
    if not ok:
        raise SystemExit("TDD_PLANNING_CHECK_FAIL: " + message)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


index = read_json(HERE / "test-index.json")
require(index["kind"] == "planning_only" and index["productAcceptance"] == "NOT_RUN", "planning index scope")
units = catalog.unit_cases()
integrations = catalog.read_cases(index["integrationFile"])
acceptance = catalog.read_cases(index["acceptanceFile"])
require(len(units) == 80 and len(integrations) == 8 and len(acceptance) == 10, "case/group counts")
require(index["counts"] == {"unitAndTooling": 80, "integrationGroups": 8, "acceptanceDefinitions": 10, "skeletonFiles": 12}, "index counts")
require(index["unitFiles"] == list(catalog.UNIT_FILES), "unit catalog source list")
all_cases = units + integrations + acceptance
require(len({c["id"] for c in all_cases}) == len(all_cases), "duplicate case IDs")
plan = (ROOT / "docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md").read_text(encoding="utf-8")
task_ids = set(re.findall(r"^- \[ \] (T\d+) \[", plan, re.M))
ac_ids = {f"AC-{n:03}" for n in range(15, 25)}
runtime = read_json(ROOT / "docs/design-catalog/receiver-ux-v2/contracts/validation-vectors.json")
runtime_ids = {c["id"] for c in runtime["implementationCases"]}
diagnostics = read_json(ROOT / "docs/design-catalog/receiver-ux-v2/contracts/ux-diagnostics.json")
diagnostic_ids = {c["code"] for c in diagnostics["errors"]}
require(len(task_ids) == 36 and len(runtime_ids) == 12 and len(diagnostic_ids) == 15, "authoritative inputs")
unit_fields = {"id", "title", "level", "target", "skeleton", "taskIds", "acceptanceIds", "runtimeIds", "diagnosticCodes", "given", "when", "then", "assertions", "fixtures", "redExpectation", "status", "executedBy", "scope"}
for c in all_cases:
    require(c["status"] == "NOT_RUN" and c["executedBy"] is None, "planning case claims execution: " + c["id"])
    require(c["taskIds"] and set(c["taskIds"]) <= task_ids, "task trace: " + c["id"])
    require(c["acceptanceIds"] and set(c["acceptanceIds"]) <= ac_ids, "AC trace: " + c["id"])
    require(set(c["runtimeIds"]) <= runtime_ids, "runtime trace: " + c["id"])
for c in units:
    require(set(c) == unit_fields and c["level"] == "unit" and c["scope"] == "unit_integration", "unit case shape: " + c["id"])
    require(re.fullmatch(r"UX-UT-\d{3}", c["id"]), "unit case ID")
    require(set(c["diagnosticCodes"]) <= diagnostic_ids, "diagnostic trace")
    for key in ("title", "given", "when", "then", "redExpectation"):
        require(isinstance(c[key], str) and c[key].strip(), "missing unit behavior field: " + c["id"])
    require(len(c["assertions"]) >= 2 and c["fixtures"], "meaningful assertions/fixture: " + c["id"])
    require(c["target"] in plan or (ROOT / c["target"]).exists(), "unplanned target: " + c["target"])
for c in integrations:
    require(c["level"] == "integration" and c["scope"] == "unit_integration", "IAT scope")
    require(all(c[k] for k in ("preconditions", "steps", "expected", "evidence", "mode")), "IAT definition incomplete")
for c in acceptance:
    require(c["level"] == "acceptance_definition" and c["e2eCaseIds"] is None, "E2E assigned before stage4.7")
    require(c["scope"] in {"local_simulated", "real_cloud"} and all(c[k] for k in ("requires", "success", "boundary")), "acceptance definition")
    require(c["executorRole"] == ("user" if c["scope"] == "real_cloud" else "executor"), "planned executor/scope")

coverage = read_json(HERE / "coverage-map.json")
expected_coverage = {
    "acceptance": {ac: [c["id"] for c in all_cases if ac in c["acceptanceIds"]] for ac in sorted(ac_ids)},
    "runtime": {rid: [c["id"] for c in all_cases if rid in c["runtimeIds"]] for rid in sorted(runtime_ids)},
    "diagnostics": {str(code): [c["id"] for c in units if code in c["diagnosticCodes"]] for code in sorted(diagnostic_ids)},
}
require(coverage["status"] == "NOT_RUN" and coverage["kind"] == "planning_coverage_only", "coverage is not executed coverage")
for key, mapping in expected_coverage.items():
    require(coverage[key] == mapping and all(mapping.values()), "coverage map missing/stale: " + key)
require((HERE / "test-cases.md").read_text(encoding="utf-8") == catalog.render_units(), "unit Markdown/catalog drift")
require((HERE / "acceptance-tests.md").read_text(encoding="utf-8") == catalog.render_acceptance(), "acceptance Markdown/catalog drift")

skeleton_map = {}
for c in units:
    skeleton_map.setdefault(c["skeleton"], []).append(c)
require(sorted(skeleton_map) == index["skeletonFiles"] and len(skeleton_map) == 12, "skeleton file mapping")
counts = Counter()
refusals = 0
for relative, cases in skeleton_map.items():
    path = (ROOT / relative).resolve()
    require(path.is_relative_to(HERE / "unit-test-skeletons") and path.is_file(), "skeleton location")
    source = path.read_text(encoding="utf-8")
    require("PLANNING_ONLY" in source and source.count("SKELETON_ONLY") == len(cases), "two skeleton refusal layers")
    require(not re.search(r"test\.(?:todo|skip)\s*\(", source), "skip/todo is not RED")
    if path.suffix == ".mjs":
        counts["js"] += 1
        require(re.search(r"^throw new Error\(['\"]PLANNING_ONLY", source, re.M), "unconditional JS guard")
        imports = re.findall(r"^import\s+.+?\s+from\s+['\"]([^'\"]+)['\"]", source, re.M)
        require(imports and set(imports) <= {"node:test", "node:assert/strict"}, "product import in skeleton")
        require("import(" not in source and "require(" not in source, "dynamic product import in skeleton")
        found = re.findall(r"\btest\(['\"](UX-UT-\d{3})\b", source)
        result = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True, encoding="utf-8", timeout=15)
        require(result.returncode == 0, "JS skeleton syntax: " + relative)
        run = subprocess.run(["node", "--test", str(path)], capture_output=True, text=True, encoding="utf-8", timeout=15)
    else:
        counts["python"] += 1
        tree = ast.parse(source, filename=relative)
        statements = tree.body[1:] if isinstance(tree.body[0], ast.Expr) and isinstance(tree.body[0].value, ast.Constant) else tree.body
        require(isinstance(statements[0], ast.Raise), "unconditional Python guard")
        require(all(not isinstance(x, (ast.Import, ast.ImportFrom)) or (isinstance(x, ast.Import) and all(n.name == "unittest" for n in x.names)) for x in tree.body), "product import in Python skeleton")
        found = ["UX-UT-" + match for match in re.findall(r"def test_ux_ut_(\d{3})\(", source)]
        run = subprocess.run([sys.executable, str(path)], capture_output=True, text=True, encoding="utf-8", timeout=15)
    require(Counter(found) == Counter(c["id"] for c in cases), "one case per skeleton body: " + relative)
    combined = run.stdout + run.stderr
    require(run.returncode != 0 and "PLANNING_ONLY" in combined and "SKELETON_ONLY" not in combined, "misexecution did not stop at planning guard: " + relative)
    refusals += 1
require(counts == {"js": 11, "python": 1} and refusals == 12, "skeleton syntax/refusal counts")
runner = (ROOT / "tools/desktop-recv/run-unit.mjs").read_text(encoding="utf-8")
require("receiver-ux-v2/unit-test-skeletons" not in runner and "docs/tests" not in runner, "planning skeleton registered in product runner")

method_path = ROOT / "docs/plans/receiver-ux-v2/performance-method.json"
require(hashlib.sha256(method_path.read_bytes()).hexdigest() == index["performanceMethodSha256"], "phase4 frozen method changed")
method = read_json(method_path)
require(method["frozen"] and method["results"] is None and method["productAcceptance"] == "NOT_RUN", "method is not a product measurement")
state = read_json(ROOT / "docs/dev-pipeline/pipeline-state.json")
phases = {p["name"]: p for p in state["phases"]}
tdd = phases["tdd-test-planning"]
require(len(phases) == 11 and tdd["status"] == "completed" and tdd["user_instructions"] and state["tdd_mode"], "TDD authorization/completion state")
e2e = phases["e2e-planning"]
if e2e["status"] == "pending":
    require(state["current_phase"] == state.get("awaiting_confirmation") == "e2e-planning", "E2E confirmation gate")
    require(not (HERE / "e2e-user-journey-plan.md").exists() and not (HERE / "planning-cases.json").exists(), "stage4.7 executed early")
else:
    require(e2e["status"] in {"in_progress", "completed"} and e2e.get("user_instructions"), "E2E advancement needs user authorization")
    if state.get("_handoff_mode") == "standard":
        require(e2e["status"] == "completed" and state["current_phase"] == "team-exec" and state.get("awaiting_confirmation") is None, "standard handoff entry")
        require(any("通道A" in item["summary"] for item in e2e["user_instructions"]), "standard handoff user authorization")
    else:
        require(state["current_phase"] == "e2e-planning", "E2E current phase")
        require(state.get("awaiting_confirmation") == ("handoff" if e2e["status"] == "completed" else None), "E2E completion/handoff gate")
require(state.get("active_test_plan") == "docs/tests/receiver-ux-v2/test-plan.md", "active test plan")
managed = [p for p in state["phases"] if p.get("_managed_by") == "claude-dev-pipeline"]
canonical = json.dumps(managed, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
require(hashlib.sha256(canonical).hexdigest() == index["managedPhasesFingerprint"], "Claude-managed stages changed")
require(phases["external-review"]["ext_rounds"] == 11, "review counter changed")
require("- [ ]" not in (HERE / "todo.md").read_text(encoding="utf-8"), "TDD planning Todo incomplete")
for name in tdd["output_files"]:
    require((HERE / name).is_file(), "missing TDD output: " + name)

link_count = 0
docs = list(HERE.rglob("*.md")) + [ROOT / "docs/README.md", ROOT / "docs/tests/README.md", ROOT / "docs/plans/receiver-ux-v2/README.md", ROOT / "docs/design-catalog/receiver-ux-v2/README.md", ROOT / "docs/requirements/receiver-ux-v2/README.md"]
for path in HERE.rglob("*"):
    if path.is_file():
        data = path.read_text(encoding="utf-8")
        require("\ufffd" not in data and all(line == line.rstrip() for line in data.splitlines()), "UTF8/whitespace: " + str(path))
        if path.suffix == ".py":
            ast.parse(data, filename=str(path))
for doc in docs:
    source = doc.read_text(encoding="utf-8")
    for ref in re.findall(r"\[[^\]\n]+\]\(([^)\n]+)\)", source):
        ref = ref.strip("<>").split("#", 1)[0]
        if ref and not re.match(r"[a-z]+://", ref):
            require((doc.parent / ref).exists(), f"broken link: {doc.relative_to(ROOT)} -> {ref}")
            link_count += 1
protected = {
    "docs/design-catalog/contracts/receiver-v1.schema.json": "b2996c8440591cf94f56b1c339c01fc1c8cc59e67b6f5b03b74a22a5eb31744d",
    "docs/design-catalog/contracts/error-codes.json": "5a93bf224108509565fc8d630741a1442c77455df211b18d9d253131cf6c2f7f",
    "docs/dev-pipeline/history/desktop-receiver-v1/pipeline-state.json": "582787ba6bd0c34d4023e20ef60d055f4b756ef337b875f47279a9e4d625b220",
}
for name, expected in protected.items():
    require(hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, "historical bytes changed: " + name)
paths = ["web/", "src/", "tools/", "product/", "docs/tests/runs/"]
for command in (["git", "diff", "--name-only", "HEAD", "--", *paths], ["git", "status", "--porcelain", "--", *paths]):
    require(not subprocess.run(command, cwd=ROOT, capture_output=True, check=True).stdout.strip(), "product/old runs changed")
print(json.dumps({"result": "TDD_PLANNING_DOCUMENTS_PASS", "unitAndToolingCases": len(units), "integrationGroups": len(integrations), "acceptanceDefinitions": len(acceptance), "targetModules": len({c['target'] for c in units}), "skeletonSyntax": dict(counts), "expectedGuardRefusals": refusals, "acTracked": len(ac_ids), "runtimeTracked": len(runtime_ids), "diagnosticsTracked": len(diagnostic_ids), "catalogs": "exact generated match", "localLinks": link_count, "protectedSHA256": 4, "managedStages": "unchanged", "productAndOldRunsDiff": "empty", "productTestsExecuted": 0, "productAcceptance": "NOT_RUN"}))

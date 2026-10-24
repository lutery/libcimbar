"""Check phase-4.7 planning, preservation and refusal; no product execution."""
import ast
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
spec = importlib.util.spec_from_file_location("e2e_catalog", HERE / "e2e-catalog.py")
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)


def require(ok, message):
    if not ok:
        raise SystemExit("E2E_PLAN_CHECK_FAIL: " + message)


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


plan = read(HERE / "planning-cases.json")
cases = catalog.journeys()
rows = plan["e2eScenarios"]
old = read(ROOT / "docs/tests/planning-cases.json")["e2eScenarios"]
require(len(cases) == len(rows) == 39 and [c["id"] for c in cases] == [f"E2E-{n}" for n in range(1, 40)], "39 consecutive unique scenarios")
require(plan["kind"] == "planning_only" and plan["productAcceptance"] == "NOT_RUN", "planning scope")
require(len(plan["unitCases"]) == 80 and len(plan["integrationGroups"]) == 8, "TDD catalog counts")
for n, legacy in enumerate(old):
    require(cases[n]["legacyDefinition"] == legacy, "legacy source changed: " + legacy["id"])
    require({key: rows[n][key] for key in legacy} == legacy, "old definition projection changed: " + legacy["id"])
require(plan["gates"] == catalog.gates(), "explicit gate lists")
local = sum(plan["gates"]["local"].values(), [])
field = sum(plan["gates"]["field"].values(), [])
require(len(local) == 32 and len(field) == 7 and not set(local) & set(field), "32 local / 7 field partition")
require(set(local + field) == {c["id"] for c in cases}, "gate omissions")
task_ids = {f"T{n}" for n in range(1, 37)}
new_ac = {f"AC-{n:03}" for n in range(15, 25)}
step_count = 0
for c, row in zip(cases, rows):
    require(c["status"] == row["status"] == row["result"] == "NOT_RUN" and c["executedBy"] is row["executedBy"] is None, "fabricated execution: " + c["id"])
    require(c["required"] and len(c["steps"]) >= 3 and c["preconditions"] and c["failureBranches"] and c["requiredEvidence"], "journey completeness: " + c["id"])
    require(set(c.get("executionTaskIds", c.get("taskIds"))) <= task_ids, "phase5 task mapping")
    is_field = c["id"] in field
    require(c["scope"] == ("real_cloud" if is_field else "local_simulated"), "scope partition")
    require(c["executorRole"] == ("user" if is_field else "executor") and c["executionStage"] == ("FIELD" if is_field else "5"), "executor/stage partition")
    if "legacyDefinition" not in c:
        require(set(c["acceptanceIds"]) <= new_ac and c["sourceAcceptanceIds"], "new AC/obligation mapping")
    for n, step in enumerate(c["steps"], 1):
        require(all(step.get(k) for k in ("action", "expected", "evidence")), "step completeness")
        require(row["stepSpecifications"][n - 1]["id"] == f"{c['id']}-S{n:02}", "assertion ID")
        require(set(step["evidence"]) <= set(row["requiredEvidence"]), "proof closure")
        step_count += 1
    for source in c["sources"]:
        require((ROOT / source).is_file(), "missing provenance: " + source)
for ident in ("E2E-1", "E2E-20"):
    c = next(c for c in cases if c["id"] == ident)
    require(c["packageRecheck"]["executionStage"] == "8" and c["packageRecheck"]["status"] == "NOT_RUN", "package stage separation")
    extra = {p for s in c["packageRecheck"]["steps"] for p in s["evidence"]}
    require(not extra & set(c["requiredEvidence"]), "stage8 evidence blocks stage5")
legs = read(HERE / "cases/e2e18-matrix.json")
require(len(legs) == len({leg["id"] for leg in legs}) == 10, "ten legacy capacity legs")
exceptions = [leg for leg in legs if leg["statusRequirement"] != "PASS_REQUIRED"]
require(len(exceptions) == 1 and exceptions[0]["id"] == "live-n-20mib-over-budget" and "D-19" in exceptions[0]["exceptionBasis"], "sole approved exception")
require(next(leg for leg in legs if leg["id"] == "video-n-4mib")["statusRequirement"] == "PASS_REQUIRED", "4MiB hard video cannot be removed")
require(all(leg["status"] == "NOT_RUN" and leg["executedBy"] is None for leg in legs), "capacity execution fabricated")
coverage = read(HERE / "coverage-map-e2e.json")
require(coverage == catalog.coverage(), "coverage derived from catalogs")
require(len(coverage["acceptance"]) == 24 and all(coverage["acceptance"].values()), "all old/new ACs mapped")
require(len(coverage["runtime"]) == 12 and all(c["unitIntegration"] for c in coverage["runtime"].values()), "runtime deterministic responsibilities")
require(len(coverage["acceptanceObligations"]) == 10 and all(coverage["acceptanceObligations"].values()), "ten acceptance obligations")
for name, content in catalog.outputs().items():
    require((HERE / name).read_text(encoding="utf-8") == content, "generated drift: " + name)

skeleton = HERE / "e2e-skeletons/real-journeys.mjs"
source = skeleton.read_text(encoding="utf-8")
require(re.search(r"^throw new Error\('PLANNING_ONLY", source, re.M) and source.count("SKELETON_ONLY") == 39, "outline refusal layers")
require(re.findall(r'test\("(E2E-\d+) ', source) == [c["id"] for c in cases], "outline scenario IDs")
require(not re.search(r"test\.(skip|todo)\(|import\(|require\(", source), "outline cannot masquerade as pass")
require(re.findall(r"^import .+ from '([^']+)';", source, re.M) == ["node:test"], "outline imports product/browser")
syntax = subprocess.run(["node", "--check", str(skeleton)], capture_output=True, text=True, encoding="utf-8", timeout=15)
require(syntax.returncode == 0, "outline syntax")
guard = subprocess.run(["node", "--test", str(skeleton)], capture_output=True, text=True, encoding="utf-8", timeout=15)
require(guard.returncode != 0 and "PLANNING_ONLY" in guard.stdout + guard.stderr and "SKELETON_ONLY" not in guard.stdout + guard.stderr, "outline guard did not refuse")

index = read(HERE / "test-index.json")
method = ROOT / "docs/plans/receiver-ux-v2/performance-method.json"
require(catalog.sha(method) == index["performanceMethodSha256"] == plan["frozenInputs"]["performanceMethodSha256"], "frozen method changed")
require(catalog.sha(ROOT / "docs/tests/planning-cases.json") == plan["frozenInputs"]["legacyPlanningSha256"], "legacy planning bytes changed")
state = read(ROOT / "docs/dev-pipeline/pipeline-state.json")
phases = {p["name"]: p for p in state["phases"]}
require(len(phases) == 11 and phases["e2e-planning"]["status"] == "completed" and phases["e2e-planning"].get("user_instructions"), "phase4.7 authorization/completion")
if state["_handoff_mode"] == "standard":
    require(state["current_phase"] == "team-exec" and state.get("awaiting_confirmation") is None, "standard handoff entry")
    require(any("通道A" in item["summary"] for item in phases["e2e-planning"]["user_instructions"]), "standard handoff user authorization")
else:
    require(state["current_phase"] == "e2e-planning" and state.get("awaiting_confirmation") == "handoff" and state["_handoff_mode"] == "not_selected", "handoff decision boundary")
require(state["active_e2e_plan"] == "docs/tests/receiver-ux-v2/e2e-user-journey-plan.md", "active E2E pointer")
managed = [p for p in state["phases"] if p.get("_managed_by") == "claude-dev-pipeline"]
fingerprint = hashlib.sha256(json.dumps(managed, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
require(fingerprint == index["managedPhasesFingerprint"] and all(p["status"] == "pending" for p in managed), "Claude stages changed")
require(phases["external-review"]["ext_rounds"] == 11, "global review counter")
for name in phases["e2e-planning"]["output_files"]:
    require((HERE / name).is_file(), "missing output: " + name)
require("- [ ]" not in (HERE / "e2e-todo.md").read_text(encoding="utf-8"), "planning Todo incomplete")
require(not any(HERE.rglob("*results.json")), "planning created fake result files")
link_count = 0
docs = list(HERE.rglob("*.md")) + [ROOT / p for p in ("docs/README.md", "docs/tests/README.md", "docs/plans/receiver-ux-v2/README.md", "docs/design-catalog/receiver-ux-v2/README.md", "docs/requirements/receiver-ux-v2/README.md")]
for doc in docs:
    content = doc.read_text(encoding="utf-8")
    require("\ufffd" not in content and all(line == line.rstrip() for line in content.splitlines()), "encoding/whitespace: " + str(doc))
    for ref in re.findall(r"\[[^\]\n]+\]\(([^)\n]+)\)", content):
        ref = ref.strip("<>").split("#", 1)[0]
        if ref and not re.match(r"[a-z]+://", ref):
            require((doc.parent / ref).exists(), "broken link: " + ref)
            link_count += 1
for path in HERE.rglob("*.py"):
    ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
paths = ["web/", "src/", "tools/", "product/", "docs/tests/runs/"]
for command in (["git", "diff", "--name-only", "HEAD", "--", *paths], ["git", "status", "--porcelain", "--", *paths]):
    require(not subprocess.run(command, cwd=ROOT, capture_output=True, check=True).stdout.strip(), "product/old runs changed")
print(json.dumps({"result": "E2E_PLANNING_DOCUMENTS_PASS", "scenarios": 39, "localRequired": 32, "fieldRequired": 7,
                  "steps": step_count, "acTracked": 24, "runtimeResponsibilities": 12, "acceptanceObligations": 10,
                  "legacyDefinitionsPreserved": 26, "capacityLegs": 10, "capacityPassRequired": 9, "authorizedExceptionLegs": 1,
                  "outlineSyntax": "PASS", "expectedGuardRefusals": 1, "localLinks": link_count,
                  "frozenMethod": "unchanged", "managedStages": "unchanged", "productAndOldRunsDiff": "empty",
                  "productTestsExecuted": 0, "productAcceptance": "NOT_RUN"}))

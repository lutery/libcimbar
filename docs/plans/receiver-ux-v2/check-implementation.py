"""Phase-4 plan checks only; no product implementation/acceptance execution."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
PLAN_NAME = "2026-10-24-receiver-ux-implementation.md"
plan = (HERE / PLAN_NAME).read_text(encoding="utf-8")


def require(ok, message):
    if not ok:
        raise SystemExit("IMPLEMENTATION_PLAN_CHECK_FAIL: " + message)


require(plan.startswith("# Receiver UX v2 Implementation Plan\n"), "standard title")
for marker in ("**Goal:**", "**Architecture:**", "**Tech Stack:**", "REQUIRED SUB-SKILL:"):
    require(marker in plan, "standard header: " + marker)
require("<!--" not in plan, "unfilled generation placeholder")
parts = plan.split("## Tasks（", 1)[1].split("## Waves（", 1)
ledger, rest = parts
wave_text = rest.split("## Step-by-step execution", 1)[0]
pattern = r"^- \[ \] T(\d+) \[([a-z+\-]+)\] ([^\n]+)\n((?:      [^\n]+\n)+)"
tasks = {}
for found in re.finditer(pattern, ledger, re.M):
    number, kinds, title, metadata = found.groups()
    task_id = "T" + number
    require(task_id not in tasks, "duplicate task: " + task_id)
    fields = dict(re.findall(r"^      ([a-z_]+): (.+)$", metadata, re.M))
    require(set(fields) == {"files", "ac", "resources", "trace", "depends_on"}, "metadata: " + task_id)
    task_types = kinds.split("+")
    require(set(task_types) <= {"dev", "test", "self-review", "self-fix", "acceptance"}, "task type: " + task_id)
    require(all(re.fullmatch(r"AC-0(?:1[5-9]|2[0-4])", item) for item in fields["ac"].split(", ")), "AC: " + task_id)
    require("Roadmap-T" in fields["trace"] and "design:" in fields["trace"] and "feedback:" in fields["trace"], "trace: " + task_id)
    tasks[task_id] = {**fields, "types": task_types, "deps": [] if fields["depends_on"] == "-" else fields["depends_on"].split(", ")}
require(set(tasks) == {f"T{i}" for i in range(1, 37)}, "36 consecutive unchecked task IDs")
require(set(t for data in tasks.values() for t in data["types"]) == {"dev", "test", "self-review", "self-fix", "acceptance"}, "five task types")
details = re.split(r"^### (T\d+) — [^\n]+\n", plan.split("## Step-by-step execution", 1)[1].split("## Implementation recipes", 1)[0], flags=re.M)
require(len(details) == 73, "36 detail blocks")
detail_ids = set()
for task_id, block in zip(details[1::2], details[2::2]):
    require(task_id not in detail_ids, "duplicate details: " + task_id)
    detail_ids.add(task_id)
    require("**Step 1:**" in block and "**Step 2:**" in block and "```powershell" in block and "**Expected / DoD:**" in block and "**提交边界：**" in block, "steps/commands/DoD/commit: " + task_id)
require(detail_ids == set(tasks), "task/detail ID mismatch")

waves = {}
wave_tasks = {}
for number, members in re.findall(r"^- Wave (\d+)（(?:并行|串行)）: ([T\d, ]+)$", wave_text, re.M):
    i = int(number)
    require(i not in waves, "duplicate wave")
    waves[i] = members.split(", ")
    for member in waves[i]:
        require(member in tasks and member not in wave_tasks, "unknown/repeated wave task: " + member)
        wave_tasks[member] = i
require(set(waves) == set(range(1, 36)), "35 consecutive waves")
require(set(wave_tasks) == set(tasks), "all tasks scheduled")
for task_id, data in tasks.items():
    for dep in data["deps"]:
        require(dep in tasks and wave_tasks[dep] < wave_tasks[task_id], "dependency must be in prior wave: " + task_id + " -> " + dep)


def resource_conflict(first, second):
    if first == second:
        return True
    if first.startswith("files:") and second.startswith("files:"):
        a, b = first[6:].rstrip("/"), second[6:].rstrip("/")
        return a.startswith(b + "/") or b.startswith(a + "/")
    return False


for group in waves.values():
    for index, first in enumerate(group):
        for second in group[index + 1:]:
            for a in tasks[first]["resources"].split("; "):
                for b in tasks[second]["resources"].split("; "):
                    require(not resource_conflict(a, b), f"resource conflict: {first}/{second}: {a}/{b}")
require(waves[26] == ["T26", "T28"], "specified independent UI/tool work changed")
roadmap = (HERE / "roadmap.md").read_text(encoding="utf-8")
roadmap_blocks = re.split(r"^#### (T\d+\.\d+\.[a-z]) — [^\n]+\n", roadmap, flags=re.M)
local_roadmap = {key for key, block in zip(roadmap_blocks[1::2], roadmap_blocks[2::2]) if re.search(r"\| Phase: 5 \|", block)}
traced = set(re.findall(r"Roadmap-(T\d+\.\d+\.[a-z])", ledger))
require(traced == local_roadmap and len(traced) == 20, "all 20 phase-5 roadmap tasks traced")
ac_set = set(re.findall(r"AC-\d{3}", " ".join(t["ac"] for t in tasks.values())))
require(ac_set == {f"AC-{i:03}" for i in range(15, 25)}, "10 AC coverage")
for downstream in ("T4.2.b", "T4.2.c", "T4.2.d"):
    require("| " + downstream + " |" in plan, "downstream boundary: " + downstream)
for recipe in ("A", "B", "C", "D", "E", "F", "G", "R"):
    require("### " + recipe + " —" in plan, "implementation recipe: " + recipe)
runtime = json.loads((ROOT / "docs/design-catalog/receiver-ux-v2/contracts/validation-vectors.json").read_text(encoding="utf-8"))
runtime_ids = {case["id"] for case in runtime["implementationCases"]}
require(set(re.findall(r"^\| (R-\d{2}) \|", plan, re.M)) == runtime_ids, "12 runtime responsibility rows")

method = json.loads((HERE / "performance-method.json").read_text(encoding="utf-8"))
require(method["frozen"] is True and method["kind"] == "frozen_method_only", "method freeze type")
require(method["results"] is None and method["productAcceptance"] == "NOT_RUN", "method cannot claim measurement PASS")
require(method["pairedRuns"] == 5 and method["order"] == ["AB", "BA", "AB", "BA", "AB"], "paired method")
require(method["hardInvariants"]["maxFramesInFlight"] == 1 and method["hardInvariants"]["telemetryMinWriteIntervalMs"] == 250, "frozen invariants")
config = json.loads((ROOT / "docs/design-catalog/receiver-ux-v2/contracts/ux-display-config.json").read_text(encoding="utf-8"))
for key, design_key in (("rateBuckets", "rateBucketCount"), ("reportBufferBytes", "reportBufferBytes"), ("reportStreams", "maxReportStreams")):
    require(method["hardInvariants"][key] == config[design_key], "performance/design mismatch: " + key)
require(len(method["mandatoryMetrics"]) == 3 and method["primaryInput"]["minSettledFrames"] == 30, "metric/sample protocol")
javascript_blocks = re.findall(r"```javascript\n(.*?)\n```", plan, re.S)
for code in javascript_blocks:
    result = subprocess.run(["node", "--check"], input=code, text=True, encoding="utf-8", capture_output=True)
    require(result.returncode == 0, "JS plan syntax: " + result.stderr)

link_count = 0
for doc in list(HERE.glob("*.md")) + [ROOT / "docs/README.md", ROOT / "docs/design-catalog/receiver-ux-v2/README.md", ROOT / "docs/requirements/receiver-ux-v2/README.md"]:
    content = doc.read_text(encoding="utf-8")
    require("\ufffd" not in content and all(line == line.rstrip() for line in content.splitlines()), "UTF8/whitespace: " + str(doc))
    for target in re.findall(r"\[[^\]\n]+\]\(([^)\n]+)\)", content):
        target = target.strip("<>").split("#", 1)[0]
        if target and not re.match(r"[a-z]+://", target):
            require((doc.parent / target).exists(), "broken local link: " + target)
            link_count += 1

state = json.loads((ROOT / "docs/dev-pipeline/pipeline-state.json").read_text(encoding="utf-8-sig"))
phases = {p["name"]: p for p in state["phases"]}
writing = phases["writing-plans"]
require(len(phases) == 11 and writing["status"] == "completed" and writing["user_instructions"], "phase-4 state/authorization")
tdd_phase = phases["tdd-test-planning"]
if tdd_phase["status"] == "pending":
    require(state["current_phase"] == state.get("awaiting_confirmation") == "tdd-test-planning", "TDD confirmation gate")
else:
    require(tdd_phase["status"] in {"in_progress", "completed"} and state["tdd_mode"] and tdd_phase["user_instructions"], "TDD user authorization")
    if tdd_phase["status"] == "completed":
        e2e = phases["e2e-planning"]
        if state.get("_handoff_mode") == "standard":
            require(e2e["status"] == "completed" and state["current_phase"] == "team-exec" and state.get("awaiting_confirmation") is None, "standard handoff entry")
            require(any("通道A" in item["summary"] for item in e2e["user_instructions"]), "standard handoff user authorization")
        elif e2e["status"] == "pending":
            require(state["current_phase"] == "e2e-planning", "E2E phase after TDD")
            require(state.get("awaiting_confirmation") == "e2e-planning", "E2E confirmation gate after TDD")
        else:
            require(state["current_phase"] == "e2e-planning", "E2E phase after TDD")
            require(e2e["status"] in {"in_progress", "completed"} and e2e.get("user_instructions"), "E2E advancement needs user authorization")
            require(state.get("awaiting_confirmation") == ("handoff" if e2e["status"] == "completed" else None), "E2E handoff gate")
require(state["active_implementation_plan"] == "docs/plans/receiver-ux-v2/" + PLAN_NAME, "implementation pointer")
require(phases["external-review"]["ext_rounds"] == 11, "historical review count")
for phase_name in ("team-exec", "external-review", "finishing-a-development-branch", "release-packaging"):
    require(phases[phase_name]["status"] == "pending", "downstream phase advanced: " + phase_name)
for name in writing["output_files"]:
    require((HERE / name).is_file(), "phase output missing: " + name)
require("- [ ]" not in (HERE / "implementation-todo.md").read_text(encoding="utf-8"), "planning Todo incomplete")
protected = {
    "docs/design-catalog/contracts/receiver-v1.schema.json": "b2996c8440591cf94f56b1c339c01fc1c8cc59e67b6f5b03b74a22a5eb31744d",
    "docs/design-catalog/contracts/error-codes.json": "5a93bf224108509565fc8d630741a1442c77455df211b18d9d253131cf6c2f7f",
    "docs/dev-pipeline/history/desktop-receiver-v1/pipeline-state.json": "582787ba6bd0c34d4023e20ef60d055f4b756ef337b875f47279a9e4d625b220",
}
for name, expected in protected.items():
    require(hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, "protected bytes changed: " + name)
paths = ["web/", "src/", "tools/", "product/", "docs/tests/runs/"]
for command in (["git", "diff", "--name-only", "HEAD", "--", *paths], ["git", "status", "--porcelain", "--", *paths]):
    result = subprocess.run(command, cwd=ROOT, check=True, capture_output=True)
    require(not result.stdout.strip(), "product/old evidence changed")
print(json.dumps({"result": "IMPLEMENTATION_PLAN_DOCUMENTS_PASS", "tasks": len(tasks), "taskTypes": 5, "waves": len(waves), "sameWaveFileConflicts": 0, "dependencies": "acyclic and prior-wave", "phase5RoadmapTasks": len(traced), "acTracked": len(ac_set), "runtimeRequirements": len(runtime_ids), "jsSnippetSyntax": len(javascript_blocks), "localLinks": link_count, "protectedSHA256": len(protected), "productAndOldRunsDiff": "empty", "tddPhase": tdd_phase["status"], "productAcceptance": "NOT_RUN"}))

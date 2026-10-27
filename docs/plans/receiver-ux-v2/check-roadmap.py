"""Check phase-3 documentation only; does not execute product acceptance."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
text = (HERE / "roadmap.md").read_text(encoding="utf-8")


def require(condition, message):
    if not condition:
        raise SystemExit("PLANNING_CHECK_FAIL: " + message)


headings = re.findall(r"^## (.+)$", text, re.M)
require(headings == [
    "Executive Summary", "Assumptions", "Scope", "Deliverables",
    "Work Breakdown", "Milestones & Timeline", "Dependencies & Integration Checklist",
    "Risks & Mitigations", "Testing & Verification Plan", "Release Plan & Rollback",
    "Open Questions", "Appendix",
], "12 required headings or their order changed")
epics = re.findall(r"^### (E\d+) —", text, re.M)
stories = re.findall(r"^### (S\d+\.\d+) —", text, re.M)
require(len(epics) == len(set(epics)) == 4, "epic count/duplicates")
require(len(stories) == len(set(stories)) == 8, "story count/duplicates")
sections = re.split(r"^#### (T\d+\.\d+\.[a-z]) — [^\n]+\n", text, flags=re.M)
require(len(sections) == 47, "expected 23 task blocks")
tasks = {}
for task_id, block in zip(sections[1::2], sections[2::2]):
    # The final block also contains later top-level sections; exclude those.
    block = re.split(r"^## |^### ", block, maxsplit=1, flags=re.M)[0]
    require(task_id not in tasks, "duplicate task: " + task_id)
    meta = re.search(
        r"^- Owner: (.+?) \| Effort: (XS|S|M|L|XL) \| Phase: (5|6|7/8|FIELD) \| Depends: (.+)$",
        block, re.M,
    )
    require(meta is not None, "missing task metadata: " + task_id)
    owner, effort, phase, dep_text = meta.groups()
    deps = [] if dep_text == "-" else dep_text.split(", ")
    require(all(re.fullmatch(r"T\d+\.\d+\.[a-z]", dep) for dep in deps), "dependency format: " + task_id)
    trace = re.search(r"^- Trace: (.+)$", block, re.M)
    require(trace is not None and "- DoD：" in block and "- 工作/资源：" in block,
            "missing trace/DoD/resources: " + task_id)
    require("S" + task_id[1:].rsplit(".", 1)[0] in stories, "story missing: " + task_id)
    tasks[task_id] = {"phase": phase, "deps": deps, "trace": trace.group(1)}

visited, active, order = set(), set(), []


def visit(task_id):
    require(task_id in tasks, "unknown dependency: " + task_id)
    require(task_id not in active, "dependency cycle: " + task_id)
    if task_id in visited:
        return
    active.add(task_id)
    for dep in tasks[task_id]["deps"]:
        if tasks[task_id]["phase"] == "5":
            require(tasks.get(dep, {}).get("phase") == "5", "phase-5 depends on downstream: " + task_id)
        visit(dep)
    active.remove(task_id)
    visited.add(task_id)
    order.append(task_id)


for task_id in tasks:
    visit(task_id)
phase_counts = {phase: sum(t["phase"] == phase for t in tasks.values()) for phase in ("5", "6", "7/8", "FIELD")}
require(phase_counts == {"5": 20, "6": 1, "7/8": 1, "FIELD": 1}, "phase ownership counts")
acs = {f"AC-{n:03}" for n in range(15, 25)}
vectors = json.loads((ROOT / "docs/design-catalog/receiver-ux-v2/contracts/validation-vectors.json").read_text(encoding="utf-8"))
runtime_ids = {case["id"] for case in vectors["implementationCases"]}
all_traces = " ".join(t["trace"] for t in tasks.values())
require(set(re.findall(r"AC-\d{3}", all_traces)) == acs, "new AC trace coverage")
require(set(re.findall(r"R-\d{2}", all_traces)) == runtime_ids, "runtime case trace coverage")
require(len(runtime_ids) == 12, "runtime case count")

link_count = 0
documents = list(HERE.glob("*.md")) + [
    ROOT / "docs/README.md",
    ROOT / "docs/design-catalog/receiver-ux-v2/README.md",
    ROOT / "docs/requirements/receiver-ux-v2/README.md",
]
for doc in documents:
    content = doc.read_text(encoding="utf-8")
    require("\ufffd" not in content, "replacement character in " + str(doc))
    require(all(line == line.rstrip() for line in content.splitlines()), "trailing whitespace in " + str(doc))
    for target in re.findall(r"\[[^\]\n]+\]\(([^)\n]+)\)", content):
        target = target.strip("<>").split("#", 1)[0]
        if not target or re.match(r"[a-z]+://", target):
            continue
        require((doc.parent / target).exists(), f"broken link in {doc.relative_to(ROOT)}: {target}")
        link_count += 1

protected = {
    "docs/design-catalog/contracts/receiver-v1.schema.json": "b2996c8440591cf94f56b1c339c01fc1c8cc59e67b6f5b03b74a22a5eb31744d",
    "docs/design-catalog/contracts/error-codes.json": "5a93bf224108509565fc8d630741a1442c77455df211b18d9d253131cf6c2f7f",
    "docs/dev-pipeline/history/desktop-receiver-v1/pipeline-state.json": "582787ba6bd0c34d4023e20ef60d055f4b756ef337b875f47279a9e4d625b220",
}
for path, expected in protected.items():
    require(hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == expected, "protected bytes changed: " + path)
paths = ["web/", "src/", "tools/", "product/", "docs/tests/runs/"]
diff = subprocess.run(["git", "diff", "--name-only", "HEAD", "--", *paths], cwd=ROOT, capture_output=True, check=True).stdout
status = subprocess.run(["git", "status", "--porcelain", "--", *paths], cwd=ROOT, capture_output=True, check=True).stdout
require(not diff.strip() and not status.strip(), "product or historical run worktree changed")
state = json.loads((ROOT / "docs/dev-pipeline/pipeline-state.json").read_text(encoding="utf-8-sig"))
phases = {p["name"]: p for p in state["phases"]}
require(phases["planning-roadmap"]["status"] == "completed", "planning phase not completed")
writing_status = phases["writing-plans"]["status"]
require(writing_status in {"pending", "in_progress", "completed"}, "unknown implementation-planning status")
if writing_status == "pending":
    require(state.get("awaiting_confirmation") == "writing-plans", "phase-4 confirmation not recorded")
else:
    require(bool(phases["writing-plans"].get("user_instructions")), "phase-4 user authorization missing")
require(state.get("active_plan") == "docs/plans/receiver-ux-v2/roadmap.md", "active plan pointer")
require(phases["external-review"]["ext_rounds"] == 11, "historical external-review counter changed")
tdd_phase = phases["tdd-test-planning"]
if tdd_phase["status"] != "pending":
    require(tdd_phase["status"] in {"in_progress", "completed"} and state["tdd_mode"] and tdd_phase["user_instructions"], "TDD advancement needs user authorization")
e2e = phases["e2e-planning"]
if e2e["status"] != "pending":
    require(e2e["status"] in {"in_progress", "completed"} and e2e.get("user_instructions"), "E2E advancement needs user authorization")
for name in ("team-exec", "external-review", "finishing-a-development-branch", "release-packaging"):
    require(phases[name]["status"] == "pending", "downstream phase advanced: " + name)
require("- [ ]" not in (HERE / "todo.md").read_text(encoding="utf-8"), "unfinished planning Todo")
for filename in phases["planning-roadmap"]["output_files"]:
    require((HERE / filename).is_file(), "phase output missing: " + filename)
print(json.dumps({
    "result": "PLANNING_DOCUMENTS_PASS", "epics": len(epics), "stories": len(stories),
    "tasks": len(tasks), "phaseOwnership": phase_counts, "dependencyDAG": "acyclic",
    "acTracked": len(acs), "runtimeCasesTracked": len(runtime_ids), "localLinks": link_count,
    "protectedSHA256": len(protected), "productAndOldRunsDiff": "empty",
    "phase4": writing_status, "productAcceptance": "NOT_RUN",
}, ensure_ascii=True))

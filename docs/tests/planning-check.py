"""Document QA only: never runs product tests or changes pipeline state."""
from pathlib import Path
import argparse
import json
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--expect-ready', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
checks = 0


def require(condition, message):
    global checks
    checks += 1
    if not condition:
        raise AssertionError(message)


plan = (root / 'docs/plans/2026-10-18-desktop-receiver-implementation.md').read_text(encoding='utf-8')
roadmap = (root / 'docs/plans/roadmap.md').read_text(encoding='utf-8')
task_ids = re.findall(r'^\| (T\d+\.\d+\.[a-z]) —', roadmap, re.M)
sections = list(re.finditer(r'^### Task (T\d+\.\d+\.[a-z])：', plan, re.M))
require(len(task_ids) == 24 and len(set(task_ids)) == 24, '24 original tasks')
require([s.group(1) for s in sections] == task_ids, 'implementation tasks match roadmap order')
for i, section in enumerate(sections):
    end = sections[i + 1].start() if i + 1 < len(sections) else plan.index('\n## 提交顺序')
    body = plan[section.end():end]
    require('**Files:**' in body and '**AC:**' in body, section.group(1) + ' files/AC')
    require(re.findall(r'^(\d)\. ', body, re.M) == ['1', '2', '3', '4'], section.group(1) + ' four action checkpoints')
    require(bool(re.search(r'AC-\d{3}', body)), section.group(1) + ' AC mapping')
require('**Goal:**' in plan and '**Architecture:**' in plan and '**Tech Stack:**' in plan, 'required writing-plans header')
require(all(f'CMD-{i:02}' in plan for i in range(1, 11)), '10 command contracts')

registry = json.loads((root / 'docs/tests/planning-cases.json').read_text(encoding='utf-8'))
units = registry['unitCases']
integration = registry['integrationGroups']
e2e = registry['e2eScenarios']
all_cases = units + integration + e2e
require(registry['kind'] == 'planning_only', 'planning records not runtime Evidence')
require([c['id'] for c in units] == [f'UT-{i:03}' for i in range(1, 55)], '54 sequential unit cases')
require([c['id'] for c in integration] == [f'IAT-{i:02}' for i in range(1, 7)], '6 integration groups')
require([c['id'] for c in e2e] == [f'E2E-{i}' for i in range(1, 27)], '26 sequential E2E journeys')
require(len({c['id'] for c in all_cases}) == 86, '86 unique planning IDs')
require(all(c['result'] == 'NOT_RUN' and c['executedBy'] is None for c in all_cases), 'no manufactured execution results')
allowed_acs = {f'AC-{i:03}' for i in range(1, 15)}
for case in units + e2e:
    require(set(case['acceptanceIds']) <= allowed_acs, case['id'] + ' known AC')
    require(set(case['taskIds']) <= set(task_ids), case['id'] + ' known Task')
for key in ['given', 'when', 'then', 'target']:
    require(all(c.get(key) for c in units), 'unit cases have ' + key)
for key in ['given', 'steps', 'then', 'execution', 'sourceCase']:
    require(all(c.get(key) for c in e2e), 'E2E cases have ' + key)
require({a for c in units + e2e for a in c['acceptanceIds']} == allowed_acs, 'all AC planned')
require({a for c in e2e for a in c['acceptanceIds']} == allowed_acs, 'all AC in E2E trace')
require(all(c['scope'] == 'local_simulated' for c in e2e[:20]), '20 local E2E')
require(all(c['scope'] == 'real_cloud' for c in e2e[20:]), '6 user field E2E')
require([c['sourceCase'] for c in e2e] == [f'UAT-L{i:02}' for i in range(1, 21)] + [f'FAT-{i:02}' for i in range(1, 7)], 'all real operation baseline cases retained')
journey = (root / 'docs/tests/e2e-user-journey-plan.md').read_text(encoding='utf-8')
require(re.findall(r'^## (E2E-\d+)：', journey, re.M) == [c['id'] for c in e2e], 'formal journey headings match registry')
for c in e2e:
    require(c['title'] in journey and c['then'] in journey, c['id'] + ' observable verdict')

skeletons = sorted((root / 'docs/tests/unit-test-skeletons').glob('*.test.mjs'))
require(len(skeletons) == 8, '8 JS skeletons')
todo_ids = []
for path in skeletons:
    result = subprocess.run(['node', '--check', str(path)], cwd=root, capture_output=True, text=True)
    require(result.returncode == 0, path.name + ' syntax: ' + result.stderr)
    ids = re.findall(r'test\.todo\("(UT-\d{3}) ', path.read_text(encoding='utf-8'))
    require(len(ids) == 6, path.name + ' 6 explicit TODOs')
    todo_ids.extend(ids)
require(sorted(todo_ids) == [f'UT-{i:03}' for i in range(1, 49)], '48 unimplemented JS unit skeletons, not PASS')
cpp = (root / 'docs/tests/unit-test-skeletons/strict-eof.cpp.txt').read_text(encoding='utf-8')
require('#error' in cpp and len(re.findall(r'TEST_CASE\("UT-', cpp)) == 6, '6 guarded C++ template cases')

md_files = [p for p in (root / 'docs').rglob('*.md') if 'src' not in p.relative_to(root / 'docs').parts and p.name != 'cloud-desktop-screen-capture-feasibility.md']
broken = []
for path in md_files:
    data = path.read_bytes()
    require(not data.startswith(b'\xef\xbb\xbf') and '\ufffd' not in data.decode('utf-8'), 'UTF8 ' + str(path.relative_to(root)))
    for dest in re.findall(r'(?<!!)\[[^\]]*\]\(([^)]+)\)', data.decode('utf-8')):
        dest = dest.strip().strip('<>')
        if re.match(r'^(?:https?://|mailto:|#)', dest):
            continue
        dest = dest.split('#', 1)[0]
        if dest and not (path.parent / dest).exists():
            broken.append((str(path.relative_to(root)), dest))
require(not broken, 'broken links: ' + str(broken))

state = json.loads((root / 'docs/dev-pipeline/pipeline-state.json').read_text(encoding='utf-8'))
template_path = Path('C:/Users/admin/.codex/skills/dev-pipeline/pipeline-state-template.json')
template = json.loads(template_path.read_text(encoding='utf-8-sig'))
require(len(state['phases']) == 11, '11 pipeline nodes')
require(all('_managed_by' not in p for p in state['phases'][:7]), 'Codex owns all pre5 nodes')
require(state['phases'][7:] == template['phases'][7:], 'Claude phases5+ unchanged and pending')
require(state['tdd_mode'] is True, 'user selected TDD')
if args.expect_ready:
    require(all(p['status'] == 'completed' for p in state['phases'][:7]), 'pre5 completed')
    require(state['current_phase'] == 'team-exec' and state['_handoff_mode'] == 'standard', 'standard stage5 handoff')
    for phase in state['phases'][4:7]:
        require(phase['started_at'] and phase['completed_at'], phase['name'] + ' times recorded')
        for out in phase['output_files']:
            require((root / phase['output_dir'] / out).exists(), phase['name'] + ' registered output ' + out)
tracked = subprocess.check_output(['git', 'diff', '--name-only'], cwd=root, text=True).strip()
require(not tracked, 'tracked original files changed: ' + tracked)
status = subprocess.check_output(['git', 'status', '--short', '--untracked-files=all'], cwd=root, text=True)
require(not re.search(r'^\?\? (?:web|src|tools|product)/', status, re.M), 'new product/implementation files created')
print(json.dumps({'scope': 'document_qa', 'assertionsPassed': checks, 'taskCount': 24,
                  'unitCases': 54, 'integrationGroups': 6, 'e2eLocal': 20, 'e2eField': 6,
                  'plannedAcCount': 14, 'markdownFilesChecked': len(md_files),
                  'jsSkeletonSyntaxChecked': 8, 'productTests': 'NOT_RUN',
                  'fieldTests': 'NOT_RUN', 'performanceTargets': 'NOT_EVALUATED'}, ensure_ascii=False))

"""Assemble planning catalogs; never run a browser or product acceptance."""
import copy
import hashlib
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
JOURNEY_FILES = ("cases/e2e-legacy.json", "cases/e2e-receive.json", "cases/e2e-experience.json")


def read(name):
    return json.loads((HERE / name).read_text(encoding="utf-8-sig"))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def journeys():
    return [case for name in JOURNEY_FILES for case in read(name)]


def gates():
    return {
        "local": {"legacyRequired": [f"E2E-{n}" for n in range(1, 21)], "uxRequired": [f"E2E-{n}" for n in range(27, 39)]},
        "field": {"legacyRequired": [f"E2E-{n}" for n in range(21, 27)], "uxRequired": ["E2E-39"]},
    }


def plan():
    scenarios = []
    for case in journeys():
        legacy = "legacyDefinition" in case
        row = copy.deepcopy(case["legacyDefinition"] if legacy else case)
        row.update({"gate": case["gate"], "required": True, "executionStage": case["executionStage"],
                    "journeyRef": next(name for name in JOURNEY_FILES if any(c["id"] == case["id"] for c in read(name))),
                    "executionTaskIds": case.get("executionTaskIds", case.get("taskIds")),
                    "status": "NOT_RUN", "executedBy": None})
        row.setdefault("result", "NOT_RUN")
        row["stepSpecifications"] = [
            {"id": f"{case['id']}-S{n:02}", **step,
             "proofDirectoryPattern": "proof/" + case["id"] + "/<attemptId>/"}
            for n, step in enumerate(case["steps"], 1)
        ]
        row["requiredEvidence"] = list(dict.fromkeys(case["requiredEvidence"] + [item for step in case["steps"] for item in step["evidence"]]))
        row["preconditions"] = case["preconditions"]
        row["failureBranches"] = case["failureBranches"]
        if case.get("packageRecheck"):
            row["packageRecheck"] = case["packageRecheck"]
        scenarios.append(row)
    return {
        "kind": "planning_only", "version": 1, "iterationId": "receiver-ux-v2",
        "productAcceptance": "NOT_RUN", "unitCases": [c for f in ("cases/core.json", "cases/experience.json", "cases/tooling.json") for c in read(f)],
        "integrationGroups": read("cases/integration.json"), "e2eScenarios": scenarios,
        "gates": gates(), "resultFiles": {"legacy": "results.json", "ux": "ux-results.json"},
        "groups": {"UX-SLICE": ["E2E-27"], "UX-IAT": [f"UX-IAT-{n:02}" for n in range(1, 9)],
                   "UX-MEDIA-SAVE": [f"E2E-{n}" for n in range(30, 35)],
                   "UX-UI": ["E2E-35", "E2E-36", "E2E-37"], "UX-ALL": [f"E2E-{n}" for n in range(27, 39)]},
        "frozenInputs": {"legacyPlanningSha256": sha(ROOT / "docs/tests/planning-cases.json"),
                         "performanceMethodSha256": sha(ROOT / "docs/plans/receiver-ux-v2/performance-method.json")},
        "e2e18MatrixRef": "cases/e2e18-matrix.json",
        "finalPackageRecheck": {"executionStage": "8", "status": "NOT_RUN", "executedBy": None,
                               "caseIds": ["E2E-1", "E2E-3", "E2E-11", "E2E-14", "E2E-20", "E2E-36", "E2E-37"],
                               "instructions": "独立最终包attempt；入口/双输入双类/保存重试/中文键盘与焦点复核。产品字节变更重跑受影响项；不作为阶段5循环前置，也不由候选PASS自动完成。"},
    }


def coverage():
    cases = journeys()
    deterministic = [c for name in ("cases/core.json", "cases/experience.json", "cases/tooling.json", "cases/integration.json") for c in read(name)]
    obligations = {c["id"]: [j["id"] for j in cases if c["id"] in j.get("sourceAcceptanceIds", [])] for c in read("cases/acceptance.json")}
    obligations["UX-AT-09"] = gates()["local"]["legacyRequired"] + gates()["local"]["uxRequired"]
    obligations["UX-AT-10"] = gates()["field"]["legacyRequired"] + gates()["field"]["uxRequired"]
    return {
        "kind": "planning_coverage_only", "status": "NOT_RUN",
        "acceptance": {f"AC-{n:03}": [c["id"] for c in cases if f"AC-{n:03}" in c["acceptanceIds"]] for n in range(1, 25)},
        "runtime": {f"R-{n:02}": {"e2e": [c["id"] for c in cases if f"R-{n:02}" in c.get("runtimeIds", [])],
                                   "unitIntegration": [c["id"] for c in deterministic if f"R-{n:02}" in c["runtimeIds"]]} for n in range(1, 13)},
        "acceptanceObligations": obligations,
        "runtimeBoundary": "R-05等异常report/慢帧/迟到消息由确定性UT/IAT验证；真实E2E不伪造Worker消息或假报触发。UX-AT-09是32项本地总出口义务，不新造第40个场景。",
    }


def render():
    cases = journeys()
    lines = ["# 接收器体验 v2 — 真实E2E用户旅程计划", "", "2026-10-24 · 阶段4.7 · 仅规划，39条全部NOT_RUN。", "",
             "[运行手册](e2e-runbook.md)规定装置、样本、真实系统操作、证据和重跑；[机器计划](planning-cases.json)由三份场景源生成，执行前必须核对。", "",
             "保留原E2E-1～26及AC-001～014的原定义，新增E2E-27～39覆盖AC-015～024。共39条：本地32条（旧20+新12），用户现场7条（旧6+新1）；24条AC均有旅程映射。覆盖是规划追踪，不能当执行覆盖率。", "",
             "实时抓屏与录像导入两个按钮均保留。验收使用原发送端、真实getDisplayMedia、真实录像及实际保存文件；源码探针、UT/IAT、原型不能替代真实操作。", "",
             "## 门禁与阶段边界", "",
             "阶段5 T35/T36要求本轮最终候选的32项本地场景全部通过（E2E-18逐腿另核），不是只看旧20项。用户现场7项单独汇总；缺用户实测不得填PASS，本地通过不代表现场通过。阶段8最终包另做入口复核，不能被列成阶段5循环前置。", "",
             "旧Evidence v1仍只写原AC；新增体验独立ux-results.json，汇总器同时验证两份结果。未知ID、漏项、错manifest、缺实物/步骤证明、过期attempt及任何必测非PASS均非0退出。", "",
             "## 场景导航", "", "| ID | 场景 | 门禁/执行阶段 | AC |", "|---|---|---|---|"]
    for c in cases:
        lines.append(f"| [{c['id']}](#{c['id'].lower()}) | {c['title']} | {c['gate']} / {c['executionStage']} | {', '.join(c['acceptanceIds'])} |")
    for c in cases:
        lines += ["", f"## {c['id']}", "", c["title"], "", f"- 范围/执行者：`{c['scope']}` / `{c['executorRole']}`；阶段`{c['executionStage']}`，`{c['gate']}`必测；当前NOT_RUN、执行者null。",
                  f"- 本轮任务：{', '.join(c.get('executionTaskIds', c.get('taskIds')))}；AC：{', '.join(c['acceptanceIds'])}。",
                  "- 入口：" + c["entry"], "", "前置：", ""]
        lines += [f"{n}. {item}" for n, item in enumerate(c["preconditions"], 1)]
        lines += ["", "操作、预期与证明（步骤ID写入实际assertions）：", ""]
        for n, step in enumerate(c["steps"], 1):
            lines += [f"{n}. **{c['id']}-S{n:02}** {step['action']}", f"   预期：{step['expected']}", "   留证：" + "；".join(step["evidence"]) + "。"]
        lines += ["", "失败/恢复：", ""] + ["- " + item for item in c["failureBranches"]]
        lines += ["", "必需证明：", ""] + ["- " + item for item in c["requiredEvidence"]]
        if c.get("packageRecheck"):
            lines += ["", "阶段8单独复核（不计入本例阶段5必需步骤/证明）：", ""]
            for step in c["packageRecheck"]["steps"]:
                lines += ["- " + step["action"], "  预期：" + step["expected"], "  留证：" + "；".join(step["evidence"]) + "。"]
        lines += ["", "来源：`" + "`、`".join(c["sources"]) + "`。"]
    lines += ["", "## E2E-18十腿矩阵", "", "[机器矩阵](cases/e2e18-matrix.json)逐腿绑定当前输入/媒体/attempt和保存后四时点。4MiB难压缩录像已可行，仍必测；TD-15早期上限不可复用。", "",
              "| 腿ID | 输入/大小 | 必须结果 | 观察上界（预登记） |", "|---|---|---|---|"]
    for leg in read("cases/e2e18-matrix.json"):
        lines.append(f"| {leg['id']} | {leg['inputKind']} / {leg['compressibility']} / {leg['tier']} | {leg['statusRequirement']} | {json.dumps(leg['declaredObservationBounds'], ensure_ascii=False)} |")
    lines += ["", "唯一允许按既有D-19带当前代码依据NOT_RUN的额外腿是live-n-20mib-over-budget。其余9腿必须PASS；它们任一缺失、NOT_RUN或FAIL都会阻断E2E-18。", "",
              "## 覆盖与自动化边界", "", "[覆盖映射](coverage-map-e2e.json)列出24条AC、12条运行责任和10组验收义务。部分异常只能确定性注入，保留UT/IAT边界，不伪造真实E2E已触发。", "",
              "[自动化大纲](e2e-skeletons/real-journeys.mjs)带PLANNING_ONLY守卫，只列实施责任，不能注册为已通过产品测试。真实场景由阶段5按[运行手册](e2e-runbook.md)实现并执行。", "",
              "阶段5/6/8与用户现场移交见[交接清单](handoff.md)；[本阶段检查](e2e-qa.md)仅验证文档。", ""]
    return "\n".join(lines)


def outputs():
    return {"planning-cases.json": json.dumps(plan(), ensure_ascii=False, indent=2) + "\n",
            "coverage-map-e2e.json": json.dumps(coverage(), ensure_ascii=False, indent=2) + "\n",
            "e2e-user-journey-plan.md": render()}


if __name__ == "__main__":
    for name, content in outputs().items():
        path = HERE / name
        if sys.argv[1:] == ["--write"]:
            path.write_text(content, encoding="utf-8", newline="\n")
        elif sys.argv[1:]:
            raise SystemExit("Usage: python e2e-catalog.py [--write]")
        elif not path.is_file() or path.read_text(encoding="utf-8") != content:
            raise SystemExit("E2E_PLANNING_CATALOG_DRIFT: " + name)
    print("E2E_PLANNING_CATALOGS_MATCH: 39 scenarios; no product execution")

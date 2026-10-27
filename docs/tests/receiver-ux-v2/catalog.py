"""Render planning catalogs only. Never imports product/test implementation."""
import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
UNIT_FILES = ("cases/core.json", "cases/experience.json", "cases/tooling.json")


def read_cases(name):
    return json.loads((HERE / name).read_text(encoding="utf-8"))


def unit_cases():
    return sorted(sum((read_cases(name) for name in UNIT_FILES), []), key=lambda x: x["id"])


def render_units():
    cases = unit_cases()
    lines = [
        "# 接收器体验 v2 — 单元与工具用例", "",
        f"规划共{len(cases)}条，全部NOT_RUN、executedBy=null、scope=unit_integration。不是执行结果；编号分段预留，空号不代表缺测。", "",
        "机器源：[核心](cases/core.json)、[体验](cases/experience.json)、[工具](cases/tooling.json)。本文由[catalog.py](catalog.py)生成，修改JSON后以--write重建；正式测试必须补真正行为断言，不执行docs骨架取得产品结论。", "",
    ]
    for c in cases:
        skeleton = (ROOT / c["skeleton"]).relative_to(HERE).as_posix()
        lines += [f"## {c['id']} — {c['title']}", "",
                  f"- Target: `{c['target']}`；[规划骨架]({skeleton})。",
                  f"- Trace: {', '.join(c['taskIds'])}；{', '.join(c['acceptanceIds'])}；{', '.join(c['runtimeIds']) or '工具/局部质量要求'}。",
                  f"- Given: {c['given']}", f"- When: {c['when']}", f"- Then: {c['then']}",
                  f"- Diagnostics: {', '.join(map(str, c['diagnosticCodes'])) or '无新增诊断'}。", "",
                  "具体断言：", ""]
        lines += ["- " + a for a in c["assertions"]]
        lines += ["", "夹具/数据：" + "；".join(c["fixtures"]) + "", "", "业务RED预期：" + c["redExpectation"], ""]
    return "\n".join(lines).rstrip() + "\n"


def render_acceptance():
    groups = read_cases("cases/integration.json")
    obligations = read_cases("cases/acceptance.json")
    lines = ["# 接收器体验 v2 — 集成与真实验收定义", "",
             f"{len(groups)}组集成、{len(obligations)}组验收义务均为NOT_RUN。本文件是阶段4.5输入定义，不是4.7逐步骤E2E计划，也不是已执行证据。", "",
             "机器源：[集成](cases/integration.json)、[验收义务](cases/acceptance.json)。所有执行者初值null；local/field/注入分列。由[catalog.py](catalog.py)生成。", "",
             "## 集成定义", ""]
    for c in groups:
        lines += [f"### {c['id']} — {c['title']}", "", f"Trace: {', '.join(c['taskIds'])}；{', '.join(c['acceptanceIds'])}；{', '.join(c['runtimeIds'])}。",
                  "", f"执行模式：`{c['mode']}`；scope=`unit_integration`，初始NOT_RUN。", "", "前置：", ""]
        lines += ["- " + value for value in c["preconditions"]]
        lines += ["", "组合操作：", ""] + [f"{i}. {value}" for i, value in enumerate(c["steps"], 1)]
        lines += ["", "判据：", ""] + ["- " + value for value in c["expected"]]
        lines += ["", "必要证据：" + "；".join(c["evidence"]) + "", ""]
    lines += ["## 真实操作与交付验收义务", "",
              "以下UX-AT编号只表示验收分组；e2eCaseIds=null，4.7再冻结具体E2E编号/步骤和机器计划。旧E2E-1～20全量本地及21～26现场保持，新增UX编号从27起。", ""]
    for c in obligations:
        lines += [f"### {c['id']} — {c['title']}", "", f"Trace: {', '.join(c['taskIds'])}；{', '.join(c['acceptanceIds'])}；{', '.join(c['runtimeIds'])}。", "",
                  f"计划scope=`{c['scope']}`，caseType=`{c['caseType']}`，执行角色=`{c['executorRole']}`；尚未实际执行。", "", "必要条件：", ""]
        lines += ["- " + value for value in c["requires"]]
        lines += ["", "成功应有的实际事实：", ""] + ["- " + value for value in c["success"]]
        lines += ["", "边界：" + c["boundary"], ""]
    lines += ["## 共同门禁", "",
              "旧v1结果只装旧AC；UX结果分开且新汇总必须覆盖全部必测。实际产品清单/输入/attempt与证明对应，文件外部SHA实算。缺测/错scope/假哈希/部分阶段不能PASS；用户现场尚未执行时独立NOT_RUN，不伪造整体绿灯。最终包入口由阶段8补验。", ""]
    return "\n".join(lines).rstrip() + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="write the two planning Markdown projections")
    args = parser.parse_args()
    outputs = {"test-cases.md": render_units(), "acceptance-tests.md": render_acceptance()}
    if args.write:
        for name, text in outputs.items():
            (HERE / name).write_text(text, encoding="utf-8")
    else:
        for name, text in outputs.items():
            if (HERE / name).read_text(encoding="utf-8") != text:
                raise SystemExit("CATALOG_MISMATCH: " + name)
    print(json.dumps({"result": "PLANNING_CATALOG_WRITTEN" if args.write else "PLANNING_CATALOG_MATCH", "unitCases": len(unit_cases()), "integrationGroups": len(read_cases('cases/integration.json')), "acceptanceDefinitions": len(read_cases('cases/acceptance.json')), "productAcceptance": "NOT_RUN"}))


if __name__ == "__main__":
    main()

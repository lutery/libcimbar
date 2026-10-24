# receiver-ux-v2 阶段5 执行日志（lead 独占写入）

> 记录规则：每批一条（批号/任务/代理/起止/提交哈希/证据指针/异常处置）。审查轮号沿用全局计数（历史已至 14），下一轮=15，标注在各区 review-*.md 头部。

## B0 — 基线冻结（lead）

- 起止：2026-10-24 14:37 ～ 14:40 (+08:00)
- 动作：分支 `receiver-ux-v2`（自 master `9e4fbc4`）；pipeline-state team-exec in_progress/team_mode=native（通道A，不生成 .omc 契约）；规划基线提交 `0ed2e5b`（98 文件：stages 1-4.7 全部材料 + v1 历史归档 + README 导航）；账目初始化 `2b47233`。
- 证据指针：`git log 0ed2e5b`；工作树 clean。
- 备注：`git diff --cached --check` 报 5 个规划文件 EOF 空行（Codex 产出原样保留，不改写字节）。

## B1 前置基线门禁（lead，HEAD 2b47233 实测）

- `node tools/desktop-recv/run-unit.mjs --all` → UNIT SUITES PASS（9 suite / 120 tests，0 fail/todo/skip），exit 0。
- `python tools/desktop-recv/verify-evidence-selftest.py` → SELFTEST PASS (14 cases)，exit 0。
- `python tools/desktop-recv/e2e/video-prefix-check.py --selftest` → PASS (3/3)，exit 0。
- `python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py` → DESIGN_CONTRACT_SHAPES_PASS（20 defs/27 examples/44 vectors/15 diagnostics；12 implementationCases NOT_RUN），exit 0。

## B1-T1 — 运行上下文与新旧门禁先行失败测试（dev-v2-tools → lead 提交）

- 起止：2026-10-24 14:40 ～ 15:00 (+08:00)；代理报告：`docs/dev-pipeline/receiver-ux-v2/b1-t1-report.md`
- 产物：`tools/desktop-recv/tests/run-context.test.mjs`（26,132 B，UX-UT-081..086）、`tools/desktop-recv/tests/ux-evidence-selftest.py`（26,404 B，UX-UT-088..095）。未注册进 run-unit（工具独立）。
- 真实 RED（lead 独立复跑确认）：`node --test .../run-context.test.mjs` exit 1（ERR_MODULE_NOT_FOUND e2e/run-context.mjs）；`python .../ux-evidence-selftest.py` exit 1（preflight: missing verify-ux-evidence.py/run-context.mjs）。日志：`red-logs/b1-t1-node.log`、`red-logs/b1-t1-python.log`。
- 旧回归：verify-evidence-selftest 14/14、prefix 3/3、run-unit --all 9 套 120 全绿（代理与 lead 均实测）。
- 设计说明（T2 需遵循）：runner/recorder 增 `--validate-only`/`--repo-root`（无副作用身份输出）；verify-ux-evidence 经 `node e2e/run-context.mjs --validate` 复用同一解析器；产品 manifest 格式（version/iterationId/base/files 排序）；错误码前缀 E_CONTEXT_*/E_MANIFEST_*/E_ATTEMPT_EXISTS。
- 提交：`test: specify isolated UX run and gate boundaries`（含台账与 RED 日志）。

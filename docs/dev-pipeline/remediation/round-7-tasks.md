# Round-7 整改任务（阶段 6.5 Step A → 执行清单）

- 触发：`docs/dev-pipeline/ext-review/round-7-verdict.md`（唯一 Blocking **B-R1**：首次 `--legs` 局部复跑仍会把缺 `executedInAttempt` 的历史携带腿错误重标为本次执行；上轮 A-01/A-02/A-03 已确认关闭，不重开）。
- 裁决：`docs/dev-pipeline/remediation/round-7-triage.md`（B-R1 确认纳入整改；S-1 采纳、S-2 留阶段 8）。
- 计划依据：round-7-verdict 的最小 DoD（"合并时显式区分 carried 与 fresh……历史字段缺失时明确 unknown 并拒绝把它当成本次执行……补当前真实记录形状回归"）+ 编排方 2026-10-22 授权的整改指令（无独立计划文件：单 Blocking 小范围整改，不需浏览器车道）。
- 对象：HEAD `3a8041b`；整改范围 `faf8906..3a8041b`（外审范围），本清单对应提交 `4deaba8`（R7-1）与随后的文档归档提交（R7-2）。

## 任务

| 任务 | 内容 | 状态 |
|---|---|---|
| **R7-1 工具语义 + 回归**（`4deaba8`） | `evidence.mjs`：新增纯 `tagCarriedLegs(legs, reexecutedIds, attemptId)`（不在重执行集合的腿打 `carriedInAttempt = {into, origin, basis}`；集合内不动；空集合=全量重跑不标记）；`stampLegAttempts` 收紧为只给无 `executedInAttempt` 且无 `carriedInAttempt` 的 fresh 腿盖章（fail-closed，绝不以当前合并 attempt 兜底）。`run-e2e.mjs`：`--legs` 合并路径改用 `tagCarriedLegs`（`ACTIVE_ATTEMPT_ID` 由 main() 设置）。回归：**UT-112**（审阅者精确反例：当前记录 9 条缺 origin 携带腿 + 1 条新预算腿 → 只有新腿被盖 `executedInAttempt`，9 条保持 undefined 且带 `carriedInAttempt`）+ **UT-113**（集合内不动/集合外打标/空集合=全量重跑；round-13 S-1 增补二次合并边界：已有 `executedInAttempt='att-first'` 的携带腿经 `tagCarriedLegs(...,'att-second')` 得 `carriedInAttempt.origin='att-first'` 且原字段不动）；UT-111 保留。**R7 S-1 断言**（`4deaba8`）：`assertSaveTimingsComplete` 必检集加入 `createWritableAccessedAt`（picker 边界），排序为四点链式；当前 14 条保存腿全部满足（无一弱化）。 | 完成 |
| **R7-2 主张同步 + 归档** | `stage5-dev-summary.md` R11-B3 段与 `ext-review/round-6-package.md`（A-03 行、R11 段、3e34f2 诚实性注）改为准确语义：合并时携带腿打 `carriedInAttempt`（origin 缺失即 unknown，**有 origin 则保留该值**——round-13 S-1）、最终写入只盖 fresh 腿；"8 条执行腿来自 3e34f2"始终是文档陈述，不是机器字段；删除"未来合并归属正确"类主张。归档：本文件（round-7-tasks.md）补齐 triage 引用链。 | 完成（本文件） |

## 覆盖检查

- B-R1 ≥ 1 任务（R7-1 代码+回归；R7-2 主张同步）；pushback 零任务；无桌面重跑（verdict 明示不需）。

## 验证（`4deaba8` 工作树实测）

| 门 | 命令 | 结果 |
|---|---|---|
| 语法 | `node --check`（evidence.mjs / run-e2e.mjs / leg-timings.mjs / evidence.test.mjs） | 0 |
| 单元 | `node tools/desktop-recv/run-unit.mjs --all` | 9 套件 **118** 测试全绿（evidence 34；含 UT-112/113；0 fail/todo/skip） |
| 门禁自测 | `python tools/desktop-recv/verify-evidence-selftest.py` | 14/14 |
| 前缀自测 | `python tools/desktop-recv/e2e/video-prefix-check.py --selftest` | 3/3 |
| 本地门禁 | `verify-evidence.py --run … --gate local` | PASS (20 required cases)，exit 0 |
| 现场门禁 | `--gate field` | FAIL（E2E-21..26 缺记录），exit 1——设计内正确拒绝 |

## 波次

- **W1 工具 + 回归**（无浏览器）：evidence.mjs / run-e2e.mjs / leg-timings.mjs + UT-112/113（+ round-13 S-1 二次合并边界断言）——`4deaba8`。
- **W2 文档 + 归档**（无浏览器）：stage5-dev-summary / round-6-package 主张同步 + 本 tasks 文件。

本轮无浏览器车道、无 results.json 手工编辑、无媒体重录。

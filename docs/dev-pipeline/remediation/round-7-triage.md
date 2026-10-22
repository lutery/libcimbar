# Round-7 整改 triage（阶段 6.5 Step A，紧凑）

- 触发：`docs/dev-pipeline/ext-review/round-7-verdict.md`（对应 Round-6 包；ext_rounds=6 → N=7；编排方按实际路径入账，ext_rounds=7，下一 verdict=round-8）。
- 对象：HEAD `3a8041b`；整改范围 `faf8906..3a8041b`。

## 三栏记录

| 编号 | 裁决 | 处置 | 依据与动作 |
|---|---|---|---|
| B-R1 | 确认 | 纳入整改 | `stampLegAttempts`（evidence.mjs:119-123）把缺 `executedInAttempt` 一律当本次新执行；当前 run-03 E2E-18 十腿全缺该字段，下次 `--legs` 局部复跑会把 9 条携带腿错误重标（审阅者内存反例：legacyCarried=9, reattributedCarried=9）。动作：`tagCarriedLegs`（合并时按"不在重执行集合"打 carried/origin-unknown 事实标）+ `stampLegAttempts` 收紧（只盖 fresh，fail-closed）+ UT-112 当前形状回归 + 主张同步；见 tasks 增补 R7-1。 |

- 反证（pushback）：无。
- 建议：S-1（assertSaveTimingsComplete 必检集加 createWritableAccessedAt）**采纳**；S-2（environment 当前快照）留阶段 8，本轮记录。
- 已确认关闭（不重开）：A-01/A-02/A-03（round-7 verdict 逐项列证）。

## 覆盖检查

- B-R1 ≥1 任务（R7-1 代码+回归、R7-2 主张同步）；pushback 零任务；无桌面重跑。

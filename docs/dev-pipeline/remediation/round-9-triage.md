# Round-9 整改 triage（阶段 6.5 Step A，紧凑）

- 触发：`docs/dev-pipeline/ext-review/round-9-verdict.md`（对应 Round-8 包；ext_rounds=8 → N=9；编排方按实际路径入账，ext_rounds=9，下一 verdict=round-10）。
- 对象：HEAD `56f2d5a`。

## 三栏记录

| 编号 | 裁决 | 处置 | 依据与动作 |
|---|---|---|---|
| B-R1（异常出口） | 确认 | 纳入整改 | `writeAttemptMarker` 保留旧 measurement 但未打 carried 标；场景提前失败后终写盖章把 10 条历史腿盖为失败 attempt（三方独立内存复现；正常合并路径已修）。动作：marker 携带基底逐腿打 carried（origin 已知保留/unknown 兜底）+ UT-114/115 异常形状回归 + 主张同步；见 round-9-tasks。 |

- 反证（pushback）：无。
- 已确认继续有效、不重开：逐异常恢复、末帧配对、保存四时点（round-9 verdict 保留边界表）。
- 建议：无新增（round-7 S-1 已采纳并验证）。

## 覆盖检查

- B-R1 ≥1 任务（R9-1 代码+回归、R9-2 文档）；pushback 零任务；无桌面重跑。

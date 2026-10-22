# 内部审查归档 — Round 14（round-9 B-R1 异常出口单点复核；round-9 整改周期）

- 新周期标注：round-9 verdict（B-R1 异常出口）整改周期的内审单点复核；pipeline-state 的 `review_rounds=10 / max_rounds=10` 由编排方保管，本报告不自增该计数。
- 范围：`56f2d5a..d609ab2`（单提交 `d609ab2`：markMarkerLegsCarried + writeAttemptMarker 接线 + UT-114/115 + 文档主张同步 + round-9 verdict/triage 入库与 pipeline-state 入账）。
- 审查结论：**通过（0 Blocking）**。round-9 verdict B-R1 的最小 DoD 全部满足并经本人独立反例重放复验（reattributedOldLegs=0，修复前为 10）。

## 独立复核（本轮实际执行）

- **①markMarkerLegsCarried 语义核验（evidence.mjs）**：对 `record.measurement.legs` 中每条腿写入 `carriedInAttempt = {into: attemptId, origin: leg.executedInAttempt || 'unknown', basis: "carried into this attempt's marker from the prior record; not executed in this attempt"}`；`if (!leg || leg.carriedInAttempt) continue` 保证**幂等**（既有标不覆盖）；无 measurement/legs 时安全空操作。本人另以独立探针验证已知 origin 分支：`executedInAttempt='att-prior'` 的腿 → `origin='att-prior'`（非 unknown）且 executedInAttempt 保留、盖章不重标；无 origin 腿 → unknown。
- **②writeAttemptMarker 接线与时序核验**：run-e2e.mjs 中 `writeAttemptMarker`（:3780）在复制 `existing.measurement` 之后立即调用 `markMarkerLegsCarried(record, attemptId)`（:3813 附近），随后才 `upsertResult`；main() 的 marker 调用在 :3868，`await scenario(stack, SOURCE)` 在 :3875——**先于任何场景代码**。可抛错源 `ensureExtendedFixtures` 定义于 :1134、`throw` 于 :1141（非零退出）与 :1145（JSON.parse），其唯一调用点 :2995 位于 E2E-18 场景内部，**确为 marker 的下游**。
- **③stampLegAttempts fail-closed 不变**：仍为 `if (leg && !leg.executedInAttempt && !leg.carriedInAttempt) leg.executedInAttempt = attemptId;`——本轮 diff 未触碰该函数；携带腿（含 marker 打标）永不重标。
- **④UT-114/UT-115 核验**：UT-114 即 verdict 精确流程——当前真实形状 10 腿 legacy 记录 → marker 复制并 `markMarkerLegsCarried`（含二次调用验证幂等）→ 模拟合并前抛错 → `stampLegAttempts` 终写：10 腿 `executedInAttempt` 均 undefined、`carriedInAttempt` 逐字段 deep-equal；随后追加的 fresh 腿正确盖 `att-failed`；下一次正常 `--legs` 合并（9 携带）`into` 更新为 `att-next` 而 `origin` 保持 `unknown`、绝不为失败 attempt。UT-115 覆盖"场景内已 `tagCarriedLegs`、写入新结果前抛错 → 终写不重标"形状。UT-111/112/113 未改动（行 735/763/795），本轮单测全绿。
- **⑤文档主张核验**：stage5:139 已加入 marker 隔离语义（`markMarkerLegsCarried` 幂等、场景提前失败不把历史腿盖成失败 attempt 的执行）并把 origin 措辞改为"有已知 origin 取该值，缺失即 unknown"（与现行 `tagCarriedLegs`/`markMarkerLegsCarried` 代码一致）；round-8-package 的 B-R1 行、关键主张表与归属说明同步改为"正常与异常出口均闭合"，测试数 120（evidence 36，UT-111..115）；未发现超出实现的完成主张。
- **独立反例重放（仅内存/临时，未触仓库）**：对**当前** evidence.mjs 复现 verdict 流程——legacy 10 腿 → `markMarkerLegsCarried`（幂等验证）→ 模拟 `ensureExtendedFixtures` 合并前失败 → catch/finally `stampLegAttempts`：`failedMarkerResult=FAIL, oldLegCount=10, reattributedOldLegs=0`（修复前三方复现为 10）；fresh 腿仍正确盖章；下一次正常合并 9 携带腿 `origin=unknown` 且绝不为 `att-failed`——**REPLAY PASS**。
- **门禁实跑（本人在 d609ab2 工作树）**：`run-unit.mjs --all` exit0（9 套件 **120** 测试：evidence 36 = 34+UT-114/115；UT-111..113 保留、无删例）；`verify-evidence-selftest.py` exit0（14/14）；`verify-evidence.py --gate local` exit0 PASS(20)；`--gate field` exit1（6 violations：E2E-21..26，设计内正确拒绝）。
- **diff 扫描**：无产品源（src/、worker/）与 run-03 records/measurements 变更；改动仅 evidence.mjs（+22 行纯函数）、run-e2e.mjs（导入+marker 内联调用）、evidence.test.mjs（+84 行两测试）、stage5/round-8-package、round-9 verdict/triage、pipeline-state；pipeline-state 入账与 round-9 verdict 消费一致（team-exec in_progress/test_status failed、external-review failed、ext_rounds=9、verdict_files +round-9-verdict.md，review_rounds 保持 10）。

## Blocking issues

无。

## Suggestions

- S-1：`docs/dev-pipeline/remediation/round-9-tasks.md` 在 HEAD `d609ab2` **未入库**（工作树 `??` 未跟踪），而 `round-9-triage.md` 已提交并引用"见 round-9-tasks"——干净克隆/送审包将缺失该被引用工件。请在下一提交（本报告/round-10 包提交）一并入库，或改写 triage 引用；与 round-7 周期 `99aaf05` 补交 round-7-tasks.md 的处理方式一致。
- S-2（承 round-9 verdict 已记录项，非本轮范围）：environment.json 仍为 cb43f85 时期历史快照，按既定安排留阶段 8；round-9 verdict S-2 已确认不新增本轮要求。

## 审查者

- 内部审查 Round 14（B-R1 异常出口单点复核），实施方独立复核者：Claude（review-11 agent，轮次接续），2026-10-22。只读复核对仓库的唯一写动作是本报告；未修改产品代码、证据或流水线状态；反例重放与已知 origin 探针脚本均在 %TEMP%（未触仓库）。本轮实际执行：evidence.mjs/run-e2e.mjs 逐行核验与 marker→scenario→抛错→finally 时序推演、ensureExtendedFixtures 抛错点（:1134/:1141/:1145→:2995）下游性确认、UT-111..115 逐测试核读、verdict 反例内存重放（reattributedOldLegs=0 / fresh 盖章 / 下一次合并 origin=unknown / 幂等）、已知 origin 分支独立探针、文档主张逐句核对、unit/selftest/local/field 四项门禁实跑、d609ab2 全量 diff 与流水线状态扫描。

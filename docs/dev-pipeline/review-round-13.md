# 内部审查归档 — Round 13（B-R1 单点复核；round-7 整改周期）

- 新周期标注：round-7 verdict（B-R1）整改周期的内审单点复核；pipeline-state 的 `review_rounds=10 / max_rounds=10` 由编排方保管，本报告不自增该计数。
- 范围：`3a8041b..4deaba8`（单提交 `4deaba8`：tagCarriedLegs + fail-closed stampLegAttempts + UT-112/113 + S-1 四时点断言 + 文档主张同步 + round-7 verdict/triage 入库与 pipeline-state 入账）。
- 审查结论：**通过（0 Blocking）**。B-R1 的最小 DoD 全部满足并经本人独立反例重放复验；round-7 verdict S-1 建议按 triage 采纳。

## 独立复核（本轮实际执行）

- **①tagCarriedLegs 语义核验（evidence.mjs）**：以 `new Set(reexecutedIds)` 判定重执行集合；空集合**先返回空数组、零打标**（全量重跑=无携带）；仅对"不在集合内"的腿写入 `carriedInAttempt = {into, origin:'unknown', basis:'present in the record before this attempt; excluded from the --legs re-execution set'}`，集合内腿不动、返回携带子集（原地修改）。与简报语义逐条相符。
- **②stampLegAttempts fail-closed 核验**：仅对**既无 `executedInAttempt` 也无 `carriedInAttempt`** 的腿盖当前 attempt；两种字段任一存在即跳过——携带腿（无论 legacy 无 origin、还是已有 origin）永不重标。UT-111 保留并覆盖三形状：已有 origin 保持 `att-origin`、fresh 盖 `att-merge`、`executedInAttempt:null` 的 fresh 也盖当前值、无腿记录原样返回。
- **③UT-112/UT-113 核验**：UT-112 即审阅者反例的当前形状回归（9 条无 origin 携带腿〔8 执行 + 1 sanctioned NOT_RUN〕+ 1 条 fresh 预算腿 → tag 后 stamp：9 条携带腿 `executedInAttempt` 保持 undefined、`carriedInAttempt` 逐字段 deep-equal，仅 fresh 腿盖 `att-merge`）；UT-113 覆盖打标器本身（集合内不动、集合外打标、空集合=全量重跑零打标）。两测试与 `tagCarriedLegs`/`stampLegAttempts` 源码同步核读一致。
- **④run-e2e 接线核验**：merge 路径（run-e2e.mjs:3009-3021）调用 `tagCarriedLegs(existingLegs, ONLY_LEGS, ACTIVE_ATTEMPT_ID)` 并仅 push 携带子集（与旧逻辑推送集合等价）；`ACTIVE_ATTEMPT_ID` 由 main() 在 `writeAttemptMarker`/scenario 之前赋值（run-e2e.mjs:3856-3857 附近），probe 重跑时的 `video-n-4mib` 自动并入 ONLY_LEGS 发生在 merge 之前（该腿按重执行处理，不被误标）；最终记录写入时 `stampAttemptId`（run-e2e.mjs:3833-3841）调用 `stampLegAttempts`。
- **⑤round-7 S-1 采纳核验**：`SAVE_TIMING_FIELDS` 扩为四时点（saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt），断言为逐对有序（saveRequestAt ≤ createWritableAccessedAt ≤ writableAt ≤ writeCloseAt），四类缺失逐项命名失败；UT-108（3100≤3200≤3300≤4000）与 UT-109（缺四类 mark + 乱序反例含 picker 边界）已同步更新。**本人以独立脚本对 results.json 逐腿核查：14 条含保存腿全部四时点非空且有序，violations=0**（E2E-15 四恢复腿经 saveTimings 全对象、E2E-16 v-last-with 与 E2E-18 九腿经 timings）。
- **⑥文档主张核验**：stage5:139 已把旧的"R11-B3 起合并对携带腿写入 executedInAttempt"（该句正是 B-R1 推翻的过度主张）替换为收紧后的准确语义描述，并明示"8 条执行腿来自 3e34f2 始终是文档陈述，不是机器字段"；3e34f2 CASE PASS 句已带"编排方观测…非仓库可复核证据"的证词来源标注；round-6-package A-03 行与关键主张节同步改写。全仓 grep（package/stage5/R11/R12）无"未来合并归属正确"类残留。
- **独立反例重放（仅内存/临时，未触仓库）**：`node %TEMP%\r13-replay.mjs` 对**当前** evidence.mjs：legacyCarried=9、reattributedCarried=0、fresh 腿盖 merge attempt、carriedInAttempt {into/origin:'unknown'/basis} 逐字段正确、UT-111 形状（已有 origin 保持）、空集合=全量重跑零打标——**REPLAY PASS**。
- **门禁实跑（本人在 4deaba8 工作树）**：`run-unit.mjs --all` exit0（9 套件 **118** 测试：evidence 34 = 32+UT-112/113；UT-108/109 更新、UT-111 保留、无用例删除）；`verify-evidence-selftest.py` exit0（14/14）；`verify-evidence.py --gate local` exit0 PASS(20)；`--gate field` exit1（6 violations：E2E-21..26，设计内正确拒绝）。
- **diff 扫描**：无产品源（src/、worker/）变更；results.json/measurements 未动；pipeline-state 入账与 round-7 verdict 消费一致（team-exec in_progress、test_status failed、external-review failed、ext_rounds=7、verdict_files +round-7-verdict.md），与既往周期入账先例一致；stage5/round-6-package 的修改逐句可指到代码与记录。

## Blocking issues

无。

## Suggestions

- S-1：`tagCarriedLegs` 对**已有** `executedInAttempt` 的携带腿也写 `origin:'unknown'`（第二次合并的边界：携带腿同时带 `executedInAttempt=att-old` 与 `carriedInAttempt.origin='unknown'` 相邻并存）。执行主张本身保持诚实（stamp 不覆盖、executedInAttempt 原值保留），但该标签在来源已知时可写 `origin: executedInAttempt`；属精度改进，非诚实性缺陷。
- S-2：`round-7-triage.md` 的动作列引用"见 tasks 增补 R7-1"，但 `remediation/` 下无 round-7-tasks.md（round-3/5 周期均有 tasks 文件）；建议补文件或把 triage 措辞改为内联定义 R7-1/R7-2。
- S-3（承 round-7 verdict S-2，非本轮范围）：environment.json 仍为 cb43f85 时期历史快照，按 triage 留阶段 8 处理。

## 审查者

- 内部审查 Round 13（B-R1 单点复核），实施方独立复核者：Claude（review-11 agent，轮次接续），2026-10-22。只读复核对仓库的唯一写动作是本报告；未修改产品代码、证据或流水线状态；反例重放与 14 腿核查脚本均在 %TEMP%（未触仓库，临时文件已用后未清但不影响仓库）。本轮实际执行：evidence.mjs/leg-timings.mjs/run-e2e.mjs 逐行核验、UT-108/109/111/112/113 逐测试核读、14 条保存腿四时点+逐对有序独立脚本核查（0 违规）、审阅者反例内存重放（legacyCarried=9 / reattributedCarried=0 / 仅 fresh 盖章）、ACTIVE_ATTEMPT_ID 接线与 marker→scenario→merge→final-stamp 时序推演、文档主张 grep 与逐句核对、unit/selftest/local/field 四项门禁实跑、4deaba8 全量 diff 扫描。

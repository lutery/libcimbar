# 内部审查归档 — Round 10（round-9 B-1 单点整改复核）

- 范围：`43259c5..31b9d30`（单提交：authorized-NOT_RUN 矩阵语义 + E2E-18 全矩阵重跑 + 授权链落档 + S-1/S-2/S-3 附带修复）。
- 审查结论：**通过（0 Blocking）**。Round-9 B-1 按 DoD 路径 (i) 真实关闭：已提交 harness 现在本身产生该矩阵 PASS 记录，授权链可查，记录、代码、摘要、门禁四者一致且可复现。

## 独立复核（本轮实际执行）

- **语义核验**（`run-e2e.mjs` E2E-18 组装处）：`AUTHORIZED_NOT_RUN = {'live-n-20mib-over-budget'}`，代码注释引用 triage 决策 7 / D-19；PASS 分支条件 = 无 FAIL 腿 且（无 NOT_RUN 腿 或 全部 NOT_RUN 腿 ∈ 清单且各带 basis）；越权 NOT_RUN 或清单腿丢 basis → 记录 `result:'NOT_RUN'` 并在 notes 给出具体 reason（fail-closed 保留）；旧"local gate cannot claim all-PASS"矛盾注释已移除并替换。清单外任何 NOT_RUN（含未来新增腿）都会把门禁留红——语义收紧而非放宽。
- **可复现性核验**：记录 attemptId `E2E-18-2026-10-21T19-58-28-508Z-fc3f88` 与 `logs/E2E-18-r9-repro.log` 一致，尾行 `CASE E2E-18 PASS`；日志含全矩阵轨迹（4 实时腿 19:58-20:01 → 三次 recorder 会话 → video 腿保存 → 20:39 budget-recovery）；probe-bounds 于 20:05:15 重声明、探测腿 validInputStart 20:09:50（先声明后执行保持）；10 腿齐全，`video-n-4mib` 重录 861,505,434 B（sha `616206ca…`，3,859 呈现帧）。记录 notes 与代码模板逐字一致（`matrix legs: …; every executable leg PASS; NOT_RUN legs: live-n-20mib-over-budget (sanctioned by … AUTHORIZED_NOT_RUN per triage decision 7 / D-19); no scope revision needed`）——无手工措辞残留。canonical 对（`2f871833…`）、4 MiB 腿（`6181826a…`=难压缩 4MiB 样本）、budget-recovery（`2f5a22f9…`）哈希本人重算相等；恢复腿 initMs=3608（S-1 负值已修，`resetJourneyMarks` 于恢复会话前清页级标记，作用域正确）。
- **授权链核验**：triage 决策 7（2026-10-22 补录：矩阵语义 + 清单 + 显式声明取代"整案 NOT_RUN"保守判据与人工升级，且如实注明人工升级链仅在会话中不可复现）；`autonomous-decisions.md` D-19（裁定人 team-lead / 日期 / 依据=用户批准腿矩阵 + 4MiB 录像腿实测 / 原始 FAIL 日志行引用 / 取代声明）。互相引用并与代码一致。
- **一致性核验**：stage5 摘要（E2E-18 段）改为"由已提交代码路径可复现地产生"，引用决策 7/D-19、新 attempt 与新旧日志行，旧人工升级"不再支撑当前登记"；environment.json note 同步（"manual upgrade is superseded by that reproducible path"）；`measurements.json` counts={20,20,0,0}（重跑后重生成，腿级 18=17 PASS+1 NOT_RUN 带依据）。results.json 逐 case 对比：**唯一变更 = E2E-18**（result 稳定 PASS，attemptId 换为重跑），其余 19 条记录字段未动；run-02 仍零改动；11 个 attempt 标记全保留（历史链完整）；round-9.md 以本人原件逐字节入库（hash 相等）。
- **门禁实跑**：unit 9 套件 108 测试全绿；selftest 14/14；run-03 local **PASS(20)** / field **FAIL(6)**（E2E-21..26，正确拒绝）；assets PASS（revision `a515922` 如实声明）。
- **新问题扫描**：`resetJourneyMarks` 仅清 `__journey` 且仅在 E2E-18 预算恢复前调用；`.gitignore` 新增 `fixtures-ext/*/` 且 `manifest.json` 保持 tracked（git status 干净）；`summarize.py` 分桶标签化（"None/None/None" 头已消除，report 现按 verdict/live 分组）；无其它行为改动。未发现新回归。

## Blocking issues

无。Round-9 B-1 关闭路径 (i) 的三要素全部成立：语义入码（fail-closed）、记录由代码路径再生成（非人工 upsert）、授权链落档（triage 7 + D-19，含原 FAIL 行与取代声明）。

## Suggestions

- S-1（残余观察，非阻断）：D-19 的裁定人为 team-lead（"用户批准计划内授权"），非用户对旅程级语义的当面新裁决；链路现已可审计且代码对清单外 NOT_RUN 保持 fail-closed，round-4 外审如要求用户直接确认，只需补一条用户确认记录，无需改代码。
- S-2：probe-bounds.json 为单文件覆盖式（本次重跑的声明取代旧声明）；旧 attempt 的声明仅存在于其日志/记录中。如后续多次重跑，可考虑按 attempt 归档声明。

## 审查者

- 内部审查 Round 10（单点复核），实施方独立复核者：Claude（review-7 agent），2026-10-22。只读；未修改产品代码。本轮实际执行：语义代码逐行核验、repro 日志全程轨迹核对、记录 notes 与代码模板比对、probe 声明时序核验、canonical/4MiB/恢复腿哈希重算、逐 case 记录稳定性对比、授权链双文档核验、unit/selftest/双门禁/assets 实跑、31b9d30 全 diff 扫描（含 S-1 修复与 gitignore）。

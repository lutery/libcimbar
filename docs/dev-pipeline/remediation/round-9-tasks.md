# Round-9 整改任务分解（阶段 6.5 Step B，紧凑单页）

- 输入：`docs/dev-pipeline/ext-review/round-9-verdict.md`（对应 Round-8 包；ext_rounds=9；下一 verdict=round-10）、`remediation/round-9-triage.md`、已批准计划 `C:\Users\admin\.claude\plans\crispy-gliding-spring.md`。
- 覆盖：B-R1 异常出口 ≥1 任务（R9-1 代码+回归、R9-2 文档）；pushback 零；无桌面重跑。

## 任务

- **R9-1**（done，提交 `d609ab2`）证据工具：marker 携带基底隔离 — domain H / blocking B-R1（异常出口）/ files: evidence.mjs（`markMarkerLegsCarried` 幂等打标）、run-e2e.mjs（writeAttemptMarker 内联调用，先于任何场景代码）、evidence.test.mjs（UT-114 审阅者反例流：legacy10→marker→合并前抛错→终写盖章→零重标、fresh 正确归属、下一次合并 origin 保持 unknown；UT-115 场景内打标后写前抛错；UT-111..113 不动）/ 要点：stampLegAttempts 保持 fail-closed；marker 打标先于 ensureExtendedFixtures 等可抛错步骤 / 验证：node --check、unit --all（120）、selftest 14/14、prefix 3/3、local PASS(20)、field exit1 / evidence：diff + UT-114/115 输出。
- **R9-2**（done，同提交）文档主张同步 — domain D / files: round-8-package.md、stage5-dev-summary.md / 要点：主张改为"正常与异常出口均闭合（marker 携带基底隔离）"，引 UT-111..115 与 120 测试数；不删历史。

## 波次

W1 = R9-1（工具+回归）；W2 = R9-2（文档）+ 内审 round 14 复核 → round-10 包。

## 验证表（d609ab2 树实测）

| 门 | 结果 |
|---|---|
| unit --all | 9 套件 120 测试全绿（evidence 36） |
| selftest / prefix | 14/14 / 3/3 |
| local / field | PASS(20) / FAIL(6) 设计内 |
| 反例逆转 | UT-114：reattributedOldLegs=0（原 10） |

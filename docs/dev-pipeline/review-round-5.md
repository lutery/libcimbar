# 内部审查归档 — Round 5（批次 C–G 最终检查点）

- 范围：`1aecee3..5233062`（T2.2.a/b、TD-13、T3.1、T3.2、T4.1、T4.2、T5.1、T5.2）
- 裁决：**REQUEST CHANGES**（1 Blocking / 3 Warning / 6 Suggestion）

## Blocking

| ID | 问题 | 证据位置 | 修复 |
|---|---|---|---|
| B-1 | 技债登记失真：TD-01/TD-02/TD-06 的关闭条件指向**已完成任务**，但交付缺失且登记未修订——登记表是"还剩什么"的唯一真相源，会误导现场阶段 | `docs/dev-pipeline/tech-debt.md:7,8,12` | `7a05665`：三行按 TD-12 句式诚实修订，TD-01 设"现场阶段（T5.2.b）前"硬性关闭点并写明"关闭前不得向用户交付候选包"；TD-02 待阶段 6 外审裁决 IF-002；TD-06 文档化约束（mode 8 在契约边界显式抛错） |

## Warning（摘要）

W-A 证据词汇偏离冻结 Evidence 枚举（executedBy/caseType）→ results.json 40 条全部改用冻结词汇，IAT-01/05 升 `file_roundtrip` 带机器推导哈希；evidence.js 与 verify-evidence.py 双侧强制。W-B proofRef 磁盘校验仅覆盖必需 E2E → 扩至全部已执行记录。W-C 约值时间戳再现 → 真实时刻（20:46:30/20:52:17）。

## Suggestion（摘要）

S-1 不可达去重删除 + UT-033 改真断言；S-2 stop() 解析挂起 seek；S-3 mode 8 契约边界拒绝；S-4 candidate 清单先删后生成；S-5 死 Error 状态移除；S-6 IAT-04/05 复现命令入支持矩阵。

## 整改与复审

`7a05665` + `9a5e697` + `4ff7823` + `0d04c80`（含两处自伤修复：夹具词汇、measurement 规则）→ Round 6：**APPROVE（0 Blocking）**，W-A 残留（referenceSha256 字段名 + IAT-01 proofRef）与 S-7/S-8 → `0c0f27a`。

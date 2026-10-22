# 内部审查归档 — Round 3（批次 B 检查点）

- 范围：`1ad18b3..de78871 + cedd603`（T2.1.a/b/c）
- 裁决：**REQUEST CHANGES**（1 Blocking / 6 Warning / 7 Suggestion）

## Blocking

| ID | 问题 | 证据位置 | 修复 |
|---|---|---|---|
| B-1 | 批次 B 记录为 complete，但其定义性真实验证（UAT-L03 真实窗口+系统保存+双侧哈希；T2.1.b 第 4 步实际选窗）缺席且未在状态中披露 | `docs/dev-pipeline/pipeline-state.json` | 选项 (b)：状态改 "code complete, UAT deferred" + **TD-12**（硬性补跑窗口=批次 F T4.1.b 前）；关闭前不得声称本地全功能通过 |

## Warning（摘要）

W-1 发明未登记错误码 16010 → 11005；W-2 内部 Snapshot 偏离冻结形状 → **TD-13** 映射层（`1aecee3`）；W-3 迟到 picker 拒绝可打断 Stopping / decoder init 失败卡死 Preparing → T2.2.a 验收项①②（`f22b0d2` 关闭）；W-4 track ended 后永久 Draining → app 接线 `finishStream`（`80ecb9f`）；W-5 Ready 不释放资源 → `releaseInputs()`；W-6 保存错误映射丢 16003/16004 → 已细分。

## Suggestion（摘要）

S-1 死字段/无界映射 → TD-14；S-2 同步抛错 return true → false；S-3 ended 监听对称守卫；S-4 约值时间戳 → TD-14；S-5 不可达视图状态 → TD-14；S-6 保存丢字段 → TD-14；S-7 `attachStream` 未用 → T3.1 接线。

## 整改与复审

`80ecb9f` → Round 4：**APPROVE（0 Blocking）**，B-1 关闭；3 条 Suggestion 级小注 → `d27422d`。

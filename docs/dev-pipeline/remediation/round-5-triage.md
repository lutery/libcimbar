# Round-5 整改 triage（阶段 6.5 Step A）

- 触发：`docs/dev-pipeline/ext-review/round-5-verdict.md`（对应 Round-4 提交包；ext_rounds=4 → N=5；编排方已按实际路径入账，下一 verdict 文件为 round-6-verdict.md）。
- 对象：HEAD `faf8906`；整改范围 `a058fcd..faf8906`。
- 核验方法：逐条对照 verdict 的「位置 / 本轮证据 / 建议修改及 DoD」，本地复核代码与记录；裁决书确认 T1、陈旧日志假绿、真实入口、4MiB 难压缩录像、20MiB 预算拒绝/恢复均已关闭，不机械继承。

## 三栏记录

| 编号 | 裁决 | 处置 | 依据与动作 |
|---|---|---|---|
| A-01 | 确认 | 纳入整改 | E2E-15 在 empty/text/corrupt 连续导入后仅 `waitVideoEntryReady`（run-e2e.mjs:2093），全部异常结束后才唯一一次真实导入+保存（:2144-2160）；UAT-L15（test-acceptance-plan.md:155-160）要求每次失败后导入 V-GOOD 并保存校验。动作：四恢复腿（cancel/empty/text/corrupt 各一次真实导入+系统保存+外部哈希，逐腿 proof 与 attemptId），见 tasks R5-G。 |
| A-02 | 确认 | 纳入整改 | reload-per-clip 不构成帧 0 同步（审阅者前 30 帧像素差 79.054）；`tStarUs=lastUs+artifactFrameId` 量纲错误（run-e2e.mjs:2301）；with 腿在 39.8s 媒体中 8.03s 提前完成，未覆盖“关键数据位于末尾”。动作：同流双录制器（一次 getDisplayMedia、两个 MediaRecorder 同任务启动、声明停点）；cv2 前缀检查；端段判据 + T* 量纲修正 + tailEvents 诊断；见 tasks R5-B/E/F/H。 |
| A-03 = B-S1 | 确认 | 纳入整改 | E2E-16/E2E-18 成功录像腿的保存量测取自保存前快照（:2373/:2906），5 条录像腿 saveRequestAt/writeCloseAt/saveMs 全 null；保存等待与写入未分项。动作：`completeLegSave` 后读+断言、pageState 暴露注入时点、`leg-timings.mjs` 分项、summarize 新键与 attempt 列；见 tasks R5-I/J。 |

- 反证（pushback）：无。
- 待决策项（本次由计划批准即裁决，无需再询用户）：
  1. 复验范围 = E2E-15、E2E-16、E2E-18（全矩阵再生量测）；其余旅程不重跑（裁决书明示）。
  2. 配对构造 = 同流双录制器 + 声明停点（**如实不可行项**：“接收端 Ready 时停录”需完整文件才可导入，逐次开销 ~15-25s 远大于 ≤2s 端窗；以探针调优声明停点替代，端段判据作为事后证明，最多校准 2 次）。
  3. D-19 按 verdict S-1 改写为“实施方对额外探测腿的适用性/汇总判断”，不称用户新授权。
  4. 编号：内审 round 11 以“round-5 整改周期第 1 轮”记录（pipeline-state 的 review_rounds=10 达 max_rounds=10 由编排方保管，不自增）；外审下一轮为 round-6（公式 N=ext_rounds+1）。

## 覆盖检查

- 每个确认 Blocking 均映射到 tasks 文件（A-01≥2、A-02≥4、A-03/B-S1≥3 条任务）；pushback 零任务。
- 用户批准的计划即本轮裁决依据；任何需要改写冻结计划的事项（无）必须再次经用户确认。

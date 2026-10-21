# Round-3 整改 triage（阶段 6.5 Step A）

- 触发：`docs/dev-pipeline/ext-review/round-3-verdict.md`（对应 Round-2 提交包；编号说明见 verdict 正文——ext_rounds=2 故 N=3；编排方已按实际路径入账）。
- 对象：HEAD `a058fcd`；整改差异 `d61fa74..a058fcd`。
- 核验方法：逐条对照 verdict 的「位置 / 本轮证据 / DoD」，本地复核代码与探针描述；裁决书确认 Round-1 七主题除残留外均已真实关闭。

## 三栏记录

| 编号 | 裁决 | 处置 | 依据与动作 |
|---|---|---|---|
| T1 = A-R1 / B-R1 | 确认 | 纳入整改 | 代码复核：decoder-client.js:109-113 init-failed 分支未 terminate；app.js:66 init 拒绝后 client 失去所有者；session.js 取消后 `_pending>0` 仍接受新会话，ui.js:45 只读 Idle。探针结论（terminated=[0,0,0]；pending 1→2）与本机代码路径一致。动作见 tasks T1-*。 |
| T2 = A-R2 | 确认 | 纳入整改 | E2E-18 仅 1MiB 实时 1 轮；run-02 无 measurements.json；记录无测量字段；summarize.py 读取的字段无人写入；T4.2.a 登记完成超出证据。动作见 tasks T2-*。 |
| T3 = A-R3 | 确认 | 纳入整改 | E2E-15 waitFor 扫描累计日志 + saveDisabled 当终态 → 旧错误可放行 Preparing；importVideo 用 DataTransfer 绕过真实入口；V-LAST 两段为独立录制（无共享起点）。动作见 tasks T3-*。 |

- 反证（pushback）：无。
- 待决策项（已按 6.5 允许的方式向用户提问并获裁决）：
  1. 运行目录策略 → **新建 run `20261021-teamexec-03` + 全量复跑 E2E-1..20**；run-02 证据保留；新目录不复制旧 PASS。
  2. 超预算腿 → **20MiB 可压缩样本实测**（记录产物预算/压缩前后尺寸/拒绝/恢复；像素预算拒绝不得替代产物预算拒绝）；20MiB 难压缩 NOT_RUN 带代码级依据。
  3. 4MiB 难压缩录像腿 → **先做 1MiB 有界探测**（预先声明录制时长/体积/导入等待上界）；失败归因分流（无足量有效录像=装置问题；足量录像仍不能重建=接收端问题）；1MiB 成功≠最大容量；据实提范围修订案→用户确认→同步更新计划/决策记录/支持矩阵/门禁必测子项；历史结果不改判。
  4. 编号统一 → 以 `round-3-verdict.md` 为实际路径入账；round-4 为下一送审轮。

## 覆盖检查

- 每个确认 Blocking 均映射到 tasks 文件（T1≥3、T2≥4、T3≥5 条任务）；pushback 项零任务。
- 用户裁决项已记录，执行时不得偏离；任何需要改写冻结计划的事项（范围修订）必须再次经用户确认。

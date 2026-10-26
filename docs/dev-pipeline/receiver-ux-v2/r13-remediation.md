# Round-13 复审整改台账（阶段 5 整改轮 2）

> 来源：`docs/dev-pipeline/ext-review/round-13-verdict.md`（2026-10-26，codex-gpt-6）——**不通过，3 项阻断**。
> 裁决原文 = DoD 唯一来源。上轮 5 主题闭环裁定：A-R2/A-R3/A-R4 **CLOSED**；A-R1 **PARTIAL**（→A13-02）；
> B-02 **PARTIAL/OPEN**（→A13-01、B-R1）。本台账逐条登记整改义务与状态（初始 OPEN）。

## 阻断主题与建议总览

| 编号 | 主题（verdict） | 分类 | 状态 |
|---|---|---|---|
| A13-01 | 测量 CLI 丢失当前上下文绑定实参（P1，旧 B-02 残留） | Blocking（规格轴） | OPEN |
| A13-02 | 降级修复仍把"相同时间戳"误认为报告没有失效（P2，旧 A-R1 部分） | Blocking（规格轴） | OPEN |
| B-R1(a) | 测量复算只验证自洽，外层没有要求验收结果 PASS（P1，旧 B-02 残留） | Blocking（标准轴） | OPEN |
| B-R1(b) | 同一复算链的原始值缺口：RTT 未从原始起止重算/核对（P1，同上） | Blocking（标准轴） | OPEN |
| S1 | 历史保全边界措辞（旧原始证据未改 ≠ 目录零改动；09b reproduction.md 修正出处 e55c3b3） | 建议 | OPEN |
| S2 | 新增门禁回归应覆盖实际调用边界（真实 CLI/验证函数入口） | 建议 | OPEN |

## 逐项整改义务（DoD 以 verdict 原文为准）

### A13-01 — CLI 绑定实参
- **落点**：`tools/desktop-recv/e2e/measure-ux-calc.mjs`（CLI `:1379` 调用点）；`verify-ux-evidence.py` 接线。
- **修复**：`recomputeMeasurement({...}, expected)` 正确传第二实参；CLI 从 `--context` 实读构造 expected：productManifestSha256（按 context 声明路径磁盘重哈希）、inputSha256/mediaSha256（input manifest）、liveInputSha256；必填身份缺失 → 违规（不得空对象/缺 candidate 跳过）。
- **DoD**：真实 CLI→计算器负例（分别破坏产品/主输入/媒体/live 绑定）必须非 0；root 正例仍过；不靠 helper 单测替代。

### A13-02 — 同时间戳降级
- **落点**：`web/desktop-recv/src/ux-telemetry.js`、`ux-view.js`、`ux-display.js`（EMPTY_OBSERVATION）；契约同步 `module-contract-error-matrix.md`（带日期修订注记）。
- **修复**：观察 `progress.lastReportState`（最近 data/artifact 帧 report 状态；ambiguity 锁定时仍记录）；视图降级 = `∈{empty,unavailable}`，删除 `lastDataAtMs > trustedAtMs` 推断；不伪造时间/不加 epsilon/不收紧契约为严格递增。
- **DoD**：真实模型→视图组合：相同 receivedAtMs 的 empty/unavailable 隐藏百分比；历史支持 `.7 恢复` 与 `.5 回退锁`；普通递增路径不回归；内部表达调整显式同步设计文档。

### B-R1 — 复算验收语义与原始 RTT
- **落点**：`measure-ux-calc.mjs`（judgeRound）；`verify-ux-evidence.py`（外层验收）；`tests/ux-evidence-selftest.py`、`tests/measure-ux.test.mjs`。
- **修复(a)**：外层门禁要求每份 measurement 重算 `verdict==='PASS'` 且 `validPairs===5`、live `verdict==='PASS'`/10 侧 VALID/`sampleInsufficient===false`；计算器保留 ok=计算成功语义。
- **修复(b)**：judgeRound 每 ok 帧 `rtt = settledAtMs − t0Ms`：有限/有序校验、重算值用于 p50/p95、与冗余 `rttMs` 严格相等（不等 E_RTT_MISMATCH）。
- **DoD**：负例——一致 FAIL、一致 NOT_RUN、原始起止与 RTT 矛盾（rttMs=0/起止不变）、settled<t0——真实 CLI 与验证函数链路均拒绝；正例不回归；保留中间失败原件，不以改写 summary 为 PASS 当修复。

### S1/S2
- S1：新总结/round-14 包把"09b/root10 零改动"改为"旧原始证据未改（结果/proof/媒体）；09b reproduction.md 仅命令修正（e55c3b3）"。
- S2：所有新增负例落真实入口（subprocess 调 CLI / 真实 validate_ux_record），保留明确反例，不以测试总数增长替代关闭。

## 批次

1. B-R13-1 产品 TDD（A13-02）。
2. B-R13-2 工具 TDD（A13-01 + B-R1，真实入口 RED 先行）。
3. B-R13-3 新根 `docs/tests/runs/20261027-teamexec-12` 全量复验（新 manifest；旧根只读）。
4. B-R13-4 收口：回填/runtime-map/r13 台账关闭/总结第 8 节/round-14 包 → 出口确认门（用户）→ 送审。

## 纪律

- 冻结方法/阈值/cases 步文本不动；E2E-35/37/现场 7 项按用户既有决定 NOT_RUN；旧证据只读；lead 独占提交；绝不 push。

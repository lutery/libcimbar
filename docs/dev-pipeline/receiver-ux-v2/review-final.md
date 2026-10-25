# T32 最终候选全量内部审查（review-final）

全局轮号 20 · review-final 第 1 次

## 范围

- 审查对象：receiver-ux-v2 最终候选 = HEAD `df808d7` 完整迭代（基线 `9e4fbc4` → HEAD）。
  - 产品：`web/desktop-recv`（3 个新模块 `ux-telemetry.js`/`ux-view.js`/`ux-display.js`，worker/client/session/app/ui/index/styles/README/package 1.1.0）。
  - 工具：`tools/desktop-recv/{e2e/*,tests/*,stage.ps1,run-unit.mjs}`。
  - 证据根：`docs/tests/runs/20261024-teamexec-04..20261025-teamexec-09b`。
  - 审查文档：`review-tools/slice/metrics/media-save/ui-perf.md`。
- 方式：只读代码 + 独立实跑；未参与任何实现。全部命令在仓库根、PowerShell 执行。
- 候选产品字节核验：`git diff --stat c0d566f..HEAD -- web/desktop-recv` 为**空**；09b `run-context.json` 的 `sourceRevision=c0d566f`、`productManifestSha256=9e2595e6…`，即 09b 证据绑定的产品字节与 HEAD 一致（HEAD 之上为纯文档提交）。**该候选尚未经 T34/T35/T36，本轮只审已有证据的真实性与缺口。**

## 结论

**Blocking 1 项**（详见 Blocking 1：UX-UI/measure 记录写出不符合 `verify-ux-evidence.py` 冻结契约，最终门禁无法通过；属交付工具/证据格式硬约束违反，须在 T35 之前修复）。T34/T35/T36 的待执行项不计 Blocking，但列于「T34/T35 必须补齐清单」。

除该 Blocking 外，AC-015～024 的已完成部分证据真实；E2E-28/29 未执行、E2E-37 与 E2E-35-S02 的 NOT_RUN 均如实留档、未被掩盖。

## 独立复核记录

### A. 规格与需求覆盖（AC-015～024）

| AC | 已有真实证据（可指） | 判定 |
|---|---|---|
| AC-015 | E2E-27 S01/S01b/S02（按钮存在、save 早禁、waiting_data+5s 提示）；E2E-35 S01（前台空白源 revision 固定、elapsed 递增、5s 提示） | 覆盖 |
| AC-016 | 单测 UX-UT-017～024；IAT-01/03（run 07，PASS，但版本落后，见 D）；真实流 E2E-27 S03（41.7 KiB/s 含冗余）、E2E-31（三时点速率/估计） | 覆盖（多流/回退为 IAT+unit 面） |
| AC-017 | 单测 UX-UT-025/026/027、ux-view T14；真实 E2E-27 S03、E2E-31 A2/A3 | **部分**：12 桶/预热/含冗余单位有证据；「无数据归零」真实旅程=E2E-29 **未执行**（仅单测） |
| AC-018 | E2E-27 S02（5s）、E2E-35 S01/S03/**S04-stop**（后台返回重算、停止冻结）；慢帧 1500ms=IAT-02+UX-UT-043；阈值毫秒级=ux-view T14 | 覆盖 |
| AC-019 | E2E-30 A3/A5（owner 重置）、E2E-31 A2/A3（录像位置与估计分列）、E2E-32 A1/A2（EOF Incomplete 无产物不可保存） | 覆盖 |
| AC-020 | E2E-27 S05/S06（真实保存+外部 SHA）、E2E-33（取消→Retryable→重存四时点）、E2E-34（锁失败→释放→恢复） | 覆盖 |
| AC-021 | E2E-30（双向 owner 切换）、E2E-36（键盘全链、取消后焦点回 btn-save）、E2E-35-S04-stop | 覆盖 |
| AC-022 | 中文主路径/键盘/真实浏览器=E2E-27/35/36 PASS；**辅助技术（真实读屏语音）=E2E-37 NOT_RUN** | **部分**：AT 腿未验证，DOM/aria 不替代（计划口径）；无文档宣称 AC-022 全过 |
| AC-023 | E2E-38 录制 A/B PASS（3 冻结阈值、5 对、okFrameCount 99～111≥30）+ 实时 5×30s 腿 PASS（AB/BA 交替、10/10 侧别 VALID）；阈值方法与 `performance-method.json` SHA 一致 | 覆盖测量面；**旧预算/单在途回归=E2E-1～20 待 T35** |
| AC-024 | 本地真实抓屏（E2E-27）、录像（30～32）、保存/外部 SHA 全覆盖；v1 隔离=契约检查 PASS+旧 run 零改动 | 本地覆盖；**现场（E2E-21～26、E2E-39）NOT_RUN，按 field 门禁分列，如实** |

结论：10 条 AC 每条至少有一条真实旅程/实测可指；未覆盖处为 AC-017 的「归零」旅程腿、AC-022 的 AT 腿、AC-023 的旧回归腿，均已在 planning/ux-results 保持 NOT_RUN，未伪装完成。

### B. R-01～12 映射完整性（`runtime-case-map.json` 实读）

- R-01～R-09：`status=UNIT_VERIFIED`，testBindings 逐条指向真实单测（抽查 UX-UT-008/017/019/024/025/043/047/051 及 session 用例名均在对应套件中命中），R-01～R-08 另有 UX-IAT 绑定。**但 caseBindings 全空、manifestSha256/attemptId/proofRefs 全为 null**——E2E 面尚未绑定（设计上由 T34/T35 回填）。
- R-09：仅 unit 面（save/session/ux-telemetry），**缺 IAT 面**（IAT-06 保存链注入未列入）；E2E-30～34 已真实走过保存事件链但未绑定。
- R-10：`NOT_RUN`，仅 IAT-03/04/06 绑定，**无 unit 绑定**；E2E-35-S01 是直接的「revision 固定、时钟前进」真实证据却未绑定。
- R-11：`NOT_RUN`，仅 IAT-04；4Hz 节流的真实证据已存在（E2E-38 录制 `minTelemetryGapMs≥250.1`、live 腿 candidate armed/节流判据）但未绑定。
- R-12：`NOT_RUN`，仅 IAT-07；真实抓屏/录像/保存恢复与外部 SHA 证据（E2E-27/30～36）均已存在但未绑定；现场腿按计划属 T35/T36。
- `productAcceptance`/`fieldStatus` 均为 `NOT_RUN`。
- 对照计划 L1284-1297：R-06→T35、R-09→T34、R-10→T31、R-11→T31、R-12→T35/T36 的责任关系一致；当前空缺属 T34/T35 承接范围，不是缺责任任务。**结论：映射骨架完整、状态如实；缺的是最终绑定动作（T34/T35），且 R-09/R-10/R-11 的 IAT/E2E 面需补。**

### C. 真实结果完整性（已有证据是否真实 + 哪些仍缺）

| run | 产品 manifest | 记录 | 判定 |
|---|---|---|---|
| 06（slice） | `adb59205…` | E2E-27 PASS（attempt `…c3b7f5`，11 断言，原/收 SHA `8f89c58f…` 相等） | 真实；notes 自标 PARTIAL，绑旧产品字节 |
| 08（media） | `8fad37c8…` | E2E-30～34 全 PASS（同 attempt，21 断言；EOF/Incomplete/取消/锁/SHA） | 真实；自标 PARTIAL |
| 09 | — | E2E-35/36 PASS、37 NOT_RUN、38 NOT_RUN（录制 attempt-1 工具失败后保留） | 已被 09b 取代，原件保留 |
| 09b（final candidate） | `9e2595e6…`（=c0d566f=HEAD 产品字节） | E2E-35 PASS（S02 NOT_RUN 如实）、E2E-36 PASS（8 断言，含焦点修复实测）、E2E-37 NOT_RUN、E2E-38 PASS（录制+实时双出口） | 真实；自标「T31 evidence」 |

- E2E-38 数值独立复核：`comparison.json` 3 阈值公式与 limit 齐全（18627.7 / 71.94 / 108.445），5 对全部 valid，候选侧 `telemetryArmed=true` 且最小写间隔≥250ms，基线侧不适用如实；`live/summary.json` 5 对 AB/BA、`sidesValid A=5 B=5`、verdict PASS。ux-results 摘要字段里的 `thresholds:null/rounds:null` 只是摘要占位，原始证明文件齐备，**不构成造假**。
- **E2E-28/29 全迭代从未执行**：`gates.local.uxRequired` 与 `groups["UX-ALL"]` 均包含它们；planning-cases 中 `executionTaskIds=[T19,T35]`，T19 实际只交付 UX-IAT 01～07，真实旅程留待 T35。**E2E-27 S02/S03 只覆盖「无码等待」与「首批数据」，不能替代 E2E-28（重复有效码 10s 不虚增进度/不假 Ready）与 E2E-29（无数据→速率归零→恢复）**——这是明确缺口，但已如实保持 NOT_RUN，未宣称覆盖。
- planning-cases 的 `e2eScenarios` 中 E2E-27～38 的 status/result 仍全部 `NOT_RUN`（最终状态由 T35/T36 落定），与「尚未跑全矩阵」一致，未提前改写。
- 结论：已有记录真实、无造假迹象；仍缺 = E2E-28/29、最终候选上下文的 E2E-27/30～34 复跑（06/08 绑旧产品字节，按门禁「产品字节变更后拒绝」不可直接充当最终证据）、旧 E2E-1～20 全矩阵与 results.json、UX-IAT 最终版。

### D. 过程完整性

- `tdd-ledger.json`（7 条：T1 red×2、T2 green×2、T3 green、T5 red+green）+ `tdd-ledger-b2.json`（3 条：T6 red/green、T7 red）结构合法，RED 均带真实失败原因与日志引用。**台账只覆盖 T1～T7**；B3 以后批次 RED/GREEN 记录在 `red-logs/`（如 b2-t9/b6-t14/b7-t20/b8-t26 的 red 日志）与各任务报告、exec-log 中；计划文本未强制全任务入台账，不判违规（见 S5）。
- `exec-log.md` 连续覆盖 T1→T31c，含起止时间、报告、日志、复跑数字与提交号；T31b/T31c 收口记录与 HEAD 提交一致。
- 5 份审查文档闭合：slice=PASS 0 Blocking（3 项复核 CLOSED）；tools=2 Blocking→均 CLOSED（S2～S8/S10 CLOSED）；metrics=PASS 0；media-save=PASS 0；ui-perf=Blocking 2→B1/B2「已整改」并附 RED 9 fail→GREEN 45/45 复验，但**缺一行显式「CLOSED/Blocking=0」收口**（见 S1）。
- 旧 run 零改动：`git diff --stat 9e4fbc4..HEAD -- docs/tests/runs/2026101* docs/tests/runs/20261021*` 为**空**；各批 `*-oldruns-after.sha`（t3/t5/t6/t13/t19/t25/t31/t31c）记录 UNCHANGED。
- 失败 attempt 留档抽查：t13 attempt-1/2/3 三份日志（clip 缺陷、ready 等待误用、Get-FileHash 环境）在；t19-attempt2、t25-attempt1、t31 attempt-1（E2E-38 录制 E_TELEMETRY_NOT_ARMED×5，run 09 NOT_RUN 原件保留）、t31c attempt-03（addInitScript 晚于页面加载）均在。无删除/覆盖失败证据的迹象。

### E. 未通过项未被掩盖

- E2E-37 NOT_RUN 理由（原文）：「Narrator binary=present; actual speech output cannot be verified programmatically in this agent session - NOT_RUN per the plan (DOM/aria checks are not a substitute)」。理由充分且与计划口径一致；`verify-ux-evidence` 自测证明缺少 E2E-37 会使 local gate 失败，故该 NOT_RUN 会真实阻断门禁，不会被总绿掩盖。
- E2E-35-S02 NOT_RUN：harness 以 `CalculateNativeWinOcclusion/backgrounding disabled` 启动接收端，最小化时 `visibilityState` 仍为 visible；记录中写明 heldMs/elapsed 与「recorded honestly instead of being faked」。属 harness 能力边界，分支留档清晰，可接受。
- 独立复核（本轮实跑）：`python tools/desktop-recv/verify-ux-evidence.py --context docs/tests/runs/20261025-teamexec-09b/run-context.json --gate local` → **exit 1**。失败分两类：
  1. **预期内**：缺 E2E-28/29、E2E-37 非 PASS、无 legacy `results.json`（T35 未跑）。
  2. **非预期（Blocking 1）**：E2E-35/36/38 的 assertion `proofRef` 为 attempt 相对路径（`screens/…`、`measurements/…`），被判「outside the claimed attempt directory / not found on disk」；E2E-38 记录级 `proofRefs=[]`（terminal PASS 至少需一条）；E2E-37 的 NOT_RUN 记录带 `executedBy/startedAt/finishedAt`（校验器要求 NOT_RUN 三者必须为 null）。证明文件实际存在于 `proof/E2E-36/<attempt>/screens/`，是**记录写法**不符合冻结契约，不是证据缺失。
- 09b ux-results 自标「phase=final candidate T31 evidence」，未宣称已通过本地门禁；未发现把 NOT_RUN 改写为 PASS 或删除失败轮的迹象。

### F. 必跑命令（本轮实跑，全部为独立执行）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | 0 | 12 套全绿，合计 **202** tests（contracts 7/session 40/scheduler 6/worker 14/client 15/save 8/video 17/ui 13/evidence 36/ux-telemetry 22/ux-view 17/ux-display 7），0 fail/0 todo/0 skipped |
| `node --test tools/desktop-recv/tests/{run-context,process-guard,measure-ux}.test.mjs` | 0 | **61** tests pass，0 fail/cancelled/skipped/todo |
| `python tools/desktop-recv/tests/ux-evidence-selftest.py` | 0 | **SELFTEST PASS (55 cases)**（后台管道首跑输出为空，前台复跑确认） |
| `python tools/desktop-recv/verify-evidence-selftest.py` | 0 | **SELFTEST PASS (14 cases)** |
| `python tools/desktop-recv/e2e/video-prefix-check.py --selftest` | 0 | **SELFTEST PASS (3/3)**（正例、头移负例、尾截负例） |
| `python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py` | 0 | DESIGN_CONTRACT_SHAPES_PASS（definitions 20/examples 27/shapeVectors 44/interfaces 6/diagnostics 15/acTracked 10；v1Isolation 通过；implementationCases 12 NOT_RUN） |
| `git diff --stat 9e4fbc4..HEAD -- web/desktop-recv` | 0 | 22 文件，**+5591/-75**（ux-telemetry 419/ux-view 427/ux-display 218；测试约 +3800） |
| `git diff --stat 9e4fbc4..HEAD -- docs/tests/runs/2026101* docs/tests/runs/20261021*` | 0 | **空**（旧 run/旧 schema 零改动） |
| 补充：`git diff --stat c0d566f..HEAD -- web/desktop-recv` | 0 | **空**（最终候选产品字节与 HEAD 一致） |
| 补充：`verify-ux-evidence.py --context 09b/run-context.json --gate local` | 1 | 见 E 节（预期缺口 + Blocking 1） |

## Blocking issues

### Blocking 1：UX-UI/measure 证据记录不符合 `verify-ux-evidence.py` 冻结契约，最终本地门禁无法通过

- 证据：本轮对 09b 实跑 `verify-ux-evidence.py --gate local`（exit 1）报出的三类**非缺口型**错误：
  1. `E2E-35/36/38` 的 assertion `proofRef` 写成 attempt 相对路径（`screens/s36-*.png`、`measurements/ux-overhead/candidate-20261025-04/*.json`），校验器按 run 根解析并要求位于 `proof/<caseId>/<attemptId>/` 内 → 全部被判 outside/not found。对比：slice/media 记录（E2E-27/30～34）用的是 `proof/E2E-27/<attempt>/screens/…` 全路径，可通过。
  2. `E2E-38` 记录级 `proofRefs=[]`，而 terminal PASS 记录至少需要一条 proof；测量产物实际落在 `measurements/` 而非 `proof/E2E-38/<attempt>/`。
  3. `E2E-37` NOT_RUN 记录带 `executedBy="executor"` 及非空起止时间；校验器明确要求 NOT_RUN 三者必须为 null。
- 根因定位：`tools/desktop-recv/e2e/ui-journeys.mjs` 的 assertion 写入只存短路径（L38 `proofRef: proof || null`），记录级 proofRefs 虽为全路径（L51/55），但测量类 E2E-38 无 original/received 可推；`measure-ux/live-legs` 产物目录也未纳入 `proof/<caseId>/<attemptId>/`。`verify-ux-evidence.py` 是冻结的验收契约（自测 55 例锁定），不能为迁就记录而放宽。
- 影响：T35 用同一 harness 跑 `UX-ALL` 后，本地门禁仍会因这三类格式错误失败（与 E2E-28/29、E2E-37 的真实缺口叠加）。这是交付工具的契约违反，不是待执行项，故计 Blocking。
- 最小修复范围：ui-journeys/run-e2e 写出 assertion `proofRef` 与记录级 proofRefs 时统一为 run 根相对且位于 `proof/<caseId>/<attemptId>/`；E2E-38 测量摘要/对比文件纳入该 proof 目录（或复制引用）；NOT_RUN 记录不写 executor/时间。修复后按配方 R 重跑受影响 UX-UI/测量腿并更新 attempt 原件。

## T34/T35 必须补齐清单（不属 Blocking，但缺一不可）

1. **修复 Blocking 1** 后，T34/T35 才能得到可通过的最终记录。
2. **T35 执行 E2E-28、E2E-29**：`gates.local.uxRequired` 与 `UX-ALL` 均必测；现为零执行记录。E2E-27 S02/S03 不能替代（前者=无码等待/首批数据；后者=重复码不虚增+恢复、无数据归零+恢复）。
3. **T35 在最终候选上下文重跑 E2E-27～38 全组**：06/08 记录绑旧产品 manifest（adb59205/8fad37c8），按门禁规则不能充当最终证据；09b 仅覆盖 35～38。同时跑 E2E-1～20 全矩阵并产出 `results.json`（legacy gate 当前因缺文件失败）。
4. **E2E-37**：按 T35 Step 1「或按计划人工步骤留证」执行真实 Narrator 语音核验并留证；否则保持 NOT_RUN 并接受本地门禁不通过（理由已充分，但不能作为最终绿）。
5. **T34 重跑 UX-IAT（含 IAT-08）**：现 IAT 证据在 run 07、revision `c34e99e`/manifest `48aa2be8`，落后最终候选两个产品提交；measure-ux 已交付，IAT-08 应可执行。
6. **T34 回填 `runtime-case-map.json`**：R-01～12 的 testBindings/caseBindings/manifestSha256/attemptId/proofRefs 与 R-10/R-11/R-12 状态；R-09 补 IAT 面，R-10/R-11/R-12 补 unit/E2E 面（E2E-35-S01、E2E-38 已具备真实证据）。
7. **T34 Step 1**：把 `ux-telemetry/ux-view/ux-display` 加入 stage 的 candidate 必需文件清单（当前 `stage.ps1` grep 无这三个模块名；09b 产物清单已含它们，属清单显式化未做）。
8. **T36**：更新 planning-cases `e2eScenarios` 最终状态、双门禁复算、stage5-dev-summary 与送审索引；现场 E2E-21～26/E2E-39 保持 NOT_RUN 分列。

## Suggestions

- **S1**：`review-ui-perf.md` 的 B1/B2 已有「已整改」与 45/45 复验，但缺一行显式「CLOSED / Blocking=0」收口（其余 4 份均有），建议 T36 前补一行说明（内容证据已齐）。
- **S2**：`runtime-case-map.json` 的 R-09 未绑定 IAT-06（保存链注入），R-10/R-11 缺 unit/E2E 面；建议 T34 回填时按证据面补全，避免只填 IAT 造成误导。
- **S3**：建议在 planning-cases 的 E2E-27 条目旁注明「不含 28/29 的重复码与归零腿」，防止后续误用 27 的 S02/S03 宣称覆盖 28/29。
- **S4**：`tdd-ledger*.json` 只覆盖 T1～T7；若阶段 6 外审按台账抽查，建议 stage5-dev-summary 注明台账范围与 B3+ 的 RED/GREEN 索引位置（报告+red-logs），避免被误读为缺失。
- **S5**：ux-results 摘要字段（`thresholds:null/rounds:null`）易被误读为测量未绑定阈值；建议写摘要时直接引用 comparison 的关键字段（阈值/有效对数），减少复核成本。
- **S6**：本机后台管道运行 `ux-evidence-selftest.py` 时 stdout 为空（缓冲所致），前台复跑 55 例 PASS；仅记录备查，交付文档中的复现命令建议注明「前台执行」。

## 审查者

review-v2-final（独立审查代理，未参与任何实现）。审查时间：2026-10-25。所有结论基于本报告所列命令输出、源码/证据文件实读与独立实跑；未执行 git 写命令，未改动产品或旧 run。

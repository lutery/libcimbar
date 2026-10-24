# 全局轮号 17 · review-metrics 第 1 次

## 范围

审查对象（分支 receiver-ux-v2，HEAD 78f17ae，审查时工作树 clean）：

| 提交 | 主题 | 本审查涉及内容 |
|---|---|---|
| 0069e0d | test: pin window math, thresholds and save/clock bounds | T14 测试任务：S2（save 归一/幂等/终态不回写/新 attempt 仅 selecting 四类模型用例）、S4（同毫秒双帧/倒退拒绝）补课 + 视图速率窗口边界、四阈值 ±0.1ms 参数表、T14-R05 唯一真 RED |
| f60f93e | feat: project unavailable progress from degraded report reads | T15 实现：R-05 转绿（kind='unavailable'、ratio/asOfMs null、最新降级码）+ formatRate 微小速率边界直接断言（51/102.4/0/null/warming/frozen） |
| 78f17ae | test: bind R-01..08 to unit cases and verify real report IAT | T16 测试任务：真实交付包 WASM 经 VM 桥接进 worker-vm harness，只 stub scan，真实 fountain+report IAT 一路真实读出 [0.030303]→[0.0606061]，R-01..08 绑定 unit 用例（status=UNIT_VERIFIED） |

规范依据：docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md（T14/T15/T16 节 + 配方 C，\\r\nL1141-1187 窗口数学与独立算例）、docs/design-catalog/receiver-ux-v2/contracts/{ux-display-config.json,\\r\nux-telemetry.schema.json, ux-diagnostics.json, validation-vectors.json}、module-contract-error-matrix.md、docs/tests/receiver-ux-v2/test-cases.md。

只读约束遵守：审查者未参与实现；未改任何产品/测试代码，未执行 git 写命令，旧 run/product 目录只读。独立复核全部经 `node --input-type=module -e`（1 个内存脚本、零仓库写入）完成。本报告是本轮唯一写入的仓库文件。

## 结论

**PASS — Blocking 0。**

A-G 七项逐条复核（详见下）：窗口数学 34 项独立算例全部与实现及测试断言一致；歧义锁不可逆与重复不虚增、save 归一矩阵全量、时钟边界、T16 边界诚实声明、必跑命令（--all 12 套 171、probe exit 0）均实测通过；上轮 S2/S3/S4 补课质量达标，T15「最大编号」语义经复核可接受（五码同文案、已登记偏差）。未发现违反计划/配方/契约硬约束的实现，未发现测试造假。

发现 4 条 Suggestions，无 Blocking。

## 独立复核记录

### A. 窗口数学（配方 C L1157-1159）——独立硬编码算例对照

方法：审查者自建 `node --input-type=module -e` 探针（不落盘），期望值全部由审查者从冻结配方手算为独立硬编码常量（未调用实现函数推导），1 次运行对照真实模块与测试断言，exit 0，**34/34 PASS**。关键对照（配方 L1159 规范例逐项）：

| 算例（独立手算） | 期望（硬编码） | 实测 | 测试断言（字面量） |
|---|---|---|ux-view 测试 |
| epoch=0，1024B@250 → q=1 占桶 1 | 桶1={gen 1, 1024B} | 实现一致 | UX-UT-026 |
| t=1000：q=4、low=0、窗 1000ms | 1024 B/s | ✓ | UX-1024 → UX-UT-026（1024） |
| t=2999.9：q=11、low=0、窗  broken 2999.9ms | 100000/2999.9 | ✓ | view T14（100000/2999.9） |
| t=3000：q=12、low=1、窗 2750、保留桶 1 | 480/11（=120000/2750） | ✓ | view T14（480/11） |
| t=3250：q=13、low=2、桶 1 淘汰 | 90000/2750（=90B/2750ms） | ✓ | view T14（90000/2750） |
| T14 视图 fixture（gens 0/1/11=30/30/40）@1000 | 60 B/s | ✓ | view T14（60） |
| 999.9 → warming、1000 → active | phase 翻转 | ✓ | UX-UT-026 + view T14 |

- generation/q 语义：写侧 `q=floor((atMs-epoch)/250)`、槽 `q%12`、`generation=q`、同桶累加（ux-telemetry.js:262-284）；读侧只求和 `generation∈[max(0,q-11), q]`（ux-view.js:120-126）——与配方 C 公式逐符号一致。
- 分子纯度：`_applyRate` 仅在 outcome∈{data, artifact} 分支调用（ux-telemetry.js:222-226），no_data/error 字节永不能进分子（UX-UT-028）。
- **溢出 19010 清窗重锚、不重置接收事实**：MAX_SAFE+1 → 12 槽清零 + diagnostics 记 19010 + epoch 重锚至溢出时点重新预热；receivingAt/trustedRatio/lastData/revision 均保留（P5 全 PASS；UX-UT-029 布局 A/B；配方 L1157「不能重置接收用时/报告事实」✓）。
- **3 秒归零**：UX-UT-027 分支 A（249.9→3000ms 归零）/B（250→3250ms 归零）+ P2 zero@3250 实测 ✓。
- 断言强度：ux-view 测试期望直接用字面量（60、100000/2999.9、480/11、90000/2750）；ux-telemetry 测试用 `expectedRate` 助手——它是测试内第二实现（从原始桶状态重新推导公式，非从实现函数抓值）。配合本审查的独立手算（上表），公式三方一致（配方/测试/审查），判定达标。
- 有界性（T17 Step 1 要求）：模型固定 12 槽 + 标量 + Set；无每帧对象历史；diagnostics Set 仅可容纳 19005/19006/19010 与 5 个降级码 ≤ 9 种 ≤ 配置上限 15（ux-display-config.json maxDiagnosticCodes）。readView 纯函数，无无限循环面。

### B. 歧义锁与不可逆性（T15）

逐行核对 ux-telemetry.js:230-260（_applyReport）、ux-view.js:151-177（projectProgress）：

- **19005/19006 锁至新 seq 不可逆**：锁定后所有后续 single/multiple 先 early-return（ux-telemetry.js:231-236）；唯一出口是 `begin` 新 seq 全量重置（L163 `_ambiguity = null`）。UX-UT-021 证明：锁定后 single 0.9 不解锁、速率仍计 1875B、新 seq 才恢复。
- **重复不虚增**：重复/旧 frameId → 19007 且快照冻结（UX-UT-019）；等值比例只刷 trustedAtMs 不推进 lastAdvance（UX-UT-022 控制组；T14-S4）；同 save 事件 ack(false) 且 revision 不动（T14-S2 幂等例）；重复 finish key → ack(false)（UX-UT-033）。
- **enough_data**：`trusted>=1` 在 COMPLETION_STATES 判断之后才进入（ux-view.js:143→170），ratio=null、asOfMs=trustedAtMs、statusKey=collecting_more、canSave false——**不 Ready、不救 Ready**（P4 enough_data 实测 + UX-UT-047）。
- **R-05 unavailable 不混歧义码**：`REPORT_DEGRADATION_CODES` 显式 = {19001,19002,19003,19004,19015}；19005/19006 由更前方的 ambiguous 分支拦住（P4「ambiguity never unavailable」实测）；歧义码也永不进入 unavailable 形状。反向隔离同样成立：unavailable 分支要求 diagnostics 里 19005/19006 不会以 ambiguity=null 冒充。
- schema 一致性：Progress.unavailable 允许 {0, 19001..19004, 19008, 19013, 19015}（schema L1289-1313）；实现 emits 是 schema 允许集的子集（19008/19013 是身份/版本拒绝码，不作报告降级）——与 b6-t15-report 说明一致。
- 边界补充（审查者实测）：data 流动但报告恒为 empty 状态 → unavailable 且 diagnosticCode=0（schema 允许 0）✓；多降级码并存时取集合内最大（P4 实测 19002+19004→19004）。

### C. save 归一矩阵（S2 补课；配方 E L1195）

real 模型实跑（P3, 12 断言 PASS）+ T14-S2 4 用例：

| 输入→输出 | 实测 |
|---|C. save 归一矩阵（S2 补课；配方 E L1195）real 模型实跑（P3, 12 断言 PASS）+ T14-S2 4 用例： |
| failed/cancelled+16002 → cancelled（码 16002 保留） | ✓ |
| writing+16008 → writing（码 16008 保留；重入型写仍在写） | ✓ |
| pending → pending | ✓ |
| write 16005 / close 16006 失败 → failed | ✓ |
| saved 强制 null 码；saved+码 → 19008 拒 | ✓ |
| 幂等（同事件 ack(false)、revision 不动） | ✓ |
| 终态不回写（saved→writing → 19007） | ✓ |
| 新 attempt 仅 selecting（a2 以 writing/pending/saved 直起 → 19007；selecting 接管） | |✓ |
| 旧/新 seq、异 id → 19007/19008 | ✓ |

- 发现（Suggestion 3）：同 attempt 终态→另一终态（如 saved→failed、cancelled→saved）当前不被拒（guard ux-telemetry.js:333 只拦 terminal→active 组合）。配方 E 矨阵未约定该窗口，接线层（T20-T22，未接线）单 attempt 单结算使其现实中不可达；按配方 E 矧阵未约定 → 不判 Blocking。建议 T20/T22 接线层按事件源判别。
- 19007/19008 stale owner 面完整（P3 a2 + T14-S2 last case）。

### D. 时钟边界（S4）

- 同毫秒双帧：at=250 两帧均接受（等值 receivedAtMs 恰好等于 lastResultAtMs，`<` 判断不拒绝）、字节同桶累加（625B，T14-S4 case 1 + P2 逻辑一致）、等值比例不推进 lastAdvance ✓。
- 倒退拒绝不计数：at=299 after 300 → 19009，快照冻结（revision/bytes/lastData 零变化），400 恢复继续（T14-S4 case 2）。实现上校验全在前（ux-telemetry.js:176-217），mutation 后置——无部分应用。
- readView 侧时钟守卫：nowMs < receivingAtMs / lastResultAtMs / endedAtMs → 19009（ux-view.js:276-283），UX-UT-042 年 `now before receiving` 19009 ✓。
- S4 原文残留：review-slice.md L190 的 S4 原文含「receivedAt/submittedAt 交错」，T14 未落专门用例；submittedAt 真实来源面由 client UX-UT-008 支撑，view 时钟守卫也有。lead 本轮 S4 检查项（同毫秒/倒退）均已覆盖，残余归入 Suggestion 4。

### E. T16 边界诚实性

- worker.test.mjs:615-617 注释 + b6-t16-report.md L43 均明示：只 stub `_cimbard_scan_extract_decode`（img 需真实 cimbar 图），fountain/report 为真实 IAT；**不证明真实抓屏/图像扫描，仅 prove IAT 测试边界诚实性**

- worker.test.mjs:615-617 注释 + b6-t16-report.md L3 (L43) 均明示：只 stub `_cimb.WriteAll`_cimbard_scan_extract_decode`（img 需真实 cimbar imagery），fountain/report 真实 IAT；**不证明真实抓屏/图像扫描，仅证明 IAT 入口与 read_report 路径的真实字节行为**。测试内 30s timeout、12s WASM init timeout。
- 探针（本审查者本人复跑）：`node docs/requirements/receiver-ux-v2/probes/report-capability.cjs` → **EXIT=0**；可见输出尾部含 next=[0.0本审查者补充核对输出尾部（chunkSize 625 行在尾部前段被 Select-Object 截断，未逐行全览）

- 探针（本人复跑 exit 0）：输出尾段含 next=[0.0606061]、mixed=[0.030303,0.0606061]、duplicateDoesNotAdvance=true、freshBlockAdvances=true、multipleStreamsHaveNoIdsInReport=true、exercised="synthetic fountain packets directly into shipped WASM"、notExercised=[screen capture, new UI, field E2E, notExercised=[screen capture, new UI, field E2E, file completion]、repositoryWritesByProbe=0——主动边界声明诚实 ✓。
- runtime-case-map：R-01..08 status=UNIT_VERIFIED + testBindings(phase:'unit') + caseBindings=[] + manifestSha256/attemptId/proofRefs=null + productAcceptance/fieldStatus=NOT_RUN + R-09..R-12 仍 NOT_RUN——UNIT_VERIFIED 只声称单元面，IAT/E2E 卟面留给 T9/T34/T35（偏差 2 明示），无越权声称。

### F. 必跑命令（审查者本人运行，非转录）

| 命令 | exit | 关键行 |
|---|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | **0** | 12 套 171 tests / 0 fail（ux-telemetry 22、ux-view 13、worker 14）——与 b6-t16 报告声称一致 |
| `node docs/requirements/receiver-ux-v2/probes/report-capability.cjs` | **0** | 尾段：next/mixed 比例、duplicateDoesNotAdvance/freshBlockAdvances/multipleStreamsHaveNoIds、notExercised 显式四项、repositoryWritesByProbe=0 |
| 独立 `node -e` 探针 | 0 | 34/34 PASS（A/B/C/P4/P5） |

断言强度抽查（按 lead 清单）：速率 3 例（100000/2999.9、480/11、90000/2750）测试用字面量断言 + 本审查独立手算同值；save 归一 1 例（failed+16002→cancelled 码保留）P3 实跑复现；R05 1 例（T14-R05 19002）P4 verbatim 复现。

### G. 上轮遗留复核

**S2/S3/S4 补课落地质量（T14）**

- S2：4 用例覆盖配方 E 归一矩阵全部 raw shapes + idempotence + terminal guard + new-attempt rules + stale owners——质量达标，直接固化既有行为（T8/T12 时代实现），非测试造假。
- S3：test-cases.md 034 Target/骨架 1 行对齐 ux-view（diff 核对，附 b2-t7-report 偏差 1 引注）✓。
- S4：同毫秒双帧 + 倒退拒绝两例落地；原文「receivedAt/submittedAt 交错」未专门落例 → Suggestion 4。

**T15「最新降级码=集合内最大编号」语义（b6-t15-report 偏差 1，挂 T17 复核）**

可接受，不改判 Blocking。理由：
1. ux-diagnostics.json 中五码（19001/19002/19003/19004/19015）message 全部为「进度暂不可用」，用户可见信息在任意选择下完全相同；
2. ViewSnapshot.diagnosticCodes 仍携带全集（升序），上位消费若有需要仍可区分；
3. 单 seq 内混码概率低：19001/19015 由构建/装配决定（seq 内恒定），19002/19003/19004 数据依赖；即便混码，短语级提示无差异；
4. 时序化需模型字段级变更（Progress 观测内部加 lastDegradationCode/AtMs），SnapshotProgress schema 需新增字段，成本大于用户可见收益；
5. 已在 b6-t15-report 偏差 1 登记 + 显式挂 T17 复核，属「已登记偏差」，按 lead 判定标准不构成阻断。
结论：维持现状可接受；若 T27 文案矩阵需要区分具体降级原因（五码同文案），才需要时序化或先到先停的规则变更。

### Blocking issues

无。

## Suggestions

1. **同 attempt 终态→终态迁移未被拒**（ux-telemetry.js:333 guard 只拦 terminal→active）：`saved→failed`、`cancelled→saved` 等组合当前更新 save 视图。手法上配方 E 矧阵未约定该窗口且单 attempt 单结算使现实中不可达，非 Blocking；建议 T20/T22 接线层（真实 SaveController 事件源）按事件源判别，或后续窄化模型 guard。
2. **T15 max-code 语义**：维持现状可接受（见 G 项结论）；若 T27 文الت 文案矩阵需区分五码，届时再做模型时序化变更（Schema 变更需配方 R 流程）。
3. **S4 原文残余（receivedAt/submittedAt 交错）**：lead 本轮 S4 范围（同毫秒/倒退）均已覆盖；交错面无专门用例，建议随 T19/T31（两时钟相遇的接线阶段）补例，不必回填 T14。
4. **readView 对 observation 内部形状的信任边界**：rate.buckets/diagnostics 长度未对照固定 12/15 校验（模型产出的快照恒有界；手工构造的 observation 可超长——纯函数只遍历不存储，无增长风险）。建议 T19 接线时或 schema 校验层防越界遍历（低优先级）。

## 审查者

review-v2-metrics（T17 独立于实现车道 dev-v2-prod 车道上提交 0069e0d/f60f93e/78f17ae 的实现者），2026-10-25。

# Round-13 产品侧整改报告（A13-02，阶段 5 整改轮 2）

> 任务来源：`docs/dev-pipeline/ext-review/round-13-verdict.md` 的 **A13-02**；`docs/dev-pipeline/receiver-ux-v2/r13-remediation.md`。
> 范围：仅产品侧 A13-02。工具侧 A13-01 / B-R1 由 r13-tools 负责，不在本报告。

## 1. 改动清单

| 文件 | 改动 |
|---|---|
| `web/desktop-recv/src/ux-telemetry.js` | 构造器与 `begin` 新增 `_lastReportState = null`（新 seq 重置）；`acceptFrame` 对 data/artifact 帧记录 `request.report.state`（写在 `_applyReport` 的 ambiguity 锁门之外，锁定期同样更新）；`snapshot().progress` 新增 `lastReportState`。trusted 历史、19006 回退锁、revision/时间校验、速率域均未动。 |
| `web/desktop-recv/src/ux-view.js` | `reportDegraded(progress)` 改为 `progress.lastReportState === 'empty' || === 'unavailable'`；删除 `lastDataAtMs > trustedAtMs` 推断（无回退）；`statusKeyFor` 沿用同一函数，同源生效。完成态与歧义分支优先级不变。 |
| `web/desktop-recv/src/ux-display.js` | `EMPTY_OBSERVATION.progress` 补 `lastReportState: null`。 |
| `web/desktop-recv/tests/unit/ux-telemetry.test.mjs` | 追加 5 条 R13-A13-02-1..5（真实模型 → readView 组合，仅控制输入帧与投影时钟）。 |
| `web/desktop-recv/tests/unit/ux-view.test.mjs` | 追加 1 条 R13-A13-02-V（手写 observation 夹具显式给 `lastReportState`，覆盖旧推断的漏报与误报两个方向）；`observationFixture` 基线 progress 补 `lastReportState: null`。 |
| `docs/design-catalog/receiver-ux-v2/module-contract-error-matrix.md` | UX-03 段（:103 附近）追加 2026-10-27 修订注记；UX-04 进度段（:148 附近）追加一行判据指回。 |

说明：任务书提到 `toObservation` 导出；本仓库当前不存在该函数（全仓 grep 无命中），观察的唯一导出载体是 `ReceiverTelemetry.snapshot()`，`lastReportState` 随 `progress` 一同导出，未凭空新增 API。

## 2. RED 证据（修复前）

命令：

`node --test web/desktop-recv/tests/unit/ux-telemetry.test.mjs web/desktop-recv/tests/unit/ux-view.test.mjs`

结果：exit 1，51 tests / 45 pass / 6 fail。6 条失败恰为新增用例（R13-A13-02-1..5、R13-A13-02-V），既有 45 例保持通过。

真实失败消息（TAP 摘要）：

- R13-A13-02-1：`expected: 'empty'`（strictEqual，`snap.progress.lastReportState` 为 undefined）；
- R13-A13-02-2：`expected: 'unavailable'`；
- R13-A13-02-3：`expected: 'unavailable'`，`actual: 'estimate'`（同时间戳 empty 之后视图仍返回 estimate）；
- R13-A13-02-4：`expected: 'single'`（事实字段缺失）；
- R13-A13-02-5：`expected: ~`（null 基线等）；
- R13-A13-02-V：`expected: 'unavailable'`，`actual: 'estimate'`。

完整 TAP：`docs/dev-pipeline/receiver-ux-v2/red-logs/r13-a13-02/red-1-before-fix.tap`。

## 3. GREEN 证据（修复后）

- 同两文件：exit 0，51 / 51（`red-logs/r13-a13-02/green-1-after-fix.tap`）。
- `node tools/desktop-recv/run-unit.mjs --all`：exit 0，12 套 **222 例**（既有 216 + 新增 6），0 failed / 0 todo / 0 skipped；其中 ux-telemetry 27、ux-view 24、ux-display 15（`red-logs/r13-a13-02/green-3-final-units.txt`）。
- `python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py`：exit 0（20 定义 / 27 样例 / 44 形状向量 / 6 接口 / 15 诊断；输出中的 implementationCases 12 NOT_RUN、productAcceptance NOT_RUN 为原有声明，非本轮新增）。

## 4. 行为语义（DoD 对照）

- 相同 receivedAtMs：`single .6@1000 → empty@1000`（frameId 不同，两次 acceptFrame 均 ok/applied），视图 `kind='unavailable'`、`ratio=null`、`asOfMs=null`、`stale=false`，`formatProgress` 为「进度暂不可用」，primary/secondary 不含 "60" 或 "%"，`statusKey='progress_unavailable'`。
- `single .6@1000 → unavailable(19004)@1000`：同上，且 `progress.diagnosticCode=19004`、`diagnosticCodes=[19004]`。
- 恢复：`empty@1000 → single .7@1000` 返回 `estimate/.7/asOf=1000`，`statusKey='receiving'`，`lastReportState='single'`。
- 回退锁：`empty@1000 → single .5@1000` 仍锁 19006，视图 `ambiguous`、「进度无法判定」、`statusKey='progress_unknown'`。
- ambiguity 锁定期间 `lastReportState` 继续更新（empty、unavailable 均记录），19004 与 19006 同时入诊断集；`no_data`/`error` 帧不改变该事实（只有 data/artifact 帧携带 report 观测）；新 seq 重置为 null。
- 既有递增时间用例（R12-A-R1-1..6、UX-UT-023、T14-S4 等同时间双帧受理用例）全部保留通过；未改测试名称、未删既有测试。

## 5. 契约修订理由

旧 `lastDataAtMs > trustedAtMs` 是「最后一次报告的 report.state 为 empty/unavailable」的时间代理，只在两个时点严格不等时成立。冻结契约 :113 只禁止「早于」，允许不同 frameId 使用相同 receivedAtMs（T14-S4 用例本身即证明该输入合法）。修复把代理换成事件事实 `lastReportState`：不伪造时间、不加 epsilon、不收紧契约为严格递增，也不改 v1 协议与原 frame 结果。修订注记按任务要求以 2026-10-27 落于 UX-03 段，明确「相同 receivedAtMs 的不同帧为 empty/unavailable 必须隐藏当次百分比」，并保留历史 .7 恢复与 .5 回退锁；UX-04 进度段只加判据指回，未改状态优先级与 ViewSnapshot 字段表。

## 6. 影响面

- 生产模块：仅 `ux-telemetry.js` / `ux-view.js` / `ux-display.js` 三个 receiver-ux-v2 内部模块；v1 协议、原 `web/main.js`、发送路径与 C++ 均未动。
- 观察快照 progress 新增一个内部字段（UX-03/UX-04 内部契约，不是 v1 Snapshot）。
- 缺少 `lastReportState` 的旧观察不再按时间巧合降级（由 R13-A13-02-V 第 4 段固定该语义）；真实模型路径总会写该字段，手工夹具基线已显式补 null。
- `ux-display.test.mjs` 未改：没有测试直接引用 `EMPTY_OBSERVATION`，15 例全绿。

## 7. 诚实遗留

- 未执行浏览器 / E2E / 现场云桌面验证：本轮仅为产品单元与契约形状检查；现场 7 项与 E2E-35/37 按既有用户决定仍 NOT_RUN。
- 显示层无新增独立用例：`ux-display` 只透传 `view.progress` 的文本（`formatProgress`），等价时间戳语义已由模型 → 视图组合用例覆盖；如需显示层独立证据，可在下一复验轮补。
- 任务书提到的 `toObservation` 导出在本仓库不存在，未新增该 API；若设计意图是新增显式导出函数，需设计侧确认后另立任务。
- 新增用例只驱动 `ReceiverTelemetry` + `readView` 组合与手写 observation 夹具，未启动 worker / 浏览器解码链。


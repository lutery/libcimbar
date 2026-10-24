# B2 产品车道 T10 完成报告（dev-v2-prod）

日期：2026-10-24　基线 HEAD：2650d0c（T9 提交后）
任务：切片集成与显式套件注册。未执行任何 git 写命令。

## 改动文件

- `tools/desktop-recv/run-unit.mjs`：ALL_SUITES 显式注册 ux-telemetry/ux-view/ux-display（9→12），注释同步；其余逻辑零改动
- `web/desktop-recv/tests/unit/session.test.mjs`：新增 T10 集成用例（双入口重复注入，真实 ReceiverTelemetry）
- 日志：`docs/dev-pipeline/receiver-ux-v2/red-logs/b2-t10-run-unit-all.txt`

## --all 实测（12 套，退出码 0）

| 套件 | tests | fail/todo/skip |
|---|---|---|
| contracts | 7 | 0/0/0 |
| session | 32 | 0/0/0 |
| scheduler | 6 | 0/0/0 |
| worker | 13 | 0/0/0 |
| client | 15 | 0/0/0 |
| save | 7 | 0/0/0 |
| video | 15 | 0/0/0 |
| ui | 7 | 0/0/0 |
| evidence | 36 | 0/0/0 |
| ux-telemetry | 16 | 0/0/0 |
| ux-view | 9 | 0/0/0 |
| ux-display | 5 | 0/0/0 |
| **合计** | **168** | **0/0/0** |

实际总数 168（旧 137 用例全部保持通过；session 31→32 为新增集成用例，无删除无放松）。

## 拒绝路径自证（OS 临时目录，非共享目录）

方法：把 run-unit.mjs 复制到 `$env:TEMP\b2t10-runner-check\tools\desktop-recv\`，在 `$env:TEMP\b2t10-runner-check\web\desktop-recv\tests\unit\` 构造靶文件（副本的 REPO 解析到临时根），验证后整个临时目录已删除。

| 用例 | 构造 | 结果 | exit |
|---|---|---|---|
| 缺套件文件 | `--all` 且 unit 目录为空 | `missing suites (required by --all): contracts, …, ux-display`（12 个全列出） | 3 |
| 含 skip | worker.test.mjs 含 `test.skip('skipped case', …)` | `worker: contains test.skip`，UNIT SUITE FAILURE | 1 |
| 崩溃套件 | worker.test.mjs 首行 `throw new Error('boom')` | node --test 非零 → `worker: FAILED` | 1 |
| 零用例（可加载文件） | 仅 `const placeholder = 1;` 及空文件 | **未被拒绝**：node --test 把文件本身计为 1 个测试（`# tests 1`） | 0 |

零用例形态的如实说明：run-unit.mjs 代码内确有 `tests === 0 → 拒绝` 护栏，但在 node 22 的 --test 语义下，"可加载且未注册任何 test() 的文件"恒计 1（文件即测试），该护栏对可加载文件不可达；本车道按 lead 修正稿未改 runner 逻辑，仅注册三套。护栏保留，建议 T11 审查关注该形态是否需要 runner 侧补强（例如解析 TAP 子测试计数而非文件计数）。

## 切片集成断言（session.test.mjs 新增 T10 用例）

- 实时入口（scheduler.onResult 路径）：offerFrame+deliver 后真实 ReceiverTelemetry 记 625B 一次；随后经同一入口人工重复注入同一 frame-result 两次（`_onFrameResult(seq, 同一结果)`）→ observationRevision 不变、桶字节仍 625（按 frameId 拒绝 UX 计数，业务无感）。
- 录像入口（submitAndWait await 路径）：submitVideoFrame 的 await 结果计 625B 一次；人工重复注入同一结果 → revision/字节不变；`stats.submitted===1` 证明调度器未双发。
- Draining→Incomplete 与 startVideo 的 cleanup 门在用例内自然覆盖。
- 高频 snapshot+tick 交错下专用区节流而原按钮即时：由 UX-UT-049 承载（本任务起随 ux-display 注册进入 --all，B 轨迹断言 125ms 业务即画、A 轨迹 [0,1000) 遥测写入恰 4 次）。

## 验证命令（实测）

| 命令 | exit |
|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | 0（12 套 168 例） |
| `node --check tools/desktop-recv/run-unit.mjs` | 0 |
| `node --check web/desktop-recv/tests/unit/session.test.mjs` | 0 |
| `git diff --check` | 0 |

## 偏差与注意（给 lead）

1. **"0 用例"负例未达预期拒绝**（上节如实记录）：属 node --test 文件级计数语义，不是本任务引入；未按修正稿越权改 runner 逻辑。
2. 集成用例使用 `_onFrameResult` 做人工重复注入——这是计划明文的人工注入方式（"人工重复同帧按frameId拒绝UX计数"），非白盒新依赖；真实通道层不可能双投递（client 承诺一次结算）。
3. ux-display 套件进入 --all 后，其浏览器级限制（fake timer/DOM 适配器，非真实页面）不变，报告边界同 T9。

## DoD 对照（plan T10）

- 三套显式注册：ALL_SUITES 12 项，`--all` 全跑。
- runner 拒绝负例：缺文件/skip/崩溃均非 0；零用例形态如实记录为不可达护栏。
- 人工双入口重复注入只计一次：session T10 用例（真实模型）。
- `--all` 12 套 0 fail/todo/skip，总数以实际为准（168，未硬填）。
- 提交边界（lead 决定）：run-unit.mjs + session.test.mjs + red-logs/b2-t10-run-unit-all.txt；建议 commit message `test: register and integrate UX observation suites`。

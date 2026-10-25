# T29 审查报告：最终 UI 与性能测量方法

全局轮号 19 · review-ui-perf 第 1 次

## 范围

只读审查 HEAD `e084f2c`（`receiver-ux-v2`）上的三个提交：`7b1e4aa`（T26 测试）、
`d747fae`（T28 measure-ux）、`e084f2c`（T27 中文主界面）。对象为
`web/desktop-recv/{index.html,styles.css,src/app.js,src/ui.js,src/ux-view.js,src/ux-display.js,package.json,README.md}`、
`tools/desktop-recv/e2e/measure-ux.mjs`、`tools/desktop-recv/tests/measure-ux.test.mjs`、
`web/desktop-recv/tests/unit/{ui,ux-display}.test.mjs`。规范依据：实施计划 T26/T27/T28 节
（L825-887）与配方 D（L1163-1186）、F（L1197-1216）、G；`ui-spec.md`；
`performance-method.json`（冻结）；`contracts/ux-display-config.json`。
审查者未参与实现，未执行任何 git 写命令，未修改产品/工具代码。

## 结论

**Blocking 2**。UI 结构、中文主文案、可访问性、依赖与隐私面未发现阻断；测量器的
冻结绑定、分位数/中位数口径、阈值复算、无效样本落盘总体正确。两项阻断均在
`measure-ux.mjs` 的采集驱动/观测器运行时行为：一项会把候选功能失败误报为校验失败并
丢失全部原始证据（违反冻结 `invalidRunPolicy`/`failurePolicy`），一项使基线侧承受候选侧
没有的 25ms 轮询开销（配方 F 的 A/B 公平性）。其余为 Suggestions，其中进度文案在
0.995≤ratio<1 时会显示「约 100%」、`no_new_data` 缺少下一步建议两项建议在 T31 前处理。

## 独立复核记录

### A. 真实 UI 与已确认设计

读取了 `index.html`、`styles.css`、`src/{app,ui,ux-view,ux-display}.js`、`package.json`、
`README.md`，并与 `ui-spec.md` 全文、原型 `prototype/{index.html,prototype.js}` 对照。

- **18 态覆盖**：原型 18 态均映射到 `ux-view.js` 的 statusKey：
  idle→`idle`、preparing→`preparing`、waiting→`waiting_data`、receiving→`receiving`/
  `receiving_video`、repeated→`no_progress`、quiet→`no_new_data`、unknown→`progress_unknown`、
  unavailable→`progress_unavailable`、enough→`collecting_more`、video→`receiving_video`、
  draining→`draining`、ready→`ready`、saving→`saving_selecting`、cancelled→`save_cancelled`、
  failed→`save_failed`、saved→`saved`、incomplete→`incomplete`、stopped→`stopped`。
  另有 processing/reconstructing/saving_writing/saving_pending/stopping/error 六个细化键，
  合计 24 个主文案、24 条 secondary（`ux-view.js:25-79`）。18/18 态均有主文案与原因行；
  primary/secondary 文案与 ui-spec 矩阵语义一致（如 collecting_more「继续补齐重建数据」、
  progress_unavailable「进度暂不可用」、ready「文件已接收完成，请保存」）。
- **nextAction**：waiting_data（≥5000ms）、ready、saved、stopped、incomplete、
  save_cancelled、save_failed，以及 receiving/no_progress/progress_unknown/collecting_more
  有建议（`ux-view.js:332-350`）。`no_new_data` 与 `progress_unavailable` 为空；
  原型 quiet/unavailable 两态分别有「检查发送画面是否被遮挡…」和「可以继续接收…」的
  建议文案。属 Suggestions S2，不阻断（主文案+原因行已能理解状态，ui-spec 矩阵行未强制
  每态必须有下一步）。
- **双入口/id/激活路径**：`btn-live`/`btn-video`/`btn-stop`/`btn-save`/`file-input`/
  `preview`/`artifact` id 全部保留（`index.html:19-24,40-47`）；点击接线未变
  （`app.js:541-549`）；按钮中文。`#status` 仍由 `el.status.textContent = controls.statusText`
  写英文（`app.js:225`），与 T26 钉 `ui.test.mjs:203` 一致。
- **层级/aria-live**：main 顺序为 controls→legacy status→ux-feedback（primary/secondary/
  progress/metrics/save）→artifact→ux-next→preview→details(log)→ux-announcement
  （`index.html:17-55`），与要求的主状态→估计→指标→保存→产物→下一步→preview→诊断折叠
  一致；唯一 `aria-live="polite"` 是 `#ux-announcement`（`index.html:54`），`#log` 在
  `<details>` 内且无 live（`:49-52`）；数字区不设 live（`styles.css` 无 aria 相关）。
- **无未批准功能/上传/新依赖**：`index.html` 仅一个外链脚本 `src/app.js`（`:57`），无内联
  脚本、无外部 URL；产品源码无 `sendBeacon`/XHR，`fetch` 只取本地 config/asset
  （`app.js:502`、`worker/decoder-worker.js:32-52`）；`package.json` 无依赖、版本 1.1.0；
  `measure-ux.mjs` 使用 `playwright-core`，该依赖已存在于既有 E2E 探针
  （`baseline-preflight.mjs:11`、`probe-*.mjs`），非新增。产品 `src/*.js` 无
  `innerHTML/outerHTML/insertAdjacentHTML`（grep 0 命中），UI 写入均 textContent
  （`app.js:121-134,225-239`）。
- **日志不是唯一入口**：主状态/原因/下一步均在中文字段；诊断日志默认折叠。特定错误码的
  中文恢复文案目前只写入折叠的 `#log`（`app.js:180-183`），Error 态主文案只有
  「接收发生错误/请重新开始接收」；见 S4。

### B. 可访问性与响应式

- `lang="zh-CN"`（`index.html:2`）；按钮 `min-height: 44px`（`styles.css:65`）；
  `button/summary/input:focus-visible` 2px accent 轮廓（`:73-78`）；`@media (max-width:760px)`
  按钮两列/指标紧凑、`380px` 指标单列/按钮通栏（`:182-192`）；`body` 全局
  `overflow-wrap:break-word`/`word-break:break-word`（`:19-20`），ux/artifact 区
  `min-width:0` + `overflow-wrap:anywhere`（`:94-103,132-144`），长文件名可换行。
- `#preview` 在 `<details>` 之外（`index.html:47-52`）；CSS 全文无 `display:none`
  （T26 断言 `ui.test.mjs:247` 通过）；活动 video 分支强制 `preview.hidden=false`
  （`app.js:316-319`），live 活动期同理（`:241-249`）。
- `#ux-announcement` 用 clip 视觉隐藏且是唯一 polite 区；`#log` 不在 live 区。
- `#status` legacy 探针用 `.legacy-status` clip 隐藏（`styles.css:80-92`），不占布局、
  不改 textContent；见 F①。

### C. 测量方法实现公正性（配方 F）

逐项独立比对 `performance-method.json` 原文与 `measure-ux.mjs` 的冻结常量
（`validateMethod`，L161-224；`THRESHOLD_DEFAULTS`，L64-80）：

| method 字段 | 原文 | 工具绑定 |
|---|---|---|
| frozen/version/kind/methodStatus/iterationId | true/1/frozen_method_only/DESIGN_FROZEN/receiver-ux-v2 | 全部逐项拒绝（L172-181） |
| pairedRuns / order / warmupPerBuild | 5 / AB,BA,AB,BA,AB / 1 | 全部逐项（L182-187） |
| matchedEnvironment | 10 字段：wasmSha256…instrumentationSha256 | deepEqual 精确顺序（L188-189） |
| primaryInput | minSettledFrames 30、payloadBytes 131072、incompressible、mode B | 逐项（L190-196） |
| hardInvariants.telemetryMinWriteIntervalMs | 250 | 逐项（L197-199） |
| liveObservation.pairs/order | 5 / AB,BA,AB,BA,AB | 逐项（L200-202） |
| mandatoryMetrics | readyMs、frameRttP50Ms、frameRttP95Ms | 名称+顺序精确（L204-206） |
| 阈值 | 1.10+250；max(1.10,+2)；max(1.15,+5)，含 formula 文本 | 数值+公式文本全等，改动即 `E_METHOD_THRESHOLD`（L207-217） |

- **分位数/中位数**：`nearestRankPercentile` 排序后 rank=ceil(p/100*n)（L110-118）；
  `median` 偶数取中间两值均值（L122-128）；`sideSummary` 先取每轮 p50/p95，再对各侧有效轮
  取中位数（L447-470），不跨轮混池。阈值 `metricResult` 独立复算 limit/margin
  （L472-493），`evaluateThresholds` 保留数值与公式文本（L497-506）。
- **无效样本**：`judgeRound` 用 `...record` 保留全部原始字段（L326-342）；`buildOutputFiles`
  为每轮写 `rounds/*.json`，`invalid-rounds.json` 只存 `file` 指针与原因（L727-740）；
  预热轮保留但排除（`pairRounds` L387-392）；配对缺失/重复/环境不符/样本不足均整对
  不可判定（L397-437）。
- **观测器同一性**：`OBSERVER_SCRIPT` 单份常量，`INSTRUMENTATION_SHA256=sha256(script)`
  （L644），每轮 env 记录并参与配对（L1094-1105）。`addInitScript` 两侧同一脚本
  （L1052）。包装 `DecoderClient.prototype.submitFrame`（产品为类方法，
  `decoder-client.js:97`），`original.apply(this,args)` 后 **return promise**，旁路
  `Promise.resolve(promise).then(onOk,onErr)` 不改结算（L587-607）；同步抛错时记录后原样
  重抛（L592-595）。`maxConcurrentFrames` 用原始区间扫描，等时刻结算先处理（L234-249）。
- **DOM 计数**：一个 MutationObserver 观察 `span.ux-metric`（elapsed/rate/media），
  一次绘制一个事件（L621-633）；不把按钮/终态变化计入。**未观察 `#ux-progress`**（数字区
  之一），见 S5。
- **阻断项**：`armTelemetry` 在找不到 `span.ux-metric` 时每 25ms 轮询、持续 30s
  （L634-639）。基线 A 是旧 UI，天然没有这些 span；候选 B 在 DOM 解析后约 25ms 即
  armed。两侧脚本字节相同，但**运行时开销不同**：基线在测量窗口前 30s 承受候选没有的
  轮询；且 `runRound` 只回传 `telemetryWrites`/`wrappedAtMs`（L1082-1108），不回传
  `telemetryArmed`，`judgeRound` 把无写入当作 `telemetryJudged=false`（L304-317）。
  这既造成候选向偏置，也让「候选页没有数字区」静默通过 4Hz 不变式。详见 Blocking B2。
- **无删除慢样本/无事后调参入口**：`rttSamples` 收集全部 ok 帧，无 trim/排序后截断；
  `parseCliArgs`（L1237-1257）只接受 context/baseline-context/method/repo-root/
  validate-only，无阈值覆盖参数；`validateMethod` 拒绝编辑后的方法。方法 SHA 写入
  `run.json`、`summary.json`、`comparison.json`、`manifest.json` 与 validate 计划
  （L686-766、L952-976），在进程内从原始轮复算阈值，不读取历史结果文件的 PASS。

### D. 阈值 SHA 预锁定与 --validate-only

- 工具在启动时读取 method 字节并计算 SHA（`validateMethod` L218-223），写入每个输出
  与 `planFor`（L970）；阈值不从结果文件读取，而是由内嵌冻结常量 + 原始样本复算
  （L497-506、L512-546）。改 method 的任一裁决字段会被拒绝，不存在「只信结果文件
  PASS」的路径。
- `--validate-only` 走 `loadAndValidate`（L886-949），该函数只读文件、不写；CLI 打印
  `planFor` 后 exit 0（L1274-1276）。T28-09e 用仓库树指纹证明零写入
  （`measure-ux.test.mjs:948-966`），实测 38/38 通过。
- `performance-method.json` 的 `primaryInput.sha256` 仍为 null；真实冻结 SHA 在 T6
  输入清单中（`docs/tests/runs/20261024-teamexec-04/input-manifest.json`：
  primary `8f89c58fc9a16feefa31ce6c8e6146d6003f1b749fcd88ffd5e97ca9fc61f146`，
  131072 字节；media `72a69af0589133d5e266a4f16265ff8ea2a4f288a42b5441e4b20356fac08916`），
  工具会重哈希并与两侧 context 交叉校验（L811-867、L911-929）。建议在报告中明确
  「锚点在输入清单」；见 S9。

### E. 必跑命令与断言强度

| 命令 | 退出码 | 关键输出 |
|---|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | 0 | 12 套，197 tests，0 failed/todo/skipped（7+40+6+14+15+8+17+11+36+22+14+7=197） |
| `node --test tools/desktop-recv/tests/measure-ux.test.mjs` | 0 | 38 tests，38 pass，0 fail |
| `node tools/desktop-recv/e2e/measure-ux.mjs --help` | 0 | 打印三项必需参数、`--validate-only`、退出码语义 |
| `git diff --check` | 0 | 无输出 |

- 抽查 `T28-03b`：对 frozen=false、改 relativeFactor/absoluteAllowanceMs/formula、
  删指标、改 order/pairedRuns/warmup/minSettledFrames/matchedEnvironment/telemetry 间隔
  逐项断言 `E_METHOD_*`，断言强度足够（`measure-ux.test.mjs:270-334`）。
- 抽查 `T28-09e`：treeDigest 前后相等 + plan 的 pairs/order/warmup/methodSha/inputSha/
  mediaSha/instrumentationSha/outputDir 全部断言，强度足够（`:948-966`）。
- 抽查 `T26` 中文文案：入口用例用正则断言 `btn-live`/`btn-video` 含中文且 id 不变
  （`ui.test.mjs:186-194`）；digit-free 用例只走 7 个状态（Idle→Preparing→Receiving→
  Ready→Saving→Saved→Retryable→Stopped 中的 7 步），而 T27 报告称「18 语义键四字段
  无数字」（`ux-display.test.mjs:474-536`）。源码文案表人工检查确无 ASCII 数字，
  但测试覆盖小于报告声明，见 S7。
- 抽查 `T28-06b`：注释自认「pooled 也会得到 50」，该用例不能区分混池与逐轮中位数
  （`measure-ux.test.mjs:674-691`）；实现本身逐轮取值（`summarizeSides`），见 S6。

### F. 特别复核

**① T27 偏差 1（`#status` 英文 clip 隐藏）**：不破坏 T26 钉/旧探针。T26 钉只要求
`el.status.textContent = controls.statusText` 保留（`ui.test.mjs:203`），代码未变。
旧探针均读 textContent，不读可见性：`run-e2e.mjs:200,1037,1375`、
`baseline-preflight.mjs:192`、`probe-manual.mjs:64`；clip 隐藏不改 textContent，且
CSS 无 `display:none`。唯一新风险是无障碍树仍暴露英文状态（未 `aria-hidden`），
T31 屏幕阅读器验收可能读到重复英文；见 S3。

**② T27 偏差 2（README 历史脚注移除）**：未丢失必要历史。被移除的 2026-10-21 路径
更正仍完整保存在 `docs/dev-pipeline/autonomous-decisions.md` D-13（第 19 行）、
`docs/dev-pipeline/tech-debt.md` TD-17（第 23 行）；证据目录
`docs/tests/runs/20261019-teamexec-02/proof/E2E-1/` 实际存在；新 README 保留了更正后的
结论（路径含中文/空格可用），且不再重复已被推翻的旧归因。可接受，无需恢复脚注。

**③ measure-ux drive 未实跑的风险点**：T31 首跑可能暴露——(a) `chromium.launch({
channel:'msedge', headless:false })`/`playwright-core` 在目标机的可用性；(b) 基线旧 UI
没有 `span.ux-metric`，触发 B2 的轮询偏置且遥测不变式不被判定；(c) 候选从未到达
`journey.readyAt` 时 `waitForFunction(..., 300000)` 超时，整轮抛出，见 Blocking B1；
(d) `import('/src/decoder-client.js')` 的加载时序/路径（静态服务器根为 receiver 目录，
路径正确）；(e) `#file-input` 隐藏时 `setInputFiles` 可用，但 `#btn-video` 启用时序依赖
capabilities/asset 加载；(f) 实时 5×30s 腿不在本工具内（见 S8）；(g) `journey.receivingAt/
readyAt` 在基线构建中是否存在。**不改冻结判据的防线成立**：阈值/顺序/样本下限内嵌，
`validateMethod` 拒绝任何编辑，CLI 无阈值覆盖入口；T31 只能按 29→30 流程改工具/证据，
不能改判据追绿。

## Blocking issues

### B1. drive 的失败路径把候选功能失败误报为校验失败，并丢失全部原始证据

- 证据：`runRound` 在 `page.waitForFunction(() => window.__journey.readyAt !== undefined,
  { timeout: 300000 })` 超时时抛出（`measure-ux.mjs:1065-1068`）；`runAbDrive` 不捕获
  单轮异常（`:1138-1145`）；CLI 统一 `catch` 后 `process.exit(3)`（`:1281-1284`），
  `writeMeasurements`（`:1191`）永远不会执行。`E_OBSERVER_MISSING`、Playwright 启动/
  页面异常同样走这条路。结果：候选未产出 artifact（业务失败）时，T31 得到 exit 3
  （文档定义为「validation failure」），且 `rounds/`、`invalid-rounds.json`、
  `comparison.json` 全部不存在；已采集的页内帧与遥测无法保存。
- 违反：冻结 `performance-method.json` 的 `invalidRunPolicy`（「任一未完成/数据缺失均
  不可判定。保留原始轮次，重跑整对并记录原因」）与 `failurePolicy`（「候选有效轮次业务
  失败、产物错误或违反不变式为 FAIL，不能当噪声剔除」）。T31 Step 4 也要求
  「环境不可用或样本不足保持 NOT_RUN，不能用旧性能 NOT_EVALUATED 豁免本轮」。
- 整改（T30）：在 `runAbDrive` 内逐轮 try/catch，把异常转成带 `collectionError` 的
  round record（能在 `finally` 中取到 `window.__uxObserver` 时一并保留原始帧/遥测）；
  `judgeRound`/`pairRounds` 将该轮标为 invalid/不可判定，仍调用 `buildOutputFiles`/
  `writeMeasurements` 落盘；候选真实功能失败按 failurePolicy 判 FAIL，工具/环境失败判
  NOT_RUN；exit 3 只保留给运行前校验。新增一个「stub runRound 抛错仍写出
  rounds/invalid-rounds」的测试。不得为此改任何阈值或样本下限。

### B2. 基线侧遥测 arm 的 25ms 轮询造成 A/B 观测器运行时开销不等

- 证据：`OBSERVER_SCRIPT.armTelemetry` 在 `document.querySelectorAll('span.ux-metric')`
  为空时启动 `setInterval(..., 25)`，直到 30s 后才清除（`measure-ux.mjs:621-639`）。
  基线 A 是旧 UI（配方 G：A 不要求新增 UX 投影），没有这些 span；候选 B 的 span 在
  静态 HTML 中，DOM 解析后约 25ms 即 armed 并清除。两侧 `instrumentationSha256` 相同，
  但基线在测量窗口前 30s 持续执行候选没有的查询/定时器回调；这是配方 F 要求
  「两构建同样观测」之外的运行时差异，且偏置方向有利于候选（基线被拖慢）。
- 另外，`runRound` 回传的 observer 字段不含 `telemetryArmed`（`:1082-1108`）；
  `judgeRound` 以 `telemetryGapMs.length > 0` 作为是否判定的条件（`:312-317`）。
  因此基线（设计上无数字区）静默不判遥测间隔；候选若因构建错误没有 `span.ux-metric`，
  也会静默通过 4Hz 不变式，而不是被标为无效/FAIL。
- 整改（T30）：去掉重复轮询，改为一次性的 `DOMContentLoaded` 检查或对
  `document.documentElement` 的 `MutationObserver`（无持续定时器）；每轮回传并记录
  `telemetryArmed`；对候选侧显式要求 armed（未 armed 记为 invalid/FAIL），对基线侧
  按设计记录「不适用」而不是「无写入即通过」。新增「无 span 页面不留下 pending timer」
  的测试。不得改冻结阈值。

## Suggestions

- **S1（建议 T31 前修）**：`formatProgress` 对 `estimate` 用 `Math.round(ratio*100)`
  （`ux-view.js:397-407`），0.995≤ratio<1 会显示「重建估计约 100%」，而 artifact 尚未
  出现；ui-spec/原型要求「上次比例加时间语义」「不显示文件100%」。同时 `progress.stale`
  已计算但未用于文案（应显示「上次重建估计约 N%」）。建议 floor/一位小数 + stale 标记，
  并补 `formatProgress` 单测。
- **S2**：`no_new_data`、`progress_unavailable` 的 `nextAction` 为空
  （`ux-view.js:332-350`）；原型 quiet/unavailable 两态有明确下一步（检查遮挡/继续接收）。
  T27 报告「nextAction 全状态」与实现不符。建议补齐或在 T30 报告中更正声明。
- **S3**：`#status` legacy 探针用 clip 隐藏但未 `aria-hidden="true"`
  （`styles.css:80-92`、`index.html:26`），屏幕阅读器浏览模式会读到英文状态。建议加
  `aria-hidden="true"`（textContent 探针不受影响），并在 T31 真实辅助技术验收中确认。
- **S4**：`#caps` 能力横幅仍为英文（`app.js:511-514`），artifact 大小单位仍为
  `bytes`（`:235`）；正常 localhost 流程不出现横幅，但中文 UI 的能力/降级提示应补齐。
  特定错误码的 `recoveryTextZh` 只写入折叠日志（`:180-183`），Error/能力失败时主区
  只有通用文案；建议把恢复建议提升到 `ux-secondary`/`ux-next` 或可见提示。
- **S5**：观测器只观察 `span.ux-metric`，未观察 `#ux-progress`（数字遥测区之一）。
  当前 `ux-display` 的共享 250ms 门使这不会造成现实假绿，但配方 F 要求「遥测数字区」；
  建议把 `#ux-progress` 纳入 MutationObserver，或明确记录排除理由。
- **S6**：`T28-06b` 的混池反例不具区分力（注释自认 pooled 也会得到 50）；建议用不同
  帧数/不同分布的轮次使 pooled 与逐轮中位数不同。`T28-07c` 只做字符串检查，未执行
  wrapper；T31 实跑会覆盖，建议在 T30 加一个 VM/jsdom 执行用例证明 promise 身份与结算。
- **S7**：T26 digit-free 用例只走 7 个状态，T27 报告称「18 语义键四字段无数字」；
  建议扩展到 24 个 statusKey（或至少 18 态）或更正报告。源码文案表人工检查无 ASCII
  数字，当前无实际违规。
- **S8**：实时 5×30s 腿未在 `measure-ux.mjs` 实现（T28 报告已声明）；T28 Step 3 的
  「及实时固定窗口」未由本工具满足。T31 必须用 run-e2e/人工证据覆盖
  single-flight/反馈/节流/停止释放，或如实记 NOT_RUN；不能以录像腿代替。
- **S9**：`performance-method.json` 的 `primaryInput.sha256` 为 null，冻结输入 SHA 的
  实际锚点在 T6 输入清单（见 D）。建议在 T30/T31 文档中明确该锚点，或按「新版本+理由」
  填充 method 字段（不得静默改冻结文件）。
- **S10**：桌面宽度下原型 `aside.guide`（右侧下一步）被实现为单列、始终在产物下方
  （`styles.css:50-55`、`index.html:45`）；ui-spec 只描述 ≤760px 移到下方。T31 视觉
  验收前请与 lead 确认这是否为批准的布局简化。另 `app.js` 无显式保存后焦点回归
  （T24 登记项），T31 需按真实系统对话框行为验收。
- **S11**：`judgeRound` 以 30 个 **ok** 帧为门槛，而 method 写的是 30 个**已结算**帧；
  更严格本身安全，但建议在工具输出/README 说明，避免把 `settledFrameCount` 与
  `okFrameCount` 混淆。

## 审查者

review-v2-ui-perf（独立审查，未参与 T26/T27/T28 实现）

# B8 / T28 — 开发验收专用 A/B 观测器（measure-ux）

日期：2026-10-25 · 分支 receiver-ux-v2 · 基于 HEAD dcbc131
状态：**实现与单测完成（38/38 GREEN）；真实 A/B 采集未运行（按计划属 T31）**

## 变更文件

- 新增 `tools/desktop-recv/e2e/measure-ux.mjs`（CLI + 校验链 + 判定核心 + 页内观测器 + A/B drive 代码）
- 新增 `tools/desktop-recv/tests/measure-ux.test.mjs`（node --test，38 个用例；不在 ALL_SUITES，独立运行）
- 更新 `tools/desktop-recv/e2e/README.md`（新增 "UX overhead A/B observer (T28, dev-only)" 一节）

未触碰产品代码（web/desktop-recv）、tools/e2e 其他文件与 git 历史；与 T26 的
`web/desktop-recv/tests/unit/{ux-display,ui}.test.mjs` 零重叠。

## 方法冻结的落实（配方 F / performance-method.json）

- 工具内嵌冻结常量（5 对、AB/BA/AB/BA/AB、每构建 1 轮预热、minSettledFrames=30、
  telemetryMinWriteIntervalMs=250、matchedEnvironment 十字段、三条阈值公式与公式文本），
  并在 `validateMethod` 中逐项绑定：`frozen!==true`、顺序/对数/预热/样本下限/环境字段、
  任一 candidateMax 数值或公式文本被改动 → 拒绝（E_METHOD_NOT_FROZEN / E_METHOD_FIELD /
  E_METHOD_THRESHOLD）。方法 SHA-256 记录进每个输出文件。
- 判定口径：readyMs = journey.readyAt − receivingAt（页面 Date 时钟，同域差值）；
  帧 RTT = 主线程 submitFrame 调用→原 Promise 结算（同一 performance.now 域），
  不声称 WASM 纯解码 CPU 时间；每轮 nearest-rank p50/p95，各侧取 5 轮值的中位数，
  绝不混池。
- 校验顺序：参数(2) → **method** → 两个 context（loadRunContext + assertDistinctContexts）
  → 双侧 verifyProductManifest（磁盘重哈希）→ 双侧 input 绑定（inputManifest 重哈希、
  128KiB 主输入与录像文件逐 SHA 复核、跨侧一致性、与 method 声明一致性）→ 输出目录
  防覆盖。method 先于 context 校验，坏方法不会被坏 context 掩盖。

## 实现要点

- **页内观测器（两构建完全相同，instrumentationSha256 记录并比对）**：document-start
  注入，动态 `import('/src/decoder-client.js')` 后包装 `DecoderClient.prototype.submitFrame`
  （产品按原型在调用时查找方法，包装对所有后续调用生效），记录 t0/结算时刻与 rtt，
  **返回原 Promise**，观测自身只用旁路 `.then(onOk, onErr)`，不改结算、不抛错。
  单飞不变式由原始帧区间扫描复算 maxInFlight；遥测写入频度只用**一个** MutationObserver
  观察四个 `span.ux-metric` 数字区（一次绘制=一次写入事件），不把按钮/终态即时变化算入。
- **每轮隔离**：每轮 fresh browser + fresh page + 新 Worker；构建间串行；预热各 1 轮。
  readyMs 取页面 journey 时点，页面重开保证不复用首会话时间戳。
- **输出（candidate runRoot 下，baseline 只读）**：
  `measurements/ux-overhead/<attemptId>/`，含 run.json（双侧身份/method SHA/计划）、
  environment.json、input.json、manifest.json、rounds/（每轮原始帧全量，含预热）、
  invalid-rounds.json（排除原因**指向**原始文件，不删样本）、summary.json（各侧中位数与
  逐轮值）、comparison.json（每指标 median/limit/margin/公式文本 + 逐对表 + verdict/reasons，
  非布尔）。既有 attempt 输出目录拒绝覆盖（E_OUTPUT_EXISTS）。
- **失败策略**：候选侧不变式违规（单飞/遥测 4Hz）→ FAIL 且点名轮次，不当环境噪声；
  有效对 < 5 → NOT_RUN；环境不匹配/样本不足/输入 SHA 不符 → 该对不可判定并保留原始数据。
  整对替换（≤2 次）按任务边界留给 T31 执行。
- `--validate-only`：跑完整校验链、打印计划（pairs/order/warmup/methodSha/inputSha/
  mediaSha/instrumentationSha/outputDir），不启动浏览器、不写任何文件（测试用仓库树指纹
  证明零写入）。真实 A/B 命令即配方 F 的三参数形式，校验失败时不会进入 drive。

## 证据（实际执行）

RED（模块缺失，先写测试）：
```
node --test tools/desktop-recv/tests/measure-ux.test.mjs
# tests 1 / # pass 0 / # fail 1   （import 失败，整包 RED）  exit 1
```

GREEN（实现后，最终代码）：
```
node --check tools/desktop-recv/e2e/measure-ux.mjs        exit 0
node --check tools/desktop-recv/tests/measure-ux.test.mjs exit 0
node --test tools/desktop-recv/tests/measure-ux.test.mjs
# tests 38 / # pass 38 / # fail 0 / # skipped 0 / # todo 0  exit 0
```

CLI 拒绝路径（实测）：
```
node tools/desktop-recv/e2e/measure-ux.mjs --help        exit 0（打印三项必需参数与语义）
node tools/desktop-recv/e2e/measure-ux.mjs               exit 2（--context is required）
node tools/desktop-recv/e2e/measure-ux.mjs --gate local  exit 2（unknown argument）
--method 缺失/非 frozen/被改阈值                        exit 3（E_METHOD_MISSING /
                                                          E_METHOD_NOT_FROZEN / E_METHOD_THRESHOLD）
```
（单测内另覆盖：错误 SHA 拒绝（产品 manifest 篡改、跨侧 input SHA 不一致）、环境字段
不匹配逐项点名、丢轮/重复轮/样本不足拒绝、阈值 FAIL/NOT_RUN 判定与负 margin、无效轮
原始帧保留、输出目录防覆盖、validate-only 零写入。）

## 未做 / 遗留（明确边界）

- **未实跑 A/B**（计划规定 T31）：本任务只交付工具、单测与拒绝路径。真实采集需要
  candidate context（T34 另立）与已暂存构建；baseline 指向
  `docs/tests/runs/20261024-teamexec-04/run-context.json`（T6 基线）。
- 实时腿（30 秒活动窗口 5 对）与长任务数据属 T31/后续；本工具不宣称覆盖。
- 整对替换 ≤2 的策略执行、失败重跑形成新 attempt，均属 T31；工具已保证重跑不会覆盖旧
  attempt 数据。
- drive 代码（Playwright/Edge、静态服务器、文件输入）按现有 e2e 模式实现但未在 T28
  执行；T31 首次运行时应按配方 R 记录真实输出，若与实际页面细节（如按钮启用时序）不符，
  按 29→30 流程整改，不改冻结判据。

## 复核提示（给 T29 审查者）

- 阈值与顺序全部来自冻结文件且在工具内独立重现，改动即拒绝；无事后调参入口。
- 观测器两侧字节相同（SHA 入环境记录），包装不触碰产品代码、不改变 Promise 结算。
- 原始帧、无效轮、排除原因均落盘；comparison 保留数值与 margin，不是布尔结论。

# B8 / T30 工具侧整改 — measure-ux（B1/B2 + S5/S6/S9/S11）

日期：2026-10-25 · 分支 receiver-ux-v2（审查基点 e084f2c，审查轮 6533965）
状态：**两项 Blocking 整改完成，4 条建议采纳，45/45 GREEN；未实跑 A/B（T31）**

## 变更文件

- `tools/desktop-recv/e2e/measure-ux.mjs` — B1 逐轮容错+落盘、B2 去 25ms 轮询、
  telemetryArmed 判定、S5 显式 id 选择器、S9/S11 输出注记、CLI 退出码语义
- `tools/desktop-recv/tests/measure-ux.test.mjs` — 38 → 45 用例（新增 T30-B1a/b/c、
  T30-B2a/b/c、T28-07d；改 T28-06b/T28-07a/T28-07c；validRoundRecord 补 telemetryArmed）
- `tools/desktop-recv/e2e/README.md` — 失败语义/退出码/事件驱动 arming/armed 判定/
  冻结 SHA 锚点/计数口径说明
- `docs/dev-pipeline/receiver-ux-v2/review-ui-perf.md` — 追加「第 1 次整改结果
  （T30 工具侧）」节（只追加，未改原文）

未触碰 web/desktop-recv（产品侧并行整改）、tools/e2e 其他文件；未执行 git 写命令；
冻结阈值/顺序/样本下限零改动。

## B1：drive 失败路径（Blocking，已整改）

- `runRound` 内部 catch：单轮失败 → `collectionError` round record；
  `E_JOURNEY_INCOMPLETE`（journey 300s 未到 artifact）= business，其余 = environment；
  关闭浏览器前可 evaluate 时抢救 frames/telemetryWrites/telemetryArmed/journey/state
  （`salvaged` 标记）。
- `runAbDrive` 逐轮兜底 catch（stub/覆盖采集器抛错同样转记录）；随后照常判定并
  `buildOutputFiles`/`writeMeasurements` 全量落盘；CLI 将采集期异常与 verdict 一样
  exit 1，**exit 3 只留给运行前校验**（loadAndValidate），--help 同步。
- `decideVerdict`：候选 business 失败 → FAIL（failurePolicy）；环境/工具失败 →
  NOT_RUN（<5 有效对），reasons 列明 E_COLLECTION_ERROR + kind + pairIndex + side。
- `pairRounds` 顺带修正：轮自身排除（E_FRAMES/E_COLLECTION_ERROR 等）先于环境比较，
  空记录不再被误报为 E_ENV_MISMATCH（B1c 测试暴露）。

## B2：25ms 轮询与 armed 判定（Blocking，已整改）

- arming 事件驱动：document-start 检查 → loading 页 DOMContentLoaded(once) +
  有界 documentElement MutationObserver（armed 即断开）+ load(once) 断开并记
  `telemetryUnavailable`；非 loading 缺数字区直接记 unavailable。**零定时器**
  （字符串级断言：脚本不含 setInterval；vm 执行断言：setInterval/setTimeout 调用数 0）。
- 每轮回传 telemetryArmed/telemetryUnavailable；候选实测轮未 armed →
  E_TELEMETRY_NOT_ARMED（INVARIANT_CODES）→ FAIL；基线 → telemetryApplicable=false +
  「不适用」注记；预热与 collectionError 轮不判定（不重复计错）。

## 建议项（采纳）

- S5：选择器改为冻结 id `#ux-elapsed, #ux-rate, #ux-progress, #ux-media`（含 #ux-progress）。
- S6：T28-06b 改为可区分分布（逐轮中位 46 vs 混池 p50=48/p95=60，测试内独立复算）；
  新增 T28-07d 于 vm 真实执行 wrapper（Promise 同引用、结算原样、同域 rtt、同步抛错重抛）。
- S9：input.json.frozenAnchor + README：冻结 SHA 锚点=T6 input-manifest（各 run context
  绑定），method.primaryInput.sha256 保持 null 直至新版本。
- S11：summary.json.counting：30 帧门=okFrameCount（resolved，严于 settled 措辞），
  settledFrameCount 仅统计、不作为门。

## 实现注记（给审查者）

- **vm 沙箱与模块加载 seam**：OBSERVER_SCRIPT 的模块获取改为
  `typeof window.__uxModuleLoader === 'function' ? 注入 : (url) => import(url)`。
  真实页面从不定义该加载器，注入行为与原生 import 完全一致；这是为了让确定性测试
  能在 Node vm 中执行真实 wrapper（vm 的动态 import 需要 --experimental-vm-modules
  标志，测试运行器不带该标志）。T28-07d/T30-B2a/B2b 走注入加载器执行
  wrap/arming/结算 全部真实代码路径；INSTRUMENTATION_SHA256 仍为整段脚本 SHA。
- **roundCell 空值**：collectionError 轮的 comparison 逐对表字段统一 null（此前
  undefined 会在 JSON 中消失），并新增 telemetryArmed/collectionError 列。
- **judgeRound 顺序**：collectionError 恒为首位违规（exclusionReason=E_COLLECTION_ERROR），
  readyMs/帧/遥测检查仍全部执行并保留证据。
- 冻结常量与 validateMethod 未动；THRESHOLD_DEFAULTS/FROZEN_* 原样。

## 证据（实际执行）

```
RED（新用例先行，对审查基点实现）：
  node --test tools/desktop-recv/tests/measure-ux.test.mjs
  # tests 45 / # pass 36 / # fail 9（全部为本次新/改用例）  exit 1
GREEN（整改实现后，最终代码）：
  node --check tools/desktop-recv/e2e/measure-ux.mjs        exit 0
  node --check tools/desktop-recv/tests/measure-ux.test.mjs exit 0
  node --test tools/desktop-recv/tests/measure-ux.test.mjs
  # tests 45 / # pass 45 / # fail 0 / # skipped 0 / # todo 0  exit 0
  node tools/desktop-recv/e2e/measure-ux.mjs --help          exit 0
  git diff --check                                            exit 0
```

用例清单（45）：T28-01a/b/c、T28-02、T28-03a/b、T28-04a/b/c/d/e/f/g、T28-05a/b/c/d/e/f/g、
T28-06a/b/c/d/e/f、T28-07a/b/c/d、T28-08a/b/c/d、T28-09a/b/c/d/e、
T30-B1a/b/c、T30-B2a/b/c。

## 边界（未做，按分工）

- 产品侧整改（web/desktop-recv，含 S1/S2/S3/S4/S7/S10 相关项）由 dev-v2-prod 并行处理。
- 真实 A/B 采集、整对替换 ≤2、实时 5x30s 腿：T31。
- 未执行 git 写命令；工作区变更仅为上列 4 个文档/工具文件，等 team-lead 按配方 R 暂存提交。

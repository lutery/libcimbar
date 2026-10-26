# Round-12 工具侧整改报告（B-R12-2）

> 范围：`docs/dev-pipeline/ext-review/round-12-verdict.md` 的 **A-R3**、**A-R4/B-03**、**B-02** 与 Suggestions **S1/S2**（工具/门禁侧）。
> 仓库：`E:\Project\OpenSource\c++\libcimbar`，分支 `receiver-ux-v2`，基线 HEAD=`dc94f92`（本批未做任何 git add/commit/checkout/stash）。
> 纪律复核：`docs/tests/runs/**`、`docs/plans/receiver-ux-v2/performance-method.json`、`docs/tests/receiver-ux-v2/cases/*.json`、`web/desktop-recv/**` 全部未改（`git status --porcelain` 对这些路径为空）。

## 0. 结果摘要

| 项 | 状态 | 关键结果 |
|---|---|---|
| A-R3 实时腿 30s Receiving 判据 | 已实现（工具侧） | 新 `judgeLiveSide`：同一 session 身份 + 全部采样 Receiving + `windowObservedMs>=30000` + 窗口内真实结算；提前 Ready 即停采样、不补睡、如实记窗口不足；09b 10 侧旧记录被新判据全部拒绝 |
| A-R3 校准输入 | 已实现校验/记录能力 | 每侧按自己的 `inputManifest.liveInput`（缺省回退 `primaryInput.sourcePath/sourceSha256`）校验磁盘 SHA；两侧 SHA 必须一致；summary 输出 `windowObservedMs/firstNonReceiving/calibration.sampleInsufficient`；**不含**改冻结方法/阈值 |
| A-R3 反例回归 | 已实现（TDD） | `measure-ux.test.mjs` 新增 5 例：09b 形状拒绝、合规零违规、session 变化拒绝、窗口内无结算拒绝、B 侧反馈/冻结仍生效 |
| A-R4 E2E-35 真实后台 | **探针失败→按指示停手** | 本机 Edge 156.0.4314.42 / Chrome 155.0.8059.86：CDP 最小化、Win32 `SW_MINIMIZE`（确认真实最小化）、整窗遮挡均**不**改变 `document.visibilityState`；未改 `ui-journeys` E2E-35 计分；升级后的门禁会自动把 `-held` 替换判为违规（见 §2） |
| B-02 门禁三升级 | 已实现（TDD） | ①原/收 SHA 必须相等；②冻结步骤覆盖（规范 id 规则）；③measurement PASS 必须由新 `measure-ux-calc.mjs --recompute` 从原始 pair/live JSON 复算且 `ok=true` |
| S1 UX-IAT-08 原因文字 | 已修正 | 仍为 NOT_RUN，原因改为“测量器已交付、义务由同构建 recorded+实时腿承担” |
| S2 measure-ux 拆分 | 已实现 | 纯计算/校验迁入 `measure-ux-calc.mjs`（1384 行），`measure-ux.mjs` 1472→820 行并 import/re-export；CLI 兼容 |
| 回归 | 全绿 | node 工具测试 61→**66/66**；UX 自测 55→**65/65**；legacy 自测 **14/14** |
| 09b 门禁复跑 | 预期 exit1 | local 门禁 44 条违规（含 26 条缺步覆盖、3 条替换 id、12+31 条 measurement 复算违规、2 条既有 E2E-37 项），详见 §3.6 |

本批**没有**执行桌面车道（长浏览器/Sender/Receiver）；仅执行了一次短小 CDP 可行性探针（脚本在 `%TEMP%`，未入仓）。

## 1. A-R3 — 实时腿的 30 秒 Receiving 判据、校准与反例回归

### 1.1 09b 实际绑定的输入（只读核查结论）

- `docs/tests/runs/20261025-teamexec-09b/input-manifest.json` 的 `liveInput`：
  - `path = docs/tests/runs/20261025-teamexec-09b/fixtures/ext-random-1mib.bin`
  - `sha256 = 3cd0bea6db019549ee81b1b151d75797485daba542b770126710846f43ff37f9`，`bytes = 1048576`
  - `sourcePath = docs/tests/runs/20261024-teamexec-04/fixtures-ext/incompressible/ext-random-1mib.bin`
- 基线侧**由代码硬编码**绑定 `live-legs.mjs:370` 的 `join(baseline.abs.runRoot, 'fixtures-ext', 'incompressible', 'ext-random-1mib.bin')`；运行前用 SHA 与候选侧比对。run-04 的 `input-manifest.json` 没有 `liveInput` 字段，但其 `primaryInput.sourcePath/sourceSha256` 指向同一 1MiB 文件，`sourceSha256` 恰为 `3cd0bea6…37f9`。
- 结论：09b 两侧实际都用 **1MiB 难压缩样本**（SHA 一致），自然接收约 16–18 秒即 Ready；**1MiB 在该主机吞吐（约 60 KiB/s 含冗余）下不可能撑满 30 秒**。B-R12-3 要满足 E2E-38-S4，需要 **4MiB** 级样本（按 1MiB≈16–18s 线性外推约 64–72s，30s 有余量；2MiB 约 32–36s，处于临界，不建议）。
- **4MiB 样本已存在于基线根（只读核查）**：`docs/tests/runs/20261024-teamexec-04/fixtures-ext/incompressible/` 同时含
  `ext-random-1mib.bin`（1,048,576 B，SHA `3cd0bea6…37f9`）与
  `ext-random-4mib.bin`（4,194,304 B，SHA `6181826a9f8660745fce4fd5da548e9df70402ab955fd5c0fb3c38215161f44c`）。
  因此 4MiB 校准**不需要往任何旧 run 根写入**：新运行根绑定一份 4MiB 副本（`liveInput.sha256=6181826a…f44c`），基线侧按同名 basename 推断到 run-04 的 `fixtures-ext/incompressible/ext-random-4mib.bin` 并做同一 SHA 硬校验即可。
- 基线路径绑定规则（按 lead 补充要求实现）：
  1. 候选侧必须由自己的 `inputManifest.liveInput` 绑定样本（path + 64-hex SHA），磁盘重哈希；
  2. 基线侧优先用自己的 `liveInput` 绑定；没有时按**候选样本 basename** 映射到 `<baseline runRoot>/fixtures-ext/incompressible/<basename>`；
  3. 两侧 SHA 必须相等（硬校验，报错时标出各自绑定方式）；
  4. 基线根缺样本时**拒绝并明确报错**（提示 lead 决定提供/校准方案），工具绝不写入旧根。

### 1.2 改动

**`tools/desktop-recv/e2e/measure-ux-calc.mjs`（新增，纯函数）**

- `judgeLiveSide(record, side, options)`（替代 `live-legs.mjs` 的旧 `judgeSide`）：
  1. 以 `at/atMs` 排序采样；`firstNonReceiving` = 第一个非 `Receiving` 采样；窗口 = 首个到最后一个 Receiving 采样。
  2. `windowObservedMs = 最后 Receiving 采样 at − 首个 Receiving 采样 at`；`< 30000` ⇒ `E_LIVE_WINDOW_SHORT`。
  3. 任一非 Receiving 采样 ⇒ `E_LIVE_NOT_RECEIVING`（记录其 at/state）。
  4. session 身份：优先 `sessionId`，否则 `sessionSeq`；全窗口必须非空且恒定 ⇒ 否则 `E_LIVE_SESSION_IDENTITY`。
  5. 结算必须落在窗口内：采样带 `perfNow`（页面 `performance.now()`）把窗口映射到帧时钟；`settledAtMs ∈ [首个采样 perfNow, 最后采样 perfNow + 5s]` 的 ok 帧计数为 0 ⇒ `E_LIVE_NO_SETTLEMENT`；缺 `perfNow` ⇒ `E_LIVE_WINDOW_BOUNDS`（无法证明，直接拒绝）。
  6. 保留 single-flight（`maxInFlight<=1`）与 B 侧检查：遥测布防（`E_LIVE_TELEMETRY_NOT_ARMED`）、写间隔 ≥250ms（`E_LIVE_TELEMETRY_INTERVAL`）、数字反馈（`E_LIVE_NO_NUMERIC_FEEDBACK`）、状态反馈（`E_LIVE_NO_STATUS_FEEDBACK`）、真实停止后时钟冻结（`E_LIVE_CLOCK_NOT_FROZEN`）。
  7. 输出 `windowObservedMs / firstNonReceiving / settledInWindow / sessionIdentity / violationMessages / valid`，原始 `samples/frames` 原样保留。
- 旧判据（`revisionGrew`）删除：Ready 转换本身会推高 revision，正是 09b 全 VALID 的根因。

**`tools/desktop-recv/e2e/live-legs.mjs`**

- probe 增加 `perfNow`、`sessionId`、`sessionSeq`（`__contractSnapshot` 缺失时防御性读 `null`，见 §1.4）。
- 采样循环：每次采样后若 `state !== 'Receiving'` 立即记录 `observations.earlyStop` 并结束；否则仅在 `span < 30000` 时继续——**不补睡**。
- 判分改为 `await judgeSide()` → `judgeLiveSide`（同一实现供门禁复算复用）。
- 输入绑定：候选侧必须由 `inputManifest.liveInput` 绑定样本（path+sha256），基线侧优先用自己的 `liveInput`，缺失时按候选样本 **basename** 映射到 `<baseline runRoot>/fixtures-ext/incompressible/<basename>`；两侧都在启动浏览器前磁盘重哈希，且 SHA 必须相等；基线根缺样本 ⇒ 拒绝并提示 lead（**不写入旧根**）。`--validate-only` 改为真正的预检：先完成上下文/方法/两侧输入绑定校验并打印 `liveInputSha256/Bytes/Paths/Bindings/outputExists`（写 0 字节），真实运行仍受 write-once 守卫约束。
- summary 新增：`windowObservedMs`（每侧）、`firstNonReceiving`（每侧）、`rawSampleCounts`、`calibration.{activeWindowSeconds,sampleInsufficient,note,shortWindows}`；自然接收 <30s 时 `sampleInsufficient=true` 且 note 明确写“样本不足 …… 未补睡，按真实覆盖判 invalid”。
- 停止/冻结/observer 采集改为 try/catch：停止子腿失败不再丢弃原始窗口采样（记 `observations.stopError` 并由判据拒绝）。
- 写间隔、数字/状态、时钟冻结等 B 侧义务保持不变。

**`tools/desktop-recv/e2e/ui-journeys.mjs`（E2E-38 记录，配合 A-R3/B-02）**

- E2E-38 断言 id 由补充式 `R1/R2/L1` 改为冻结步骤规范 id `E2E-38-S01..S05`：
  - S01：冻结方法 SHA / 两侧 manifest / 输入绑定 + 两个 warmup 保留；
  - S02：5 对 recorded A/B 有效且 `>=30` ok 帧；
  - S03：三项门槛的 baseline/candidate/limit 数值齐全（不是裸 PASS）；
  - S04：live 5 对、10 侧 `windowObservedMs>=30000`、`calibration.sampleInsufficient===false`；
  - S05：warmup/无效/失败轮全部保留并由独立计算器复算。
- 整例 PASS 现在要求 S01–S05 全 PASS（`finish` 由断言派生）。

**`tools/desktop-recv/e2e/measure-ux.mjs`**：仅拆分接线（见 §5），无实时腿执行逻辑变化。

### 1.3 反例拒绝回归（TDD）

新增 `tools/desktop-recv/tests/measure-ux.test.mjs`：

- `T-R12-A3a` 09b 形状（15 采样、前 9 Receiving 后 6 Ready、Ready≈18.1s、142 帧、B 侧遥测齐全）⇒ 必须 `valid=false`，含 `E_LIVE_WINDOW_SHORT` + `E_LIVE_NOT_RECEIVING`，`windowObservedMs=16080`，`firstNonReceiving.state='Ready'`，15 条原始采样保留。
- `T-R12-A3b` 合规（16 采样覆盖 30s 全 Receiving、同一 sessionId、窗口内 70 个 ok 帧、遥测 260ms、状态/数字变化、停止后冻结）⇒ `violations=[]`、`valid=true`。
- `T-R12-A3c` 窗口中途换 session 身份 ⇒ `E_LIVE_SESSION_IDENTITY`。
- `T-R12-A3d` 结算全在窗口之前 ⇒ `settledInWindow=0` + `E_LIVE_NO_SETTLEMENT`。
- `T-R12-A3e` B 侧未布防/写间隔 <250ms/时钟不冻结 ⇒ 对应违规；A 侧不因无数字区被误判。

RED 证据：
- `red-logs/r12-tools/red-measure-ux-live-judge.txt`：新用例在当前实现上 **5 failed / 45 passed**，错误为 `ERR_MODULE_NOT_FOUND measure-ux-calc.mjs`（TDD 起点）。
- `red-logs/r12-tools/red-old-live-judge.txt`：用 `git show HEAD:.../live-legs.mjs` 原样抽取的**旧判据**跑 09b 形状记录 ⇒ `oldJudgeValid=true`、`violations=[]`、`revisionGrew=true`、`windowObservedMs=16080`、6 条 Ready 采样——复现裁决根因。

GREEN：见 §6（66/66）。

### 1.4 诚实遗留（A-R3）

1. **`__contractSnapshot` 不含 `sessionSeq`**：`web/desktop-recv/src/contract-snapshot.js` 的 wire 形状只有 `sessionId`/`revision`（内部 snapshot 才有 `sessionSeq`）。本批**未改产品**（不在允许范围），判据以 `sessionId` 作为“同一 session”的身份，并对 `__contractSnapshot.sessionSeq` 做防御性读取——若产品侧（B-R12-1 代理）把 `sessionSeq` 加入 wire 契约，判据会自动改用 `seq:` 身份，无需再改工具。裁决 DoD 写的是“同一 session/seq”，当前实现满足 session 维度。
2. 实时腿的“候选反馈时间覆盖”由 B 侧数字/状态变化 + 遥测写间隔承担；未新增额外指标（不越冻结方法边界）。
3. 09b 的 10 份旧 raw **未改**，作为失败原件保留；新判据对它们的拒绝结果见 §3.6 与 `recompute-09b.txt`。

## 2. A-R4 / B-03 — E2E-35 真实后台：探针失败，按指示停手

### 2.1 探针（`%TEMP%`，无 Sender/Receiver 服务器，未入仓）

| 探针 | 装置 | 结果（页面自身只读 `document.visibilityState` + `visibilitychange` 监听） |
|---|---|---|
| 1 | Playwright headed Edge，`context.newCDPSession(page)` → `Browser.getWindowForTarget` → `Browser.setWindowBounds{windowState:'minimized'}` | baseline `visible`；最小化后 `visible`，事件 0；恢复后 `visible` |
| 2 | A：普通启动 + CDP 最小化（含“先切到另一窗口再最小化”）；C：`--disable-features=CalculateNativeWinOcclusion` + CDP 最小化 | 全部 `visible`，事件 0 |
| 3 | **纯 Edge 启动**（无 Playwright launch 参数）+ Win32 `ShowWindow(SW_MINIMIZE)`；helper 真实返回 `MINIMIZED R12PROBE - 用户配置 1 - Microsoft Edge`；随后再用最大化第二个 Edge 窗口做**整窗遮挡** | 最小化确认发生，但页面仍 `visible`、事件 0；整窗遮挡后仍 `visible` |
| 4 | Google Chrome 155.0.8059.86，CDP 最小化 | `visible` → `visible`，事件 0 |

Edge 版本：156.0.4314.42。探针关键原始输出（节选，均为页面自身只读状态）：

```
# 探针 1（Edge，CDP minimize）
{"steps":[{"step":"baseline","visibilityState":"visible"},
          {"step":"getWindowForTarget","windowId":254149135,"ok":true},
          {"step":"after-minimize","visibilityState":"visible","visLog":[]},
          {"step":"after-restore","visibilityState":"visible","visLog":[]}],
 "verdict":{"minimizeFlipsHidden":false,"restoreFlipsVisible":true}}

# 探针 2（A：CDP minimize 普通启动/失焦；C：CalculateNativeWinOcclusion 关闭）
A-cdp-plain  afterCdp={"state":"visible","hasFocus":true,"log":[]}
A-cdp-plain  afterCdpUnfocused={"state":"visible","hasFocus":true,"log":[]}
C-cdp-no-occlusion afterCdpNoOcclusion={"state":"visible","hasFocus":true,"log":[]}

# 探针 3（纯 Edge 启动 + Win32 SW_MINIMIZE + 整窗遮挡）
{"baseline":{"state":"visible","hasFocus":true,"log":[]},
 "afterWin32Minimize":{"helper":"MINIMIZED R12PROBE - 用户配置 1 - Microsoft​ Edge",
                       "state":"visible","hasFocus":true,"log":[]},
 "afterRestore":{"state":"visible","hasFocus":true,"log":[]},
 "afterOcclusion":{"state":"visible","hasFocus":true,"log":[]}}

# 探针 4（Google Chrome）
{"browserVersion":"155.0.8059.86","baseline":{"state":"visible"},
 "afterMinimize":{"state":"visible"},"afterRestore":{"state":"visible"},
 "verdict":{"minimizeFlipsHidden":false,"restoreFlipsVisible":true}}
```

关键判定：`minimizeFlipsHidden=false`（Edge/Chrome 两种浏览器、CDP 与 Win32 两种机制、遮挡路径均不翻转）。

### 2.2 结论与处置

- **本机无法构造真实 `hidden`**：真实最小化/遮挡都不触发 Page Visibility。这与 09b 记录 `visibility=visible, heldMs=8830` 的环境限制一致，且与 run-e2e 为接收页加的 `--disable-features=...,CalculateNativeWinOcclusion` 无因果混淆（探针在**不加**该参数时同样不翻转）。
- 按 B-R12-2 指令第 3 条：**停手，不改 `ui-journeys.mjs` 的 E2E-35 计分**，绝不注入 `document.visibilityState`、绝不伪造。E2E-35 代码本批零改动。
- 回退方案（待 lead/用户决策）：E2E-35 必测分支 S02 与整例按真实覆盖标 **非 PASS**，同步阶段汇总；如需改变范围，必须取得用户范围决策并修订冻结计划。
- **门禁已具备自动拦截**：升级后的步骤覆盖规则会把 09b 的 `E2E-35-S02-held` 判为非规范替换 id，并判定 S02 无覆盖（见 §3.6），因此“换名保 PASS”在下一次运行中不再可行——不需要依赖人工纪律。

## 3. B-02 — UX 总门禁三升级

### 3.1 ①原/收相等（`verify-ux-evidence.py`）

- `file_roundtrip`：磁盘重算两侧 SHA 后，新增 `referenceSha256 == receivedSha256` 断言；不等即违规。原/收不同的合法场景在本迭代不存在（所有 file_roundtrip 都是“原样重建”语义），因此按用例语义直接判违规。

### 3.2 ②冻结步骤覆盖

- 规范：断言 id 必须匹配 `<caseId>-S<步号>`，或该步号 + 单大写字母子后缀（`<caseId>-S03-B`）。
- 从 `planningFile.e2eScenarios[].steps` 取每例必测步集；PASS 记录必须每步至少一条 PASS 断言覆盖。
- 违规：步骤缺失；步骤形状但非规范（`-S02-held`、`-S01b`、`-S04-stop`）；声称冻结用例不存在的步号；NOT_RUN 记录携带任何 PASS 断言（假覆盖）。
- 非步骤型补充断言（`E2E-28-PRE`、`E2E-30-A1` …）本身不算违规——但它们**不能**替代步骤覆盖。

**09b 断言 id 盘点（只读）**

| 用例 | 09b 断言 id | 新规则判定 |
|---|---|---|
| E2E-27 | S01, **S01b**, S02–S06 | 非规范 id ×1；覆盖完整 |
| E2E-28 | S01–S05, PRE | 干净（PRE 为补充） |
| E2E-29 | S01–S05 | 干净 |
| E2E-30 | A1–A6 | 4 个冻结步骤全缺 |
| E2E-31/32/33 | A1–A4 | 各 4 步全缺 |
| E2E-34 | A1–A3 | 4 步全缺 |
| E2E-35 | S01, **S02-held**, S03, S04, **S04-stop** | 非规范 ×2；S02 缺覆盖 |
| E2E-36 | S01-A/B, S02, S03-A/B/C, S04-A/B | 干净 |
| E2E-37 | （NOT_RUN，无断言） | 不要求断言；不伪造覆盖 |
| E2E-38 | R1, R2, L1 | 5 步全缺 |

> 现行运行器与步号不一致的“合法 id”已按要求先报告：`media-journeys.mjs`（E2E-30–34）发 `A1..A6`，`ui-journeys.mjs` E2E-35 发 `S02-held`/`S04-stop`，09b E2E-27 发 `S01b`。本批只改了 E2E-38（属 A-R3/B-02 范围）；其余留给 lead 决策：B-R12-3 前把运行器 id 改成规范步骤形（推荐），或正式修订规则。

### 3.3 ③测量复算（`measure-ux-calc.mjs --recompute`）

CLI：`node tools/desktop-recv/e2e/measure-ux-calc.mjs --recompute <runRoot> <measurementDir...> --method <path> [--context <ctx>] [--repo-root <dir>]`，输出 `{ok, violations[], stats}`，exit 0 仅当 `ok`。

- 从磁盘重读 `rounds/*.json`（warmup-A/B + pair-1..5-A/B，缺/多都违规）与 `live/rounds/*.json`（10 侧）。
- 用冻结方法复算：`pairRounds → summarizeSides → evaluateThresholds → decideVerdict`，并逐项核对 `summary.json/comparison.json` 声称的每个数字（中位数、每轮 p50/p95、frameCounts、limit/margin/pass、pair cells）——篡改即 `E_RECOMPUTE_TAMPERED`。
- 硬不变式：single-flight、遥测 ≥250ms、未布防、输入/媒体 SHA、`run.json`/`summary`/`comparison` 的 methodSha256 与当前冻结方法一致、instrumentationSha256 与当前 observer 一致。
- 实时腿：用 `judgeLiveSide` 重判 10 侧，核对 `sidesValid/verdict/invalidRounds` 与 `liveInputSha256`；缺 pair/raw、提前 Ready、窗口不足、窗口内无结算 ⇒ 违规。
- proof 副本解析：若目录内 `run.json.candidate.attemptId` 指向 `<runRoot>/measurements/ux-overhead/<attempt>` 且存在，则先要求副本与原件逐文件 JSON 相等（`E_PROOF_COPY_MISMATCH`），再复算原件；`attemptId` 必须匹配 `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`（防路径穿越）。
- `--context` 给出时交叉绑定当前 `productManifestSha256`、输入主件/媒体/liveInput 的 manifest SHA（并由计算器重哈希磁盘文件）。

门禁侧：measurement PASS 记录必须（a）有 `measurements/summary.json`、`comparison.json`、`measurements/live/summary.json` 三类 proofRef；（b）shell 调用上述 CLI 且 `ok=true`；缺失/拒绝 ⇒ 违规（每条记录最多展开 12 条 + “… and N more”）。

### 3.4 自测负例扩充（TDD，先 RED）

`tools/desktop-recv/tests/ux-evidence-selftest.py`：55 → **65** 例。新增/改造：

- 正例夹具升级为真实契约形状：plan 每例带 `steps`；断言改为规范 `S01..S0N`；方法文件改用**真实冻结方法字节**；input manifest 绑定 primary/media/liveInput（文件真实落盘）；E2E-38 使用完整 measurement 夹具（原目录含 rounds/ + live/rounds/，proof 副本不含 rounds/，与真实 ui-journeys 复制行为一致）。
- 新增负例（verdict 三负例 + 覆盖 + 测量）：
  1. 原/收字节不同但各自 SHA 正确 ⇒ 拒绝；
  2. 冻结步骤断言全删、只留未知 id ⇒ 拒绝（S01…缺覆盖）；
  3. measurement 无任何 raw/配对/summary，只剩 proof.txt ⇒ 拒绝；
  4. `-held` 替换 id（PASS 仍在）⇒ 拒绝；
  5. 小写子后缀 `S01b` ⇒ 拒绝；
  6. 原件缺 `rounds/pair-3-B.json` ⇒ 拒绝；
  7. 原件 `summary.json` 被改数（readyMsMedian+500）⇒ 拒绝；
  8. 09b 形状的提前 Ready 实时窗 ⇒ 拒绝；
  9. raw 阈值超限但记录仍称 PASS ⇒ 拒绝（`E_VERDICT_MISMATCH`）；
  10. 缺 live 腿 raw 文件 ⇒ 拒绝。

RED 证据（对 **HEAD 旧门禁**，用 `git show HEAD:...` 抽出的真实旧实现运行同一批负例）：
`red-logs/r12-tools/red-ux-gate-negatives.txt`

```
original!=received with correct per-file SHAs        exit=0 violations=0
all frozen steps deleted, one unknown id             exit=0 violations=0
measurement with no raw data, only proof text        exit=0 violations=0
RED CONFIRMED (old gate accepts every negative)
```

（另：`selftest-run-1.txt` 保留了实现过程中一次真实失败——覆盖检查实参顺序写反导致正例误报 4/65；修正后 `selftest-run-2.txt` 全绿，如实保留。）

### 3.5 GREEN

```
python tools/desktop-recv/tests/ux-evidence-selftest.py     → SELFTEST PASS (65 cases)
python tools/desktop-recv/verify-evidence-selftest.py       → SELFTEST PASS (14 cases)
```

### 3.6 09b 门禁复跑（预期 exit1，09b 未改）

`red-logs/r12-tools/gate-09b-local.txt`：`UX GATE local: FAIL (44 violation(s))`，分类：

| 类别 | 数量 | 明细 |
|---|---|---|
| 缺步骤覆盖 | 26 | E2E-30–34 共 20 步（A1..A6 不是步骤 id）+ E2E-38 5 步（R1/R2/L1 不是步骤 id）+ E2E-35 S02（被 `-held` 顶替） |
| 非规范替换 id | 3 | `E2E-27-S01b`（小写）、`E2E-35-S02-held`、`E2E-35-S04-stop` |
| E2E-37 既有项 | 2 | result=NOT_RUN、executedBy=None（本批前即存在） |
| measurement 复算拒绝 | 12 条 + “… and 31 more”（共 43 条） | 10 侧全部提前 Ready（窗口 ~16.07–16.11s）+ 无 session 身份 + 无 perfNow 锚点；`live/summary.json` 的 `sidesValid 5/5`、`verdict PASS`、`invalidRounds []` 与复算不符 |

同时 `red-logs/r12-tools/recompute-09b.txt`（CLI 直跑）：`ok=false`，43 条违规 = 40 条 `E_LIVE_INVALID` + 3 条 `E_RECOMPUTE_TAMPERED`；**recorded A/B 部分复算无误**（`validPairs=5`、`verdict=PASS`、无 summary 篡改），说明拒绝只来自实时腿与门禁新语义，不是把旧录像数值判错。

这些都是 **09b 历史缺陷 + 升级后新增语义**，按指令未修改 09b 一个字。

## 4. S1 — UX-IAT-08 占位原因

`tools/desktop-recv/e2e/iat-suite.mjs`：状态保持 `NOT_RUN`，原因文字改为：

> 测量器（measure-ux / measure-ux-calc / 实时腿）已交付并实跑；本组对应的 IAT 义务由同构建真实 A/B 录像测量（recorded）与 5×真实 30 秒实时腿证据承担，不在此重复执行，也不因其他测试存在而伪造 PASS

日志行同步改为 `IAT UX-IAT-08 NOT_RUN (obligation carried by same-build recorded + live A/B evidence)`。未把任何占位改为 PASS。

## 5. S2 — measure-ux 纯计算/校验拆分

- 新增 `tools/desktop-recv/e2e/measure-ux-calc.mjs`（1384 行）：冻结方法校验、nearest-rank 统计、round judging、配对、聚合、三公式阈值、verdict、observer 脚本与 `INSTRUMENTATION_SHA256`、`judgeLiveSide`、`recomputeMeasurement/recomputeLiveDir` 与 `--recompute` CLI。
- `tools/desktop-recv/e2e/measure-ux.mjs`：1472 → 820 行。原纯函数区整段移除，改为
  `export { ... } from './measure-ux-calc.mjs'` + 内部 `import { ... }`；历史导出（`OBSERVER_SCRIPT`、`INSTRUMENTATION_SHA256`、`judgeRound`…）与 CLI 行为不变（既有 61 条工具测试原样通过，现 66 条）。
- 浏览器驱动、静态服务器、A/B 轮次编排仍留在 `measure-ux.mjs`；`live-legs.mjs` 与门禁复用 calc 的同一判据/计算器，避免“两套验证路径不一致”。
- 实时腿**仍是独立 CLI**（`node tools/desktop-recv/e2e/live-legs.mjs --context … --baseline-context … --method …`），未接进 `measure-ux.mjs`；E2E-38 的实时部分由 `ui-journeys` 读取其 `live/summary.json` 产出断言，再由门禁的 calc CLI 复算。

## 6. 验证命令与真实输出

| 命令 | 结果 |
|---|---|
| `node --test tools/desktop-recv/tests/measure-ux.test.mjs tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/process-guard.test.mjs` | exit0，**66/66**，0 failed/todo/skipped（原 61 + 新增 5） |
| `python tools/desktop-recv/tests/ux-evidence-selftest.py` | exit0，**65/65**（原 55 + 新增 10） |
| `python tools/desktop-recv/verify-evidence-selftest.py` | exit0，**14/14** |
| `node -e "import('./tools/desktop-recv/e2e/measure-ux-calc.mjs')…"` | `calc-ok function function function` |
| `node --check` 三个 e2e 模块 | 全部通过 |
| `measure-ux-calc --recompute`（09b，含 proof 副本 + context） | exit1（预期），43 条违规，见 §3.6 |
| `verify-ux-evidence.py --gate local`（09b） | exit1（预期），44 条违规，见 §3.6 |
| `live-legs.mjs --validate-only`（09b+04） | exit0；A 侧 `basename-inferred` → run-04 `fixtures-ext/incompressible/ext-random-1mib.bin`，两侧 SHA `3cd0bea6…37f9` 一致，`outputExists=true`（真实运行仍被 write-once 拒绝；dry-run 写 0 字节） |

日志：`docs/dev-pipeline/receiver-ux-v2/red-logs/r12-tools/`
（`red-measure-ux-live-judge.txt`、`red-old-live-judge.txt`、`red-ux-gate-negatives.txt`、`selftest-run-1.txt`、`recompute-09b.txt`、`gate-09b-local.txt`、`green-node-tests.txt`、`green-selftests.txt`、`selftest-run-2.txt`）。

## 7. 诚实遗留与 B-R12-3 交接清单

1. **A-R4 未完成且本机不可完成**：真实后台 `hidden` 在本机四种装置下均无法构造（§2）。E2E-35 本批零改动；下一轮运行会被新门禁自动判非 PASS（`S02-held` 非规范 + S02 缺覆盖）。需 lead/用户决定：保留非 PASS 并在汇总中同步，或取得明确范围决策并修订冻结计划（不得只改 notes）。
2. **`sessionSeq` 不在 wire 契约**：判据用 `sessionId` 承担“同一 session”；若产品代理把 `sessionSeq` 加入 `__contractSnapshot`，判据自动升级，无需再改工具。若要求严格 `sessionSeq`，需产品侧配合（本批未改 `web/desktop-recv/**`）。
3. **4MiB 校准的绑定**：run-04 的冻结 manifest 只把 1MiB 绑定为 `primaryInput.source`，但基线根的 `fixtures-ext/incompressible/` **已有** `ext-random-4mib.bin`（SHA `6181826a…f44c`），基线侧按 basename 推断即可，无需改/写旧根。B-R12-3 只需在新运行根的 input manifest 里把 `liveInput` 指向一份同名 4MiB 副本并锁 SHA；随后先跑 `live-legs.mjs --validate-only` 核对两侧绑定。**1MiB 不能撑满 30s**（09b 实测 16–18s）。
4. **运行器 id 规范化（B-R12-3 前）**：`media-journeys.mjs` 的 E2E-30–34 仍发 `A1..A6`，新门禁会判缺步骤覆盖；`ui-journeys` E2E-35 的 `S02-held`/`S04-stop` 同理（A-R4 停手，未动）。要么在 B-R12-3 改为规范步骤 id / 非步骤补充 id，要么由 lead 正式修订规则。本批只改了 E2E-38。
5. **E2E-38 新断言 id 尚未在真实运行中产出**：本批无桌面车道，S01–S05 的逻辑只经过语法/单元级验证；B-R12-3 首次实跑后应由门禁复算确认（缺字段会直接 FAIL，不会静默通过）。
6. **measurement 复算的边界**：不带 `--context` 时只做测量目录内部一致性（方法 SHA、原始数值、实时窗），不重哈希产品/输入实物；门禁始终带 `--context`，单跑 CLI 时需自行带上。
7. **未执行**：桌面 E2E、真实 Sender/Receiver、真实 5×30s 重跑、主录像 A/B 重录、现场验收。本报告不把这些写成已完成。
8. **09b 只读**：`git status` 对 `docs/tests/runs/**`、冻结方法、cases 步文本、`web/desktop-recv/**` 均为空；10 份实时 raw 与 `-held` 记录按失败原件保留。

## 8. A-R4 第二轮探针（lead 指定三装置）— 全部失败，E2E-35 保持零改动

### 8.1 装置与真实输出

日志：`red-logs/r12-tools/probe2-three-apparatuses.txt`、`probe2b-real-tab-cdp.txt`。

| 装置 | 做法 | 真实结果 |
|---|---|---|
| A（Playwright 去默认后台参数） | `chromium.launch({channel:'msedge', ignoreDefaultArgs:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-features']})`，CDP `Browser.setWindowBounds{windowState:'minimized'}` | Edge 156.0.4314.42；最小化后 `visible`、`visibilitychange` 事件 0；恢复后 `visible`；`minimizeFlipsHidden=false` |
| B（真实浏览器形态） | 直接 `msedge.exe --remote-debugging-port=9557 --user-data-dir=<temp> --no-first-run`，CDP attach 后最小化 | 最小化后 `visible`、事件 0；恢复后 `visible`；`minimizeFlipsHidden=false` |
| C（真实标签页切换） | 同一窗口第二标签页真实激活 ≥6s 再切回接收页；先用 Playwright 第二 tab，再用 CDP `Target.createTarget{newWindow:false}` + `Target.activateTarget` 复核 | 见下 |

装置 C 的 CDP 复核（关键）：两个 target 的 `Browser.getWindowForTarget` 返回**同一 windowId=1371439402**（确认是真标签页而非新窗口）；`Target.activateTarget` 激活第二标签 7.008s 期间，接收页 `document.visibilityState='visible'`、`document.hidden=false`、`hasFocus=true`、`visibilitychange` 事件 0；切回后仍 `visible`。Playwright 第二 tab 的 7.004s 保持结果相同。

```
{"sameWindow": true, "windowId": 1371439402,
 "whileOtherTabActive": {"state":"visible","hidden":false,"hasFocus":true,"log":[]},
 "heldMs": 7008,
 "backOnReceiverTab": {"state":"visible","hidden":false,"hasFocus":true,"log":[]},
 "verdict": {"sameWindowRealTab": true, "hiddenWhileOtherTab": false,
             "visibleAfterReturn": true}}
```

### 8.2 结论

- lead 指定的三种装置**全部不能**让页面自身产生 `hidden`；连“真实同窗标签切换”都不触发，且最小化期间 `hasFocus` 仍为 true——说明本机（远程/云桌面会话）的 Page Visibility 与焦点信号整体惰性，不是某个启动参数的问题（第一轮已排除 `CalculateNativeWinOcclusion`）。
- 按指令：**E2E-35 保持零改动、停手**，不注入 `document.visibilityState`、不伪造。回退方案（整例非 PASS + 用户升级）待 lead/用户决策。
- 门禁联动不变：`E2E-35-S02-held` 仍是替换 id、S02 仍无覆盖，下一轮运行该例会被自动判非 PASS。

## 9. 断言 id 规范化（任务 2）

### 9.1 media-journeys.mjs（E2E-30..34）：旧 id → 规范 id 映射

按 `docs/tests/receiver-ux-v2/cases/e2e-receive.json` 的冻结 steps 语义映射（expected/observed/判据字符串**未改**）：

| 用例 | 旧 id | 新 id | 对应冻结步骤依据 |
|---|---|---|---|
| E2E-30 | A1 | `E2E-30-S01` | S1 真实接收 A 至用时/速率可见 |
| E2E-30 | A2 | `E2E-30-S01-B` | S1 点击停止并记录清理 |
| E2E-30 | A3 | `E2E-30-S02` | S2 清理后另一输入的新会话/初始计时 |
| E2E-30 | A4 | `E2E-30-S03` | S3 B 真实重建并实际保存 |
| E2E-30 | A5 | `E2E-30-S04` | S4 反向输入重复停止/切换 |
| E2E-30 | A6 | `E2E-30-S04-B` | S4 反向保存 |
| E2E-31 | A1 | `E2E-31-S01` | S1 真实 OS 选文件并返回接收页 |
| E2E-31 | A2 | `E2E-31-S02` | S2 分时点观察位置/用时/速率/估计 |
| E2E-31 | A3 | `E2E-31-S02-B` | S2 重建指标与位置分开标注 |
| E2E-31 | A4 | `E2E-31-S04` | S4 真实保存 + 应用外核 SHA |
| E2E-32 | A2 | `E2E-32-S01` | S1 到尾不提前启用保存/不假完成 |
| E2E-32 | A1 | `E2E-32-S02` | S2 EOF 屏障后明确“数据不足/未完成” |
| E2E-32 | A3 | `E2E-32-S03` | S3 清理后重新导入完整录像 |
| E2E-32 | A4 | `E2E-32-S04` | S4 保存相等 + T6 pair 材料 |
| E2E-33 | A1 | `E2E-33-S02-A` | S2 保存对话框停留 ≥3s |
| E2E-33 | A2 | `E2E-33-S02-B` | S2 真实取消后仍可保存 |
| E2E-33 | A3 | `E2E-33-S03` | S3 第二次保存到新路径 + 四个时点 |
| E2E-33 | A4 | `E2E-33-S04` | S4 原/收 SHA 相等 |
| E2E-34 | A1 | `E2E-34-S01` | S1 锁文件保存真实失败分支 |
| E2E-34 | A2 | `E2E-34-S03` | S3 解锁后保存到新路径完成 |
| E2E-34 | A3 | `E2E-34-S04` | S4 原/成功输出 SHA 相等 |

**新增的步骤覆盖断言（4 条，非改名，供 lead 复核）**——原运行器在这些冻结步骤上没有任何断言，若不补则新记录仍会被门禁判缺步：

| 新 id | 冻结步骤 | 判据来源（step 原文） | 实现方式 |
|---|---|---|---|
| `E2E-31-S03` | S3 | “保持正常读取直到真实 artifact；若早于媒体尾完成，记录实际完成位置 / Ready 由 artifact 而非位置比例” | 复用 `waitReady` 的返回值（state/artifact/elapsed/media），不新增采样 |
| `E2E-32-S02-B` | S2 | “速度不继续虚增、用时冻结” | Incomplete 后间隔 1.5s 采样两次，比较 elapsed 与 rate 文本 |
| `E2E-33-S01` | S1 | “观察未保存的 Ready 主区与文件信息；记接收用时并保持 3 秒 / 用时已冻结，不继续虚显速率” | Ready 后保持 ~3.2s，两次采样比较 elapsed/rate 与主文案（非“已保存”） |
| `E2E-34-S02` | S2 | “回页后主提示准确……artifact 仍可保存” | 复用失败分支探针 + `pageState` 的 `saveDisabled/artifactName`，不新增采样 |

### 9.2 run-e2e.mjs（E2E-27）

- `E2E-27-S01b` → `E2E-27-S01-B`（同一步骤的第二条断言，语义/判据一字未动）。

### 9.3 静态覆盖验证（用门禁自身的规则）

`red-logs/r12-tools/static-coverage-runner-ids.txt`：把两个运行器源码中实际发出的 id 送入 `verify-ux-evidence.check_step_coverage`，对冻结 steps 校验：

```
E2E-30 ids=[S01, S01-B, S02, S03, S04, S04-B, ABORT]      violations=none
E2E-31 ids=[S01, S02, S02-B, S03, S04, ABORT]             violations=none
E2E-32 ids=[S02, S02-B, S01, S03, S04, ABORT]             violations=none
E2E-33 ids=[S01, S02-A, S02-B, S03, S04, ABORT]           violations=none
E2E-34 ids=[S01, S02, S03, S04, ABORT]                    violations=none
E2E-27 ids=[S01, S01-B, S02..S06, ABORT]                  violations=none
STATIC COVERAGE: PASS
```

（ABORT 是非步骤型补充 id，不冒充步骤。）

### 9.4 09b 门禁复跑的真实结果（与 lead 预期的差异，如实说明）

`red-logs/r12-tools/gate-09b-local-after-id-normalization.txt`：**仍是 `UX GATE local: FAIL (44 violation(s))`，与改名前逐条一致**。

原因：门禁读的是 `docs/tests/runs/20261025-teamexec-09b/ux-results.json` 里的**历史记录**（`A1..A6`、`S01b`、`S02-held`、`R1/R2/L1`），而本任务改的是**运行器**；09b 只读、不得改写，所以缺步/替换 id 类违规不会因运行器改名而减少。真实清单仍是：

- 缺步覆盖 26 条：E2E-30–34（20，09b 记录的 A 系列 id）+ E2E-38（5，历史 R1/R2/L1）+ E2E-35 S02（1）；
- 非规范替换 id 3 条：`E2E-27-S01b`、`E2E-35-S02-held`、`E2E-35-S04-stop`；
- E2E-37 既有 2 条 + measurement 复算 12 行（43 条）。

下一次运行（B-R12-3）由新运行器写出的记录中，上述缺步/替换类违规预期只剩 **E2E-35**（S02 仍未真实覆盖，除非 A-R4 得到范围决策）；E2E-27/30–34 已由静态覆盖验证为 0，E2E-38 已在上一批改为 S01..S05。

## 10. E2E-35 → 如实 NOT_RUN（用户裁定落地，B-R12-2 收尾）

### 10.1 改动

- `tools/desktop-recv/e2e/ui-journeys.mjs`：`e2e35` 处理器整体替换为**诚实 NOT_RUN**（原 journey 全身、含 held 代理计分与 `S02-held`/`S04-stop` id 一并删除，不再执行任何腿、不再注入任何东西）：
  - `result='NOT_RUN'`，`executedBy=null`，`startedAt/finishedAt=null`，`proofRefs=[]`，`assertions=[]`（门禁 NOT_RUN 契约由 `makeRecorder.finish` 派生，无 PASS 断言）；
  - notes 含三点：① S02 真实 visibility 变化经三种装置探针证实不可构造（Playwright 去默认后台参数 + CDP 最小化、原生 msedge + CDP 最小化、真实同窗标签切换，CDP 同 windowId + `Target.activateTarget ≥6s`）；② 用户 2026-10-26 指示真实远程会话行为由用户侧真实环境验证，不要求代理本地模拟（授权来源 `docs/dev-pipeline/pipeline-state.json` team-exec `user_instructions 2026-10-26T10:10`）；③ 不修订冻结用例、不做局部/替代执行冒充；本记录无任何 PASS 断言；
  - 两份探针日志的**真实文件副本**复制进本 attempt 目录（`proof/E2E-35/<attempt>/probe2-three-apparatuses.txt`、`probe2b-real-tab-cdp.txt`；源文件缺失时如实记入 notes，不造假文件）。
- `tools/desktop-recv/e2e/run-e2e.mjs`（最小接线）：`needsSender` 移除 `'E2E-35'`——solo 运行 E2E-35 不再启动无用的 Sender/Receiver 浏览器栈（UX-UI 组仍因 E2E-36 启动）。solo 运行以 exit1 + `CASE E2E-35 FAIL` 日志结束，记录本身是 NOT_RUN（诚实非 PASS 语义）。

### 10.2 静态自检（`e2e35-notrun-static-selfcheck.txt`）

构造与处理器输出同形的 NOT_RUN 记录过 `validate_ux_record`，结果**恰好两条预期违规，无其他**：

```
violations (2):
  - E2E-35: the local gate requires result PASS (got 'NOT_RUN')
  - E2E-35: executedBy must be executor per the plan (got None)
SELF-CHECK: PASS (only the two expected violations)
```

### 10.3 回归

`node --test measure-ux/run-context/process-guard` → **66/66**；`ux-evidence-selftest.py` → **65/65**；`verify-evidence-selftest.py` → **14/14**。`node --check` 两个运行器通过。
## 11. B-R12-3 执行中发现（供 round-13 披露）

### 11.1 E2E-27-S03 旧实现 "riding the fixed bug" 的证据链

| 证据 | 内容 |
|---|---|
| 旧运行器实现 | `run-e2e.mjs` S03 用 `contractSnapshot.revision > revisionBase` 作为“首次真实 data”触发。`session.js` 的 `_emit` 只在状态/保存相位变化时递增 revision（`:91-97`），数据帧推进不递增——因此该条件只可能命中 `Receiving→Ready` 转换。 |
| 旧记录（09b） | `E2E-27-S03` 观察值：`restore=live revision=3 (base 2) primary=文件已接收完成，请保存 rate=40.8 KiB/s（含冗余）` —— **在 Ready 状态下**凭一条陈旧速率文本通过（这正是外审 B-01/A-R2 指出的缺陷）。 |
| 新构建（本轮） | 同一断言两次运行均得 `revision=3 (base 2) primary=文件已接收完成，请保存 rate=`（终态收敛清空速率）→ 确定性 FAIL。journey 时间戳证明真实重建 ~8.98s，其余 S01/S01-B/S02/S04/S05/S06 全 PASS。 |
| 结论 | S03 过去不是“观察到接收活动”，而是“观察到 Ready 后残留的旧速率”；A-R2 修复后必须改为真实 Receiving 采样（本轮已修：restore 后 ~400ms 轮询，触发=Receiving 且（rate 匹配 /KiB\/s/ 或 processedFrames 增长），sender 截图移到采样后，Ready 先到则如实 FAIL；判据文本未改）。 |
| 全仓扫描 | `git grep 'revision >|revisionBase|revisionGrew'` 仅此一处属该失效机理；S02 的 `revisionStable` 是“无数据则 revision 不变”的稳定性判据（语义正确），E2E-28/29 的 revision 仅作 null 守卫/观测字段，live-legs 的 revision 为 advisory，均未改。 |

### 11.2 主录像 A/B：终态收敛写 vs 冻结 250ms 不变式（待 lead 裁定）

- 重跑 attempt `candidate-20261026-02`（见 11.3）真实采集成功：recorded 三公式因 0 有效对不可判定，FAIL 全部来自 `E_TELEMETRY_INTERVAL` ×5（B 侧 70.6–216.7ms）。
- 逐轮 raw 复核：**每轮恰好一次 sub-250ms 间隔，且都在最后一次写**（终态收敛强制写），其余相邻写全部 ≥250ms。
- 冲突：A-R2 DoD 同时要求“终态最终指标收敛”与“保留事件/tick 共享 250ms 数字边界”；产品选择在终态跨边界强制补写一次，而 `judgeRound` 对全部相邻写取最小值。
- 旧构建该不变式能过，同样是因为旧显示层在 Ready 后不再写（不收敛）——又一处“旧绿灯骑着被修的缺陷”。
- 待裁定：工具侧按 ACTIVE 状态解释节奏（方法/阈值不动，observer 记录状态）或产品侧让终态收敛写等待共享边界后再画。

### 11.3 工具缺陷：S2 拆分遗漏的本地 import

- `measure-ux.mjs` 在 S2 拆分后只 `export { OBSERVER_SCRIPT } from './measure-ux-calc.mjs'`，未 import 本地绑定；`runRound` 真实浏览器路径抛 `OBSERVER_SCRIPT is not defined`，首跑 A/B 全轮 collectionError（attempt `candidate-20261026-01`，原件保留）。
- 既有 66 条工具测试全部走桩 `runRound`/VM 导入，未覆盖该路径——这是测试覆盖缺口，round-13 披露。
- 修复：补 `OBSERVER_SCRIPT` 到本地 import；按 09b 先例（`candidate-20261025-03`→`-04` 并存）把 context `attemptId` 提升为 `candidate-20261026-02` 后重跑，`-01` 失败原件原样保留。
## 12. B-R12-3（root 11）执行披露：live 观测容差与两次装置修复

### 12.1 live 观测间隔 1ms 容差（OBSERVATION_JITTER_MS，lead 2026-10-26 批准）

- **机制**：产品写门是 `performance.now` 域（`now − last ≥ REFRESH_MS=250` 才写数字区）；测量 observer 记录的是 DOM 变更**可观测时刻**，与投影时钟每事件有 ≤1 帧的偏移，因此**观测到的**间隔可比真实间隔小零点几毫秒。recorded 腿（同一 observer）实测 min gap 为 250.2–250.3ms，佐证这是测量通道噪声而非产品行为。
- **实现**：`measure-ux-calc.mjs` 新增独立常量 `OBSERVATION_JITTER_MS = 1`，**只**用于 `judgeLiveSide` 的 `E_LIVE_TELEMETRY_INTERVAL` 检查（阈值 250 − 1）。`FROZEN_TELEMETRY_INTERVAL_MS`、冻结方法文件、`judgeRound`（recorded 腿）**一字不动、不加容差**。
- **自测**（T-R12-A3f）：观测 249.9ms 通过；观测 240ms 仍拒绝；且 `judgeRound` 在 249.9ms 下仍判 `E_TELEMETRY_INTERVAL`（recorded 侧无容差）。工具测试 66→67 全绿。
- **触发实例**：root 11 实时腿第一次运行 pair-2-B 观测 249.9ms 被判 INVALID；容差落地后的正式重跑中**没有任何侧别**贴近边界（无需动用容差即 10/10 VALID）。

### 12.2 实时腿停止取证的采样竞态修复（lead 批准，E2E-32-S02-B 同型）

- 第一次运行 pair-1-B `E_LIVE_CLOCK_NOT_FROZEN`：真实停止后，终态收敛写在共享 250ms 边界内才落笔（Option B 的正确行为），frozenA 采样抢在收敛写之前 → 误判。
- 修复：`live-legs.mjs` 冻结取证改为**有界等待两次相邻探针一致**后再取 frozenA（≤5s，400ms 间隔），判据（frozenA/frozenB elapsed 相同）不变。重跑后无任何 `E_LIVE_CLOCK_NOT_FROZEN`。

### 12.3 失败原件保留（live-failed-run-1/）

第一次实时腿运行 5/10 侧的原始记录（pair-1-A…pair-3-A）逐字节保存在
`docs/tests/runs/20261026-teamexec-11/measurements/ux-overhead/candidate-20261026-01/live-failed-run-1/`，
附 README 说明三项原因（12.1 容差、12.2 竞态、接收页 python http.server `ConnectionAbortedError` 瞬态崩溃 + 残留 Edge 占用 9445 导致中止）。`live/` 按批准的方案 (a) 删除后同 attempt 重跑；recorded A/B 的 PASS 不受影响。

### 12.4 E2E-32-S02-B 采样竞态修复（UX-MEDIA-SAVE 首跑 exit1 的原因）

- 我在 id 规范化批次新增的 `E2E-32-S02-B`（EOF 后用时冻结/速率不再虚增）在 Incomplete 出现瞬间采样，抢在终态收敛写之前（同 12.2 机理）→ 首跑误判 FAIL。
- 修复：有界等待两次相邻探针一致后再取冻结对；判据文本与条件不变。重试 PASS（`elapsed=13.5s->13.5s rate=-> state=Incomplete`）。

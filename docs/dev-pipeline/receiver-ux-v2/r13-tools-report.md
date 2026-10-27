# Round-13 工具侧整改报告（B-R13-2）

> 来源：`docs/dev-pipeline/ext-review/round-13-verdict.md` **A13-01 / B-R1(a) / B-R1(b)**，S2（真实入口负例）。
> 整改基线 HEAD=`a292900`（分支 `receiver-ux-v2`，工作区干净起步）。本轮**未执行任何 git add/commit**（lead 独占提交）。
> 产品/冻结方法/cases/旧证据零改动；root11（`docs/tests/runs/20261026-teamexec-11/`）全程只读，
> 全部负例在 OS 临时目录的完整副本上构造（用后即删）。原始日志：`docs/dev-pipeline/receiver-ux-v2/red-logs/r13-tools/`。

## 0. 结果摘要

| 项 | 结论 |
|---|---|
| A13-01 CLI 绑定实参 | 已修复（RED→GREEN；真实 CLI 负例 ×5、正例 ×2） |
| B-R1(a) 外层验收 PASS | 已修复（一致 FAIL / 一致 NOT_RUN 均被真实验证链拒绝） |
| B-R1(b) RTT 原始起止重算/核对 | 已修复（rtt=0、settled<t0 均被真实 CLI 拒绝） |
| S2 真实入口 | 9 条新负例全部经真实 `measure-ux-calc.mjs --recompute … --context` 或真实 `validate_ux_record` 执行 |

修复后全绿：`ux-evidence-selftest.py` **77/77**、node 工具三套件 **69/69**（含新增 2 条 RTT 单测）、
`verify-evidence-selftest.py` **14/14**、`run-unit --all` **216/216**（0 failed/todo/skipped）；
root11 真实 gate `exit1` 恰 4 条（E2E-35/37 各 2 条 NOT_RUN 披露项），**无新增违规**。

## 1. A13-01 — CLI 丢绑定实参

### 1.1 RED 原文（`red-selftest.txt`，修复前实测）

```
FAIL A13-01 product tamper is refused by the real CLI (names E_BUILD_BINDING)
exit=0 codes=[]
...
FAIL A13-01 candidate-missing tamper is refused by the real CLI (names E_BUILD_BINDING)
exit=0 codes=[]
...
FAIL A13-01 input tamper is refused by the real CLI (names E_INPUT_BINDING)
exit=0 codes=[]
...
FAIL A13-01 media tamper is refused by the real CLI (names E_INPUT_BINDING)
exit=0 codes=[]
...
FAIL A13-01 live tamper is refused by the real CLI (names E_LIVE_INPUT_BINDING)
exit=0 codes=[]
...
SELFTEST FAIL (9 of 77 cases)
```

### 1.2 改动（`tools/desktop-recv/e2e/measure-ux-calc.mjs`）

1. CLI 调用点改为 `recomputeMeasurement({ measurementDir: target, methodBytes, method }, expected)`
   —— 第二实参真正传入（旧代码把 `expected` 嵌在首参里被忽略，第二实参恒默认 `{}`）。
2. `contextExpectations()` 重写：必填身份必须**实际取得**，否则按 `E_CONTEXT_BINDING` 逐项违规点名——
   productManifestSha256：按 context 声明的 productManifest 路径**磁盘重哈希**，与 context 值自校验，
   一致才取 context 值作为 expected；inputSha256 / mediaSha256 / liveInputSha256 从实读的
   input-manifest.json 取 `primaryInput.sha256` / `media.withSha256` / `liveInput.sha256`，且必须 64 位小写 hex；
   input manifest 文件本身也按 context 的 `inputManifestSha256` 磁盘重哈希自校验。
   context 未绑定 manifest、manifest 文件缺失、磁盘哈希与 context 不符、任一必填身份缺失 → 违规，不产出空 expected。
3. `recomputeMeasurement` 产品绑定分支：expected 给出 productManifestSha256 而 run.json 无 candidate（或字段缺失）时
   push `E_BUILD_BINDING`（"缺 candidate 不得跳过绑定"）；mismatch 依旧 `E_BUILD_BINDING`。
4. `stats.roundViolations`（纯增量诊断字段）：CLI stats 每个 measurement 条目附轮级判题违规列表，
   使拒绝能点名具体轮/帧矛盾；`ok` 语义未变（= 申明与重算一致）。

### 1.3 GREEN — 真实 CLI 退出码表（--context 一律为真实 root11 context）

| # | 场景（root11 完整副本→OS 临时目录，除注明外） | 修复前 | 修复后 | 违规点名（真实输出） |
|---|---|---|---|---|
| 0 | root11 原根正例（带/不带 --context） | 0 | 0 | 无（`ok:true, violations:[]`） |
| 0' | 无篡改临时副本 + --context | 0 | 0 | 无 |
| 1 | run.json.candidate.productManifestSha256 → 64×f | 0 | **1** | `E_BUILD_BINDING: run.json candidate product manifest does not match the current run context` |
| 2 | run.json 删除整个 candidate | 0 | **1** | `E_BUILD_BINDING: run.json carries no candidate product manifest identity; …` |
| 3 | input.json.inputSha256 → 64×f（12 个轮文件 inputSha256 同步） | 0 | **1** | `E_INPUT_BINDING: input.json inputSha256 does not match the current input manifest` |
| 4 | input.json.mediaSha256 → 64×f（12 个轮文件 mediaSha256 同步） | 0 | **1** | `E_INPUT_BINDING: input.json mediaSha256 does not match the current input manifest` |
| 5 | live/summary.json.liveInputSha256 → 64×e | 0 | **1** | `E_LIVE_INPUT_BINDING: live/summary.json liveInputSha256 does not match the current input manifest liveInput` |

（input/media 篡改必须连同 12 个轮文件的对应字段同步，否则旧实现也会因轮级 E_INPUT_SHA 拒绝，
负例就无法证明"绑定检查"本身在工作；同法保证 RED 阶段 exit0 现象只归因于丢失的 expected 实参。）

## 2. B-R1(a) — 外层必须要求验收 PASS

### 2.1 修复

- 计算器 `ok`=计算成功语义**保留未改**：自洽 FAIL 时 CLI 依旧 exit0/`ok:true`，拒绝发生在外层门禁。
- `verify-ux-evidence.py` measurement 验收追加 `check_recomputed_stats` / `check_recomputed_live`：
  解析 CLI payload.stats，要求每份 `measurements[].verdict === 'PASS'`、`validPairs === 5`，
  live 重算 `verdict === 'PASS'`、`sidesValid.A/B === 5`、`sides` 恰 10 条且每条 `valid === true`
  （按 recomputeLiveDir 实际 stats 形状实现；缺字段即违规，不得静默通过）。
- CLI recompute 拒绝（exit≠0）时短路返回，不再继续读 stats。

### 2.2 RED 原文（`red-selftest.txt`）

```
FAIL a self-consistent NOT_RUN measurement is refused by the UX gate
exit=0 expected=1
stdout:
UX GATE local: PASS

FAIL B-R1(a) consistent FAIL is refused by the real validate_ux_record
violations:
（violations 为空 → 当前实现把一致 FAIL 当 PASS 背书）
```

### 2.3 GREEN

一致 FAIL（root11 副本：B 侧 5 轮 journey.readyAt/readyMs 同步 +60000ms，summary/comparison/run
全部同步改成自洽 FAIL；重算 Ready 中位 75060ms vs 限 17528.8ms）经真实 `validate_ux_record`：

```
== consistent FAIL: real validate_ux_record violations ==
  - E2E-38: recomputed measurement[0] verdict is 'FAIL'; the gate requires the recomputed measurement verdict PASS
```

一致 NOT_RUN（fixture pair-5-B 加 collectionError，4 个有效对、全部指标仍 pass，claims 全同步）经真实 gate：

```
UX GATE local: FAIL (2 violation(s))
  - E2E-38: recomputed measurement[0] verdict is 'NOT_RUN'; the gate requires the recomputed measurement verdict PASS
  - E2E-38: recomputed measurement[0] validPairs is 4; five valid recorded pairs are required
```

自测断言（`green-selftest.txt`）：
```
ok   a self-consistent NOT_RUN measurement is refused by the UX gate
```

### 2.4 中间失败原件

一致 FAIL / 一致 NOT_RUN 的中间失败构造是**自洽改写**（claims 与 raw 同步改写为 FAIL/NOT_RUN），
不存在"原 summary 改绿"操作；root11 原件全程未动，fixture 中间失败原件在临时目录内随用随删。

## 3. B-R1(b) — RTT 从原始起止重算/核对

### 3.1 修复（`judgeRound`）

- 每 ok 帧 `rtt = settledAtMs − t0Ms`：两值必须有限（原 E_FRAMES 分支保留），
  `settledAtMs < t0Ms` → `E_RTT`（该帧不计入样本，轮被排除）；
- p50/p95 改用重算值（`rttSamples.push(rtt)`，不再直接取冗余 `rttMs`）；
- 冗余 `rttMs` 与重算值**严格相等**（`!==`），不等 → `E_RTT_MISMATCH`，detail 带 seq 与两值。

### 3.2 RED 原文（`red-selftest.txt`）

```
FAIL B-R1(b) self-consistent rttMs=0 (raw timestamps unchanged) is refused
exit=0 codes=[]
...
FAIL B-R1(b) settledAtMs < t0Ms is refused by the real CLI
exit=0 codes=[]
```

### 3.3 GREEN

rtt=0（复制 pair-1-B，全部 ok 帧 rttMs→0 且起止不动，claims 同步自洽重写为 0）
经真实 CLI：**exit=1**，顶层违规为 TAMPERED/VERDICT_MISMATCH（claims 说 0、重算回到真实值），
`stats.roundViolations` 点名 `E_RTT_MISMATCH`（104 条，每帧一条，detail 带 seq 与两值），
derived verdict NOT_RUN / validPairs 4。

settled<t0（复制 pair-1-B，仅首个 ok 帧 settledAtMs = t0Ms−1，claims 不动）经真实 CLI：

```
== settled<t0: real CLI exit=1 ==
  stats.roundViolations codes: {'E_RTT': 1}
  stats.verdict: NOT_RUN
  stats.validPairs: 4
```

root11 正例不回归：其 rttMs 与起止逐帧一致，重算后零违规（见 §5 正例行）。

## 4. S2 — 真实入口

9 条新负例全部经真实入口：
- 5 条绑定篡改 + 2 条 RTT 矛盾 → 真实 `measure-ux-calc.mjs --recompute <tempRunRoot> <copy>`
  `--method <frozen method> --context <真实 root11 context>`（subprocess）；
- 一致 FAIL → 真实 `validate_ux_record`（importlib 加载真实 `verify-ux-evidence.py` 模块，
  其内部真实 subprocess 调用 CLI）；一致 NOT_RUN → 真实 `verify-ux-evidence.py --gate local` 全链路 CLI。
- 不以 helper 单测或测试总数增长替代关闭；helper 级单测（T-R13-B1b ×2）只作语义补充，
  关闭证据以真实入口负例为准。

## 5. 验证命令与真实输出（全部实际执行）

| 命令 | exit | 结果 |
|---|---|---|
| `python tools/desktop-recv/tests/ux-evidence-selftest.py` | 0 | 77/77（含 round-13 新增 9 负例 + 2 正例 + NOT_RUN 门禁例） |
| `node --test tools/desktop-recv/tests/measure-ux.test.mjs tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/process-guard.test.mjs` | 0 | 69/69（含 T-R13-B1b ×2） |
| `python tools/desktop-recv/verify-evidence-selftest.py` | 0 | 14/14 |
| `node tools/desktop-recv/run-unit.mjs --all` | 0 | 12 套 216 例，0 failed/todo/skipped |
| `python tools/desktop-recv/verify-ux-evidence.py --context docs/tests/runs/20261026-teamexec-11/run-context.json --gate local` | 1 | 恰 4 条（E2E-35/37 result NOT_RUN + executedBy null），无新增 |

日志文件：`red-selftest.txt`（RED）、`green-selftest.txt`、`green-node-tests.txt`、
`green-verify-evidence-selftest.txt`、`green-run-unit-all.txt`、`green-root11-gate.txt`、`green-probe-examples.txt`。

## 6. 临时目录负例清单（S2 留痕）

| 负例 | 构造（全部在 OS 临时目录） | 入口 |
|---|---|---|
| product 绑定 | root11 测量副本 run.json candidate SHA→64×f | 真实 CLI + 真实 context |
| candidate 缺失 | run.json 删除 candidate | 同上 |
| input 绑定 | input.json + 12 轮 inputSha256 → 64×f | 同上 |
| media 绑定 | input.json + 12 轮 mediaSha256 → 64×f | 同上 |
| live 绑定 | live/summary.json liveInputSha256 → 64×e | 同上 |
| rtt=0 | pair-1-B 全 ok 帧 rttMs→0（起止不动）+ claims 同步自洽 | 同上 |
| settled<t0 | pair-1-B 首个 ok 帧 settledAtMs=t0Ms−1（claims 不动） | 同上 |
| 一致 FAIL | root11 测量+证明副本：B 侧 5 轮 +60000ms，claims 全同步（75060>17528.8） | 真实 validate_ux_record |
| 一致 NOT_RUN | fixture pair-5-B collectionError + claims 全同步 | 真实 UX gate 全链路 |

## 7. 边界与诚实遗留

- 未改产品/冻结方法/cases/旧证据；root11 只读；未 commit。
- root11 gate exit1 的 4 条是上轮已披露的 E2E-35/37 NOT_RUN 披露缺口（用户既有决定），不是本轮引入，也不由本轮关闭。
- **语义保留声明**：recompute CLI 对自洽 FAIL/NOT_RUN 依旧 exit0/`ok:true`（"成功算出 FAIL"语义按裁决保留）；
  拒绝发生在 `validate_ux_record`→`verify-ux-evidence.py` 外层门禁。`stats.roundViolations` 为纯增量诊断字段。
- 诚实说明：B-R1(b) 的 rtt=0 负例若把 claims 也完全自洽改写成 NOT_RUN，CLI 层不再单独因 RTT 矛盾 exit≠0
  （round 级违规按设计留在轮内、只改 derived verdict；`stats.roundViolations` 仍会点名 E_RTT_MISMATCH，
  外层门禁因 verdict≠PASS 拒绝）。本 DoD 负例（claims 保持真实 PASS）下 CLI exit≠0 且 roundViolations 点名，
  满足"经真实 CLI 必须非 0"。

## 8. Round-12 终局复验（root12）追加披露 — S04 收敛写时序观察

> 背景见 round-13 verdict A13-02 整改构建（root12，product manifest 829d7dec…）的全量复验。
> 本节为 lead 指定的如实披露素材（round-14）；仅观察，未改产品，工具侧修复经 lead 明确授权。

### 8.1 观察事实（E2E-27 两份失败 attempt，其余断言全 PASS，仅 S04 FAIL）

- 两 attempt（`E2E-27-2026-10-26T18-35-45-440Z-3aa221`、`E2E-27-2026-10-26T18-41-15-851Z-f08508`）
  的 S04 observed 完全同型：`elapsed=8.9s->9.0s`（相隔 1.2s 的两个冻结探针不相等）。
- freezeB 后立即抓取的 `s04-ready.png` 显示**已完全收敛的终态**（"重建完成 9.0s"，无速率、无百分比、无降级残留）
  → 时钟确实冻结，不是时钟继续走；是 A-R2 Option-B 的终态收敛写落在两探针之间
  （freezeA 读到收敛前 8.9s，freezeB 读到收敛后 9.0s，其后 timer 释放）。
- root11 同案同探针 PASS（`8.9s->8.9s`，收敛写落在探针前）。

### 8.2 晚到观察（round-14 披露素材）

- **收敛写落点：两次探针之间（设计 ≤250ms；确切延迟未精确测定）**：两探针（间隔 1.2s）只证明该收敛写
  发生在 freezeA 与 freezeB 之间，**不能据此给出精确下界**；疑似调度/推迟定时器路径（≤250ms 的 timer 晚点；
  从外部日志无法定论，未改码，仅观察）。另有一次**直接实测**：E2E-36 attempt 88532b 的收敛写在 Ready 后
  约 139ms 落地（ready-longname → save-focus 两张截图时差），不与该观察冲突。
- **冻结硬不变式不受影响**：写间隔 ≥250ms 仍成立（收敛写本身过共享边界），终态后 timer=0 仍成立
  （freezeB 后截图已完全收敛）；晚到只影响**采样时序**，不影响冻结语义。

### 8.3 工具侧修复（lead 裁定 (b)，先例同型）

- S04 冻结探针改为既有先例模式（`E2E-32-S02-B`、live-legs 停止取证同型）：
  有界等待（≤5s、400ms 间隔）两次相邻探针（elapsed+rate）一致后再取冻结对（+1.5s 后 freezeB），
  判据不变（两次一致值即终值，仍要求 freezeA==freezeB，未放宽为"允许变化"）。
  `node --check` 通过；该断言无独立单测，行为由后续真实 E2E-27 验证。

## 9. E2E-36 取证增强与收敛窗口观察（root12 收口追加）

### 9.1 验收发现（旧 attempt，round-14 披露素材）

- root12 first UX-UI attempt（`UX-UI-2026-10-26T19-16-56-031Z-88532b`）的
  `s36-s03-ready-longname.png`（03:17:36.366）摄于收敛窗口内：显示「重建估计约 99% / 63.7 KiB/s」；
  同 attempt 下一张 `s36-s03-save-focus.png`（+139ms）已显示完全收敛终态「重建完成 / 22.9s」。
- **收敛写本次实测 +139ms 落地（设计 ≤250ms 框内）**：收敛确实发生，且落在设计窗口内；
  旧截图仅存在"截图时序 vs 设计窗口"的复读误判风险，不是产品缺陷。
- **冻结硬不变式不受影响**：写间隔 ≥250ms 与终态后 timer=0 仍成立（收敛写本身过共享边界）；
  晚到/窗口内截图只影响采样时序。

### 9.2 取证增强（判据与断言零改动）

- `ui-journeys.mjs` E2E-36 新增 `settleTerminalMetrics(page)`（有界 ≤5s、400ms 间隔，等待两次相邻探针
  在 elapsed+rate 上一致，同 E2E-32-S02-B / S04 先例），并在该案终态指标截图前调用
  （s36-s03-ready-longname、s36-s03-cancelled、s36-s03-saved、s36-s04-saved）。
- 重跑 E2E-36 solo（同根新 attempt `E2E-36-2026-10-26T19-48-21-341Z-474c28`，旧 attempt 原样保留）：
  新 `s36-s03-ready-longname.png` 与 `s36-s03-save-focus.png` 均显示完全收敛终态
  「重建完成 / 22.9s」、无百分比、无速率、无降级残留。`node --check` 通过。

# 阶段5（team-exec）开发总结 — 桌面接收端

记录日期：2026-10-21；round-3 整改刷新：2026-10-22。基线：分支 `screen-capture-recv`，HEAD `cb43f859adb6e6c6df234dd298ac5bd02e090d78`（`cb43f85`）——本文全部完成主张钉死到该提交（run-03 证据基线）；本文刷新已以纯文档提交 `75d5004` 落盘（不含代码/证据字节改动）。
本文与 `autonomous-decisions.md` 最初回应外部审查 Round 1（`docs/dev-pipeline/ext-review/round-1-verdict.md`）A-01 的文档补充要求；round-3 verdict（`round-3-verdict.md`，对应 Round-2 送审包）⑰ 判明本文原稿的完成主张超出证据（T4.2.a、资源全部出口收敛、完整本地验收），本版按 run `20261021-teamexec-03` 的记录字段逐条刷新；文中提交哈希、文件路径与数字均可在本仓库核验。

## 1 概述

阶段5（团队实施与验证）交付 `web/desktop-recv` 独立回环浏览器接收端：双输入（实时抓屏 + 录像导入）、每会话新建 classic Worker/WASM、单在途帧调度、EOF 排空、显式保存与重试；复用原 C++ 解码核心，正常 ABI/发送协议不改。实施按批次 A→G（20 项基础任务 T1.1.a..T5.2.a）推进，经 6 轮内部审查后于 `0c0f27a` 收官。

外审 round 1（固定范围 `bfb0c8e..d61fa74`）判 FAIL（7 个独立主题），批次 H/I/J/K/L/M 整改并经内审 round-7/8 复核后送审 round 2；round-3 verdict（2026-10-21，reviewer `codex-gpt-6`，双轴 + 主审）再判 FAIL：3 个独立 Blocking 主题（A-R1〔与 B-R1 重叠〕、A-R2、A-R3）+ S-1..S-3 建议。流水线回归 team-exec，经阶段 6.5（triage + 任务分解 + 整改）后以 run `20261021-teamexec-03` 全量复跑本地旅程（主题→提交/证据映射见 §4.2）。

当前状态（截至 2026-10-22，基线 `cb43f85`）：

- 阶段5实施与两轮外审整改完成：round-1 整改（批次 H/I/J/K/L/M）；round-3 整改提交链 `f70d324`→`c211907`→`cb43f85`（整改代码与装置 → 车道装置增补与 triage 决策 5/6 → run-03 全量证据）。
- 真实本地 E2E（当前权威记录）：run `20261021-teamexec-03` 的 20 条本地旅程全部执行且 `result=PASS`（每条 `executedBy=executor`、`scope=local_simulated`、独立 `attemptId`）；其中 E2E-18 为矩阵判 PASS——10 条计划腿中 9 条可执行腿全部 PASS，唯一 NOT_RUN 腿带用户核准的代码级依据（见 §5）。run-02 原始证据保留为历史，不再支撑当前完成主张。
- 量测：run-03 `measurements.json` / `measurement-report.md` 交付 18 腿（17 PASS + 1 NOT_RUN 带依据）/ 14 组实测（尺寸、四类时间边界、耗时、哈希）；性能 NOT_EVALUATED（阈值未冻结，V-002/V-003 待确认）。
- 门禁（2026-10-22 于 `cb43f85` 工作树复跑核实）：单元 9 套件 108 测试全绿；门禁自测 14/14；资产校验 PASS（staging 如实声明绑定 `a515922d…` 构建树）；本地证据门禁 PASS（20 required cases）；field 门禁 FAIL（6 violations：E2E-21..26 缺记录）为设计内正确拒绝。C++/WASM 字节未变，native 9/9 沿用外审 round-1 实跑历史证据（范围声明见 §6）。
- 用户现场旅程 E2E-21..26 仍 NOT_RUN（用户执行）；E2E-20 最终打包留阶段 8；下一送审轮为 round-4。

## 2 实施范围与提交索引

### 2.1 批次与提交

| 批次 | 范围 | 提交 | 主题 |
|---|---|---|---|
| A | T1.1.a..T1.2.c | `26f710a`、`598a34f`、`513526f`、`a468e52`、`117a9af` | 环境盘点、配对发送端、严格 EOF 适配、资产装配、隔离 Worker |
| A 整改 | 内审 round 1-2 | `971c0c2`、`edd4d0f` | 资产摘要校验（B1）、时间戳来源（B2）、W1/W2/W4/W6/W7/W8 与 S2/S3/S4/S5（见 `review-round-1.md`） |
| B | T2.1.a..T2.1.c | `1ad18b3`、`89468d8`、`5d4c5a1` | 独立入口、实时帧单会话、显式保存往返 |
| B 整改 | 内审 round 3-4 | `80ecb9f`、`cedd603`、`d27422d` | B-1 诚实登记（TD-12）、TD-13 映射层接线 |
| C–G | T2.2.a..T5.2.a | `1aecee3`、`f22b0d2`、`aa065eb`、`12e78fd`、`d86611a`、`a515922`、`5233062` | 停止/晚授权/恢复、录像与有限 EOF、保存重试与停止结算、证据工具与首轮记录、测量与支持矩阵、候选包与现场手册 |
| 收官整改 | 内审 round 5-6 | `7a05665`、`9a5e697`、`4ff7823`、`0d04c80`、`0c0f27a` | 证据词汇冻结对齐、技债登记修订、round 6 APPROVE |
| 外审 round 1 | 阶段6 | `d61fa74`、`3d66cc2` | 外审包生成；verdict（FAIL）归档并回归 team-exec |
| H | 外审 A-02/A-03/C-02 | `558dee9` | Incomplete 可重启收敛、worker 故障全出口结算、主线程 init/frame 看门狗（TD-01）、取消释放客户端（C-02） |
| I | 外审 B-S04 | `b16004a` | 录像 seek 有界收敛 + 最终尾帧补采 |
| J | 外审 A-04 | `95c54b6` | 证据门禁改为验证工作而非记录形状（Python/JS 双端 + 负例自测） |
| K | 外审 C-01 | `aa31eed` | 启动器参数保真 + 服务监听确认 |
| L | 真实 E2E（A-01 旅程） | `16e2fa6`、`128a175`、`eb80706`、`648dacb`、`16c367d`、`468428c`、`543e59e`、`435d517`、`08c49e9`、`073feae`、`16d7b5b`、`bb878ab`、`8c59864`、`b576d48`、`247b68c` | 真实桌面 E2E harness、20 条本地旅程证据、产品缺陷修复（见 2.2）、TD-15 修复、E2E-1 复验与归因撤回 |
| M | 外审 A-01 文档项 | （本批，未提交） | `stage5-dev-summary.md`、`autonomous-decisions.md`、`tech-debt.md`（TD-01/TD-12 关闭）、`pipeline-state.json` |

### 2.2 真实 E2E 发现的产品缺陷（单元测试不可见）

| 提交 | 缺陷 | 症状 |
|---|---|---|
| `468428c` | SaveController 保存了未绑定的全局 `setTimeout`（"Illegal invocation"） | 每次真实保存都失败并报 16003 |
| `648dacb` | 录像导入期间预览元素被隐藏，逐帧回调不触发 | 录像导入停滞 |
| `16c367d` | 实时轮次后导入录像仍保留旧 `MediaStream`（`srcObject` 未替换） | 假 13005 失败 |

另：`eb80706` 将录像导入由 1/15 s 时间步进改为 `requestVideoFrameCallback` 逐帧解码（TD-15），详见 `autonomous-decisions.md` D-07/D-08。

### 2.3 范围统计

- 外审固定范围：`bfb0c8e..d61fa74`，35 提交、157 文件、+22,801/-9（verdict 实测）。
- 整改增量：`d61fa74..247b68c`，20 提交（批次 H/I/J/K/L 与 verdict 归档）。
- 阶段5起点基线 `84e7a1a`；`master..HEAD` 共 55 提交（含可行性分析与规划阶段提交）。
- 基线更新（2026-10-22，TD2 刷新时点）：`master..HEAD` 为 62 提交（截至本文档提交 `75d5004`；较上表口径新增：round-7/8 整改与文档 `80c92dd`/`ce4051c`、round-2 送审包 `a058fcd`、round-3 整改链 `f70d324`/`c211907`/`cb43f85` 及本文档提交）；批次 M 已随 `80c92dd` 提交，不再是“未提交”状态。

## 3 20 项基础任务对照表

| 任务 | 提交 | 验证方式（可核验） |
|---|---|---|
| T1.1.a 环境与证据盘点 | `26f710a` | CMD-01 生成真实 `environment.json`；未运行能力保持 NOT_RUN/null |
| T1.1.b 配对候选与原发送窗口 | `598a34f` | 干净构建副本 CMD-03 构建 + 原发送 B=68 烟测；`baseline.md` 记录命令与产物 |
| T1.2.a 严格 EOF 最小适配 | `513526f` | CMD-02 native ctest（compression/cimbar_js 严格 EOF 用例，UT-049..054）；外审 round 1 复跑 9/9 |
| T1.2.b 最终 WASM 资产与旧发送兼容 | `a468e52` | CMD-04 stage + `verify-assets.mjs` PASS（摘要/路径/严格 EOF 证据绑定，见 §6） |
| T1.2.c 新会话 Worker 与真实字节 | `117a9af` | CMD-05 worker/contracts 套件 + 浏览器 IAT-01/02 真 WASM 字节往返（VM 结果仅算 unit_integration） |
| T2.1.a 独立入口、回环启动与能力 | `1ad18b3` | ui 套件 + E2E-1/2 真实启动（占用端口 exit 3、中文/空格目录启动） |
| T2.1.b 实时帧与单会话垂直流程 | `89468d8` | session/scheduler 套件 + E2E-3 实时往返（2 类 × 3 轮，外部 SHA-256 相等） |
| T2.1.c 首条真实保存往返 | `5d4c5a1` | save 套件 + E2E-3/11/12/13 真实系统保存对话框与外部哈希 |
| T2.2.a 停止、去重、晚授权清理 | `f22b0d2` | session 套件 + E2E-4/6/7/17/19 停止/晚回调真实旅程 |
| T2.2.b 失败可恢复与无数据提示 | `aa065eb` | ui/contracts 套件 + E2E-5/8/15 恢复旅程 |
| T3.1.a 真实录像选择与受控处理 | `12e78fd` | video 套件 + E2E-14 真实发送窗口录像 6 轮、E2E-15 坏输入有限失败 |
| T3.1.b 最终帧与有限 EOF 屏障 | `12e78fd`（B-S04 整改 `b16004a`） | video/scheduler 套件 + E2E-16 V-SHORT/V-LAST 对照（128 KiB 难压缩载荷） |
| T3.2.a 保存取消与失败重试 | `d86611a` | save 套件 + E2E-11 取消后同产物重试 |
| T3.2.b pending 写入及停止结算 | `d86611a` | save/lifecycle 套件 + E2E-13 模态与停止结算 |
| T4.1.a 样本与证据记录工具 | `a515922`（加固 `95c54b6`） | evidence 套件 + `create-fixtures.py` + CMD-09 门禁负例自测（`verify-evidence-selftest.py`） |
| T4.1.b 实际本地完整 E2E | `a515922`（首轮记录）；批次 L `16e2fa6..247b68c`（run-02）；round-3 `f70d324..cb43f85`（run-03 全量复跑） | run `20261021-teamexec-03` 的 E2E-1..20 全部执行且 PASS（每条独立 attemptId，见 §5）；run-02 证据保留为历史 |
| T4.2.a 容量性能量测和 profile 校准 | run-03 实测（`cb43f85`；量测钩子 `f70d324`） | run-03 `measurements.json` + `measurement-report.md`：18 腿/14 组（1MiB/4MiB 双类实时、128KiB/1MiB/4MiB 录像、20MiB 超预算、E2E-15/16 判据腿），逐腿尺寸/时间边界/耗时/哈希；性能 NOT_EVALUATED（阈值未冻结）。**修正记录**：round-2 送审时本项曾过早登记完成（verdict A-R2），现由 run-03 实测支撑 |
| T4.2.b 发布支持矩阵 | `a515922`（run-01 快照）；TD2 补历史快照声明（2026-10-22） | `support-matrix.md` 为 2026-10-18 历史快照（已加声明，历史行未改）；当前支持证据以 run-03 `results.json`/`proof/` 为准（E2E-8/9/14 对应组合在 run-03 复测） |
| T5.1.a 候选包和正常操作说明 | `5233062` | staging candidate 装配（CMD-04）+ E2E-1 中文/空格目录真实启动往返 |
| T5.2.a 用户现场步骤与空回执 | `5233062` | `field-guide.md` + `field-receipt.json` 空回执；field 门禁对空回执 FAIL（§6） |

24 任务中的其余 4 项：T5.1.b（内审部分完成；round-2 已送审并被 round-3 verdict 退回整改，下一送审轮 round-4）、T5.1.c（阶段8 最终交付包）、T5.2.b（用户云桌面现场，NOT_RUN）、T5.2.c（条件激活，未触发）。后四项按计划不纳入阶段5编码完成条件（实施计划"24个原Task编号不变"节）。

## 4 内审 6 轮与整改进程

| 轮次 | 范围 | 裁决 | 处置 |
|---|---|---|---|
| Round 1 | `26f710a..117a9af`（批次 A） | REQUEST CHANGES（2 Blocking） | B1 资产运行时摘要校验、B2 时间戳预填 → `971c0c2`、`edd4d0f` |
| Round 2 | 整改提交 | APPROVE（0 Blocking） | B1/B2 关闭；残留 W/S 登记 TD-01..TD-11 |
| Round 3 | `1ad18b3..de78871` + `cedd603`（批次 B） | REQUEST CHANGES（1 Blocking） | B-1：批次 B 记为 complete 但定义性真实验证缺席 → 状态改"代码完成、UAT 推迟"，登记 TD-12（硬性窗口=批次 F T4.1.b 前） |
| Round 4 | `80ecb9f` | APPROVE（0 Blocking，以 TD-12 为条件） | B-1 关闭；残留并入 round 5 |
| Round 5 | `1aecee3..5233062`（批次 C–G） | REQUEST CHANGES（1 Blocking） | B-1：技债登记失真（TD-01/02/06 关闭条件指向已完成任务）→ `7a05665` 诚实修订 |
| Round 6 | `7a05665` 等整改 | APPROVE（0 Blocking） | 阶段5实施完成成立；明示三项交付前硬门禁：TD-01 关闭、TD-12 补跑、E2E-21..26 现场与外审按计划 |

归档文件：`docs/dev-pipeline/review-round-1.md` … `review-round-6.md`。

### 4.1 外审 round 1 与整改映射

外审（2026-10-19，reviewer `codex-gpt-6`，规格轴 + 标准轴 + 主审实证）判 FAIL，7 个独立 Blocking 主题及整改：

| 主题 | 内容 | 整改提交 | 复验证据 |
|---|---|---|---|
| A-01 | 18 条本地旅程未执行却登记完成；缺开发总结与决策索引 | 批次 L（真实 E2E）+ 批次 M（本文档） | §5、§6；`autonomous-decisions.md` |
| A-02 / B-S02 | Incomplete 后按钮可点但协调器永久拒绝新会话 | `558dee9` | session 套件扩展；E2E-4/5/7/19 |
| A-03 / B-S03 | Worker 故障不结算初始化；无有效帧看门狗（TD-01） | `558dee9` | `client.test.mjs` 8 例；TD-01 关闭 |
| A-04 / B-S01 | 证据门禁把 FAIL/NOT_RUN/mock 判成 PASS | `95c54b6` | `verify-evidence-selftest.py` 负例；§6 实跑 |
| B-S04 | 录像 seek 可永久挂起；EOF 漏最终关键帧 | `b16004a` | video 套件扩展；E2E-16 真实对照 |
| C-01 | 含空格/中文目录启动器返回成功但未监听 | `aa31eed` | `proof/E2E-1/launch-log.txt` |
| C-02 | 取消选源后并行初始化的 Worker 未释放 | `558dee9` | session 套件；E2E-4 |

### 4.2 外审 round 3（Round-2 送审包）整改映射

verdict `docs/dev-pipeline/ext-review/round-3-verdict.md`（2026-10-21，FAIL：A-R1/B-R1、A-R2、A-R3 三主题 + S-1..S-3 建议）；triage 三主题全部确认、pushback 空集（`remediation/round-3-triage.md`，含用户六项裁决，其中两项为车道期授权：E2E-15 corrupt 腿判据为注册码并集 {13005,13002,13003}、E2E-16 with 腿改判"在产物完成处有限收束"）；任务分解 `remediation/round-3-tasks.md`。整改与复验（证据均可指到 run-03 记录字段）：

| 主题 | 内容 | 整改落点 | 复验证据（run-03） |
|---|---|---|---|
| A-R1 / B-R1 | 协议 init-failed 不 terminate；app init 期所有权缺失；取消后未决初始化仍可新启 | `f70d324`：decoder-client 全部初始化出口收敛 `_channelFailed`（内含 terminate）；app.js 由创建者关闭 init 拒绝的 client；session/ui 以 pending + `cleanupComplete` 收敛门阻止未收敛新启 | UT-085..092（client/session/ui 套件，本轮实跑全绿）；E2E-4 真实浏览器取消（12002）→重启→往返哈希相等 |
| A-R2 | 规模/预算/实际量测未完成却登记完成（T4.2.a；E2E-18 仅 1 MiB 实时单样本） | `f70d324`+`c211907`：量测钩子（`__journey`/`__videoTimeline`/`__saveTimeline`/`__contractSnapshot` 等 pageState 可读字段）；E2E-18 腿矩阵与嵌套 measurement 透传；summarize.py 重写；`cb43f85` 实测执行 | E2E-18 十腿矩阵（§5）；`measurements.json` 18 腿/14 组；live-c-20mib-over-budget：15008 产物预算拒绝→停止→正常文件恢复（像素预算拒绝不替代）；T4.2.a 主张修正（§3） |
| A-R3 | E2E-15 旧错误日志 + Preparing 假绿；DataTransfer 绕过真实入口；V-LAST 两段独立录制无配对因果 | `f70d324`：`leg-verdict.mjs` 逐腿判据（attempt 身份 + 日志增量 + 终态 + 可重启）；E2E-15 逐腿重构与真实入口腿；E2E-16 配对时间线判据；`native-dialog.ps1` 新增 open/open-cancel；record-sender V-LAST 两段同起点（每段先 reload）协议 | UT-096（审查者回放反例：旧 13005 + 空增量 + Preparing 必 FAIL）固定于 evidence 套件；E2E-15 五腿全 PASS（入口腿为真实 #btn-video 点击 + 真实 OS 对话框；empty/text/corrupt 腿如实标注 IMPORT-PATH-ONLY）；E2E-16 配对有效性成立（T*=8.028118 s > without 时长 5.842 s），ended/最后 frameId 时间线落 proof |
| S-1 | 旅程失败/陈旧 PASS 落盘 | `c211907`：旅程启动即落 FAIL 占位（绑定 attemptId）+ 共享 finally/catch 回填 | run-03 每条记录独立 `attemptId`（20/20 可查）；门禁自测 14/14 |
| S-2 | rVFC 主路径 Stop 结算与回调异常保护 | `f70d324`：video-source 帧回调整体 try/catch（13002 结算）、stop() 主动结算挂起 run、结算时移除 ended/error 监听 | UT-093..095（video 套件）；E2E-16/18 录像腿实跑（含 600 s 长导入） |
| S-3 | 可复核交付与文档快照 | `cb43f85`：run-03 `reproduction.md`（TD1）；TD2 = 本文刷新 + run-01 支持矩阵历史快照声明 | `docs/tests/runs/20261021-teamexec-03/reproduction.md`（fixtures/媒体重建配方与哈希核对）；`docs/tests/runs/20261018-teamexec-01/support-matrix.md` 历史快照声明 |

## 5 E2E 执行汇总（当前权威：run-03）

运行目录：`docs/tests/runs/20261021-teamexec-03/`。`results.json` 共 20 条记录（E2E-1..20），全部 `result=PASS`、`executedBy=executor`、`scope=local_simulated`、`caseType=file_roundtrip`，每条带独立 `attemptId` 与 `proof/<case>/` 盘上产物（门禁从盘上文件重算 SHA-256 并要求与记录相等）。其中 **E2E-18 为矩阵判 PASS**：车道按"存在计划腿 NOT_RUN 即整案 FAIL"的保守判据先落 FAIL（`logs/E2E-18-probe-final.log` 尾行），经授权按矩阵语义升级登记为 PASS——10 条计划腿中 9 条可执行腿全部 PASS，唯一 NOT_RUN 腿 `live-n-20mib-over-budget` 为用户核准的代码级依据腿（接收端无早期产物尺寸检查：`decoder-worker.js:209` 的 `build_artifact` 仅在喷泉解码报告完整文件后于 `:334` 调用，难压缩 20 MiB 需全流传输后才被拒；像素预算拒绝不替代产物预算拒绝）；`measurements.json` / `measurement-report.md` 已于 2026-10-22 在该授权升级之后重跑 `summarize.py` 再生成（`counts` 现为 PASS 20 / FAIL 0 / NOT_RUN 0，与 `results.json` 记录级一致；腿级不变：18 腿 = 17 PASS + 1 NOT_RUN 带依据）。run-02（`20261019-teamexec-02`）原始证据保留未动，作为历史记录不再支撑当前完成主张。

逐条摘要（每条均可指到 `results.json` 对应记录的 notes/measurement 字段）：

| 旅程 | 结果 | 执行内容（记录字段摘录） |
|---|---|---|
| E2E-1 | PASS | 码点构造 CJK+空格目录打包首启动：`launch.cmd` exit=0、pwsh 绝对路径预检 exit=0；实时与 V-GOOD-C 录像导入哈希均相等（首跑失败归因已撤回：GBK 乱码孪生目录，见 TD-17） |
| E2E-2 | PASS | 占用端口启动 exit 3 且报因可读；清洁重启 + 实时往返哈希相等 |
| E2E-3 | PASS | 实时往返：可压缩 + 难压缩各 3 轮（6 轮全等；逐轮 proof 在 `proof/E2E-3/round-*`） |
| E2E-4 | PASS | 真实选源取消（12002）→可重启→往返哈希相等（A-R1/B-R1 修复后的真实浏览器验证） |
| E2E-5 | PASS | 空白窗口 7 s 观察期后复核：仍 Receiving、saveDisabled=true、无产物；停止重选恢复 |
| E2E-6 | PASS | 同名同大小 A/B：外部结束（标签页/窗口关闭）收敛 Incomplete、无幻影产物；新会话保存 B 哈希正确（Edge 共享指示条本机不可 UIA 达，偏差记录于 notes） |
| E2E-7 | PASS | 停止连点收敛一次；新会话干净 |
| E2E-8 | PASS | 4C 发送端无假 Ready；页面内翻回 B 无法恢复可解码流（180 s 帧饥饿，产品发现 TD-16）；重载发送端恢复、哈希相等 |
| E2E-9 | PASS | 默认 / 发送端 900x700+接收端渲染缩放 1.5 / 发送端 1400x950+缩放 1.0 三腿哈希相等；OS 显示缩放未覆盖（矩阵无此组合声明） |
| E2E-10 | PASS | 接收端在前往返；发送端最小化 15 s 无假 Ready（遮挡由最小化腿同一饥饿/恢复契约覆盖）；还原后保存哈希相等 |
| E2E-11 | PASS | 保存取消后同一产物重试保存成功 |
| E2E-12 | PASS | CJK/空格名：取消哨兵完好；覆盖拒绝 + 改名保存（同一对话框会话，建议名安全） |
| E2E-13 | PASS | picker 打开时保存按钮禁用防御；单次真实保存 |
| E2E-14 | PASS | 真实发送窗口录像（V-GOOD-C/N）6 轮全等（video sha256 `9956fb11e391…`） |
| E2E-15 | PASS | 逐腿判定 5/5：real-entry-cancel、empty-import、text-import、corrupt-import、real-entry-open 全 PASS；empty/text/corrupt 为导入路径证据（DataTransfer，记录标注 IMPORT-PATH-ONLY），入口腿为真实 #btn-video 点击 + 真实 OS 对话框（取消/打开）；对话框所选录像恢复往返哈希相等 |
| E2E-16 | PASS | V-SHORT（400 ms）不 Ready、无产物；V-LAST-without 真 EOF（时长 5.842 s）无产物；V-LAST-with 在产物完成处有限收束（T*=8.028118 s > 5.842 s，配对有效性成立；产物完成于第 118 帧=最后呈现帧），保存哈希相等；三段时间线落 `proof/E2E-16/timelines/` |
| E2E-17 | PASS | 双输入停止切换两腿：录像 A 中停→实时 B；实时 A 中停→录像 B（V-GOOD-C 输出哈希 `2f5a22f95c01…`）；A 内容不污染 B |
| E2E-18 | PASS（矩阵） | 10 计划腿：live-c-1mib/live-c-4mib/live-n-1mib/live-n-4mib、video-c-4mib、video-n-128kib、video-n-1mib-probe（150 s / 216,009,796 B 录像，重建 141,731 ms）、video-n-4mib（600 s / 856,230,680 B 录像，重建 566,085 ms）全部 PASS 且哈希相等；live-c-20mib-over-budget：15008 产物预算拒绝（预算 16777216，`config/profile.json`）→停止→正常文件恢复哈希相等；live-n-20mib-over-budget NOT_RUN（代码级依据，见上文）；1 MiB/4 MiB 难压缩录像导入取代 TD-15 旧上限结论，明确不作最大容量主张 |
| E2E-19 | PASS | 刷新 + 真实关页重开（旧页 isClosed 复核、新页重新加载）+ 接收服务重启：四轮往返全等 |
| E2E-20 | PASS | 10 轮交替双输入，每次输出哈希相等；最终打包部分留阶段 8 |
| E2E-21..26 | NOT_RUN | 用户云桌面现场旅程（用户执行；field 门禁按设计 FAIL） |

## 6 门禁命令与当前结果

以下除注明外均于 2026-10-22 在 HEAD `cb43f85` 的工作树上实跑（TD2 复核；`cb43f85` 即 run-03 车道证据提交，代码一致）：

| 门禁 | 命令 | 当前结果 |
|---|---|---|
| 单元 | `node tools/desktop-recv/run-unit.mjs --all` | PASS——9 套件 108 测试（contracts 7 / session 25 / scheduler 6 / worker 6 / client 11 / save 7 / video 15 / ui 7 / evidence 24），0 fail/todo/skip。注：round-3 新增的 leg-verdict 判据单测（UT-096 等）并入 evidence 套件，套件数仍为 9（任务书曾预期 9→10，以实跑为准） |
| 门禁自测 | `python tools/desktop-recv/verify-evidence-selftest.py` | PASS——14/14（含失败/未执行/错 scope/错类型/缺工件/字节不等/缺阈值等拒绝路径） |
| 资产 | `node tools/desktop-recv/verify-assets.mjs --root build-desktop-recv/staging/receiver` | PASS——assetSetId `desktop-recv-v1`，revision `a515922d2106af0cab5f350e0af469b6f4d93ca4`（staging 如实声明绑定 `a515922` 构建树，非当前 HEAD 构建）；wasmSha256 `d1080cdc…` 与 round-3 verdict 记录一致 |
| 本地证据 | `python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261021-teamexec-03 --gate local` | PASS（20 required cases），exit 0 |
| 现场证据 | 同上 `--gate field` | FAIL（6 violations：E2E-21..26 记录缺失），exit 1——设计如此：现场旅程未执行必须失败 |
| native | `ctest --test-dir /home/luctery/t12a-src/build-native --output-on-failure`（WSL） | 9/9 PASS——**历史引用**：外审 round 1 实跑；round-3 整改差异（`a058fcd..cb43f85`）经 `git diff --name-only` 核对未触碰任何 C++/WASM 源，WASM 未重建；不据此声称新构建产物或全平台重验 |

**本次复执行 vs 保留的历史证据**：

- 复执行（run-03，代码基线 `cb43f85`）：E2E-1..20 全部 20 条本地旅程（含 E2E-15 逐腿、E2E-16 配对、E2E-18 十腿矩阵）；measurements 汇总（18 腿/14 组）；单元/门禁自测/资产/本地/field 五项门禁（上表，2026-10-22 复跑）。
- 保留的历史引用（明示范围，不冒充重跑）：native ctest 9/9（外审 round-1 实跑；适用范围=其后的全部整改差异未触碰 C++ 共享源且 WASM 字节未变）；run-01 IAT/首轮证据与 run-02 全部原始证据（历史记录）；staging 资产绑定 `a515922` 构建树（声明式引用，非当前 HEAD 构建）。

## 7 遗留项

- **用户侧现场旅程 E2E-21..26**（T5.2.b）：NOT_RUN；field 门禁按设计 FAIL（6 violations）；不得由本地记录代填。
- **E2E-20 最终打包部分**留阶段 8（T5.1.c）。
- **TD-15**：已由 run-03 实测关闭——1 MiB/4 MiB 难压缩录像导入均哈希一致重建（150 s / 216,009,796 B 与 600 s / 856,230,680 B 真实录像）；历史 128 KiB 上限归因为装置投递缺陷（补齐 padding 的 base64 分块直接拼接导致截断）叠加逐帧化之前的旧采样路径，非产品录像输入上限；明确不作最大容量主张（profile 产物预算 16 MiB 不变），性能 NOT_EVALUATED。详见 `tech-debt.md` TD-15。
- **TD-16**（run-02 登记，E2E-8 产品发现）：不变——发送端页面内模式翻转离开 B 后无法恢复可解码流，恢复方式为重载发送端页面；判定协议范围外（README Notes 有载）。run-03 E2E-8 复现同一行为（180 s 帧饥饿后重载恢复、哈希相等）。
- **TD-17**（Node 22.23.1 `fs.cpSync` 在 ACP/OEM 936 主机产生 GBK 乱码孪生目录）：不变——`run-e2e.mjs` 逐项复制的规避方案继续生效；升级 Node 后复测再评估关闭。
- **TD-18**（round-3 新增登记，dev-a 复核发现）：`VideoSource._waitFor` 匿名监听器的 cleanup 移除了不同引用，每次录像导入在共享 preview 元素上累积 1 个 error 监听器；预置缺陷、非阻塞；详见 `tech-debt.md` TD-18。
- **E2E-6 字面偏差**：计划步骤的 Edge 共享指示条本机未暴露给 UIA，自动化不可达；以外部结束（标签页/窗口关闭）路径验证，偏差如实记录于 run-03 `results.json` notes。
- **外审 round 4**：下一送审轮；`pipeline-state.json` 的 `external-review.status` 仍为 `failed`，由编排方在整改收口后更新。

## 8 阶段 6.5 工件索引（round-3 整改）

- triage：`docs/dev-pipeline/remediation/round-3-triage.md`（三主题全部确认、pushback 空集、用户六项裁决，含两项车道期授权）。
- 任务分解：`docs/dev-pipeline/remediation/round-3-tasks.md`（T0/TA1..TA5/TH1..TH8/TI1/TB1/TD1/TD2，覆盖矩阵与波次）。
- 整改提交链：`f70d324`（round-3 整改代码与固定候选，commit message 自述）→ `c211907`（车道装置增补：attempt 占位、逐腿判据落地、分块传输/导入、反后台化、open 对话框入口；triage 决策 5/6）→ `cb43f85`（run-03 全量证据提交，即本总结基线）。主题→证据映射见 §4.2。
- run-03 证据：`results.json`、`measurements.json`、`measurement-report.md`、`reproduction.md`（TD1）、`proof/`、`logs/`、`fixtures-ext/manifest.json`。
- 文档快照（S-3/TD2）：本文（主张逐条对齐 run-03 记录字段、基线钉死 `cb43f85`）+ run-01 `support-matrix.md` 历史快照声明。

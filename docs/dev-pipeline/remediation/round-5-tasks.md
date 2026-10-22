# Round-5 整改任务分解（dev-pipeline 阶段 6.5 Step B，紧凑版）

- 输入：`round-5-verdict.md`（对应 Round-4 包；ext_rounds=5；下一 verdict=round-6）、`remediation/round-5-triage.md`、已批准计划 `C:\Users\admin\.claude\plans\crispy-gliding-spring.md`（W1-W6、文件级修复点、声明停点不可行项）。
- 覆盖：A-01=4 任务、A-02=6、A-03/B-S1=6（下限 2/4/3），pushback 零任务。
- 诚实守则：保存成功而时点缺失⇒腿 FAIL；声明停点失败⇒RE-RECORD（≤2 次）仍失败⇒如实 FAIL；“Ready 时停录”不可行项如实记录；性能 NOT_EVALUATED。
- 规划发现（已并入执行）：① tailEvents 已由 dev-p5 交付（app.js:266-356）；② E2E-16 重录必须**复用现有 `payload-128k-random.bin` 字节**（不重新生成），保持历史 run-03 记录 proofRefs 有效；③ E2E-17 引用 V-LAST 媒体但不重跑（proof 为副本、门禁复算副本哈希；若将来重跑须用新配对并立新 attempt）；④ `evidence.test.mjs` 为热文件，R5-D 与 R5-F 的用例追加跨波次串行（W1→W2）。

## 覆盖矩阵

| Blocking | 任务 |
|---|---|
| A-01 | R5-A、R5-G、R5-D、R5-M |
| A-02 | R5-B、R5-C、R5-E、R5-F、R5-H、R5-M |
| A-03/B-S1 | R5-B、R5-D、R5-I、R5-J、R5-M |
| S-1/S-2/S-3 | R5-N、R5-O；（S-3 由 R5-J 共享收尾+R5-I probe-bounds 归档覆盖） |

## 任务（字段：blocking / depends_on / files / 要点 / 验证 / evidence）

- **R5-00** 流程入账（triage+tasks 已落盘；pipeline-state 由编排方保管）— — / — / 文档 / 记录轮次编号 / 人工核对 / 本文件。
- **R5-A** `leg-verdict.mjs` 增 `evaluateRecoveryLeg`、`evaluateLastFramePair`（纯函数，缺钩子=显式失败）— A-01、A-02 / — / tools/desktop-recv/e2e/leg-verdict.mjs / 恢复判定：导入摄入+Ready+保存时点齐全有序+哈希相等+入口可重启；末帧配对判定：配对门禁 PASS+端段（tStarSec ≥ withDuration−2.0）+`__mediaEnded=null`+without 真 EOF 无产物+`tStarSec=lastUs/1e6`（artifactFrameId 仅帧身份） / `run-unit --suite evidence` exit0 / diff+套件输出。
- **R5-B** 新 `leg-timings.mjs`（分解边界：decoderInitMs/sourceWaitMs/initMs/reconstructMs/totalToReadyMs/pickerWaitMs/writableOpenMs/saveWaitMs/saveWriteMs/saveMs + `assertSaveTimingsComplete`）；新 `video-prefix-check.py`（cv2；头 30 帧对齐区域比较+尾部对应；`--selftest` MJPG 正/负例）；`recorder.html` 增 `__startPairRecording({withMs,withoutCutMs})`（一次 getDisplayMedia、双 MediaRecorder 同任务启动、声明停点、4MiB 分片交接，不动既有 `__startRecording`）— A-02、A-03/B-S1 / — / 三个文件 / 边界定义入模块头注释；恒等式 saveMs=saveWaitMs+saveWriteMs、saveWaitMs=pickerWaitMs+writableOpenMs / `python video-prefix-check.py --selftest` exit0 / diff+selftest 输出。
- **R5-C**（已完成）`app.js` 有界 tailEvents（result/ended/finalSample，cap 16，Date.now 时钟；仅诊断）— A-02 / — / web/desktop-recv/src/app.js / 无行为变更；staging 需重装配（R5-L）/ 单元 108 绿（已验）/ diff + E2E-16 timeline 消费（R5-H）。
- **R5-D** `evidence.test.mjs` UT-104+：恢复判定正/负例、配对元数据负例、计时分解/缺失/乱序/恒等式、端段边界（D−2.0 过、D−2.01 不过）— A-01/A-02/A-03 / R5-A、R5-B / 同文件（W1→W2 串行）/ 常驻回归 / `--suite evidence` exit0 / 用例输出。
- **R5-E** `record-sender.mjs`：`recordPair` + `--only last` 配对路径；`--with-seconds 9.5 --cut-seconds 6.5`（T_c_est=8.0s 取自 run-03 T*=8.028s；≤2 次校准）；**复用现有 payload 字节**；manifest 重写（同流构造字段、声明停点、双片 sha256、带时间戳副本、内嵌前缀检查 JSON）— A-02 / R5-B / record-sender.mjs / 配对产出一致 / 车道第 1 步 exit0 产出双片+manifest / 双片 webm+manifest。
- **R5-F** 新 `pair-evidence.mjs`：`evaluatePairConstruction({manifest, prefixCheck, diskShas})`（同流字段、0<cut<withMs、双片 sha256、载荷 sha、前缀 JSON PASS）— A-02 / R5-B / 新模块 + UT（W2）/ 门禁式校验 / `--suite evidence` exit0 / diff+用例。
- **R5-J**（W3 首项）`run-e2e.mjs`：pageState 增 `writableAt/createWritableAccessedAt/lastSaveClickAt`；`legTimings` 改为委托 `leg-timings.mjs`；新共享收尾 `completeLegSave`（save→重读 pageState→断言时点→外部哈希），采纳于 liveRoundtrip、E2E-16/R5-H、E2E-18 videoLeg/R5-I、E2E-15 恢复腿/R5-G — A-03/B-S1、S-3 / R5-B / run-e2e.mjs / 保存后状态必须重读 / 车道中所有执行腿时点非空 / diff+记录字段。
- **R5-G** E2E-15：删除单一终恢复与独立 open 腿；序列 cancel→recovery-cancel→empty→recovery-empty→text→recovery-text→corrupt→recovery-corrupt（同页不刷新、真实入口、`completeLegSave`、逐腿 proof `proof/E2E-15/recovery-*/received.bin`、attemptId 续链；批量腿保留 import-path-only 标注）— A-01 / R5-A、R5-J / run-e2e.mjs（串行）/ 每失败后完整恢复 — / 车道 E2E-15 PASS / 记录 8 腿+逐腿哈希与 proof。
- **R5-H** E2E-16：跑腿前 `evaluatePairConstruction` 门禁（manifest+前缀 JSON 入 proofRefs）；新判据（端段完成/`__mediaEnded=null`/without 真 EOF 无产物/pair validity）；`tStarSec` 量纲修正；timelines（媒体时间、frameId、tailEvents、排空顺序、哈希）；端段不满足→RE-RECORD ≤2 次 — A-02 / R5-A、R5-E、R5-F、R5-C、R5-J / run-e2e.mjs（串行）/ 因果可核验 — / 车道 E2E-16 PASS / 记录+manifest+前缀 JSON+timelines。
- **R5-I** E2E-18：videoLeg 采纳 `completeLegSave`+非空断言；实时/预算腿经 R5-J 共享收尾自动受益；probe-bounds 按 attempt 归档（`probe-bounds-<attemptId>.json`，旧文件保留为最新）；旅程级 AUTHORIZED_NOT_RUN 语义不动 — A-03/B-S1、S-3 / R5-J / run-e2e.mjs（串行）/ 9 执行腿保存时点非空 — / 车道 E2E-18 PASS / 记录+measurement 字段。
- **R5-K** `summarize.py`：新计时键、边界定义、逐记录 attempt 列 — A-03/B-S1、S-2 / R5-B / summarize.py / 缺项不补造 / 车道 summarize exit0 / measurements.json+report。
- **R5-L** 无浏览器集成门：unit --all（9 套件全绿）、prefix selftest、selftest 14/14、stage（产品文件已变→重装配）+verify-assets、固定候选提交 — — / R5-C、R5-D — / 命令执行 / 四门全绿 — / 输出+候选 SHA。
- **R5-M** 浏览器串行车道（独占 D-B/P；严禁并行/换序）：① record-sender --only last（配对，≤2 校准）→ ② E2E-15 → ③ E2E-16 → ④ E2E-18 全矩阵（10 腿，9 执行+1 授权 NOT_RUN；~60-90 min）→ ⑤ summarize → ⑥ local PASS(20) / field exit1。**不重跑** E2E-1..14、17、19、20（proof 副本复算；E2E-15/17 引用 run-01 FIXTURES 未动；V-GOOD/V-SHORT 未被 --only last 触碰；E2E-16 在车道内重跑并再生记录）— A-01/A-02/A-03 / R5-L — / 文档/记录 / 每案真实结果 — / 全部 CASE PASS 行+门禁输出。
- **R5-N** 文档决策：D-20（同流配对+声明停点构造）、D-21（端段判据+tStar 修正+tailEvents）、**D-19 按 S-1 改写为实施方取舍** — S-1 / — / autonomous-decisions.md / 措辞如实 — / 人工核对 / diff。
- **R5-O** `stage5-dev-summary.md` 刷新：基线钉新车道提交；逐 attempt 标注（4MiB 当前 attempt=新值，旧 856,230,680 B 标历史）；initMs 分解；T4.2.a 主张对齐（saveWaitMs/saveWriteMs 分项交付）；性能 NOT_EVALUATED；⑰ FAIL 逆转（每条完成主张可指到记录字段）— A-02/A-03、S-2 / R5-M — / 文档 / 主张≤证据 — / 人工逐条核对 / diff。
- **R5-P** 内审 round 11（新周期标注：“round-5 整改周期第 1 轮”；pipeline-state 的 10/10 由编排方保管不自增）+ 报告归档 — — / R5-M、R5-O — / review-round-11.md / 0 Blocking 目标 — / 审查输出 / 报告。
- **R5-Q** round-6 送审包 + 模板（镜像 round-4 结构；固定 HEAD；复验范围限定声明；ext_rounds=5→round-6 编号说明；材料含 round-5 verdict/triage/tasks/review-11/run-03 更新）— — / R5-P — / ext-review/round-6-package.md、round-6-template.md / 材料齐备 — / 人工核对 / 包文件。

## 多智能体并行指令

> Create an agent team to complete the work for this task from different perspectives: one member is responsible for development (and, based on task relationships, seeks opportunities to implement multi-agent parallel development, while also performing real-time remediation based on real-time review feedback), and one member plays the role of the devil's advocate (reviewing the work of the development agent member based on reviews, decisions, and design documents, and raising issues for correction until all development outcomes pass the review successfully).

编排约束：① 并行成员按独占文件集分派（热点：run-e2e.mjs 由 W3 串行链消化；evidence.test.mjs 由 W1→W2 顺序消化；app.js 由 R5-C 独占）。② 恶魔代言人按 A-01/A-02/A-03/B-S1 的 DoD 逐条复核并复验裁决书反例（五条录像腿 null 保存量测、E2E-15 仅末尾一次恢复、tStarUs 量纲、manifest 无证断言）必须全部逆转，未逆转即打回。③ 浏览器车道（R5-M）强独占：固定顺序、严禁换序/并行、运行期间禁跑本地门禁。④ 新发现问题上报编排方，不静默扩大范围；改写冻结计划必须经用户确认。

## 波次与资源

- W1（并行，文件不相交）：R5-A ∥ R5-B ∥ R5-C(已完)。
- W2：R5-D（evidence.test.mjs）∥ R5-E、R5-F（tools/**）。
- W3（run-e2e.mjs 串行链）：R5-J → R5-G → R5-H → R5-I。
- W4：R5-K、R5-L（命令门+固定候选）。
- W5：R5-M（浏览器串行车道，独占桌面/剪贴板/端口 8771/8811/8790/9445；运行期间禁跑门禁）。
- W6：R5-N → R5-O → R5-P → R5-Q（文档）。

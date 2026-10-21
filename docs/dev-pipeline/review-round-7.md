# 内部审查归档 — Round 7（外审 round 1 整改复核）

- 范围：`d61fa74..80c92dd`（21 提交：批次 H/I/J/K/L + 批次 M 文档）。批次 M（`stage5-dev-summary.md`、`autonomous-decisions.md`、TD-01/TD-12 关闭、状态文件）在本次审查开始后以 `80c92dd` 提交，故按到 HEAD 为止复核。
- 审查结论：**不通过（3 Blocking）**。7 个外审主题的代码修复本身全部真实落地并通过独立复核（见下），但 A-04/B-S01 残留一个可实证的门禁漏洞，且整改新引入的 E2E harness 存在两处证据诚实性缺陷。

## 独立复核（本轮实际执行）

- `node tools/desktop-recv/run-unit.mjs --all`：exit 0，9 套件 88 测试，0 fail/todo/skip。
- `python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261019-teamexec-02 --gate local`：PASS（20 required cases），exit 0。
- 同上 `--gate field`：FAIL（6 violations，E2E-21..26 记录缺失），exit 1——诚实负例成立。
- `python tools/desktop-recv/verify-evidence-selftest.py`：12/12 通过。
- 负向对照：对旧 run `20261018-teamexec-01` 跑 local 门禁 → exit 1，36 violations（18 条 NOT_RUN 逐条拒绝）。A-04 原反例（FAIL/错 scope/mock 被 PASS）确实已关闭。
- 证据真实性：20/20 条记录的 proofRefs 存在；用 `Get-FileHash` 逐条重算 E2E-1..20 全部 40 个 original/received SHA-256，与 results.json 全部相等；另抽 8 个 per-round 产物（E2E-3/14/20、E2E-12 改名保存件、E2E-1 live/recorded）逐一相等。`saveArtifact` 先删后存、经真实系统对话框与产品保存路径产出 received.bin；`roundtripRecord` 从盘上文件计算哈希。launch-log、encoding-repro、first-run-fail 证据与 D-13/TD-17 撤回叙述一致。
- `node tools/desktop-recv/verify-assets.mjs`：PASS，revision `a515922`（staging 绑定如实声明）。
- 代码审查：session.js / decoder-client.js / video-source.js / app.js / ui.js / frame-scheduler.js / evidence.js / verify-evidence.py / launch.ps1 / launch.cmd / run-e2e.mjs / native-dialog.ps1 / 单测 UT-055..079/081/082。A-02（Incomplete 可重启）、A-03（主线程 init/frame 看门狗，恰好结算一次）、C-02（取消释放已 ready/晚到 client）、C-01（逐参数保真 + 监听确认，exit 5）、B-S04（seek 错误/超时/abort 出口 + 尾帧补采）的修复与单测均真实且到位；发送端输入为真实 sender 页面 + 真实抓屏 + 真实系统对话框，非 mock。整改未触碰 C++ 源。

## Blocking issues

### B-1 / P1：证据门禁仍不校验计划场景类型——"改 caseType 洗白文件往返"路径开放（A-04/B-S01 残留）

- **位置**：`tools/desktop-recv/verify-evidence.py:107-131`（`plan_rows` 只取 id/scope/executor，不读计划中的类型）、`:223`（落盘哈希校验仅对 `file_roundtrip` PASS 触发）；`web/desktop-recv/src/evidence.js:114-116`（required spec 无类型）、`:149`（工件校验以记录自身 caseType 为键）；`docs/tests/planning-cases.json`（e2eScenarios 均无 `caseType` 字段）。
- **证据**：本轮实际执行两个独立探针：Python 侧在临时目录构造 E2E-3 记录 `caseType=negative_or_lifecycle, result=PASS, proofRefs=[proof/log.txt]`，`GATE local: PASS (1 required cases)`，exit 0；JS 侧同形状记录 `validateRunGate(...).ok === true`，violations 为空。即任一必需的文件往返旅程改标为 lifecycle 并只留一份日志即可通过本地门禁。外审 round 1 A-04 期望原文明确要求"校验预定 scope/执行者/类型"且"不能通过改 caseType 来洗白文件往返要求"；`verify-evidence-selftest.py` 的第一个正例（E2E-1 以 negative_or_lifecycle 形状通过门禁）恰好演示了该漏洞形状。
- **期望**：`planning-cases.json` 为每个 E2E 场景声明预期 caseType；两套门禁（Python/JS）交叉校验记录 caseType 与计划一致，不一致即拒绝；selftest 与 `evidence.test.mjs` 补"file_roundtrip 旅程改标 lifecycle → 门禁必须失败"负例；重跑 selftest 与 local/field 门禁。

### B-2 / P1：E2E-16 的 PASS 判定不含"缺末帧录像必须 Incomplete"负向腿，存在假绿路径（B-S04 残留）

- **位置**：`tools/desktop-recv/e2e/run-e2e.mjs:1583-1618`（E2E-16）；`:1596` `withoutReady` 被测量但从未参与判定；`:1615` `result: equal ? 'PASS' : 'FAIL'`；`:668-687`（`videoRoundtrip` 的就绪等待以 `!last.saveDisabled` 即刻短路）。
- **证据**：代码推演（本轮逐一核对调用路径）：若回归使截断的 V-LAST-without 误判 Ready，则其后对 V-LAST-with 的导入被协调器以 busy 拒绝（Ready 非 IDLE_STATES），`videoRoundtrip` 的等待循环因保存键仍可用而立即放行，`saveArtifact` 保存的是**遗留会话的旧产物**（同一 128 KiB 载荷，哈希必然相等）→ E2E-16 PASS，notes 记 "incomplete=false"。即 B-S04 要防的"截断录像被当作完整"回归可同时骗过 E2E-16 与门禁。V-SHORT 腿有 `if (!short.saveDisabled) throw` 强制，唯独 V-LAST-without 腿缺失强制。实际证据中 notes 如实记录 incomplete=true，当前证据不假，但场景对自身验收的负向腿不设防。
- **期望**：E2E-16 的 PASS 判定并入 `!withoutReady`（缺末帧录像必须落 Incomplete），notes 与 result 一致；重跑 E2E-16 重生成记录。

### B-3 / P1：证据记录声称了未实际执行的检查或步骤（E2E-5 空断言、E2E-19 虚构腿）

- **位置**：`tools/desktop-recv/e2e/run-e2e.mjs:1270-1283`（E2E-5）；`run-e2e.mjs:1765-1793`（E2E-19）；`docs/tests/runs/20261019-teamexec-02/results.json` E2E-5/E2E-19 notes；`batch-l-status.md:22`；`stage5-dev-summary.md` §5 E2E-19 行。
- **证据**：(a) E2E-5 中 `stillNoArtifact = blank.saveDisabled`，而 `blank` 是 `startCapture` 在**流刚接入时**返回的状态快照；其后 7 秒空白窗口观察期的状态从未被复查，断言对"空白窗口期间不产生伪产物"这一旅程核心验收完全空转。推演确认无兜底：即使空白窗口误判 Ready，`stopSession`（Ready 可停止）与重选往返（Stopped 属 idle-like）都照常通过，记录仍写 "blank window produced no artifact (true)"。(b) E2E-19 计划步骤 2 为"另轮关页重开"（planning-cases.json E2E-19），代码只做了 `page.reload()`，没有关页重开；但记录 notes、`batch-l-status.md` 与 `stage5-dev-summary.md` 均写"reload + close/reopen / 关页重开"，声称执行了未执行的腿。
- **期望**：E2E-5 在 7 秒观察期结束后重新读取 pageState 并强制 `saveDisabled===true`（无产物）再判定；E2E-19 要么真执行关页重开腿（close page + 重新打开 URL），要么按 D-11 先例如实登记偏差；同步更正 results.json、batch-l-status.md、stage5-dev-summary.md；重跑两条旅程。

## Suggestions

- S-1：约半数旅程（E2E-3/4/5/7/11/14/18/19/20）无 try/catch——旅程崩溃时 `upsertResult` 不执行，results.json 保留**上一次的旧 PASS 记录**，门禁会为陈旧证据放行。建议旅程级兜底：崩溃路径也写一条诚实 FAIL（E2E-1/2/6/8/9/10/12/13/15/16/17 已示范），或门禁对 stale 记录引入运行戳校验。
- S-2：`session.js` `_decoderFailed` 缺 `captureRejected` 守卫：取消选源（已落 Idle）后并行的 init 再失败，会把已取消会话推入 Stopping→Stopped 并冒出 15001 错误。加一个 `captureRejected` 早退即可。
- S-3：`video-source.js` `_seek` 每次把 cleanup 压入 `_listeners` 且完成后不摘除；fallback `_runLoop` 长录像会线性累积。完成时移除即可。
- S-4：`launch.ps1` 的 `Quote-Argument` 未处理尾随反斜杠（包放在盘根时 `"C:\"` 会转义收尾引号）；另就绪确认窗 10 s 偏紧。均为边缘场景，fail-safe 方向正确。
- S-5：E2E-15 的 `finite` 代理（`saveDisabled`）只证明"未 Ready"，不证明"落在可恢复终态"；建议改断言具体恢复态（Idle/Incomplete）。

## 审查者

- 内部审查 Round 7（devil's advocate），实施方独立复核者：Claude（review-7 agent），2026-10-21。只读；未修改产品代码。本轮实际执行：单元全套、两门禁、selftest、负向对照（旧 run）、20/20+8 哈希重算、临时目录 relabel 探针（Python+JS 双端）、全部整改源码与 harness 通读、证据目录逐条核对。verdict 供外审 round 2 包使用。

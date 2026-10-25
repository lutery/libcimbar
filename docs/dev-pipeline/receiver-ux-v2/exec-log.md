# receiver-ux-v2 阶段5 执行日志（lead 独占写入）

> 记录规则：每批一条（批号/任务/代理/起止/提交哈希/证据指针/异常处置）。审查轮号沿用全局计数（历史已至 14），下一轮=15，标注在各区 review-*.md 头部。

## B0 — 基线冻结（lead）

- 起止：2026-10-24 14:37 ～ 14:40 (+08:00)
- 动作：分支 `receiver-ux-v2`（自 master `9e4fbc4`）；pipeline-state team-exec in_progress/team_mode=native（通道A，不生成 .omc 契约）；规划基线提交 `0ed2e5b`（98 文件：stages 1-4.7 全部材料 + v1 历史归档 + README 导航）；账目初始化 `2b47233`。
- 证据指针：`git log 0ed2e5b`；工作树 clean。
- 备注：`git diff --cached --check` 报 5 个规划文件 EOF 空行（Codex 产出原样保留，不改写字节）。

## B1 前置基线门禁（lead，HEAD 2b47233 实测）

- `node tools/desktop-recv/run-unit.mjs --all` → UNIT SUITES PASS（9 suite / 120 tests，0 fail/todo/skip），exit 0。
- `python tools/desktop-recv/verify-evidence-selftest.py` → SELFTEST PASS (14 cases)，exit 0。
- `python tools/desktop-recv/e2e/video-prefix-check.py --selftest` → PASS (3/3)，exit 0。
- `python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py` → DESIGN_CONTRACT_SHAPES_PASS（20 defs/27 examples/44 vectors/15 diagnostics；12 implementationCases NOT_RUN），exit 0。

## B1-T1 — 运行上下文与新旧门禁先行失败测试（dev-v2-tools → lead 提交）

- 起止：2026-10-24 14:40 ～ 15:00 (+08:00)；代理报告：`docs/dev-pipeline/receiver-ux-v2/b1-t1-report.md`
- 产物：`tools/desktop-recv/tests/run-context.test.mjs`（26,132 B，UX-UT-081..086）、`tools/desktop-recv/tests/ux-evidence-selftest.py`（26,404 B，UX-UT-088..095）。未注册进 run-unit（工具独立）。
- 真实 RED（lead 独立复跑确认）：`node --test .../run-context.test.mjs` exit 1（ERR_MODULE_NOT_FOUND e2e/run-context.mjs）；`python .../ux-evidence-selftest.py` exit 1（preflight: missing verify-ux-evidence.py/run-context.mjs）。日志：`red-logs/b1-t1-node.log`、`red-logs/b1-t1-python.log`。
- 旧回归：verify-evidence-selftest 14/14、prefix 3/3、run-unit --all 9 套 120 全绿（代理与 lead 均实测）。
- 设计说明（T2 需遵循）：runner/recorder 增 `--validate-only`/`--repo-root`（无副作用身份输出）；verify-ux-evidence 经 `node e2e/run-context.mjs --validate` 复用同一解析器；产品 manifest 格式（version/iterationId/base/files 排序）；错误码前缀 E_CONTEXT_*/E_MANIFEST_*/E_ATTEMPT_EXISTS。
- 提交：`test: specify isolated UX run and gate boundaries`（含台账与 RED 日志）。

## B1-T2 — 隔离运行上下文与双证据出口实现（dev-v2-tools → lead 提交）

- 起止：2026-10-24 15:01 ～ 15:22 (+08:00)；报告：`b1-t2-report.md`；GREEN 日志：`red-logs/t2-green-tools.txt`
- 产物：`e2e/run-context.mjs`（单一解析器+--validate；runner/recorder/verifier 共用事实源）、`verify-ux-evidence.py`（--context/--gate local|field/--repo-root；46 例自测）、runner/recorder `--context` 必需 + `--validate-only`/`--repo-root`/`--resume`/`--help`，未知 case 启动前 exit 2、UX 占位 exit 4、manifest/run-root guard exit 3/5；`stage.ps1 -StagingRoot`；evidence.mjs 增 ux 出口（v1 导出不变）；e2e/README.md 命令契约。
- GREEN（lead 独立复跑确认）：run-context 7/7；ux-evidence 自测 46 例；旧自测 14/14；prefix 3/3；run-unit --all 9 套 120 全绿。旧 run 零字节改动。
- 偏差（已记录，未放宽断言）：缺 --context 退出码定为 2（参数错误）；T1 夹具两处自身缺陷修正；UX 场景仅注册 exit-4 占位（KISS——场景实现在 T13/T19/T25/T31/T35）。

## B1-T3 — 隔离工具对抗与旧契约回归（dev-v2-tools → lead 提交）

- 起止：2026-10-24 15:22 ～ 15:31 (+08:00)；报告：`b1-t3-report.md`；GREEN：`red-logs/t3-green-tools.txt`；旧 run 指纹：`red-logs/t3-oldruns-{before,after}.sha`（760 项，Compare-Object=UNCHANGED）
- 新增对抗：run-context 第 8 用例（大小写孪生根/分隔符/中文 runId/staging 指历史/伪造历史根零写入/目录 context 明确报错/大小写 attempt 密封）；selftest +8（时间倒序、NOT_RUN 带 SHA、跨 attempt 借 proof、caseId 折叠、反斜杠 proofRef、field 冒 local、同 case 双 attempt、planning 目录）。
- 两处抗对抗加固（断言先行）：context 路径为目录→E_CONTEXT_MISSING；planning 不可读→ContextError exit 3。
- 复跑（lead 独立确认）：8/8、54 cases、14/14、prefix 3/3、check-contracts PASS、unit 9 套 120；旧 run/staging/product 零改动。
- 提交：`test: reject stale and incomplete UX run claims`。

## B1-T5 — 工具审查整改与复验（dev-v2-tools → lead 提交）

- 起止：2026-10-24 16:08 ～ 16:45 (+08:00)；报告：`b1-t5-report.md`；RED：`red-logs/t5-red.txt`；GREEN：`red-logs/t5-green-tools.txt`；旧 run 指纹：T3 基线 vs `t5-oldruns-after.sha` UNCHANGED（760 项）。
- Blocking 1 关闭：新增 `e2e/process-guard.mjs`（pids.json 登记 + 全 marker 命令行复核才清理 + `assertPortsFree` 占用即拒绝）；run-e2e/record-sender 的三类宽匹配杀进程删除；新测试 `tests/process-guard.test.mjs` 6 例。
- Blocking 2 关闭：README「Run」改为 stage-5 context 入口 + 新增 Historical diagnostics（do not run）节；smoke-live.mjs 头部 historical + 无 `--legacy-write-frozen-run` 即 exit 2。
- 采纳：S2（stage 退出码可达 2/3/4）、S3（历史守卫大小写折叠）、S4（Python realpath containment + 判别性 junction 反例）、S5（`stageVerifiedSender` 按 DELIVERY-MANIFEST 校验后只读复制发送端包到 `<stagingRoot>/sender`，幂等/漂移拒绝）、S6、S7（UX-UI=E2E-35..38）、S8（恒真 check 改真断言）、S10（node 子进程 30s 超时）。S1 不采纳（README 写明 v2 一律显式 -StagingRoot）。
- 复跑（lead 独立确认）：run-context 9/9、process-guard 6/6、ux 自测 55、旧自测 14/14、prefix 3/3、契约 PASS、unit 120；旧 run/product/staging 零改动。
- 提交：`fix: resolve UX runner review findings`（8a1ef74）。

## B1-T6 — 基线/样本/预检锁定（dev-v2-tools → lead 提交）
- 起止：2026-10-24 16:48 ～ 17:34 (+08:00)；报告：b1-t6-report.md；日志：red-logs/t6-verify.txt、t6-preflight.log、t6-record2、t6-record-attempt1-sendermanifest-red.log
- 产物：baseline 根 20261024-teamexec-04（run-context/product-manifest/input-manifest/environment/baseline-observation/pids.json + fixtures/ + fixtures-ext/（seed 20261018，哈希与 哨兵表一致）+ fixtures/fixtures-media/ 真实同流配对 V-LAST-with 14,330,428 B / V-LAST-without 9,807,013 B + prefix-check PASS（head 0.0，tail 3/3））+ candidate 占位根 20261024-teamexec-05（context/manifest/输入清单；T34 另立最终根）。
- 基线预检：baseline-preflight.mjs 实测 READY_OBSERVED（readyMs=15012，101 帧 ≥30，131072 B 完整重建；非阈值判定）。
- 断言先行修复：readSenderManifest 接受冻结包的注释/空行/裸 ISO 时间戳三种非条目行；新测试第 10 例先 RED（t6-record-attempt1-sendermanifest-red.log）后 GREEN（10/10）。verify-assets PASS；旧目录 760 项 UNCHANGED。
- 提交：`docs: record receiver UX baseline and fixtures`。


## B2-T8 — 会话观测实现（dev-v2-prod → lead 提交）

- 起止：2026-10-24 18:32 ～ 19:20 (+08:00)；报告：b2-t8-report.md；GREEN：red-logs/b2-t8-{run-unit-all,ux-telemetry,worker-client-session}.txt
- 产品 3 改 1 新：src/ux-telemetry.js（新，ReceiverTelemetry+observeSave+snapshot）、worker read_report（配方 B 逐字，仅 0n/正值后 artifact 前读）、decoder-client pending 元数据（post 前盖戳+只读 getter）、session createUx/nowMs 注入（begin/accept/finish 每 seq 恰一次，观测异常全部吞并）。
- 9 旧套 137 tests 全绿；ux-telemetry 16/16（未注册，T10 注册）；ux-view 仍 RED（T9）；node --check 全 0；旧 run 零改动。
- 夹具级修正（无断言放松）：worker 跨 realm 归一/堆交换位置/预算例字节；client postMessage 覆盖时机；session deliverFrame 兼容；telemetry 速率帧补合法 rEmpty() report+031 窗口期望按冻结数学修正。
- lead 决策：UX-UT-014 迟到注入延至 T12；observeSave 模型级用例补进 T14 派发。
- 提交：`feat: observe receiver data without changing decoding`。

## B2-T9 — 只读视图与显示时钟（dev-v2-prod → lead 提交）

- 起止：2026-10-24 19:21 ～ 20:03 (+08:00)；报告：b2-t9-report.md；RED：b2-t9-{ux-view,ux-display}-red.log；GREEN：b2-t9-{run-unit-all,ux-suites}.txt
- 新增：src/ux-view.js（readView 纯投影+格式化；19013/19008/19009/19007/19014 校验顺序；状态优先级；rate/progress/elapsed/media 归一）、src/ux-display.js（createUxDisplay {syncBusiness,setVisible,dispose}；单 owner 刷新器；≥250ms 共享节流；数字去重；19012 回退；visibility 停/恢复）、tests/unit/ux-display.test.mjs（048..052 5 例）。
- 修改：app.js（createClient owner+nowMs、coordinator createUx/nowMs、uxDisplay 接线、paint 全 textContent）、index.html（9 个 ux 元素 + #log 移出 aria-live，原 id 全保留）、styles.css、ux-view.test.mjs（补 T7 漏写的 034）。
- 复跑（lead 独立确认）：view 9 + display 5 + telemetry 16 = 30/30；run-unit 9 套 137 全绿；node --check 全 0。
- 偏差（如实）：T7 漏写 034（T9 补齐并按契约修正子断言，无放宽）；progress.kind=unavailable 需 snapshot 增 lastReport（T12/T15 处理）；setVisible 为最小扩展；新增 #ux-save 元素；麻雀文案（完整矩阵 T27）。
- 提交：`feat: show Chinese receiver activity and elapsed time`。

## B2-T10 — 套件注册与切片集成（dev-v2-prod → lead 提交）

- 起止：2026-10-24 20:05 ～ 20:18 (+08:00)；报告：b2-t10-report.md；GREEN：red-logs/b2-t10-run-unit-all.txt
- run-unit.mjs ALL_SUITES 9→12（ux-telemetry/ux-view/ux-display 显式注册）；session.test.mjs 增 T10 集成用例（双入口重复注入只计一次，真实 ReceiverTelemetry）。
- --all 实测 12 套 168 tests 全绿（旧 137 保持；session 31→32）。拒绝路径自证（临时副本）：缺套件=3、含 skip=1、崩溃=1；零用例护栏在 node --test 文件级计数语义下不可达（如实记录，转 T11 审查关注）。
- 提交：`test: register and integrate UX observation suites`。

## B2-T12 — 切片审查整改（dev-v2-prod → lead 提交）

- 起止：2026-10-24 20:40 ～ 21:06 (+08:00)；报告：b2-t12-report.md；RED：b2-t12-s1-red.log；GREEN：b2-t12-run-unit-all.txt
- S1 修复：session.js uxSaveIntent（点击捕获不可变 owner）+ saveEvent 旁路 _observeSaveEvent（selecting 绑定真实 attempt、固定 owner、终态清绑定、16 条防御上限）；app.js saveArtifact 同步调用；不改业务结算。验收断言四链（saved/saving_pending、cancelled、busy 16008、Retryable 重试）+ 迟到旧 attempt 不夺取保存视图。
- UX-UT-014 强化：真实未决 Promise 跨 stop() 的迟到回执注入（B 模型零 accept）。
- 复跑（lead 独立确认）：12 套 169 全绿（session 33）；node --check 0。
- review-slice.md 已追加「第 1 次整改结果（T12）」。S2/S3/S4 留 T14。
- 提交：`fix: converge real-time receiver UX review`。

## B3-T13 — 真实抓屏闭环（dev-v2-tools → lead 提交）

- 起止：2026-10-24 21:26 ～ 22:36 (+08:00)；报告：b3-t13-report.md；失败留档：red-logs/t13-attempt{1,2,3}-*.log；指纹：t13-oldruns-after.sha（UNCHANGED）
- E2E-27（UX-SLICE）真实旅程 **PASS**（第 4 attempt，前三次工具缺陷如实留档：clip 映射、attachCapture 等待语义、certutil 替代 Get-FileHash）。
- SRC-01 校准 CAL01-05 全 PASS（真实码帧 PNG、静止层≥10s、空白层全覆盖）；S01-S06 全 PASS：等待≥6s（用时走表/0 伪造进度）→ 首数据 revision 2→3 + 41.7 KiB/s → Ready 131072B + 用时冻结 → 真实系统保存 saveTimingsComplete → 外部 SHA 相等（certutil）。
- 产物：source-scene.mjs（新）、run-e2e.mjs（E2E-27 handler/UX-SLICE 展开/waitForReady 选项）、run 根 20261024-teamexec-06（ux-results.json phase=slice PARTIAL、proof 全套、manifest sha=adb59205…）。
- 提交：`docs: record first real receiver UX roundtrip`。

## B6-T14 — 窗口数学/阈值/歧义 RED + 补课（dev-v2-prod → lead 提交）

- 起止：2026-10-24 22:48 ～ 23:14 (+08:00)；报告：b6-t14-report.md；日志：red-logs/b6-t14-ux-telemetry-green.txt、b6-t14-ux-view-red.log
- ux-telemetry +6（S2 save 归一/幂等/终态不回写/新 attempt 仅 selecting 4 例 + S4 同毫秒双帧/倒退时钟 2 例，均固化既有行为直接 GREEN）；ux-view +3（视图速率窗口边界 5 点 + 四阈值 ±0.1ms 参数表 + **T14-R05 唯一真 RED**：有 data 但报告降级时应 unavailable 而现投影 none）；test-cases.md 034 Target 对齐（S3）。
- 核验（lead）：telemetry 22/22；view 11/12（R05 预期 RED）。
- 提交：`test: pin window math, thresholds and save/clock bounds`（RED 窗口期：--all 在 T15 前为红，属 TDD 预期）。

## B6-T15 — unavailable 进度投影实现（dev-v2-prod → lead 提交）

- 起止：2026-10-24 23:22 ～ 23:32 (+08:00)；报告：b6-t15-report.md；GREEN：red-logs/b6-t15-{ux-view-green,ux-telemetry-green,run-unit-all}.txt
- ux-view.js：REPORT_DEGRADATION_CODES（19001/19002/19003/19004/19015）+ projectProgress unavailable 分支（ratio/asOfMs=null、diagnosticCode=集合内最新降级码，歧义码分流）；formatRate 微小速率边界以直接断言固化。
- 复跑（lead 独立确认）：ux-view 13/13；--all 12 套 **170** 全绿（T14 RED 窗口关闭）。
- 提交：`feat: project unavailable progress from degraded report reads`。

## B6-T16 — R-01..08 单元绑定与真实 WASM IAT（dev-v2-prod → lead 提交）

- 起止：2026-10-24 23:38 ～ 00:03 (+08:00)；报告：b6-t16-report.md；日志：red-logs/b6-t16-{probe,run-unit-all,ux-telemetry,ux-view}.txt
- worker +1 真实资产 IAT 测试（交付包 JS/WASM 经 VM 桥接、scan stub 注入合成包、真实 fountain/report 链路，单流 [0.030303] 与探针记录一致）；负例缺口核对=无缺口；runtime-case-map R-01..08 → UNIT_VERIFIED + testBindings（JSON 合法）。
- 复跑（lead 独立确认）：worker 14/14；--all 12 套 171 全绿；probe exit0。
- 提交：`test: bind R-01..08 to unit cases and verify real report IAT`。

## B6-T19 — 浏览器 IAT 8 组（dev-v2-tools → lead 提交）

- 起止：2026-10-24 23:52 ～ 2026-10-25 02:55 (+08:00)；报告：b6-t19-report.md；留痕：red-logs/t19-attempt2-worker-enum-finish-keys.log、t19-green.txt、t19-oldruns-after.sha（UNCHANGED）
- UX-IAT-01..07 全 PASS（30 断言；attempt-3，前两次为 IAT 测试侧缺陷如实留痕：page.evaluate 语法/独立算例自误/paint 键分类、worker 枚举 API）；08 NOT_RUN（T28 measure-ux 未交付，不伪造）。
- 亮点：组 01 真实 WASM+真实 worker 内 CDP 故障注入（frame 不变仅报告降级）；组 03 独立手算 32.727B/s；组 05 真实录像 import + 严格 EOF；组 06 注入保存链全相位；组 07 55 例门禁链路。
- 产物：iat-browser.mjs/iat-suite.mjs（新）、run-e2e UX-IAT scenario、runtime-case-map R-01..12 IAT 绑定（47 testBindings）、metrics 根 20261025-teamexec-07。
- 提交：`test: verify receiver UX integration in a real browser (IAT)`。

## B7-T20 — 媒体/保存接线 RED + 面缺口核对（dev-v2-prod → lead 提交）

- 起止：2026-10-25 02:58 ～ 03:29 (+08:00)；报告：b7-t20-report.md；日志：red-logs/b7-t20-{five-suites,run-unit-all}.txt
- 5 套 +7 例（video 源快照有界+preview 结构钉；save 事件形状契约钉；session 停止后迟到回调零污染+Stopping 期观测连续；ux-view 媒体独立性矩阵含**唯一真 RED**（19011 诊断未并 diagnosticCodes）；ux-display Retryable 文案/timer 约束）。接线面缺口核对=仅 1（其余已被 T12/T14 覆盖，如实标注）。
- 核验（lead）：五套定向 17/8/35/6/13-of-14（唯一失败=T20 RED，预期窗口）。
- 提交：`test: specify media and save feedback ownership`（RED 窗口至 T21）。


- 2026-10-25（T24）：T21 计划中的「点击后焦点」验收裁定归 **T31**（真实键盘/焦点 E2E 批）承接——lead 决定；T22 的 ux-observation.mjs 已预留 receivingDriven 驱动态断言面，届时由 T31 浏览器执行面覆盖。登记人：dev-v2-prod。

## B7-T25 — 真实录像/保存闭环（dev-v2-tools → lead 提交）

- 起止：2026-10-25 05:02 ～ 06:25 (+08:00)；报告：b7-t25-report.md；留痕：red-logs/t25-attempt1-save-hooks-sessionid.log、t25-green.txt、t25-oldruns-after.sha（UNCHANGED）
- E2E-30..34 全 PASS（21 断言；attempt-2；attempt-1 两处测试侧根因如实修复留档：同页多存需每腿重载页面=v1 既有语义、两处断言读取自误）。
- 亮点：双向停止/切换 owner 更新计时清零；native 文件选择器 tier-3 探针；三时点「录像位置/用时/速率/估计」四行分列；EOF 不足→Incomplete 不可保存→with 恢复；真实取消（对话框停留 4944ms）→Retryable 文案→重存四时点+SHA；哨兵 FileShare.None 锁→如实分支→释放→恢复保存。
- 产物：media-journeys.mjs（新）、run-e2e 媒体工厂接线、media 根 20261025-teamexec-08（ux-results PARTIAL phase=media）。
- 提交：`docs: record real video and save recovery evidence`。


- 2026-10-25（T30）：S10 登记——#ux-next（aside.guide）桌面单列布局为 **lead 批准的实现简化**（ui-spec 仅要求 ≤760px 下移）；保存后焦点回归仍归 **T31**。登记人：dev-v2-prod。

## B8-T31 — 真实浏览器/键盘/AT + A/B（dev-v2-tools → lead 提交；收口续批）

- 起止：2026-10-25 09:48 ～ 10:58 (+08:00)；报告：b8-t31-report.md；日志：red-logs/t31-{green.txt,oldruns-after.sha}
- E2E-38 录制 A/B：attempt-1 FAIL=E_TELEMETRY_NOT_ARMED×5（工具缺陷：观察器 init 在 documentElement null 时抛错——先诊断复现后修复，instrumentation SHA 42f8a949…；原始数据保留）；attempt-2 **PASS**（5/5 对，readyMs 15852/限18259、p50 63.8/72.6、p95 102.1/112.93；候选 armed=true 写间隔≥250ms；基线不适用如实）。
- UX-UI attempt-3 PASS：E2E-35 前台/后台时钟（S02 visibility 旗标致 NOT_RUN 如实；恢复/冻结/保存全过）；E2E-36 四视口+200% 缩放矩阵、长中文名 101 字符换行、键盘全链（Enter 激活/Tab 序/录像导入/键盘重存 SHA 相等）。
- 如实 NOT_RUN：E2E-37（Narrator 无法程序化核验真实语音）；E2E-38 实时 5×30s 腿（采集器未实现）→ E2E-38 整体 NOT_RUN。
- 发现项：①取消保存后焦点落 BODY（T24 登记验收未满足——交 prod 修复后重测）；②后台 visibility 旗标行为记录。
- 提交：`docs: record real UI acceptance and first a-b overhead run`。

## B8-T31b/T31c — 焦点修复与第二阶段收口（dev-v2-prod/dev-v2-tools → lead 提交）

- T31b（prod）：focusTargetAfterSave 纯函数+接线（cancelled/failed→btn-save 或回退、saved→btn-live）；ui 13/13、--all 12 套 202 全绿。提交 c0d566f。
- T31c（tools）：产品字节变→重建候选 20261025-teamexec-09b（manifest 9e2595e6…）；新工具 live-legs.mjs（实时 5×30s 采集器：真实发送窗+共享选择器、AB/BA×5、帧区间精确扫描 single-flight、候选侧遥测 armed/节流/反馈/停止冻结判据）。
- 实时腿 attempt-03 首跑=工具缺陷（addInitScript 晚于页面加载→观察器未装），诊断后修复+重导航；attempt-03 失败轮原件保留。attempt-04（同构建纯 harness 变更，按配方保留新 harness/attempt）：
  - 录制 A/B **PASS**（5/5 对）；
  - 实时 5×30s 腿 **PASS**（10/10 侧别 VALID）；
  - UX-UI 重测：E2E-35 PASS、E2E-36 PASS（S03-B 焦点修复实测：focusAfter=btn-save focusVisible=true）、E2E-37 NOT_RUN（Narrator 无法程序化核验，如实）、**E2E-38 PASS（录制+实时双出口齐备，里程碑达成）**。
- 回归：--all 12 套全绿；旧 run 760 项 UNCHANGED（t31c-oldruns-after.sha）。
- 提交：`docs: complete live a-b legs and focus-restored ui acceptance`。

- 2026-10-25（T33 后，lead 裁定）：E2E-35-S02 的 harness 可见性分支接受按 T33 处理——held 断言 PASS + 真实 visibility 结果写入 notes（旗标致 visible）；属环境不可构造项的如实降级，不伪造、不删步骤语义；阶段 6 外审可见该 notes。

## B10-T35 — 最终候选全矩阵（legacy E2E-1..20 + UX E2E-27..38）（dev-v2-tools → lead 提交）

- 起止：2026-10-25 16:13 ～ 20:42 (+08:00)；报告：b10-t35-report.md；日志：09b/logs/lane-progress-t35.txt、t35-final-gate2.log；指纹：red-logs/t35-oldruns-after.sha（760 项 UNCHANGED）
- Legacy v1 **20/20 PASS**（results.json）：1..13 首跑/个别重试；14/15 process-guard 规模超时（单批 CIM 查询修复后重试 PASS）；16/17/18/20 同流媒体 fixture 缺口（19 文件自只读 04/03 根逐字节复制 + fixtures-provenance-t35.json 登记，未改 input-manifest，重试 PASS）；18 重跑 b94f81 执行 video-n-128kib 腿，十腿=9 PASS + live-n-20mib-over-budget NOT_RUN（D-19 授权依据）。
- UX **12/12**：27/28/29/30..34/35/36/38 PASS（最终 attempts 89769d / 0db9b3 / fa39af / 13c955 / d40b44），37 如实 NOT_RUN（真实启动 Narrator pid 存活 5s 后停止，本环境无法程序化核验语音，DOM/aria 不替代）。UX-ALL 组内首次运行接收服务死亡（ERR_ADDRESS_INVALID）→ 修复 E2E-27 语义正则 + 改逐组进程隔离调用；失败组 attempt 0db9b3 原件保留。
- 双门禁实测（lead 独立复核）：legacy `python verify-evidence.py --run …09b --gate local` → **GATE local: PASS (20 required cases)** exit 0；UX `verify-ux-evidence.py --gate local` → **FAIL (2 violations)**，仅 E2E-37 两条环境项（本地不可程序化核验，属现场批次设计内）。
- 回归：run-unit --all 12 套、ux-evidence-selftest 55、verify-evidence-selftest 14、prefix-check 3/3；产品/worker 0 行改动；旧 run/staging/product/planning 零写入；零残留进程/端口。
- 工具变更（全部 harness）：ui-journeys（+E2E-28/29 旅程、37/38 独立化、finish 由断言推导、NOT_RUN null 语义）、run-e2e（E2E-27 CAL fold、S04 语义正则、页级保存钩子检测重载、needsSender、live/video roundtrip）、source-scene（静止层活性点）、media-journeys（assertion proofRef 规范化前缀）、process-guard（CIM 单批化 + 120s 超时 + 原因点名）。
- 报告修正（lead 验收时发现 5 处传输损坏，已由 dev-v2-tools 依 ground truth 精准改写；一次性 splice 备份 .pre-t35-media-splice 已删除、未入库）。

## B10-T36 — 阶段 5 收口六项交付与回填（dev-v2-tools → lead 提交）

- 起止：2026-10-25 21:00 ～ 21:50 (+08:00)；报告：b10-t36-report.md
- 交付（六项中的四项 + 两项回填）：v2 stage5-dev-summary.md（批次表 / 6 轮审查 0 Blocking 残留 / 测试总账 / 双门禁原文 / 现场 7 项声明）；09b/reproduction.md（环境、stage/run-e2e/measure-ux/live-legs 命令、期望 exit、常见坑 8 条）；09b/release-candidate-manifest.json（27 产品文件逐文件重哈希与 product-manifest 一致后才写入；双 results 索引 / measurements / IAT / 门禁状态）；根 stage5-dev-summary.md 索引；planning-cases.json 32 本地行状态回填（lead 语义校验：剥离可变字段后 39 场景定义与 HEAD 逐场景一致、顶层零变化；NOT_RUN=E2E-21..26/37/39，31 PASS）；runtime-case-map.json 最终绑定（R-01..12 全 VERIFIED、binding 指向 09b 最终 attempt、R-05 无 e2e 如实为空）。
- lead 复核：双门禁复跑 legacy `GATE local: PASS (20 required cases)` / UX `FAIL (2)` 仅 E2E-37×2 / field exit 1（现场项，设计内保留非零）；release-candidate-manifest JSON 校验（runId/attempt/manifest 9e2595e6/productFiles=27）；planning-cases 语义 diff 脚本 PASS。
- 处置记录：agent 曾以 578B 索引覆盖根 stage5-dev-summary.md（违反 lead 21:21 防覆盖指令，v1 38KB 正文被移出文件）；lead 从 git HEAD 取回 v1 原文（162 行逐字节、尾部比对一致），v2 索引置顶、v1 原文完整保留于下方（38874B）。遗留一次性脚本 t36-prepend-index.mjs 已删除。
- TDD 台账合并（lead 独占）：tdd-ledger-b2.json 并入 tdd-ledger.json（10 条，T1-T7 红绿成对，去重键 taskId+phase+command+date）；coverageNote 如实声明 T8-T35 的 RED/GREEN 证据在各批报告与 red-logs，不事后伪造补录。
- 提交：T35=`77a16b4`（工具 5 文件 + 09b 证据 566 文件）；T36=本提交（交付 + 回填 + 台账 + round-12 模板）。下一动作：round-12 送审包构建与 pipeline-state 收口后向用户请求阶段 5 出口确认。

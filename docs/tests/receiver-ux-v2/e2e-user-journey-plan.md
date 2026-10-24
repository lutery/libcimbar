# 接收器体验 v2 — 真实E2E用户旅程计划

2026-10-24 · 阶段4.7 · 仅规划，39条全部NOT_RUN。

[运行手册](e2e-runbook.md)规定装置、样本、真实系统操作、证据和重跑；[机器计划](planning-cases.json)由三份场景源生成，执行前必须核对。

保留原E2E-1～26及AC-001～014的原定义，新增E2E-27～39覆盖AC-015～024。共39条：本地32条（旧20+新12），用户现场7条（旧6+新1）；24条AC均有旅程映射。覆盖是规划追踪，不能当执行覆盖率。

实时抓屏与录像导入两个按钮均保留。验收使用原发送端、真实getDisplayMedia、真实录像及实际保存文件；源码探针、UT/IAT、原型不能替代真实操作。

## 门禁与阶段边界

阶段5 T35/T36要求本轮最终候选的32项本地场景全部通过（E2E-18逐腿另核），不是只看旧20项。用户现场7项单独汇总；缺用户实测不得填PASS，本地通过不代表现场通过。阶段8最终包另做入口复核，不能被列成阶段5循环前置。

旧Evidence v1仍只写原AC；新增体验独立ux-results.json，汇总器同时验证两份结果。未知ID、漏项、错manifest、缺实物/步骤证明、过期attempt及任何必测非PASS均非0退出。

## 场景导航

| ID | 场景 | 门禁/执行阶段 | AC |
|---|---|---|---|
| [E2E-1](#e2e-1) | 干净包首次启动 | local / 5 | AC-001, AC-003, AC-005, AC-013 |
| [E2E-2](#e2e-2) | 启动失败恢复 | local / 5 | AC-005, AC-006, AC-013 |
| [E2E-3](#e2e-3) | 实时到磁盘往返 | local / 5 | AC-001, AC-002, AC-003, AC-004, AC-010 |
| [E2E-4](#e2e-4) | 取消选源再开始 | local / 5 | AC-006, AC-007 |
| [E2E-5](#e2e-5) | 选错源与无数据恢复 | local / 5 | AC-006, AC-007 |
| [E2E-6](#e2e-6) | 外部停止共享/关闭源 | local / 5 | AC-006, AC-007 |
| [E2E-7](#e2e-7) | 应用停止重复点击 | local / 5 | AC-007 |
| [E2E-8](#e2e-8) | 模式不匹配恢复 | local / 5 | AC-006, AC-013 |
| [E2E-9](#e2e-9) | DPI/缩放/尺寸 | local / 5 | AC-001, AC-006, AC-012 |
| [E2E-10](#e2e-10) | 焦点/遮挡/最小化 | local / 5 | AC-001, AC-006, AC-007 |
| [E2E-11](#e2e-11) | 保存取消无需重传 | local / 5 | AC-003, AC-004, AC-009 |
| [E2E-12](#e2e-12) | 中文名/重名确认 | local / 5 | AC-003, AC-004, AC-009 |
| [E2E-13](#e2e-13) | 保存模态与停止 | local / 5 | AC-003, AC-007, AC-009 |
| [E2E-14](#e2e-14) | 真实录像成功 | local / 5 | AC-003, AC-004, AC-010, AC-014 |
| [E2E-15](#e2e-15) | 录像取消/坏文件恢复 | local / 5 | AC-006, AC-008, AC-014 |
| [E2E-16](#e2e-16) | 录像EOF与最终帧 | local / 5 | AC-002, AC-008, AC-014 |
| [E2E-17](#e2e-17) | 双输入停止切换 | local / 5 | AC-007, AC-008, AC-004 |
| [E2E-18](#e2e-18) | 扩展规模和预算恢复 | local / 5 | AC-006, AC-012, AC-004 |
| [E2E-19](#e2e-19) | 刷新/关页/服务重启 | local / 5 | AC-006, AC-007, AC-013 |
| [E2E-20](#e2e-20) | 连续使用与最终包 | local / 5 | AC-004, AC-005, AC-007, AC-010, AC-013, AC-014 |
| [E2E-21](#e2e-21) | 真实云桌面实时 | field / FIELD | AC-001, AC-004, AC-011 |
| [E2E-22](#e2e-22) | 真实云桌面录像 | field / FIELD | AC-004, AC-011, AC-014 |
| [E2E-23](#e2e-23) | 现场日常显示布局 | field / FIELD | AC-006, AC-007, AC-011, AC-012 |
| [E2E-24](#e2e-24) | 现场取消停止重启 | field / FIELD | AC-006, AC-007, AC-011, AC-004 |
| [E2E-25](#e2e-25) | 现场实际保存恢复 | field / FIELD | AC-003, AC-004, AC-009, AC-011 |
| [E2E-26](#e2e-26) | 现场测量回执与整改 | field / FIELD | AC-005, AC-011, AC-012, AC-013 |
| [E2E-27](#e2e-27) | 实时等待→数据识别→可保存→真实写盘 | local / 5 | AC-015, AC-016, AC-017, AC-018, AC-020, AC-022, AC-024 |
| [E2E-28](#e2e-28) | 重复有效码有识别速率但不虚增重建进度 | local / 5 | AC-015, AC-016, AC-017, AC-018, AC-020, AC-024 |
| [E2E-29](#e2e-29) | 真实无有效数据暂停→速率归零→恢复 | local / 5 | AC-015, AC-016, AC-017, AC-018, AC-020, AC-024 |
| [E2E-30](#e2e-30) | 真实停止与实时/录像双向切换不串指标 | local / 5 | AC-018, AC-019, AC-020, AC-021, AC-022, AC-024 |
| [E2E-31](#e2e-31) | 真实录像位置与重建反馈分别可理解 | local / 5 | AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-022, AC-024 |
| [E2E-32](#e2e-32) | 录像读到尾但未重建时不假报成功并可恢复 | local / 5 | AC-016, AC-018, AC-019, AC-020, AC-021, AC-022, AC-024 |
| [E2E-33](#e2e-33) | Ready、选择保存、取消重试和Saved清楚分层 | local / 5 | AC-018, AC-020, AC-021, AC-022, AC-024 |
| [E2E-34](#e2e-34) | 真实系统保存受阻后可理解地恢复 | local / 5 | AC-020, AC-021, AC-022, AC-024 |
| [E2E-35](#e2e-35) | 无新业务事件仍计时，后台返回不串旧时钟 | local / 5 | AC-015, AC-017, AC-018, AC-021, AC-022, AC-024 |
| [E2E-36](#e2e-36) | 真实中文界面的窗口、长文件名与全键盘操作 | local / 5 | AC-018, AC-019, AC-020, AC-022, AC-024 |
| [E2E-37](#e2e-37) | 真实屏幕阅读器的主状态播报、数字去重与系统窗口焦点恢复 | local / 5 | AC-018, AC-019, AC-020, AC-022, AC-024 |
| [E2E-38](#e2e-38) | 冻结方法的同录像五对A/B与真实抓屏五对30秒约束 | local / 5 | AC-023, AC-024 |
| [E2E-39](#e2e-39) | 用户在真实云桌面双输入路径判断接收体验并完成保存 | field / FIELD | AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-022, AC-024 |

## E2E-1

干净包首次启动

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-001, AC-003, AC-005, AC-013。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 阶段5使用本轮冻结的候选用户目录与候选清单，依 T35 执行，不等待阶段8；阶段8完成最终装配后另补同入口复验，包装或字节有变须复验受影响路径。
5. 准备真实含中文和空格的新目录、非仓库 cwd；保留当前系统区域设置，不为测试改 UTF-8 Beta。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-1-S01** 按候选说明把整套文件解压到中文和空格新目录，从其他 cwd 执行文档化启动入口。
   预期：不需手改路径或开发控制台；资源、Worker、匹配 WASM 正确加载，实际目录不是乱码孪生目录。
   留证：目录实际 Unicode 路径；候选整套摘要；启动终端原始输出。
2. **E2E-1-S02** 用正常 Edge 打开入口，确认“实时抓屏”和“录像导入”均可访问，照说明完成一次真实选窗口接收与系统保存。
   预期：候选入口可独立使用；仅真实完整产物进入待保存，写入与 close 后才已保存。
   留证：双按钮截图；真实捕获/保存对话框记录；本次原件和落盘外部 SHA-256。
3. **E2E-1-S03** 关闭发送与实时输入，点击录像导入并在系统文件选择器选 V-GOOD，再保存。
   预期：双输入均能从候选目录完成；没有借用后台实时数据。
   留证：录像输入摘要；发送停止证据；第二次外部 SHA-256。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 中文路径启动失败时保留原始输出与真实路径，先归因产品/启动器/装置，禁止仅凭猜测写成 pwsh 平台无法自救。
- 缺运行时或端口等前置必须有可操作提示；手动借用开发服务器后不得记首次启动 PASS。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 目录实际 Unicode 路径
- 候选整套摘要
- 启动终端原始输出
- 双按钮截图
- 真实捕获/保存对话框记录
- 本次原件和落盘外部 SHA-256
- 录像输入摘要
- 发送停止证据
- 第二次外部 SHA-256

阶段8单独复核（不计入本例阶段5必需步骤/证明）：

- 阶段8最终整套包装完成后，从另一个全新中文空格目录重复上述入口与双输入保存；与阶段5候选证据分开归档。
  预期：阶段5记录只声称候选验证；最终包复验另有阶段8摘要和结果，不用尚未产生的阶段8结果阻断阶段5候选门禁。
  留证：阶段8最终包摘要及入口记录；阶段8单独 attempt 和两输入外部哈希。

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`、`docs/dev-pipeline/stage5-dev-summary.md`、`docs/dev-pipeline/autonomous-decisions.md`、`docs/tests/runs/20261021-teamexec-03/reproduction.md`。

## E2E-2

启动失败恢复

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-005, AC-006, AC-013。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 仅用专有测试端口和可还原的独立依赖环境；不卸载系统软件、不停止无关进程。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-2-S01** 在专有端口预先启动已登记的占用者，按候选说明正常启动接收器。
   预期：明确报告实际端口冲突与恢复步骤，不白屏、挂起或杀占用者。
   留证：占用端口/PID归属；启动错误原文；页面状态。
2. **E2E-2-S02** 结束自己创建的占用者，按提示重启；在独立环境执行已声明必要运行时缺失分支，或验证自带运行时路线。
   预期：恢复端口/依赖后可正常启动；不适用分支单独注明，不用模拟故障冒充实际缺依赖。
   留证：恢复命令；干净环境/自带运行时说明；实际入口可用截图。
3. **E2E-2-S03** 按说明退出服务，再启动并做真实接收和系统保存。
   预期：退出可控且无无关进程受损；新实例可用，落盘字节正确。
   留证：退出前后服务/PID；重启输出；外部原收哈希。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 工具无法制造缺依赖条件时该分支 NOT_RUN/不适用带依据；IAT 只补技术分支，不冒充真实环境。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 占用端口/PID归属
- 启动错误原文
- 页面状态
- 恢复命令
- 干净环境/自带运行时说明
- 实际入口可用截图
- 退出前后服务/PID
- 重启输出
- 外部原收哈希

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`。

## E2E-3

实时到磁盘往返

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-001, AC-002, AC-003, AC-004, AC-010。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 原发送端模式 B；D-C/D-N 两类各准备3个干净会话，固定真实自然像素、DPI、浏览器缩放。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-3-S01** 原发送端加载 D-C，点击实时抓屏，在真实系统选择器中选独立发送窗口。
   预期：唯一捕获源/Worker，页面进入真实接收；不直接喂帧或自动假授权。
   留证：来源选择过程；环境/自然尺寸/profile；sessionId/seq。
2. **E2E-3-S02** 切回接收页等待真实完整产物，然后点击保存并选择本轮专有磁盘目录。
   预期：接收、待保存、选择位置、写入与已保存语义可辨；write/close 未完成不得已保存。
   留证：接收至待保存界面；实际保存交互；保存完成后四时点。
3. **E2E-3-S03** 在应用之外计算原文件和实际落盘文件的字节数与 SHA-256，再停止并等待清理。
   预期：两端哈希相等且文件真实存在，清理后无活动旧源。
   留证：外部 Get-FileHash 原始输出；输出路径/尺寸；清理记录。
4. **E2E-3-S04** D-C、D-N 各完成3个独立干净会话，逐轮保存和外部哈希，不只选择最快或成功一轮。
   预期：总计6个实时完整往返均有各自证据，失败/重试也保留。
   留证：6轮结果/耗时/attempt；每轮原收文件引用与外部哈希。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 只有 Ready/Blob/下载按钮没有磁盘输出或外部哈希时 FAIL；保存四时点缺失也不得当量测完整。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 来源选择过程
- 环境/自然尺寸/profile
- sessionId/seq
- 接收至待保存界面
- 实际保存交互
- 保存完成后四时点
- 外部 Get-FileHash 原始输出
- 输出路径/尺寸
- 清理记录
- 6轮结果/耗时/attempt
- 每轮原收文件引用与外部哈希

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`。

## E2E-4

取消选源再开始

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-006, AC-007。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 页面无活动接收，系统真实捕获选择器可操作。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-4-S01** 点击实时抓屏，出现真实系统来源选择器后取消。
   预期：取消后无假接收或旧进度，入口可重试。
   留证：取消对话框记录；前后会话与界面状态。
2. **E2E-4-S02** 回到页面重新点击，选择原发送窗口并等待完整重建。
   预期：新的有效会话可正常接收；无第二个残留选择器或旧回调污染。
   留证：重新选源过程；新会话归属；待保存截图。
3. **E2E-4-S03** 通过真实系统保存对话框写到本轮目录，并在外部核对哈希。
   预期：取消后真实恢复成功。
   留证：保存交互；保存后时点；外部原收 SHA-256。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 若环境提供独立“拒绝授权”入口须另执行、单独记录；仅取消不能代表全部拒绝路径已测。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 取消对话框记录
- 前后会话与界面状态
- 重新选源过程
- 新会话归属
- 待保存截图
- 保存交互
- 保存后时点
- 外部原收 SHA-256

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`。

## E2E-5

选错源与无数据恢复

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-006, AC-007。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 准备一个确实无编码画面的普通独立窗口和正确 B 模式发送窗口。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-5-S01** 点击实时抓屏，在系统选择器中选空白或错误窗口，等待当前 no-data 提示期限。
   预期：不假成功、不臆断唯一根因；用户可看到检查来源/模式和停止办法。
   留证：错误来源画面；真实等待时长；无有效数据界面。
2. **E2E-5-S02** 点击停止并等清理完成，然后重新点击实时抓屏选择正确原发送窗口。
   预期：恢复入口可用，旧无数据会话结束，新会话干净。
   留证：停止/清理状态；重新选源操作；新会话身份。
3. **E2E-5-S03** 等真实重建、系统保存，再外部计算原收哈希。
   预期：无需刷新或控制台补救即可恢复，字节一致。
   留证：保存对话框；落盘文件；外部 SHA-256。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 只扫描累计日志找到旧 no-data 行不能证明本轮；每轮取分发前基线和本轮增量。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 错误来源画面
- 真实等待时长
- 无有效数据界面
- 停止/清理状态
- 重新选源操作
- 新会话身份
- 保存对话框
- 落盘文件
- 外部 SHA-256

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`。

## E2E-6

外部停止共享/关闭源

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-006, AC-007。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. D-A/D-B 同名同大小不同哈希；A 足够长，能在完成前操作。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-6-S01** 开始接收 A，在尚未完整时使用系统/浏览器停止共享控件。
   预期：停止来源后不假完成；页面提示来源结束或未完成并可清理。
   留证：系统停止共享动作；前后界面/共享指示；本轮状态增量。
2. **E2E-6-S02** 清理后重新接收 A，另轮关闭真实源标签页/窗口。
   预期：源关闭路径同样可结束清理；两个动作分支单列，不能相互冒充。
   留证：独立源关闭动作；资源/状态时间线。
3. **E2E-6-S03** 每个异常分支之后都重新打开原发送端加载 B、真实选源、保存并外部核对。
   预期：新输出等于 B 且不等于 A，无 A 晚结果污染。
   留证：每分支恢复保存；A/B/输出三方外部哈希；新旧会话身份。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 旧 run-03 的共享指示条 UIA 不可达只证明外部关闭路径；本轮不可达时补人工，仍不可执行须单列 NOT_RUN/偏差，不将关闭源写成系统停止共享已测。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 系统停止共享动作
- 前后界面/共享指示
- 本轮状态增量
- 独立源关闭动作
- 资源/状态时间线
- 每分支恢复保存
- A/B/输出三方外部哈希
- 新旧会话身份

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`、`docs/dev-pipeline/stage5-dev-summary.md`、`docs/dev-pipeline/autonomous-decisions.md`。

## E2E-7

应用停止重复点击

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-007。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. A/B 同名同大小不同哈希；记录当前活动源、Worker 与清理标记。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-7-S01** A 真实传输中点击停止，并快速重复点击停止/开始。
   预期：停止幂等，清理尚未完成不能启动新会话，不出现双来源选择器。
   留证：真实点击录像；按钮状态；资源/清理时间线。
2. **E2E-7-S02** 按页面提示等清理后加载 B，重复点击开始并只确认一个真实捕获选择器。
   预期：仅一个活动源和 Worker；新会话计数从零，无 A 产物。
   留证：重复点击/选源记录；新会话身份；源/Worker计数。
3. **E2E-7-S03** 完整接收保存 B，外部核对 B 与输出哈希。
   预期：输出为 B，无旧进度/旧错误覆盖当前会话。
   留证：系统保存记录；B/输出外部哈希；停止后资源证据。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 仅脚本调用内部 stop/start 的压力测试归 IAT；不能替代实际用户按钮操作。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 真实点击录像
- 按钮状态
- 资源/清理时间线
- 重复点击/选源记录
- 新会话身份
- 源/Worker计数
- 系统保存记录
- B/输出外部哈希
- 停止后资源证据

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`。

## E2E-8

模式不匹配恢复

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-006, AC-013。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 接收基线 B，发送端另一个实际可用模式；不新增支持模式声明。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-8-S01** 原发送端切为实际非 B 模式，接收器仍 B，真实选择窗口开始接收。
   预期：不匹配时不产生虚假完整产物；可检查模式或停止。
   留证：发送/接收模式截图；真实来源；观察时长与状态。
2. **E2E-8-S02** 停止接收，将发送端改回 B；若页面内翻回不能恢复，按已知 TD-16 说明重载原发送端后重新加载原文件。
   预期：如实记录发送端已知限制及恢复动作，不把刷新补救隐去。
   留证：模式恢复操作；是否需要发送端重载；新会话状态。
3. **E2E-8-S03** 重新点击实时抓屏、真实选源并保存核外部哈希。
   预期：B 路线可正常恢复，输出与原件一致。
   留证：系统保存；原收外部哈希。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 非 B 候选模式实际不可用时说明条件并由 IAT 补分支；不得虚构模式已实测。
- 发送端翻回 B 后饥饿与接收器缺陷分别归因，保留首次失败。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 发送/接收模式截图
- 真实来源
- 观察时长与状态
- 模式恢复操作
- 是否需要发送端重载
- 新会话状态
- 系统保存
- 原收外部哈希

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`、`docs/dev-pipeline/stage5-dev-summary.md`、`docs/dev-pipeline/autonomous-decisions.md`。

## E2E-9

DPI/缩放/尺寸

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-001, AC-006, AC-012。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 先记录操作者当前日常 DPI/缩放；只对已声明支持组合逐项验收。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-9-S01** 保持当前日常桌面 DPI、浏览器缩放，选原发送窗口完成往返保存。
   预期：正常基线无需隐藏特殊设置；记录实际自然像素。
   留证：系统/浏览器设置；编码区画面/自然尺寸；外部原收哈希。
2. **E2E-9-S02** 分别调整发送窗口与接收窗口大小，再逐项测试已声明的 DPI/zoom 组合。
   预期：不得悄悄缩图；每种声称支持组合独立列实际结果。
   留证：逐组合配置/自然尺寸；逐次输出/外部哈希。
3. **E2E-9-S03** 仅在真实可达时选择超像素预算来源，观察拒绝，再恢复支持尺寸并正常保存。
   预期：超预算不截断假成功、可恢复；不可构造的精确边界由 IAT 补且注明。
   留证：真实预算条件和提示；恢复哈希；不可达分支依据。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 不能将 CSS 缩放测试写成操作系统 DPI 已测；未测组合不得发布支持。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 系统/浏览器设置
- 编码区画面/自然尺寸
- 外部原收哈希
- 逐组合配置/自然尺寸
- 逐次输出/外部哈希
- 真实预算条件和提示
- 恢复哈希
- 不可达分支依据

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`、`docs/dev-pipeline/stage5-dev-summary.md`、`docs/dev-pipeline/autonomous-decisions.md`。

## E2E-10

焦点/遮挡/最小化

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-001, AC-006, AC-007。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 已验证正常可捕获窗口；较长载荷避免操作前已 Ready。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-10-S01** 真实接收时切回接收页查看状态并完成保存。
   预期：用户能正常查看接收页而完成，不要求全程盯发送端。
   留证：窗口焦点/布局录像；保存及外部哈希。
2. **E2E-10-S02** 另一个未完成会话中遮挡源后还原，再另轮最小化源后还原；逐分支记录输入实际行为。
   预期：是否供帧按平台实测；不供新数据时不假成功，冻结重复画面也不能假定为无数据。
   留证：各分支遮挡/最小化动作；输入/数据观测；等待提示和恢复。
3. **E2E-10-S03** 按页面已验证操作恢复或停止重试，再系统保存和外部哈希。
   预期：恢复方法真实可用，各已执行分支有字节证据。
   留证：各分支恢复操作；原收外部哈希；支持布局说明。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 遮挡与最小化分开列；某分支未执行不能用另一分支成功冒充。
- 不承诺平台未提供的后台持续捕获能力。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 窗口焦点/布局录像
- 保存及外部哈希
- 各分支遮挡/最小化动作
- 输入/数据观测
- 等待提示和恢复
- 各分支恢复操作
- 原收外部哈希
- 支持布局说明

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`、`docs/dev-pipeline/stage5-dev-summary.md`、`docs/dev-pipeline/autonomous-decisions.md`。

## E2E-11

保存取消无需重传

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-003, AC-004, AC-009。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 真实重建完成；仅停止发送，不点击接收端停止/重置以免销毁当前 Blob。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-11-S01** 关闭发送源或停止动画，保留当前待保存产物，点击保存并在系统对话框取消。
   预期：取消不显示已保存，产物仍可重试，无新传输。
   留证：发送停止证据；系统保存取消；artifactId/attemptId。
2. **E2E-11-S02** 在页面重新点击保存，真实选择本轮新目标路径并确认。
   预期：同一 artifact、新 save attempt；write/close 完成才已保存。
   留证：第二次真实点击/保存对话框；同 artifact/新 attempt；保存完成后四时点。
3. **E2E-11-S03** 不重开发送源，对实际输出在应用之外计算字节数和哈希。
   预期：无需重传即可保存相同字节。
   留证：发送仍关闭；实际落盘文件；外部原收 SHA-256。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 误点接收端停止/重置造成产物释放属于不同操作，不能据此声称本例不支持重试或偷偷重新发送后记通过。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 发送停止证据
- 系统保存取消
- artifactId/attemptId
- 第二次真实点击/保存对话框
- 同 artifact/新 attempt
- 保存完成后四时点
- 发送仍关闭
- 实际落盘文件
- 外部原收 SHA-256

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`。

## E2E-12

中文名/重名确认

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-003, AC-004, AC-009。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 中文空格 basename 原件；仅在本轮专有目录创建可丢弃的同名哨兵并先存外部哈希。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-12-S01** 真实重建后点击保存，核对系统对话框建议 basename。
   预期：正确、安全的建议名；缺原名时用文档回退名，不静默越界。
   留证：原名/建议名截图；哨兵初始路径和哈希。
2. **E2E-12-S02** 选择同名目标但取消覆盖，然后用外部工具复算哨兵。
   预期：取消不成功、不覆盖，哨兵字节与哈希完全不变。
   留证：取消覆盖对话框；哨兵前后外部哈希。
3. **E2E-12-S03** 重新点击保存改为另名；另轮对第二个可丢弃哨兵显式确认覆盖。
   预期：实际所选输出正确；只有用户确认才覆盖。
   留证：改名和显式覆盖交互；两个实际目标路径；各次外部原收哈希/保存四时点。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 不得用用户现有重要文件做重名试验；危险路径/缺名的纯输入边界由 IAT 补并标层级。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 原名/建议名截图
- 哨兵初始路径和哈希
- 取消覆盖对话框
- 哨兵前后外部哈希
- 改名和显式覆盖交互
- 两个实际目标路径
- 各次外部原收哈希/保存四时点

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`。

## E2E-13

保存模态与停止

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-003, AC-007, AC-009。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 已有真实完整产物；系统保存模态可能阻塞页面点击。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-13-S01** 在页面快速重复点击保存，观察真实系统对话框。
   预期：仅一个有效保存流程，无重叠选择器或重复写入。
   留证：连续点击录像；保存 attempt/写入次数。
2. **E2E-13-S02** 在模态中取消或关闭，回到页面后点击停止，等清理并重新接收另一文件。
   预期：不要求用户在阻塞页面的模态中点击停止；返回后能清理和重启。
   留证：模态取消/返回后停止操作；新接收保存外部哈希。
3. **E2E-13-S03** 另轮实际保存成功后点击停止，并在磁盘复查该文件。
   预期：停止不删除已保存文件，原收哈希保持一致。
   留证：已保存后停止录像；文件存在/外部哈希；保存后时点。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 选择器未返回时内部 stop、延迟 write/close 等技术竞态归 IAT，不把脚本调用冒充用户可操作路径。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 连续点击录像
- 保存 attempt/写入次数
- 模态取消/返回后停止操作
- 新接收保存外部哈希
- 已保存后停止录像
- 文件存在/外部哈希
- 保存后时点

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`。

## E2E-14

真实录像成功

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-003, AC-004, AC-010, AC-014。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. V-GOOD-C/N 来自真实原发送窗口；每个声明支持的容器/编码可播放，媒体 manifest/原件哈希就位。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-14-S01** 关闭发送端，确认无实时捕获，点击录像导入并在真实系统选择器选 V-GOOD。
   预期：录像入口实际可用，不靠 DOM 注入或后台实时流完成。
   留证：发送停止/无捕获证据；真实打开对话框；媒体摘要/录制参数。
2. **E2E-14-S02** 等待受控播放与真实文件重建，点击系统保存。
   预期：录像进度与文件完整不同；完整产物才待保存，实际 close 完成才已保存。
   留证：媒体呈现与界面；保存交互；保存完成后四时点。
3. **E2E-14-S03** 在外部核原件与输出哈希；对 D-C/D-N 各3个干净会话并覆盖每个发布支持格式。
   预期：至少一种真实格式通过；总计至少6轮录像完整往返，发布的每个格式均有证据。
   留证：每轮原收文件/外部哈希；格式/会话/attempt矩阵；录制与处理时长。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 只有加载/播放成功不是文件接收成功；新录像应有新实测哈希，不粘贴历史媒体哈希。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 发送停止/无捕获证据
- 真实打开对话框
- 媒体摘要/录制参数
- 媒体呈现与界面
- 保存交互
- 保存完成后四时点
- 每轮原收文件/外部哈希
- 格式/会话/attempt矩阵
- 录制与处理时长

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`、`docs/tests/runs/20261021-teamexec-03/reproduction.md`。

## E2E-15

录像取消/坏文件恢复

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-006, AC-008, AC-014。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. V-GOOD 与空/非视频/损坏/本浏览器实际不支持候选均登记摘要；每分支独立保存恢复目录。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-15-S01** 在空闲页面点击录像导入，取消真实系统打开对话框，再立刻真实选择 V-GOOD、重建、系统保存核外部哈希。
   预期：取消不会伪造 change/新会话；入口可用，同页面真实恢复，不需刷新。
   留证：取消前后状态/attempt；真实重选/保存交互；recovery-cancel 外部原收哈希及保存四时点。
2. **E2E-15-S02** 分别通过真实录像入口和系统打开对话框导入空、非视频、损坏输入，每次取分发前基线并等本轮有限终态。
   预期：本轮实际摄入、身份推进/状态离 Idle、本轮错误增量、无 already-active 假拒绝；无假产物，可重启且清理完成。
   留证：每输入摘要/真实选择过程；本轮增量错误与终态/按钮/cleanup；逐坏输入独立结果。
3. **E2E-15-S03** 每个坏输入失败后立即通过真实录像入口重选 V-GOOD，系统保存并外部核哈希，再进入下一个坏输入。
   预期：每个异常都有单独真实恢复；一个最后总恢复不能覆盖前面多个异常。
   留证：recovery-empty/text/corrupt 各自目录；每恢复会话/attempt；各保存后四时点和外部哈希。
4. **E2E-15-S04** 对实际不支持媒体候选执行同样失败→单独真实恢复；若候选实际支持则记录支持，不把成功伪装“不支持”。
   预期：真实不支持分支有限结束且可恢复；无法构造时说明不适用并用 IAT 补，不虚报。
   留证：候选媒体参数/能力实测；不支持分支状态与单独恢复或不适用依据。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 现有 runner 的 empty/text/corrupt 使用 DataTransfer，仅为 IMPORT-PATH-ONLY，不证明真实打开入口；本轮 UAT 必须补真实系统选择，或如实留缺口。
- 坏输入后 Preparing/超时/旧错误码均不能 PASS；恢复对话框自动化不可达时补人工，不补则 NOT_RUN。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 取消前后状态/attempt
- 真实重选/保存交互
- recovery-cancel 外部原收哈希及保存四时点
- 每输入摘要/真实选择过程
- 本轮增量错误与终态/按钮/cleanup
- 逐坏输入独立结果
- recovery-empty/text/corrupt 各自目录
- 每恢复会话/attempt
- 各保存后四时点和外部哈希
- 候选媒体参数/能力实测
- 不支持分支状态与单独恢复或不适用依据

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`、`docs/dev-pipeline/stage5-dev-summary.md`、`docs/dev-pipeline/autonomous-decisions.md`、`docs/tests/runs/20261021-teamexec-03/reproduction.md`、`tools/desktop-recv/e2e/leg-verdict.mjs`、`docs/tests/runs/20261021-teamexec-03/results.json`。

## E2E-16

录像EOF与最终帧

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-002, AC-008, AC-014。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. V-SHORT 与同流同步双录制器 V-LAST-with/without 配对；真实文件哈希、payload 哈希、声明 cut、prefix-check、接收侧时长齐全。
5. 配对录制一次 getDisplayMedia、两个同任务 start 的 MediaRecorder；不再采用逐段 reload 同前缀假设，也不能字节截断假 EOF。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-16-S01** 通过真实录像导入入口选 V-SHORT，播放至实际 EOF 并等待当前 profile 有限排空。
   预期：不足结束为未完成，无 Ready/产物，不无限重放；每步观察上界预先登记。
   留证：媒体文件与摘要；真实导入；ended/最终帧/排空时间线。
2. **E2E-16-S02** 导入 V-LAST-without 播放至真实 EOF，记录媒体时长、最后呈现时间和无产物。
   预期：EOF 媒体时间达到声明 cut−1.0s 容差，仍无产物；不把装置提前中断当对照。
   留证：配对 manifest/prefix-check；without EOF/lastUs/时长；该腿状态/无产物断言。
3. **E2E-16-S03** 导入同流 V-LAST-with，等待最终有效帧及在途结果，保存并外部核哈希。
   预期：真实产物成功优先；完成媒体时间 T*=lastUs/1e6≥接收侧 withDurationSec−2.0 且 T*>without 时长；artifactFrameId 仅帧身份。
   留证：with 接收侧 open-precheck 时长；T*计算及独立 frameId；末段 result/artifact/EOF 顺序；保存后四时点和外部哈希。
4. **E2E-16-S04** 核对 prefix-check 同流共享头和声明裁停对应尾帧证据，以及 with 完成时 mediaEnded 状态；若末段判据不成立按预定预算重录。
   预期：配对因果和量纲正确；不能用重放/旧哈希或固定录像长度自动宣称最后关键帧通过；最多2轮校准，耗尽仍如实失败。
   留证：同流构造/头尾检查；with mediaEnded/尾事件；重录记录与新媒体哈希。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 缺共享前缀/尾帧、without 未真正 EOF、with 提前远离末段、frameId 当秒数、保存前快照量测均拒绝。
- 精确 ended/Worker 回复竞态仍由 IAT 补；不能只控回调就声称真录像本例 PASS。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 媒体文件与摘要
- 真实导入
- ended/最终帧/排空时间线
- 配对 manifest/prefix-check
- without EOF/lastUs/时长
- 该腿状态/无产物断言
- with 接收侧 open-precheck 时长
- T*计算及独立 frameId
- 末段 result/artifact/EOF 顺序
- 保存后四时点和外部哈希
- 同流构造/头尾检查
- with mediaEnded/尾事件
- 重录记录与新媒体哈希

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`、`docs/dev-pipeline/stage5-dev-summary.md`、`docs/dev-pipeline/autonomous-decisions.md`、`docs/tests/runs/20261021-teamexec-03/reproduction.md`、`tools/desktop-recv/e2e/leg-verdict.mjs`、`docs/tests/runs/20261021-teamexec-03/results.json`、`tools/desktop-recv/e2e/record-sender.mjs`、`tools/desktop-recv/e2e/pair-evidence.mjs`、`tools/desktop-recv/e2e/video-prefix-check.py`。

## E2E-17

双输入停止切换

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-007, AC-008, AC-004。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. A 录像与 B 不同内容且哈希已存；准备 B 原发送端和 B 真实录像。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-17-S01** 真实导入尚未完成的 A 录像，处理中点击停止并等清理。
   预期：旧媒体暂停/解绑、Object URL/回调/Worker 清理，旧数据不能继续修改页面。
   留证：真实导入/停止；媒体/URL/Worker资源时间线。
2. **E2E-17-S02** 点击实时抓屏，真实选择发送 B 的独立窗口，重建、系统保存并外部核对。
   预期：新输入实时、新会话从零；输出等于 B 且不等于 A。
   留证：新来源/会话；A/B/输出外部哈希；保存后时点。
3. **E2E-17-S03** 反向执行实时 A 中停→清理→真实导入 B 录像→重建保存。
   预期：两方向均不串旧源/旧 srcObject/晚回调，B 字节一致。
   留证：反向全程操作；清理/新媒体归属；B录像输出外部哈希。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 切换前未完成清理、预览隐藏致 rVFC 停滞或旧流留在 srcObject 均失败；不得刷新掩盖。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 真实导入/停止
- 媒体/URL/Worker资源时间线
- 新来源/会话
- A/B/输出外部哈希
- 保存后时点
- 反向全程操作
- 清理/新媒体归属
- B录像输出外部哈希

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`。

## E2E-18

扩展规模和预算恢复

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-006, AC-012, AC-004。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 完整10腿逐项参照 cases/e2e18-matrix.json；确定性扩展输入重新核哈希，媒体按本轮运行根重建或登记受控输入副本。
5. TD-15 已关闭，4MiB 难压缩录像已可行且必测；不能沿用旧128KiB装置上限或未批准草案缩减。
6. 录像/导入观察上界须执行前登记；1MiB探针可用后完整4MiB腿仍须运行，失败不自动变为批准 NOT_RUN。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-18-S01** 依矩阵在真实原发送窗口分别加载两类1MiB/4MiB样本，真实选源接收并逐腿系统保存、外部核哈希。
   预期：4条实时腿各自正确，不用一个 canonical 文件代表所有腿已执行。
   留证：4腿输入/自然尺寸/profile；每腿选择/保存过程；各腿外部原收哈希与保存后时点。
2. **E2E-18-S02** 按矩阵准备真实 video-c-4mib、video-n-128kib、video-n-1mib-probe、video-n-4mib，停止发送/实时输入后逐腿真实导入与系统保存。
   预期：4条录像腿实际运行；每腿同源输入/录像哈希、有限观察、末段状态和输出可追踪。
   留证：录像 manifest/录制参数/边界声明；4腿真实入口/无后台源；每腿媒体时间线/哈希/保存四时点。
3. **E2E-18-S03** 真实发送可压缩20MiB超产物预算样本，记录本轮15008拒绝，点击停止清理，再正常文件完整接收保存。
   预期：验证的是解压后产物预算，不是像素拒绝；越界无可保存产物，恢复输出哈希正确；恢复时点独立重置。
   留证：原始/编码/预算尺寸和profile；拒绝增量15008/无产物/可停止；budget-recovery 真实保存/哈希/保存四时点。
4. **E2E-18-S04** 逐项列10腿结果并核对每腿构建、attempt和执行来源，单列未运行难压缩20MiB额外探测腿。
   预期：只有 live-n-20mib-over-budget 可按D-19带当前代码依据 NOT_RUN；其余9腿必须 PASS，矩阵缺腿/其他NOT_RUN/任何FAIL均不通过。
   留证：10腿清单/逐腿结果；每腿executedInAttempt和非当前携带来源；唯一例外代码级依据。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 装置录制失败/缺媒体时诚实 NOT_RUN，但除唯一授权腿外不得因此把总矩阵置 PASS。
- 录像导入已呈现足够内容仍未重建或中途停滞应调查接收端 FAIL，不预先归为平台/容量限制。
- 重跑合并须 fresh-only 打章；失败attempt不能冒领历史腿，旧run03 PASS不能带入本轮候选。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 4腿输入/自然尺寸/profile
- 每腿选择/保存过程
- 各腿外部原收哈希与保存后时点
- 录像 manifest/录制参数/边界声明
- 4腿真实入口/无后台源
- 每腿媒体时间线/哈希/保存四时点
- 原始/编码/预算尺寸和profile
- 拒绝增量15008/无产物/可停止
- budget-recovery 真实保存/哈希/保存四时点
- 10腿清单/逐腿结果
- 每腿executedInAttempt和非当前携带来源
- 唯一例外代码级依据

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`、`docs/dev-pipeline/stage5-dev-summary.md`、`docs/dev-pipeline/autonomous-decisions.md`、`docs/tests/runs/20261021-teamexec-03/reproduction.md`、`tools/desktop-recv/e2e/leg-verdict.mjs`、`docs/tests/runs/20261021-teamexec-03/results.json`。

## E2E-19

刷新/关页/服务重启

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-006, AC-007, AC-013。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 无未决系统模态或保存写入；先保留一个已存文件及外部哈希。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-19-S01** 接收中真实刷新页面，观察共享/处理终止，然后从页面入口重新选源保存。
   预期：新实例无幽灵捕获/旧进度，恢复输出正确。
   留证：刷新前后共享/资源状态；重新接收操作；外部原收哈希。
2. **E2E-19-S02** 另轮接收中真实关闭接收页，复核旧页确已关闭，再打开说明入口并往返。
   预期：不能只导航假装关页；重开是新实例，无旧会话串入。
   留证：旧页关闭/新页入口；资源清理；新输出外部哈希。
3. **E2E-19-S03** 按用户手册停接收服务、重新启动并完成真实往返，再复查原先保存文件。
   预期：服务重启可用；已有磁盘文件不删除或改写。
   留证：服务停止/重启输出；新往返哈希；既有文件前后哈希。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 原生保存未决时强制离页的技术竞态另归 IAT；不承诺浏览器退出事务回滚。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 刷新前后共享/资源状态
- 重新接收操作
- 外部原收哈希
- 旧页关闭/新页入口
- 资源清理
- 新输出外部哈希
- 服务停止/重启输出
- 新往返哈希
- 既有文件前后哈希

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`。

## E2E-20

连续使用与最终包

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T35, T36；AC：AC-004, AC-005, AC-007, AC-010, AC-013, AC-014。
- 入口：从本轮候选用户说明启动正常 Edge 接收器；原发送端独立窗口或真实录像入口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 阶段5固定候选先完成10轮混合生命周期；最终包入口段在阶段8独立追加，不是 T35/T36 候选本地门禁的循环前置。
5. 基础真实路径通过；A/B、两类样本与录像已就位，记录初始活动track/Worker/URL基线。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-20-S01** 按预先排定的10轮表交替实时/录像与 A/B，穿插捕获取消、处理中停止、保存取消重试。
   预期：10轮每轮独立终态/清理与实际输出，所有已执行保存有外部哈希，不强制刷新掩盖恢复失败。
   留证：预排10轮表；每轮操作/状态/资源；每次保存后时点和外部哈希。
2. **E2E-20-S02** 每轮停止后核对资源归属和释放，下一轮从页面已恢复入口开始。
   预期：无累积活动源/Worker/URL或旧数据串入；可用性异常即阻断。
   留证：逐轮资源时间线；A/B与输出三方哈希；失败/重试原始记录。
3. **E2E-20-S03** 候选10轮完成时登记仅阶段5结果、冻结产品摘要，并列阶段8最终包复验为待执行。
   预期：不要求先执行尚未发生的最终发布；不把候选 PASS写成最终包/现场 PASS。
   留证：候选清单与10轮结果；阶段8待办和证据边界。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 候选资产与结果manifest不同、连续流程必须靠刷新修复或少轮次，不得记通过。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 预排10轮表
- 每轮操作/状态/资源
- 每次保存后时点和外部哈希
- 逐轮资源时间线
- A/B与输出三方哈希
- 失败/重试原始记录
- 候选清单与10轮结果
- 阶段8待办和证据边界

阶段8单独复核（不计入本例阶段5必需步骤/证明）：

- 阶段8最终包装从全新目录依 E2E-1/3/11/14复验，双输入×两类数据并包含保存取消重试。
  预期：最终包与被引用产品资产字节绑定；纯包装变动只补受影响入口，产品字节变更按影响重跑。
  留证：最终包/环境/产品摘要；阶段8独立attempt/真实操作；双输入两类外部哈希/保存重试。

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`、`docs/dev-pipeline/stage5-dev-summary.md`、`docs/dev-pipeline/autonomous-decisions.md`。

## E2E-21

真实云桌面实时

- 范围/执行者：`real_cloud` / `user`；阶段`FIELD`，`field`必测；当前NOT_RUN、执行者null。
- 本轮任务：T36；AC：AC-001, AC-004, AC-011。
- 入口：宿主机正常浏览器中的候选接收器；云端原发送端→真实桌面客户端窗口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 用户在真实云桌面客户端中运行本项目原发送端 B；宿主机使用本轮接收器，不能用本地模拟源替代。
5. T36只准备空回执和如实报告独立 field 门禁；实际执行留用户现场（路线图T4.2.d），不计入阶段5本地已执行。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-21-S01** 用户记录客户端/云端/宿主机/浏览器/显示设置和当前包摘要，在云端加载 D-C 原件并独立计算云端 SHA-256。
   预期：现场范围、原件和版本可追踪；远程桌面可为原生客户端，不要求运行在浏览器。
   留证：现场环境/版本；云端原件尺寸和外部哈希。
2. **E2E-21-S02** 宿主机点击实时抓屏，真实选择该桌面客户端窗口，等完成并通过系统保存到宿主磁盘。
   预期：跨真实云桌面画面接收成立；已保存以真实 write/close 完成计。
   留证：真实客户端窗口选择/布局；接收和系统保存；保存后时点。
3. **E2E-21-S03** 宿主机外部复算输出哈希，对 D-N 重复并与云端原件逐一比对。
   预期：两类样本分别字节一致；只有当前客户端/设置/样本范围得到现场结论。
   留证：云端/宿主机外部哈希原始输出；双类现场回执；用户实际执行人/时间。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 用户此前“可以传文件”口述仅 USER_REPORTED_SUCCESS，不替代本轮六项现场结果。
- 无法访问现场或用户未执行时保留 NOT_RUN，不以本地 PASS代填。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 现场环境/版本
- 云端原件尺寸和外部哈希
- 真实客户端窗口选择/布局
- 接收和系统保存
- 保存后时点
- 云端/宿主机外部哈希原始输出
- 双类现场回执
- 用户实际执行人/时间

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`。

## E2E-22

真实云桌面录像

- 范围/执行者：`real_cloud` / `user`；阶段`FIELD`，`field`必测；当前NOT_RUN、执行者null。
- 本轮任务：T36；AC：AC-004, AC-011, AC-014。
- 入口：宿主机正常浏览器中的候选接收器；云端原发送端→真实桌面客户端窗口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 真实录制桌面客户端中原发送端双类样本；媒体参数、原件与媒体摘要已登记。
5. T36只准备空回执和如实报告独立 field 门禁；实际执行留用户现场（路线图T4.2.d），不计入阶段5本地已执行。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-22-S01** 用户从实际云桌面客户端窗口录制足量编码画面并记录工具、容器/编码、尺寸、帧率、时长及媒体哈希。
   预期：媒体来源真实，至少一个公布支持组合有实际材料。
   留证：真实录制来源/参数；媒体完整哈希；云端原件外部哈希。
2. **E2E-22-S02** 停止发送与退出实时接收后，在宿主机真实点击录像导入并选择录像。
   预期：没有后台实时输入；导入入口、媒体读取与文件接收区分正确。
   留证：发送/捕获已停止；真实系统打开对话框；媒体/会话状态。
3. **E2E-22-S03** 用户实际保存到宿主磁盘，外部核对输出与云端原件哈希，双类样本分别执行。
   预期：录像途径真实跨客户端往返，字节相等；未公布格式不虚称支持。
   留证：系统保存和四时点；双类云端/宿主机哈希；用户现场回执。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 无现场录像或只在本地发送端录制时不算此现场用例通过。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 真实录制来源/参数
- 媒体完整哈希
- 云端原件外部哈希
- 发送/捕获已停止
- 真实系统打开对话框
- 媒体/会话状态
- 系统保存和四时点
- 双类云端/宿主机哈希
- 用户现场回执

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`。

## E2E-23

现场日常显示布局

- 范围/执行者：`real_cloud` / `user`；阶段`FIELD`，`field`必测；当前NOT_RUN、执行者null。
- 本轮任务：T36；AC：AC-006, AC-007, AC-011, AC-012。
- 入口：宿主机正常浏览器中的候选接收器；云端原发送端→真实桌面客户端窗口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 用户日常真实客户端布局/DPI/zoom，已知正确接收路线和较长样本。
5. T36只准备空回执和如实报告独立 field 门禁；实际执行留用户现场（路线图T4.2.d），不计入阶段5本地已执行。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-23-S01** 保持现场日常显示设置，真实接收时切回宿主接收器查看状态并保存。
   预期：日常已支持路径可用，不暗中改成开发者特殊布局。
   留证：现场显示/窗口配置；切焦点录像；输出外部哈希。
2. **E2E-23-S02** 另轮分别遮挡、最小化真实客户端，再还原，逐项记录是否持续新供帧/新数据。
   预期：平台行为如实呈现；冻结画面不等同无数据，不能虚构故障原因或假完成。
   留证：每分支实际操作；帧/数据/提示时间线。
3. **E2E-23-S03** 按手册恢复或停止重选，完成保存并回填实测支持范围。
   预期：恢复可执行；未测设置或环境受限保持 NOT_RUN/限制。
   留证：恢复操作；落盘外部哈希；现场支持范围回执。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 本地源/模拟器结果不得填现场；未测DPI组合不冒充全部支持。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 现场显示/窗口配置
- 切焦点录像
- 输出外部哈希
- 每分支实际操作
- 帧/数据/提示时间线
- 恢复操作
- 落盘外部哈希
- 现场支持范围回执

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`。

## E2E-24

现场取消停止重启

- 范围/执行者：`real_cloud` / `user`；阶段`FIELD`，`field`必测；当前NOT_RUN、执行者null。
- 本轮任务：T36；AC：AC-006, AC-007, AC-011, AC-004。
- 入口：宿主机正常浏览器中的候选接收器；云端原发送端→真实桌面客户端窗口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 真实客户端，A/B同名同大小不同外部哈希；用户可操作真实捕获选择器。
5. T36只准备空回执和如实报告独立 field 门禁；实际执行留用户现场（路线图T4.2.d），不计入阶段5本地已执行。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-24-S01** 用户点击实时抓屏并取消真实系统选源，再正常重开选择客户端窗口。
   预期：取消后可恢复，无旧进度和残留来源。
   留证：取消/重选交互；会话/状态时间线。
2. **E2E-24-S02** A 未完成时用户点停止，清理后由云端发送 B，再真实接收保存。
   预期：B无A串入，输出哈希等于B、不等于A。
   留证：停止/清理/重选；云端A/B与宿主输出外部哈希。
3. **E2E-24-S03** 另轮用户使用系统停止共享控件，按手册重新接收并保存。
   预期：系统外部终止可恢复，资源释放；未能执行此分支单列真实缺口。
   留证：系统停止共享动作；资源/恢复状态；恢复保存哈希。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 源关闭与系统停止共享不能无说明相互替代；每异常之后都应有对应恢复证据。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 取消/重选交互
- 会话/状态时间线
- 停止/清理/重选
- 云端A/B与宿主输出外部哈希
- 系统停止共享动作
- 资源/恢复状态
- 恢复保存哈希

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`。

## E2E-25

现场实际保存恢复

- 范围/执行者：`real_cloud` / `user`；阶段`FIELD`，`field`必测；当前NOT_RUN、执行者null。
- 本轮任务：T36；AC：AC-003, AC-004, AC-009, AC-011。
- 入口：宿主机正常浏览器中的候选接收器；云端原发送端→真实桌面客户端窗口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 真实云桌面已重建产物，专有可丢弃哨兵目录与中文/空格名样本。
5. T36只准备空回执和如实报告独立 field 门禁；实际执行留用户现场（路线图T4.2.d），不计入阶段5本地已执行。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-25-S01** 用户停止云端发送但保留宿主待保存产物，点击保存并取消系统对话框。
   预期：取消不假已保存、不要求重传，产物仍可重试。
   留证：发送停止；保存取消；同artifact/attempt记录。
2. **E2E-25-S02** 重新点击保存，验证中文建议名、同名取消不改哨兵，再新命名或显式覆盖专有哨兵。
   预期：无静默覆盖；系统对话框操作与用户目标一致。
   留证：中文名/覆盖交互；哨兵前后哈希；实际目标路径。
3. **E2E-25-S03** 在宿主机外部计算最终输出哈希，与云端原件比较并回填。
   预期：真实磁盘字节正确，保存结束四时点齐全。
   留证：保存后四时点；云端/宿主机外部哈希；用户现场回执。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 不对用户重要现存文件做覆盖试验；不自动删除或回滚已经实际保存的文件。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 发送停止
- 保存取消
- 同artifact/attempt记录
- 中文名/覆盖交互
- 哨兵前后哈希
- 实际目标路径
- 保存后四时点
- 云端/宿主机外部哈希
- 用户现场回执

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`。

## E2E-26

现场测量回执与整改

- 范围/执行者：`real_cloud` / `user`；阶段`FIELD`，`field`必测；当前NOT_RUN、执行者null。
- 本轮任务：T36；AC：AC-005, AC-011, AC-012, AC-013。
- 入口：宿主机正常浏览器中的候选接收器；云端原发送端→真实桌面客户端窗口

前置：

1. 当前为规划，未执行；仅使用本轮新运行根/候选清单/attempt。旧 run-03 只读，不抄旧 PASS 或改写历史证据。
2. 未来执行前先完成 T1～T6 运行上下文隔离；当前 runner 的历史 RUN/STAGING/PLANNING 默认值不可直接使用。正常启动 Edge 后 CDP 附加，Windows 桌面/剪贴板/对话框独占串行。
3. 按当前真实用户说明操作；真实捕获和文件选择/保存对话框由工具或人工执行。注入帧、DataTransfer、模拟句柄只作对应 IAT/导入路径证据，不能替代本例要求的系统入口。
4. 现场双输入实际执行记录、当前版本摘要、全部重试/失败记录；旧现场性能阈值文件或明确未确认状态。
5. T36只准备空回执和如实报告独立 field 门禁；实际执行留用户现场（路线图T4.2.d），不计入阶段5本地已执行。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-26-S01** 用户或实施方协助整理现场双输入两类样本的自然尺寸/fps、原始/编码/产物字节、初始化/重建/选择器等待/写入时点及重复结果。
   预期：量纲和起止边界明确，用户决策等待不混入解码吞吐；保存量测来自保存后。
   留证：现场原始时点/样本与录像摘要；重复/失败/重试原始数据；计算公式与单位。
2. **E2E-26-S02** 由用户填写现场空回执，分别列功能、测量、性能目标评定、支持范围与现场状态。
   预期：没冻结现场阈值则 NOT_EVALUATED；本轮UX开销方法不能代填旧现场吞吐阈值或伪造性能PASS。
   留证：用户实际填写回执；旧性能阈值依据或未确认状态；版本/环境绑定。
3. **E2E-26-S03** 失败时保留可复现材料；需要回退时停止候选，按手册切回整套已验证入口并核对，不删除已存文件。
   预期：先归因、最小整改与受影响复验；保留旧证据与输出，不能混用资产。
   留证：失败步骤/来源/媒体/日志；回退整套摘要与入口；文件保留/复验记录。

失败/恢复：

- 必需动作或证据缺失则保持 NOT_RUN/BLOCKED；已执行但违反预期为 FAIL，不能以旧结果、mock或总通过率覆盖。
- 自动化无法操纵真实系统步骤时改人工留证；未实际执行不得伪填 executedBy、时间或 PASS。
- 用户未执行不能补签执行人或时间；只有口述成功没有尺寸/哈希/回执不闭合本例。
- 性能未确认不能由功能成功升级；本地或UX性能method不能替代现场旧批准判据。

必需证明：

- 本轮产品/输入manifest摘要、sourceRevision/harnessRevision、runId/attemptId、每腿实际执行来源、实际执行人/时间和环境。
- 本轮真实用户动作、可见状态/按钮及相应日志增量；每个失败和重试保留，不只摘成功截图。
- 凡执行保存：原件与实际磁盘输出的路径、字节数和外部 SHA-256；保存后读取且同 attempt 的 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt 四个有限有序时点。无保存腿显式不适用，不填假0。
- 现场原始时点/样本与录像摘要
- 重复/失败/重试原始数据
- 计算公式与单位
- 用户实际填写回执
- 旧性能阈值依据或未确认状态
- 版本/环境绑定
- 失败步骤/来源/媒体/日志
- 回退整套摘要与入口
- 文件保留/复验记录

来源：`docs/tests/planning-cases.json`、`docs/plans/test-acceptance-plan.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/leg-timings.mjs`、`docs/dev-pipeline/ext-review/round-11-verdict.md`。

## E2E-27

实时等待→数据识别→可保存→真实写盘

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T13, T35, T36；AC：AC-015, AC-016, AC-017, AC-018, AC-020, AC-022, AC-024。
- 入口：从本轮candidate说明启动接收页，主区点击“实时抓屏”

前置：

1. 新context绑定最终产品清单；原发送端Mode B，128KiB或更长难压缩样本已核SHA且不会一帧即完成
2. 固定发送源窗口可由SRC-01测试画面层先显示空白再显示原发送码；这只改变真实源像素，不调用接收端输入接口
3. 正常Edge，源选择器/保存对话框可真实操作；诊断默认收起

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-27-S01** 按用户说明启动接收页面；不打开日志，点击“实时抓屏”，在系统选择器选实际源窗口并确认共享
   预期：两个接收按钮仍存在，活动期互锁；进入准备/接收等待，保存不能提前点击
   留证：入口/按钮/选择器实际截图；源窗口标题与环境/构建摘要。
2. **E2E-27-S02** 保持源为无有效码至少6秒；记录一个前台5秒区间的真实业务revision和可见用时
   预期：等待有效数据有文字和下一步建议，≥5秒提示；用时随时间变、不会把画面帧当文件进度；无snapshot也不停止计时
   留证：等待0/5/6秒截图或短录制；真实revision与用时取证时点。
3. **E2E-27-S03** 在同一所选源移除空白视觉层，播放原发送端实际码；不停止接收
   预期：首次真实data后主区显示接收活动，预热后有含冗余KiB/s；有可信单流报告才显示重建估计
   留证：真实源画面前后证明；data/frame结果只读观察与主区对应时序。
4. **E2E-27-S04** 继续播放直到原严格重建产生Ready；在出现可保存后暂停/关闭发送输入
   预期：Ready明确“文件已接收完成，请保存”，文件名/大小取真实artifact；未写盘时不显示已保存；用时冻结、速度不继续虚增
   留证：Ready和文件信息截图；真实状态/产物事件与接收用时冻结对照。
5. **E2E-27-S05** 点击保存，在真实系统窗口选本轮专有目标路径；等待写入与close完成
   预期：选择路径/保存中/已保存分开，关闭写盘后才Saved；界面说明下一步
   留证：系统选择/写入/Saved截图；实际saveRequest/writable/writeClose时点。
6. **E2E-27-S06** 应用外对原/收实物分别执行Get-FileHash -Algorithm SHA256，并核对当前manifest/attempt
   预期：SHA完全相同，输出存在且字节数相符；画面/时序/文件来自同一构建与执行
   留证：原文件与实存接收文件；外部SHA完整文本；manifest/attempt清单。

失败/恢复：

- 真实源没有data时只能记等待/未完成，不能用原型动画代替
- 若样本瞬间完成看不到中间态，重建更长实际样本并保留该次不充分记录
- 取消共享/权限/初始化失败按实际原码记录并按原入口恢复，不以脚本成功当接收成功

必需证明：

- 原/收文件及外部SHA
- 逐步UI截图/时间线
- 真实源/保存对话框证据
- 最终manifest/输入SHA/attempt

来源：`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`docs/tests/receiver-ux-v2/cases/acceptance.json`、`docs/design-catalog/receiver-ux-v2/module-contract-error-matrix.md`、`docs/design-catalog/receiver-ux-v2/ui-spec.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`web/main.js`、`web/send.js`。

## E2E-28

重复有效码有识别速率但不虚增重建进度

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T19, T35；AC：AC-015, AC-016, AC-017, AC-018, AC-020, AC-024。
- 入口：实时抓屏入口，选择显示原发送端单个真实码帧的测试源窗口

前置：

1. SRC-01静止码取自原发送端当前实际输出并记录PNG与原文件SHA，128KiB以上难压缩样本不可能该单帧完成
2. 新会话从冻结帧开始，完整码区自然尺寸可被实际捕获；不喂PNG给Worker、不mock report
3. 后续可移除静止层继续同一个原发送文件，解码报告保持可信单流

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-28-S01** 在接收开始前由原发送端生成文件码，捕获完整真实码帧并作为不透明视觉层冻结源画面；记录来源
   预期：冻结的是真实有码画面，不是空白或合成进度；原发送协议/程序资产未改
   留证：原发送文件/码帧截图与SHA；测试层操作及源标题。
2. **E2E-28-S02** 新接收会话真实选择该源，等待首批data和单流比例后持续至少10秒
   预期：有实际data重复到达；近期识别速率可大于0，重建比例稳定不虚增；可信比例8秒不增可见提示
   留证：data返回/报告只读时序；首样本、+8/+10秒主区截图；KiB/s含冗余与稳定比例对照。
3. **E2E-28-S03** 在此期间不触碰接收按钮，检查用时与接收状态、保存可用性
   预期：用时继续；不会因重复码变Ready、自动停止/重启或启用保存；不能把速率当新增文件字节
   留证：状态/controls/elapsed时序；无额外源选择/重启的操作记录。
4. **E2E-28-S04** 移除静止视觉层恢复同一原发送文件连续码并保持源窗口
   预期：新块到达时真实报告可增长，提示恢复；未重置已有业务会话
   留证：源恢复动作；报告增长与主区提示。
5. **E2E-28-S05** 实际Ready后系统保存，外部核对原/收SHA
   预期：静止阶段未假完成，恢复后严格完成且文件相同
   留证：真实保存/原收文件/SHA；完整attempt时间线。

失败/恢复：

- 若冻结码未被识别为data，不得称验证了重复数据；调整自然尺寸/源可见性后重跑
- 若缺可信单流报告，本例进度稳定部分未证实，仍需IAT坏报告分支分列
- 若一帧即完成需换足够大的难压缩样本，不放松中间态判据

必需证明：

- 真实码帧来源与输入SHA
- 重复data及可信比例时序
- ≥8秒主区证据
- 恢复后的实存文件外部SHA

来源：`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`docs/tests/receiver-ux-v2/cases/acceptance.json`、`docs/design-catalog/receiver-ux-v2/module-contract-error-matrix.md`、`docs/design-catalog/receiver-ux-v2/ui-spec.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`web/main.js`、`web/send.js`。

## E2E-29

真实无有效数据暂停→速率归零→恢复

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T31, T35；AC：AC-015, AC-016, AC-017, AC-018, AC-020, AC-024。
- 入口：实时抓屏接收中，在同一实际源上切换空白视觉层

前置：

1. 先至少收到持续data/有可信估计并保持未完成，样本足够长
2. SRC-01的空白层覆盖整个码区；通过实际帧outcome确认no_data，不把最小化冻结码当无数据
3. 所有阈值从实际最后data时点计，前台取证容差1000ms

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-29-S01** 从原发送端真实播放到已接收数据，记录最后data、当前用时/速率/估计
   预期：取得非空基准而不是尚未开始的等待
   留证：基准UI截图；最后data观察时点/原输入SHA。
2. **E2E-29-S02** 在所选源盖不含有效码的空白层并维持至少6秒，接收端继续前台运行
   预期：原帧继续可能no_data；不再有data后速率不超过3秒归零（取证+1秒），≥5秒显示曾接收后无新增提示
   留证：源真实空白证据；no_data/最后data时序；+3/+5/+6秒主区截图。
3. **E2E-29-S03** 检查暂停期间用时、最后进度与操作建议，不按停止或重开
   预期：用时继续，若显示上次估计须有陈旧语义，不假新百分比/网络断开；不会自动重启或打开选择器
   留证：用时连续记录；主文案/建议/控件截图。
4. **E2E-29-S04** 移除空白层，继续同一原发送文件到Ready
   预期：新data后速度/状态恢复，已有接收上下文保持，没有自动丢弃已有数据
   留证：恢复源操作；data/主区恢复时点。
5. **E2E-29-S05** 实际保存并计算原/收外部SHA
   预期：恢复路径无需控制台/刷新，最终字节一致
   留证：真实保存截图/原收文件/SHA。

失败/恢复：

- 若空白后仍有data，应先确认码区是否覆盖/源绑定是否正确，不能据人操作时间直接判速率不归零
- 若来源实际冻结有码帧，转E2E-28记录，不能冒充本例完成
- 真实业务错误/超时沿旧规则记录FAIL，不被“暂时无数据”文案掩盖

必需证明：

- source前后实际画面
- 最后data→归零/5秒提示时间线
- 真实恢复/保存及外部SHA

来源：`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`docs/tests/receiver-ux-v2/cases/acceptance.json`、`docs/design-catalog/receiver-ux-v2/module-contract-error-matrix.md`、`docs/design-catalog/receiver-ux-v2/ui-spec.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`web/main.js`、`web/send.js`。

## E2E-30

真实停止与实时/录像双向切换不串指标

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T25, T35；AC：AC-018, AC-019, AC-020, AC-021, AC-022, AC-024。
- 入口：从一个已有部分接收进展的实际输入点击“停止”

前置：

1. A/B内容不同且外部SHA不同，可用同名同大小碰撞样本；B的录像和原文件可核对
2. 无未决系统模态，清理前禁止新开始；按旧互锁执行
3. 双向各一条：实时A→录像B与录像A→实时B

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-30-S01** 真实接收A至用时/速率/估计可见，点击停止并记录按钮响应/清理
   预期：显示正在停止/已停止等真实语义；清理未完双入口不可重开，旧数值不继续跳
   留证：停止前后UI/owner/cleanup时序。
2. **E2E-30-S02** 清理后点击另一输入按钮，完成实际选源/选文件；观察初始计时/采样
   预期：新seq从零/采样中开始，不沿用A比例、速率、用时或保存状态；两个按钮依旧存在
   留证：实际新选择器；新owner与初始主区截图。
3. **E2E-30-S03** 让B真实重建并实际保存，核对输出属于B
   预期：保存产物摘要为B而非A，原源/Worker/媒体URL/UX timer均已按原归属清理
   留证：B原/收文件与外部SHA；源/Worker/URL/timer清理证据。
4. **E2E-30-S04** 用新独立会话按反向输入重复上述停止/切换/保存
   预期：两种方向都不串数字/产物；正常使用不需刷新/控制台
   留证：反向完整操作及SHA。

失败/恢复：

- 迟到旧frame/save极端回调由IAT-02/06单独注入验证，不能伪装成人操作
- 不能在系统模态阻塞时要求点击页面Stop；应先真实取消模态再操作
- 清理前重开被拒是正确互锁，不为测试放宽

必需证明：

- 双向真实切换记录
- 两个独立B输出实物与外部SHA
- 新旧seq/cleanup和UX timer释放对照

来源：`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`docs/tests/receiver-ux-v2/cases/acceptance.json`、`docs/design-catalog/receiver-ux-v2/module-contract-error-matrix.md`、`docs/design-catalog/receiver-ux-v2/ui-spec.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`web/main.js`、`web/send.js`。

## E2E-31

真实录像位置与重建反馈分别可理解

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T25, T35；AC：AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-022, AC-024。
- 入口：点击“录像导入”，从系统文件选择器选择原发送端录制的正常录像

前置：

1. 原发送端已停止/关闭，防止靠实时输入完成；录像/对应原文件SHA已锁
2. 至少一轮使用真实OS文件选择器，浏览器级setInputFiles可用于其余自动化轮
3. 有效录像足够长展示媒体位置与收集/重建；活动preview可呈现

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-31-S01** 点击录像导入并在真实OS窗口选文件，返回接收页；不打开诊断日志
   预期：真实文件被App接纳并进入正确会话；出现中文录像活动/下一步
   留证：点击/系统文件窗口/实际ingestion记录。
2. **E2E-31-S02** 在读取过程中分时点观察用时、识别速率、重建估计及“录像处理位置”
   预期：媒体时间/总时长与文件估计分开标注，单位明确；真实位置前进且preview持续呈现
   留证：3个间隔时点的完整主区截图；媒体位置/帧呈现时序。
3. **E2E-31-S03** 保持正常读取直到真实artifact；若早于媒体尾完成，记录实际完成位置
   预期：Ready由artifact而非位置比例，可能提前停止读取；接收用时冻结
   留证：真实Ready与artifact/媒体位置的时序。
4. **E2E-31-S04** 真实系统保存并应用外核对原/收SHA
   预期：写close后才已保存，文件一致，无后台抓屏路径替代
   留证：保存对话框/完成截图；输入媒体/原收文件/SHA。

失败/恢复：

- 文件选择器取消/无效录像的有限恢复仍按E2E-15逐异常执行
- 无法取得可信duration时展示已处理位置但不编造分母/百分比；异常元数据注入属于IAT
- 若active preview被布局隐藏导致读取停滞，记录产品FAIL，不能通过展开未写进正常路径的调试控件补救

必需证明：

- 真实OS文件入口证据
- 媒体/重建分离的实际UI时序
- 实际产物/保存与外部SHA

来源：`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`docs/tests/receiver-ux-v2/cases/acceptance.json`、`docs/design-catalog/receiver-ux-v2/module-contract-error-matrix.md`、`docs/design-catalog/receiver-ux-v2/ui-spec.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`web/main.js`、`web/send.js`。

## E2E-32

录像读到尾但未重建时不假报成功并可恢复

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T25, T35；AC：AC-016, AC-018, AC-019, AC-020, AC-021, AC-022, AC-024。
- 入口：录像导入入口选择真实不足/缺尾关键数据录像

前置：

1. 当前批准V-SHORT/同流V-LAST-without及完整with对照，前缀与时点配方可核对
2. 旧E2E-16末段/前缀/最终帧判据仍单独必测，本例新增UI反馈
3. 同一页按正常清理门恢复，不刷新/控制台

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-32-S01** 真实选择不足录像，观察媒体位置接近/到达结尾，保持接收页正常显示
   预期：位置到尾仅表示读完；收尾/处理中来自真实EOF排空，不提前显示已接收/已保存或启用保存
   留证：尾部媒体位置与UI截图；EOF/最后采样/产物时序。
2. **E2E-32-S02** 等待原EOF屏障完成且仍无artifact
   预期：明确数据不足/未完成，速度不继续虚增、用时冻结，下一步可导入完整录像
   留证：最终Incomplete、controls及elapsed冻结截图。
3. **E2E-32-S03** 待清理完成，点击录像导入选择对应完整with版本
   预期：新会话数值清零；真实末尾关键数据可被处理，不因新布局隐藏preview遗漏
   留证：实际新文件入口/新seq；完整末段处理时序。
4. **E2E-32-S04** 真实Ready后系统保存、外部核对原/收SHA；把旧E2E-16 pair材料关联本次执行
   预期：不足与完整对照均真实发生；完整输出相等，不能只凭artifactFrameId等于presented证明末帧
   留证：实存原/收文件与SHA；前缀/量纲/末段有效性证明。

失败/恢复：

- 不足录像没触达真实EOF/元数据即拒绝，属于入口异常，不冒充EOF分支；按配方重建可真实读到尾的fixture
- 同流pair构造无效时保留装置失败并重建，不删失败日志
- 不能用任意字节截断容器代替声明时间停止的同前缀对照

必需证明：

- 真实不足EOF与原件SHA
- UI终态/冻结/不可保存证明
- 完整对照恢复与外部SHA
- 当前pair构造及末段时序

来源：`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`docs/tests/receiver-ux-v2/cases/acceptance.json`、`docs/design-catalog/receiver-ux-v2/module-contract-error-matrix.md`、`docs/design-catalog/receiver-ux-v2/ui-spec.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`web/main.js`、`web/send.js`。

## E2E-33

Ready、选择保存、取消重试和Saved清楚分层

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T25, T31, T35；AC：AC-018, AC-020, AC-021, AC-022, AC-024。
- 入口：从真实已接收完成、尚未保存的主区点击“保存文件”

前置：

1. 真实artifact已存在，停止/关闭发送端但不重置接收会话
2. 原文件SHA与专有保存根已确定；可真实取消OS保存
3. 记录Ready时接收用时，用实际系统对话框停留不小于3秒

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-33-S01** 观察未保存的Ready主区与文件信息；记接收用时并保持3秒
   预期：清楚提示可保存而不是已保存，接收用时已冻结，不继续虚显接收速率
   留证：Ready+3秒截图/接收用时。
2. **E2E-33-S02** 点击保存，真实OS选择器停留至少3秒后取消，回到页面
   预期：选择路径期间不显示已保存；取消后主区明确文件仍在可再次保存，不需重接收，焦点能继续
   留证：真实系统选择器/取消动作；回页提示/可保存按钮。
3. **E2E-33-S03** 再次真实点击保存并选本轮新目标路径，观察写入和关闭结算
   预期：新attempt归当前artifact；写盘未close不Saved，真实close后显示已保存；接收用时不含两轮picker/写入
   留证：saveRequest/writable/writeClose实际时点；选择/写入/已保存的时间线。
4. **E2E-33-S04** 应用外核对实存文件SHA，检查原源已关闭仍能保存
   预期：原/收一致，无新解码/重传；真实用户可看懂完成与保存的区别
   留证：原/收实物与外部SHA；发送端关闭及接收状态记录。

失败/恢复：

- 模态期间页面被浏览器阻塞时不要求同时点Stop/观察被遮挡页面；对话框停留与回页后状态共同取证
- OS写入/close太快看不到中间文案时仅证明实际结算与最终提示，长pending/close失败由IAT-06精确补证
- 取消后产物丢失或按钮不可恢复为FAIL，不靠重传掩盖

必需证明：

- 真实Ready/OS取消/新attempt成功操作
- 接收用时冻结与保存时点分离
- 最终实存文件外部SHA

来源：`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`docs/tests/receiver-ux-v2/cases/acceptance.json`、`docs/design-catalog/receiver-ux-v2/module-contract-error-matrix.md`、`docs/design-catalog/receiver-ux-v2/ui-spec.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`web/main.js`、`web/send.js`。

## E2E-34

真实系统保存受阻后可理解地恢复

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T25, T35；AC：AC-020, AC-021, AC-022, AC-024。
- 入口：已真实Ready的保存文件按钮，使用本轮专有受控目标

前置：

1. 只使用本轮临时专有目标文件，先保存哨兵内容/SHA；不碰用户文件/系统权限设置
2. 外部持有FileShare.None锁或独立测试只读目标，记录能否在OS选路径/创建可写阶段复现阻碍
3. 该场景验证真实系统阻碍与恢复；精确write/close异常映射另由IAT-06，不能伪造实际触达

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-34-S01** 对专有目标建立可控锁/不可写状态；点击保存并在真实OS窗口选择该目标，显式处理仅本轮哨兵的覆盖确认
   预期：真实系统拒绝或产品报实际原保存错误；文件不被静默破坏；选择未完成/写入失败都不显示已保存
   留证：专有路径/锁或只读设置记录；系统拒绝窗口或App实际失败状态/原码。
2. **E2E-34-S02** 按真实分支恢复：若OS阻止确认则取消回页；若App失败则直接回主区观察
   预期：回页后主提示准确（取消或失败按实际结果），artifact仍可保存，不能谎称已捕获write/close故障
   留证：实际返回状态与下一步提示；失败触达阶段/保留artifact证明。
3. **E2E-34-S03** 解除本轮锁/障碍，重新点击保存到可写的新专有路径
   预期：无刷新/控制台/重传即可再次保存，真实write+close后Saved
   留证：解除障碍/新保存系统操作；新attempt实际成功时点。
4. **E2E-34-S04** 核对哨兵是否按实际分支保持，应用外比较原与成功输出SHA；只清理本轮锁句柄/文件
   预期：成功字节相等，无旧失败事件污染；记录系统层与App层分支分别验证了什么
   留证：哨兵前后SHA；原/成功收文件SHA；锁句柄清理记录。

失败/恢复：

- 若装置完全无法构造真实系统阻碍，保持NOT_RUN并附原因；不注入假的文件句柄当成本例PASS
- 若只在OS确认阶段受阻，本例可按真实分支判定，但不得宣称App write/close失败分支已E2E执行；精确异常由IAT-06
- 如果恢复需重新接收/刷新或哨兵被静默破坏为FAIL，保留原件

必需证明：

- 真实OS受阻截图/触达阶段
- 原错误码或实际取消分支与恢复动作
- 专有哨兵/最终输出实物和外部SHA

来源：`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`docs/tests/receiver-ux-v2/cases/acceptance.json`、`docs/design-catalog/receiver-ux-v2/module-contract-error-matrix.md`、`docs/design-catalog/receiver-ux-v2/ui-spec.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`web/main.js`、`web/send.js`。

## E2E-35

无新业务事件仍计时，后台返回不串旧时钟

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T19, T31, T35；AC：AC-015, AC-017, AC-018, AC-021, AC-022, AC-024。
- 入口：前台接收尚无有效码的实际源窗口，随后真实切换浏览器前后台

前置：

1. 原源SRC-01空白/静止有效帧可切换，实际outcome可只读观察；接收尚未完成
2. 无新snapshot轨迹与后台轨迹分别新会话/独立取证，避免Ready提前终结计时器使测试空测
3. 后台浏览器节流允许，不承诺后台解码速度或精确刷新

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-35-S01** 在前台真实抓屏空白源，固定记录业务revision/观测版本，持续观察用时至少5秒
   预期：即使业务revision不变，用时可见更新且满5秒给等待建议；不能要求为UI伪造revision
   留证：真实revision与前台1秒采样UI时间线；源空白/无data证据。
2. **E2E-35-S02** 结束该次并按原清理门建立新独立会话，保持未完成；将接收页切到真实后台或最小化至少6秒
   预期：真实visibility变化有记录，不注入document.visibilityState，不强制后台定时器逐次触发
   留证：前后台切换动作/实际visibility时点；新seq与开始时钟。
3. **E2E-35-S03** 恢复接收页前台，先观察用时/速率/等待反馈，再做任何停止动作
   预期：按当前单调时间重算而非补tick；前台1秒取证容差内值正确，无旧高速/旧seq数字；不假自动失败/重启
   留证：回前台即时/+1秒主区截图；实际now/最后data与View时序。
4. **E2E-35-S04** 恢复同一源的真实原发送码到Ready并实际系统保存，再用新独立会话点击停止验证清理
   预期：完整接收分支必须得到原/收SHA相等，不能以提前停止替代；独立停止子轨迹终结后UX显示timer释放、用时不再变化
   留证：真实恢复/完成及SHA；停止/终结后timer与UI冻结证据。

失败/恢复：

- 如果源最小化造成冻结有效码，按实际data解释速率，不能推断无data
- 若后台阶段触发原真实错误/源结束，按原错误记录；不把等待文案掩盖错误
- 后台节流本身不判性能FAIL；恢复前台仍不重算、旧seq污染或产生额外抓帧为产品FAIL

必需证明：

- 前台稳定revision与变化用时
- 真实visibility/回前台时间线
- 恢复或终结的实物/清理证明

来源：`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`docs/tests/receiver-ux-v2/cases/acceptance.json`、`docs/design-catalog/receiver-ux-v2/module-contract-error-matrix.md`、`docs/design-catalog/receiver-ux-v2/ui-spec.md`、`tools/desktop-recv/e2e/run-e2e.mjs`、`web/main.js`、`web/send.js`。

## E2E-36

真实中文界面的窗口、长文件名与全键盘操作

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T26, T27, T29, T30, T31, T35, T36；AC：AC-018, AC-019, AC-020, AC-022, AC-024。
- 入口：从本轮隔离 candidate context 指向的真实 receiver 入口打开正常桌面浏览器，使用页面上的实时抓屏、录像导入、停止和保存按钮；不打开 prototype。

前置：

1. T1～T6 的运行根隔离与输入准备实际完成；记录最终候选产品 manifest、工具提交、attempt、浏览器版本、Windows版本、显示器分辨率、DPR及缩放。旧 run 只读。
2. 准备原发送端足够长、可重建的实际输入和对应真实完整录像，原件及录像实物与外部SHA-256可定位；准备至少80个字符的真实中文文件名，保留空格，路径长度处于当前系统可支持范围内。
3. 视口矩阵固定为1280×800、768×700、380×720（均100%缩放）及1280×800（200%缩放）；分别记录设置目标与实际CSS viewport/DPR，浏览器外框尺寸不能冒充CSS视口。200%下同时记录缩放前基准与缩放后有效视口。
4. 原生屏幕源选择、打开文件及保存对话框可实际操作；独占本轮桌面/剪贴板/端口。真实键盘事件由手工或系统级工具产生，脚本直接调用click/focus不代替键盘操作。
5. 本例是实际界面验收；DOM尺寸和事件轨迹可作辅助，原型、jsdom、axe或节点存在性不能单独提供本例PASS。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-36-S01** 以100%缩放打开1280×800页面，不展开诊断日志。从浏览器内容区开始按Tab/Shift+Tab，记录主要控件的实际焦点顺序，再用Enter或空格激活实时抓屏，操作真实系统选择器并先显示无有效码画面。
   预期：实时抓屏和录像导入两个中文入口都可见且键盘可达；焦点有可见标记，无键盘陷阱。进入活动期后沿原规则互锁，状态清楚说明等待有效数据，已用时实际更新；不会仅因有预览画面显示文件已取得进展。
   留证：包含两个入口和可见焦点的真实页面截图；Tab/Shift+Tab及激活按键操作记录；系统选源与开始等待的带时标屏幕记录；本轮owner/Receiving时点及对应UI状态轨迹。
2. **E2E-36-S02** 让原发送端播放已准备的足够长码流。在实际Receiving期间按矩阵依次调整为768×700、380×720，再回到1280×800并设置200%缩放；每个配置记录实际viewport/DPR，滚动检查状态、指标、建议、主要按钮和活动preview，再恢复100%。
   预期：每个配置均有实际像素证据；中文主状态、下一步和单位可读，不需读英文日志。按钮不相互遮挡、可滚动到达且目标高度符合44 CSS px设计；页面无需横向滚动。760/380断点的布局仍保留双入口，长文本不撑出页面。活动preview仍参与实际布局且持续呈现，不能通过hidden/display:none或折叠使真实帧读取停止。业务合法按钮即时更新，数字区刷新不会移动用户焦点。
   留证：四个固定配置的viewport/DPR/zoom记录及真实截图；窄窗口与200%缩放的纵向滚动屏幕记录；按钮目标尺寸辅助测量与像素核对；每个配置的真实frame/media推进或有效data时序；焦点在持续数字更新前后的记录。
3. **E2E-36-S03** 真实接收完成后，查看至少80字符的中文实际文件名与文件大小。只用键盘激活保存，在真实系统保存窗口按Esc取消；回到页面后继续Tab并再次激活保存，选择本轮专用目标路径并完成写盘。
   预期：实际文件信息可读或可通过正常换行/滚动完整取得，不覆盖状态与按钮。Ready明确可保存而非已保存；取消后仍保留产物并用中文说明可重试，键盘能从合理的可执行位置继续，无需鼠标解困。只有真实write及close成功后显示已保存；实际目标文件可在应用外读取。
   留证：长中文文件名及Ready页面截图；实际系统保存窗口取消/重开/确认记录；取消后焦点与可执行按钮截图及按键记录；真实write/close与Saved时序；原件与本轮实际保存文件路径、大小及应用外SHA-256相等记录。
4. **E2E-36-S04** 本次会话清理后，通过Tab/Enter激活录像导入，至少这一次用真实系统打开文件窗口选择已准备录像。在两个关键窄配置380×720（100%）与1280×800（200%）观察实际读取，滚动检查媒体位置、重建估计、preview及控制，完成后用键盘真实保存并核外部SHA。
   预期：录像导入入口仍独立存在；媒体位置明确标作录像处理位置，与码流重建估计分开。活动preview保持呈现且读取实际推进；系统打开文件窗口返回后键盘可继续操作。只有真实产物才Ready，保存后实际文件哈希正确；窄窗口与缩放不改变互锁、EOF或保存判据。
   留证：原生打开文件窗口及返回后的焦点记录；两种关键配置的录像活动页面截图/屏幕记录；媒体位置与文件状态的同一时序；录像SHA及原/收实存文件外部SHA-256；本例所有配置与双输入完成情况表。

失败/恢复：

- 任何固定配置下主要操作被遮挡、只能横向滚动才能取得主要内容、焦点不可见/陷住、长中文名撑破布局或活动preview被隐藏并停止呈现，均记录FAIL及对应配置，不以1280配置正常冲销。
- 若真实长文件名因当前发送端/封装限制未能到达接收产物，记录实际限制与原文件名，不改DOM伪造文件名；该长中文名分支不得PASS，交回实施方按当前契约处理。
- 无法获得真实浏览器、指定缩放/视口或系统对话框时，本例保留NOT_RUN与原因；DOM/原型截图只能作为设计材料。
- 真实解码、EOF或保存失败按产品失败保留，不为完成布局取证强行设置Ready或注入保存成功。

必需证明：

- 本轮manifest/attempt/环境与四配置实测表，固定配置缺一不可PASS
- 各配置真实像素截图及滚动/键盘操作记录，双入口与活动preview的实际表现
- 至少80字符真实中文产物名证据及系统打开/保存取消返回后的真实焦点记录
- 实时与录像各一条原发送端到实存文件闭环、应用外SHA-256和同次UI时序
- 逐项断言及失败/未执行原因；不得仅有DOM快照或原型结果

来源：`docs/tests/receiver-ux-v2/cases/acceptance.json`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`docs/design-catalog/receiver-ux-v2/ui-spec.md`、`web/desktop-recv/src/app.js`、`web/desktop-recv/index.html`、`tools/desktop-recv/e2e/native-dialog.ps1`。

## E2E-37

真实屏幕阅读器的主状态播报、数字去重与系统窗口焦点恢复

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T26, T27, T29, T30, T31, T35, T36；AC：AC-018, AC-019, AC-020, AC-022, AC-024。
- 入口：最终候选真实 receiver 页面，启用本机Windows Narrator或实际可用屏幕阅读器；通过真实键盘操作双接收入口与系统选择/保存窗口。

前置：

1. 运行根/候选manifest/attempt已隔离，记录Windows、正常浏览器及屏幕阅读器名称、版本、语言、朗读/浏览模式和必要设置；不是合成speech spy。
2. 可记录实际朗读输出：带声音屏幕记录，或工具提供的实际语音查看器记录辅以操作员逐字/时标记录；事先核实录到的确为屏幕阅读器输出，而非页面诊断日志。
3. 预先选择T6基线阶段校准并锁定SHA的足够长难压缩输入（例如既有配方的1MiB或4MiB样本），确认实际正常Receiving可持续至少15秒且真实report持续推进；不能使用约8秒即完成的128KiB性能录像主样本承担本段。该输入在候选结果出来前锁定，不静止重发同一码、暂停业务或伪造Receiving延长观察；否则8秒no_progress语义变化会使稳定语义观察无效。
4. 准备同源完整真实录像，系统屏幕源选择、打开文件和保存窗口实际可用；测试期间不改浏览器无障碍树、不注入语音API。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-37-S01** 启用实际屏幕阅读器后重新打开候选接收页，从主内容开始按Tab/Shift+Tab读取控件名称和可用状态；用键盘进入实时抓屏，在真实源选择器先取消一次，再重开并选择真实原发送端窗口，保持无有效码至少5秒。
   预期：两个独立入口及停止/保存控件有可理解的中文可访问名称和可用状态；能完成系统选择器取消/重开。页面主语义区对准备、等待及可执行下一步提供实际可听理解的变化，图像存在不被播报成已经接收文件数据。系统窗口返回后焦点合理，键盘操作可继续。
   留证：屏幕阅读器版本/设置及实际语音输出；控件焦点顺序和系统选择器取消/重开按键记录；等待阶段语音与可见状态的同一时序；系统窗口返回后焦点截图及下一次有效按键。
2. **E2E-37-S02** 播放T6已锁定的足够长难压缩输入，先确认真实report不断推进，在同一正常Receiving主语义下连续观察至少15秒，并保持键盘焦点不主动移动到数字上。记录用时、识别速率/估计持续变化时的实际语音；完成稳定观察段后再受控切换为无有效码画面，待速率归零与暂停提示后恢复原发送端。
   预期：稳定观察段有实际report推进且不少于15秒，不会因静止重复码8秒触发no_progress而失去稳定语义。进入接收、暂停/恢复等主语义变化有可理解的实际反馈。持续数值变化不会每250ms或每秒重新朗读整段主状态，不把每次百分比/速率变更作为重复通知；焦点不被更新抢走。语义相同期间的数字可静默更新，操作员主动导航到指标时仍能读到当前值和含冗余/估计含义。无有效码和恢复依据同次真实outcome，不用最小化冻结画面冒充。
   留证：不少于15秒稳定语义段的实际语音/声音记录；数字变化、announcementKey/语义区写入及真实outcome辅助轨迹；暂停/恢复与朗读时间轴；焦点持续稳定及主动读取指标时的实际朗读记录。
3. **E2E-37-S03** 真实Ready后使用键盘打开保存窗口并取消；在页面读出保留文件及可重试提示，再用键盘重试并真实保存到本轮目标目录。对照实际声音、可见主状态与write/close结算时点。
   预期：可保存、选择路径/保存中、取消可重试、最终已保存的语义能区分；不会在真实write及close之前宣布已保存。取消返回后无需鼠标重定位就能继续到合理可执行控件，无焦点陷阱；实际保存的文件外部SHA与原件一致。屏幕阅读器允许正常队列/合并语义更新，不能据此忽略完全没有可理解终态反馈。
   留证：真实系统保存取消/重开/确认的声音与按键记录；取消后实际焦点及可听恢复提示；Ready/selecting/writing/writeClose/Saved与实际朗读时序；本轮实存文件的外部SHA-256记录。
4. **E2E-37-S04** 清理后只用键盘激活录像导入，经真实系统文件窗口选择完整录像。听取录像处理位置与文件重建估计的名称和区别，在活动期观察数值不反复打断主语义；真实Ready后完成一次实际保存并停止屏幕阅读器，保留全部原始记录。
   预期：录像入口未被替换或隐藏；系统选文件返回后焦点可继续。录像位置不是文件完成比例，数字区域不会持续插入语音队列；主状态/下一步清晰可读且只有真实产物才可保存。真实读取与保存闭环成功，不能以无障碍属性存在替代实际听取结果。
   留证：实际打开文件窗口与返回焦点的操作/声音记录；录像位置及重建估计的真实读出；活动preview和真实媒体推进记录；真实保存后的原/收文件外部SHA及逐项无障碍观察表。

失败/恢复：

- 主状态完全没有可理解播报、数字更新持续重复主语义/挤占操作、焦点被更新抢走或系统窗口返回后键盘陷住，记录FAIL并附实际声音/按键复现。
- 无可用屏幕阅读器、无法取得实际朗读或工具不能在该宿主环境运行时记NOT_RUN；aria-live检查、DOM spy或原型通过不能给本例补PASS。
- 稳定语义段没有实际数字变化、码流过快完成或未取得足够观察时段则该分支未证实，保留原attempt并补足真实样本，不据空观测判数字去重通过。
- 屏幕阅读器用户手动导航产生的重复读出与页面主动live播报分列，不把正常主动读指标误判成数字刷新噪声，也不删除真实主动播报失败。

必需证明：

- 候选manifest/attempt、真实浏览器和屏幕阅读器名称/版本/语言/设置
- 实际语音输出与可见UI/键盘/真实outcome对齐的时间轴
- 至少15秒数字实际变化而主语义稳定的观察段，明确主语义区是否重复播报及焦点是否稳定
- 真实选源、打开文件与保存窗口返回后的实际焦点和下一步键盘可执行证据
- 实时/录像实际保存的外部SHA及逐项可访问性断言；属性/DOM检查只能补充

来源：`docs/tests/receiver-ux-v2/cases/acceptance.json`、`docs/tests/receiver-ux-v2/fixtures.md`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`docs/design-catalog/receiver-ux-v2/ui-spec.md`、`web/desktop-recv/src/app.js`、`tools/desktop-recv/e2e/native-dialog.ps1`。

## E2E-38

冻结方法的同录像五对A/B与真实抓屏五对30秒约束

- 范围/执行者：`local_simulated` / `executor`；阶段`5`，`local`必测；当前NOT_RUN、执行者null。
- 本轮任务：T6, T28, T29, T30, T31, T35, T36；AC：AC-023, AC-024。
- 入口：已实现的measure-ux工具使用各自独立baseline/candidate context、同一冻结performance-method和真实正常浏览器入口；拟命令由T28实现，当前不执行。

前置：

1. T1～T6实际完成：基线固定9e4fbc46965de42b9b0097ad80c607d71c7303f0，候选与基线分别有独立构建/manifest/运行根/attempt；所有工具及嵌套输出都不得写旧run或对方根。两侧桌面实验串行。
2. 权威方法为docs/plans/receiver-ux-v2/performance-method.json并记录实际SHA；frozen=true仅为方法冻结。T6在产品改动前锁定seed=20261018的128KiB难压缩原件及原发送端真实完整录像实物SHA，录像可完整重建且每轮至少30个已结算帧。
3. 两侧使用相同WASM、原件、主录像、正常浏览器版本、Mode B、viewport、DPR、屏幕分辨率、电源模式及测量观测器SHA；可选longtask观测是否支持如实记录。baseline A是旧UI，不要求中文、新UX用时/速率、4Hz数字区或新增ticker；候选B才承担新增UX体验/节流/UX timer判据，原业务single-flight、结算和输入匹配两侧均核查。
4. T28工具只旁路测量原submitFrame到原Promise结算，保留原Promise及原错误；不得添加解码并发、改调度/seek/吞吐、覆盖原journey时点或把额外按钮即时写算作数字节流。每轮新页面、新Worker，退出还原观测器。
5. 实时腿使用独立于128KiB主录像的live输入：T6基线阶段先以既有配方的1MiB或4MiB难压缩样本校准，确认同一Receiving在正常发送下持续至少30秒，再锁原件SHA及来源/窗口/模式。正式五对A/B使用同一已锁live原件SHA和环境，但捕获采样不保证逐帧相同；主录像仍为冻结方法的128KiB，不改method。源循环重发已完成文件不能算同一Receiving持续30秒，不通过强制暂停Promise或伪造Receiving制造时长。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-38-S01** 在任何正式配对前核对方法SHA、两侧产品manifest和全部输入实物外部SHA，导出环境表。基线A与候选B各做1轮主录像预热，预热原始结果单独保存，不混入正式五对。验证每次确实打开新接收页/Worker并得到本轮receivingAt。
   预期：方法与输入在候选比较前已锁定且未按结果挑选；环境完全匹配。预热明确排除，原首会话journey时间戳不串用；不能以T6基线预检代替本轮正式配对。缺物、环境不同或样本不足不得进入可判PASS数据集。
   留证：只读方法原件及SHA；A/B产品和工具manifest、独立context及原始环境表；原件与真实录像路径/大小/外部SHA；两侧预热的完整原始输出及新page/Worker身份。
2. **E2E-38-S02** 按AB、BA、AB、BA、AB顺序完成5个有效同录像配对；每个侧别每轮都从新页导入同一真实录像，保留所有submitFrame起止/结算/结果及Receiving→Ready时点。真实Ready后在计时段外经系统保存将实际产物写入本轮专用路径，在应用外核原/收SHA。
   预期：每个有效侧别不少于30个已结算帧，真实产物及保存文件哈希正确。readyMs为原journey.readyAt-receivingAt，排除初始化、选择器及保存；RTT为同一主线程performance时钟的submitFrame→原Promise结算，不称WASM纯解码CPU时间。每轮nearest-rank p50/p95独立计算，再取各侧5轮结果的中位数，不混所有帧池。
   留证：5对的执行顺序、page/Worker、attempt与输入关联；每帧原始起止/RTT/outcome及每轮全部真实时点；每轮实际产物/外部SHA记录；每轮帧数、nearest-rank过程与各侧中位数可复算表。
3. **E2E-38-S03** 用原始数据复算三项冻结门槛并核对测量器结果：Ready中位数、帧RTT p50中位数、帧RTT p95中位数。两侧均记录真实Receiving中在途数量和原业务结算；仅对候选B记录新增遥测数字区实际写入批次、解析/速率资源上界以及终结后的UX显示timer数量。
   预期：三项必须同时成立：candidateReadyMedian≤baselineReadyMedian×1.10+250ms；candidateRttP50Median≤max(baselineRttP50Median×1.10, baselineRttP50Median+2ms)；candidateRttP95Median≤max(baselineRttP95Median×1.15, baselineRttP95Median+5ms)。两侧原业务maxFramesInFlight=1、真实结算与输入匹配均成立；候选B另须UX新增排队帧=0、遥测数字写间隔≥250ms、固定12速率桶/1024字节report缓冲/最多8比例/15诊断有界，终结UX显示timer=0。业务按钮和真实终态即时更新独立于数字限频。旧UI基线A没有新增UX数字区/ticker，不据此判失败。任何候选业务失败或不变式破坏均为FAIL。
   留证：三公式与原始数值逐项复算结果；single-flight与新增排队观测；实际数字DOM写入时序及业务即时写分列；桶/缓冲/比例/诊断边界的IAT与真实运行关联；真实终结后timer清理观测，不能以仅设置stop标志代替。
4. **E2E-38-S04** 使用T6已校准并单独锁定的足够长live输入（例如1MiB或4MiB难压缩样本）及同一原发送端/窗口/Mode B，按AB、BA、AB、BA、AB完成另5对各侧30秒真实抓屏活动窗口。每轮新页面/Worker真实选源，两侧均核真实数据、原业务single-flight与结算；候选B另观察前台用时、暂停/恢复反馈和数字节流。窗口结束由真实停止按钮结束并核清理。
   预期：10个实时侧别均在同一实际Receiving中完成30秒活动记录，A/B的live原件SHA一致；该live输入与128KiB主录像分别记录，不声称A/B逐帧相同。源完成后循环重发不满足同一活动窗。两侧都须原业务single-flight、真实结算/停止及输入匹配成立；仅候选B要求无新snapshot时前台用时至多1秒可见变化，最后真实data后速率3秒内归零、5秒无data提示、可信比例8秒不增提示，真实取证容差1000ms，后台节流另列、返回前台重算。仅候选B核普通短在途不闪处理态、数字有界写及停止后UX timer清理；≥1500ms真实在途分支只有实际发生才记观察，未自然发生由对应IAT补足，不人为卡死。旧UI基线A无中文/新UX指标/ticker属预期；原合法busy丢采样保留，不引入零丢采样指标。
   留证：5对实时原件/SHA/源窗口与环境、各侧30秒原始时序；真实选源、状态与UI反馈屏幕记录；真实pending/帧结算/数字写入/停止清理轨迹；同一主时钟的data/反馈容差核对；未自然发生分支及IAT关联；实时RTT与可得Ready时间单列为advisory。
5. **E2E-38-S05** 保留所有预热、正式、无效及失败轮次，按冻结规则登记原因。环境不匹配/样本不足等无效轮次如需替换则整对重跑，最多替换2对；输出对录像三门槛及实时行为分别裁决的summary/comparison，并由独立汇总工具从原始数据复核。
   预期：至少5对有效主录像及5对完整实时行为才可PASS。少帧、缺时序、缺实物、配对不齐等不可判定，最多2对替换后仍不足记NOT_RUN；候选业务失败、错误产物、违规并发/节流/清理为FAIL，不能当环境噪声剔除。longtask支持则按实际接收秒数归一记录，不支持记NOT_MEASURED并写理由；不填0。方法变更必须新版本/理由并重跑两侧全部配对，不事后放宽。
   留证：完整未删改原始轮次索引与无效/替换原因；实际summary/comparison和独立复算退出码；录像主数值与实时行为/可选longtask分列结果；原方法SHA与最终方法一致性记录。

失败/恢复：

- baseline或candidate输入/媒体/WASM/环境/观测器不匹配、实际文件缺失、某有效轮次少于30帧、缺时序或不足有效配对：保留原件和状态，不判PASS；按最多2对整对环境替换规则处理。
- candidate真实功能失败、哈希不符、超冻结阈值或违反硬不变式均为FAIL；不得删除慢轮、重选更易样本或把产品失败改成环境噪声。
- 实时样本提前Ready而不足30秒时如实记录窗口不足，回查基线阶段冻结的样本可用性；不得伪造继续接收或将不足时段按30秒归一。
- 真实慢帧/特定异常无法自然发生时列出未观察分支及对应IAT，不注入主性能轮次后声称真实路径发生；录像主数值不能被实时RTT替代。
- 本例冻结的是本轮UI增量开销标准；旧现场E2E-26未执行/未评定状态独立，不把本例阈值迁移过去，也不以method.frozen、历史性能NOT_EVALUATED或单元测试替代实测。

必需证明：

- 方法/工具/输入/媒体/WASM/两侧产品manifest及环境匹配实物和SHA
- 两侧各1轮主录像预热、5对正式录像、5对各侧30秒实时的完整索引、顺序和所有原始数据
- 每个正式录像侧别≥30结算帧及原/收真实文件外部SHA
- 三项公式从原始值复算、硬不变式/前台反馈/终结清理的逐项证据
- 全部失败/无效/最多2对环境替换记录；longtask不可测理由与实时advisory单列
- 本地UX性能裁决和旧现场E2E-26独立状态，不能只交一个PASS summary

来源：`docs/plans/receiver-ux-v2/performance-method.json`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`docs/tests/receiver-ux-v2/cases/acceptance.json`、`docs/tests/receiver-ux-v2/fixtures.md`、`web/desktop-recv/src/app.js`、`web/desktop-recv/src/decoder-client.js`、`web/desktop-recv/src/frame-scheduler.js`。

## E2E-39

用户在真实云桌面双输入路径判断接收体验并完成保存

- 范围/执行者：`real_cloud` / `user`；阶段`FIELD`，`field`必测；当前NOT_RUN、执行者null。
- 本轮任务：T36；AC：AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-022, AC-024。
- 入口：阶段8最终版本包可用后，由用户在宿主机实际解压/启动接收器；原发送端位于用户真实云桌面内部，系统选择器选实际云桌面客户端窗口。录像腿导入宿主机对该真实客户端窗口录得的媒体，不要求云桌面运行在浏览器里。

前置：

1. 阶段6外审及阶段7/8最终包流程完成且包实际可取得；记录最终包版本/文件SHA、包内产品manifest与本地验收构建关系。T36只准备现场表和如实核验状态，不在阶段5替用户执行现场。
2. 用户实际云桌面、远程桌面客户端与宿主正常浏览器可用，记录客户端/云桌面/宿主系统、浏览器版本、日常分辨率/DPI/缩放、网络环境说明和实际选源窗口；不以宿主本地发送端代替云桌面内部发送端。
3. 准备用户允许测试的足够长真实输入，云内原文件实物可定位并计算SHA-256；按既有现场矩阵保留可压缩/难压缩两类的责任。数据规模遵守当前批准预算与录像装置能力，不擅自扩大支持范围。
4. 实际客户端窗口可通过既有录像装置在宿主机录成至少一个公布支持格式，完整媒体与外部SHA可保存；已准备不覆盖用户原文件的专用宿主保存目录。
5. 旧E2E-21～26逐条独立现场状态和证据仍保留；历史用户曾传输成功只标USER_REPORTED_SUCCESS，不预填本例或整套现场PASS。

操作、预期与证明（步骤ID写入实际assertions）：

1. **E2E-39-S01** 用户记录现场环境与最终包身份，从实际解压包启动宿主接收页，先不展开日志。云桌面内部打开原发送端并准备长样本；在宿主点击实时抓屏，通过真实系统选择器选远程桌面客户端窗口，先使该窗口内显示明确无有效码内容至少5秒。
   预期：两个中文入口均保留。用户仅看主界面就能知道尚在等待有效数据及下一步，不把看到远程桌面画面等同已经收到文件；接收用时实际变化。选中的是真实远程桌面客户端窗口，浏览器只是宿主接收器入口。
   留证：最终包/产品manifest与现场环境回执；用户实际选源窗口及云内原发送端位置说明/截图；带时标的等待界面及用户操作记录；用户对等待含义和下一步的实际理解回执。
2. **E2E-39-S02** 在云桌面内部由原发送端播放长样本。用户观察主状态、近期数据识别速率、估计及用时；在远程桌面内部切到明确无有效码画面至少5秒后恢复原发送端，保持同一宿主接收会话，记录实际提示与恢复。
   预期：用户能区分等待、正在识别数据、最近没有新数据和恢复。速率的识别/含冗余语义可见，重建比例明确为估计、不可判定时诚实提示，不承诺原文件字节进度或ETA。暂停不自动重启/宣告失败，恢复仍是同一会话；无有效码依据实际画面/结果，远程窗口最小化或遮挡的不同供帧表现不能未经证据等同no_data。
   留证：云内切换无有效码/恢复的实际操作与宿主UI同次时间轴；实际data/无data与主状态/速率/用时/估计观察；用户是否能判断接收/暂停/恢复的原始反馈；异常/不可判定/日常显示配置变化的实际记录。
3. **E2E-39-S03** 等待实际可保存提示后停止云端发送，仅凭中文主操作完成一次真实保存取消，再从保留的产物重新保存到专用目录。在云桌面内对原文件、宿主机上对实际保存文件分别计算应用外SHA-256并记录实物路径/大小。
   预期：Ready与已保存可区分；取消后用户知道文件仍在且可重试，无需重新接收。系统窗口返回可继续操作，只有真实写盘和close完成后显示已保存。云端原件与宿主实存文件大小、SHA一致，不依赖页面报告的哈希自证。
   留证：真实系统保存取消/重试/确认与返回焦点记录；Ready/保存中/已保存同次时序；云端原文件与宿主实存文件外部SHA-256及大小；用户是否知道何时完成和是否已落盘的原始回执。
4. **E2E-39-S04** 用宿主既有录像装置真实录制云桌面客户端窗口内的原发送端码流并保存完整媒体，记录媒体SHA。停止实时会话并停止云端发送后，在宿主点击录像导入，经实际系统文件窗口选择这段录像；观察读取位置与重建提示，真实Ready后实际保存并再次核云内原件与宿主输出SHA。
   预期：录像导入按钮仍独立，录像腿在没有实时输入时实际重建；媒体处理位置与文件重建估计名称和含义分开，不能仅媒体100%就宣布成功。用户能从主界面理解正在读录像、是否在识别及下一步，真实产物/实存哈希成立。此证据来自真实远程客户端录像，不能用宿主本地发送录像替换。
   留证：真实远程客户端录制方法、媒体实物/时长/格式与外部SHA；停止实时/停止发送后导入的实际系统窗口记录；媒体位置和重建状态/Ready的同次时间轴；录像腿云端原件与宿主实存文件外部SHA；用户双输入体验原始反馈。
5. **E2E-39-S05** 用户填写本例逐步结果与不清楚/误导之处，实施方只整理原始回执及证据引用。分别列出本例E2E-39与旧E2E-21、22、23、24、25、26的实际执行人、包版本、attempt和状态；如共用同次实测，逐条绑定其自身断言，否则保持原状态。
   预期：新UX双输入的现场证据与旧全现场矩阵分列。用户理解反馈与文件/时序客观证据共同支撑本例，既有成功口述不代替本次记录；一个新体验场景通过不自动使旧21～26全绿。本地E2E-38数值阈值不代旧现场26的测量口径，未测性能如实未评定。
   留证：用户填写的原始逐步回执、执行日期和实际身份；本例与旧21～26独立现场状态表及各自证据绑定；失败/未执行分支、环境限制与待整改清单；最终包SHA与实际使用版本一致性核对。

失败/恢复：

- 用户尚未实际运行、最终包未可用、缺真实云桌面或缺现场双输入证据时，本例保持NOT_RUN；阶段5本地PASS不补填现场状态。
- 实际提示使用户误判正在接收/已完成/已保存、真实传输或保存失败、原/收SHA不符时记FAIL并保留现场步骤、包版本和文件，不用历史成功记录冲销。
- 真实客户端遮挡/最小化导致重复有效帧、停供帧或继续供帧的行为分别记录；不能预设统一表现，也不由此擅自更改产品阈值。
- 云桌面安全策略不允许录像、实际支持格式装置不可用或录像腿未成功执行则明确该腿NOT_RUN及依据，整个必测本例不得PASS；不得用本地模拟录像替代。
- 现场原始材料缺失、只剩口头成功或页面自报hash时，列USER_REPORTED_SUCCESS/证据不足说明而不转成产品PASS。用户敏感路径或画面可在共享副本中脱敏，原始证据由用户保留可核验。

必需证明：

- 用户真实执行回执、最终包SHA/产品manifest与宿主/云端/客户端/浏览器/日常布局环境
- 实时真实选源、等待→数据→暂停恢复→Ready→保存取消/重试→Saved操作与同次UI时序
- 来自真实云桌面客户端的完整录像、媒体外部SHA及无实时输入的录像导入记录
- 实时和录像两腿的云内原件与宿主实际输出路径/大小/外部SHA-256
- 用户对状态与下一步理解的原始反馈，不能以整理者推断代填
- 本例与旧E2E-21～26独立状态/执行者/attempt/证据索引，未执行现场持续NOT_RUN

来源：`docs/tests/receiver-ux-v2/cases/acceptance.json`、`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`docs/requirements/receiver-ux-v2/requirements-spec.md`、`docs/requirements/receiver-ux-v2/user-feedback.md`、`docs/tests/planning-cases.json`、`web/desktop-recv/src/app.js`。

## E2E-18十腿矩阵

[机器矩阵](cases/e2e18-matrix.json)逐腿绑定当前输入/媒体/attempt和保存后四时点。4MiB难压缩录像已可行，仍必测；TD-15早期上限不可复用。

| 腿ID | 输入/大小 | 必须结果 | 观察上界（预登记） |
|---|---|---|---|
| live-c-1mib | live / compressible / 1MiB | PASS_REQUIRED | null |
| live-c-4mib | live / compressible / 4MiB | PASS_REQUIRED | null |
| live-n-1mib | live / incompressible / 1MiB | PASS_REQUIRED | null |
| live-n-4mib | live / incompressible / 4MiB | PASS_REQUIRED | null |
| video-c-4mib | video / compressible / 4MiB | PASS_REQUIRED | {"recordSeconds": 60, "maxRecordBytes": 268435456, "importWaitMs": 300000} |
| video-n-128kib | video / incompressible / 128KiB | PASS_REQUIRED | {"importWaitMs": 480000} |
| video-n-1mib-probe | video / incompressible / 1MiB bounded probe | PASS_REQUIRED | {"recordSeconds": 150, "maxRecordBytes": 268435456, "importWaitMs": 600000} |
| video-n-4mib | video / incompressible / 4MiB | PASS_REQUIRED | {"recordSeconds": 600, "maxRecordBytes": 1073741824, "importWaitMs": 900000} |
| live-c-20mib-over-budget | live / compressible / 20MiB-over-budget | PASS_REQUIRED | {"rejectWaitMs": 900000} |
| live-n-20mib-over-budget | live / incompressible / 20MiB-over-budget | NOT_RUN_WITH_CURRENT_CODE_BASIS_ALLOWED | null |

唯一允许按既有D-19带当前代码依据NOT_RUN的额外腿是live-n-20mib-over-budget。其余9腿必须PASS；它们任一缺失、NOT_RUN或FAIL都会阻断E2E-18。

## 覆盖与自动化边界

[覆盖映射](coverage-map-e2e.json)列出24条AC、12条运行责任和10组验收义务。部分异常只能确定性注入，保留UT/IAT边界，不伪造真实E2E已触发。

[自动化大纲](e2e-skeletons/real-journeys.mjs)带PLANNING_ONLY守卫，只列实施责任，不能注册为已通过产品测试。真实场景由阶段5按[运行手册](e2e-runbook.md)实现并执行。

阶段5/6/8与用户现场移交见[交接清单](handoff.md)；[本阶段检查](e2e-qa.md)仅验证文档。

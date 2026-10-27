# 全局轮号 16 · review-slice 第 1 次

## 范围

审查对象（分支 receiver-ux-v2，HEAD 8e739d5，审查时工作树 clean）：

| 提交 | 主题 | 本审查涉及内容 |
|---|---|---|
| bb198d9 | test: specify receiver observation ownership | T7 五个测试套件（worker/client/session/ux-telemetry/ux-view） |
| 9bc9867 | feat: observe receiver data without changing decoding | T8 观测实现（worker/decoder-worker.js、decoder-client.js、session.js、ux-telemetry.js） |
| 2650d0c | feat: show Chinese receiver activity and elapsed time | T9 视图/显示（ux-view.js、ux-display.js、app.js、index.html、styles.css） |
| 8e739d5 | test: register and integrate UX observation suites | T10 注册/集成（run-unit.mjs、session.test.mjs） |

规范依据：docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md（T8/T9/T10 节、配方 B/C/D）、docs/design-catalog/receiver-ux-v2/module-contract-error-matrix.md、docs/design-catalog/receiver-ux-v2/contracts/{ux-telemetry.schema.json, ux-display-config.json, ux-diagnostics.json}、docs/tests/receiver-ux-v2/{test-cases.md, unit-test-skeletons/README.md}。

只读约束遵守：未改任何产品/测试代码，未执行 git 写命令；唯一写入的仓库文件是本报告。两个自建反例脚本均通过 `node -e` 在 OS 临时目录执行，不落仓库。

## 结论

**PASS — Blocking 0。**

A-G 七项独立复核全部通过：worker 观测读取顺序/局部失败/缓冲复用/错误码映射/close 释放、client 元数据盖戳与失败收敛、session 的 begin/accept/finish 唯一性与业务 revision 隔离、视图校验顺序与阈值边界、显示层单刷新器与共享节流、DOM id 与可访问性迁移、必跑套件 12/168 全绿，均有实际命令与退出码支撑。未发现违反计划/配方/契约硬约束的实现，也未发现测试造假。

发现 4 条 Suggestions（含 1 条高优先级：save 观测未接线导致 Saving/Saved/Retryable 三态中文反馈冻结），均不构成阻断。

## 独立复核记录

### A. Worker report（T8）

命令：`Set-Location E:\Project\OpenSource\c++\libcimbar; node tools/desktop-recv/run-unit.mjs --all` → **EXIT=0**，输出 `worker: 13 tests, 0 failed`、`UNIT SUITES PASS (12 suite(s))`。

逐行核对 web/desktop-recv/worker/decoder-worker.js:307-408：

- 读取顺序：`handle_frame` 中 scan → len<=0 立即 `no_data`（不采样）→ `fountain_decode` 异常/负数/0n→error 或 data → `fountainResult===0n` 时 `uxObservation: sample_ux_observation()` → 正数时**先** `sample_ux_observation()` **再** `build_artifact()`。符合「scan→fountain→report→artifact，no_data/error 不读」，且 artifact 路径的观测在 build 前采样（decoder-worker.js:386-388）。
- 局部 catch：`read_report` 的两个 try 块（decoder-worker.js:279-289、290-302）把 malloc 失败、`get_report` 抛错、长度非法、JSON/UTF-8/结构错误全部转成 `unavailable(19002/19004)`；`sample_ux_observation` 外层再兜一层 19002。没有任何路径把报告异常抛到 `handle_frame` 的外层 catch（该 catch 才会 `frame_error(15003)`）。
- 1024B 复用缓冲：`ensure_buffer('uxReport', 1024)`（decoder-worker.js:280）走 `_buffers` 生命周期；`n >= 1024 → 19003` 拒绝截断。
- 当前堆读取：`Module.HEAPU8.slice(buff.byteOffset, buff.byteOffset + n)`（decoder-worker.js:287），而非用可能随 heap 增长而 detach 的旧视图，并有 `bytes.length !== n → 19002` 复核。
- 19001-19005 映射与 contracts/ux-diagnostics.json 一致：19001 无导出（decoder-worker.js:276）、19002 读取失败（282/288/289）、19003 截断（283）、19004 格式非法（295/302）、19005 多流（300）。
- close 释放：`handle_close`（decoder-worker.js:410-420）遍历 `_buffers`（含 uxReport）逐个 `_free` 并置 null，重复 close 安全。

VM 测试是否真覆盖（web/desktop-recv/tests/unit/worker.test.mjs）：
- UX-UT-005 断言 `calls` 序列为 `['scan','fountain','report']`（data 与 artifact 两条路径），no_data 只到 `['scan']` 且 `uxObservation === undefined`，负数/ABI 错误只到 `['scan','fountain']` —— 精确覆盖顺序与「no_data/error 不读」。
- UX-UT-006 用 heap 增长 fake 断言读到新堆值 `[0.75]`、1024 字节 malloc 恰好 1 次、close 两次后报告缓冲只 free 1 次、堆覆写后已解析值不变 —— 覆盖复用与释放。
- UX-UT-007 覆盖报告失败局部化且不掩蔽核心错误。
- VM fake 通过真实 worker 入口（`send/makeInit/settle/results`）驱动，不是对函数打桩。

结论：通过。

### B. Client（T8）

逐行核对 web/desktop-recv/src/decoder-client.js：

- 元数据 post 前盖戳：`submitFrame` 先构造 `submission`（sessionId/sessionSeq/frameId/submittedAtMs，decoder-client.js:113-118）并 `pending.set`，随后才 `worker.postMessage`（121-124）。`pendingSubmission()`（58-70）只读遍历并返回新对象，不创建状态。
- payload 无元数据键：postMessage 消息体为 `{type, frameId, width, height, byteLength, pixels}`（122），sessionId/sessionSeq/submittedAtMs 均未进入 worker 消息。
- 五类失败出口：worker `onerror`（49-50）、`onmessageerror`（51-52）、协议 `init-failed`（147-153）、postMessage 同步抛错（init:91-93、frame:125-137）、主线程 init/frame 看门狗（81-83、104-110）——全部收敛到 `_channelFailed`：`_settleInit` + `_failAll`（清 timer、reject、pending.clear）+ `terminate`，并且 `_failureNotified` 保证 `onFailure` 至多一次。`close()`（204-211）幂等。
- 旧工厂兼容：constructor 第三参默认 `{}`，`owner` 缺省时 `_uxOwner=null`（提交戳 sessionId/sessionSeq 为 null），`nowMs` 缺省为 `performance.now`（36-40）。T7 之前的既有 client 测试（15 例）未改参数仍全绿。

结论：通过。

### C. Session（T8/T10）

逐行核对 web/desktop-recv/src/session.js 与 web/desktop-recv/src/frame-scheduler.js：

- begin 恰在双依赖就绪的 Receiving 转移：`_maybeStart`（session.js:195-201）条件为 `_mediaReady() && _client && state==='Preparing'`，先 `_uxBegin(seq)` 再 `_emit({state:'Receiving'})`。`_uxBegin` 校验 `session.seq === seq` 后创建新模型并调用 `begin({version:1, sessionId, sessionSeq, inputKind, nowMs})`（205-221）。
- accept/finish 恰一次：`_uxFinish` 有 `_uxFinished` 守卫（294-299）；telemetry 的 `finish` 以 `_endedAtMs !== null` + `finishedKey` 幂等（ux-telemetry.js:377-381）；`_onFrameResult` 只对 `Receiving/Draining` 状态、且 `_isCurrent(seq)` 时 `_uxAccept`（464-479）。
- 观测异常吞并不动业务 revision：`_uxBegin/_uxAccept/_uxFinish` 的模型调用全部包在空 catch 中（220、288-290、300-309）；业务 revision 只在 `_emit` 内递增，观测路径不调用 `_emit`。UX-UT-016 断言五个 data 帧后 `snapshot.revision` 与 `snapshotEvents.length` 均不变、每帧恰好 1 次 accept、无 save 观测 —— 强断言。
- 旧 seq/迟到结果不喂新模型：`_onFrameResult` 首行 `_isCurrent(seq)`；`_uxAccept` 再校验 `_uxSeq !== seq`；`_newSession` 重置 `_ux=null`（135-137）。UX-UT-014 覆盖。
- 双入口重复只计一次：T10 用例 `T10 a duplicate result from either entry counts exactly once` 用真实 ReceiverTelemetry；live 路径真 onResult 后手工再注入同一 frameId 两次，断言 observationRevision 不变、桶字节仍 625；video 路径经 `submitAndWait` await 后再手工重复注入，同样断言，并断言 `stats.submitted === 1`。底层第二道防线是 telemetry 的 frameId 单调守卫（ux-telemetry.js:190-193，19007）。
- 录像路径不依赖 onResult：frame-scheduler.js:80-116 注释与实现均明确 `submitAndWait` **不**调用 onResult/onError；session.submitVideoFrame（448-462）在 await 后自行调用 `_onFrameResult(seq, result)`。双入口因此天然不重复，测试再以重复注入验证幂等。

结论：通过。

### D. 视图 / 显示（T9）

逐行核对 web/desktop-recv/src/ux-view.js 与 ux-display.js：

- readView 校验顺序（ux-view.js:217-275）：对象/version(19013) → Context 形状与枚举(19008，含 state/controls 四布尔/inFlight↔inFlightSinceMs/mediaDiagnosticCode) → request 身份(19008) → nowMs(19009) → observation 与 request 身份一致（旧 seq 19007、id/新 seq 冲突 19008）→ 时钟单调（早于 receivingAt/lastResultAt/endedAt → 19009）→ 产物缺失(19014) → 投影。与 T9 报告所述顺序一致。
- 状态优先级（statusKeyFor，ux-view.js:168-215）：业务终态/收尾/保存态优先；Receiving 细分顺序为 processing(inFlight 且 age>=1500) → waiting_data → no_new_data(>=5000) → progress_unknown(ambiguity) → progress_unavailable → collecting_more(trusted>=1) → no_progress(>=8000) → receiving。阈值常量 1500/5000/5000/8000 与 contracts/ux-display-config.json（processingNoticeMs/firstDataNoticeMs/noDataNoticeMs/noAdvanceNoticeMs）逐一相符。
- announcementKey：`${statusKey}:${artifactId??'none'}:${attemptId??'none'}`（ux-view.js:325）。不含时间、elapsed、计数或 observationRevision；artifactId/attemptId 是业务身份串（可能含数字），只在真实事件变化时改变。UX-UT-049 在 100Hz 业务通知下断言 `announcements().length === 1`，证明数字变化不会重复播报。
- elapsed 冻结：`projectElapsed` 在 `endedAtMs !== null` 时以 ended 为终点（ux-view.js:134-138）；UX-UT-034 与 049 的 Ready/endedAt 样例覆盖。
- 每 seq 单刷新器：`scheduleFor` 捕获当前 `owner.sessionSeq`，回调首行校验 `owner.sessionSeq !== seq` 即返回（ux-display.js:180-187）；owner 变化时 `releaseTimer` 并清空 per-seq 绘制记忆（89-98）。UX-UT-049 断言 `timersB.size() === 1` 且 Ready 后为 0。
- >=250ms 共享节流：事件与 tick 共用 `lastTelemetryWriteAt`（ux-display.js:165-169），REFRESH_MS=250 与 viewRefreshMinMs 一致。UX-UT-049 实测 100Hz 事件 + 250ms tick 下 [0,1000) 遥测写入恰 4 次且相邻间隔 >=250ms。
- tick 只调 readView/paint：`project()` 只调用注入的 `readCurrent()`、`nowMs()`、`readView`、`paint`、`setTimer/clearTimer`（ux-display.js:83-119）；模块不 import 任何抓帧/渲染/保存模块（头部仅 import ux-view）。app.js 的 `readCurrent`（137-167）只读 coordinator.snapshot()/uxTelemetry()/pendingSubmission()/deriveControls/currentMediaPosition，均无副作用路径。
- dispose 幂等：`dispose()` 调 `releaseTimer()`（timerId null 检查 + clearTimer）并置 disposed；迟到 timer 回调有 `disposed` 守卫（ux-display.js:212-215、181-184）。UX-UT-050 覆盖。
- #log 移出 aria-live：`git show 2650d0c -- web/desktop-recv/index.html` 显示 `<pre id="log" class="log" aria-live="polite">` 改为 `<pre id="log" class="log">`，新增 `#ux-announcement` 携带 `aria-live="polite"`（EXIT=0）。
- 原按钮 id/激活路径保留：app.js:537-545 仍绑定 btn-live→startLive、btn-video→fileInput.click、file-input change→startVideoImport、btn-stop→coordinator.stop、btn-save→saveArtifact；index.html 全部原 id 存在。

结论：通过。

### E. DOM / 样式

- index.html 原有 id 全在：caps/status/log/preview/artifact/artifact-name/artifact-size/btn-live/btn-video/btn-stop/btn-save/file-input/mode（index.html:12-48），无删除或改名。
- 活动 preview 未被折叠：styles.css 对 `video` 只有 width/max-height/背景/圆角（113-119），无 `display:none`/`visibility:hidden`；`.ux-announcement` 的 1px clip 样式只作用于播报节点（89-99）。app.js:316-319 在 video 的 Receiving/Draining/Reconstructing 强制 `preview.hidden = false`，与「hidden video 不出帧」的既有约束一致。
- textContent only：paintUx 全部 `textContent =`（app.js:121-134），logLine 用 `textContent +=`（174-178）；文件名的 `suggestedName` 也经 textContent（234）。全仓库 src 下无 innerHTML 用于文件名/状态/错误（paint 路径已逐一核对）。

结论：通过。

### F. 必跑命令与断言强度抽查

命令与结果（实际执行）：

| 命令 | 退出码 | 关键输出 |
|---|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | 0 | 12 suites / 168 tests / 0 fail / 0 todo / 0 skip（contracts 7、session 32、scheduler 6、worker 13、client 15、save 7、video 15、ui 7、evidence 36、ux-telemetry 16、ux-view 9、ux-display 5） |
| `node tools/desktop-recv/run-unit.mjs --suite ux-view` | 0 | `ux-view: 9 tests, 0 failed, 0 todo, 0 skipped` |
| `node tools/desktop-recv/run-unit.mjs --suite ux-unknown` | 2 | `unknown suite: ux-unknown`（白名单生效） |

用例断言强度抽查（逐行读取）：
- UX-UT-005（worker）：调用序列精确到数组、no_data 断言 `uxObservation === undefined`、error 断言不采样。
- UX-UT-016（session）：revision、事件流长度、accept 次数、observeSave 次数四重断言。
- UX-UT-049（display）：写入次数精确等于 4、相邻间隔 >=250ms、业务段事件即画、Ready 释放 timer —— 非「存在即通过」型断言。

结论：通过。测试无造假迹象（VM fake 驱动真实入口、真实 ReceiverTelemetry 驱动集成用例）。

### G. 特别复核（lead 转办三项）

**G① runner 零用例护栏是否需要补强 —— 结论：不需要，当前可达且 fail-safe。**

- run-unit.mjs:79-89 解析 TAP 的 `# tests`/`# fail`/`# todo`/`# skipped`，`tests === 0` 明确拒绝（`ran 0 tests`），`todo/skipped > 0` 拒绝，源码级 `test.todo(`/`test.skip(` 预检（63-68），`--all` 缺文件 exit 3（102-107）。
- 实际探测：`--suite ux-unknown` → EXIT=2（白名单），说明护栏只能作用于 12 个已注册套件；T10 已把 ux-telemetry/ux-view/ux-display 写入 ALL_SUITES（run-unit.mjs:30），三个新套件的零用例护栏因此可达。
- 正则解析失败时 `tests=0` 会走拒绝分支（fail-safe 方向），不会误放行。检查顺序上 runSuite 在 checkSuiteSource 之后，两者互不削弱。
- 唯一残余风险是「新增套件文件存在但忘记注册到 ALL_SUITES」——这属于注册遗漏而非零用例护栏，且 T10 已在 `--all` 中固定 12 个名字 + 缺文件 exit 3 兜底。无需补强。

**G② T7 漏写 034 的更正是否引入断言放松 —— 结论：没有放松，反而是对齐规范并收紧。**

- docs/tests/receiver-ux-v2/test-cases.md 的 UX-UT-034 要求：无 data 时 5000 前 waiting_data 无建议、5000 起有建议；lastData=1000 时 5999.9 未到 no_new_data、6000 达到；lastAdvance=1000 且 data 持续至 8999/9000 时 8999.9 非 no_progress、9000 才 no_progress；忙帧 age 1499.9/1500ms 时 processing 优先。
- 现文 ux-view.test.mjs:419-452 逐条覆盖且更具体：4999.9/5000 的建议边界、`rate.bytesPerSecond === 0`（画面帧不算数据字节）、5999.9 断言 `progress_unavailable`（而非含糊的 receiving）、6000/6000.1 断言 no_new_data、8999.9 receiving/9000 no_progress、严格增长清除提示、1999.9/2000 的 processing 边界、6100 处 processing 压过 no_new_data。T9 报告所说两处「修正」（progress_unavailable、busy 夹具补 trustedRatio）都使断言更精确、且不违反 test-cases.md 的文字要求。
- 唯一记账瑕疵：test-cases.md 把该用例的 Target 写为 ux-telemetry.js / 骨架 ux-telemetry.test.mjs，实际落在 ux-view.test.mjs。属文档位置与实际归属不一致，不改变断言强度（见 Suggestions 3）。

**G③ T8 偏差 3 与 T9 偏差 2 的延后是否可接受 —— 结论：T9 偏差 2 有明确承接、可接受；T8 偏差 3 无明确承接任务，需要 lead 指派（Suggestion，不阻断）。**

- T9 偏差 2（progress.unavailable 未真实投影）：计划 T15 Step 2 明确「实现report可用性与本seq歧义锁」，T14 Step 2 明确「临时坏报告」用例；T9 以 progress_unavailable 状态键兜底且与 T7 断言一致。可接受延后。
- T8 偏差 3（observeSave 无专用用例）：计划 T14（窗口数学/阈值/报告歧义）与 T15（速率/估计/提示）正文均未列入 save 行为用例，T17/T18 聚焦指标语义与整改；计划中唯一出现 `observeSave` 的位置是配方 C 的接口示例（implementation.md:1150）。即：该缺口目前没有编号任务明确承接。按「延后项需有计划任务承接」的标准，这是覆盖缺口而非实现错误，列为 Suggestion 1 的一部分。

## Blocking issues

无。

说明：未发现违反计划/配方/契约硬约束的实现，未发现测试造假或断言放松；A-G 的全部硬性检查项均有实际命令、退出码或源码行号支撑。

## Suggestions

1. **（高优先级）save 观测未接线，Saving/Saved/Retryable 三态中文反馈会冻结。** 事实：`observeSave` 在 web/desktop-recv/src 与 worker 中只有定义（ux-telemetry.js:299），没有任何调用点；session.saveEvent（session.js:488-514）只驱动业务状态，不向 telemetry 注入保存观测。自建反例（真实模块，临时目录 `node --input-type=module -e`，EXIT=0）输出：`Ready ok=true statusKey=ready`，`Saving ok=false code=19014`，`Saved ok=false code=19014`，`Retryable ok=false code=19014`。ux-display 在 `!result.ok` 时只排队诊断并保持上次文案（ux-display.js:107-112），因此真实保存时中文反馈区会停在「文件已接收完成，请保存」，并在下一次 announcementKey 变化时把 19014 写进 #log。影响：T13 的真实闭环（抓屏→中文反馈→保存）会走到 Saved，届时「看到规定中间态」的 DoD 可能不达标；b2-t9-report 偏差 6 中「保存分层可显示」的表述与产品路径不符。建议：由 lead 明确把 save 观测接线（saveController onEvent → coordinator → telemetry.observeSave，含 selecting/writing/pending/saved/cancelled/failed 归一）指派给 T12 或 T17/T18，并要求在 T13 之前完成；同时补一条 session 级用例断言 Saving 期间 readView 成功且 statusKey 为 saving_*。位置：web/desktop-recv/src/session.js:488、web/desktop-recv/src/app.js:520-533、web/desktop-recv/src/ux-telemetry.js:299。DoD 复验：真实保存旅程中 #ux-primary 依次出现「请选择保存位置/正在保存文件/文件已保存」，#ux-save 同步更新，且 #log 不再出现 `ux 19014`。
2. **observeSave 用例归属需要落任务。** T8 报告偏差 3 已如实记录「无专用用例」，但计划 T14/T15 未承接。建议 lead 在 T14 的用例清单中追加 save 归一/幂等/终态不回写/新 attempt 仅 selecting 建立四类断言（同套件 ux-telemetry.test.mjs，成本低），或在 T17 的审查清单中显式登记为已知缺口并指定整改任务。
3. **UX-UT-034 的文档 Target 与实际文件不一致。** test-cases.md 写 Target 为 ux-telemetry.js、骨架为 ux-telemetry.test.mjs，实际落在 ux-view.test.mjs。建议在 T14 修改这两个文件时顺手对齐文档（T14 的 Files 同时包含两个测试文件，改动窗口正合适），避免后续审查按文档找不到用例。
4. **`_onFrameResult` 的时钟语义可在 T14/T15 复核一次。** ux-telemetry 以 `receivedAtMs` 单调为硬约束（ux-telemetry.js:197-200，倒退即 19009 拒绝且不计数），而 session 传入的是 `this._nowMs()`（session.js:279），真实实现为 performance.now()，正常单调。该组合正确，但建议在 T14 的「异常时间」用例中显式覆盖「同一毫秒内两帧」与「receivedAt 与 submittedAt 交错」两种边界，把当前仅由实现保证的单调性固化为断言。

## 审查者

review-v2-slice（独立审查代理，未参与 bb198d9/9bc9867/2650d0c/8e739d5 的实现）。审查时间：2026-10-24。所有结论均基于本报告所列命令输出与源码行号；未执行构建、浏览器或 E2E 验证（不在 T11 范围）。

---

# 第 1 次整改结果（T12）

整改者：dev-v2-prod（实现者车道）。基线：63f953f。范围由 lead 裁定：Suggestion 1（save 观测接线，必须）与 T8 遗留 UX-UT-014 强化（必须）；S2/S3/S4 已排 T14，不在本次。

## S1（高优先级）save 观测接线 — 已修复

实现（web/desktop-recv/src/session.js）：
- `uxSaveIntent()`：用户点击保存时同步捕获不可变 owner `{sessionId, sessionSeq, artifactId}`（app.js 在 `saveController.start` 前调用；不 await picker）。
- `saveEvent(event)` 首行旁路调用 `_observeSaveEvent(event)`（在停止冻结/业务 switch 之前，不阻塞原结算）：
  - 首个真实 `selecting` 事件把捕获的 owner 与真实 attemptId 绑定（已绑定 attempt 沿原 owner；busy 的 writing+16008 不会重新绑定，因为不是 selecting）；
  - 后续事件只查该 attemptId 的固定绑定送 `telemetry.observeSave`；无绑定（未点击/旧 attempt）静默丢弃；
  - 终态（saved/cancelled/failed/aborted）即删除绑定（单在途 Map 有界，另设 16 条防御上限）；
  - 归一规则沿用模型（failed/cancelled+16002→cancelled、writing+16008→writing、pending、saved 仅两步成功）；旧 owner/attempt 由模型以 19007 拒绝，仅拒 UX。
- 未改 SaveController、未改业务 saveEvent 的任何结算分支；app.js 仅在保存点击处增加一行 `coordinator.uxSaveIntent()`。

测试（先 RED 后 GREEN，web/desktop-recv/tests/unit/session.test.mjs，新增 T12-S1）：
- RED：`coordinator.uxSaveIntent` undefined（接线缺失），日志 red-logs/b2-t12-s1-red.log。
- GREEN 断言：Ready 后 selecting/writing/pending/saved 四步的 readView 均 ok 且 statusKey=saving_selecting/saving_writing/saving_pending/saved，save.attemptId 为真实 attempt，elapsed 冻结于 artifact（400ms，保存耗时不计）；failed+16002→Retryable/save_cancelled（artifactId 保留）；writing+16008 忙帧仍为 saving_writing 且 errorCode=16008；Retryable 重试经新 selecting 回到 saving_selecting；已结算 attempt 的迟到事件不夺取保存视图。

## UX-UT-014 强化（受控 pending promise）— 已完成

- 实时会话 A 的第二帧提交以真实未决 Promise 跨 stop 停留在途；B 会话开始后其迟到回执才返回。断言：B 模型零 accept、A 冻结模型不追溯计数、B 业务 revision/会话身份不变、A 迟到 frameId 不入任何模型（19007 语义）。原「no-op fake」注入已替换，断言强度提升。

## 复验命令（实际执行）

| 命令 | exit | 输出 |
|---|---|---|
| `node --test web/desktop-recv/tests/unit/session.test.mjs` | 0 | 33/33（新增 T12-S1） |
| `node tools/desktop-recv/run-unit.mjs --all` | 0 | 12 套 169 tests / 0 fail / 0 todo / 0 skip（session 33，其余计数不变） |
| `node --check web/desktop-recv/src/session.js` / `session.test.mjs` | 0 | OK |
| `git diff --check` | 0 | OK |

日志：red-logs/b2-t12-s1-red.log、red-logs/b2-t12-run-unit-all.txt。

## 未在本任务处理（lead 已排 T14）

- S2：observeSave 归一/幂等/终态不回写/新 attempt 仅 selecting 四类模型用例；
- S3：UX-UT-034 的 test-cases.md Target 文档对齐；
- S4：receivedAt/submittedAt 交错与同毫秒双帧的时钟边界用例。


## 第 1 次整改复核（review-slice 第 2 次，全局轮号 16 续）

复核对象：a271371（fix: converge real-time receiver UX review），T12。复核范围限于 lead 指派的三项，限时复核不重开全部 A-G 项。未执行 git 写命令，未改任何代码。

**1. S1 接线（session.js 旁路与绑定 / app.js 同步调用点）——CLOSED**

- `uxSaveIntent()`（session.js:503-515）：同步捕获不可变 owner `{sessionId, sessionSeq, artifactId}`，不 await；app.js 的 `saveArtifact` 在 `saveController.start` 之前同步调用（a271371 diff：`coordinator.uxSaveIntent();` 位于 fallback 计算与 start 之间，无 await 介入）。
- `_observeSaveEvent(event)`（session.js:515-547）：整体 try/catch（旁路异常不可能进业务状态机）；未知 rawStatus 直接返回；只有 `selecting` 且有 owner 时把捕获的 owner 绑定到真实 `attemptId`（`_saveAttemptBindings`，SAVE_BINDINGS_CAP=16 有界、命中既清空，session.js:11/527-528），owner 恰好消费一次（`this._uxSaveOwner = null`）；非 selecting 事件只发给已绑定 attempt，未绑定保持静默；终态（TERMINAL_SAVE_STATUSES，session.js:10）观察后删除绑定。recipe E（quit/守卫/一次一绑定）语义与 ux-telemetry.js 的 observeSave 归一（failed/cancelled+16002→cancelled、writing+16008 仍 writing）在用例中验证。
- `saveEvent(event)`（session.js:562-563）：`_observeSaveEvent` 在业务状态机 switch **之前**调用——旁路先行且永不阻塞业务。
- 会话复位：`_newSession` 清空 `_uxSaveOwner` 与 `_saveAttemptBindings`（session.js:146-147）。
- 证据：源码行号如上；`node tools/desktop-recv/run-unit.mjs --all` → EXIT=0（见第 3 项）。

**2. T12-S1 断言组与 169 全绿实测——CLOSED**

- 用例 `T12-S1 save events drive Saving/Saved/Retryable observations through a real save`（session.test.mjs，T12 后 session 32→33）确实存在且为真实模型断言：经 `makeReady` 真实 artifact 到 Ready 后走真实 `uxSaveIntent()+saveEvent()` 链，`readView`（真实 ux-view 投影，非影子断言）逐步断言 selecting→`saving_selecting`、writing→`saving_writing`、pending→`saving_pending`、saved→`saved`（四链每步 `view.ok === true`，即上一轮 discovered 的 19014 拒绝已消除）；`elapsedMs === 400`（冻结于 artifact时刻 500-100，保存时间不计入接收时长）。
- 「迟到 attempt 不夺取视图」两条均已断言：saved 后对已结算 attempt 7 重放 `writing` → statusKey 仍 `saved`；stale attempt 8 的 writing 事件 → `save.attemptId` 仍 `'9'`、statusKey 仍 `saving_writing`。
- 旁支：failed+16002 → `save_cancelled`（Retryable）；Retryable 后新 attempt 9 selecting 重新进入 Saving；writing+16008 busy 守卫仍 `saving_writing` 且 `errorCode === 16008` 保留（不伪装失败）。
- 实测（本审查者本人运行，非转录）：`node tools/desktop-recv/run-unit.mjs --all` → **EXIT=0**，`UNIT SUITES PASS (12 suite(s))`，session: 33 tests，12 套合计 169。

**3. UX-UT-014 强化（真实未决 promise）——CLOSED**

强化后的用例（session.test.mjs）以真实在途提交替代手工注入：A 会话第二帧经 `offerFrame` 真实进入 flight（控制 promise 尚未 resolve），`stop()` 停止 A、经清理门开启 B（video）后，迟到结果才 deliver。断言：B 模型零 accept、A 冻结模型不追溯计数（仍 1 次）、业务 revision 与 sessionSeq(B) 不变、B 自身新帧恰好计一次。这正是第一轮 Suggestion 4 关注的「迟到结果不喂新模型」的最真实形态（真实未决 promise 而非 no-op fake），断言强度提升；符合我的 G 项口径。注：S4 中「同一毫秒双帧/receivedAt 与 submittedAt 交错」的时钟边界用例仍未落，属 Suggestion 4 的剩余部分，lead 已排 T14，不在本次三项复核范围内。

## 结论

**S1 CLOSED；无新增 Blocking。** 三项复核全部 CLOSED，每项均有源码行号/commit diff/本人实测命令与退出码支撑。T12 整改报告所述与实际代码一致，测试无造假迹象（真实 ReceiverTelemetry 模型 + 真实 readView 投影断言）。本文件第 1 次整改结果节的剩余项（S2/S3/S4）为已排计划的 Suggestions，不构成阻断，维持全局轮号 16 的 PASS 结论不变。

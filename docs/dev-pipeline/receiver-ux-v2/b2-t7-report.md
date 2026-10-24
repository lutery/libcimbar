# B2 产品车道 T7 完成报告（dev-v2-prod）

日期：2026-10-24　基线 HEAD：259539e（工作树在 T7 前为 clean）
任务：按配方 B/C/D 与 test-cases UX-UT-001..034/041..047 迁移骨架为真实 RED 用例。未执行任何 git 写命令；未改任何产品代码。

## 改动文件（全部为测试）

新增：
- `web/desktop-recv/tests/unit/ux-telemetry.test.mjs`（UX-UT-017..033，共 17 例）
- `web/desktop-recv/tests/unit/ux-view.test.mjs`（UX-UT-032/034/041..047，共 9 例）

修改（合并，不覆盖旧套件）：
- `web/desktop-recv/tests/unit/worker.test.mjs`：追加 UX-UT-001..007（7 例）
- `web/desktop-recv/tests/unit/client.test.mjs`：追加 UX-UT-008..011（4 例）
- `web/desktop-recv/tests/unit/session.test.mjs`：追加 UX-UT-012..016（6 例）

未改：`tests/helpers/worker-vm.mjs`（现有 harness 已支持 fake Module 导出注入与 HEAPU8 置换，无需改动）。

## RED 运行（真实 RED，非骨架守卫）

| 命令（仓库根） | exit | 结果 |
|---|---|---|
| `node --test --test-reporter=tap web/desktop-recv/tests/unit/worker.test.mjs` | 1 | 13 tests / 6 pass（旧 UT-019..024 全绿）/ 7 fail（UX-UT-001..007） |
| `node --test --test-reporter=tap web/desktop-recv/tests/unit/client.test.mjs` | 1 | 15 tests / 11 pass（旧全绿）/ 4 fail（UX-UT-008..011） |
| `node --test --test-reporter=tap web/desktop-recv/tests/unit/session.test.mjs` | 1 | 31 tests / 25 pass（旧全绿） / 6 fail（UX-UT-012..016） |
| `node --test --text... --test web/desktop-spec...` — placeholder | — | （见上） |

ux-telemetry/ux-view：`node --test` 直接 **ERR_MODULE_NOT_FOUND**（`src/ux-telemetry.js`、`src/ux-view.js` 模块缺失 = 允许的 RED 原因）。exit 1。

## RED 原因（均为行为缺失，非守卫）

- worker：`Cannot read properties of undefined (reading 'report')`——现 worker 的 frame-result 无 `uxObservation`（report 读取行为未实现）。
- client：`client.pendingSubmission is not a function`——DecoderClient 无提交元数据 getter（owner/nowMs 注入缺失）。
- session：`Cannot read properties of new undefined (reading 'calls')`——SessionCoordinator 无 createUx/nowMs 观测钩子（begin/accept/finish 未接线）。
- ux-telemetry / ux-view：模块不存在（T8/T9 交付）。
- 一个已修正的测试自身问题：UX-UT-012 第二例最初对"双依赖同时就绪即 Receiving"的真实时序预期错误（视频源 immediate resolve 导致状态直接 Receiving），已改为受控 promise 控制就绪顺序（源 pending 时断言无 begin；随后单次 begin@700ms）。修正后的 RED 依然是行为缺失（createUx 钩子不存在）。

## 测试设计要点（T8/T9 的契约锚点）

- worker（配方 B）：读取顺序 scan→fountain→report（artifact 在 build_artifact 前）、1024B 复用缓冲、n≥1024→19003、非法长度→19002、fatal UTF-8/JSON→19004、>8 项→19004、19005 multiple、19001 缺导出、close 单次释放、report 异常不冒泡 frame_error、有效 report 不掩盖 15007/15008。
- client（配方 B）：pendingSubmission() 只读 getter；submittedAtMs 取自注入 nowMs 且在 postMessage 前盖戳；payload 无元数据键；五类失败出口（postMessage throw/看门狗/onerror/onmessageerror/close）同步清元数据并保留 15010/14003 收敛码；查询零开销。
- session（配方 C）：SessionCoordinator 新增可注入 `createUx`（每 seq 一个模型）与 `nowMs`（主线程单调时钟）；createClient 工厂收到捕获的 owner；begin 恰在两个依赖就绪的 Receiving 转移、恰一次；FrameInput 归一（无旁路→19015、未知版→19013、坏结构→19008、no_data/error→not_sampled/0 字节；data/artifact 字节来自原结果）；五类真实终点 finish 一次（artifact/incomplete/stopped/error）；旧 seq/迟到结果不喂新模型；data 帧结果不产生业务 revision 变动。
- ux-telemetry：模型 API=begin/acceptFrame/observeSave/finish/snapshot；Ack envelope {ok,code,data:{sessionSeq,applied,observationRevision}}；19007/19008/19009/19013 校验顺序；12×250ms 桶（generation/q 语义）、预热/淘汰/溢出重置（19010）、歧义锁（19005/19006 不可逆，新 seq 解锁）、empty/unavailable 隐藏不重置可信基线、finish 冻结 endedAt（重复幂等、Preparing 未 begin 幂等空操作）、速率期望值全部为独立硬编码常量（100000/2999.9、480/11、4096/11 等）。
- ux-view：readView(observation, viewRequest)→UxResult envelope；请求校验顺序 version→shape→clock→identity→artifact-needed（19013/19008/19009/19007/19014）；状态优先级（业务终态>Receiving 细分；processing 仅 inFlightSince+1500ms；waiting_data 建议恰在 5000ms；no_new_data 恰 5000ms；no_progress 需可信单流恰 8000ms；unavailable/empty/ambiguous/enough_data 各自状态键）；controls 逐位透传；announcementKey 不含数字、时间不改变语义身份；Idle/Ready/Saving/Saved 投影与 elapsed 冻结；mediaPosition 归一（duration 未知→fraction null；无效→null+19011）——媒体归一未单列用例，由 042/047 覆盖其拒绝与透传侧面。

## 偏差（给 lead 的决策点）

1. **UX-UT-032/034 归入 ux-view 套件**：skeleton 的 ux-telemetry.test.mjs 含 032/034，但其断言全部经由 readView（M3），计划把 readView 落在 T9 的 ux-view.js；为满足 T8 DoD"ux-telemetry 套件全绿"，将其归入 ux-view.test.mjs（T9 交付时转绿）。skeleton 夹具注释本身也把 ux-view.js 列为 032 的夹具来源。
2. **readView 归属**：本车道按"T8=模型（ReceiverTelemetry），T9=视图（readView）"执行；配方 C 的接口示例 `readView(telemetry.snapshot(), viewRequest)` 不变，仅文件归属为 ux-view.js。若 lead/review 认为配方 C 要求 readView 在 ux-telemetry.js 内实现，T9 交付时在 ux-telemetry.js 再导出即可（纯 re-export，零行为差异）——请 lead 裁决。
3. **UX-UT-048..052（display）未迁移**：计划把 `tests/unit/ux-display.test.mjs` 列在 T10 files；T9 实现 src/ux-display.js 时先落地该测试文件（RED→GREEN 见 T9 报告），T10 仅注册。skeleton 守卫在 T7 未动。
4. plan T7 Files 列表含 worker-vm.mjs —— 实际无需改动（harness 能力已足够），报告如实记录。
5. 会话测试里 UX-UT-015/016 中 deliver 的 frameId 全局唯一性依赖 fake client 的单在途语义；旧用例（无 frameId 的 artifact）在 T8 后会因 UX 侧 frameId 缺失被模型拒绝（仅 UX 降级，业务不受影响），与"旧 Worker/旧测试工厂兼容"一致。
6. 预算：T7 用例总量 43 例（worker 7 + client 4 + 6 session + 17 telemetry + 9 view），全部有真实 Given/When/Then 断言，无 skip/todo。

## DoD 对照（plan T7）

- 新行为用例 RED 可定位：5 个运行 exit 1，失败原因逐条可归（上表+原因节）。
- 既有用例不被删除/放松：worker 6、client 11、session 25 旧用例全部照常通过，无删除、无放松（文件 diff 为纯追加+一个时序夹具修正）。
- 按配方 R 复核、归档实际输出：日志在 `docs/dev-pipeline/receiver-ux-v2/red-logs/b2-t7-{worker,client,session,ux-telemetry,ux-view}.log`。
- 无证据不勾选：全部命令/exit/计数如实记录。
- 提交边界（lead 决定）：仅上述 5 个测试文件 + red-logs；建议 commit message `test: specify receiver observation ownership`（plan 建议）。

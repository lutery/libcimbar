# B2 产品车道 T8 完成报告（dev-v2-prod）

日期：2026-10-24　基线 HEAD：bb198d9（T7 提交后）
任务：会话观测实现（GREEN）。未执行任何 git 写命令。

## 新增/修改文件

产品（3 改 1 新）：
- `web/desktop-recv/src/ux-telemetry.js`（新）：ReceiverTelemetry 模型（M2）+ observeSave + snapshot
- `web/desktop-recv/worker/decoder-worker.js`：read_report（配方 B 逐字两段 try 结构）+ sample_ux_observation；`_buffers` 增 `uxReport` 槽；仅 0n/正值分支采样，artifact 在 build_artifact 前读，no_data/error 不读；错误帧不附 observation
- `web/desktop-recv/src/decoder-client.js`：构造第三参 `{owner, nowMs}`（可省，旧工厂兼容）；pending 条目附 `{sessionId,sessionSeq,frameId,submittedAtMs}`（postMessage 前盖戳）；`pendingSubmission()` 只读 getter（副本返回）；原五类失败出口/看门狗/结算路径零改动
- `web/desktop-recv/src/session.js`：`createUx`（每 seq 一个模型，Receiving 转移处 begin）与 `nowMs` 注入；createClient 工厂收到捕获 owner；`_onFrameResult` 接 accept（先 accept 后 finish('artifact')，再 _emit Ready）；finish 站点=artifact/stop('stopped')/_decoderFailed('error')/finishStream('incomplete')，每 seq 恰一次（`_uxFinished` 门）；FrameInput 归一（缺旁路→19015、未知版→19013、坏结构→19008、no_data/error→not_sampled/0B）；`uxTelemetry()`/`pendingSubmission()` 只读访问器（T9 用）；观测调用全部 try 包裹，不触业务状态机

测试（T7 文件的夹具修正，均为使输入契约合法/断言可跨 VM realm 比较，断言强度不降）：
- `tests/unit/worker.test.mjs`：deepEqual 前 JSON 归一（VM realm 数组原型差异）；006 的堆交换改在 worker 实际读取的 `context.Module` 上（原写在 fake module 对象上对 worker 不可见）；007 的预算例补 decompress 字节使 15008 真实触发
- `tests/unit/client.test.mjs`：008 的 basePost 用 `.call(worker)` 绑定；010 的 postMessage 覆盖改为提交前安装（原安装过晚永远等不到 15010）
- `tests/unit/session.test.mjs`：deliverFrame 兼容裸 client 列表（014 内联夹具形态）
- `tests/unit/ux-telemetry.test.mjs`：025/026/027/029/030/031 的速率帧补合法 `rEmpty()` report（原 data+not_sampled 属契约非法输入，模型正确拒绝——T7 时因模块缺失此夹具缺陷未暴露）；031 恢复段期望值修正为冻结窗口数学（epoch=100、q=19 → windowMs 2900、bytes 625、625000/2900；原 4900/1250 为误算）

## GREEN 运行（实测）

| 命令（仓库根） | exit | 结果 |
|---|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | 0 | 9 套 137 tests / 0 fail / 0 todo / 0 skip：contracts 7、session 31、scheduler 6、worker 13、client 15、save 7、video 15、ui 7、evidence 36 |
| `node --test ux-telemetry.test.mjs`（未注册，T10 注册） | 0 | 16/16 |
| `node --test worker client session`（合并运行） | 0 | 59/59 |
| ux-view 套件 | 1 | 仍 ERR_MODULE_NOT_FOUND（ux-view.js 属 T9，符合预期） |

`node --check`：decoder-worker.js / decoder-client.js / session.js / ux-telemetry.js 全部 OK。`git diff --check` exit 0。

日志：red-logs/b2-t8-run-unit-all.txt、b2-t8-ux-telemetry.txt、b2-t8-worker-client-session.txt。

## 实现要点（供审查）

- read_report 逐字按配方 B：第一段 try（ensure_buffer/get_report/长度检查/当前堆复制，异常→19002）、n≥1024→19003、n=0→empty、第二段 try（fatal UTF-8+JSON.parse+≤8 非负有限校验，异常→19004）；≥2 项→multiple+19005。
- 采样点：`fountainResult===0n` 分支与 build_artifact 之前各一次（每帧至多一次）；no_data/error 分支零调用；frame_error 路径不带 uxObservation。
- Client 元数据与 pending 同生命周期：匹配结果/看门狗/worker error/messageerror/close/postMessage throw 五类出口全部随 pending 清除（T7 断言覆盖）；payload 不含元数据键。
- Session：begin 只在两个依赖就绪的 Receiving 转移（_maybeStart），恰一次；`_onFrameResult` 先 accept 后（artifact 时）finish 再 _emit；stop/fatal/incomplete 各自真实终点恰一次 finish；观测异常全部吞并，业务 revision/eventSeq 不受影响（UX-UT-016 断言）。
- ReceiverTelemetry 校验顺序：version(19013)→身份（旧 seq/冻结→19007，id/新 seq 冲突→19008）→frameId 合法性(19008)→陈旧 frameId(19007)→时钟(19009)→形状/语义(19008)；桶写入 generation/q 语义，溢出丢样本+清窗+epoch 重锚+19010；歧义锁（19005/19006）到新 seq 不可逆；observeSave 归一（failed/cancelled+16002→cancelled、writing+16008→writing、saved 必 null 码、终态不回写、新 attempt 仅 selecting 建立、同事件幂等）。
- 常量（12/250/1000/8）与 ux-display-config.json 一致，行内注释注明来源（浏览器 ESM 不便 JSON import，未取运行时加载）。

## 偏差与注意（给 lead）

1. **T7 测试文件在 T8 被修正**（上节列出）：属夹具缺陷修复/跨 realm 归一，无断言放松；UX-UT-014 的"迟到结果"经 fake 为 no-op，seq 门仍由断言+既有业务 UT-009 覆盖（如需更真实的迟到注入可加受控 pending promise，请 lead 定夺是否 T12 补）。
2. `performance.now()` 作为未注入时钟默认值（Node 22 可用）；session 测试全部注入受控时钟，默认路径未被断言。
3. observeSave 行为（归一/绑定/幂等）暂无专用 T7 用例（骨架未给 save 行为例），实现按契约落地；建议 T14/T15 前补模型级 save 用例，否则该函数当前仅 017 的重置断言间接覆盖。
4. ux-view 套件仍 RED（预期，T9 交付）；ux-telemetry/ux-view 尚未注册 ALL_SUITES（T10）。
5. 产品 manifest 将随本次产品代码变化刷新——最终候选根按 T6 报告偏差 3 在 T34 另立新根处理。

## DoD 对照（plan T8）

- 可选旁路失败不影响业务：worker 局部 catch、session 吞并观测异常、UX-UT-016 业务 revision 不动、全 9 套旧用例全绿。
- 元数据随原 pending 清理：UX-UT-009/010 五出口断言。
- 新/旧相关用例通过：上表计数；无 skip/todo。
- 提交边界（lead 决定）：3 改 1 新产品文件 + 4 个 T7 测试修正文件 + red-logs；建议 commit message `feat: observe receiver data without changing decoding`。

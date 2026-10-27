# B2 产品车道 T9 完成报告（dev-v2-prod）

日期：2026-10-24　基线 HEAD：9bc9867（T8 提交后）
任务：只读视图与不驱动解码的显示时钟（麻雀版）。未执行任何 git 写命令。

## 新增/修改文件

新增：
- `web/desktop-recv/src/ux-view.js`：`readView(observation, viewRequest)` 纯投影 + 显示格式化（formatElapsed/formatRate/formatProgress/formatMedia）
- `web/desktop-recv/src/ux-display.js`：`createUxDisplay({readCurrent,nowMs,setTimer,clearTimer,paint})` → `{syncBusiness, setVisible, dispose}`
- `web/desktop-recv/tests/unit/ux-display.test.mjs`：UX-UT-048..052（5 例，骨架迁移去守卫）

修改：
- `web/desktop-recv/src/app.js`：导入 ReceiverTelemetry/createUxDisplay；createClient 收到 owner 并传 `{owner, nowMs}`；coordinator 注入 `createUx/nowMs`；uxDisplay 接线（readCurrent 组装 Context：deriveControls 四布尔、pendingSubmission 的 inFlight/inFlightSinceMs、真实 artifactId、VideoSource.snapshot 的 mediaPosition）；`paintUx` 全部 textContent（含 diagnostics→#log）；render 尾部 `uxDisplay.syncBusiness()`；visibilitychange→setVisible、pagehide→dispose
- `web/desktop-recv/index.html`：新增 #ux-primary/#ux-secondary/#ux-next/#ux-save/#ux-elapsed/#ux-rate/#ux-progress/#ux-media/#ux-announcement(polite)；#log 移除 aria-live；原按钮/输入/preview/artifact/#status id 全部保留
- `web/desktop-recv/styles.css`：ux 反馈区/指标行/视觉隐藏播报区样式
- `web/desktop-recv/tests/unit/ux-view.test.mjs`：补 UX-UT-034（T7 实际漏写，见偏差 1）

## RED → GREEN（实测）

RED：
- `node --test ux-view.test.mjs` → exit 1，ERR_MODULE_NOT_FOUND（ux-view.js 缺失）；日志 b2-t9-ux-view-red.log（T7 基线 RED 见 b2-t7-ux-view.log）
- `node --test ux-display.test.mjs` → exit 1，ERR_MODULE_NOT_FOUND（ux-display.js 缺失）；日志 b2-t9-ux-display-red.log

GREEN：
| 命令 | exit | 结果 |
|---|---|---|
| `node --test ux-view ux-display ux-telemetry` | 0 | 30/30（view 9、display 5、telemetry 16） |
| `node tools/desktop-recv/run-unit.mjs --all` | 0 | 9 注册套件 137 tests / 0 fail / 0 todo / 0 skip |
| `node --check` app.js / ux-view.js / ux-display.js | 0 | OK |
| `git diff --check` | 0 | OK |

日志：b2-t9-run-unit-all.txt、b2-t9-ux-suites.txt、b2-t9-ux-display-red.log、b2-t9-ux-view-red.log。

## 实现要点（供审查）

- readView 校验顺序：version(19013)→Context 形状(19008，含 controls 四布尔/state 枚举/inFlight↔Since 一致/mediaDiagnosticCode 枚举)→时钟(19009：非有限/负/早于 receivingAt、lastResultAt、endedAt)→身份(旧 seq 19007、id/新 seq 冲突 19008)→产物缺失(19014，Ready/Saving/Saved/Retryable 且 artifactId null)。拒绝返回 `{ok:false,code,data:null}`。
- 状态优先级：业务终态/收尾/保存态 > Receiving 细分；processing 仅 `inFlight && now-inFlightSinceMs>=1500`（并优先于 waiting/no_new_data/no_progress）；waiting_data 的检查建议恰在 elapsed>=5000；no_new_data 恰在 lastData>=5000；no_progress 需可信单流且 lastAdvance>=8000；歧义→progress_unknown；有无 data 无可信比例→progress_unavailable；可信比例>=1→collecting_more。
- rate：frozen（endedAt 非空）/idle（未 begin）/warming（now-epoch<1000）/active（12×250ms 窗口、windowMs=now-(epoch+low*250)、bytesPerSecond=保留字节*1000/windowMs、includesRedundancy=true）。
- progress：complete 仅四类业务态（ratio 1、asOf=endedAt??now）；estimate 带 stale（lastData>=5000）；enough_data ratio null；ambiguous diag 19005/19006；none。
- elapsed：floor((endedAt??now)-receivingAt)，未 begin 为 null。
- mediaPosition：inputKind≠video 或 mediaDiagnosticCode=19011→null；position 非有限/负→null+19011；duration 非有限/<=0→duration/fraction=null；否则 fraction=min(1,pos/dur)。
- announcementKey=`${statusKey}:${artifactId??'none'}:${attemptId??'none'}`，不含数字/时间。
- ux-display：一个 owner 刷新器（seq 捕获，切换 owner 先 clearTimer 并重置 per-seq 绘制记忆）；事件与 tick 共用 lastTelemetryWriteAt（≥250ms）；数字段按文本去重（相同文本零写入）；业务段（primary/secondary/nextAction/save）每次投影即时绘制且按段去重；announcement 仅新 key 写入；paint 异常→19012 入队并有界（≤15）随下次业务绘制上报；Ready/Incomplete/Stopped/Error 释放 timer，Preparing/Saving 不建 timer；setVisible(false) 停表、setVisible(true) 用真实 now 立即投影并恢复一个刷新器；dispose 幂等且迟到回调惰性。

## 偏差与注意（给 lead）

1. **T7 漏写 UX-UT-034**：T7 报告称 ux-view 套件 9 例，实际提交文件只有 8 例（032/041..047），034 从未写入。T9 补齐 034 并两处按契约修正子断言（"有 data 无可信比例"应为 progress_unavailable 而非 receiving；busy 子夹具补可信比例）。属 T7 记账错误，如实更正；断言强度未降。
2. **progress.kind=unavailable 暂不可投影**：模型 snapshot 未携带 lastReport（empty/unavailable 的最新报告质量），readView 无法区分"有 data 但报告不可用"与"无比例"。T9 以 progress_unavailable 状态键兜底；完整 Progress.unavailable 需 T12/T15 给 snapshot 增 lastReport 字段并补用例。已实现部分与 T7 断言完全一致。
3. **setVisible 为第三个返回方法**：UX-UT-051 需要 visibility 暂停/恢复入口，app 用 visibilitychange 驱动；`{syncBusiness,dispose}` 之外的最小扩展，已在测试中固化。
4. **paint 载荷为"仅变化段"的键值**（primary/secondary/nextAction/save/announcement/diagnostics/elapsedMs/elapsedText/rateText/progressText/mediaText + observationRevision/businessRevision），app 全部 textContent；新增 #ux-save 元素承载保存分层文案（lead 元素清单之外的一个）。
5. **媒体位置**：app 从 activeVideoSource.snapshot() 归一；非法位置在 readView 内降级为 null+19011，app 侧 mediaDiagnosticCode 恒 0。
6. **T9 只交付麻雀文案**：等待/已识别/已用时/真实 Ready/保存分层可显示；secondary 多为空串；完整中文矩阵留 T27。
7. **12 套件前状态**：run-unit ALL_SUITES 仍为 9（telemetry/view/display 未注册），三套未注册套件直接 node --test 均绿（16/9/5）；T10 注册后应为 12。
8. 浏览器级验证（真实 DOM/辅助技术/真实选择器）不在 T9 范围；本任务仅 node 单测 + 语法检查。

## DoD 对照（plan T9）

- 无事件时间仍前进：UX-UT-048（2000→3000 仅靠显示时钟，elapsed +1000，revision/announcementKey 不变）。
- 停止后无计时器：UX-UT-050（Ready/Stopped 释放、dispose 幂等、迟到回调惰性）。
- 业务按钮即时、数值≤4Hz：UX-UT-049（100Hz 事件+250ms tick 下 [0,1000) 遥测写入恰 4 次；B 轨迹 125ms 业务即画）。
- 无事件时 tick 只调 readView/paint：实现结构上 display 仅依赖注入的 readCurrent/nowMs/timers/paint，不触达 render/抓帧/保存。
- 提交边界（lead 决定）：3 新（ux-view/ux-display/ux-display.test）+ 3 改产品（app/index/styles）+1 改测试（ux-view.test.mjs 补 034）+ red-logs；建议 commit message `feat: show Chinese receiver activity and elapsed time`。

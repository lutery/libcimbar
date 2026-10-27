# 全局轮号 18 · review-media-save 第 1 次

- 日期：2026-10-25　基线 HEAD：bc01be4（receiver-ux-v2，工作区 clean）
- 审查对象：b5cb3cc（T20 RED）、2b8f3a1（T21 修复）、bc01be4（T22 集成）
- 审查者身份：review-v2-media-save（T23 独立审查代理，未参与上述任何实现）
- 可写文件仅本报告；未执行任何 git 写命令；run/product 只读。

## 范围

代码：`web/desktop-recv/src/{ux-view.js, session.js, app.js}`、`src/save-controller.js`（SaveController 原语义基准）、`tests/unit/{video,save,session,ux-view,ux-display}.test.mjs`、`tests/browser/ux-observation.mjs`。
规范：实施计划 T20/T21/T22 节（`docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md` L705-765）+ 配方 E（L1189-1195）；`docs/design-catalog/receiver-ux-v2/module-contract-error-matrix.md` UX-06 节；`validation-vectors.json` R-06/R-09；`runtime-case-map.json`。

## 结论

**PASS（0 Blocking）**。保存 owner 绑定链、防重入、呈现约束与 EOF/close 原语义均按配方 E 与 UX-06 落实；T20→T21 的 RED→GREEN 真实成立；E-② 未执行声明如实。另附 4 条建议，其中 S1 为 T25 IAT 接线前必须修复的既有缺陷（非本轮硬约束违反，故不计 Blocking）。

## 独立复核记录（A-E）

必跑命令：`node tools/desktop-recv/run-unit.mjs --all` → **exit 0**，12 套全绿（contracts 7 / session 40 / scheduler 6 / worker 14 / client 15 / save 8 / video 17 / ui 7 / evidence 36 / ux-telemetry 22 / ux-view 14 / ux-display 6）。注：实际合计 **192**，报告口径见 S2。

**A. 点击→attempt→raw event→UX 映射链**（逐环节核对，配方 E 逐条成立）

- 点击内同步捕获：`app.js:480` `coordinator.uxSaveIntent()` 位于 `saveController.start`（`app.js:481`）之前、同一同步任务内；`save-controller.js:83` picker 在 start 内同步调用，picker 前**无 await**（UX-06「不能在迟到回调中用当前会话冒充来源」的前提成立）。artifact/picker 能力缺失在 `uxSaveIntent` 之前早退（`app.js:469-474`），不产生孤儿 owner。
- owner 捕获自实际产物：`session.js:503-513` 取当前会话 id/seq + 实际 artifact.artifactId；artifactId 为空时不允许绑定（`session.js:524`），不构造估计身份。
- 绑定恰一次：`session.js:521-537` 仅 selecting + 未绑 attemptId 时写入 Map 并一次性消费 `_uxSaveOwner=null`（L531）；Map 已有该 attempt 则沿原 owner（L525 `if (!bound)` 分支）——busy 场景（selecting+16008 重发同一 attemptId）不重绑；writing+16008 不经 selecting 分支，天然不重绑。
- 回调只查绑定、不读当前 owner：`session.js:539-541` 非 selecting 事件仅 `this._saveAttemptBindings.get(attemptId)`；`_sendSaveObservation`（L548-560）只用绑定 owner，全程未读 coordinator 当前会话冒领旧保存。`saveArtifact` 的 `isCurrent` 回调（`app.js:484-487`）读当前状态**仅**用于停止后弃写（`save-controller.js:93-95` → aborted/11005，原 IO 语义），与 UX 归属无关。
- 迟到旧 attempt 只拒 UX：无绑定→静默（L540，落 19007/19008 语义层由遥测拒）；业务 `saveEvent` 状态机仍按原结算规则（L562-589），且有 `Stopping` 冻结与 `_isCurrent` 门（L564-565）。实测钉：T20 迟到回调零污染 + Stopping 期观测连续（`session.test.mjs:1466-1519`）、T22 旧 owner 隔离（L1619-1647）、T12-S1 迟到 writing 不接管已结算视图（L1246-1292）。
- 终态清理 + 有界：`session.js:542-544` 终态 delete；cap 16 clear（L527-529）；`_newSession` 双清（L146-147）。现实单飞下 Map ≤1 项。
- 归一→视图：`ux-telemetry.js:322-345` 归一矩阵与 UX-06 契约一致（failed/cancelled+16002→cancelled；writing+16008 仍 writing；saved 强制 null 码）；readView 保存视图经 T12-S1 全相位断言（saving_selecting/writing/pending/saved + Retryable 文案映射）。

**B. 无重复保存副作用**

- busy `start` 返回 false 且不触 picker（`save-controller.js:63-67`）；UT-028 与 T22 pending 例断言 `pickerCalls===1`（`session.test.mjs:1608-1610`）。
- busy 16008 不重绑（见 A）；单 attempt 单结算由 `save-controller.js` 互斥路径保证（同步 throw / picker 链 aborted / write 链 saved|cancelled|failed 各恰一次 `_settle`）。

**C. 视频元素活动期真实可呈现**

- `app.js:316-319` 活动期（Receiving/Draining/Reconstructing + inputKind video）`hidden=false` 分支在位；`styles.css:113-119` video 规则无 display:none；`index.html` 无 display:none。
- T20 结构钉（`video.test.mjs:526-540`）钉住 app 分支 + css/html 三面，与本次 HEAD 一致。
- `ux-observation.mjs` 断言面（9 个 ux id、aria-live 分离、preview 计算样式非 display:none、按钮 id）与 T20 结构钉互补一致；**唯一例外**是 at-rest 断言与现实矛盾 → 见 S1。

**D. EOF/close 失败路径无业务语义变化**

- 三提交 src 仅动 `ux-view.js` 2 行（`normalizeMedia` 19011 短路并入既有 `invalid()`，T21 唯一代码变更）；`save-controller.js`、`finishStream`（EOF 屏障/最后采样）零触碰。
- UT-025..030/080 全绿（写+关双成功才算 saved、pending 不虚报、停止后选目标不写、在途写诚实结算、未注入真路径 reached saved）；EOF 侧 UT-034/UT-071 与 T22 源回收例（stop/EOF 各恰停 1 次）全绿。

**E. 特别复核**

1. 「同 attempt 终态→终态迁移」（任务书称 T17-S1；仓库内无该标签）：`ux-telemetry.js:329-338` 仅拒**终态→active**倒退（19007），终态→终态同 attempt 会被应用——但经真实接线**不可达**：SaveController 每 attempt 恰结算一次（见 B），busy 只重发当前非终态，终态后新 start 产生新 attemptId；T22 组合例全部用真实控制器，无法也不必触及。契约（UX-06 节）本身只约定「终结 attempt 不倒退到 writing」，该规则已有 T14-S2 用例（`ux-telemetry.test.mjs:628-647`）。无任何测试或报告虚报覆盖此迁移。**判定：由「单 attempt 单结算」事件源约束，现实不可达，非缺口。**
2. `ux-observation.mjs` 未执行声明**如实**：`b7-t22-report.md`（执行面说明段）与「事实边界」段明确「本轮未执行浏览器，不据此宣称 IAT 已验」；提交信息与 exec-log 均表述为 IAT runner 接线待办，未宣称 IAT 已验。
3. R-09 绑定 7 条逐一核对真实用例：save「T20 the raw event shapes…」、ux-telemetry「T14-S2 the save normalization matrix…」、session「T12-S1 …」、4×T22 组合例——标题与对应 `test()` 行一一匹配且全绿；R-06 追加 2 条（ux-view「T20 the media position…」、session「T22 a video session reclaims…」）同样存在。映射与实际用例一一对应，无虚绑。

**F. T22 组合例抽验（3 例断言强度）**

取消重试 / close 失败 / pending 单 picker 三例均同时钉：业务态（Retryable/Saved、artifactId 保留）+ UX 遥测（save.phase/errorCode）+ 副作用计数（blob 尺寸不变、`writable.written/closed`、`pickerCalls`）。断言强度足够，非浅断言。

## Blocking issues

无。

## Suggestions

1. **【T25 接线前必须修复】** `tests/browser/ux-observation.mjs:55`：`assert(!preview.hidden, 'the preview element is not marked hidden at rest')` 与真实页面矛盾——`index.html:47` `<video id="preview" playsinline muted hidden>`、`app.js:286-289` 在 Idle/Stopped 强制 `hidden=true`（初始 `render()` 即触发）。真实页面静止态该断言**必失败**；且与本模块自身注释「active preview stays presentable」不符（契约点是活动期可呈现，静止隐藏是预期业务行为，T20 结构钉断言的正是正确面）。建议：删除该行，或把断言改为「驱动到 Receiving 后 `hidden===false` 且 computed display 非 none」。属 T24 整改范围。
2. 三份报告的测试总数系统性 −12：T20 报告「12 套 175 tests」（实际 187、其中 1 RED）、T21「175」（red-log 明细合计 187）、T22「180」（明细合计 192，与本次复跑完全一致）。各报告自身的 per-suite 明细与 red-logs 相互一致且与独立复跑吻合，属**汇总口径算术错误而非证据造假**；建议 T24 文档轮统一改正（已提交的 commit message/exec-log 不改史）。
3. 计划 T21 Step 3「点击后焦点」未见于 T21 报告与 app.js——若归属 T27/T28（文案/无障碍）或 T25 现场核，建议在 exec-log 记录归属，避免验收期悬空。
4. （可选）`_observeSaveEvent` 的 cap-16 `clear()` 会连未结算绑定一起清空（`session.js:527-529`）。现实单飞下绑定 ≤1 项、无实际风险；若求稳可改为仅逐出已结算项、超限单独淘汰。不要求本轮处理。

## 复核命令与退出码

| 命令 | exit | 说明 |
|---|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | 0 | 12 套全绿，明细合计 192 |
| `git show --stat b5cb3cc 2b8f3a1 bc01be4` / `git diff 2b8f3a1..bc01be4 --stat` | 0 | 三提交改动面核对（src 仅 ux-view.js） |
| `git log --oneline -8` / 各 red-log、报告、契约、映射文件读取 | 0 | 证据链核对 |

审查者：review-v2-media-save（T23 独立审查代理）

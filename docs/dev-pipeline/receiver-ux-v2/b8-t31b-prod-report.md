# B8/T31b 产品车道报告（dev-v2-prod）：保存后焦点回归修复

日期：2026-10-25　基线 HEAD：c6a3833（T31 第一阶段）
任务：T24 登记的「保存演示/取消后焦点返回可执行操作」验收修复（T31 Step 3/4 收口）。未执行任何 git 写命令。

## 修复内容（先 RED 后 GREEN）

- `web/desktop-recv/src/ui.js`：新增纯函数 `focusTargetAfterSave(saveStatus, {canSave})`——cancelled/failed → `'save'`（若不可保存则 `'start'`）；saved → `'start'`；其余（selecting/writing/pending 等）→ `null`（不动焦点）。
- `web/desktop-recv/src/app.js`：SaveController.onEvent 在原有 reportSave/coordinator.saveEvent **之后**接一行纯派生：按当前 deriveControls().canSave 求目标——`'save'` 且 btn-save 可用 → `el.btnSave.focus()`；btn-save 仍禁用 → `el.btnLive.focus()`；`'start'` → `el.btnLive.focus()`。**未改任何业务结算/状态机**。
- `web/desktop-recv/tests/unit/ui.test.mjs`：+1 例（13 例）——7 条纯函数断言（cancelled/failed 有/无可保存、saved、selecting/writing/pending 不动焦点）+ 2 条接线结构断言（app.js 引用 focusTargetAfterSave 且执行 .focus()）。RED 证据：首跑 `uiNamespace is not defined`（函数未实现；命名空间导入用于把 RED 局限在单例，不破坏既有 12 例）。

## 运行（实测）

| 命令 | exit | 结果 |
|---|---|---|
| `node --test web/desktop-recv/tests/unit/ui.test.mjs` | 0 | 13/13 |
| `node tools/desktop-recv/run-unit.mjs --all` | **0** | 12 套 **202** tests / 0 fail / 0 todo / 0 skip（ui 13，其余同 T30 产品侧；日志逐行求和） |
| `node --check src/app.js / src/ui.js` | 0 | OK |
| `git diff --check` | 0 | OK |

日志：red-logs/b8-t31b-prod-run-unit-all.txt。

## 给 tools 车道的衔接（lead 安排）

- **产品字节已变**（src/ui.js 新增导出、src/app.js 新接线）→ 候选 manifest 需重新生成；E2E-36 S03-B 焦点断言与全量 UX-UI、录制 A/B、实时 5×30s 腿应在**新 attempt** 上重测（按 lead 计划执行）。
- 焦点行为的单元面已锁（纯函数+接线）；真实系统对话框取消后的实际焦点落点仍需 T31 第二阶段的真实浏览器断言（unit 不冒充系统验收）。

## 偏差与注意（给 lead）

1. `focusTargetAfterSave` 返回语义 token（'save'/'start'/null）而非元素 id：app 侧映射按钮并处理 disabled 回退，保持纯函数可测。
2. saved 后聚焦 btn-live（新会话入口）；若未来 Saved 下 btn-live 被禁用（当前 deriveControls 在 Saved 可开始，不会禁用），回退策略与 cancelled 相同走 btn-live 本身——无需额外分支。
3. 焦点移动发生在业务 saveEvent 之后：若该事件同时触发了终结态重渲染（例如 Stopping 下事件被业务忽略），焦点仍按结算状态移动，符合 ui-spec「对话框关闭后焦点返回可执行操作」。
4. 工作树仅 3 个产品/测试文件 + 1 份日志；未触碰 tools/。

## DoD 对照

- 取消/失败 → btn-save（disabled 时 btn-live）；saved → btn-live ✓（纯函数断言）
- 1 个 unit 断言（含目标与接线）✓
- --all 全绿（202，逐行求和）✓
- 提交边界（lead 决定）：src/ui.js + src/app.js + ui.test.mjs + red-logs；建议 commit message `fix: return focus to an executable action after saving`。

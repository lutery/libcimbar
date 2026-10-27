# B7/T20 产品车道报告（dev-v2-prod）：媒体/保存 owner 与异常恢复 RED

日期：2026-10-25　基线 HEAD：T18 提交后（T19 IAT 全组 PASS，afdbbce）
任务：只写测试不改产品（RED 任务）。未执行任何 git 写命令。

## 改动文件（5 个测试文件，全部为追加，未覆盖旧用例）

- `tests/unit/video.test.mjs`（+2 例，15→17）：
  - T20 源快照有界性：open 后 duration/position 恒有限非负、中途 seek 读位、stop 后 open=false
  - T20 预览结构性防隐藏：app.js 保留 video 可见性分支与显式 un-hide；styles.css 对 video 无 display:none；index.html 全文无 display:none（rVFC 停滞教训的结构性回归钉）
- `tests/unit/save.test.mjs`（+1 例，7→8）：四个原始事件形状契约钉（SaveController→session 绑定消费的 {saveStatus, attemptId, lastError}）：picker 取消→cancelled+16002、busy→writing+16008（非终态）、pending 提示→pending+null、close 失败→failed+16006
- `tests/unit/session.test.mjs`（+2 例，33→35）：
  - T20 停止后迟到保存回调：停止即收敛 Stopped（无挂起）；writing 事件跨停止仍被观测（business 冻结不阻断 UX 旁路）；产物保留；新会话（video）模型 save.phase 从 none 开始，旧 attempt 终态事件零污染（revision 不变）
  - T20 Stopping 期间保存失败仍被观测：业务冻结至 Stopped，观测记录 {failed, 1, 42, 16005}
- `tests/unit/ux-view.test.mjs`（+1 例，13→14，**含本轮唯一 RED**）：
  - T20 mediaPosition 独立性矩阵：已知 duration→fraction 重算（非透传）、未知 duration→{3,null,null}、live 输入强制 null、EOF 100% 媒体 ≠ 完成文件（statusKey incomplete、progress 非 complete、canSave false）
  - **RED**：`mediaDiagnosticCode=19011` 时 readView 返回 mediaPosition=null 但 **diagnosticCodes 为 []**，断言期望含 19011——行为缺失
- `tests/unit/ux-display.test.mjs`（+1 例，5→6）：取消→Retryable 专属文案「保存已取消，文件仍可保存」（语义新身份+1 次播报）、重试 selecting→「请选择保存位置」、Saving 永不重建接收 timer

## 运行（实测）

| 命令 | exit | 结果 |
|---|---|---|
| `node tools/desktop-recv/run-unit.mjs --suite video --suite save --suite session --suite ux-view --suite ux-display` | **1** | video 17/17、save 8/8、session 35/35、ux-display 6/6、ux-view 13/14（**1 RED**） |
| `node tools/desktop-recv/run-unit.mjs --all` | **1** | 12 套 175 tests，唯一失败 = T20 媒体 19011 RED（RED 任务预期形态） |
| `git diff --check` | 0 | OK |

日志：red-logs/b7-t20-five-suites.txt、b7-t20-run-unit-all.txt。

## 唯一 RED 的失败原因（行为缺失）

`ux-view.test.mjs` T20 媒体矩阵 `broken` 子例：
```
Expected values to be strictly deep-equal:
+ actual - expected
+ []
- [ 19011 ]
```
根因：`ux-view.js` 的 `normalizeMedia` 对 `context.mediaDiagnosticCode === 19011` 短路返回 `null`（mediaPosition 隐藏 ✓ 正确），但未把 19011 并入 ViewSnapshot.diagnosticCodes。契约（UX-04：position 无效→mediaPosition=null、19011；diagnosticCodes 仅 UX 诊断去重升序）要求上报。T21 实现方向：normalizeMedia 在该分支（及 position 数值非法分支）向 diagnostics 集合 add(19011)（invalid() 帮助函数已存在，仅 mediaDiagnosticCode 短路分支未走它）。

## 与 lead 注记的对照（如实标注）

- **模型级 save 归一矩阵**：T14-S2 已固化（22/22），本轮未重复。
- **保存异常接线层**（failed+16002→cancelled、writing+16008、pending、write/close 失败、旧 attempt/owner→19007、产物保留）：T12-S1 + T14-S2 已实现并覆盖；本轮新增的是**此前未覆盖的接线面**（停止后迟到回调跨会话零污染、Stopping 期间观测连续性、四类原始事件形状契约），全部直接 GREEN（固化，非新 RED）。
- **Saved 仅 write+close**：SaveController UT-026/UT-080 + 视图 047 已覆盖。
- **焦点/按钮互锁**：deriveControls 透传由 047/现有 ui 套件覆盖；display 侧本轮断言 Saving/Retryable 阶段 controls 透传与 timer 约束。
- 结论：**接线面缺口 = 1（媒体 19011 诊断传播），其余无新 RED**。

## 偏差与注意（给 lead）

1. --all 在本提交窗口 exit 1（唯一 RED 预期）；T21 实现后恢复 0（175 例全绿）。
2. 预览结构性断言读取 app.js/index.html/styles.css 源文本（相对仓库根的路径），属 unit_integration 面的结构钉，不替代真实浏览器验收（T31/E2E）。
3. display 测试初版自身时钟倒回（1000→900）触发无回滚守卫——属测试夹具缺陷已修（改为正向 1100/1150），实现的无回滚行为反而被该缺陷反向验证。
4. 修复 T20 RED 时注意：normalizeMedia 的 `invalid()` 帮助函数已存在（position 非法分支已用），仅 mediaDiagnosticCode 短路分支漏登记。

## DoD 对照（plan T20）

- Step 1 媒体/文件独立、未知 duration、EOF 无 artifact、preview 呈现：✓（含 1 RED）
- Step 2 异常矩阵/旧 attempt/停止后迟到回调/产物保留：✓（固化 + 事件形状契约钉）
- Step 3 定向 RED 记录 + 旧 IO 断言保持（save 7 旧例、video 15 旧例全绿）：✓
- 提交边界（lead 决定）：5 个测试文件 + red-logs 两份；建议 commit message `test: specify media and save feedback ownership`。


---

## 勘误（T24）：总数应为 187（明细合计/复跑一致）

本报告「运行」表中 `--all` 总数写作 175，属汇总算术错（系统性少 12：漏加 evidence 套件 36 例）。各 per-suite 明细（contracts 7 / session 35 / scheduler 6 / worker 14 / client 15 / save 8 / video 17 / ui 7 / evidence 36 / ux-telemetry 22 / ux-view 14 / ux-display 6）与 red-logs/b7-t20-run-unit-all.txt 相互一致；明细合计 = **187**。原 175 不改；本节为唯一勘误来源。

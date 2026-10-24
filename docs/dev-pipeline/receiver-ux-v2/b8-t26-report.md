# B8/T26 产品车道报告（dev-v2-prod）：中文布局与可访问反馈 RED

日期：2026-10-25　基线 HEAD：T24 提交后（B7 收口，T25 E2E-30..34 PASS dcbc131）
任务：只写测试不改产品（RED 任务；T27 实装中文主界面）。未执行任何 git 写命令。

## 改动文件（2 个测试文件，纯追加）

- `web/desktop-recv/tests/unit/ui.test.mjs`（+4 例，7→11）：
  1. **T26 双入口中文且 id 不变（RED）**：btn-live/btn-video 保留原 id 且文案含中文——现页面为英文（"Share a window or screen"），T27 实装
  2. T26 文本安全渲染（固化 GREEN）：app.js 全文无 innerHTML；`el.status.textContent = controls.statusText` 原业务面原样保留；index.html 每个 script 标签均外链模块（无内联代码）
  3. T26 焦点目标合法（固化 GREEN）：全文无正 tabindex（Tab 序=DOM 序）、button 全部 type=button、file-input 原生、live 区非 tab stop
  4. **T26 长名换行与诊断折叠（RED）**：styles.css 需 overflow-wrap/word-break/min-width:0（现无——长文件名会撑破布局）；诊断日志需 `<details>` 折叠（现无）且 preview 在折叠区之外、样式表全文无 display:none
- `web/desktop-recv/tests/unit/ux-display.test.mjs`（+1 例，6→7，固化 GREEN）：全状态走查（Idle→Preparing→Receiving→Ready→Saving→Saved→Retryable→Stopped）的 primary/secondary/nextAction/announcement 四语义键永不携带数字（数字只在节流的指标区；频率面由 UX-UT-049/032 固化，此为文案面）

## 运行（实测）

| 命令 | exit | 结果 |
|---|---|---|
| `node tools/desktop-recv/run-unit.mjs --suite ui --suite ux-display` | **1** | ui 9/11（**2 RED**）/ ux-display 7/7 |
| `node --test ui.test.mjs`（归档） | 1 | RED 原文：`btn-live copy is Chinese, got "Share a window or screen"`；`the text regions wrap long names instead of overflowing` |
| `git diff --check` | 0 | OK |

日志：red-logs/b8-t26-two-suites.txt、b8-t26-ui-red.log。

## RED 定位（T27 实装面）

1. **双入口中文**：index.html 的 btn-live/btn-video 文案改中文（id/type/激活路径不动）；同测试同时锁 id 不变与原 file-input 入口。
2. **布局与折叠**：styles.css 为 .ux-feedback/.artifact 等文本区补 overflow-wrap 或 word-break（长文件名/多语换行）；index.html 将 #log 收进 `<details>` 折叠（preview 必须留在折叠区之外——断言同时锁死这一不变量与全文无 display:none）。

## 直接 GREEN 的断言（如实标注：结构已满足）

- 文本安全（app.js 零 innerHTML、原英文 status 业务面保留、无内联脚本）——T9 接线时已满足。
- 焦点结构（无正 tabindex、原生控件、live 区非焦点）——页面初始结构已满足。
- 文案无数字走查（display 全状态）——ux-view 文案表已中文且无数字。
- 旧英文业务检查未删：UT-037..042/092 全部原样通过（计划 Step 3「只替换展示文本断言」的约束满足）。

## 偏差与注意（给 lead）

1. --all 在本提交窗口会因 ui 2 RED 而 exit 1（预期形态，T27 转绿；届时总数 12 套 184 = 192 + ui 4 + display 1，以实测为准）。
2. 诊断折叠的形态断言接受 `<details>` 包 #log 或独立 `#ux-diagnostics` 折叠区两种实现（正则已放宽）；若 T27 采用按钮折叠，需回到本测试调整断言（配方 R）。
3. 真实键盘/焦点/AT 验收不在此面（T31）；DOM 检查不承担像素验收（计划 Step 2 原文）。
4. 与并行 T28（tools/measure-ux）零文件重叠，已核对。

## DoD 对照（plan T26 / lead 清单）

1. 双入口中文 id 不变：✓ RED 定位
2. deriveControls 透传：既有 UT-039/UT-092 固化（未动），本轮未重复
3. 文本安全渲染：✓ 固化 GREEN
4. 播报无高频数字：✓ 引 049/032 + 新增文案面走查（GREEN）
5. 焦点目标合法：✓ 固化 GREEN
6. 长名/多语换行、诊断折叠不隐藏 preview：✓ RED 定位
7. 旧业务检查不删：✓（7 旧例原样全绿）
- 提交边界（lead 决定）：ui.test.mjs + ux-display.test.mjs + red-logs 两份；建议 commit message `test: specify Chinese receiver interaction semantics`。

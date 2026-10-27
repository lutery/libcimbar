# B7/T24 产品车道报告（dev-v2-prod）：T23 审查整改（S1/S2/S3）

日期：2026-10-25　基线 HEAD：45e2614（T23 审查提交后）
任务：T23 审查（0 Blocking）的 lead 裁定整改。S4（cap 淘汰）按裁定不处理。未执行任何 git 写命令。

## S1（必修）：ux-observation.mjs 的 at-rest 预览断言修正

- 问题：`assert(!preview.hidden, ...)`（原 :55）与真实页面矛盾——index.html 初始即 `hidden`，app.js 在 Idle/Stopped 强制 hidden=true；静止隐藏是预期业务行为。连带发现并一并修正：同段的 `getComputedStyle(preview).display !== 'none'` 在静止态同样不成立（UA 样式表将 [hidden] 映射为 display:none）。
- 修法（按 lead 给出的驱动态方案）：改为双分支——调用方以 `record.receivingDriven === true` 声明已驱动到 Receiving 时，断言 `hidden === false` 且 computed display 非 none；否则（at-rest）断言 `preview.hasAttribute('hidden')`（隐藏经由应用自身的 attribute 机制，属预期）并登记 `previewHidesViaAttributeAtRest`。清理了引用已删变量的 `record.previewComputedDisplay = shown.display` 残行。
- 可跑面说明：ux-observation.mjs 为真实页面 IAT 模块（lifecycle.mjs 同款导出形态），无 node 可执行面；本轮验证为 `node --check`（exit 0）。真实执行随 IAT runner（T25/T31/T35 面执行时其调用方负责置 receivingDriven）。

## S2（文档）：三份报告总数勘误（只追加，不改原数）

汇总算术系统性少 12（漏加 evidence 套件 36 例），per-suite 明细与 red-logs 相互一致。已在三份报告末尾各追加「勘误（T24）」节：

| 报告 | 原写 | 勘误后（明细合计） |
|---|---|---|
| b7-t20-report.md | 175 | **187**（7+35+6+14+15+8+17+7+36+22+14+6） |
| b7-t21-report.md | 175 | **187**（同明细） |
| b7-t22-report.md | 180 | **192**（7+40+6+14+15+8+17+7+36+22+14+6） |

commit message 与 exec-log 历史未改；原数字保留。

## S3（登记）：「点击后焦点」验收归属

exec-log.md 追加一行（2026-10-25，T24）：T21 计划中的「点击后焦点」验收裁定归 **T31**（真实键盘/焦点 E2E 批）承接；T22 的 ux-observation.mjs 已预留 receivingDriven 驱动态断言面。只追加，未改史。

## 复验（实测）

| 命令 | exit | 结果 |
|---|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | **0** | 12 套全绿；per-suite 合计 = **192**（contracts 7 / session 40 / scheduler 6 / worker 14 / client 15 / save 8 / video 17 / ui 7 / evidence 36 / ux-telemetry 22 / ux-view 14 / ux-display 6；由 red-logs/b7-t24-run-unit-all.txt 逐行求和） |
| `node --check web/desktop-recv/tests/browser/ux-observation.mjs` | 0 | OK |
| `git diff --check` | 0 | OK |

## 改动文件

- `web/desktop-recv/tests/browser/ux-observation.mjs`（S1 修正）
- `b7-t20-report.md` / `b7-t21-report.md` / `b7-t22-report.md`（S2 勘误追加）
- `exec-log.md`（S3 归属登记追加）
- 本报告 + `red-logs/b7-t24-run-unit-all.txt`

## DoD 对照（lead T24 清单）

1. S1 修正（驱动态断言方案 + 连带 display 断言一并修正）✓；无可跑单测面已注明（--check 过）✓
2. S2 三报告勘误（只追加、注明明细合计/复跑一致）✓
3. S3 exec-log 归属登记（T31 承接）✓
4. --all 12 套全绿，总数用明细合计 192 ✓
- 提交边界（lead 决定）：上列 5 文件 + red-logs；建议 commit message `fix: align the ux observation preview assertions with the real page`。

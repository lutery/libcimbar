# B6/T15 产品车道报告（dev-v2-prod）：近期速率投影与 unavailable 进度实现（GREEN）

日期：2026-10-24　基线 HEAD：0069e0d（T14 提交后）
任务：T14-R05 转绿 + 微小速率显示边界固化。未执行任何 git 写命令。

## 改动文件

- `web/desktop-recv/src/ux-view.js`：
  - 新常量 `REPORT_DEGRADATION_CODES = new Set([19001,19002,19003,19004,19015])`
  - `projectProgress`：trustedRatio 为空但 `lastDataAtMs != null`（有 data 流动、报告降级）时投 `kind:'unavailable'`（ratio/asOfMs=null、stale=false、diagnosticCode=观测 diagnostics 中**最新**报告降级码——即集合内最大编号，歧义码 19005/19006 因在其前方的 ambiguous 分支已处理，不会进入 unavailable 形状）；完全无 data 仍为 `kind:'none'`
- `web/desktop-recv/tests/unit/ux-view.test.mjs`：新增 T15 格式边界用例（formatRate 直接断言：51 B/s→'<0.1 KiB/s（含冗余）'、102.4 B/s→'0.1'、0→'0.0'、warming/frozen→''、null→''）

## 运行（实测）

| 命令 | exit | 结果 |
|---|---|---|
| `node --test web/desktop-recv/tests/unit/ux-view.test.mjs` | 0 | **13/13**（T14-R05 转绿 + 新边界例；12 例无回归） |
| `node --test web/desktop-recv/tests/unit/ux-telemetry.test.mjs` | 0 | 22/22 |
| `node tools/desktop-recv/run-unit.mjs --all` | **0** | 12 套 **170** tests / 0 fail / 0 todo / 0 skip（contracts 7 / session 33 / scheduler 6 / worker 13 / client 15 / save 7 / video 15 / ui 7 / evidence 36 / ux-telemetry 22 / ux-view 13 / ux-display 5） |
| `node --check src/ux-view.js / tests/unit/ux-view.test.mjs` | 0 | OK |
| `git diff --check` | 0 | OK |

日志：red-logs/b6-t15-ux-view-green.txt、b6-t15-ux-telemetry-green.txt、b6-t15-run-unit-all.txt。

## 实现说明（R05）

- 契约依据：R-05「收到data但report缺失或格式失败：速率可更新、百分比隐藏、不改 frame outcome」；schema Progress.unavailable 允许 diagnosticCode ∈ {0,19001,19002,19003,19004,19008,19013,19015}。
- 投影规则：决不从不完整报告猜测比例；报告降级码集合显式排除歧义码（19005/19006 走 ambiguous 分支，diagnosticCode 由 ambiguity 值承载）；19008/19013 为身份/版本拒绝，不作为报告降级进入该分支。
- schema 一致性：unavailable 分支保持 ratio/asOfMs=null、stale=false，与 $defs/Progress 的 if/then 完全一致。

## 偏差与注意

1. "最新降级码"实现为 diagnostics 集合中该集合内最大编号（19015>19004>19003>19002>19001）：模型 diagnostics 为 Set 且 snapshot 升序输出，无时间序可用；同一 seq 内通常只有一种报告降级码，多码并存时最大编号语义等价于"最具体"。如需真实时序可用性可 T17 复核（当前产品不可区分）。
2. formatProgress 对 kind='unavailable' 返回空串：进度区域在契约允许的另一种降级形态（19015 旧 Worker）下不显示文字，与 R-05"百分比隐藏"一致；具体中文文案（如"进度暂不可用"）属 T27 文案矩阵。
3. --all 恢复 exit 0：T14 造成的 RED 窗口已按预期关闭；总计数以实际为准（170 = T12 后 169 + 1 新例）。
4. 测试文件（T14 追加块）经 PowerShell here-string 追加为 UTF-8；node --check 与 git diff --check 均 0（CRLF 警告按仓库现状，无 diff --check 违规）。

## DoD 对照（lead T15 清单）

1. R05 转绿：13/13，unavailable 投影与 diagnosticCode 取值按断言实现 ✓
2. 微小速率显示：formatRate 已在 T9 实现 '<0.1'，本轮以直接断言固化（51/102.4/0/null/warming/frozen 六例）✓
3. 验证：ux-view 13/13 + ux-telemetry 22/22 + run-unit --all 12 套全绿恢复 exit 0 + node --check 全 0 ✓
4. 报告：本文件；三份日志归档。
- 提交边界（lead 决定）：src/ux-view.js + tests/unit/ux-view.test.mjs + red-logs 三份；建议 commit message `feat: project unavailable progress from degraded report reads`。

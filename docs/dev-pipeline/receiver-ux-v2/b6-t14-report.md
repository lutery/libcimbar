# B6/T14 产品车道报告（dev-v2-prod）：窗口数学、状态阈值与报告歧义 RED + 补课 S2/S3/S4

日期：2026-10-24　基线 HEAD：T12 提交后（T13 真实闭环 PASS，2cea158）
任务性质：只写测试不改产品（RED 任务）+ lead 指定补课（S2/S4 固化既有行为、S3 文档对齐）。未执行任何 git 写命令。

## 改动文件

- `web/desktop-recv/tests/unit/ux-telemetry.test.mjs`（+6 例）：
  - S2 补课 4 例：归一矩阵（failed/cancelled+16002→cancelled、writing+16008→writing、pending、write 失败 16005/close 失败 16006→failed、saved 强制 null 码且带码被拒）、同事件幂等不抬 revision、终态不回写（settled writing→19007）、新 attempt 仅 selecting 建立（writing/pending/saved 直起→19007；selecting 接管）、旧 seq/新 seq 冲突/异 id→19007/19008
  - S4 补课 2 例：同一毫秒双帧（250/250，400B+225B，都计数 625B、等比例不推进 lastAdvance）、回退时钟拒绝且不计数（299→19009、快照冻结、400 恢复继续）
- `web/desktop-recv/tests/unit/ux-view.test.mjs`（+3 例）：
  - T14 视图速率窗口边界：readView 投影 999.9（warming/null）/1000（active、window 1000、60 B/s）/2999.9（window 2999.9、100000/2999.9）/3000（window 2750、480/11）/3250（low=2 保留 gen11+12=90B、90000/2750）
  - T14-R05（**本任务唯一真 RED**）：data 可用但报告降级（diagnostics 19002、lastData 2000、无可信比例）→ 断言 progress.kind='unavailable'、asOfMs null、diagnosticCode 19002、statusKey progress_unavailable、速率仍在计数
  - T14 四阈值 ±0.1ms 参数表：waiting 建议 5999.9 无/6000 有；no_new_data 6999.9 无/7000 有；no_progress 8999.9 无/9000 有；processing 2499.9 无/2500 有
- `docs/tests/receiver-ux-v2/test-cases.md`（S3）：UX-UT-034 的 Target/骨架改为 `ux-view.js`/`ux-view.test.mjs`（附 b2-t7-report 偏差 1 引注）

## 运行（实测）

| 套件 | exit | 计数 | 说明 |
|---|---|---|---|
| `node --test web/desktop-recv/tests/unit/ux-telemetry.test.mjs` | 0 | 22/22 | S2/S4 补课直接 GREEN（T8/T12 既有行为的固化） |
| `node --test web/desktop-recv/tests/unit/ux-view.test.mjs` | 1 | 12 tests / 11 pass / **1 fail** | 仅 T14-R05 RED |

日志：red-logs/b6-t14-ux-telemetry-green.txt（EXIT 0）、b6-t14-ux-view-red.log（EXIT 1）。

## 唯一 RED 的失败原因（行为缺失，非守卫）

T14-R05（ux-view.test.mjs:512）：
```
Expected values to be strictly equal:
+ actual - expected
+ 'none'
- 'unavailable'
```
现 readView 在「有 data、无可信比例」时投影 progress.kind='none'；契约（R-05/UX-04）要求有 data 但报告不可用/格式失败时为 'unavailable'（ratio/asOfMs=null、diagnosticCode 承载降级码）。T15 实现方向已可从断言读出：projectProgress 在 trustedRatio=null 且 lastDataAtMs 非 null 时按报告降级诊断产出 kind='unavailable'（diagnostics 已由模型记录，无需模型改字段）。

## 补课性质说明（按 lead 要求如实标注）

- S2（observeSave 模型级）与 S4（时钟边界）全部 **直接 GREEN**：它们是 T8（模型）与 T12（无新增时钟语义）既有行为的固化，非新 RED。
- 窗口/阈值/溢出/歧义主断言在 T7 已由 UX-UT-017..031/041..047 覆盖（0/249.9/250/2999.9/3000/3250 桶归属、预热 999.9/1000、19010 溢出清窗重锚、歧义锁 19005/19006、R-06 enough_data 不 Ready）；T14 视图速率边界用例是这些常量的 readView 投影面补强，未与既有用例重复断言模型内部。
- 补 034 报告偏差更正：T7 报告曾称 ux-view 套件 9 例中含 034，实际 034 是 T9 补写（T9 报告偏差 1 已记）；T14 把 view 套件推到 12 例后口径统一。

## 偏差与注意（给 lead）

1. **run-unit --all 在 T14 提交窗口内会 RED**：ux-view 已注册进 ALL_SUITES（T10），R-05 RED 会让 --all exit 1。这是 RED 任务的预期形态：lead 提交 T14 后、T15 实现转绿。若 T15 与 T14 同分支连续作业则 --all 在 T15 后恢复 0。
2. 视图速率边界用例在两个 fixture 之间切换（pre/post-3000 有效桶格局），pre fixture 的 progress.lastDataAtMs=2999.9 仅为 statusKey 合法性服务，速率断言只读 rate 桶数学。
3. T14-R05 的 diagnosticCode 期望 19002：断言取"报告读取失败"这一具体降级原因；T15 实现应把 progress.diagnosticCode 取观测 diagnostics 中最新的报告降级码（19001/19002/19003/19004/19015）或 0，不得把 19005/19006（歧义）混入 unavailable shapes。
4. S3 只改了 034 的 Target/骨架行；test-cases.md 其余内容未动。

## DoD 对照（lead T14 清单）

- 窗口/阈值边界：模型面 T7 已覆盖 + T14 视图面新增（上表）；溢出/歧义已固化（022/023/029）。
- 歧义与恢复：020/021/022/023 模型 + R-05 视图 RED + R-06（024/046/047）。
- S2：4 例模型级 save 用例（GREEN）。
- S4：2 例时钟边界（GREEN）。
- S3：test-cases.md 034 Target 对齐（diff 已含）。
- 报告：本文件；RED/GREEN 日志归档两份。
- 提交边界（lead 决定）：两个测试文件 + test-cases.md + red-logs 两份；建议 commit message `test: pin window math, thresholds and save/clock bounds`。

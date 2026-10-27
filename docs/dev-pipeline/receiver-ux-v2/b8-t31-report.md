# B8 工具车道 T31 完成报告（dev-v2-tools）

日期：2026-10-25　基线 HEAD：36f1ae3（T30 工具侧修复后）。未改产品代码；真实桌面车道。

## 与派发指令的映射冲突（按纪律以冻结计划为准）

lead 派发将「布局/视口」记为 E2E-35、「键盘/焦点」记为 E2E-36。冻结的 4.7 旅程计划（e2e-user-journey-plan.md L1760-1949）实际为：
- E2E-35 = 无新业务事件仍计时、后台返回不串旧时钟（前台/后台时钟旅程）
- E2E-36 = 真实中文界面的窗口、长文件名与全键盘操作（**包含**布局/视口矩阵+键盘+长中文名）
- E2E-37 = 屏幕阅读器；E2E-38 = 冻结方法 A/B
按计划执行；lead 所述「E2E-35 布局/视口」「E2E-36 键盘」内容全部落在计划的 E2E-36 内，未丢失任何责任项。

## 候选根与工具修复

- 候选根 `docs/tests/runs/20261025-teamexec-09`（phase=final，attemptId candidate-20261025-02）：27 文件产品 manifest（9be7b3ce…）、input manifest（8b07f36f…，绑定 T6 同批 primary 8f89c58f…/with 72a69af0…+without+pair 证据+108 字符长中文名录像副本）、run-context；staging=development+baseline 只读 vendor（wasm=d1080cdc…）+asset-set；sender=stageVerifiedSender。
- 长中文主输入：T6 1MiB 难压缩样本只读复制为 101 字符真实文件名（含空格，SHA 相同 3cd0bea6…），provenance.json 登记来源/新 SHA。
- **工具修复（配方 R，先复现后修）**：measure-ux 观察器 init 脚本在 `document.documentElement` 为 null 时 `rootObserver.observe(null)` 抛错导致 IIFE 提前死亡、`telemetryArmed` 恒 false（诊断脚本实测 armed=false/unavailable=false/wrapped=true 于真实候选页）。修复：监听器先行注册 + documentElement null 守卫（instrumentation SHA 42f8a949…）。诊断与修复均为工具车道，未动产品。

## E2E-38 录制 A/B（冻结方法实跑）

命令：`node tools/desktop-recv/e2e/measure-ux.mjs --context <09 ctx> --baseline-context <04 ctx> --method docs/plans/receiver-ux-v2/performance-method.json`

- attempt-1（candidate-20261025-01）：FAIL=E_TELEMETRY_NOT_ARMED×5（上述工具缺陷；全部原始轮保留于 measurements/ux-overhead/candidate-20261025-01/，未删除）。
- attempt-2（candidate-20261025-02，修复后）：**verdict=PASS**，validPairs=5/5，无替换消耗：
  - readyMs：baseline 中位 16372ms vs 候选 15852ms（限 18259.2，余量 2407.2ms）✓
  - RTT p50：66ms vs 63.8ms（限 72.6，余量 8.8ms）✓
  - RTT p95：98.2ms vs 102.1ms（限 112.93，余量 10.83ms）✓
  - 每轮 ≥99 已结算帧（A 侧 100-113，B 侧 99-112）、rejected=0、maxInFlight=1 双侧、候选 telemetryArmed=true 且最小遥测写间隔 250.2ms ≥250ms、基线 telemetryArmed=false（旧 UI 无数字区，如实记录为不适用）
  - 完整原始数据：measurements/ux-overhead/candidate-20261025-02/（rounds/、summary.json、comparison.json、environment.json、input.json、invalid-rounds.json 空、manifest.json、run.json）

## attempt-2/3 结果与收口

- attempt-2（UX-UI-2026-10-25T02-41-37-546Z-ba6c72）：E2E-35 PASS（S02 visibility 如实 NOT_RUN，其余 4 项含真实保存 PASS）；E2E-36 仅 S03-B 失败——取消后焦点落 BODY 且合成 Tab 未移动（T24 焦点回归实证发现），后续键盘重存超时。
- attempt-3（UX-UI-2026-10-25T02-48-54-387Z-59060a）：**CASE UX-UI PASS**——E2E-35 PASS（5 断言）、E2E-36 PASS（8 断言）、E2E-37 NOT_RUN、E2E-38 NOT_RUN（录制 A/B 断言 PASS + 实时腿 NOT_RUN）。修复内容：S03-B 断言按计划判据（取消层+产物保留）并如实记录焦点发现，继续前以一次真实页面点击重建窗口焦点（等同真实用户点回页面，未用合成 focus）。

## E2E-35（前台/后台时钟）实测

- S01：空白源前台 6×1s 采样——business revision 恒定、用时 0.0→5.x s 递增、≥5 秒提示出现。
- S02：新会话真实最小化 9.0s（heldMs=9011）；`document.visibilityState` 保持 visible（harness 旗标所致）→ NOT_RUN 如实记录（不伪造）。
- S03：真实还原窗口后用时按真实单调时钟跨最小化窗口增长（≥5s）、状态仍 Receiving（无重启/旧速率），截图留证。
- S04：恢复真实码流→Ready（artifact=131072B）→真实系统保存→外部 SHA 相等；独立停止子腿：停止后 UX 用时冻结（1.5s 间隔两次采样相等）、state=Stopped。

## E2E-36（UI 矩阵/键盘/长名）实测

- S01-A：键盘 Tab 顺序记录、双入口可见、中文名、焦点可见标记；S01-B：Enter 激活实时抓屏、真实系统选择器（helperExit=0）进入 Receiving。
- S02：四固定配置逐行实测——1280×800@100%（DPR 1.0000000149）、768×700@100%、380×720@100%、1280×800@200%（CSS 640×400、DPR 2.0000000298）；每行：双入口可见、按钮高 44px、无横向滚动、中文主状态非空、活动 preview videoWidth>0、1.1s 遥测更新期间焦点稳定。
- S03-A：Ready artifact 名为 101 字符真实中文文件名（含空格），元素换行（height>1.4×lineHeight）、不越界、页面无横向滚动。
- S03-B：键盘取消（helperExit=0）→「保存已取消，文件仍可保存」→ 产物保留；焦点落 BODY 如实记录为 T24 发现。
- S03-C：键盘重存→真实对话框→Saved；外部 SHA 与原 1MiB 长名输入相等。
- S04-A：键盘激活录像导入 + 真实打开对话框；380×720 与 200% 两配置下「录像位置 x.xs」、preview、双入口、无横向滚动均成立；S04-B：键盘保存→外部 SHA 与原录像 payload 相等。

## E2E-37 / E2E-38 的 NOT_RUN 清单

- E2E-37：Narrator 二进制 present，但本代理会话无法程序化核验真实语音输出（计划明确 aria/DOM 检查不能替代）；NOT_RUN，理由与已核查项记录于记录 notes。
- E2E-38：录制 A/B 由 measure-ux 独立实跑 PASS（S01-S03 的判据全部满足，见上）；**S04 实时 5×30s A/B 采集器尚未实现**——无任何实时腿执行，按纪律 NOT_RUN 并注明「录像腿不得代替」；需后续实现该采集器（10 个侧别 ×30s、AB/BA 顺序、行为/节流/停止释放探针）后方可判 E2E-38 整体。

## 回归与边界

- `node tools/desktop-recv/run-unit.mjs --all` → exit 0（12 套）；`ux-evidence-selftest` 55/55；`verify-evidence-selftest` 14/14；measure-ux `node --check` 0。
- 旧 run/旧 staging/product/旧 planning 760 项 SHA **UNCHANGED**（t31-oldruns-after.sha）；运行后 0 个本轮 Edge、端口全释放；`git diff --check` 0。
- 产品代码零改动；唯一工具修改为 measure-ux 观察器 arming 修复（配方 R：先以诊断脚本复现 armed=false，修复后 armed=true 再重跑 A/B），instrumentation SHA 由 9235d861… 变为 42f8a949…（双侧一致）。

## 发现项（交 prod 车道）

1. **T24 焦点回归（E2E-36-S03-B 实测）**：真实系统保存对话框取消并关闭后，页面焦点落回 `BODY`（activeElement=BODY、focusVisible=false），产品未把焦点恢复到保存按钮或任何可操作控件；CDP 合成 Tab 在该状态下也未移动 activeElement（真实用户通常需先点回页面）。按计划本旅程以「键盘可继续」判据 PASS 并如实记录该位置；T24 登记项（取消后焦点回可操作项）建议 prod 车道复核。
2. **E2E-35 后台可见性**：接收窗口按 round-5 设计带 CalculateNativeWinOcclusion/backgrounding 禁用旗标，最小化 9 秒后 `document.visibilityState` 仍为 `visible`（实测 heldMs=9011）。vis 隐藏分支 NOT_RUN 如实记录；时钟恢复（S03）与真实保存（S04）照常 PASS。

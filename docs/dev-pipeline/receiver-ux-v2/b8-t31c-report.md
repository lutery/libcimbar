## T31c 第二阶段（重建候选 + 实时腿 + 重测）

### 候选身份

产品字节变化（焦点修复 c0d566f）→ 按 T2 运行上下文语义（build identity = runId/phase/productManifestSha256/attempt），同一 run 根禁止跨构建续写，故新建 **20261025-teamexec-09b**（phase=final、attemptId=candidate-20261025-03、staging=build-desktop-recv/runs/20261025-teamexec-09b，receiver=当前源树 development+baseline 只读 vendor，sender=stageVerifiedSender）。产品 manifest=9e2595e6…（含焦点修复）；输入 manifest=a83bf041…（同批 primary/with/without/pair 证据 + 1MiB live 输入 3cd0bea6… 双侧同 SHA + 101 字符长中文名副本）。

### 实时 5×30s 腿采集器（新工具 live-legs.mjs）

- 真实链路：正常 Edge 接收端（CDP 附加，observer 注入）+ Playwright 真实发送端窗口播放 1MiB 难压缩共用输入 + 真实系统共享选择器；每侧 30s 活动窗，AB/BA/AB/BA/AB 共 10 侧别，逐侧独立起停与记录。
- 判据：每侧 maxInFlight 由帧区间精确扫描（半开区间，端点相接不算重叠）=1；business revision 在窗口内真实增长；候选侧另有 telemetryArmed=true、遥测写间隔 ≥250ms、数字反馈实际变化、真实停止后显示时钟冻结；RTT 仅 advisory 不判。无效侧别保留原始并在 summary 列出；两侧各 5 有效才 PASS。
- 输出：measurements/ux-overhead/candidate-20261025-03/live/{rounds/pair-N-{A,B}.json, summary.json}；write-once（重复 attempt 拒绝）。

### 录制 A/B 重跑（09b vs 04）

measure-ux 实跑 verdict=PASS，validPairs=5（原始/比较/environment/input/manifest 全部落 measurements/ux-overhead/candidate-20261025-03/）。

### 重测 UX-UI（E2E-35/36，新 attempt）

- E2E-36-S03-B 断言恢复为计划要求：真实取消后焦点必须在可操作控件上（c0d566f 修复行为）；重存前若已聚焦 btn-save 则不再盲按 Tab。
- E2E-38 记录逻辑：读取本 attempt 的 recorded comparison + live summary，两者皆 PASS 才记 E2E-38 PASS；否则如实 FAIL/NOT_RUN。E2E-37 保持 NOT_RUN。

### 结果（见下节，全部实跑完成）

## 实时腿 attempt-03 的失败与重开（配方 R）

- attempt-03 首次 live 采集：side A VALID ×1 后 side B 判 INVALID「telemetry area not armed」。根因=**工具缺陷**：live-legs 在 Edge 已加载接收页之后才 `context.addInitScript(OBSERVER)`，而 addInitScript 只对后续导航生效，页面从未安装观察器（measure-ux 是先 addInitScript 再 newPage/goto，故无此问题）。已在诊断后终止本轮（保留已写出的 pair-1-A/B、pair-2-A/B 原始轮，无 summary；日志 red-logs/t31c-live-attempt03-harness-bug.log）。
- 修复：addInitScript 之后显式 `page.goto` 重导航一次再等 `__state`（并补每侧「真实结算帧>0」判据）。
- 重开 attempt：产品字节未变（9e2595e6…），仅 harness 变化——按配方「测试工具提交变更而产品字节未变时不得偷换构建，保留新 harness/attempt 与执行记录」，同 09b 根内将 attemptId 由 candidate-20261025-03 改为 **candidate-20261025-04**（run-context.json 内一致更新；product manifest/输入 SHA 不变），attempt-03 的全部输出原件保留不覆盖；录制 A/B 与实时腿均在 -04 下重跑，UX-UI 也在 -04 下执行。

## T31c 结果（全部实跑完成）

### 录制 A/B（attempt-04，09b vs 04，冻结方法不变）

- measure-ux verdict=**PASS**，validPairs=5/5；comparison/summary/environment/input/manifest 全部落 `measurements/ux-overhead/candidate-20261025-04/`。

### 实时 5×30s 腿（attempt-04，新工具 live-legs.mjs）

- verdict=**PASS**，10/10 侧别 VALID（AB/BA/AB/BA/AB）：每侧 maxInFlight=1（帧区间精确扫描）、business revision 在 30s 窗口内真实增长、真实结算帧>0；候选侧另有 telemetryArmed=true、遥测写间隔 ≥250ms、数字反馈实际变化、真实停止后显示时钟冻结（两次采样相等）；RTT 仅 advisory。共享 1MiB live 输入双侧同 SHA（3cd0bea6…）。输出：`measurements/ux-overhead/candidate-20261025-04/live/{rounds/pair-1..5-{A,B}.json, summary.json}`。
- attempt-03 的失败首跑（观察器注入顺序工具缺陷）保留 4 个失败轮原件 + 日志 `red-logs/t31c-live-attempt03-harness-bug.log`，未删除、未覆盖。

### UX-UI 重测（attempt-04，E2E-35/36/37/38）

- 运行：`node tools/desktop-recv/e2e/run-e2e.mjs --context <09b ctx> --case UX-UI` → exit 0（attempt UX-UI-2026-10-25T04-49-02-745Z-85909a）。
- **E2E-35 PASS**（5 断言：前台空白源 revision 恒定+用时递增+5s 提示；真实最小化 9s 的 visibility 分支按 harness 旗标如实 NOT_RUN；还原重算；恢复 Ready+真实保存 SHA；独立停止冻结）。
- **E2E-36 PASS**（8 断言：四视口/DPR 矩阵、44px、无横滚、活动 preview、焦点稳定、101 字符长中文名换行、键盘 Enter 双入口+真实对话框、**S03-B 焦点修复实测 PASS——取消后 focusAfter=btn-save（focusVisible=true）**、键盘重存 SHA、窄配置录像腿+保存 SHA）。
- **E2E-37 NOT_RUN**（Narrator 在场但本环境无法程序化核验真实语音，如实）。
- **E2E-38 PASS**（3 断言全 PASS）：R1 录制三项阈值（工具 comparison）、R2 每轮 ≥30 结算帧与复算、L1 实时 5×30s verdict=PASS → **E2E-38 里程碑达成（录制+实时双出口齐备）**。

### 回归与边界

- `run-unit --all` → exit 0（12 套）；`ux-evidence-selftest` 55/55；`verify-evidence-selftest` 14/14。
- 旧 run/旧 staging/product/旧 planning 760 项 SHA **UNCHANGED**；运行后零本轮 Edge、端口全释放；`git diff --check` 0；产品字节零改动。
- 工具变更：新增 `live-legs.mjs`（实时腿采集器）+ `ui-journeys.mjs`（E2E-35/36/37/38 记录，E2E-38 读取 recorded+live 双输出）+ run-e2e 接线；无冻结阈值/方法修改。

### 附：attempt 语义说明

- 09b 根为 rebuilt candidate（product manifest 9e2595e6…，含焦点修复），attempt-03 为首次 harness 的失败轮留档；attempt-04 = 纯 harness 修复后的新 attempt（同构建、同 manifest/输入 SHA）；两 attempt 输出并存，互不覆盖。

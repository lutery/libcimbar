# root 12 最终候选复现指南（round-13 整改后构建）

目标根：docs/tests/runs/20261027-teamexec-12（release-candidate-manifest.json 为本根的机器可读清单）。
适用范围：2026-10-27 round-13 整改后的最终候选（product manifest 829d7dec…，attempt candidate-20261027-01）上的全部本地复现；现场批次（E2E-21..26/39）由用户执行，不在此列。
约定：PowerShell 7；每条命令验证 exit code；09b/root10/root11 等历史根只读。

## 0. 与 root11 的差异（round-13 整改点）

- 产品 `ux-telemetry.js`：观察 progress 新增 **`lastReportState`**（最近一次被接受的 data/artifact 帧的 report 状态；ambiguity 锁定期照常更新——可观测事实）；`ux-view.js`：降级判定改用该事件状态（**删除 `lastDataAtMs > trustedAtMs` 时间戳推断**），相同 receivedAtMs 的 empty/unavailable 同样隐藏当次百分比；契约文档带日期修订注记（A13-02）。
- 工具：测量 CLI 正确传递并构造 expected（product manifest 磁盘重哈希自校验 + input/media/live 实读 input-manifest；缺失即 E_CONTEXT_BINDING）；**外层门禁要求重算 verdict=PASS、5 有效对、live 10 侧 VALID**（一致 FAIL/NOT_RUN 被拒）；judgeRound RTT 从 `settledAtMs−t0Ms` 重算并严格核对冗余 rttMs（A13-01/B-R1）。运行器 E2E-27-S04 与 E2E-36 截图取样的有界等待一致模式（收敛写时序竞态族）。
- live 输入：4MiB 难压缩样本（6181826a…）；基线侧 basename 推断命中 run-04 同 SHA 只读文件。

## 1. 环境前提

同 root11 指南（Edge/Node 22/Python 3.11/pwsh 7；端口 8771-8776/8811/9445；桌面独占；fixtures 逐字节复制自 root11，provenance 登记）。

## 2. Staging

```powershell
pwsh -NoProfile -File tools/desktop-recv/stage.ps1 -RunId 20261027-teamexec-12 -Mode development -StagingRoot build-desktop-recv/runs/20261027-teamexec-12/receiver
pwsh -NoProfile -File tools/desktop-recv/stage.ps1 -RunId 20261027-teamexec-12 -Mode assets -StagingRoot build-desktop-recv/runs/20261027-teamexec-12/receiver -WasmBuildDir <wasm-build-dir> -GateLog docs/tests/runs/20261018-teamexec-01/cmd-02-gate.log
```
wasm 字节沿用 1.0.0（js 1f36bd07…、wasm d1080cdc…）；sender 由 run-context 的 stageVerifiedSender 只读复制。

## 3. 门禁与自测

```powershell
node tools/desktop-recv/run-unit.mjs --all                     # 12 套 222 例
node --test tools/desktop-recv/tests/measure-ux.test.mjs tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/process-guard.test.mjs   # 69 例
python tools/desktop-recv/tests/ux-evidence-selftest.py        # 77/77（含裁决反例与 A13-01/B-R1 真实入口负例）
python tools/desktop-recv/verify-evidence-selftest.py          # 14/14
python tools/desktop-recv/e2e/video-prefix-check.py --selftest # 3/3
python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py
```

## 4. 逐案 E2E

```powershell
Set-Location 'E:\Project\OpenSource\c++\libcimbar'
$ctx = 'docs/tests/runs/20261027-teamexec-12/run-context.json'
foreach ($c in 1..20) { node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case "E2E-$c" }
node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case UX-IAT    # 01-07 PASS；08 NOT_RUN
node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case E2E-27
node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case E2E-28
node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case E2E-29
node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case UX-MEDIA-SAVE   # 30..34
node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case UX-UI           # 35/37 NOT_RUN；36/38 PASS（38 须先完成第 5 步测量）
```
- legacy 每案 exit0（E2E-18 十腿=9 PASS+D-19 NOT_RUN）；UX-UI 组 exit1 属预期（35/37 NOT_RUN）。
- 失败纪律：失败 attempt 原样保留；同案瞬态重跑一次；连续两败停报。

## 5. 测量与实时腿

```powershell
node tools/desktop-recv/e2e/measure-ux.mjs --context $ctx --baseline-context docs/tests/runs/20261024-teamexec-04/run-context.json --method docs/plans/receiver-ux-v2/performance-method.json
# 期望 verdict=PASS（5/5 对；B 侧 minTelemetryGap ≥250ms）

node tools/desktop-recv/e2e/live-legs.mjs --context $ctx --baseline-context docs/tests/runs/20261024-teamexec-04/run-context.json --method docs/plans/receiver-ux-v2/performance-method.json
# 期望 10/10 VALID；windowObservedMs ≥30000
```
写一次：同 attempt 重跑被 write-once 拒绝（只挡 summary）；中止重跑先把失败 raw 移入 live-failed-run-1/。

## 6. 独立复算与双门禁

```powershell
# 独立复算（不经结果文件；A13-01 绑定 + B-R1 验收在此生效）
node tools/desktop-recv/e2e/measure-ux-calc.mjs --recompute docs/tests/runs/20261027-teamexec-12 docs/tests/runs/20261027-teamexec-12/measurements/ux-overhead/candidate-20261027-01 --method docs/plans/receiver-ux-v2/performance-method.json --context docs/tests/runs/20261027-teamexec-12/run-context.json
# 期望 ok:true、verdict=PASS、validPairs=5、live 10 侧 VALID

python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261027-teamexec-12 --gate local --planning docs/tests/receiver-ux-v2/planning-cases.json
# 期望 GATE local: PASS (20 required cases)

python tools/desktop-recv/verify-ux-evidence.py --context $ctx --gate local
# 期望 exit1 恰 4 条 = E2E-35×2 + E2E-37×2（用户授权缺口）

python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261027-teamexec-12 --gate field --planning docs/tests/receiver-ux-v2/planning-cases.json
# 期望 exit1（现场 7 项，设计内）
```

## 7. 常见坑（本轮实测新增）

1. **终态收敛写时序**（Option B）：Ready 后 ≤250ms（本机实测可晚到 ≥1.2s——推迟定时器路径，见 r13-tools-report §8）落地；**任何终态截图/冻结对取证都必须先有界等待两次相邻探针一致**（已实现：E2E-27-S04、E2E-32-S02-B、E2E-36 截图、live-legs 停止取证）。
2. **保存自动化竞态族**（InvalidStateError→16004）：同一页面会话多次保存后，页上残留上一腿的页级保存钩子可致 recovery 保存偶发失败（E2E-18/19 实测）；runner 的页级重载守卫可能不触发（观察见 root12 E2E-18 observation.txt）——重跑即过；若连续两败停报做装置加固决策。
3. **残留接收端窗口占 9445**：上一案崩溃/中止可留 Edge 窗口占 CDP 端口（坑 #4）——按本 run profile 精准清理（如 pid 60400 先例），绝不通杀进程名。
4. **补跑纪律**：停车道后继续时先核对 results.json 是否有缺案（本轮 gate 抓到 19/20 缺口）。
5. **测量 CLI 必须带 --context**：缺省时 expected 为空 → 绑定校验被拒（A13-01 后的新语义：无 context 不给复算背书）。
6. live 观测抖动 1ms 容差、4MiB 样本、write-once、CJK 路径、process-guard 规模等沿用 root11 指南坑列表。

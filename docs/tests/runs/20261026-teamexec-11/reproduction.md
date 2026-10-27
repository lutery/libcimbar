# root 11 最终候选复现指南（round-12 整改后构建）

目标根：docs/tests/runs/20261026-teamexec-11（release-candidate-manifest.json 为本根的机器可读清单）。
适用范围：2026-10-26 round-12 整改后的最终候选（product manifest 34a9de30…，attempt candidate-20261026-01）上的全部本地复现；现场批次（E2E-21..26/39）按计划由用户执行，不在此列。
约定：PowerShell 7（pwsh）；每条命令验证 exit code；09b/10 等历史根只读。

## 0. 与 09b 的差异（本轮整改点）

- 产品 ux-view.js：报告降级（empty/unavailable）隐藏百分比、statusKey=progress_unavailable（A-R1）。
- 产品 ux-display.js：数字缓存只记已成功绘制值；终态收敛写**等待共享 250ms 边界**后再绘制并释放 timer（A-R2/B-01 + Option B）——因此“停止/完成瞬间”取数会抢在收敛写之前，任何终端取证须**有界等待两次相邻探针一致**后再取（E2E-32-S02-B 与 live-legs 停止取证均已如此实现）。
- 工具：live judge 要求全采样 Receiving + session 恒定 + 窗口 ≥30000ms + 窗口内结算（提前 Ready 即停不补睡）；观测间隔含 1ms 观测抖动容差（仅 live judge；recorded 腿与 judgeRound 保持严格 250ms）；UX 门禁三升级（原/收 SHA 相等、必测步骤精确覆盖、measurement 复算）；E2E-35 如实 NOT_RUN。
- live 输入：4MiB 难压缩样本（6181826a…，1MiB 只能撑 ~16-18s）；基线侧按 basename 自动命中 run-04 同 SHA 文件。

## 1. 环境前提

- Windows 11；Edge（C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe）；Node 22；Python 3.11；pwsh 7；端口 8771-8776/8811/9445 空闲；桌面独占。
- fixtures 自 root 10 逐字节复制（fixtures-provenance-r12.json 记录来源链 09b←04/03）；live 样本 SHA 已锁。

## 2. Staging

```powershell
pwsh -NoProfile -File tools/desktop-recv/stage.ps1 -RunId 20261026-teamexec-11 -Mode development -StagingRoot build-desktop-recv/runs/20261026-teamexec-11/receiver
pwsh -NoProfile -File tools/desktop-recv/stage.ps1 -RunId 20261026-teamexec-11 -Mode assets -StagingRoot build-desktop-recv/runs/20261026-teamexec-11/receiver -WasmBuildDir <wasm-build-dir> -GateLog docs/tests/runs/20261018-teamexec-01/cmd-02-gate.log
```
wasm 字节沿用 1.0.0（js 1f36bd07…、wasm d1080cdc…，与 09b 相同）；assets 需真实构建物与门禁日志，无输入 exit 3。sender 由 run-context 的 stageVerifiedSender 从已验证发送端包只读复制。

## 3. 门禁与自测（先证明工具面）

```powershell
node tools/desktop-recv/run-unit.mjs --all                     # 12 套 216 例
node --test tools/desktop-recv/tests/measure-ux.test.mjs tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/process-guard.test.mjs   # 67 例
python tools/desktop-recv/tests/ux-evidence-selftest.py        # 65/65（含裁决三负例转正 + 抖动容差正负例）
python tools/desktop-recv/verify-evidence-selftest.py          # 14/14
python tools/desktop-recv/e2e/video-prefix-check.py --selftest # 3/3
python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py
```

## 4. 逐案 E2E（--context 指向本根）

```powershell
Set-Location 'E:\Project\OpenSource\c++\libcimbar'
$ctx = 'docs/tests/runs/20261026-teamexec-11/run-context.json'
foreach ($c in 1..20) { node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case "E2E-$c" }
node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case UX-IAT    # 01-07 PASS；08 占位 NOT_RUN
node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case E2E-27
node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case E2E-28
node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case E2E-29
node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case UX-MEDIA-SAVE   # 30..34
node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case UX-UI           # 35 NOT_RUN/36/37 NOT_RUN/38（须先完成第 5 步测量）
```
- 期望：legacy 每案 exit0（E2E-18 十腿 9 PASS+D-19 授权 NOT_RUN）；UX-UI 组 exit1 属预期（35/37 为 NOT_RUN 使组布尔 false，门禁读记录）。
- 失败纪律：失败 attempt 原样保留；同案可因环境瞬态重跑一次；连续两次失败即停报。

## 5. 冻结方法 A/B 与实时腿

```powershell
node tools/desktop-recv/e2e/measure-ux.mjs --context $ctx --baseline-context docs/tests/runs/20261024-teamexec-04/run-context.json --method docs/plans/receiver-ux-v2/performance-method.json
# 期望 verdict=PASS（5/5 对；B 侧 minTelemetryGap ≥250ms；终态收敛在边界内）

node tools/desktop-recv/e2e/live-legs.mjs --context $ctx --baseline-context docs/tests/runs/20261024-teamexec-04/run-context.json --method docs/plans/receiver-ux-v2/performance-method.json
# 期望 10/10 VALID；windowObservedMs ≥30000；sampleInsufficient=false
```
写一次：同 attempt 重复运行被 write-once 拒绝（只挡 summary.json）；中止重跑须先把失败 raw 复制到 live-failed-run-1/（本轮先例）或换新 attempt。

## 6. 双门禁

```powershell
python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261026-teamexec-11 --gate local --planning docs/tests/receiver-ux-v2/planning-cases.json
# 期望：GATE local: PASS (20 required cases)，exit 0

python tools/desktop-recv/verify-ux-evidence.py --context $ctx --gate local
# 期望：exit 1，恰 4 条 = E2E-35 两条 + E2E-37 两条（均为用户授权缺口）

python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261026-teamexec-11 --gate field --planning docs/tests/receiver-ux-v2/planning-cases.json
# 期望：exit 1（现场 7 项未执行，设计内）
```

## 7. 常见坑（本轮实测）

1. **终态收敛有 ≤250ms 延迟**（Option B）：停止/完成瞬间采样会读到收敛前数值；任何冻结对/截图取证必须先有界等待两次相邻探针一致（已有实现：E2E-32-S02-B、live-legs 停止取证）。
2. **live 观测抖动**：observer 记录 DOM 变更可观测时刻，与产品 performance.now 门限可差 ~0.1ms；live judge 允许 1ms 观测容差（249.9ms 过、240ms 拒），recorded 与 judgeRound 不加容差。
3. **实时腿需 4MiB 样本**：1MiB 自然接收 ~16-18s 不可能撑满 30s 窗口；提前 Ready 会被如实记 样本不足 并 invalid，不补睡。
4. **http.server 偶发崩溃**：接收页静态服务器单连接异常可致整进程崩溃（本轮 pair-3-A 一次），残留 Edge 占 9445 会令下一侧 assertPortsFree 拒绝；按本 run 的 `cimbar-live-*` profile 清理后重跑（不通杀进程名）。
5. **process-guard 规模**：pids.json 累积多时旧逐 pid CIM 查询会超时；现为单批查询 120s。
6. **page 生命周期钩子**：二次保存前必须重载页面（runner 已自动检测）。
7. **CJK 路径**：Node cpSync 在 ACP 936 下会乱码（launch.cmd 路径必须逐码点正确）。
8. **E2E-35/37 常态 NOT_RUN**：35 因本机（云桌面远程会话）Page Visibility 惰性且用户裁定由用户侧真实验证；37 因语音不可程序化核验。均不得改写为 PASS。

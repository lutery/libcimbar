# 09b 最终候选复现指南

目标根：docs/tests/runs/20261025-teamexec-09b（release-candidate-manifest.json 为本根的机器可读清单）。
适用范围：本指南描述 2026-10-25 最终候选（product manifest 9e2595e6…）上的全部本地复现；现场批次（E2E-21..26/39）按计划由用户执行，不在此列。
约定：PowerShell 7（pwsh）；每条命令验证 exit code；旧 run 根（01/02/03）与 product/、build-desktop-recv 旧暂存区只读。

## 0. 环境前提

- Windows 11；Edge（`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`，live-legs/run-e2e 固定路径）；Node 22（22.23.1）；Python 3.11（anaconda）可用 `python`；pwsh 7。
- 端口 8771-8776（receiver/sender/recorder HTTP 与 CDP 9445）空闲；桌面独占（原生对话框自动化会移动前台焦点）。
- 依赖：tools/desktop-recv/e2e/node_modules（playwright-core）已随仓；无需全局安装。
- 冻结输入：fixtures/ 与 fixtures-ext/（provenance 见 fixtures-provenance-t35.json）；1 MiB 难压缩实时输入 `ext-random-1mib.bin`（3cd0bea6…）。

## 1. Staging（build-desktop-recv/runs/20261025-teamexec-09b）

```powershell
# 源树 development 暂存（receiver 源码+测试拷贝；-StagingRoot 指定本轮根）
pwsh -NoProfile -File tools/desktop-recv/stage.ps1 -RunId 20261025-teamexec-09b -Mode development -StagingRoot build-desktop-recv/runs/20261025-teamexec-09b

# vendor wasm + 真实 strict-EOF 门禁日志绑定
pwsh -NoProfile -File tools/desktop-recv/stage.ps1 -RunId 20261025-teamexec-09b -Mode assets -WasmBuildDir <wasm-build-dir> -GateLog <strict-eof-gate.log>
```

产物：stagingRoot/receiver（27 文件产品树，被 product-manifest.json 哈希锁定）；sender/ 由 runner 从已验证发送端包只读复制。
注意：assets 模式需要真实构建出的 wasm 与真实门禁日志，无输入直接 exit 3，不会伪造。

## 2. 门禁与自测（先证明工具面）

```powershell
node tools/desktop-recv/run-unit.mjs --all                 # 期望 exit 0：12 套 202 例
node --test tools/desktop-recv/tests/measure-ux.test.mjs tools/desktop-recv/tests/process-guard.test.mjs tools/desktop-recv/tests/run-context.test.mjs   # 61 例
python tools/desktop-recv/verify-evidence-selftest.py      # 14/14
python tools/desktop-recv/tests/ux-evidence-selftest.py    # 55/55
python tools/desktop-recv/e2e/video-prefix-check.py --selftest   # 3/3
```

## 3. 逐案 E2E（--context 指向 09b）

```powershell
Set-Location 'E:\Project\OpenSource\c++\libcimbar'
$ctx = 'docs/tests/runs/20261025-teamexec-09b/run-context.json'
# legacy v1 出口（E2E-1/2 走打包接收端自管理栈；其余共享一个标准栈）
foreach ($c in 1..20) { node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case "E2E-$c" }   # 期望每案 exit 0
# UX 逐案或按组：
node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case E2E-27   # 实时抓屏等待→数据→Ready→保存
node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case E2E-28   # 重复有效码（SRC-01 静止层+活性点）
node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case E2E-29   # 无有效码暂停/恢复
node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case UX-MEDIA-SAVE   # E2E-30..34 串行组
node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case UX-UI           # E2E-35..38 串行组
node tools/desktop-recv/e2e/run-e2e.mjs --context $ctx --case UX-IAT          # UX-IAT-01..07（08 占位 NOT_RUN）
```

- 期望：每案/每组 exit 0（UX-UI 内 E2E-37 常态 NOT_RUN 但组仍 exit 0——37 的组判定返回 true）。
- 产物：legacy → results.json + proof/E2E-N/；UX → ux-results.json + proof/E2E-2x/3x/<attemptId>/（screens/、original.bin、received.bin）。
- 失败纪律：失败 attempt 目录原样保留（upsert 永不删除），重跑生成新 attempt。

## 4. 冻结方法 A/B 与实时腿

```powershell
node tools/desktop-recv/e2e/measure-ux.mjs \
  --context docs/tests/runs/20261025-teamexec-09b/run-context.json \
  --baseline-context docs/tests/runs/20261024-teamexec-04/run-context.json \
  --method docs/plans/receiver-ux-v2/performance-method.json
# 期望 verdict=PASS（5/5 对；three thresholds）；输出 measurements/ux-overhead/candidate-20261025-04/

  --context docs/tests/runs/20261025-teamexec-09b/run-context.json \
  --context docs/tests/runs/20261025-teamexec-同根 full.json \
  --baseline-context docs/tests/runs/20261024-teamexec-04/run-context.json \
  --method docs/tests/../plans/receiver-ux-v2/performance-method.json
# 期望 5×30s 双侧 10/10 VALID，verdict=PASS；输出 .../candidate-20261025-04/live/
```

写一次：重复对同一 attempt 重跑会被写一次保护拒绝（write-once，重复 attempt 拒绝）；换新 attempt 前需新 attemptId（产品字节不变时允许同根新 attempt）。

## 5. 双门禁

```powershell
python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261025-teamexec-09b --gate local --planning docs/tests/receiver-ux-v2/planning-cases.json
# 期望：GATE local: PASS (20 required cases)，exit 0

python tools/desktop-recv/verify-ux-evidence.py --context docs/tests/runs/20261025-teamexec-09b/run-context.json --gate local
# 期望：exit 1，且违规只剩 E2E-37 两条（PASS/executedBy 要求）——环境缺口，非格式问题
```

## 6. 常见坑（本轮实测教训）

1. **process-guard 规模**：pids.json 累积到 ~100 条目后，旧版逐 pid `Get-CimInstance` 60s 超时（E2E-14/15/20 启动失败根因）。现为单批 CIM 查询+120s 超时；若再超时，日志会点名 helper killed (timeout) 而非空 stderr。
2. **fixtures 同源对**：09b 根的 fixtures/fixtures-media 与 RUN/fixtures-media 必须成对（V-LAST-with/without + payload + V-SHORT + V-GOOD）；本轮从只读 04/03 根逐字节复制并登记 provenance（fixtures-provenance-t35.json）。
3. **页级保存钩子**：`__createWritableAccessedAt/__writableAt` 是页生命周期钩子，二次保存前必须重载页面——live/videoRoundtrip 现已自动检测并重载（9a94db 修复）；手工旅程需自行 reload。
4. **UX-ALL 长链不稳定**：12 案串行长链在接收端 HTTP 服务垂死时整组中止（ERR_ADDRESS_INVALID）；改逐组/逐案调用即恢复。逐案独立 attempt 是本轮采用的收敛路径。
5. **PowerShell 反引号**：生成 PS 内嵌 JS 时反引号会被吞（E2E-3 期），改用文件拼接或 [char]96。
6. **CJK 路径**：Node cpSync 在 ACP 936 下产生乱码孪生目录（E2E-1 历史坑，launch.cmd 路径必须是 codepoint 正确目录）。
7. **addInitScript 时序**：addInitScript 在页面加载后调用不生效，必须先注入再 goto（T31c 期修复）；live-legs 已自带 goto 重导航。
8. **E2E-37 常态 NOT_RUN**：UX-UI 组内 37 返回 true、组仍 exit 0；若未来可程序化核验语音，替换该处理器并补 proof。

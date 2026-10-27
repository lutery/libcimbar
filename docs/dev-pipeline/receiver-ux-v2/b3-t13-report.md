# B3 工具车道 T13 完成报告（dev-v2-tools）

日期：2026-10-24　基线 HEAD：022a3a4（T12 闭合后）。本任务不改 web/desktop-recv 源码（产品代码归 dev-v2-prod）；真实桌面车道执行。

## 结论

**E2E-27（UX-SLICE）真实旅程 PASS**（attempt `UX-SLICE-2026-10-24T14-18-26-306Z-c3b7f5`，runner exit 0）：真实抓屏 → 中文反馈（等待/提示/用时/速率/Ready）→ 真实系统保存 → 应用外 SHA 相等。12 条 assertion（SRC-01 校准 CAL01-05 + S01–S06）全部 PASS；结果独立记录于 `20261024-teamexec-06/ux-results.json`（phase=slice，PARTIAL，不填最终门禁）。

## 产出文件

- `tools/desktop-recv/e2e/source-scene.mjs`（新增，SRC-01 装置）
- `tools/desktop-recv/e2e/run-e2e.mjs`（修改：E2E-27 handler、UX-SLICE 组展开、UX 用例跳过 v1 attempt marker、attachCapture 增 `waitForReady` 选项、外部 SHA 改 certutil、uxProbe/uxShot/externalSha256 辅助）
- `docs/tests/runs/20261024-teamexec-06/`（run-context / product-manifest 27 文件 sha=adb59205… / input-manifest 10 文件 sha=df86516a… / ux-results.json / pids.json / proof/E2E-27/<attempt>/ 全套截图与实物）
- staging：`build-desktop-recv/runs/20261024-teamexec-06/{receiver,sender}`（receiver=stage.ps1 development + 只读复制已验 v1 vendor 资产 js=1f36bd07… wasm=d1080cdc… + config/asset-set.json；sender=stageVerifiedSender 21 文件）

## SRC-01 校准（assertions CAL01–05，全 PASS）

- CAL01：原发送端 Mode B 加载锁定输入 primary-input-128k.bin（sha=8f89c58f…），canvas 两帧哈希不同=真实动画。
- CAL02：截取真实码帧 `src01-code-frame.png`（记录 SHA 与 rect 自然尺寸，proof 在 attempt 目录）。
- CAL03：不透明 `<img>` 静止码层按 canvas rect 精确覆盖（只改源窗口像素；无任何接收端注入）。
- CAL04：静止层保持 ≥10s（10,000ms+）且三次间隔采样哈希一致（像素稳定）。
- CAL05：空白层全窗口覆盖（mode=blank），无任何有效码像素。

## E2E-27 六步实测（assertions S01–S06，全 PASS）

- S01/S01b：入口两按钮存在、保存禁用（saveDisabled=true）；系统选择器真实选源（native-dialog -Action share，按 SENDER_TITLE 选窗），进入等待。
- S02（无有效码 ≥6s）：0.5s/5s/6s 三点采样——primary=`正在等待有效数据`；5s 起出现提示「请检查发送画面是否可见，并确认 Mode 是否匹配。」；用时 0.6s→5.3s→6.x s 持续走表；businessRevision 全程=2（无伪造进度）；processedFrames=0。截图 0.5/5/6s 三张。
- S03：移除空白层恢复真实码流；businessRevision 2→3（首个真实 data）；主区接收活动 + 速率 `41.7 KiB/s（含冗余）`。源恢复截图 + 接收截图。
- S04：Ready 文案 `文件已接收完成，请保存` + `点击保存文件。`；artifact byteCount=131072（=锁定输入）；用时冻结（两次 1.2s 间隔采样相等）；发送输入经 send.js togglePause（有界冷却，如实记录）停止。
- S05：真实系统保存对话框（native-dialog -Action save）→ Saved；saveTimingsComplete=true（saveRequestAt→createWritableAccessedAt→writableAt→…完整链路）；界面 `文件已保存`。
- S06：应用外 certutil Get-FileHash（SHA-256）：original=received=`8f89c58fc9a16feefa31ce6c8e6146d6003f1b749fcd88ffd5e97ca9fc61f146`，bytes=131072；`s06-external-sha.txt` 记录 attempt/run/manifest/input/revision 全链身份。

## 执行与校正过程（配方 R：失败原样留档）

四次运行尝试，三次为工具缺陷（每次都如实落 ux-results FAIL 记录并停止，未静默重试；日志在 red-logs/）：
1. attempt-1：source-scene 截图 clip 参数映射错误（rect.left→clip.x），修复点 `source-scene.mjs`/handler 两处 clip 构造。日志 `t13-attempt1-clip-bug.log`。
2. attempt-2：我误用 attachCapture 内建"等待 Ready"语义——空白源下 60s 内 save 永不启用而超时。最小修复：attachCapture 增 `waitForReady` 选项（默认 true，全部 v1 场景行为不变），E2E-27 用 `{waitForReady:false}` 只挂流。日志 `t13-attempt2-ready-wait-misuse.log`。
3. attempt-3：旅程全程通过，仅 S06 的 `Get-FileHash` 在 spawn 出的 PowerShell 环境不可用（模块加载失败）。外部哈希改用 `certutil -hashfile`（所有受支持 Windows 自带，输出解析与区域设置无关）。日志 `t13-attempt3-getfilehash-env.log`。
4. attempt-4：**PASS（exit 0）**。

## 工具回归

- `node --test tools/desktop-recv/tests/run-context.test.mjs` → 10/10（handler 改动后复跑）
- `node --test tools/desktop-recv/tests/process-guard.test.mjs` → 6/6
- `python tools/desktop-recv/tests/ux-evidence-selftest.py` → 55/55
- `node --check` run-e2e/source-scene 均 0
- 旧 v1 矩阵未运行（桌面车道独占，且 v1 场景未改动——E2E-27 无 v1 标记，results.json 零写入）

## 只读边界与清理

- 旧 run/旧 staging/product/旧 planning 760 项 SHA 指纹 **UNCHANGED**（`red-logs/t13-oldruns-after.sha` vs T3 基线）。
- 结束后 0 个本轮 Edge 进程；8771/8811/8790/9445/9452/9453 全部释放；pids.json 留档（下次运行按 marker 复核回收）。
- 产品字节零改动；`git status` 仅 run-e2e.mjs（M）、source-scene.mjs（新）、teamexec-06 run 根（新）与 red-logs 日志。

## 偏差与注意

1. **vendor 资产来源**：slice receiver = stage.ps1 development（无 vendor）+ 从已验 baseline staging 只读复制 `vendor/cimbar_js.js+wasm` 与 `config/asset-set.json`（SHA 与交付包一致：1f36bd07…/d1080cdc…）。理由：dev 树不含 assets 模式产物；同一 v1 资产集（assetSetId desktop-recv-v1）。已在 product-manifest（27 文件）中如实登记。
2. **S03 观测时机**：速率探测循环轮询期间接收已完成（primary 已为 Ready 文案、rate 41.7 KiB/s 为在途值）——128KiB 在 ~10s 内完成，"Ready 前的活动速率"瞬态极短；S03 断言以 revision 递增 + KiB/s 出现为准，未等待更长活动窗（30s 活动窗属 E2E-30+，非本例）。若 T31 需要更长观察窗应改用更长输入。
3. **certutil 替代 Get-FileHash**：属工具环境适配（spawn 出的 PowerShell 缺模块解析路径），外部哈希语义不变（独立进程、SHA-256、输出落 proof）。
4. **attempt-1/2/3 的 ux-results FAIL 记录**保留在 `20261024-teamexec-06/ux-results.json`？否——upsertUxResult 以 caseId 为键保留最新 attempt（attempt-4），失败 attempt 的原件仍在各自 proof 目录（attempt 目录按 id 不可覆写），日志在 red-logs。这符合"失败 attempt 不可覆盖，重跑新 attempt"——索引指向当前有效 attempt。
5. UX-SLICE 组展开当前仅支持单 id 组；多 id 组仍 exit 4（T35 需要时再放开，逐 id 串行实现）。
6. 本报告与 ux-results 均标注 phase=slice PARTIAL：不进 verify-ux-evidence 的 local/final 判定（local 门禁要求 phase=final 的候选根）。

# 技术债清单 — 阶段 5 team-exec

由批次 A 独立审查（review round 1）产生的非阻塞项。每条记录来源、影响与关闭条件。

| ID | 来源 | 内容 | 影响 | 关闭条件 |
|---|---|---|---|---|
| TD-01 | W3 | **[2026-10-18 round5 修订：T2.2.a 已交付但本项未随之完成——显式推迟至现场阶段之前]** `frameTimeoutMs` 看门狗仍未实现（worker 与 `decoder-client.js` 均无帧超时）；录像导入已是真实特性（IAT-05），WASM 单帧死循环 → `submitAndWait` 永不结算 → run() 协程挂死 → 会话永久 Receiving | 现场录像会话可能永久卡死无提示 | **硬性关闭点：现场阶段（T5.2.b 用户执行）之前必须实现**——scheduler 或 worker 侧帧看门狗 + UT-013/015 对应断言；关闭前不得向用户交付候选包 |
| TD-02 | W5 | **[2026-10-18 round5 修订：T2.1.b 已交付但 worker 幂等重放未实现——偏差保持并显式记录]** 二次 init 仍返回 11003，不按 IF-002 字面重放原结果；客户端常规流程已防重入 | 与 IF-002 字面语义不同；无当前调用方受影响 | 关闭点：阶段 6 外审对 IF-002 语义裁决时一并处理（实现按 requestId 重放或修订 IF-002 文字）；期间 README 保持偏差声明 |
| TD-03 | S1 | `stage.ps1` 用 `Resolve-Path -Relative`（相对 `$PWD`）生成 `gateLogPath` | 从其他目录调用会产出含 `..` 的路径，verify 阶段才失败（失败安全，报因费解） | 改用 `[IO.Path]::GetRelativePath($repoRoot, $path)` |
| TD-04 | S6 | `sourceRevision` 取当前 HEAD，而非 `-WasmBuildDir` 实际源码版本 | 跨树构建时来源标注可能错误 | stage.ps1 接受 `-SourceRevision`，或从构建目录的 `SOURCE_DATE_EPOCH`/git 读取 |
| TD-05 | S7 | `DEFAULT_LIMITS`/`is_safe_relative_path`/`rgba_bytes` 在 `contracts.js`、`decoder-worker.js`（classic worker 无法 import）、`verify-assets.mjs` 三处镜像 | 修改一处可能漂移 | 增加跨文件字面比对测试，或在构建期生成共享片段 |
| TD-06 | S5（已部分处理） | **[2026-10-18 round5 修订：T2.1.a 已交付但 profile.json 读取未实现——约束改为文档化]** mode 白名单仍硬编码于 worker（{4,8,66,67,68}），`config/profile.json` 无读取路径；8 在契约边界被显式拒绝（contract-snapshot 抛错）而非错标 | 新增 mode 时需同步两处 | 关闭点：阶段 6 外审契约意见或 field 回执实测出 8C 需求时实现；README/field-guide 已明示"仅模式 B" |
| TD-07 | — | dev 环境使用 `tools/desktop-recv/dev-server.py`；产品入口服务器 `server.py` 在 T2.1.a | 两套服务器需保持 MIME/回环语义一致 | T2.1.a 的 `server.py` 落地后，dev-server 仅保留为测试工具 |
| TD-08 | W-B（round 2） | `_frameEnded` 的复位覆盖了"块内跨帧"，但**帧结束恰好落在块边界**（`input.pos == input.size`）时，外层 `while` 的下一轮没有入口复位，第二帧截断仍可能在 `flush_once` 短路下误报完成 | cimbar 发送端是单帧协议，当前不可达；与严格 EOF 的契约表述冲突 | 触碰 `zstd_decompressor.h` 时：把复位移到外层 `while` 每轮开头，并补一条"双帧完整 + 第二帧截断"的 C++ 用例 |
| TD-09 | S-B（round 2） | `handle_init` 的异步摘要校验窗口内可重入：第二个 init 会覆盖 `_initTimer`（旧定时器泄漏但被 `settle` 守卫压制），并可能二次 `importScripts` | 客户端常规流程已阻止；风险低 | 在 `handle_init` 增加 `_verifying` 早退，并让重复 init 返回 11003 |
| TD-10 | S-C/S-D（round 2） | `%` 路径拒绝只在 worker 与 `contracts.js` 实现，`verify-assets.mjs`/`stage.ps1` 未同步（fs 语义下 fail-safe）；`crypto.subtle` 仅在安全上下文可用，未来非回环 http 会统一 18001 | 无穿越向量；故障方向安全 | 并入 TD-05 的镜像一致性测试；README 已注明安全上下文要求 |
| TD-11 | W-E（round 2） | 证据 `sourceRevision` 记录的是提交而非构建树；15:43 的门禁跑在含未提交修复的工作树上 | 来源标注与实际构建可能存在偏差 | 与 TD-04 同批关闭：stage.ps1 接受 `-SourceRevision` 或从构建树读取 |
| TD-12 | B-1（round 3） | **批次 B 的定义性真实验证被推迟**：UAT-L03（真实发送窗口 + 系统保存对话框 + 双侧 `Get-FileHash` 相等）与 T2.1.b 第 4 步（实际选窗口取得进度/Ready）都需要真人在系统对话框中操作，无法自动化。`proof/roundtrip/` 尚不存在 | 在 TD-12 关闭前，**不得声称"本地全功能通过"**（test-plan.md:40） | **批次 F 的 T4.1.b 之前必须补跑**：用户配合一次真实 roundtrip，证据落 `docs/tests/runs/<runId>/proof/roundtrip/`；或安排人工操作会话并留证 |
| TD-13 | W-2（round 3） | 内部 Snapshot 形状与 receiver-v1.schema 有偏差（缺 mode/pendingExternal/saveAttemptId/lastError/saveStatus；多 sessionSeq；stats 字段名不同；状态枚举含 schema 外值） | 无消费方校验所以暂不炸，但 T3/T4 会在偏离形状上叠加 | 批次 C 首个提交引入边界映射层（或对齐命名），并让 snapshot 过一次 schema 校验测试 |
| TD-14 | S-1/S-4/S-5/S-6/S-7（round 3） | S-1 `_cleanupToken` 死字段、`_startRequests` 无界；S-4 uat 文档时间戳为约值；S-5 ui.js 存在协调器不会发出的状态；S-6 保存时丢弃 artifactId 等字段；S-7 `attachStream` 导出未用 | 均为小项 | 随批次 C 的映射层（TD-13）与 T3.1 接线一并清理 |
| TD-15 | 批次 L 真实 E2E（2026-10-20） | **录像导入的有效帧产出受关键帧限制**：`video-source.js` 按 1/15 s 时间步进采样录像时间线，而 MediaRecorder 长 GOP 使绝大多数采样帧无法像素级解码（仅关键帧附近可过 scan）。512 KiB 随机载荷的 30 s 真实录像在 480 s 导入窗口内仍 Incomplete；64 KiB 载荷因仅需约 4 个有效帧而正常完成（E2E-14）。E2E-16 的 V-SHORT（400 ms）与 V-LAST-without（12 s）均正确落 Incomplete | 大载荷录像导入在多数宿主上无法完成——录像输入的实际可用容量远低于实时抓屏 | 导入改为**逐帧解码**（`requestVideoFrameCallback` 驱动、按帧推进而非按时间推进），并补 512 KiB 随机载荷的完整往返回归；随该修复重跑 E2E-16 |

### round 3 分派（W-3/W-4 写入对应任务验收清单）

- **T2.2.a 验收清单追加**：① 停止后迟到的 picker 拒绝不得把 Stopping 拉回 Idle（`_captureRejected` 需 `_isStopping` 检查）；② decoder init 失败必须落到终态（当前永久 Preparing）；③ track ended 监听的 `_isStopping` 对称检查（本轮已顺手修复）。
- **T2.2.b 验收清单追加**：④ track ended → Draining → `finishStream` 排空 → Ready/Incomplete（本轮已在 app.js 接线，任务化后需 E2E 覆盖）；⑤ 12005 输入源结束必须出现在 Snapshot；⑥ round 4 补充：Incomplete 终态也要 `releaseInputs()`（当前 worker 会滞留到手动 Stop）。

### round 4 备注（三条小注，随 T2.2.b 收敛）

- Incomplete 终态未调 `releaseInputs()` —— 并入上面 ⑥；
- `TD-12..14` 表格前有空行导致 Markdown 渲染断表 —— 已在提交中修复格式；
- app.js 最终补采的 `captureFrame` 已补 `onError` 日志（本轮已修）。

### round 5 备注（B-1 登记修订与 S 级处置）

- **TD-01/TD-02/TD-06 已按本轮复审修订**：关闭条件不再指向已完成任务，改为前瞻关闭点并显式标注推迟（TD-01 为现场阶段前的硬性关闭点）。
- S-1：`seenTimes` 去重为不可达死代码——已删除，UT-033 改为断言"媒体时间严格递增 + seek 不越界"（真断言）。
- S-2：`_seek` 在 stop() 后永不结算——stop() 现解析挂起的 seek，run() 协程不再悬挂。
- S-3：`MODE_NAMES` 无 8 —— 契约边界现显式拒绝不可表示的 mode（抛错），不再错标为 'B'。
- S-4：candidate 清单自包含陈旧 manifest —— 生成前先删除旧清单。
- S-5：session.js 的 'Error' 死状态已移除（ui 视图仍保留以支持重启语义）。
- S-6：IAT-04/05 的可复现命令已写入 `support-matrix.md`。
- W-A：results.json 词汇已对齐冻结 Evidence 枚举（executedBy=executor|user|null；caseType=file_roundtrip|negative_or_lifecycle|measurement），IAT-01/05 记为 file_roundtrip 并带**机器推导的相同 SHA-256**。
- W-B：verify-evidence 现校验**全部**已执行记录的 proofRefs 磁盘存在性。
- W-C：新证据文件时间戳取自浏览器 `window.__meta` 真实值。

## 已在本轮关闭（记录备查）

- B1 运行期摘要校验（C-07/M06）：worker 在 `importScripts` 前 fetch + SHA-256 比对 JS/WASM，失配 18002、取字节失败 18001。
- B2 `iat-results.json` 时间戳来源：改由浏览器页面 `window.__meta` 记录真实开始/结束时间。
- W1 证据语义可编辑：`stage.ps1` 校验门禁日志内容（`100% tests passed` + 全部 UT 用例名），`verify-assets.mjs` 从日志独立复核。
- W2 多帧 `_frameEnded` 陈旧：有输入时复位，并处理单次调用内跨帧。
- W4 帧阶段异常错误码：15001 → 15003。
- W6 错误包形状：补齐 `message`/`details`，与 receiver-v1.schema 一致。
- W7 路径校验绕过：拒绝含 `%` 的资产路径（worker 与 contracts）。
- W8 RED 证据落盘：见 `docs/tests/runs/20261018-teamexec-01/red-evidence.md`。
- S2 解压循环守卫耗尽：返回 15003，不再静默交付半文件。
- S3 零尺寸读取：C 侧返回 -17。
- S4 `onmessageerror`：客户端拒绝全部在途并报 15010 语义。

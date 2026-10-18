# 技术债清单 — 阶段 5 team-exec

由批次 A 独立审查（review round 1）产生的非阻塞项。每条记录来源、影响与关闭条件。

| ID | 来源 | 内容 | 影响 | 关闭条件 |
|---|---|---|---|---|
| TD-01 | W3 | `frameTimeoutMs` 只存在于 `DEFAULT_LIMITS`；worker 与 `decoder-client.js` 均未实现帧看门狗 | 若 WASM 帧处理卡死，主线程 Promise 永不结算（目前靠 `worker.onerror` 兜底） | T2.2.a 帧调度器中实现单在途超时与终止；补 UT-013/015 对应断言 |
| TD-02 | W5 | 第二次 `init` 一律返回 11003；IF-005 要求相同 requestId/清单幂等重放 | M02 层尚未有 requestId 通道；当前无调用方会重放 init | T2.1.b 会话协调器引入 requestId 后，在 worker 侧按 requestId 缓存 init 结果 |
| TD-03 | S1 | `stage.ps1` 用 `Resolve-Path -Relative`（相对 `$PWD`）生成 `gateLogPath` | 从其他目录调用会产出含 `..` 的路径，verify 阶段才失败（失败安全，报因费解） | 改用 `[IO.Path]::GetRelativePath($repoRoot, $path)` |
| TD-04 | S6 | `sourceRevision` 取当前 HEAD，而非 `-WasmBuildDir` 实际源码版本 | 跨树构建时来源标注可能错误 | stage.ps1 接受 `-SourceRevision`，或从构建目录的 `SOURCE_DATE_EPOCH`/git 读取 |
| TD-05 | S7 | `DEFAULT_LIMITS`/`is_safe_relative_path`/`rgba_bytes` 在 `contracts.js`、`decoder-worker.js`（classic worker 无法 import）、`verify-assets.mjs` 三处镜像 | 修改一处可能漂移 | 增加跨文件字面比对测试，或在构建期生成共享片段 |
| TD-06 | S5（已部分处理） | worker 现校验 mode ∈ {4,8,66,67,68}；但 `cimbar::Config::update` 的完整合法集合未在 JS 侧声明 | 新增 mode 时需同步两处 | T2.1.a 从 `config/profile.json` 读取支持列表 |
| TD-07 | — | dev 环境使用 `tools/desktop-recv/dev-server.py`；产品入口服务器 `server.py` 在 T2.1.a | 两套服务器需保持 MIME/回环语义一致 | T2.1.a 的 `server.py` 落地后，dev-server 仅保留为测试工具 |

| TD-08 | W-B（round 2） | `_frameEnded` 的复位覆盖了"块内跨帧"，但**帧结束恰好落在块边界**（`input.pos == input.size`）时，外层 `while` 的下一轮没有入口复位，第二帧截断仍可能在 `flush_once` 短路下误报完成 | cimbar 发送端是单帧协议，当前不可达；与严格 EOF 的契约表述冲突 | 触碰 `zstd_decompressor.h` 时：把复位移到外层 `while` 每轮开头，并补一条"双帧完整 + 第二帧截断"的 C++ 用例 |
| TD-09 | S-B（round 2） | `handle_init` 的异步摘要校验窗口内可重入：第二个 init 会覆盖 `_initTimer`（旧定时器泄漏但被 `settle` 守卫压制），并可能二次 `importScripts` | 客户端常规流程已阻止；风险低 | 在 `handle_init` 增加 `_verifying` 早退，并让重复 init 返回 11003 |
| TD-10 | S-C/S-D（round 2） | `%` 路径拒绝只在 worker 与 `contracts.js` 实现，`verify-assets.mjs`/`stage.ps1` 未同步（fs 语义下 fail-safe）；`crypto.subtle` 仅在安全上下文可用，未来非回环 http 会统一 18001 | 无穿越向量；故障方向安全 | 并入 TD-05 的镜像一致性测试；README 已注明安全上下文要求 |
| TD-11 | W-E（round 2） | 证据 `sourceRevision` 记录的是提交而非构建树；15:43 的门禁跑在含未提交修复的工作树上 | 来源标注与实际构建可能存在偏差 | 与 TD-04 同批关闭：stage.ps1 接受 `-SourceRevision` 或从构建树读取 |
| TD-12 | B-1（round 3） | **批次 B 的定义性真实验证被推迟**：UAT-L03（真实发送窗口 + 系统保存对话框 + 双侧 `Get-FileHash` 相等）与 T2.1.b 第 4 步（实际选窗口取得进度/Ready）都需要真人在系统对话框中操作，无法自动化。`proof/roundtrip/` 尚不存在 | 在 TD-12 关闭前，**不得声称"本地全功能通过"**（test-plan.md:40） | **批次 F 的 T4.1.b 之前必须补跑**：用户配合一次真实 roundtrip，证据落 `docs/tests/runs/<runId>/proof/roundtrip/`；或安排人工操作会话并留证 |
| TD-13 | W-2（round 3） | 内部 Snapshot 形状与 receiver-v1.schema 有偏差（缺 mode/pendingExternal/saveAttemptId/lastError/saveStatus；多 sessionSeq；stats 字段名不同；状态枚举含 schema 外值） | 无消费方校验所以暂不炸，但 T3/T4 会在偏离形状上叠加 | 批次 C 首个提交引入边界映射层（或对齐命名），并让 snapshot 过一次 schema 校验测试 |
| TD-14 | S-1/S-4/S-5/S-6/S-7（round 3） | S-1 `_cleanupToken` 死字段、`_startRequests` 无界；S-4 uat 文档时间戳为约值；S-5 ui.js 存在协调器不会发出的状态；S-6 保存时丢弃 artifactId 等字段；S-7 `attachStream` 导出未用 | 均为小项 | 随批次 C 的映射层（TD-13）与 T3.1 接线一并清理 |

### round 3 分派（W-3/W-4 写入对应任务验收清单）

- **T2.2.a 验收清单追加**：① 停止后迟到的 picker 拒绝不得把 Stopping 拉回 Idle（`_captureRejected` 需 `_isStopping` 检查）；② decoder init 失败必须落到终态（当前永久 Preparing）；③ track ended 监听的 `_isStopping` 对称检查（本轮已顺手修复）。
- **T2.2.b 验收清单追加**：④ track ended → Draining → `finishStream` 排空 → Ready/Incomplete（本轮已在 app.js 接线，任务化后需 E2E 覆盖）；⑤ 12005 输入源结束必须出现在 Snapshot；⑥ round 4 补充：Incomplete 终态也要 `releaseInputs()`（当前 worker 会滞留到手动 Stop）。

### round 4 备注（三条小注，随 T2.2.b 收敛）

- Incomplete 终态未调 `releaseInputs()` —— 并入上面 ⑥；
- `TD-12..14` 表格前有空行导致 Markdown 渲染断表 —— 已在提交中修复格式；
- app.js 最终补采的 `captureFrame` 已补 `onError` 日志（本轮已修）。

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

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

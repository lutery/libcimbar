# Round-16 整改台账（阶段 5 · 1.2.0 转正）

- 裁决：`docs/dev-pipeline/ext-review/round-16-verdict.md`（2026-10-29，codex-gpt-6；**不通过**）。
- DoD 唯一来源：裁决原文；本台账只记录落实与证据指针。
- 运行根：`docs/tests/runs/20261029-teamexec-14`（attempt `candidate-20261029-01`；harness `58dd622`；product manifest 仍 `7a5e5f1a…`，产品字节零变化）。

## A16-01｜PS5.1 下完整 E2E-1/2 缺失 → CLOSED

| 关闭条件（裁决） | 落实 | 证据 |
|---|---|---|
| 当前候选隐藏 pwsh、记录实际 PS5.1 引擎与子进程环境 | `--launcher-engine ps51`：子进程 PATH 去 pwsh；`where pwsh` exit1 断言；记录 powershell.exe 路径与 PSVersion 5.1.22621.6133、完整 PATH | `proof/E2E-1/engine-env.txt`、`proof/E2E-2/engine-env.txt` |
| CJK+空格目录 CMD 启动 → 实时接收/保存 + 录像导入/保存 | E2E-1 首启走 README 形式 `launch.cmd`（5.1 回退）；live 与 V-GOOD-C 录像两条保存腿 | attempt `E2E-1-2026-10-29T07-49-08-344Z-363db1`（PASS）；`proof/E2E-1/live|recorded` |
| 首次启动含用户默认方式开页验证（不得全部由测试框架开页） | 首启不带 `-NoBrowser`：launcher stdout `open http://127.0.0.1:8767/`；启动前后窗口差集证明新页打开；launcher powershell.exe 进程被 CIM 观察器捕获 | `engine-env.txt`（pre/post windows、launcher process evidence） |
| 端口占用 → 可读失败 → 释放 → 干净恢复 → 实时接收/保存 | E2E-2 两段均经 `launch.cmd` 5.1 回退：exit3 可读 → 清理占用者 → exit0 → live 保存 | attempt `E2E-2-2026-10-29T07-51-42-280Z-5d7e6e`（PASS）；`launch-busy.log.txt`/`launch-ok.log.txt` |
| 绑定新 attempt、当前构建、输入身份、原收文件与外部 SHA | run-context（attempt/manifests）；staging 27/27 与 product manifest 重哈希；certutil 外部 SHA 三份/一份 | `run-context.json`、`product-manifest.json`、`proof/E2E-1/external-sha.txt`、`proof/E2E-2/external-sha.txt` |
| 保留 PS7 证据与失败原件；不重跑未改核心矩阵 | root13 只读保留（launch 文件字节不变，PS7 证据继续有效）；本次首败 attempt 原件保留 | `proof/E2E-1/fail-attempt-766581/`；root13 |

过程披露：E2E-1 首跑失败于原生选择器——`native-dialog.ps1` 的 share 名称匹配用裸 `share`，误把用户 Chrome 窗口（标题含 "a-share-mcp"）当共享对话框并驱动，重试真选择器晚于 30s 等待。按真实缺陷修复：`11b449b`（真实选择器标题 + 目标 PID 优先）与 `58dd622`（开页证据绑定本次启动：20ms 进程快扫 + 前后窗口差集）。首败证据原样入档，未改写。

## A16-02 / B-R16-1｜启动矩阵按端口误杀无关进程 → CLOSED

| 关闭条件（裁决） | 落实 | 证据 |
|---|---|---|
| 只清理能证明属于本次启动的进程（创建身份+规范化 server 路径） | `stopVerifiedServer`：CIM 读 CommandLine/ExecutablePath/CreationDate；要求精确规范化 `server.py` 与 `--directory` 参数、可执行=解析出的 python、创建于本次启动；任一不符即拒绝并记录 | `7489ac4`；矩阵 JSON 每案 `cleanup.facts` |
| 不得依据端口占用者身份杀进程；"端口空闲"不作权限 | 删除 netstat 按端口兜底路径；端口只作症状，不作身份；停止后仍忙 → FAIL+诊断，不再追加任何 kill | `ps51-launch-check.mjs`（当前字节） |
| 端口预占用应 FAIL/中止并保留外部监听器 | `positiveLaunch` 启动前端口预检；占用即中止本案并记录 `port-preoccupied`，不触碰占用者 | 矩阵 JSON `cleanup.refused` |
| 反例：自有无关监听器 / 未取得 PID / PID 身份变化 → 拒绝清理；正例：本次服务正常清理 | 守卫案 h1（自有监听器存活）、h2（无 PID 且端口空闲仍拒绝）、h3（decoy 身份不符拒绝且存活）、h4（真实服务校验后清理）；a/b/c 亦为校验正例 | 矩阵 12/12 PASS；`logs/ps51-launch-check.json` |
| RED 先于修复（真实函数体） | 旧字节（da40f55 提取件，sha256 048c4f29…）对 launcher 从未创建的独占 .NET 监听器执行 netstat 兜底 Stop-Process，监听器真实死亡、函数报告端口空闲；另有全矩阵跑批未触发该分支的尝试与逐字函数诊断，均如实入档 | `red-logs/r16/a16-02-red.log`、`a16-02-red-attempt*.{log,json}`、`ps51-launch-check-old-da40f55.mjs` |

## 建议项

| 项 | 落实 |
|---|---|
| S16-01（Warning）轮次与索引不一致 | `pipeline-state.json`：ext_rounds=16、verdict_files 补 round-15/16、materials 补 round-16；team-exec 重入记录；exec-log/stage5 总结追加 R16-2/§8.4；release-1.2.0 计划在案 |
| S16-02 矩阵工具身份另行绑定 | 矩阵 JSON 自载 `toolPath`/`toolSha256`（本次 `509c6710…`）；`logs/tools-identity.json` 记录 6 个 harness 工具的内容 SHA 与 harnessRevision 58dd622 |
| S16-03 复跑命令参数不存在（`--out`） | round-17 送审包复跑命令改用工具真实参数（`--staging/--run-id/--repo-root`），并以独立 `--run-id` 复验根运行；不再出现 `--out` |

## 结论

两项阻断主题按裁决关闭条件全部落实（root14 证据 + 工具修复 + 首败原件保留）；等待阶段 5 整改出口确认门 → round-17 外审。

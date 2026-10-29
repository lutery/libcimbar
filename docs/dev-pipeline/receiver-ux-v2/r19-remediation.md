# Round-19 整改台账（阶段 5 · 1.2.0 转正）

- 裁决：`docs/dev-pipeline/ext-review/round-19-verdict.md`（2026-10-29，codex-gpt-6；**不通过**，唯一新增主题 A19-01 与 B19-01 去重）。
- DoD 唯一来源：裁决原文。保持关闭：A18-01、B18-01、B17-01、A16-02/B-R16-1、S15-01、S16-01/02/03。
- 运行根：`docs/tests/runs/20261029-teamexec-17`（attempt `candidate-20261029-04`，harness `18b7c22`，product manifest 仍 `7a5e5f1a…`，产品字节零变化）。
- 修复策略：采用裁决明示的**最小修复**——删除自动终止分支，端口占用即报错并保留占用者。

## A19-01 / B19-01｜CDP 回收仅凭命令行子串授权 → CLOSED

| 关闭条件（裁决） | 落实 | 证据 |
|---|---|---|
| （可选最小修复）删除自动终止，端口占用直接报错并拒绝启动、保留占用者 | `reclaimStaleAutomationBrowser` 整体删除；新 `assertCdpPortFree(port,label)`：空闲→返回；占用→只读读取 owner pid/映像/命令行并抛错 `refusing to start and leaving the occupant untouched`；**函数内无 Stop-Process、无 `cimbar-e2e-` 子串测试** | `run-e2e.mjs`（函数全文）；`reproduction.md` |
| 真实生产入口验证"非浏览器脚本名含标记"不触发停止、且正常空闲启动不受影响 | 拒绝例 A：自有 `python <TEMP>\cimbar-e2e-demo\unrelated-server.py --port 9445` 占 CDP → E2E-1 以拒绝失败（`…9235f6`），占用者在拒绝后**仍存活**；正常腿 E2E-1 PASS（`…7d9540`） | `proof/E2E-1/refusal-python/`（results/refusal.log/refusal-message.txt）、`proof/E2E-1/` |
| "外部浏览器普通参数含标记/错误 profile"不触发停止 | 拒绝例 B：自启 `msedge --user-data-dir=%TEMP%\cimbar-e2e-foreign-<guid> --remote-debugging-port=9445`（真实浏览器、普通参数）→ E2E-1 同一拒绝失败（`…9458d9`），该 Edge **仍存活**；随后仅在其**精确唯一 profile** 校验通过后按自有句柄停止 | `proof/E2E-1/refusal-foreign-edge/` |
| 若保留自动回收则核验映像/精确 `--user-data-dir`/可证明归属 | 未保留自动回收（不引入新的归约推断面） | `run-e2e.mjs` |
| 纠正"profile marker verified"文案 | 代码中该文案随函数删除；`reproduction.md`/台账/总结明确更正（旧文案描述的只是子串测试，不是归属） | `reproduction.md`、`exec-log` R19、`stage5-dev-summary` §8.7 |
| 只验证回收/拒绝腿，无需重跑已通过产品核心与开页/接收保存矩阵 | 仅跑拒绝 A/B + 正常腿 + 受影响工具套件 | `logs/affected-checks.log`（69/69、8/8、10/10） |

## RED

`red-logs/r19/a19-01-red.log`：逐字复刻 round-19 `reclaimStaleAutomationBrowser`，对我方 python 监听器（命令行仅路径片段含标记）**真实执行** → 函数返回 `{pid, port}` 并真实 Stop-Process，python 退出（exit -1），日志含旧文案 "profile marker verified"。修复后该类进程只会被拒绝且保留。

## 结论

A19-01/B19-01 按裁决关闭条件全部落实（root17 证据 + 最小修复 + RED + 两拒绝原件与正常腿）；等待阶段 5 整改出口确认门 → round-20 外审。

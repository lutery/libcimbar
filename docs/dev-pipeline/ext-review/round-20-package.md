# 外审交付包 — Round 20（1.2.0 转正：round-19 唯一阻断的整改复验）

> 按 dev-pipeline 阶段 6 生成。外部审查者请只读本清单内材料；结论按
> `round-20-template.md` 的固定章节输出。编号公式：ext_rounds=19，verdict 文件 = `round-20-verdict.md`。
>
> 本包审查对象是 **round-19 唯一新增阻断（A19-01 = B19-01）的整改**。round-14..18 已关闭项
> （含 A18-01、B18-01、B17-01、A16-02、S15/S16）结论保持不变，不重开；E2E-35/37、现场 7 项
> 维持用户既有决定（NOT_RUN）。本包不重跑已通过的产品核心、默认开页与接收保存矩阵（按裁决）。

## 审查对象

| 项 | 值 |
|---|---|
| 仓库/分支 | libcimbar · `ps51-preview`（基线 master `7b91057`） |
| 整改提交 | `2d9b1e5`（round-19 裁决消费）→ `18b7c22`（删除自动终止，改只读拒绝 + RED）→ `c29ce3d`（root17 证据） |
| 整改候选根 | `docs/tests/runs/20261029-teamexec-17`；attempt `candidate-20261029-04`；harness `18b7c22`；product manifest **`7a5e5f1a…`**（27 文件，未变）；input manifest `d4624727…` |
| 承载 | staging/fixtures 为 root16 字节级复制（27/27 与每项 fixture SHA 重验） |

## 修复（裁决允许的最小修复）

`reclaimStaleAutomationBrowser` **整体删除**。新 `assertCdpPortFree(port, label)`：
- 端口空闲 → 返回（正常路径不变）；
- 端口被占 → 只读读取 owner 的 pid/映像/命令行，抛出
  `… CDP port <p> is occupied by pid <n> (<image>|<cmdline>); refusing to start and leaving the occupant untouched …`；
- **函数内无 `Stop-Process`、无 `cimbar-e2e-` 子串测试**（可全文核对）。

其余 Stop-Process 调用点未变且各有既有归属依据：`closeReceiver` 按本轮 mkdtemp 的精确随机 profile 整体关闭；`stopPackagedServer` 按已验证的 server.py/`--directory` 身份。文案更正：旧 "profile marker verified" 随函数删除；台账/总结/复现说明改为"占用即拒绝、不动占用者"。

## 三条真实生产入口腿（全部经 `run-e2e --case E2E-1 --launcher-engine ps51`）

| 腿 | 占用设置 | 结果 |
|---|---|---|
| 拒绝 A：无关 python | 自有 `python <TEMP>\cimbar-e2e-demo\unrelated-server.py --port 9445`（标记仅在脚本路径） | attempt `…9235f6` FAIL，notes 原文含 `receiver: CDP port 9445 is occupied by pid 63048 (python.exe\|"D:\ProgramData\anaconda3\python.exe" …cimbar-e2e-demo\unrelated-s…`；占用者拒绝后**存活**；随后由自有句柄停止 |
| 拒绝 B：外部真实 Edge | 自启 `msedge --user-data-dir=%TEMP%\cimbar-e2e-foreign-<guid> --remote-debugging-port=9445`（普通参数、marker 样 profile 名） | attempt `…9458d9` FAIL，notes 原文含 `receiver: CDP port 9445 is occupied by pid 95728 (msedge.exe\|"C:\Program Files\…`；外部实例拒绝后**存活**；仅在其精确唯一 profile 校验后按自有句柄停止 |
| 正常腿 | CDP 9445 空闲 | attempt `E2E-1-2026-10-29T14-48-12-018Z-7d9540` PASS：地址栏 `127.0.0.1:8768`、启动前仅 `127.0.0.1:8767`、live/录像/外置 SHA 相等 |

另有一次早先的正常腿 `…763ff6` PASS 保留于 `proof/E2E-1/normal-pass/`（首次占用者编排因 Start-Process 拆分内联 python 未占用端口，如实归档）。

## 验证证据

| 证据 | 位置/命令 | 结果 |
|---|---|---|
| 拒绝 A 原文 | `proof/E2E-1/refusal-python/`（results.json、refusal.log、refusal-message.txt） | 占用者存活；拒绝文案含 pid/映像/命令行 |
| 拒绝 B 原文 | `proof/E2E-1/refusal-foreign-edge/` | 同上 |
| 正常腿 | `proof/E2E-1/page-open.json`、`engine-env.txt`、`external-sha.txt` | URL-only 开页 PASS；外置 SHA 相等 |
| 受影响工具 | `logs/affected-checks.log` | tools 69/69、page-open 8/8、dialog 10/10 |
| RED | `red-logs/r19/a19-01-red.log` | 旧函数真实 Stop-Process 无关 python，报 "profile marker verified" |
| 代码自证 | `assertCdpPortFree` 全文 | 无 Stop-Process、无子串测试 |
| 工具身份 | root17 `logs/tools-identity.json`（8 工具 SHA + harness `18b7c22`） | 重算一致 |
| 字节身份 | root17 product manifest vs root16 | `7a5e5f1a…` 相同（27/27 重哈希） |
| 冻结件 | `git diff 0ed2e5b..HEAD -- docs/plans/receiver-ux-v2/performance-method.json` | 空 |

## 材料清单

| 类别 | 路径 |
|---|---|
| 台账（含旧文案更正声明） | `docs/dev-pipeline/receiver-ux-v2/r19-remediation.md` |
| 前序裁决 | `round-14..19-verdict.md` |
| 整改提交 | `2d9b1e5`、`18b7c22`、`c29ce3d` |
| 证据根 | `docs/tests/runs/20261029-teamexec-17/`（run-context、双 manifest、provenance-r17、logs/、proof/ 含两拒绝目录与 normal-pass、reproduction.md） |
| RED | `docs/dev-pipeline/receiver-ux-v2/red-logs/r19/` |
| 历史根 | root16 及更早全部只读 |

## 复跑命令

```powershell
node --test tools/desktop-recv/tests/measure-ux.test.mjs tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/process-guard.test.mjs
node tools/desktop-recv/e2e/page-open-check.mjs --selftest
pwsh -NoProfile -File tools/desktop-recv/e2e/native-dialog.ps1 -Action dialog-selftest -SelftestFile tools/desktop-recv/e2e/native-dialog-selftest.json

# 正常腿（CDP 9445 空闲时）
node tools/desktop-recv/e2e/run-e2e.mjs --context docs/tests/runs/20261029-teamexec-17/run-context.json --case E2E-1 --launcher-engine ps51

# 拒绝腿：先由审查者自行在 9445 放一个任意监听者（勿用真实浏览器），
# 再执行同一命令：必须以 "refusing to start and leaving the occupant untouched" 失败，
# 且该监听者在命令返回后仍然存活。

git diff 0ed2e5b..HEAD -- docs/plans/receiver-ux-v2/performance-method.json   # 期望为空
```

## 诚实性边界

1. **拒绝腿的拒绝文案在 results.json notes**（runner 把该错误写入 results，控制台流为空是设计如此）；两目录内 `refusal-message.txt` 为原文摘录，`refusal.log` 同时说明控制台断言为 False 的原因。
2. **拒绝 B 的外来 Edge 与拒绝 A 的 python 都是本编排自己启动并随后按自有句柄/profile 校验停止的**；未触碰任何用户既有浏览器或服务。
3. **首例编排失败如实归档**（`normal-pass/orchestrator-note.log`）：Start-Process 拆坏内联 python 程序，占用者未真正占用端口，该次 E2E-1 因此以空闲端口 PASS；随后用真实脚本文件重做拒绝 A。
4. 矩阵 12/12 与 unit 222 未重跑（未变工具/产品；裁决只要求回收/拒绝腿）。
5. root13..16 只读；E2E-35/37、现场 7 项维持 NOT_RUN。
6. "profile marker verified" 旧文案已在代码中删除，并在 `exec-log` R19、`stage5-dev-summary` §8.7、`r19-remediation.md`、root17 `reproduction.md` 书面更正。

## 与前轮的关系

- round-14..19 结论与已关闭项不变；round-19 唯一阻断按关闭条件整改并附证据。
- 本轮通过后：从 root17 staging 组装 **libcimbar-desktop-receiver 1.2.0** 正式包（目录+zip+RELEASE-NOTES/CHANGELOG/DELIVERY-MANIFEST）并合并 `ps51-preview` 至 master。

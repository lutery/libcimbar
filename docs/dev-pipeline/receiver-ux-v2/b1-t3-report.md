# B1 工具车道 T3 完成报告（dev-v2-tools）

日期：2026-10-24　基线：lead 已提交 T2（747ce02，tree clean）之后开工；本任务未执行任何 git 写命令。

## 文件清单（T3 改动）

修改：
- `tools/desktop-recv/tests/run-context.test.mjs`：新增第 8 条对抗用例「case-folded 孪生根、分隔符、历史与伪造身份」。覆盖：Windows 大小写折叠的 runRoot/stagingRoot 孪生在两个 context 间被拒（同一物理目录不能当两个 build）；stagingRoot 反斜杠分隔符拒绝；中文/空格 runId 拒绝（ID 保持 ASCII，路径段允许 CJK）；stagingRoot 指向历史 run 拒绝；临时仓库内伪造历史 run 根 load 被拒且该目录字节不变；context 传入目录时明确 E_CONTEXT_MISSING（不产生 stack trace）；大小写折叠的 attempt 目录重开被拒（E_ATTEMPT_EXISTS）且原文件密封不变。
- `tools/desktop-recv/tests/ux-evidence-selftest.py`：新增 8 条对抗负例。覆盖：startedAt/finishedAt 时间倒序；NOT_RUN 带非 null receivedSha256；proof 整组借用另一 attempt 目录（前缀绑定拒绝）；caseId 大小写折叠不匹配冻结计划；proofRef 反斜杠非规范拒绝；field 记录冒 local_simulated scope；同 case 两 attempt 记录并存=重复不合并；planning 路径为目录 → 环境 refusal（exit 3）。
- `tools/desktop-recv/e2e/run-context.mjs`：抗对抗小改——`--validate`/load 对 context 路径为目录时抛 E_CONTEXT_MISSING（原为裸 ENOTDIR/EISDIR stack）。
- `tools/desktop-recv/verify-ux-evidence.py`：抗对抗小改——load_plan 将 planning 读取 OSError/解码错误转为 ContextError（环境 refusal exit 3）；main 在 run_gate 阶段同样捕获 ContextError。

## 复跑命令与结果（仓库根执行；原始日志 red-logs/t3-green-tools.txt）

| 命令 | 退出码 | 关键输出 |
|---|---|---|
| `node --test tools/desktop-recv/tests/run-context.test.mjs` | 0 | `# tests 8 / # pass 8 / # fail 0`（含 T3 对抗用例） |
| `python tools/desktop-recv/tests/ux-evidence-selftest.py` | 0 | `SELFTEST PASS (54 cases)`（46 T2 例 + 8 T3 对抗例） |
| `python tools/desktop-recv/verify-evidence-selftest.py` | 0 | `SELFTEST PASS (14 cases)` |
| `python tools/desktop-recv/e2e/video-prefix-check.py --selftest` | 0 | `SELFTEST PASS (3/3 cases)` |
| `python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py` | 0 | `DESIGN_CONTRACT_SHAPES_PASS`（20 definitions / 27 examples / 44 shapeVectors / 6 interfaces / 15 diagnostics / v1Isolation 通过 / productAcceptance NOT_RUN） |
| `node tools/desktop-recv/run-unit.mjs --all` | 0 | 9 套 120 tests（7/25/6/6/11/7/15/7/36），0 failed/todo/skipped |

语法复核：`node --check` 对 run-context.mjs / run-e2e.mjs / record-sender.mjs / evidence.mjs 均 0；`python -m py_compile` 对 verify-ux-evidence.py 与两份自测均 0。`git diff --check` exit 0。

## 旧 run 字节不变（核对方法）

1. 测试矩阵运行前：对 `docs/tests/runs/20261018-teamexec-01`、`20261019-teamexec-02`、`20261021-teamexec-03`、`build-desktop-recv/staging`、`product/`、`docs/tests/planning-cases.json` 逐文件 `SHA-256 + 字节数 + 仓库相对路径` 生成排序清单（760 项），存 `red-logs/t3-oldruns-before.sha`。
2. 全部测试与 contracts 检查运行后再生成同样清单 `red-logs/t3-oldruns-after.sha`；`Compare-Object` 结果：无任何差异（UNCHANGED, 760 entries）。
3. 交叉核对：`git status --porcelain -- docs/tests/runs build-desktop-recv/staging product` 为空；`docs/tests` 亦无新增未被要求的产物。
4. 测试内对抗写入全部发生在 OS 临时新根（FX-RUN-TEMP 风格），由 Python/PowerShell 各自清理；未触碰真实历史目录。

## 显式恢复边界复核

- 同 runId/phase/manifest/attempt → `initializeRunRoot(..., {resume:true})` 通过（含 harnessRevision 变化）；attempt/manifest/phase 任一不同 → `E_CONTEXT_RESUME_MISMATCH` 且信息点名差异字段；未显式 resume 的非空陌生根 → `E_CONTEXT_RUN_EXISTS`；无 stored context 的 resume → `E_CONTEXT_RESUME_MISSING`。
- 跨构建续写禁止：大小写折叠 attempt 目录重开被拒（E_ATTEMPT_EXISTS），原 attempt 文件保持密封；同 case 不同 attempt 的 proof 借用被拒绝（前缀绑定），旧 attempt 原件不可被索引替换删除。

## 偏差

- 无计划冲突。T3 期间仅两处抗对抗加固（context 路径为目录 → E_CONTEXT_MISSING；planning 不可读 → ContextError exit 3），断言先行、实现后补，均已在自测中固化。
- 未实现 T4（独立审查）与任何真实桌面/产品验收；UX 场景仍为 exit-4 占位。

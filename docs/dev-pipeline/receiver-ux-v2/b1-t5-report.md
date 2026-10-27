# B1 工具车道 T5 完成报告（dev-v2-tools）

日期：2026-10-24　基线：lead 已提交 T4 审查（ee0b20c）之后开工；本任务未执行任何 git 写命令；未改产品代码。

## 修复对照（逐条）

### Blocking 1 —— 启动清理按进程名/端口杀进程
- 新增 `tools/desktop-recv/e2e/process-guard.mjs`：`recordProcesses`（run 根 pids.json，合并写入、kind/markers 校验）、`cleanupRecordedProcesses`（无 pid 文件→零清理；仅回收「本轮记录 + 命令行全部 marker 命中」的进程；marker 空则绝不杀）、`assertPortsFree`（Get-NetTCPConnection Listen 检查；占用→ProcessGuardError，明确 refusing to kill the owner）。JSON 输出手拼，规避 PowerShell 单元素数组退化。
- `run-e2e.mjs`：main() 的宽匹配清理块（msedge+`--disable-backgrounding-occluded-windows`、python+`server.py --port 8771`、python+`http.server 8790` 三类）删除，替换为 `cleanupRecordedProcesses(RUN)`；launchStack/startSenderOnly/recordSenderClip 启动前 `assertPortsFree`；launchStack 记录 sender/receiver server pid、receiver normal-Edge pid（cimbar-e2e- profile）、Playwright sender browser pid（--remote-debugging-pipe）；recorder Edge pid 按 cimbar-e2e-rec- 前缀记录。
- `record-sender.mjs`：同样清理守卫+端口检查（8811/8790/9452）+记录 pid（sender/recorder server、recorder Edge 按显式 markers ['cimbar-recorder-']）。
- DoD 复核：run-e2e 中剩余 Stop-Process 仅两类——closeReceiver 按 `receiver.profile`（cimbar-e2e- 专用前缀）、stopPackagedServer 按「记录 PID + CommandLine 复核」；三类宽匹配 grep 0 命中。单测：`tests/process-guard.test.mjs` 6 例（无 pid 文件零清理；记录 pid 命令行不匹配不杀且进程存活；陈旧 pid 跳过；占用端口拒绝且消息含端口号与 refusing to kill；空闲端口通过；pids.json 规范/非法 pid/未知 kind 拒绝）。
- 残余说明：「现场运行前后用户 Edge/其他自动化实例数量不变」需要真实 E2E 运行（T13+ 才有 context）；T5 内以单测与代码 DoD 复核代替。

### Blocking 2 —— README 仍指示运行 smoke-live（写冻结 run-02）
- `e2e/README.md`：原「Run」节（直接运行 smoke-live 并写 `docs/tests/runs/20261019-teamexec-02`）改为「Run (stage-5 context entry point)」，命令入口指向下方 Stage-5 章节；文件末尾新增「Historical diagnostics (do not run)」章节，明确 smoke-live.mjs/probe-*.mjs 属历史脚手架、非 v2 验收入口，并写明 smoke-live 会写冻结 run 与所需显式开关。
- `e2e/smoke-live.mjs`：文件头标注 HISTORICAL；常量定义后第一条可执行语句即守卫：无 `--legacy-write-frozen-run` 打印三行说明并 exit 2（实测 no-flag exit=2）。未触碰其历史写入逻辑。

### 采纳建议
- S2 `stage.ps1`：全部 `Write-Error`（在 `$ErrorActionPreference='Stop'` 下不可达 exit）替换为 `[Console]::Error.WriteLine(...)` + 原 exit 码；实测：无 -RunId=2、历史 RunId=2、assets 缺 -WasmBuildDir=2、缺 gate log=3、-Help=0。文件行尾保持仓库 LF（曾误转 CRLF，已恢复；diff --check 干净）。
- S3 历史守卫大小写折叠：`run-context.mjs` 增 `foldCase`（win32 小写化），`HISTORICAL_RUN_IDS` 判定与 `isHistoricalPath` 均折叠；测试：大写历史 runId 与指向历史 run 的大写 planningFile 均 E_CONTEXT_HISTORY。
- S4 `verify-ux-evidence.py::resolve_inside` 增加 realpath containment（最深存在祖先 realpath 必须仍在 root realpath 内）；自测新增判别性 junction 用例：run 根内 junction 指向根外、且外部 received.bin 字节与记录哈希一致——只有 realpath 检查能拒绝（实测 exit 1）。
- S5 发送端只读暂存：`run-context.mjs::stageVerifiedSender` 校验 DELIVERY-MANIFEST.txt（逐文件 SHA/存在性/路径规范），复制到 `<stagingRoot>/sender` 并写 `.sender-staged.json`；同包重复调用幂等复用；不同包/漂移副本 E_SENDER_STAGED_MISMATCH 拒绝；源包零写入。runner（launchStack/startSenderOnly）与 recorder 启动服务前调用。单测覆盖复制/幂等/源包不变/篡改 manifest/旧副本拒写。
- S6 `run-e2e.mjs::actualArtifactBudget` 的 source 标签改为 `relative(REPO, <真实 profile 路径>)`（正斜杠）。
- S7 `UX_ENTRY_GROUPS['UX-UI']` 对齐 runbook 改为 E2E-35..38（注意：v2 planning-cases.json 的 groups.UX-UI 仍是 35..37，本处按 lead 指令对齐 runbook；占位出口不受影响）。
- S8 删除恒真装饰 check，改为真实断言：field NOT_RUN 门禁后重读 ux-results.json，断言 E2E-39 result==NOT_RUN 且 executedBy is None。
- S10 `load_context` 的 node 子进程 `timeout=30`，超时→ContextError（环境拒绝 exit 3）。
- S1 未采纳（按 lead 决定）：stage.ps1 development 省略 -StagingRoot 仍用旧共享 staging；README 已写明「v2 一律显式 -StagingRoot，context roots 权威」。

## 先失败断言（配方 R）

T5 实现前实测 RED（日志 `red-logs/t5-red.txt`）：
- `node --test tools/desktop-recv/tests/process-guard.test.mjs` → exit 1，ERR_MODULE_NOT_FOUND process-guard.mjs。
- `node --test tools/desktop-recv/tests/run-context.test.mjs` → exit 1，does not provide an export named 'stageVerifiedSender'。
- `python tools/desktop-recv/tests/ux-evidence-selftest.py` → exit 1，`FAIL junction inside the run root cannot redirect proof reads`（无 realpath containment 时假绿）。
（另：process-guard.test.mjs 首次 GREEN 前发现测试自身 `result.skipped.some(entry => entry.pid…)` 字段误用与 PowerShell 单元素数组退化两处问题，均已修正并复跑。）

## 复跑矩阵（仓库根，全绿）

| 命令 | 退出码 | 关键输出 |
|---|---|---|
| `node --test tools/desktop-recv/tests/run-context.test.mjs` | 0 | 9 tests / 9 pass / 0 fail（新增 T5 guard 用例） |
| `node --test tools/desktop-recv/tests/process-guard.test.mjs` | 0 | 6 tests / 6 pass / 0 fail |
| `python tools/desktop-recv/tests/ux-evidence-selftest.py` | 0 | SELFTEST PASS (55 cases) |
| `python tools/desktop-recv/verify-evidence-selftest.py` | 0 | SELFTEST PASS (14 cases) |
| `python tools/desktop-recv/e2e/video-prefix-check.py --selftest` | 0 | SELFTEST PASS (3/3 cases) |
| `python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py` | 0 | DESIGN_CONTRACT_SHAPES_PASS（definitions 20/examples 27/shapeVectors 44/interfaces 6/diagnostics 15；v1Isolation 通过；productAcceptance NOT_RUN） |
| `node tools/desktop-recv/run-unit.mjs --all` | 0 | 9 套 / 120 tests（7/25/6/6/11/7/15/7/36），0 failed/todo/skipped |

语法：`node --check` run-context/process-guard/run-e2e/record-sender/evidence/smoke-live 全 0；`python -m py_compile` verify-ux-evidence 与两份自测全 0；`git diff --check` 0。

## 旧 run 指纹（核对方法同 T3）

测试前后对 `docs/tests/runs/{20261018,20261019,20261021}-teamexec-*`、`build-desktop-recv/staging`、`product/`、`docs/tests/planning-cases.json` 生成逐文件 SHA-256+size+relpath 排序清单（760 项）：`t3-oldruns-before.sha`（T3 基线） vs `t5-oldruns-after.sha` → Compare-Object 无差异（UNCHANGED）。`git status` 对这些路径为空。T5 未启动任何真实桌面/服务；process-guard 单测只操作测试自建临时进程与 socket。

## 偏差

1. S2 的 exit 4 分类（contract mismatch / candidate 缺文件 / gate marker 不符）未逐一实跑：这些路径需要改写共享 staging 或构造 WASM 构建目录，超出 T5 临时夹具范围；机制与已验证的 2/3 完全一致（同一 `[Console]::Error.WriteLine`+exit 模式），代码审查可确认可达。
2. S7 依 lead 指令对齐 runbook（35..38），与 v2 planning-cases.json 的 groups.UX-UI（35..37）存在文档级不一致，留给 T31 接线时统一（本任务不修改冻结计划）。
3. Blocking 1 的「现场进程数量不变」以代码 DoD + 单测证明，真实桌面验证待 T13+ 的第一次真实运行。
4. 未做 T4 复审（独立审查代理职责）；未实现任何 UX 真实场景。

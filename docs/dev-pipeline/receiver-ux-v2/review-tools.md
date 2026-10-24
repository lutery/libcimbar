全局轮号 15 · review-tools 第 1 次

# T4 审查报告：隔离运行工具与新旧证据门禁

日期：2026-10-24 · 分支：receiver-ux-v2 · 计划基线：9e4fbc4（阶段4计划基线）

## 1. 范围

审查提交（工作树干净，HEAD=fa71186）：
- 81e057f test: specify isolated UX run and gate boundaries（T1）
- 747ce02 feat: isolate receiver UX execution and evidence（T2）
- fa71186 test: reject stale and incomplete UX run claims（T3）

审查文件：
- tools/desktop-recv/e2e/run-context.mjs
- tools/desktop-recv/verify-ux-evidence.py
- tools/desktop-recv/e2e/run-e2e.mjs（T2 变更）
- tools/desktop-recv/e2e/record-sender.mjs（T2 变更）
- tools/desktop-recv/e2e/evidence.mjs（T2 变更）
- tools/desktop-recv/stage.ps1
- tools/desktop-recv/e2e/README.md
- tools/desktop-recv/tests/run-context.test.mjs
- tools/desktop-recv/tests/ux-evidence-selftest.py

参照规范：实施计划 T4 与配方 A、R；docs/tests/receiver-ux-v2/e2e-runbook.md L12-18、L69-85；docs/design-catalog/receiver-ux-v2/contracts/{ux-telemetry.schema.json,ux-diagnostics.json,error-codes.json,receiver-v1.schema.json}。

审查方式：只读代码 + 独立实跑。反例全部自建（%TEMP%\ux-review 下的临时仓库/临时 context），不采信开发方自报结论。命令均为 PowerShell（node/python/pwsh），工作目录为仓库根。

## 2. 结论

**有 Blocking（2 项）**，见第 4 节；A/C/D/F 通过；E 发现两项违反计划硬约束的问题（启动期按进程名/端口杀进程；README 仍指示运行会写冻结历史 run 的 smoke 入口）。

## 3. 独立复核记录

### A. 写入根与子进程参数追踪

代码追踪（不运行）：
- run-e2e.mjs：`applyContextRoots()`（L3945-3951）在任何写入前把 RUN/STAGING/FIXTURES/PLANNING 全部取自 `loadRunContext` 结果；`join(REPO, ...)` 仅用于 `tools/desktop-recv/create-fixtures.py`（L1215）；未发现 docs/tests/runs 或 build-desktop-recv 的字面量写路径。HTTP server（L553-561/603-605）、receiver/sender/recorder 浏览器 profile（L371、L1069，OS 临时目录专用前缀 cimbar-e2e-/cimbar-e2e-rec-）、native-dialog（L162-172）都在 context 根上；场景写路径逐一抽查（received/observation/manifest 等）均为 RUN 派生。
- record-sender.mjs：RUN/STAGING/FIXTURES/MEDIA 取自 context（L134-140）；服务目录 `join(STAGING,'sender')`（L514/665）；媒体写 `fixtureRoot/fixtures-media`。
- verify-ux-evidence.py 的全部 `open()` 为只读（L65/191/212/267/428），不写、不删、不改写 NOT_RUN。
- stage.ps1：-StagingRoot 规范化并拒绝 product/ 与 docs/tests/runs（L85-102）；RunId 拒绝历史值（L79-83）；不做进程启动/清理。

实跑拒绝路径（临时目录/临时 context，未启动浏览器与服务；输出中无 [receiver]/[sender]/[recorder] 标记）：

| 探针 | 退出码 | 关键输出 |
|---|---|---|
| `node run-e2e.mjs --case E2E-27`（无 --context） | 2 | missing required --context ... never falls back to a historical root |
| `node run-e2e.mjs --case E2E-27 --context <missing.json>` | 3 | E_CONTEXT_MISSING: run context not found: <path> |
| `node run-e2e.mjs --case E2E-27 --context <bad.json>` | 3 | E_CONTEXT_JSON: invalid JSON ... position 2 |
| `node run-e2e.mjs --case E2E-27 --context <目录>` | 3 | E_CONTEXT_MISSING: ... not a readable file ... (EISDIR) |
| `node record-sender.mjs --only full`（无 --context） | 2 | missing required --context ... |
| `node record-sender.mjs --context <missing.json>` | 3 | E_CONTEXT_MISSING: run context not found: <path> |
| `pwsh stage.ps1`（无 -RunId） | 1 | Write-Error: invalid or missing -RunId（文档承诺 2，见 S2） |
| `pwsh stage.ps1 -RunId 20261021-teamexec-03 -Mode development` | 1 | Write-Error: refusing to stage or write evidence into historical run（拒绝生效，见 S2） |

有效 context 的副作用检查（临时仓库逐文件 SHA-256 前后比对）：
- `run-e2e.mjs --context <valid> --repo-root <tmp> --validate-only` → exit 0，identity JSON，树不变（unchanged=True）。
- `run-e2e.mjs --context <valid> --case E2E-99` → exit 2（scenario ... is not implemented），树不变。
- `run-e2e.mjs --context <valid> --case UX-SLICE` → exit 4（registered ... refusing to fabricate a PASS），树不变。

结论：runner/recorder/verifier 的写入与启动只来自已校验 context；未发现隐式回退旧 run-03/shared staging；stage 默认共享 staging 见 S1，历史入口文档问题见 Blocking 2。

### B. 原证据不可覆盖

自建反例（probe-b.cjs，%TEMP%\ux-review\probe-b.cjs，直接 import 仓库的 run-context.mjs；旧 run 文件先取 SHA-256，操作后复核）：
- B1a 同 attempt 重开 → `E_ATTEMPT_EXISTS`（ensureAttemptDir 拒绝）；B1b 该 attempt 内 sealed original.bin 前后 SHA 相同；B1c 大小写折叠重名（ATT-1）同样拒绝；B1d `../E2E-28` caseId → `E_CONTEXT_PATH`。
- B2 旧 run 指向逐条拒绝：runId=20261021-teamexec-03（实际报 E_CONTEXT_STAGING_ROOT，先被 staging 结构检查拦下）；runRoot 指向 run-01 → `E_CONTEXT_RUN_ROOT`；stagingRoot 指向 run-02 子目录 → `E_CONTEXT_STAGING_ROOT`；planningFile 指向 run-03/results.json → `E_CONTEXT_HISTORY`。
- B3 三个旧 run 的 results.json（20261018/19/21-teamexec-*）前后 SHA-256 全部一致（零字节变化）。
- B4a 新 attempt 不带 resume 接管既有 run 根 → `E_CONTEXT_RUN_EXISTS`；B4b 显式 resume 但 attemptId 不同 → `E_CONTEXT_RESUME_MISMATCH`。
- 输出：`PROBE B PASS (11/11)`，exit 0。

补充代码事实：ensureAttemptDir/resolveRunPath 当前仅被 manifest 校验与测试调用，场景写入器（T13+）尚未接线；UX 门禁侧已由「proofRef 必须位于 proof/<caseId>/<attemptId>/ 前缀」兜底（本审查 C9 反例独立复现）。结论：**通过**。

### C. 新 UX 项真正参与总门禁

代码阅读：verify-ux-evidence.py 的必测清单来自 context 指定的计划文件（`load_plan` L207-257：gates.<gate>.uxRequired/legacyRequired，并有 derived_ux 反向守卫——计划里 required 且属于该 gate 的非 legacy 场景若漏列 uxRequired 即报违规）；缺失记录（L477-480）、未计划记录（L485-487）、phase（L458-459）与 legacy 组合门禁（L488-494）构成总出口。

自建反例（probe-c.cjs，9 例全部独立构造临时仓库，使用真实 planning-cases.json 的 gates 与 E2E-27..39 的 scope/caseType/acceptanceIds，逐条驱动真实 CLI `python verify-ux-evidence.py --context ... --gate ... --repo-root <tmp>`）：
- C1 旧20+新12全部 PASS → exit 0（正例锚点）。
- C2 删除 E2E-31（旧20仍全绿）→ exit 1，输出点名 E2E-31。
- C3 E2E-27 scope 伪称 unit_integration → exit 1（scope must be local_simulated）。
- C4 context.phase=slice → exit 1（phase 'slice' cannot prove the local gate）。
- C5 local（phase=final）证据去跑 field 门禁 → exit 1（cannot prove the field gate）。
- C6 field（21..26+E2E-39，绑定阈值文件）→ exit 0。
- C7 field E2E-39 NOT_RUN → exit 1（requires result PASS；证据文件未被改写）。
- C8 删除 ux-results.json（旧20全绿）→ exit 1（no ux-results.json in the run root）。
- C9 E2E-28 借用 attempt-001 的 proof → exit 1（outside the claimed attempt directory）。
- 汇总：`PROBE C PASS (9/9)`，exit 0。

结论：**通过**——旧绿灯不能代表 UX 已验；slice/final、local/field 相互不可代验；计划清单是必测来源而非硬编码范围。

### D. 新 UX 证据未塞进旧 v1

- `git diff --stat 9e4fbc4..HEAD -- docs/design-catalog/contracts/receiver-v1.schema.json docs/design-catalog/contracts/error-codes.json` → 空输出（exit 0）；两文件在基线均存在（`git cat-file -e` 成功）。当前 SHA-256：receiver-v1.schema.json = b2996c8440591cf94f56b1c339c01fc1c8cc59e67b6f5b03b74a22a5eb31744d；error-codes.json = 5a93bf224108509565fc8d630741a1442c77455df211b18d9d253131cf6c2f7f；`git status --porcelain` 为空。
- `git diff --stat 9e4fbc4..HEAD -- docs/tests/runs` → 空输出（旧 run 目录无提交级变化）。
- 19001-19015 不在 v1 错误枚举：`Select-String error-codes.json -Pattern '1900[1-9]|1901[0-5]'` 命中 0；receiver-v1.schema.json 中 ux/1900 命中 0。对应码位于 v2 契约 ux-diagnostics.json（抽查 19001/19009/19015 均存在）。
- 旧门禁工具未被本轮提交改动：`git log 9e4fbc4..HEAD -- tools/desktop-recv/verify-evidence.py` 无输出，diff 为空；verify-evidence.py 自测 14/14 通过（见 F）。
- UX 证据独立文件：evidence.mjs 新增 readUxResults/writeUxResults/upsertUxResult/uxRoundtripRecord 只写 ux-results.json，原有 v1 写函数未改动；verify-ux-evidence.py 从 `<runRoot>/ux-results.json` 读取，v1 results.json 交给 verify-evidence.py；「把 UX 记录塞进 results.json」在 54 例自测中实测仍失败（我实跑该自测，见 F）。
- 结论：**通过**。

### E. 非 0 退出传播与不碰用户窗口/外部服务

退出码实测：run-e2e 0/1/2/3/4/5 分类生效（2/3/4 见 A 表；场景抛错由 main().catch → exit 1）；record-sender 0/1/2/3/5（main().catch → exit 1，见文件尾）；verify-ux-evidence 0/1/2/3（CLI 缺参 exit 2 与缺 context exit 3 由 54 例自测与 --help 探针覆盖）。stage.ps1 拒绝路径实测退出 1 而非文档承诺的 2（非零仍传播，见 S2）。

进程清理逻辑审查：
- 允许类：run-e2e L596、L1408-1417（PID + 命令行双重校验）、record-sender L654/693 只按专用 profile 前缀或已记录 PID 清理。
- **违规（Blocking 1）**：run-e2e.mjs L3990-3995 启动清理同时匹配 msedge.exe 命令行含 `--disable-backgrounding-occluded-windows`（Playwright 默认参数，已在 e2e/node_modules/playwright-core/lib/coreBundle.js:36214 实证）、python.exe 含 `server.py --port 8771`、python.exe 含 `http.server 8790`。这三类匹配不受「本轮记录 PID/专用 profile 前缀」约束，属于计划 Waves 硬约束禁止的「按端口/进程名杀」。每次有效 v2 运行（run-e2e 通过 manifest/case/根守卫后）都会先执行该清理，可杀掉其他自动化实例（Playwright 默认参数命中）或用户自己的同名服务。
- 外部服务：8 个被审工具文件 grep `fetch\(|XMLHttpRequest|sendBeacon|WebSocket|https?://` → 0 命中；全部 HTTP 为本机 127.0.0.1 的 python http.server / server.py 与 Playwright connectOverCDP(127.0.0.1)。

README 问题（Blocking 2）：README.md L26-34 的「Run」节仍指示 `node ... smoke-live.mjs` 并写明输出落在 `docs/tests/runs/20261019-teamexec-02/proof/` 与其 results.json；smoke-live.mjs L13-17 的 RUN/SAVE_PATH 常量确认该写入目标为冻结历史 run。runbook L15「禁止写旧run-03、旧staging或旧结果；历史材料只读」与之直接冲突；T2 Step 2 的「旧probe/smoke入口标历史用途」只在 run-e2e --help 内完成，README 与 smoke-live 本身未标注。

### F. 自查自测真实通过（本审查实跑，非引用开发方日志）

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node --test tools/desktop-recv/tests/run-context.test.mjs` | tests 8 / pass 8 / fail 0 / skipped 0 / todo 0（含 junction 逃逸子用例，无 diagnostic 说明已执行） | 0 |
| `python tools/desktop-recv/tests/ux-evidence-selftest.py` | SELFTEST PASS (54 cases) | 0 |
| `python tools/desktop-recv/verify-evidence-selftest.py` | SELFTEST PASS (14 cases) | 0 |
| `node tools/desktop-recv/run-unit.mjs --all` | UNIT SUITES PASS (9 suite(s))，合计 120 tests，0 failed / 0 todo / 0 skipped | 0 |
| `python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py` | DESIGN_CONTRACT_SHAPES_PASS（definitions 20 / examples 27 / shapeVectors 44 / interfaces 6 / diagnostics 15 / acTracked 10；v1Isolation 通过；implementationCases 12 NOT_RUN） | 0 |
| `git diff --check`（含 --cached） | 无输出 | 0 |

结论：**通过**（自测确为 GREEN，且其断言内容与本审查独立反例方向一致）。

## 4. Blocking issues

### Blocking 1：run-e2e 启动清理按进程名/端口杀进程，可能命中用户窗口与其他自动化实例

- 问题：run-e2e.mjs 在通过 manifest/case/根守卫后、启动本轮 stack 之前执行一次全局清理，匹配四类条件：msedge 命令行含 `cimbar-e2e-`（专用 profile 前缀，合规）；msedge 命令行含 `--disable-backgrounding-occluded-windows`；python 命令行含 `server.py --port 8771`；python 命令行含 `http.server 8790`。后三类不受「本轮记录 PID/专用 profile 前缀」限制。
- 原因：该块是 round-3 遗留（git blame：16e2fa62/f70d3241，2026-10-20/21），T2（747ce02）原样保留。它假设「带该 flag 的 Edge / 该命令行的 python 一定是本工具遗留」，但 `--disable-backgrounding-occluded-windows` 是 Playwright 默认参数（本仓库 e2e/node_modules/playwright-core/lib/coreBundle.js:36214），任何其他 Playwright 自动化窗口都会被命中；`http.server 8790` 也可能属于用户自己的静态服务。
- 建议修改：只按本轮记录的 PID 清理（在启动时把 server/浏览器 PID 写入 run 根的 pid 文件，清理前用命令行二次校验）；保留 `*cimbar-e2e-*`/`*cimbar-e2e-rec-*` 专用 profile 前缀条件；删除 flag 条件与两个 python 命令行条件。端口被占时改为显式报错（非 0）而不是杀进程；确实需要回收上次崩溃遗留时，只回收 pid 文件里登记且命令行仍匹配的进程。
- 代码位置：tools/desktop-recv/e2e/run-e2e.mjs:3990-3995。
- 证据：见第 3 节 E 的代码与 Playwright 默认参数实证；本审查未实际执行该清理（运行会误杀真实进程），结论由代码路径与依赖包事实确定。
- DoD 复验标准：`grep Stop-Process tools/desktop-recv/e2e/run-e2e.mjs` 仅剩「专用 profile 前缀」或「已记录 PID + 命令行复核」两类；新增/更新单测覆盖「pid 文件不存在时不杀任何进程」「端口占用时 exit 非 0」；现场运行前后用户 Edge/其他自动化实例数量不变。

### Blocking 2：README 仍指示运行 smoke-live.mjs，而它写入冻结历史 run-02

- 问题：README.md 的「Run」节给出 `node tools/desktop-recv/e2e/smoke-live.mjs`，并明说输出落在 `docs/tests/runs/20261019-teamexec-02/proof/` 与 run 的 results.json；smoke-live.mjs 的 RUN/SAVE_PATH 常量与 README 一致。照 README 操作会写冻结历史 run，违反 runbook「禁止写旧run-03、旧staging或旧结果；历史材料只读」，也不满足 T2 Step 2「旧probe/smoke入口标历史用途并禁止当v2验收入口」（该标注目前只存在于 run-e2e --help）。
- 原因：T2 在 README 末尾追加了 stage-5 章节，但未处理开头的旧「Run」章节；smoke-live.mjs 不在 T2/T5 文件清单内，未被加注。
- 建议修改：把旧「Run/smoke-live」章节标为 historical/do-not-run（写明会写冻结 run-02，只供历史追溯），把 stage-5 的 context 入口放在「Run」位置；如允许改 smoke-live（不在 T5 文件清单，需另行登记），最稳是让它无显式 `--legacy-write-frozen-run` 时拒绝启动。
- 代码位置：tools/desktop-recv/e2e/README.md:26-34；tools/desktop-recv/e2e/smoke-live.mjs:13-17。
- 证据：见第 3 节 E 末段；本审查未运行 smoke-live（避免真的写入冻结 run）。
- DoD 复验标准：README 中不存在「直接运行即写 docs/tests/runs/2026xxxx-*」的指示；旧的 smoke/probe 入口在 README 与文件头均明确 historical 且非 v2 验收入口；对冻结 run 目录的写指令为 0。

## 5. Suggestions（非阻断）

- S1 stage.ps1 的 development 模式在省略 -StagingRoot 时仍写旧的共享 staging `build-desktop-recv/staging/receiver`（stage.ps1:85-86）。冻结命令都传了 -StagingRoot，但建议让 v2 development 必须显式给 -StagingRoot（或加显式 legacy 开关），把「不写共享 staging」变成结构性保证。
- S2 stage.ps1 文档承诺参数/拒绝类错误 exit 2，但 `Write-Error` 在 `$ErrorActionPreference='Stop'` 下先终止 pwsh，`exit 2` 不可达；实测无 -RunId 与历史 RunId 均 exit 1。非零仍传播，但 2/3/4 的分类对自动化不可用；建议去掉 Write-Error 直接 exit，或用 try/catch 包裹。
- S3 历史 run 守卫对大小写敏感（run-context.mjs:122-126、237-250），而 Windows 文件系统不敏感；大小写变体的历史路径可通过 loadRunContext（写入仍会被 initializeRunRoot 以 E_CONTEXT_RUN_EXISTS 拒绝，故当前 fail-safe）。建议对 HISTORICAL_RUN_IDS/isHistoricalPath 做大小写折叠（并考虑 realpath）以 fail-closed。
- S4 verify-ux-evidence.py 的 resolve_inside（L90-98）只做规范化前缀比较，没有 node 解析器的链接/realpath containment；run 根内若有 junction 可把 proof 读取重定向到根外。建议复用 node 解析器的路径校验或将 realpath 检查补进 Python。
- S5 无任何工具把已验发送端包只读复制到 `<stagingRoot>/sender`；stage.ps1 帮助文本称「copied ... by the runner」，但 runner/recorder 仅服务该目录。缺目录会 waitHttp 超时并非 0 退出（不会假绿），建议 T6 前补自动化复制或改正帮助文本。
- S6 run-e2e.mjs:1228 的 `source` 标签写死 `build-desktop-recv/staging/receiver/config/profile.json`，实际读取是 `<stagingRoot>/receiver/config/profile.json`（L1230）；证据 notes 会指错路径。建议由真实路径生成标签。
- S7 UX_ENTRY_GROUPS['UX-UI'] 只含 E2E-35..37，而 runbook L8 写 T31 执行 E2E-35～38，UX-ALL 也含 E2E-38。当前分组均为占位（exit 4，不会产出证据）；T31 接真实 handler 时对齐展开即可。
- S8 ux-evidence-selftest.py:454 `check("NOT_RUN evidence is preserved on disk", True)` 是恒真装饰；真正的「文件未变」由上一行 expect(unchanged=ux_path) 承担。建议删除或改为实际断言，避免读者误判覆盖面。
- S9 assertRealContained 只校验候选相对声明根不逃逸，未校验声明根本身是否为指向仓库外的 junction（run-context.mjs:96-116）；建议对每个 root 也做一次 repoRoot 内 realpath 校验。
- S10 load_context 的 node 子进程无超时（verify-ux-evidence.py:109）；node 挂起会拖死门禁。建议加 timeout 并按环境拒绝处理。

## 6. 审查者

独立审查代理（Claude, dev-pipeline native 模式） · 2026-10-24 · receiver-ux-v2 阶段5 · 全局轮号 15 · review-tools 第 1 次

审查期间未写入产品/工具/测试代码，未执行任何 git 写命令；唯一仓库写入为本报告文件 docs/dev-pipeline/receiver-ux-v2/review-tools.md（由临时分片组装生成）。旧 run（20261018/19/21-teamexec-*）、旧 staging、product/、旧 schema 均只读访问；三个旧 run 的 results.json 在审查期间前后 SHA-256 一致。

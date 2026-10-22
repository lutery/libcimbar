# 外审交付包 — Round 10

> 按 dev-pipeline 阶段 6 生成。外部审查者请只读本清单内材料；结论按
> `round-10-template.md` 的固定章节输出。编号公式：N = ext_rounds + 1；
> ext_rounds=10，故下一份 verdict 文件为 `round-11-verdict.md`（若按"包名=verdict 文件名"
> 的对齐习惯命名，请以编排方实际入账为准——round-5-verdict.md 即对应 round-4 包）。

## 审查对象

| 项 | 值 |
|---|---|
| 仓库/分支 | libcimbar · `screen-capture-recv` |
| 基线 | `master`（上游 `bfb0c8e`） |
| 范围 | `master..d609ab2`：**77 个提交**，768 文件，+44,541 / −9。本包提交（状态 + round-10 文档 + round-9-tasks 归档）只追加文档/状态文件，不含产品代码；包中 77 提交即 `d609ab2` 快照 |
| 上一轮外审 | Round 9 **不通过**（`round-9-verdict.md`，对应 Round-8 包；唯一 Blocking **B-R1（异常出口）/ P2**：正常局部合并已修，但场景提前失败后的最终归属戳仍会把历史量测腿登记为该失败尝试执行——`writeAttemptMarker` 保留旧 measurement 但未打 carried 标，`ensureExtendedFixtures` 在合并打标前抛错时，`catch/finally` 的 `stampAttemptId` 把 10 条历史腿全部盖为失败 attempt〔两轴 + 主审三方独立内存复现，`reattributedOldLegs=10`〕，污染后续合并来源。规格轴 A-R1 与标准轴 B-R1 为同一主题，合成 1 项） |
| 本轮前内部审查 | Round 14 **PASS（0 Blocking）**（`review-round-14.md`）：B-R1 异常出口整改（`d609ab2`）经独立反例重放复验——**`reattributedOldLegs` 10 → 0**；`markMarkerLegsCarried` 语义/幂等、`writeAttemptMarker` 接线时序（marker 先于任何场景代码；`ensureExtendedFixtures` 的抛错点 :1134/:1141/:1145 → 调用点 :2995 确为下游）、`stampLegAttempts` fail-closed 不变、UT-111..115 逐测试核读、四项门禁实跑全绿 |
| 交付物 | 桌面接收端（浏览器内、双输入、单会话、严格 EOF）+ 证据工具链 + 现场手册 |

## 材料清单

| 类别 | 路径 | 用途 |
|---|---|---|
| 变更集 | `git diff master..d609ab2`、`git log --oneline master..d609ab2` | 审查主体（77 提交 / 768 文件） |
| 需求与验收 | `docs/requirements/requirements-spec.md`、`docs/requirements/decision-log.md` | AC-001..014 |
| 设计契约 | `docs/design-catalog/` 全目录（重点 `contracts/receiver-v1.schema.json`、`contracts/error-codes.json`、`module-contract-error-matrix.md`） | 冻结契约 |
| 实施计划 | `docs/plans/2026-10-18-desktop-receiver-implementation.md` | 计划符合性 |
| 测试方案 | `docs/tests/test-plan.md`、`test-cases.md`、`acceptance-tests.md`、`e2e-user-journey-plan.md`、`planning-cases.json` | 测试纪律、26 条旅程与计划 caseType |
| 内部审查报告 | `docs/dev-pipeline/review-round-1.md` .. `review-round-14.md` | 全部已知问题与关闭证据（round-7/9/11 外审前内审 FAIL 均已闭环；round-8/10/12/14 PASS；11–14 为 round-5/7/9 整改周期） |
| 上一轮外审 | `docs/dev-pipeline/ext-review/round-1-*`、`round-2-*`、`round-3-verdict.md`、`round-4-package.md`/`-template.md`、`round-5-verdict.md`、`round-6-package.md`/`-template.md`、`round-7-verdict.md`、`round-8-package.md`/`-template.md`、**`round-9-verdict.md`（本包直接回答的对象）** | 整改依据 |
| 6.5 整改工件 | round-3 周期：`round-3-triage.md` / `round-3-tasks.md`；round-5 周期：`round-5-triage.md` / `round-5-tasks.md`；round-7 周期：`round-7-triage.md` / `round-7-tasks.md`；**round-9 周期（本周期）：`round-9-triage.md` / `round-9-tasks.md`（R9-1 = `d609ab2` marker 基底隔离 + UT-114/115；R9-2 主张同步；随本包提交入库，一并解决 review-14 S-1 的"被引用工件未入库"问题）** | 各主题处置与决策记录 |
| 整改总结与决策 | `docs/dev-pipeline/stage5-dev-summary.md`（归属语义含 round-9 marker 隔离表述、逐 attempt 标注、4MiB 现值 846,733,346 B 与历史值分列）、`docs/dev-pipeline/autonomous-decisions.md`（D-19 实施方适用性/汇总判断〔round-5 S-1 修订版〕、D-20 同流同步双录制器、D-21 端段判据/tStar 量纲/tailEvents） | 任务/提交/证据逐项索引与决策记录 |
| 证据工具语义（round-7/9 两轮变更） | `tools/desktop-recv/e2e/evidence.mjs`（`tagCarriedLegs` 正常合并打标 + `markMarkerLegsCarried` marker 基底隔离〔幂等，origin 有则取值/缺则 unknown〕+ `stampLegAttempts` 只盖 fresh）、`run-e2e.mjs`（`--legs` 合并用 `tagCarriedLegs`；`writeAttemptMarker` 内联 `markMarkerLegsCarried`，先于任何场景代码；`ACTIVE_ATTEMPT_ID` 由 main 设置）、`leg-timings.mjs`（四点必检 saveRequestAt≤createWritableAccessedAt≤writableAt≤writeCloseAt） | round-7/9 两个 B-R1 的修复本体 |
| 技债登记 | `docs/dev-pipeline/tech-debt.md`（TD-15 已以实测关闭、TD-12 修正、TD-17/18 登记） | 显式延期项 |
| 本地运行证据（run-01，历史基线） | `docs/tests/runs/20261018-teamexec-01/` | 单元/集成基线、measurements、support-matrix |
| 本地运行证据（run-02，历史快照） | `docs/tests/runs/20261019-teamexec-02/` | 上一轮 20 旅程证据；保留不动，不再支撑当前完成主张 |
| 本地运行证据（run-03，**本轮关键**） | `docs/tests/runs/20261021-teamexec-03/`：`results.json`、`reproduction.md`（§3 同流双录制器 + payload REUSE + prefix-check 复跑日期/命令）、`measurements.json`、`measurement-report.md`（14 条保存腿四点分项、逐腿 attemptId）、`environment.json`（cb43f85 时期历史快照，见诚实性说明）、`proof/`（含入库的 `proof/E2E-16/manifest.json` + `prefix-check.json`） | 20 条真实旅程与全部盘上工件 |
| 现场套件 | `docs/tests/field-guide.md`、`docs/tests/field-receipt.json` | 现场阶段（未执行） |
| 候选包 | `build-desktop-recv/staging/receiver/`（`build*/` 忽略，不随 git 交付）+ `DELIVERY-MANIFEST.txt` | 装配后摘要 |

> 注意：`build-desktop-recv/` 不在提交内（`build*/` 忽略）。外审若需核对候选包，请运行
> `pwsh -NoProfile -File tools/desktop-recv/stage.ps1 -RunId 20261021-teamexec-03 -Mode development` 后
> `-Mode candidate` 重新装配（需要 WSL2 构建目录；见 `baseline.md`）。

## Round-9 Blocking 整改索引

| Round-9 主题 | 修复 / 提交 | 证据 |
|---|---|---|
| **B-R1（异常出口）** 场景提前失败仍会重标历史腿（P2） | `d609ab2`：`evidence.mjs` 新增纯 `markMarkerLegsCarried(record, attemptId)`——marker 携带的旧 measurement 逐腿打 `carriedInAttempt = {into: attemptId, origin: leg.executedInAttempt || 'unknown', basis: "carried into this attempt's marker from the prior record; not executed in this attempt"}`，**幂等**（既有 `carriedInAttempt` 不覆盖，场景内已打标者保留其标）；`run-e2e.mjs` 的 `writeAttemptMarker` 在复制旧 measurement 之后、`upsertResult` 之前内联调用——先于任何场景代码（`ensureExtendedFixtures` 的抛错点 :1134/:1141/:1145 → 调用点 :2995 确为 marker 下游），因此合并前抛错时历史基底已被隔离，最终 `stampAttemptId` 只能盖到真正的 fresh 腿；`stampLegAttempts` 保持 fail-closed 不变。回归 **UT-114**（verdict 精确流程：legacy 10 腿 → marker 复制并打标〔含二次调用幂等验证〕→ 合并前抛错 → 终写 → 10 条历史腿 `executedInAttempt` 保持 undefined、`carriedInAttempt` 逐字段保留；追加的 fresh 腿正确盖失败 attempt；下一次正常合并 9 携带腿 `into` 更新为 att-next 而 `origin` 保持 unknown）+ **UT-115**（场景内已 `tagCarriedLegs`、写入前抛错 → 终写不重标）。R9-2 主张同步：stage5 摘要与 round-8 包改为"正常与异常出口均闭合（marker 携带基底隔离）"。`remediation/round-9-tasks.md` 随本包提交入库（解决 review-14 S-1 的被引用工件缺失）。 | round-14 内审独立反例重放（内存/临时目录，未触仓库）：**`reattributedOldLegs` 修复前 10 → 修复后 0**（REPLAY PASS）；fresh 腿仍正确盖章；下一次正常合并 9 携带腿 origin 保持 unknown、绝不为失败 attempt；已知 origin 分支独立探针（`executedInAttempt='att-prior'` → `origin='att-prior'` 保留、盖章不重标）；四门禁在 `d609ab2` 树实测全绿（unit 9 套件 **120** 测试〔evidence 36，UT-111..115〕、selftest 14/14、local PASS(20)、field exit 1 设计内）；无产品源（src/、worker/）与 run-03 records/measurements 变更 |

上轮保留边界（round-9 verdict 明示、本包不重开）：**逐异常恢复（E2E-15 8 腿）、末帧同流配对（E2E-16）、保存四时点分项**均已在 round-7/9 verdict 核验继续有效；round-9 本轮产品、媒体与原始运行证据零变更。

## 关键主张与对应证据

| 主张 | 证据 |
|---|---|
| B-R1 异常出口关闭：marker 携带基底在场景前隔离 | `markMarkerLegsCarried` + `writeAttemptMarker` 内联调用；UT-114/115 固化两条异常形状；round-14 反例重放 `reattributedOldLegs` 10→0；120 单测全绿 |
| 正常合并归属 fail-closed（round-7 周期成果，继续有效） | `tagCarriedLegs` + 收紧后的 `stampLegAttempts`；UT-111/112/113；round-13 反例重放 PASS |
| 保存分项四点断言（R7 S-1） | `leg-timings.mjs` 必检集 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt + 链式排序；14 条含保存腿全部满足（saveWait 4159–4920 / saveWrite 96–160 / saveMs 4256–6804，恒等式成立） |
| 20 条本地真实旅程全部完成（run-03） | `results.json` 20 条 PASS + `GATE local: PASS (20 required cases)`；attempt 链与逐案 proof 产物 |
| E2E-15/16/18 关键证据（沿用，不重开） | E2E-15 attempt a78e7f 8/8；E2E-16 attempt 9bdbbd（prefix head 0.000 @offset 0、tail 3/3、T\*=8.869 ≥ 7.30、without EOF 6.348 无产物、零校准）；E2E-18 attempt d21d32 合并记录（预算腿 saveMs 5026；9 腿 carried：8 执行自 3e34f2 + 1 条 sanctioned NOT_RUN，归属以文字披露） |
| 证据纪律与归属 | 双端门禁、selftest 14、prefix selftest 3、UT-043..048/073..079/083/084/096..115；`reproduction.md` §1.1/§3 与现行装置一致；`stage5` 逐 attempt 标注 |

## 复跑命令

```powershell
node tools\desktop-recv\run-unit.mjs --all                 # 9 套件 120 例（含 UT-114/115）
node tools\desktop-recv\verify-assets.mjs --root build-desktop-recv\staging\receiver
python tools\desktop-recv\verify-evidence-selftest.py      # 14 例负/正矩阵
python tools\desktop-recv\e2e\video-prefix-check.py --selftest   # 3/3（正例/头错位/尾截断负例）
python tools\desktop-recv\e2e\video-prefix-check.py `
  --with docs\tests\runs\20261021-teamexec-03\fixtures-media\V-LAST-with.webm `
  --without docs\tests\runs\20261021-teamexec-03\fixtures-media\V-LAST-without.webm --cut-ms 6500
#   对现存媒体：head 0.000 @offset 0、tail 3/3；与已提交 proof/E2E-16/prefix-check.json 逐字一致
node tools\desktop-recv\e2e\run-e2e.mjs --case E2E-15 --source window   # 8 腿逐异常恢复
node tools\desktop-recv\e2e\run-e2e.mjs --case E2E-16 --source window   # 配对门禁 + 三腿
node tools\desktop-recv\e2e\run-e2e.mjs --case E2E-18 --source window   # 十腿矩阵
python tools\desktop-recv\summarize.py --run docs\tests\runs\20261021-teamexec-03
python tools\desktop-recv\verify-evidence.py --run docs\tests\runs\20261021-teamexec-03 --gate local
#   预期 PASS (20 required cases)，exit 0
python tools\desktop-recv\verify-evidence.py --run docs\tests\runs\20261021-teamexec-03 --gate field
#   预期 FAIL (6 violations：E2E-21..26 缺记录)，exit 1——设计如此
```

native：`ctest` 9/9 为外审 round 1 实跑的既有结果；round-5/7/9 整改未触碰 C++ 源、未重建 WASM，不据此声称新构建产物已验收。

## 明确的未完成 / 未验证（勿按已完成审查）

- **现场旅程 E2E-21..26**：`NOT_RUN`（用户侧）；field 门禁按设计 FAIL（exit 1，6 条缺记录），不得由本地记录代填。E2E-26 计划为 measurement，现场 PASS 需先冻结阈值。
- **E2E-18 `live-n-20mib-over-budget` 腿 NOT_RUN**：按 **D-19（实施方对额外探测腿的适用性/汇总判断，非用户新授权）**记录；代码对清单外 NOT_RUN fail-closed（`AUTHORIZED_NOT_RUN=['live-n-20mib-over-budget']`）。
- **3e34f2 全矩阵 PASS 的归属**：该次全矩阵执行（10 腿在该 attempt 内完成）发生在 2026-10-22 06:19–07:00Z，**控制台日志未入库**，由编排方（team-lead）见证确认；d21d32 随后仅重跑预算腿。当前记录腿级归属字段未落盘（记录生成早于该机制）；自下一次记录写入起，marker 路径先隔离携带基底（`markMarkerLegsCarried`）、合并路径打 `carriedInAttempt`（origin 有则取值、缺则 unknown，绝不回填当前 attempt）、最终写入只盖 fresh 腿（UT-111..115，正常与异常出口均覆盖）；"8 条执行腿来自 3e34f2"是文档陈述，不是机器字段。
- **未重跑的旅程**：E2E-1..14、17、19、20 本轮未重跑（round-5 verdict 已限定复验范围）；其已提交 proof 字节未变，门禁对 proof 副本重算哈希；V-LAST 媒体替换不影响已存副本。
- **fixtures-media 输入不可从干净克隆直接重放**：录像与载荷按设计 gitignore；`reproduction.md` §3 给出当前装置完整再生成配方（同流双录制器、声明停点 9.5/6.5 s、payload REUSE、prefix-check 命令与复跑日期）；pair 清单与 prefix 证明文本副本已入库 `proof/E2E-16/`；其余媒体的完整字节核对仍需向运行方索取。
- **environment.json 为历史快照**（round-7 S-2 / round-9 verdict 已确认留阶段 8）：cb43f85 时期的单元计数（108）等不得读作当前值（当前 120）；阶段 8 最终包须绑定当前快照并保留历史。
- **probe-bounds 单文件覆盖式**（历史值在记录 `bounds` 字段中）。**性能阈值**未冻结，`NOT_EVALUATED`。**MP4/H.264、DPI/缩放组合**未验证（E2E-9 仅覆盖渲染缩放与窗口尺寸）。
- **内审建议留档**：round-9 S-4/S-5、round-10 S-2、round-12 S-2（已于 round-7 采纳入必检集）、round-13 S-1/S-2（S-1 已落 `99aaf05`；S-2 留阶段 8）、**round-14 S-1（round-9-tasks.md 未入库——随本包提交解决）**。

## 6.5 整改工件

- `docs/dev-pipeline/remediation/round-9-triage.md`：B-R1（异常出口）确认纳入整改（引 verdict 位置与三方内存复现），无反证；上轮三项不重开；建议无新增（round-7 S-1 已采纳并验证）。
- `docs/dev-pipeline/remediation/round-9-tasks.md`：R9-1（`d609ab2` 工具 + UT-114/115）/ R9-2（主张同步）；覆盖检查 B-R1 ≥ 1 任务、pushback 零任务、无桌面重跑；验证表（d609ab2 树实测：unit 120 全绿、selftest 14/14、prefix 3/3、local PASS(20)/field 设计内 FAIL、反例逆转 reattributedOldLegs=0）。
- 决策链：B-R1 异常出口修复 ↔ UT-114/115 回归 ↔ stage5/round-8 包主张同步 ↔ round-14 内审反例重放 PASS。

## 建议外审工具（中立，供自选）

`production-code-audit`（全库生产级审计）、`security-review`（OWASP 清单）、`agnix`（agent 配置 lint）。

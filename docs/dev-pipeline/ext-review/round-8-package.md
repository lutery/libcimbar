# 外审交付包 — Round 8

> 按 dev-pipeline 阶段 6 生成。外部审查者请只读本清单内材料；结论按
> `round-8-template.md` 的固定章节输出。编号公式：N = ext_rounds + 1；
> ext_rounds=8，故下一份 verdict 文件为 `round-9-verdict.md`（若按"包名=verdict 文件名"
> 的对齐习惯命名，请以编排方实际入账为准——round-5-verdict.md 即对应 round-4 包）。

## 审查对象

| 项 | 值 |
|---|---|
| 仓库/分支 | libcimbar · `screen-capture-recv` |
| 基线 | `master`（上游 `bfb0c8e`） |
| 范围 | `master..99aaf05`：**75 个提交**，764 文件，+44,162 / −9 |
| 上一轮外审 | Round 7 **不通过**（`round-7-verdict.md`，对应 Round-6 包；唯一 Blocking **B-R1 / P2**：证据工具的最终归属戳会历史携带腿重标——`stampLegAttempts` 把“缺 `executedInAttempt`”一律当“本次新执行”，当前 run-03 E2E-18 十腿恰好全缺该字段，下次 `--legs` 局部复跑会把 9 条携带腿错误重标为合并 attempt 的执行〔审阅者内存反例：legacyCarried=9, reattributedCarried=9〕。**上轮 A-01/A-02/A-03 三项在该 verdict 中已逐项列证确认关闭，不重开**） |
| 本轮前内部审查 | Round 13 **PASS（0 Blocking）**（`review-round-13.md`）：B-R1 整改（`4deaba8`）经独立复验——审阅者反例现已是常驻回归 UT-112（9 条 legacy 携带腿 + 1 条 fresh 腿 → 只有 fresh 腿被盖 `executedInAttempt`，9 条保持 undefined 且带 `carriedInAttempt`）；R13 复核两个 Suggestion：S-1（二次合并边界 origin 精度）→ `99aaf05` 已落（携带腿已有 origin 时 `carriedInAttempt.origin` 取该值而非 unknown）；S-2（environment 当前快照）按 triage 留阶段 8 |
| 交付物 | 桌面接收端（浏览器内、双输入、单会话、严格 EOF）+ 证据工具链 + 现场手册 |

## 材料清单

| 类别 | 路径 | 用途 |
|---|---|---|
| 变更集 | `git diff master..99aaf05`、`git log --oneline master..99aaf05` | 审查主体（75 提交 / 764 文件） |
| 需求与验收 | `docs/requirements/requirements-spec.md`、`docs/requirements/decision-log.md` | AC-001..014 |
| 设计契约 | `docs/design-catalog/` 全目录（重点 `contracts/receiver-v1.schema.json`、`contracts/error-codes.json`、`module-contract-error-matrix.md`） | 冻结契约 |
| 实施计划 | `docs/plans/2026-10-18-desktop-receiver-implementation.md` | 计划符合性 |
| 测试方案 | `docs/tests/test-plan.md`、`test-cases.md`、`acceptance-tests.md`、`e2e-user-journey-plan.md`、`planning-cases.json` | 测试纪律、26 条旅程与计划 caseType |
| 内部审查报告 | `docs/dev-pipeline/review-round-1.md` .. `review-round-13.md` | 全部已知问题与关闭证据（round-7/9/11 FAIL、round-8/10/12/13 PASS；11–13 为 round-5/7 整改周期） |
| 上一轮外审 | `docs/dev-pipeline/ext-review/round-1-*`、`round-2-*`、`round-3-verdict.md`、`round-4-package.md`、`round-4-template.md`、`round-5-verdict.md`、`round-6-package.md`/`-template.md`、**`round-7-verdict.md`（本包直接回答的对象）** | 整改依据 |
| 6.5 整改工件 | round-3 周期：`round-3-triage.md` / `round-3-tasks.md`；round-5 周期：`round-5-triage.md` / `round-5-tasks.md`；**round-7 周期（本周期）：`round-7-triage.md` / `round-7-tasks.md`（R7-1 工具语义 + UT-112/113 + S-1 四点断言 = `4deaba8`；R7-2 主张同步 + 本 tasks 归档）** | 各主题处置与决策记录 |
| 整改总结与决策 | `docs/dev-pipeline/stage5-dev-summary.md`（逐 attempt 标注、归属语义按 B-R1 收紧后的准确表述、4MiB 现值 846,733,346 B 与历史值分列）、`docs/dev-pipeline/autonomous-decisions.md`（**D-19** 实施方适用性/汇总判断〔round-5 S-1 修订版〕、**D-20** 同流同步双录制器、**D-21** 端段判据/tStar 量纲/tailEvents） | 任务/提交/证据逐项索引与决策记录 |
| 证据工具语义（本轮重点变更） | `tools/desktop-recv/e2e/evidence.mjs`（`tagCarriedLegs`：不在重执行集合的腿打 `carriedInAttempt={into, origin〔有 origin 取该值，缺失即 'unknown'}, basis〕`；空集合=全量重跑不标记；`stampLegAttempts` 只盖无 origin 无 carried 标的 fresh 腿）、`tools/desktop-recv/e2e/leg-timings.mjs`（**S-1 采纳：必检集四点** saveRequestAt≤createWritableAccessedAt≤writableAt≤writeCloseAt）、`run-e2e.mjs`（合并路径用 `tagCarriedLegs`，`ACTIVE_ATTEMPT_ID` 由 main 设置） | B-R1 修复本体与 R7 S-1 断言收紧 |
| 技债登记 | `docs/dev-pipeline/tech-debt.md`（TD-15 已以实测关闭、TD-12 修正、TD-17/18 登记） | 显式延期项 |
| 本地运行证据（run-01，历史基线） | `docs/tests/runs/20261018-teamexec-01/` | 单元/集成基线、measurements、support-matrix |
| 本地运行证据（run-02，历史快照） | `docs/tests/runs/20261019-teamexec-02/` | 上一轮 20 旅程证据；保留不动，不再支撑当前完成主张 |
| 本地运行证据（run-03，**本轮关键**） | `docs/tests/runs/20261021-teamexec-03/`：`results.json`、`reproduction.md`（§3 同流双录制器 + payload REUSE + prefix-check 复跑日期/命令）、`measurements.json`、`measurement-report.md`（14 条保存腿含四点分项、逐腿 attemptId）、`environment.json`（cb43f85 时期历史快照，见诚实性说明）、`proof/`（含 `proof/E2E-16/manifest.json` + `prefix-check.json` 入库文本副本） | 20 条真实旅程与全部盘上工件 |
| 现场套件 | `docs/tests/field-guide.md`、`docs/tests/field-receipt.json` | 现场阶段（未执行） |
| 候选包 | `build-desktop-recv/staging/receiver/`（`build*/` 忽略，不随 git 交付）+ `DELIVERY-MANIFEST.txt` | 装配后摘要 |

> 注意：`build-desktop-recv/` 不在提交内（`build*/` 忽略）。外审若需核对候选包，请运行
> `pwsh -NoProfile -File tools/desktop-recv/stage.ps1 -RunId 20261021-teamexec-03 -Mode development` 后
> `-Mode candidate` 重新装配（需要 WSL2 构建目录；见 `baseline.md`）。

## Round-7 Blocking 整改索引

| Round-7 主题 | 修复 / 提交 | 证据 |
|---|---|---|
| **B-R1** 首次局部复跑仍会错误重标携带腿（P2） | `4deaba8`：`evidence.mjs` 新增纯 `tagCarriedLegs(legs, reexecutedIds, attemptId)`（不在重执行集合的腿打 `carriedInAttempt={into, origin:'unknown', basis}` 事实标；集合内不动；空集合=全量重跑）；`stampLegAttempts` 收紧为只给“无 `executedInAttempt` 且无 `carriedInAttempt`”的 fresh 腿盖章——fail-closed，绝不以当前合并 attempt 兜底；`run-e2e.mjs` 合并路径改用 `tagCarriedLegs`（`ACTIVE_ATTEMPT_ID` 由 main 设置）。回归 **UT-112**（审阅者精确反例成为永久回归：当前形状 9 条 legacy 携带腿 + 1 条 fresh → 只有 fresh 被盖；9 条保持 `executedInAttempt` undefined 且带 `carriedInAttempt`）+ **UT-113**（集合内不动/集合外打标/空集合=全量重跑）+ UT-111 保留（已有 origin 不覆盖）。**R7 S-1 同时采纳**：`assertSaveTimingsComplete` 必检集加入 `createWritableAccessedAt`（四点链式排序；当前 14 条保存腿全部满足，无一弱化）。`99aaf05`（round-13 S-1）：二次合并边界 origin 精度——携带腿已有 `executedInAttempt` 时 `carriedInAttempt.origin` 取该值（非 unknown）；UT-113 增补该断言；`docs/dev-pipeline/remediation/round-7-tasks.md` 归档（R7-1/R7-2、覆盖检查、六门禁实测、波次）。 | round-13 内审复验：审阅者反例在 `4deaba8` 树上重放 **PASS**（9 条携带腿不再被重标；仅 fresh 腿取当前 attempt）；当前工作树单测 `run-unit.mjs --all` = 9 套件 **118** 测试全绿（evidence 34，含 UT-112/113）；selftest 14/14；prefix selftest 3/3；`GATE local: PASS (20 required cases)`；field exit 1 设计内。主张同步：stage5 摘要与 round-6 包的归属语义已按收紧后表述更新（“未来合并归属正确”类主张已移除；“8 条来自 3e34f2”明确为文档陈述） |

Round-7 verdict 中上轮三项（A-01 E2E-15 逐异常恢复 / A-02 E2E-16 同流配对与末段 / A-03=B-S1 保存量测分项）已被其独立复现确认关闭（verdict「上轮3项闭环」表逐项列证），本包不重开、不重复援引；round-8 无独立新主题之外的整改内容。

## 关键主张与对应证据

| 主张 | 证据 |
|---|---|
| B-R1 关闭：合并归属 fail-closed | `tagCarriedLegs` + 收紧后的 `stampLegAttempts`；UT-111/112/113；round-13 内审以审阅者反例重放 PASS；当前树 118 单测全绿 |
| 保存分项断言四点齐备（R7 S-1 采纳） | `leg-timings.mjs` 必检集 saveRequestAt/createWritableAccessedAt/writableAt/writeCloseAt + 链式排序；14 条含保存腿全部满足（saveWait 4159–4920 / saveWrite 96–160 / saveMs 4256–6804，恒等式成立） |
| 20 条本地真实旅程全部完成（run-03） | `results.json` 20 条 PASS + `GATE local: PASS (20 required cases)`；attempt 链与逐案 proof 产物 |
| E2E-15/16/18 关键证据（沿用，不重开） | E2E-15 attempt a78e7f 8/8；E2E-16 attempt 9bdbbd（prefix head 0.000 @offset 0、tail 3/3、T\*=8.869 ≥ 7.30、without EOF 6.348 无产物、零校准）；E2E-18 attempt d21d32 合并记录（预算腿 saveMs 5026，9 腿 carried：8 执行自 3e34f2 + 1 条 sanctioned NOT_RUN） |
| 证据纪律与归属 | 双端门禁、selftest 14、prefix selftest 3、UT-043..048/073..079/083/084/096..113；`reproduction.md` §1.1/§3 与现行装置一致；`stage5` 逐 attempt 标注 |

## 复跑命令

```powershell
node tools\desktop-recv\run-unit.mjs --all                 # 9 套件 118 例（含 UT-112/113）
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

native：`ctest` 9/9 为外审 round 1 实跑的既有结果；round-5/7 整改未触碰 C++ 源、未重建 WASM，不据此声称新构建产物已验收。

## 明确的未完成 / 未验证（勿按已完成审查）

- **现场旅程 E2E-21..26**：`NOT_RUN`（用户侧）；field 门禁按设计 FAIL（exit 1，6 条缺记录），不得由本地记录代填。E2E-26 计划为 measurement，现场 PASS 需先冻结阈值。
- **E2E-18 `live-n-20mib-over-budget` 腿 NOT_RUN**：按 **D-19（实施方对额外探测腿的适用性/汇总判断，非用户新授权）**记录；代码对清单外 NOT_RUN fail-closed（`AUTHORIZED_NOT_RUN=['live-n-20mib-over-budget']`）。
- **3e34f2 全矩阵 PASS 的归属**：该次全矩阵执行（10 腿在该 attempt 内完成）发生在 2026-10-22 06:19–07:00Z，**控制台日志未入库**，由编排方（team-lead）见证确认；d21d32 随后仅重跑预算腿。当前记录腿级归属字段未落盘（记录生成早于该机制）；自下一次记录写入起合并路径打 `carriedInAttempt`（origin 有则取值、缺则 unknown，绝不回填当前 attempt），最终写入只盖 fresh 腿（UT-111/112/113）；“8 条执行腿来自 3e34f2”是文档陈述，不是机器字段。
- **未重跑的旅程**：E2E-1..14、17、19、20 本轮未重跑（round-5 verdict 已限定复验范围）；其已提交 proof 字节未变，门禁对 proof 副本重算哈希；V-LAST 媒体替换不影响已存副本。
- **fixtures-media 输入不可从干净克隆直接重放**：录像与载荷按设计 gitignore；`reproduction.md` §3 给出当前装置完整再生成配方（同流双录制器、声明停点 9.5/6.5 s、payload REUSE、prefix-check 命令与复跑日期）；pair 清单与 prefix 证明文本副本已入库 `proof/E2E-16/`；其余媒体的完整字节核对仍需向运行方索取。
- **environment.json 为历史快照**（round-7 S-2，按 triage 留阶段 8）：cb43f85 时期的单元计数（108）等不得读作当前值（当前 118）；阶段 8 最终包须绑定当前快照并保留历史。
- **probe-bounds 单文件覆盖式**（历史值在记录 `bounds` 字段中）。**性能阈值**未冻结，`NOT_EVALUATED`。**MP4/H.264、DPI/缩放组合**未验证（E2E-9 仅覆盖渲染缩放与窗口尺寸）。
- **内审建议留档**：round-9 S-4/S-5、round-10 S-2、round-12 S-2（picker mark 于 round-7 已采纳入必检集，注释更新）、round-13 S-1/S-2（S-1 已落 `99aaf05`；S-2 留阶段 8）。

## 6.5 整改工件

- `docs/dev-pipeline/remediation/round-7-triage.md`：B-R1 确认纳入整改（引 verdict 位置与内存反例），无反证；**S-1 采纳**（`assertSaveTimingsComplete` 加 picker 边界）、S-2 留阶段 8。
- `docs/dev-pipeline/remediation/round-7-tasks.md`：R7-1（`4deaba8`：工具语义 + UT-112/113 + 四点断言）/ R7-2（主张同步 + 本 tasks 归档）；覆盖检查 B-R1 ≥ 1 任务、pushback 零任务、无桌面重跑；六门禁实测表。
- 决策链：B-R1 修复 ↔ UT-112/113 回归 ↔ stage5/round-6 包主张同步 ↔ round-13 内审复验（反例重放 PASS）。

## 建议外审工具（中立，供自选）

`production-code-audit`（全库生产级审计）、`security-review`（OWASP 清单）、`agnix`（agent 配置 lint）。

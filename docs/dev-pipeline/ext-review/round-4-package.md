# 外审交付包 — Round 4

> 按 dev-pipeline 阶段 6 生成。外部审查者请只读本清单内材料；结论按
> `round-4-template.md` 的固定章节输出到 `round-4-verdict.md`。

## 审查对象

| 项 | 值 |
|---|---|
| 仓库/分支 | libcimbar · `screen-capture-recv` |
| 基线 | `master`（上游 `bfb0c8e`） |
| 范围 | `master..31b9d30`：**64 个提交**，735 文件，+39,303 / −9。本包提交（状态 + round-4 文档）只追加文档/状态文件，不含产品代码 |
| 上一轮外审 | Round 3 **不通过**（`round-3-verdict.md`，3 个独立主题：T1 资源生命周期、T2 规模/预算/量测、T3 录像验收） |
| 本轮前内部审查 | Round 9 **FAIL（1 Blocking：B-1 E2E-18 登记 vs 已提交判据矛盾）** → 闭环 `31b9d30`（triage 决策 7 / D-19 + 全矩阵重跑）→ Round 10 **PASS（0 Blocking）** |
| 交付物 | 桌面接收端（浏览器内、双输入、单会话、严格 EOF）+ 证据工具链 + 现场手册 |

## 材料清单

| 类别 | 路径 | 用途 |
|---|---|---|
| 变更集 | `git diff master..31b9d30`、`git log --oneline master..31b9d30` | 审查主体（64 提交 / 735 文件） |
| 需求与验收 | `docs/requirements/requirements-spec.md`、`docs/requirements/decision-log.md` | AC-001..014 |
| 设计契约 | `docs/design-catalog/` 全目录（重点 `contracts/receiver-v1.schema.json`、`contracts/error-codes.json`、`module-contract-error-matrix.md`） | 冻结契约 |
| 实施计划 | `docs/plans/2026-10-18-desktop-receiver-implementation.md` | 计划符合性 |
| 测试方案 | `docs/tests/test-plan.md`、`test-cases.md`、`acceptance-tests.md`、`e2e-user-journey-plan.md`、`planning-cases.json` | 测试纪律、26 条旅程与计划 caseType |
| 内部审查报告 | `docs/dev-pipeline/review-round-1.md` .. `review-round-10.md` | 全部已知问题与关闭证据（含 round-7 FAIL、round-8 PASS、round-9 FAIL、round-10 PASS） |
| 上一轮外审 | `docs/dev-pipeline/ext-review/round-1-*`、`round-2-*`、`round-3-verdict.md`（本包 `round-4-package.md` / `round-4-template.md`） | 整改依据 |
| 6.5 整改工件 | `docs/dev-pipeline/remediation/round-3-triage.md`（决策 1..7）、`round-3-tasks.md` | 三主题处置与用户决策记录 |
| 整改总结 | `docs/dev-pipeline/stage5-dev-summary.md`、`docs/dev-pipeline/autonomous-decisions.md`（含 D-19） | 任务/提交/证据逐项索引与决策记录 |
| 技债登记 | `docs/dev-pipeline/tech-debt.md`（TD-15 已以实测关闭、TD-12 修正、TD-17/18 登记） | 显式延期项 |
| 本地运行证据（run-01，历史基线） | `docs/tests/runs/20261018-teamexec-01/` | 单元/集成基线、measurements、support-matrix |
| 本地运行证据（run-02，历史快照） | `docs/tests/runs/20261019-teamexec-02/` | 上一轮 20 旅程证据；本轮后保留不动，不再支撑当前完成主张 |
| 本地运行证据（run-03，**本轮关键**） | `docs/tests/runs/20261021-teamexec-03/`：`results.json`、`reproduction.md`、`measurements.json`、`measurement-report.md`、`environment.json`、`proof/` | 20 条真实旅程（19 直接 PASS + E2E-18 矩阵 PASS 由代码路径可复现产生）、逐案产物与外部哈希、18 条腿级量测 |
| 现场套件 | `docs/tests/field-guide.md`、`docs/tests/field-receipt.json` | 现场阶段（未执行） |
| 候选包 | `build-desktop-recv/staging/receiver/`（`build*/` 忽略，不随 git 交付）+ `DELIVERY-MANIFEST.txt` | 装配后 24 文件含摘要 |

> 注意：`build-desktop-recv/` 不在提交内（`build*/` 忽略）。外审若需核对候选包，请运行
> `pwsh -NoProfile -File tools/desktop-recv/stage.ps1 -RunId 20261021-teamexec-03 -Mode development` 后
> `-Mode candidate` 重新装配（需要 WSL2 构建目录；见 `baseline.md`）。

## Round-3 Blocking 整改索引

| Round-3 主题 | 修复 / 提交 | 证据 |
|---|---|---|
| T1 资源生命周期（init-failed 不 terminate；取消期 cleanup 门） | `f70d324`（decoder-client init-failed/帧异常 → terminate；app 期 init 所有权；session cleanup 门；ui deriveControls 纳入 cleanupComplete；video-source S-2 加固）+ `c211907`（harness 侧复核装置） | `tests/unit/client.test.mjs` UT-085..087、`session.test.mjs` UT-088..092、`video.test.mjs` UT-093..095、`ui.test.mjs` UT-092；round-9 内审以真实 `DecoderClient+SessionCoordinator+deriveControls` 组装独立重放三连失败探针（每轮 Stopped / cleanupComplete=true / created==terminated==3）与取消期探针（二次 startLive 被拒、晚到 client terminate、pending 清空补发快照）——判据四层（探针+记录+单测+门禁）核验 |
| T2 规模/预算/实际量测（A-R2） | `c211907`+`cb43f85`+`31b9d30`：E2E-18 十腿矩阵（`create-fixtures.py --extended` 确定性样本；probe 界先声明后执行；嵌套 `measurement.legs[]`）+ `summarize.py` 重写（measurements.json + measurement-report.md）+ 全矩阵重跑 | run-03 `results.json` E2E-18 + `proof/E2E-18/`（canonical 对与逐腿 received.bin 均经门禁与内审重算相等）；`logs/E2E-18-r9-repro.log`（attempt `…fc3f88`，`CASE E2E-18 PASS`）；**4 MiB 难压缩录像腿实测**：600 s / 861,505,434 B 录像完整传输、重建哈希相等（TD-15 旧 128 KiB 上限因此关闭；不作最大容量主张，profile 预算仍 16 MiB）；`measurements.json` 18 腿 / 14 组；compressible 20 MiB 真实 15008 产物预算拒绝→停止→正常文件恢复哈希相等；`live-n-20mib-over-budget` NOT_RUN 带代码级依据（见诚实性说明） |
| T3 录像验收假绿 + 真实入口 + 末帧对照（A-R3） | `c211907`+`cb43f85`：`tools/desktop-recv/e2e/leg-verdict.mjs`（按腿增量判据：attempt 身份 + status trail + 日志增量 + 可重启终态；UT-096 固定审查者反例为常驻 FAIL 回归）；E2E-15 重写（逐腿 + 真实 `#btn-video` 入口 + open-cancel/open 真实 OS 对话框腿 + 对话框选中文件恢复往返）；E2E-16 配对时间线判据（`endReason` 降为诊断、产物处有限收束、`T*>without` 时长）；triage 决策 5/6 记录两项判据授权（corrupt 码并集 + rejectionPoint 逐腿记录；E2E-16 判据精化） | run-03 `results.json` E2E-15（五腿 PASS：real-entry-cancel/empty/text/corrupt/real-entry-open + 对话框选中恢复哈希相等）与 E2E-16（v-short 不 Ready；without 真实 EOF 无产物且 lastUs<T*；with endReason 诊断 + `__mediaEnded=null` + `artifactFrameId=118`=`最后呈现帧` + T*=8.028118s>without 5.842s + 保存哈希相等）；`proof/E2E-16/timelines/` 三份时间线；`web/desktop-recv/tests/unit/evidence.test.mjs` UT-096..103；record-sender 双段同起点（每段前 reload）+ manifest |

Round-9 内审在此之上抓出 1 个 Blocking（B-1：E2E-18 旅程级 PASS 系会话内人工 upsert、不可由已提交判据复现），已按复核路径 (i) 闭环于 `31b9d30`：triage 决策 7 + D-19 落授权链、`run-e2e.mjs` 实现 `AUTHORIZED_NOT_RUN` 矩阵语义（fail-closed）、全矩阵重跑由代码路径再生成 PASS 记录。Round-10 独立复核 0 Blocking。

## 关键主张与对应证据

| 主张 | 证据 |
|---|---|
| 20 条本地真实旅程全部完成（run-03） | `results.json` 20 条 `result=PASS`/`executedBy=executor`/独立 attemptId + `proof/` 逐案字节产物；`GATE local: PASS (20 required cases)`；每条旅程的 S-1 尝试标记链完整 |
| E2E-18 十腿矩阵：规模/预算/量测真实交付 | `results.json` E2E-18（attempt `…fc3f88`）+ `measurement.legs[]` 逐腿 sizes/timings/hashes/bounds/recording；`logs/E2E-18-r9-repro.log`；记录由 `AUTHORIZED_NOT_RUN` 代码路径产生（triage 7 / D-19），重跑可复现 |
| 真实录像往返与末帧因果 | E2E-14（V-GOOD-C/N × 3 轮）；E2E-16 配对（shared frame-0 reload 构造 + manifest）；4 MiB 难压缩录像腿（861 MB / 600 s，重建哈希相等） |
| 逐腿失败验收不再是累计日志假绿 | `leg-verdict.mjs` + UT-096..103；E2E-15 五腿 + 真实入口取消/重选（`open` 对话框三级回退，成功只以应用侧 `recording:` 增量判定） |
| 保存语义 / 系统对话框 / 重名确认 | E2E-11/12/13；`native-dialog.ps1`（含 `open`/`open-cancel`、翻译气泡抑制、窗口转储）；`save-controller.js` |
| 证据纪律 | `evidence.js` + 双端门禁 + selftest 14 + UT-043..048/073..079/083/084/096..103；field 门禁诚实 FAIL |
| 启动器路径与失败语义 | `launch.ps1` / `launch.cmd`；E2E-1/2（E2E-2 现停止其启动的分离服务器，不留端口泄漏） |
| 可恢复性（Incomplete/取消/停止/清理门） | T1 修复 + UT-085..092；E2E-4/5/6/7/15/17/19 |
| 量测交付 | `measurements.json` / `measurement-report.md`：18 腿 / 14 组（inputKind×class×tier），边界定义（init / valid-input start / reconstruction / save request+write-close），性能 `NOT_EVALUATED` |

## 复跑命令

```powershell
node tools\desktop-recv\run-unit.mjs --all                 # 9 套件 108 例
node tools\desktop-recv\verify-assets.mjs --root build-desktop-recv\staging\receiver
python tools\desktop-recv\verify-evidence-selftest.py      # 14 例负/正矩阵
python tools\desktop-recv\create-fixtures.py --root docs\tests\runs\20261021-teamexec-03 --extended
#   幂等：同种子同字节；manifest 记录种子/方法/SHA-256
node tools\desktop-recv\e2e\run-e2e.mjs --case E2E-18 --source window
#   矩阵重跑：记录由 AUTHORIZED_NOT_RUN 代码路径产生（重跑前请先阅读
#   reproduction.md 与 run-e2e.mjs 内的串行车道约束）
python tools\desktop-recv\summarize.py --run docs\tests\runs\20261021-teamexec-03
python tools\desktop-recv\verify-evidence.py --run docs\tests\runs\20261021-teamexec-03 --gate local
#   预期 PASS (20 required cases)，exit 0
python tools\desktop-recv\verify-evidence.py --run docs\tests\runs\20261021-teamexec-03 --gate field
#   预期 FAIL (6 violations：E2E-21..26 NOT_RUN)，exit 1——设计如此
```

native：`ctest` 9/9 为外审 round 1 实跑的既有结果；round-3 整改未触碰 C++ 源、未重建 WASM，不据此声称新构建产物已验收。

## 明确的未完成 / 未验证（勿按已完成审查）

- **现场旅程 E2E-21..26**：`NOT_RUN`（用户侧）；field 门禁按设计 FAIL，不得由本地记录代填。E2E-26 计划为 measurement，现场 PASS 需先冻结阈值。
- **E2E-18 `live-n-20mib-over-budget` 腿 NOT_RUN（带代码级依据）与旅程级 PASS 语义**：该腿按用户批准的计划腿矩阵裁定 NOT_RUN（接收端无早期产物尺寸检查——`decoder-worker.js:209` 的 `build_artifact` 仅在喷泉解码报告完整文件后于 `:334` 调用，难压缩 20 MiB 需全流传输后才被拒；像素预算拒绝不替代产物预算拒绝）。旅程级"矩阵 PASS"语义由 triage 决策 7 + D-19 记录，`AUTHORIZED_NOT_RUN=['live-n-20mib-over-budget']`，实现于 `run-e2e.mjs`（对清单外 NOT_RUN fail-closed），并由改后 harness 的全矩阵重跑复现（attempt `…fc3f88`）。授权链说明：D-19 的裁定人为 team-lead（"用户批准计划内授权"），非用户对旅程级语义的当面新裁决。Round-10 内审 S-1 原文：「S-1（残余观察，非阻断）：D-19 的裁定人为 team-lead（"用户批准计划内授权"），非用户对旅程级语义的当面新裁决；链路现已可审计且代码对清单外 NOT_RUN 保持 fail-closed，round-4 外审如要求用户直接确认，只需补一条用户确认记录，无需改代码。」——如外审要求用户直接确认，补一条用户确认记录即可，无需改代码。
- **fixtures-media 输入不可从干净克隆直接重放**：录像与载荷按设计 gitignore；`reproduction.md` 给出完整再生成配方（`record-sender` 命令行、`--only last`、`--without-seconds`、期望哈希引用），fixtures-ext 样本可用 `create-fixtures.py --extended` 按种子逐字节再生成（样本目录已 gitignore，manifest 提交）。外审可直接复核的是**已提交的 `proof/` 字节工件**，门禁与两轮内审均已从这些文件重算哈希并核对相等。
- **probe-bounds 单文件覆盖式**：`proof/E2E-18/probe-bounds.json` 为最新一次探测腿执行的声明（重跑覆盖旧声明）；历史 attempt 的声明值保存在其各自的日志与记录 `bounds` 字段中（round-10 S-2）。
- **性能阈值**：未冻结，`NOT_EVALUATED`。
- **MP4/H.264、其他 DPI/缩放组合、OS 显示缩放**：未验证（support-matrix 明确列出，run-03 E2E-9 仅覆盖渲染缩放与窗口尺寸）。
- **内审建议留档**：round-9 S-4（leg-verdict 单测并入 evidence 套件而非独立文件，摘要已注明）、round-9 S-5（`session.js` `_decoderFailed` 缺 `captureRejected` 守卫——产品侧建议，未在本轮触碰）、round-10 S-2（probe-bounds 按 attempt 归档）。

## 6.5 整改工件

- `docs/dev-pipeline/remediation/round-3-triage.md`：三主题全部"确认"（引 verdict 位置+探针+代码位置，无反证），用户四项决策（运行目录/超预算构造/4MiB 探测协议/编号统一）+ 车道授权决策 5-7（corrupt 码并集与逐腿 rejectionPoint；E2E-16 产物处有限收束判据；E2E-18 旅程级矩阵语义与 AUTHORIZED_NOT_RUN 清单）。
- `docs/dev-pipeline/remediation/round-3-tasks.md`：18 任务、W1–W8、浏览器串行车道（TB1）。
- 授权链：triage 7 ↔ D-19（`autonomous-decisions.md`）↔ `run-e2e.mjs` 代码注释 ↔ 重跑记录 attempt `…fc3f88`。

## 建议外审工具（中立，供自选）

`production-code-audit`（全库生产级审计）、`security-review`（OWASP 清单）、`agnix`（agent 配置 lint）。

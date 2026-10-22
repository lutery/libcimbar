# 外审交付包 — Round 6

> 按 dev-pipeline 阶段 6 生成。外部审查者请只读本清单内材料；结论按
> `round-6-template.md` 的固定章节输出。编号公式：N = ext_rounds + 1；
> ext_rounds=6，故下一份 verdict 文件为 `round-7-verdict.md`（若按旧模板的包名对齐习惯写作
> `round-6-verdict.md`，请以编排方实际入账为准——round-5-verdict.md 即对应 round-4 包）。

## 审查对象

| 项 | 值 |
|---|---|
| 仓库/分支 | libcimbar · `screen-capture-recv` |
| 基线 | `master`（上游 `bfb0c8e`） |
| 范围 | `master..1167a2b`：**72 个提交**，758 文件，+43,710 / −9 |
| 上一轮外审 | Round 5 **不通过**（`round-5-verdict.md`，对应 Round-4 包；3 个独立主题：**A-01** E2E-15 未逐个异常验证正常录像恢复；**A-02** E2E-16 共享前缀/最后关键帧因果未证明（reload≠帧 0 同步、tStar 量纲错误、早段完成）；**A-03=B-S1** 成功录像保存后的量测取自保存前快照（5 条录像腿 saveRequestAt/writeCloseAt/saveMs 全 null）） |
| 本轮前内部审查 | Round 11 **FAIL（3 项 presentation-level Blocking：R11-B1 reproduction 仍写已否决的 reload 协议；R11-B2 量测汇总未纳入 E2E-15 保存分项；R11-B3 合并记录的腿级 attempt 归属）** → 修复 `ba6df6d` → Round 12 **PASS（0 Blocking）**；R12 S-1（合并路径归属戳在逻辑上反相，会把携带腿标成合并 attempt）→ 修复 `1167a2b`（归属戳改到最终记录写入，UT-111） |
| 交付物 | 桌面接收端（浏览器内、双输入、单会话、严格 EOF）+ 证据工具链 + 现场手册 |

## 材料清单

| 类别 | 路径 | 用途 |
|---|---|---|
| 变更集 | `git diff master..1167a2b`、`git log --oneline master..1167a2b` | 审查主体（72 提交 / 758 文件） |
| 需求与验收 | `docs/requirements/requirements-spec.md`、`docs/requirements/decision-log.md` | AC-001..014 |
| 设计契约 | `docs/design-catalog/` 全目录（重点 `contracts/receiver-v1.schema.json`、`contracts/error-codes.json`、`module-contract-error-matrix.md`） | 冻结契约 |
| 实施计划 | `docs/plans/2026-10-18-desktop-receiver-implementation.md` | 计划符合性 |
| 测试方案 | `docs/tests/test-plan.md`、`test-cases.md`、`acceptance-tests.md`、`e2e-user-journey-plan.md`、`planning-cases.json` | 测试纪律、26 条旅程与计划 caseType |
| 内部审查报告 | `docs/dev-pipeline/review-round-1.md` .. `review-round-12.md` | 全部已知问题与关闭证据（含 round-7/9/11 FAIL 与 round-8/10/12 PASS；round-11/12 为 round-5 整改周期） |
| 上一轮外审 | `docs/dev-pipeline/ext-review/round-1-*`、`round-2-*`、`round-3-verdict.md`、`round-4-package.md`、`round-4-template.md`、**`round-5-verdict.md`（本包直接回答的对象）** | 整改依据 |
| 6.5 整改工件 | `docs/dev-pipeline/remediation/round-3-triage.md` / `round-3-tasks.md`（round-3 周期）；**`round-5-triage.md` / `round-5-tasks.md`（本周期：A-01/A-02/A-03=B-S1 的处置、配对构造与端段判据决策）** | 三主题处置与用户决策记录 |
| 整改总结与决策 | `docs/dev-pipeline/stage5-dev-summary.md`（逐 attempt 标注、initMs 分解、4MiB 现值 846,733,346 B 与历史值分列）、`docs/dev-pipeline/autonomous-decisions.md`（**D-19 已按 verdict S-1 改写为"实施方对额外探测腿的适用性/汇总判断"**；**D-20** 同流同步双录制器；**D-21** 端段判据、tStar 量纲修正与 tailEvents） | 任务/提交/证据逐项索引与决策记录 |
| 技债登记 | `docs/dev-pipeline/tech-debt.md`（TD-15 已以实测关闭、TD-12 修正、TD-17/18 登记） | 显式延期项 |
| 本地运行证据（run-01，历史基线） | `docs/tests/runs/20261018-teamexec-01/` | 单元/集成基线、measurements、support-matrix |
| 本地运行证据（run-02，历史快照） | `docs/tests/runs/20261019-teamexec-02/` | 上一轮 20 旅程证据；保留不动，不再支撑当前完成主张 |
| 本地运行证据（run-03，**本轮关键**） | `docs/tests/runs/20261021-teamexec-03/`：`results.json`、`reproduction.md`（§3 已改为同流双录制器 + payload REUSE + prefix-check 复跑）、`measurements.json`、`measurement-report.md`（14 条保存腿含 saveWait/saveWrite 分项、逐腿 attemptId）、`environment.json`、`proof/` | 20 条真实旅程；**`proof/E2E-16/manifest.json` + `proof/E2E-16/prefix-check.json` 已入库**（pair 构造与 head/tail 证明的文本副本；`fixtures-media/` 本身仍按设计 gitignore） |
| 现场套件 | `docs/tests/field-guide.md`、`docs/tests/field-receipt.json` | 现场阶段（未执行） |
| 候选包 | `build-desktop-recv/staging/receiver/`（`build*/` 忽略，不随 git 交付）+ `DELIVERY-MANIFEST.txt` | 装配后摘要 |

> 注意：`build-desktop-recv/` 不在提交内（`build*/` 忽略）。外审若需核对候选包，请运行
> `pwsh -NoProfile -File tools/desktop-recv/stage.ps1 -RunId 20261021-teamexec-03 -Mode development` 后
> `-Mode candidate` 重新装配（需要 WSL2 构建目录；见 `baseline.md`）。

## Round-5 Blocking 整改索引

| Round-5 主题 | 修复 / 提交 | 证据 |
|---|---|---|
| **A-01** E2E-15 逐异常恢复（P1） | `1650a09`：`leg-verdict.mjs` 新增 `evaluateRecoveryLeg`（helperExit/openIngested/attemptIdAdvanced/readyReached/saveTimingsComplete/hashEqual 六项显式判据，rig-limited → NOT_RUN）；E2E-15 重写为 8 腿序列（real-entry-cancel → recovery-cancel → empty → recovery-empty → text → recovery-text → corrupt → recovery-corrupt），每腿独立 proof 目录 + 独立 attemptId，恢复腿经 `completeLegSave` 真保存 + 外部 SHA-256；UT-104/105 固定"旧日志拒绝/rig-limited/各判据显式失败"。`20f395c`：native-dialog `open` 仅在实际观测到对话框关闭后才 exit 0（tier-3 重试一次 + 编辑框文本探针），从装置层消除"helper exit 0 但应用未摄入"的假确认类。 | run-03 `results.json` E2E-15 attempt **a78e7f**：**8/8 PASS**；4 条恢复腿 attemptId video-1/3/5/7、helperExit=0、app 侧 `recording:` 增量、Ready、`saveTimingsComplete=true`；saveMs 4907/4637/6804/4256（saveWait 4795/4541/6708/4159，saveWrite 96–112）；逐腿 `proof/E2E-15/recovery-*/received.bin` 与 fixture 外部 SHA-256 相等 |
| **A-02** E2E-16 同流配对与末帧对照（P1） | `1650a09`：`recorder.html __startPairRecording`（**一次 getDisplayMedia、同任务启动两个 MediaRecorder、声明停点**）；`record-sender.mjs` pair 路径与 manifest 重写；新增 `video-prefix-check.py`（cv2，head ±6 帧偏移/阈值 max(10, 2×片内连续底线)、tail 按声明裁停的 PTS 位置核对末 3 帧）+ `--selftest`；新增 `pair-evidence.mjs` 配对门禁（构造字符串/同流字段/0<cut<withMs/盘上 sha/prefix PASS）；`evaluateLastFramePair` 端段判据（**`tStarSec = lastUs/1e6` 量纲修正**、`T* ≥ withDuration−2.0`、`__mediaEnded=null`、without 真 EOF ≥ declaredCut−1.0、无产物、`T* > without 时长`），失败给 RE-RECORD 指示（校准预算 2 次）；app.js 有界 `tailEvents` 诊断台账。`20f395c`：manifest 记录 `payloadReused/payloadSha256`。`ba6df6d`：reproduction §3 重写，`1167a2b`：prefix-check 复跑日期与命令留档。 | run-03 `fixtures-media/manifest.json` + 已入库 `proof/E2E-16/{manifest,prefix-check}.json`：同流构造、payload REUSE（sha `b59e5ec5…`）、prefix **head bestOffset=0 / bestMeanAbsDiff=0.000（阈值 10.0）**、**tail 3/3 命中**、verdict PASS；E2E-16 attempt **9bdbbd** PASS：**T\*=8.869 s ≥ 末段边界 7.30 s**（withDuration=9.3 s 取自 open-precheck 行）、`__mediaEnded=null`、保存哈希相等、without 真实 EOF 6.348 s、无产物、配对有效性 8.869 > 6.348，**零校准**；`proof/E2E-16/timelines/` 三份时间线含 tailEvents（末事件 artifact@frameId 105 / mediaTimeUs 8,869,000）与排空顺序 |
| **A-03 = B-S1** 保存量测后读 + 分项（P1/P2） | `1650a09`：新增纯模块 `leg-timings.mjs`（decoderInit/sourceWait/init/reconstruct/totalToReady/pickerWait/writableOpen/saveWait/saveWrite/save 分项；`assertSaveTimingsComplete` 要求 saveRequestAt≤writableAt≤writeCloseAt）+ `completeLegSave`（保存→重读 pageState→断言→外部哈希），统一用于 liveRoundtrip/E2E-15/E2E-16/E2E-18；UT-108/109/110。`20f395c`：预算腿把恢复保存的保存后时点并入腿记录（rejectionTimings 保留拒绝会话），`summarize.py` 输出 round-5 分解键 + attemptId；`ba6df6d`：summarize 增加 `leg.timings ?? leg.saveTimings` 回退与 `saveTimingsComplete` 派生（E2E-15/E2E-16 形状纳入）；`1167a2b` 起最终写入戳记 `executedInAttempt`，**round-7 B-R1 整改进一步收紧**：合并时对携带腿打 `carriedInAttempt`（into/origin:'unknown'/basis）事实标、最终写入只给 fresh 腿盖当前 attempt（`tagCarriedLegs` + `stampLegAttempts`；UT-111/112/113），历史携带腿永不重标为本次执行。 | run-03 `results.json`：**14 条含保存腿全部非空且有序**——E2E-15 四恢复腿（saveWait 4159–6708 / saveWrite 96–112 / saveMs 4256–6804）、E2E-16 v-last-with（5406/100/5506）、E2E-18 九腿（saveWait 4305–4920 / saveWrite 108–160，含预算腿 4874/152/5026），`saveTimingsComplete=true`；`measurements.json`/`measurement-report.md` 再生后逐腿呈现上述分项（21 腿中 14 条含保存分项，7 条无保存腿显式 `-`）；恒等式 save=saveWait+saveWrite、saveWait=pickerWait+writableOpen 逐条成立 |

Round-11 的三项 presentation-level Blocking（reproduction 陈旧 / 汇总缺 E2E-15 保存分项 / 腿级 attempt 归属）已在 `ba6df6d` 修复并经 Round-12 独立复核 **PASS（0 Blocking）**；Round-12 的唯一 must-fix（S-1 合并路径归属戳反相）在 `1167a2b` 修复，**round-7 B-R1 复审发现的遗留形状（当前记录十腿缺 origin 的首次局部复跑）已进一步收紧**：合并路径显式区分 carried 与 fresh（携带腿打 `carriedInAttempt`、origin 标 unknown，绝不回填当前 attempt），最终写入只戳 fresh 腿（UT-111/112/113 固定规则）。

## 关键主张与对应证据

| 主张 | 证据 |
|---|---|
| E2E-15 逐异常恢复真实交付 | attempt **a78e7f**：8 腿全 PASS（4 坏输入 + 4 真实入口恢复），逐腿 `proof/E2E-15/recovery-*/received.bin` 外部 SHA-256 相等，逐腿保存时点齐全；UT-104/105 将"旧日志拒绝、rig-limited、各判据显式失败"固定为回归 |
| E2E-16 同流配对与末段完成因果成立 | 已入库 `proof/E2E-16/manifest.json` + `prefix-check.json`（head 0.000 @offset 0、tail 3/3、verdict PASS）；attempt **9bdbbd**：T\*=8.869 s（量纲修正后）落在 9.3 s 媒体末段（边界 7.30），`__mediaEnded=null`，without 6.348 s 真实 EOF 无产物，配对有效性成立，零校准；timelines 含 tailEvents 排空顺序 |
| 保存量测后读且分项 | `leg-timings.mjs` + `completeLegSave` + `assertSaveTimingsComplete`；14 条含保存腿非空有序（E2E-15 4256–6804 ms、E2E-16 5506 ms、E2E-18 4465–5026 ms），恒等式成立；`measurements.json` 再生后逐腿带 attemptId 与 saveWait/saveWrite |
| 20 条本地真实旅程全部完成（run-03） | `results.json` 20 条 `result=PASS` + `GATE local: PASS (20 required cases)`；attempt 链与逐案 proof 产物 |
| E2E-18 十腿矩阵与预算拒绝/恢复 | E2E-18 attempt **d21d32**（合并记录）：9 腿 carried（8 条执行腿来自 **3e34f2** 全矩阵 + 1 条 sanctioned NOT_RUN）、预算腿在 d21d32 执行（saveMs 5026）；compressible 20 MiB 真实 15008 拒绝→停止→哈希干净恢复；`AUTHORIZED_NOT_RUN=['live-n-20mib-over-budget']` 由代码路径 fail-closed 实现 |
| 证据纪律与归属 | 双端门禁（`verify-evidence.py` / `src/evidence.js`）、selftest 14、prefix selftest 3、UT-043..048/073..079/083/084/096..111；`reproduction.md` §1.1/§3 与现行装置一致；`stage5-dev-summary.md` 逐 attempt 标注（4MiB 现值 846,733,346 B，历史值分列） |

## 复跑命令

```powershell
node tools\desktop-recv\run-unit.mjs --all                 # 9 套件 116 例
node tools\desktop-recv\verify-assets.mjs --root build-desktop-recv\staging\receiver
python tools\desktop-recv\verify-evidence-selftest.py      # 14 例负/正矩阵
python tools\desktop-recv\e2e\video-prefix-check.py --selftest   # 3/3（正例/头错位/尾截断负例）
python tools\desktop-recv\e2e\video-prefix-check.py `
  --with docs\tests\runs\20261021-teamexec-03\fixtures-media\V-LAST-with.webm `
  --without docs\tests\runs\20261021-teamexec-03\fixtures-media\V-LAST-without.webm --cut-ms 6500
#   对现存媒体：head 0.000 @offset 0、tail 3/3；与已提交 proof/E2E-16/prefix-check.json 逐字一致
python tools\desktop-recv\create-fixtures.py --root docs\tests\runs\20261021-teamexec-03 --extended
#   幂等：同种子同字节；manifest 记录种子/方法/SHA-256
node tools\desktop-recv\e2e\run-e2e.mjs --case E2E-15 --source window   # 8 腿逐异常恢复
node tools\desktop-recv\e2e\run-e2e.mjs --case E2E-16 --source window   # 配对门禁 + 三腿
node tools\desktop-recv\e2e\run-e2e.mjs --case E2E-18 --source window   # 十腿矩阵
python tools\desktop-recv\summarize.py --run docs\tests\runs\20261021-teamexec-03
python tools\desktop-recv\verify-evidence.py --run docs\tests\runs\20261021-teamexec-03 --gate local
#   预期 PASS (20 required cases)，exit 0
python tools\desktop-recv\verify-evidence.py --run docs\tests\runs\20261021-teamexec-03 --gate field
#   预期 FAIL (6 violations：E2E-21..26 缺记录)，exit 1——设计如此
```

native：`ctest` 9/9 为外审 round 1 实跑的既有结果；round-5 整改未触碰 C++ 源、未重建 WASM，不据此声称新构建产物已验收。

## 明确的未完成 / 未验证（勿按已完成审查）

- **现场旅程 E2E-21..26**：`NOT_RUN`（用户侧）；field 门禁按设计 FAIL（exit 1，6 条缺记录），不得由本地记录代填。E2E-26 计划为 measurement，现场 PASS 需先冻结阈值。
- **E2E-18 `live-n-20mib-over-budget` 腿 NOT_RUN**：按 **D-19（已按 round-5 verdict S-1 改写为"实施方对额外探测腿的适用性/汇总判断"）**记录；该判断不是用户对旅程级语义的当面新裁决。代码对清单外 NOT_RUN fail-closed（`AUTHORIZED_NOT_RUN=['live-n-20mib-over-budget']`）。
- **3e34f2 全矩阵 PASS 的归属**：该次全矩阵执行（10 腿全部在该 attempt 内完成）发生在 2026-10-22 06:19–07:00Z，**其控制台日志未入库**，因此该 attempt 的全矩阵执行由编排方（team-lead）见证并在会话记录中确认；随后 d21d32 仅重跑预算腿并原样携带其余 9 腿（8 条执行腿来自 3e34f2 + 1 条 sanctioned NOT_RUN）。当前记录的腿级归属字段尚未落盘（记录生成早于该机制）；自下一次记录写入起，合并路径对携带腿打 `carriedInAttempt`（origin 标 unknown、绝不回填当前 attempt），最终写入只给 fresh 腿盖 `executedInAttempt`（round-7 B-R1 收紧；UT-111/112/113 覆盖"已有 origin 不覆盖"与"当前十腿缺 origin 的首次局部复跑"两种形状）。本包以文字披露该归属；"8 条来自 3e34f2"是文档陈述，不是机器字段。
- **未重跑的旅程**：E2E-1..14、17、19、20 本轮未重跑（verdict 明确限定复验范围 = E2E-15/16/18 量测）；其已提交 proof 字节未变，门禁对 proof 副本重算哈希；V-LAST 媒体的替换不影响已存副本（E2E-14 使用的是 V-GOOD-C/N，E2E-17 的录像输入在后续轮次执行时按新装置重建）。
- **fixtures-media 输入不可从干净克隆直接重放**：录像与载荷按设计 gitignore；`reproduction.md` §3 给出当前装置的完整再生成配方（同流双录制器、声明停点 9.5/6.5 s、payload REUSE、prefix-check 命令与复跑日期）；pair 清单与 prefix 证明的文本副本已入库 `proof/E2E-16/`；其余媒体的完整字节核对仍需向运行方索取。
- **probe-bounds 单文件覆盖式**：`proof/E2E-18/probe-bounds.json` 为最新一次探测腿的声明（重跑覆盖）；历史 attempt 的声明值保存在各自记录 `bounds` 字段中。
- **性能阈值**：未冻结，`NOT_EVALUATED`（阈值为用户后测项）。
- **MP4/H.264、其他 DPI/缩放组合、OS 显示缩放**：未验证（support-matrix 明确列出，run-03 E2E-9 仅覆盖渲染缩放与窗口尺寸）。
- **装置边界（如实）**：真实 Windows 桌面 + 正常启动的 Edge + 系统对话框驱动；`native-dialog.ps1` 的 `open` 动作在 tier-3 路径下以"对话框实际关闭"为 exit 0 硬门 + 编辑框文本探针（best-effort），应用侧 `recording:` 增量仍是旅程判据。
- **内审建议留档**：round-9 S-4（leg-verdict 单测并入 evidence 套件）、round-9 S-5（`session.js` `_decoderFailed` 缺 `captureRejected` 守卫，产品侧建议未触碰）、round-10 S-2（probe-bounds 按 attempt 归档）、round-12 S-2（`assertSaveTimingsComplete` 未把 picker 边界 mark 纳入必检——已在 `leg-timings.mjs` 注释留档，未改语义）。

## 6.5 整改工件

- `docs/dev-pipeline/remediation/round-5-triage.md`：A-01/A-02/A-03=B-S1 全部确认（引 verdict 位置与本地复核），无反证；四项裁决（复验范围、配对构造及"Ready 时停录不可行"的如实替代、保存量测后读、编号），均由用户批准的计划承担。
- `docs/dev-pipeline/remediation/round-5-tasks.md`：W1–W6 任务分解与串行车道顺序。
- 决策链：`autonomous-decisions.md` **D-19**（实施方适用性/汇总判断）↔ **D-20**（同流双录制器，含"Ready 时停录不可行"披露）↔ **D-21**（端段判据、tStar 量纲修正、tailEvents）↔ `run-e2e.mjs`/`leg-verdict.mjs`/`recorder.html` 代码注释。

## 建议外审工具（中立，供自选）

`production-code-audit`（全库生产级审计）、`security-review`（OWASP 清单）、`agnix`（agent 配置 lint）。

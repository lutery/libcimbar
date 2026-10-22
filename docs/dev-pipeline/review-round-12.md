# 内部审查归档 — Round 12（round-5 整改周期第 2 轮：R11 三项单点复核）

- 新周期标注：round-5 整改周期内审第 2 轮（R11 三项单点复核）；pipeline-state 的 `review_rounds=10 / max_rounds=10` 由编排方保管，本报告不自增该计数。
- 范围：`fbfdeff..f6424c7`（2 提交：`ba6df6d` R11 三项呈现修复（误带 pyc）+ `f6424c7` 删 pyc 并补 gitignore `__pycache__/`、`*.pyc`）。
- 审查结论：**通过（0 Blocking）**。三项 R11 Blocking 的修复经本人独立复验成立；发现 1 个仅在未来 `--legs` 重跑路径上才会生效的工具缺陷（见 S-1，须在下次合并重跑前修复，不阻断本轮）。

## 独立复核（本轮实际执行）

- **R11-B1（reproduction.md）— 已关闭**。§3 已按现行装置重写：`--with-seconds`/`--cut-seconds` 默认 9.5/6.5（`--without-seconds` 仅以"旧名兼容别名"出现，reproduction.md:87）；payload REUSE 语义与 `payloadReused`/`payloadSha256`（:106，sha `b59e5ec5…` 与判据载荷同源）；§3.3 同流双录制器构造 + pair gate + 端段/EOF/配对判据 + RE-RECORD ≤2 次校准 + "run-03 车道首轮即通过，未消耗校准"；§1.1/§5 表已改指 `proof/E2E-16/manifest.json`（含内嵌 prefix-check JSON）为入库的 pair 清单副本。全文件 grep `reload|每段|without-seconds|crypto.randomBytes|40 \| 6`：唯一 reload 出现处（:72）即标注"已被 round-5 外审以像素实测否决……仅作历史记录，不得再引用"的历史否决句本身；`crypto.randomBytes` 仅出现在 REUSE 语境；默认值无 40/6 残留。
- **R11-B2（量测汇总）— 已关闭**。`summarize.py` 新增 `timings ?? saveTimings` 回退与 save_complete 派生（部分 mark → 派生 False，零 mark → None 显式 `-`，不造值）；本人以 HEAD 工具重生成 measurements.json/measurement-report.md，与提交版**逐字节一致**（同时证明 pyc 删除未影响工具行为）；21 腿 = 14 条含保存腿 + 7 条无保存腿（real-entry-cancel、empty/text/corrupt-import、v-short、v-last-without、live-n-20mib-over-budget）显式 `-`，无空值冒充分项；E2E-15 四条恢复腿携带完整分解（saveWait 4795/4541/6708/4159、saveWrite 112/96/96/97，decoderInit/sourceWait 等随 saveTimings 全对象一并呈现）；E2E-16 v-last-with 的 save timings 列现为 True（派生，未改 results.json）。stage5 §1/§3 已改为"14 含保存 / 7 显式标缺"并与报告逐字相符（仅"尺寸"一词仍覆盖 4 条不记录 sizes 的恢复腿，见 S-3）。
- **R11-B3（E2E-18 归属）— 已关闭**。stage5:139 披露段 + :162 E2E-18 行逐腿归属改写；本人以腿内原始 epoch 时点逐条换算**裁定 8/9 之争**：8 条矩阵含保存腿 saveRequestAt 为 06:19:28.484Z–06:59:52.276Z，全部落在 3e34f2 窗口（开始 06:19:09.133Z）内、d21d32 开始（07:11:31.385Z）之前——live-c-1mib 06:19:28.484、live-c-4mib 06:19:57.106、live-n-1mib 06:20:43.827、live-n-4mib 06:22:19.107、video-c-4mib 06:24:43.496、video-n-128kib 06:25:22.055、video-n-1mib-probe 06:32:35.047、video-n-4mib 06:59:52.276；预算腿 live-c-20mib-over-budget 07:11:59.143Z 在 d21d32 窗口内执行。**裁定：文档"8 条携带腿"正确；本人 R11 报告第 33 行"9 条含保存腿的 saveRequestAt 为 06:19:28Z–06:59:52Z"是 off-by-one**（第 9 条含保存腿恰是预算腿本身 07:11:59Z，不在该区间；正确表述为"9 条含保存腿中 8 条由 3e34f2 执行并被携带，预算腿在 d21d32 执行"）。R11 报告已随 ba6df6d 入库且该行含此错误数字；本轮只读、不改归档，编排方可决定是否附更正说明。

- **pyc 与门禁实跑（本人在 f6424c7 工作树）**：pyc 未跟踪、已忽略（gitignore 新增 `__pycache__/`、`*.pyc`）、无 tracked 残留；summarize 重生成与提交版逐字节一致（工具行为不受 pyc 删除影响）。
- **门禁实跑**：`node tools/desktop-recv/run-unit.mjs --all` exit0（9 套件 115 测试）；`python tools/desktop-recv/verify-evidence.py --gate local` exit0 PASS(20)；`--gate field` exit1（6 violations：E2E-21..26 缺记录，设计内正确拒绝）。
- **提交扫描（ba6df6d + f6424c7）**：summarize.py 回退+派生经重生成比对无造值；leg-timings.mjs 仅加准确注释（未改行为）；run-e2e.mjs 三处：删除死变量 `withoutBaseline`（R11 S-1 消除）、E2E-16 with 腿补 `saveTimingsComplete` 字段、merge 路径 stamp（有缺陷，见 S-1）；gitignore 补 Python 字节码；review-round-11.md 原样入库（与工作树逐行一致，含第 33 行错误数字）。
- **新问题扫描**：无产品源变更、无假绿路径、records/proof 未动；stage5/reproduction 句句可指到记录字段；未发现其他回归。

## Blocking issues

无。

## Suggestions

- S-1（须在下次 --legs 合并重跑前修复）：run-e2e.mjs:3008-3010 的 `executedInAttempt: leg.executedInAttempt || existing.attemptId || null` 会把携带腿标成**合并 attempt 自己的 id**：`writeAttemptMarker`（run-e2e.mjs:3847）在 scenario（:3854）之前就已把记录 attemptId 覆写为**新** attempt，故 merge 路径读到的 `existing.attemptId` 永远是发起合并的新 attempt，同时本轮新执行腿不写该字段——语义倒置。当前提交证据不含该字段、stage5 披露文字准确，不阻断本轮；但任何未来 `--legs` 重跑都会写入假归属字段，与 stage5 披露矛盾。
- S-2：stage5:139 "…3e34f2 已完成全矩阵（CASE E2E-18 PASS）"一句未标证词来源；建议补"（执行方车道现场观察、编排方可证）"式括注，或引 carried-legs 时点互证。
- S-3：stage5:16/:78 的"14 条含保存腿逐腿携带尺寸/…"中"尺寸"仍覆盖 4 条不记录 sizes 的 E2E-15 恢复腿（报告列为 `-`）；建议收窄为"含保存量测腿携带时间边界与保存分项（sizes 仅记录于容量腿）"。
- S-4：reproduction.md §3.2 已提交结果句"head bestOffset=0、bestMeanAbsDiff=0.000"与本轮（R11）独立重跑一致，但建议在句尾注明核对日期与复跑命令，便于 round-6 复核。

## 审查者

- 内部审查 Round 12（round-5 整改周期第 2 轮，单点复核），实施方独立复核者：Claude（review-11 agent，轮次接续），2026-10-22。只读复核对仓库的唯一写动作是本报告；未修改产品代码、证据或流水线状态。本轮实际执行：reproduction.md §3 全文重读与逐项 grep、summarize.py 修复逐行核验、measurements/report 由本人重生成并逐字节比对、21 腿 14/7 计数与逐腿分项值对照 results.json、E2E-18 全部 9 条含保存腿 epoch 逐条换算裁定 8/9 之争、executedInAttempt merge stamp 逐行追踪（writeAttemptMarker→scenario→merge 顺序推演）、pyc/gitignore 核查、四项门禁实跑。

# 外审交付包 — Round 12（receiver-ux-v2 迭代）

> 按 dev-pipeline 阶段 6 生成。外部审查者请只读本清单内材料；结论按
> `round-12-template.md` 的固定章节输出。编号公式：N = ext_rounds + 1；
> ext_rounds=11（保持 v1 迭代的历史轮次），故下一份 verdict 文件为 `round-12-verdict.md`。
> 本包是 receiver-ux-v2 迭代的首次外审——v1 迭代的最后一轮（round-11，PASS）
> 已随 1.0.0 交付关闭；本包不重开 v1 结论，只审查 v2 增量。

## 审查对象

| 项 | 值 |
|---|---|
| 仓库/分支 | libcimbar · `receiver-ux-v2` |
| 基线 | `master`（1.0.0 已交付）；v2 规划基线提交 `0ed2e5b`（pipeline-state `baseline_commit` = `9e4fbc4`，其后的 `0ed2e5b` 为本迭代规划材料入库） |
| 范围 | `master..d939584`：**52 个提交**，1286 文件，+188,063 / −352。产品面 `web/desktop-recv` 22 文件 +5,591/−75（版本 1.1.0）；工具面 `tools/desktop-recv` 22 文件 +9,980/−66；其余为 docs 规划、审查与运行证据 |
| 上一轮外审 | Round 11 **通过**（`round-11-verdict.md`，v1 迭代终审）——本迭代为 1.0.0 交付后的新需求（AC-015～024），不继承其覆盖范围 |
| 本轮前内部审查 | 全局轮号 round 15～20 共 6 轮（`review-tools/slice/metrics/media-save/ui-perf/final.md`），全部收口、**0 Blocking 残留**：tools 2B→整改关闭；slice PASS；metrics PASS；media-save PASS；ui-perf 2B→T30 整改 45/45 复验；final 1B（记录契约）→T33 整改后门禁仅剩 E2E-37 环境项 |
| 交付物 | 接收器中文体验迭代（AC-015～024）+ UX 证据门禁工具链 + 冻结 A/B 测量工具 |

## 材料清单

| 类别 | 路径 | 用途 |
|---|---|---|
| 变更集 | `git log --oneline master..d939584`、`git diff master..d939584` | 审查主体（52 提交） |
| 需求与验收 | `docs/requirements/receiver-ux-v2/`：`requirements-spec.md`（AC-015～024）、`decision-log.md`（UX-D-001～010）、`user-feedback.md` | 需求来源与决策记录 |
| 设计契约 | `docs/design-catalog/receiver-ux-v2/`：`architecture.md`、`ui-spec.md`、`module-contract-error-matrix.md`、`contracts/{ux-telemetry.schema.json(20 $defs), ux-display-config.json(12×250ms 桶), ux-diagnostics.json(19001-19015), examples.json, validation-vectors.json, check-contracts.py}` | 冻结内部契约；`check-contracts.py` 为机器门禁（实现期 12 类 NOT_RUN 已随 T1-T35 转实跑） |
| 实施计划 | `docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`（36 任务/35 批次）、`performance-method.json`（**冻结**：128KiB 样本、AB/BA×5、readyMs ≤ B×1.10+250ms、RTT p50/p95 判据） | 计划符合性；冻结方法自引入提交 `0ed2e5b` 起**零改动**（可 `git diff 0ed2e5b..HEAD -- docs/plans/receiver-ux-v2/performance-method.json` 验证为空） |
| 测试方案 | `docs/tests/receiver-ux-v2/`：`test-plan.md`、`test-cases.md`、`acceptance-tests.md`、`e2e-user-journey-plan.md`、`planning-cases.json`（39 场景：32 本地+7 现场）、`coverage-map-e2e.json`、`cases/e2e18-matrix.json` | 测试纪律与逐场景状态 |
| 内部审查报告 | `docs/dev-pipeline/receiver-ux-v2/review-{tools,slice,metrics,media-save,ui-perf,final}.md`（均含整改/收口节） | 全部已知问题与关闭证据 |
| 执行记录 | `docs/dev-pipeline/receiver-ux-v2/exec-log.md`（批次起止/提交哈希）、`tdd-ledger.json`（10 条 T1-T7 红绿 + coverageNote 指明 T8-T35 证据位置）、`b1-t1 … b10-t36` 批报告、`red-logs/` | 过程可追溯 |
| 证据根（最终候选） | `docs/tests/runs/20261025-teamexec-09b/`：`results.json`（legacy 20/20 PASS）、`ux-results.json`（UX 12 条 = 11 PASS + E2E-37 NOT_RUN）、`proof/`（逐案逐 attempt）、`measurements/ux-overhead/candidate-20261025-04/`（录制 A/B + 实时腿，含 attempt-03 失败原件）、`reproduction.md`、`release-candidate-manifest.json`（27 产品文件逐文件 SHA） | 本轮完成主张的主证据 |
| 历史证据（只读） | `docs/tests/runs/20261018-teamexec-01`、`…-02`、`…-03`、`20261024-teamexec-04`（基线）、`…-06`（切片）、`…-07`（IAT）、`…-08`（媒体） | 旧迭代/中间批；760 项 SHA 指纹历次 UNCHANGED（`red-logs/t31c/t33/t35-oldruns-after.sha`） |
| 现场套件 | `docs/tests/` 现场手册与接收回执（E2E-21～26/39 待用户现场执行） | 现场阶段分列 |
| 技债/决策 | `docs/dev-pipeline/tech-debt.md`、`docs/dev-pipeline/autonomous-decisions.md` | 显式延期项与自主决策 |


## 验收映射（AC-015～024 → 证据）

| AC | 摘要 | 主要证据（均可复核） |
|---|---|---|
| AC-015 | 已选源无有效码：明确等待有效数据，不虚报文件进展 | E2E-35（前台空白源：revision 恒定、用时递增、≥5s 提示）、E2E-29（空白 ≥8s：速率 ≤3s(+1s) 归零、陈旧提示、同会话恢复）；09b/ux-results.json + proof |
| AC-016 | 单流可判定：估计随真实 report 变化、重复不虚增、异常/多流不冒认 | 单元 22 例（UX-UT-017..033 等）固化冻结窗口数学与 19001-19006/19010/19015 语义；E2E-28（重复码：速率活跃但估计固定 9-10%、无假 Ready）；IAT-01/02（真实 WASM report + 所有权） |
| AC-017 | 「识别速率（含冗余）」单位与含义明确；无新结果不虚显旧速率 | 单元 UX-UT-034/041..047（窗口边界 999.9/1000/2999.9/3000ms）；E2E-29 归零断言；中文标签「KiB/s（含冗余）」在 E2E-31 断言 |
| AC-018 | 单会话内时长/等待反馈按周期更新；首等与暂停可分；阈值不触发自动失败/重启 | UX-UT-039/040/045（12×250ms 桶、时钟回退 19009、空闲继续）；E2E-35（时钟跨窗增长、停止冻结）；E2E-28（8s 无推进提示 + 会话不重置） |
| AC-019 | 录像导入位置≠文件完成比例；到尾未重建不显示成功 | E2E-30（录像位置 1.1s/12% 分列）、E2E-32（without → 真实 EOF → Incomplete，saveDisabled 无产物）、E2E-36 录像腿；单元 UX-UT-019/036（mediaPosition 独立矩阵） |
| AC-020 | 完成与写盘分相：严格完成后才可保存；write+close 成功才「已保存」；取消/失败可重试 | E2E-33（真实取消 4944ms → 可重试 → 新路径 SHA 相等）、E2E-34（FileShare.None 独占哨兵 → 失败 → 解锁恢复）；单元 session 40 例（四时点/16005/16006/16008 归一） |
| AC-021 | 停止/晚回调/新会话/双入口切换：新会话清零、旧进度不串入、按钮互锁不变 | UX-UT-012..016（跨 stop 迟到回执零污染）、UX-UT-014 强化（未决 Promise 跨会话）；E2E-30 双向 live→video 计时清零；E2E-36 键盘全链互锁 |
| AC-022 | 中文主操作区：无需英文日志即可判断状态与下一步；文字/键盘/AT 反馈 | 单元 ui 13 例（双入口中文/id 不变/无 innerHTML/焦点结构）+ ux-view 17 例（23 statusKey 无数字矩阵）；E2E-36 四视口+200% DPR、44px、长中文名换行、Tab/Enter 全链、取消后焦点回 btn-save；**AT 语音腿 E2E-37 如实 NOT_RUN**（真实 Narrator 启动尝试 5s 后停，语音不可程序化核验；DOM/aria 检查不替代） |
| AC-023 | 遥测不新增并发/积帧；遥测错误不阻断接收；开销按冻结方法实测 | 单元 worker 14 例 + client 15 例（单在途、pending 清理）；IAT-01（4 类 report 故障注入：结算字节不变仅报告降级）；测量：录制 A/B 5/5 对 PASS（readyMs 15852 vs 限 18259、p50 63.8/72.6、p95 102.1/112.93）、实时 5×30s 10/10 侧别 VALID（maxInFlight=1、遥测写间隔 ≥250ms、停止时钟冻结），`measurements/ux-overhead/candidate-20261025-04/` |
| AC-024 | 整改后构建按真实旅程验收：外部 SHA 相等、体验提示与同运行观测相符；本地与现场分列 | legacy E2E-1..20 全 PASS（09b/results.json，含 E2E-16/17 同流配对、E2E-18 十腿 9 PASS+1 D-19 NOT_RUN）；UX 12 条（11 PASS+37 NOT_RUN）；保存 SHA 均 certutil/外部计算相等；现场 7 项分列 NOT_RUN |

## 关键主张与对应证据

| 主张 | 证据 |
|---|---|
| 双输入、单会话、单在途、严格 EOF、保存重试等 v1 业务语义**未改变** | `verify-evidence.py --gate local` 20/20 PASS；v1 契约文件 SHA 未变（`receiver-v1.schema.json` B2996C84、`error-codes.json` 5A93BF22）；save/session/worker 旧用例保留且全绿 |
| 遥测为旁路：190xx 永不进入 v1 Error 码与 worker frame_error | `check-contracts.py`（20 defs/44 vectors/v1 隔离 1正3负）；IAT-01 故障注入下 frame outcome/字节不变；worker 错误帧不带 observation（单元钉） |
| 冻结性能方法未被修改 | `performance-method.json` 自 `0ed2e5b` 零改动；measure-ux 内嵌方法逐字段绑定，方法被编辑即拒绝运行 |
| 进度/速率/时长不虚报 | 冻结窗口数学三方向独立复现（实现/测试/审查者探针）；E2E-28/29 实测；进度估计 floor 至 99% 永不假 100%（UX-UT-054..061） |
| 每次保存可外部复算 | E2E 保存腿四时点（saveRequestAt≤createWritableAccessedAt≤writableAt≤writeCloseAt）+ 外部 SHA 相等；`release-candidate-manifest.json` 27 文件逐文件 SHA 与 product-manifest 一致 |
| 构建身份可复核 | 产品 manifest `9e2595e6…`（含焦点修复 c0d566f）；09b 根 `run-context.json`（attempt candidate-20261025-04）；`iat-results.json`；09b staging 与源树 18/18 文件 SHA 一致（b10-t34 报告） |
| 旧证据零污染 | 760 项 SHA+size 指纹三批留档（t31c/t33/t35-oldruns-after.sha）逐行一致；旧 run git 零改动 |


## 门禁与复跑命令（建议外审独立复跑）

```powershell
# 1) legacy v1 门禁（期望 exit 0）
python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261025-teamexec-09b --gate local

# 2) UX 门禁（期望 exit 1，且违规恰为 E2E-37 环境两项——见下「诚实性边界」）
python tools/desktop-recv/verify-ux-evidence.py --context docs/tests/runs/20261025-teamexec-09b/run-context.json --gate local

# 3) field 门禁（期望 exit 1：现场 7 项未执行，非零为设计内）
python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261025-teamexec-09b --gate field

# 4) 单元/工具/契约/自测（全部期望 exit 0）
node tools/desktop-recv/run-unit.mjs --all
node --test tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/process-guard.test.mjs tools/desktop-recv/tests/measure-ux.test.mjs
python tools/desktop-recv/tests/ux-evidence-selftest.py
python tools/desktop-recv/verify-evidence-selftest.py
python tools/desktop-recv/e2e/video-prefix-check.py --selftest
python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py
```

逐旅程复现见 `docs/tests/runs/20261025-teamexec-09b/reproduction.md`；A/B 与实时腿命令同文件。

## 诚实性边界（本迭代已知且如实披露）

1. **现场 7 项 NOT_RUN**：E2E-21～26、E2E-39 需用户在真实云桌面/真实辅助技术环境执行；代理会话不代跑、不伪造。planning-cases.json 对应 7 行保持 NOT_RUN（无 attemptId）。
2. **E2E-37（辅助技术语音）NOT_RUN**：真实启动 Narrator（pid 存活 5s 后停止）属真实尝试，但本环境无法程序化核验真实语音输出；DOM/aria 断言不替代语音核验。UX 门禁的 2 条违规即此案（要求 PASS / executedBy），属环境缺口而非记录缺陷——格式类违规已于 T33+T35 全部清零。
3. **UX-IAT-08 占位 NOT_RUN**：runner 组 08 适配器为 T28 交付前占位；其实质（measure-ux 工具本体）已由 09b attempt-04 的真实录制 A/B（5/5）与实时 5×30s 腿（10/10）实跑覆盖。占位记录如实保留、未改写为 PASS。
4. **进度估计为“约 N%”**：冻结契约要求估计值向下取整且在 stale 时标「上次估计」，永不显示 100%（完成只由 Ready 状态与可保存性表达）。
5. **跨构建绑定已收口**：R-12 曾在 06/08/09b 三个构建间绑定，T35 全组在 09b 终构建重跑后 runtime-case-map 全部重指向最终 attempt；R-05（性能开销）无 e2e 绑定，由冻结方法测量证据承担（如实为空绑定）。

## 与上一轮（v1）的关系

- v1 的 round-11 PASS 与 1.0.0 交付结论保持不变，本包不重开；
- 本迭代产品面 +5,591/−75 全部在 `web/desktop-recv`，均为叠加式改造（index/styles/src 新模块 + 三处接线），v1 契约文件与业务状态机零语义改动（旧 20 旅程 + 旧单元用例继续全绿）；
- 若外审需要，可对照 `round-10-package.md` 的 v1 材料清单定位历史证据。

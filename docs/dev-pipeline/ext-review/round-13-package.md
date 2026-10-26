# 外审交付包 — Round 13（receiver-ux-v2 迭代 · round-12 整改后复审）

> 按 dev-pipeline 阶段 6 生成。外部审查者请只读本清单内材料；结论按
> `round-13-template.md` 的固定章节输出。编号公式：N = ext_rounds + 1；
> ext_rounds=12（round-12 verdict 已入账），故 verdict 文件为 `round-13-verdict.md`。
>
> 本包是 **round-12 不通过（5 阻断主题）的整改复审**：不重开 v1 round-11 结论，只审
> round-12 verdict 的逐项关闭证据与整改轮新产出的最终候选证据。

## 审查对象

| 项 | 值 |
|---|---|
| 仓库/分支 | libcimbar · `receiver-ux-v2` |
| 最终候选 | 运行根 `docs/tests/runs/20261026-teamexec-11`；product manifest **34a9de30…**（27 文件）；attempt `candidate-20261026-01`；input manifest **cc07412f…**（live=4MiB `6181826a…`）；context harnessRevision `5381d35` |
| 产品源码提交 | `00c5d57`（相对 09b 仅 asset-set/ux-view/ux-display 三处变化） |
| 范围 | round-12 裁决之后的整改提交链 + root11 全部运行证据（root10 为中间失败构建，只读保留） |
| 上一轮外审 | Round 12 **不通过**（`round-12-verdict.md`，5 阻断主题 A-R1/A-R2=B-01/A-R3/A-R4=B-03/B-02 + 建议 S1/S2） |
| 整改轮内部审查 | lead 逐批验收（每个修复批次：RED→GREEN 证据、独立复跑、diff 审阅、语义校验）；无新增 Blocking 残留 |

## round-12 阻断主题 → 关闭证据（逐项）

| 主题 | 整改提交 | 关闭证据（root11 上可复核） |
|---|---|---|
| **A-R1** 当前 report 失效后仍冒认旧百分比 | `d22682e` | `ux-view.js`：`lastDataAtMs>trustedAtMs`⇒`unavailable`（隐藏百分比、标降级码、statusKey=progress_unavailable），模型/schema 零改动、19006 回退锁保留；UX-UT-023 重写为模型→视图断言 + 6 条新回归（`.6→empty→.7 恢复`、`.6→empty→.5 锁`等）；**root11 E2E-36 Ready 截图实证**：指标区=「重建完成/26.8s」，无旧百分比/旧速率（对照 round-12 裁决引用的旧截图） |
| **A-R2=B-01** 缓存提前提交/终态不收敛/lastBusiness 不提交 | `d22682e` + `00c5d57` | 缓存只记已成功绘制值、gate 丢弃不丢最新投影、paint 失败重试、lastBusiness 提交语义；**Option B**：终态收敛写等待共享 250ms 边界（≤250ms 后绘制并释放 timer，双冻结义务同时满足）；root11 A/B **B 侧 min gap 250.2–250.3ms** 且收敛投影完整；UX-IAT-04-A5 真实页面 GREEN（gap 255.9ms、收敛后 700ms 零写入）；`r12-prod-report*.md`、`r12-a-r2b/` RED/GREEN 日志 |
| **A-R3** 实时腿非 30s Receiving 却 VALID | `5935079`+`5381d35` | judgeLiveSide：全采样 `Receiving`+session 恒定+窗口 ≥30000ms+窗口内真实结算；提前 Ready 即停不补睡、如实记样本不足；live 输入 manifest 绑定（path+SHA）+双侧重哈希，基线侧 basename 推断只读；**root11 实时 10/10 VALID，windowObservedMs 30127–30181ms**，4MiB 全程 Receiving；既有 10 份反例形状的拒绝回归（measure-ux.test.mjs）；观测抖动 **1ms 容差仅限 live judge**（249.9 过/240 拒/judgeRound 严格 250，测试钉住） |
| **A-R4=B-03** E2E-35 替代断言仍记 PASS | `9cfc9cc`+`21f5a65` | 三装置探针（Playwright 去默认参数+CDP 最小化 / 原生 msedge+CDP / **同窗真实标签切换 7s**）证实本机（云桌面远程会话）Page Visibility 惰性（`probe2-*.txt`）；**用户 2026-10-26 裁定**（"真实云桌面远程会话不需要你测试"，pipeline-state team-exec user_instructions 在案）：真实行为由用户侧真实验证；整例如实 **NOT_RUN**（notes 三点、探针日志副本入 attempt、executedBy=null、无 PASS 断言），冻结用例文本未修订、无替代计分 |
| **B-02** UX 总门禁弱验证 | `5935079` | ①file_roundtrip 磁盘重算后**比较原/收 SHA 相等**；②必测步骤精确覆盖（规范 id `caseId-S<n>[-A-Z]`，未知/替换 id 拒绝，NOT_RUN 不得带 PASS 断言）；③measurement 经 `measure-ux-calc.mjs --recompute` 从**原始 rounds+live** 复算三公式与硬不变式（篡改 summary/缺对/缺 raw/提前 Ready 非零）；自测 55→65（**裁决三负例转正** + 覆盖负例 + 测量负例；正例仍过）；root11 UX 门禁输出恰 4 条授权缺口、measurement 复算在门禁内通过 |
| S1 | `5935079` | UX-IAT-08 原因如实更新（测量器已交付，义务由同构建 A/B+实时腿证据承担；保持 NOT_RUN） |
| S2 | `5935079` | measure-ux 拆分纯计算/校验 `measure-ux-calc.mjs`（门禁复用同一计算器） |

## 材料清单

| 类别 | 路径 | 用途 |
|---|---|---|
| 裁决与台账 | `docs/dev-pipeline/ext-review/round-12-verdict.md`（5 主题原文）、`docs/dev-pipeline/receiver-ux-v2/r12-remediation.md`（逐项 CLOSED 登记） | 整改义务与关闭状态 |
| 整改提交链 | `dc94f92`（裁决归档）→`d22682e`（A-R1/A-R2 产品）→`5935079`/`8a778b3`/`21f5a65`（A-R3/B-02/S1/S2/A-R4 如实 NOT_RUN）→`9cfc9cc`（E2E-35 用户裁定入账）→`a24be4e`/`1ceb5b1`/`a49f9e7`/`68715eb`（执行中发现的三处过期装置/真 bug）→`00c5d57`（Option B 终态等边界）→`dd20c21`+`5381d35`（live 取证与观测容差）→本包所在提交 | 审查主体 |
| 整改报告 | `r12-prod-report.md`、`r12-prod-report-r2b.md`（§1-5）、`r12-tools-report.md`（§1-12：S03 riding-the-fixed-bug 证据链、A/B 不变式冲突、OBSERVER import 缺陷、1ms 容差机制与硬约束、失败原件清单） | 每项修复的 RED/GREEN 与判断记录 |
| RED/GREEN 证据 | `red-logs/r12-a-r1/`、`r12-a-r2/`、`r12-a-r2b/`、`r12-tools/`（含 `probe2-*.txt` 三装置探针、`gate-09b-*` 旧门禁负例、`red-iat-04-a5.txt`） | 修复前失败/修复后通过的真实 TAP 输出 |
| 最终候选证据根 | `docs/tests/runs/20261026-teamexec-11/`：`reproduction.md`、`release-candidate-manifest.json`、`results.json`（legacy 20/20）、`ux-results.json`（12 条=10 PASS+35/37 NOT_RUN）、`iat-results.json`（01-07+A5，08 NOT_RUN）、`proof/`（逐案逐 attempt）、`measurements/ux-overhead/candidate-20261026-01/`（录制 A/B 5/5 对 + live 10/10 + `live-failed-run-1/` 中止轮原件+README）、`logs/`（逐案 exit 行）、`product-manifest.json`、`input-manifest.json`、`fixtures-provenance-r12.json` | 最终完成主张的主证据 |
| 中间失败构建 | `docs/tests/runs/20261026-teamexec-10/`（product 74ca75f8…）：legacy/UX 记录 + A/B attempt -01（OBSERVER import 缺陷）/ -02（终态写越界不变式 FAIL）原件 | 诚实披露：整改途中先失败后修复的完整链 |
| 冻结/契约 | `docs/plans/receiver-ux-v2/performance-method.json`（**自 0ed2e5b 零改动**，`git diff 0ed2e5b..HEAD --` 为空）；v1 契约 SHA B2996C84/5A93BF22 不变；v2 契约未改（A-R1 修复无 schema 变更） | 冻结件合规 |
| 计划与用例 | `docs/plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md`、`docs/tests/receiver-ux-v2/`（planning-cases.json/cases/*.json 已回填 root11 状态，场景定义零改动——语义校验在案） | 计划符合性 |
| 总结 | `docs/dev-pipeline/receiver-ux-v2/stage5-dev-summary.md` **第 7 节**（整改轮测试总账、双门禁原文、诚实披露 5 条）；根索引 v2 部分（v1 原文逐字节保留） | 阶段 5 出口状态 |

## 门禁与复跑命令（建议外审独立复跑）

```powershell
# 1) 单元/工具/自测/契约（全部期望 exit 0）
node tools/desktop-recv/run-unit.mjs --all                       # 12 套 216 例
node --test tools/desktop-recv/tests/measure-ux.test.mjs tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/process-guard.test.mjs   # 67 例
python tools/desktop-recv/tests/ux-evidence-selftest.py          # 65/65（含裁决三负例）
python tools/desktop-recv/verify-evidence-selftest.py            # 14/14
python tools/desktop-recv/e2e/video-prefix-check.py --selftest   # 3/3
python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py

# 2) 双门禁（root11）
python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261026-teamexec-11 --gate local --planning docs/tests/receiver-ux-v2/planning-cases.json
# 期望：GATE local: PASS (20 required cases)，exit 0
python tools/desktop-recv/verify-ux-evidence.py --context docs/tests/runs/20261026-teamexec-11/run-context.json --gate local
# 期望：exit 1，恰 4 条 = E2E-35×2 + E2E-37×2（均为用户授权缺口；measurement 复算在门禁内通过）
python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261026-teamexec-11 --gate field --planning docs/tests/receiver-ux-v2/planning-cases.json
# 期望：exit 1（现场 E2E-21..26/39 未执行，设计内）

# 3) 独立复算测量（不经结果文件）
node tools/desktop-recv/e2e/measure-ux-calc.mjs --recompute docs/tests/runs/20261026-teamexec-11 docs/tests/runs/20261026-teamexec-11/measurements/ux-overhead/candidate-20261026-01 --method docs/plans/receiver-ux-v2/performance-method.json
# 期望 ok:true；三公式与 summary 逐数字一致；live 10 侧窗口 ≥30000

# 4) 冻结件
git diff 0ed2e5b..HEAD -- docs/plans/receiver-ux-v2/performance-method.json   # 期望为空
```

逐旅程复现见 root11 `reproduction.md`（含 Option B 收敛时序等 8 条实测陷阱）。

## 关键主张与对应证据

| 主张 | 证据 |
|---|---|
| 5 个 round-12 阻断主题全部关闭，且没有"改记录文字绕门禁" | 上表逐项：产品提交 + 真实 E2E/测量证据 + 门禁输出；旧 root10 失败原件保留 |
| 旧"绿灯"不复制：三处"骑着被修复缺陷通过"的断言已根治 | ① E2E-27-S03：旧通过靠 Ready 后陈旧速率（09b 记录 rate=40.8 KiB/s 在 Ready），新实现按真实 Receiving 采样；② A/B 250ms 不变式：旧通过靠未收敛（root10 attempt -02 FAIL 即证据），Option B 后 min gap 250.2+；③ IAT-04 装置假设（revision-only bump 不再重绘=修复的正确语义） |
| 冻结性能方法与阈值零改动 | `git diff 0ed2e5b..HEAD -- performance-method.json` 为空；A/B 三公式在 root11 全部过（15060/17528.8、60/65.56、81.3/98.09） |
| 遥测永远旁路 | v1 契约 SHA 未变；IAT 01-07 含故障注入（结算字节不变仅报告降级） |
| 现场义务未被吞掉 | E2E-21..26/39 NOT_RUN（field 门禁非零）；E2E-35 用户授权 NOT_RUN；E2E-37 环境 NOT_RUN——三者均保持可见，不伪造 PASS |

## 诚实性边界（本迭代已知且如实披露）

1. **现场 7 项 NOT_RUN**（E2E-21..26/39）：用户侧执行，field 门禁非零属设计内。
2. **E2E-35 如实 NOT_RUN**：S02 真实 visibility 在本机（云桌面远程会话）不可构造（三装置探针证据入库）；**用户 2026-10-26 明确裁定**真实远程会话行为由用户侧真实验证——整例 NOT_RUN，冻结用例未修订、无替代计分、探针日志随 attempt 保存。
3. **E2E-37 语音 NOT_RUN**：环境不可程序化核验。
4. **live 观测 1ms 容差**：只作用于 observer 观测通道（产品写门/冻结阈值/方法文件未动；249.9 过/240 拒/recorded 严格 250 有测试；机制见 r12-tools-report §12.1）。
5. **root10 为中间失败构建**（74ca75f8…）：A/B -01（OBSERVER_SCRIPT import 缺陷，S2 拆分引入并已修）与 -02（终态写越界，Option B 已修）原件保留，round13 不以其为最终主张。
6. **owner 切换重置 lastTelemetryWriteAt**（既有语义保留，真实流程不可能在终态写后 250ms 内发生；如需全局严格解释为单独决策项）。

## 与上一轮（round-12）的关系

- round-12 的 5 阻断主题为本次唯一审查对象；v1 round-11 通过结论与 1.0.0 交付不重开。
- 本包所有完成主张以 root11（34a9de30…）为准；09b（9e2595e6…）与 root10（74ca75f8…）只读保留为历史/中间证据。

# 阶段 5（team-exec）开发总结

来源：各批实施报告（b1-t1 … b10-t36，见第 1 节）与 09b 证据根（results.json / ux-results.json / measurements）
日期：2026-10-25　分支 receiver-ux-v2　基线提交 9e4fbc4（v1 1.0.0 之后）；最终 HEAD 5f2aa89
运行根：09b（docs/tests/runs/20261025-teamexec-09b，最终候选，product manifest 9e2595e6…，attempt candidate-20261025-04）
边界备注：本文件与 runtime-case-map.json、planning-cases.json 的最终回填一致；tdd-ledger 合并由 lead 负责（本车道不写 tdd-ledger*.json）。
整改轮更新（2026-10-26）：round-12 外审（不通过，5 阻断主题）整改完成后，最终候选已迁移至 **root11**（docs/tests/runs/20261026-teamexec-11，product manifest 34a9de30…，attempt candidate-20261026-01），最终 HEAD 5381d35。第 1-6 节如实保留 09b 时代的阶段 5 收口记录（其证据根现为中间产物），第 7 节为整改轮更新与最终门禁。

## 1. 实施范围（36 任务全景，引用各批报告）

| 批 | 任务 | 通道 | 报告 |
|---|---|---|---|
| B1 | T1-T6 | tools（T4 为审查收口） | b1-t1/t2/t3/t5/t6-report.md（+b1-t1 等 RED 证据 red-logs/） |
| B2 | T7-T12 | prod+tools 混合 | b2-t7..t12-report.md |
| B3 | T13 | tools | b3-t13-report.md |
| B6 | T14-T19 | prod+tools | b6-t14..t19-report.md |
| B7 | T20-T25 | prod+tools | b7-t20..t25-report.md |
| B8 | T26-T31 | prod+tools（含 T31b/T31c） | b8-t26..t31c-report.md |
| B10 | T33-T35(+T36 本总结) | tools | b8-t33-report.md、b10-t34/t35-report.md |

任务台账与逐任务证据见 tdd-ledger.json（lead 合并）；每任务的 RED→GREEN、审查整改与实跑命令在其批报告中。

## 2. 审查与整改轮（6 次，0 Blocking 残留）

| 轮 | 审查文件 | 结论 → 整改收口 |
|---|---|---|
| round 15 | review-tools.md | 2 Blocking（启动期按进程名/端口杀进程；README 冻结历史 smoke 指示）→ T5 整改（process-guard pids+命令行标记回收、busy 端口显式拒绝；README 改绑定候选 context）→ review-tools.md 整改节 |
| round 16 | review-slice.md | PASS，0 Blocking（第一切片旅程+真实保存闭环） |
| round 17 | review-metrics.md | PASS，0 Blocking（4 Suggestion 后续吸收） |
| round 18 | review-media-save.md | PASS，0 Blocking（S1 IAT 接线缺陷由 T25 期修复并复验） |
| round 19 | review-ui-perf.md | Blocking 2（B1 采样下限/时域，B2 观察器身份偏置）→ T30 工具侧整改 + 45/45 复验收口（review-ui-perf.md 收口（T33）节） |
| round 20（final） | review-final.md | Blocking 1（记录契约）→ T33 整改后最终门禁仅剩 E2E-37 环境项 ×2（见第 4 节） |

6 份审查文件的收口节/verify 输出均以其文件为准；round 计数器 6 次全部收口，0 Blocking 残留。

## 3. 测试总账

- **单元/工具**：`run-unit --all` 12 套 202 例（contracts 7、session 40、scheduler 6、worker 14、client 15、save 8、video 17、ui 13、evidence 36、ux-telemetry 22、ux-view 17、ux-display 7）exit 0；tools 专项 3 文件 61 例 exit 0。
- **自测**：verify-evidence-selftest 14/14；ux-evidence-selftest 55/55；video-prefix-check --selftest 3/3。
- **IAT**：UX-IAT-01..07 PASS（09b attempt 21ac1a）；UX-IAT-08 如实 NOT_RUN（T34 裁定：实质由 09b attempt-04 真实 A/B+5×30s 实时腿覆盖，占位保持 NOT_RUN）。
- **E2E（本地）**：32 项本地 = legacy E2E-1..20 全 PASS（09b/results.json，各案独立 attempt）+ UX E2E-27..38 共 12 条记录 = 11 PASS + E2E-37 如实 NOT_RUN。
- **测量（冻结方法 recipe F）**：录制 A/B 5/5 对 PASS（readyMs/RTT p50/p95 三阈值全过，余量文档在 b8-t31c-report.md）；实时 5×30s 腿 10/10 侧别 VALID（maxInFlight=1、遥测写间隔 ≥250ms、停止时钟冻结）；attempt-03 失败原件保留。

## 4. 双门禁实跑输出（原文）

Legacy（v1 出口）：

```
> python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261025-teamexec-09b --gate local --planning docs/tests/receiver-ux-v2/planning-cases.json
GATE local: PASS (20 required cases)
```

UX（配方 A 出口）：

```
> python tools/desktop-recv/verify-ux-evidence.py --context docs/tests/runs/20261025-teamexec-09b/run-context.json --gate local
UX GATE local: FAIL (2 violation(s))
  - E2E-37: the local gate requires result PASS (got 'NOT_RUN')
  - E2E-37: executedBy must be executor per the plan (got None)
```

UX 门禁 exit 1 的 2 条均为 E2E-37 环境缺口（语音核验无法程序化替代，属现场批次）；其余全部格式违规在 T33+T35 清零，20 required legacy 全 PASS。

## 5. 现场 7 项 NOT_RUN 声明

E2E-21..26 与 E2E-39（real_cloud/field 门）按冻结计划由用户现场执行（真实云桌面场景、真实 Narrator 使用等），代理会话无法核验真人感知效果与真实语音输出，按纪律保持 NOT_RUN，未占位、未伪造。planning-cases.json 中这 7 行未回填（保持 NOT_RUN/null/无 attemptId）。

## 6. 遗留（不属本阶段收口范围）

- E2E-37 两条 UX 门禁违规：需真实用户（现场批次）执行后消除。
- 现场批次 E2E-21..26/39 待用户执行。
- UX-IAT-08 占位 NOT_RUN（实质覆盖已达成，占位记录如实保留）。

## 7. Round-12 外审整改轮更新（2026-10-26）

### 7.1 阻断主题与关闭证据（逐项，verdict 原文为 DoD）

| 主题 | 关闭证据 |
|---|---|
| A-R1 报告降级仍冒认旧百分比 | `d22682e`（视图推导 `lastDataAtMs>trustedAtMs`→unavailable/progress_unavailable，无 schema 改动；UX-UT-023 重写为模型→视图断言）；root11 E2E-36 Ready 截图实证：指标区=「重建完成/26.8s」，无旧百分比/旧速率 |
| A-R2=B-01 显示缓存/终态/重复写 | `d22682e` + `00c5d57`（Option B：终态收敛写等共享 250ms 边界）；root11 A/B B 侧 min gap 250.2-250.3ms 且收敛投影完整；UX-IAT-04-A5 真实页面 GREEN（gap=255.9ms、收敛后 700ms 零写入） |
| A-R3 实时腿非 30s Receiving | `5935079`+`5381d35`；root11 实时 10/10 VALID，windowObservedMs 30127-30181ms，4MiB 样本全程 Receiving，窗口内结算，提前 Ready 即停不补睡；观测抖动 1ms 容差仅限 live judge（249.9 过/240 拒，recorded 与 judgeRound 严格 250），机制与约束见 r12-tools-report §12 |
| A-R4=B-03 E2E-35 假 PASS | `9cfc9cc`+`21f5a65`：三装置探针（含同窗真实标签切换 7s）证实本机（云桌面远程会话）Page Visibility 惰性；按用户 2026-10-26 裁定（真实远程会话行为由用户侧真实验证）整例如实 NOT_RUN，探针日志副本入 attempt，notes 三点齐全，不修订冻结用例 |
| B-02 门禁弱验证 | `5935079`：原/收 SHA 相等、必测步骤精确覆盖（非规范 id 拒绝）、measurement 经 measure-ux-calc --recompute 复算（含篡改/缺对/提前 Ready 拒绝）；自测 55→65 含裁决三负例转正 |
| S1/S2 | `5935079`：IAT-08 原因如实（保持 NOT_RUN）；measure-ux 拆分纯计算模块供门禁复用 |

### 7.2 最终候选与测试总账（root11）

- 运行根：`docs/tests/runs/20261026-teamexec-11`（release-candidate-manifest.json 为机器可读清单）；product manifest **34a9de30…**（27 文件；相对 09b 仅 asset-set/ux-view/ux-display 变化）；input manifest **cc07412f…**（live=4MiB 6181826a…，基线侧同 SHA 命中 run-04 只读文件）；context harnessRevision 5381d35。
- 单元/工具：`run-unit --all` 12 套 **216 例**；tools 3 文件 **67 例**；自测 **65/14/3**；check-contracts PASS（20/27/44/6/15）。
- IAT：UX-IAT-01..07 PASS + **04-A5（终态等边界）GREEN**；08 如实 NOT_RUN（原因已更新为"测量器已交付，义务由同构建 A/B+实时腿证据承担"）。
- 本地 E2E：legacy **20/20 PASS**（5 次瞬态首败重试过、原件保留；E2E-18 十腿 9 PASS+D-19 NOT_RUN）；UX 12 条 = **10 PASS（27/28/29/30/31/32/33/34/36/38）+ 2 如实 NOT_RUN（35/37）**。
- 测量（冻结方法，零改动）：录制 A/B **5/5 对 PASS**（readyMs 15060/限 17528.8、p50 60/65.56、p95 81.3/98.09）；实时 **10/10 侧 VALID**（窗口 30127-30181ms）；中止轮的 5 份 raw 于 `live-failed-run-1/`（README 记三原因）。
- 旧证据保全：09b（前候选）与 root10（中间构建 74ca75f8…，含 A/B attempt -01/-02 失败原件）均只读保留，round-13 如实披露。

### 7.3 最终双门禁（lead 独立复跑原文）

```
> python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261026-teamexec-11 --gate local --planning docs/tests/receiver-ux-v2/planning-cases.json
GATE local: PASS (20 required cases)

> python tools/desktop-recv/verify-ux-evidence.py --context docs/tests/runs/20261026-teamexec-11/run-context.json --gate local
UX GATE local: FAIL (4 violation(s))
  - E2E-35: the local gate requires result PASS (got 'NOT_RUN')
  - E2E-35: executedBy must be executor per the plan (got None)
  - E2E-37: the local gate requires result PASS (got 'NOT_RUN')
  - E2E-37: executedBy must be executor per the plan (got None)

> python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261026-teamexec-11 --gate field --planning docs/tests/receiver-ux-v2/planning-cases.json
# exit 1（现场 E2E-21..26/39 未执行，设计内）
```

UX 门禁 4 条 = E2E-35（用户授权缺口：本机不可构造真实 visibility，用户裁定由其实环境验证）+ E2E-37（环境缺口：语音不可程序化核验）。冻结方法 diff 0ed2e5b 为空；v1 契约 SHA B2996C84/5A93BF22 不变；09b/root10 零改动。

### 7.4 诚实披露

1. 旧"31 本地 PASS / 10/10 live VALID"主张基于 root10/09b 时代的实现，其中 E2E-27-S03 与 A/B min-gap 断言曾"骑着被修复的缺陷通过"（S03 靠 Ready 后陈旧速率；不变式靠未收敛），整改轮已分别以真实 Receiving 采样与 Option B 产品修复消除，证据链见 r12-tools-report §11。
2. E2E-35 为**用户明确授权**的如实 NOT_RUN（2026-10-26 指示原话："真实云桌面远程会话不需要你测试"），非伪造 PASS、非范围删除——冻结用例文本未动。
3. live 观测间隔含 1ms 观测抖动容差（只作用于 observer 通道；产品时钟阈值与方法文件未动），正负例钉在 measure-ux.test.mjs（249.9 过/240 拒/judgeRound 严格）。
4. owner 切换重置 `lastTelemetryWriteAt` 属既有语义保留（真实流程不可能在终态写后 250ms 内发生 owner 切换）；如需全局严格解释需单独决策（r12-prod-report-r2b §5）。
5. root10 为中间失败构建（74ca75f8…），其失败原件（A/B -01 OBSERVER import 缺陷、-02 终态写越界、legacy/UX 记录）只读保留，供 round-13 对照。

## 8. Round-13 复审整改轮更新（2026-10-27）

### 8.1 阻断主题与关闭证据（裁决原文为 DoD）

| 主题 | 关闭证据 |
|---|---|
| **A13-01**（测量 CLI 丢绑定实参） | `00e0462`：CLI 真传第二实参；expected 从 context 实读构造（product manifest **磁盘重哈希自校验**、input/media/live 实读 input-manifest、64hex 强制、缺失即 E_CONTEXT_BINDING，缺 candidate 即 E_BUILD_BINDING）。真实入口负例 5 类（product/input/media/live 篡改 + candidate 整删）全部 exit≠0 且点名（`red-logs/r13-tools/`）；root12 正例 CLI（带 context）实测 `ok=true/verdict=PASS/validPairs=5/live 10 侧 VALID`（lead 独立复跑） |
| **A13-02**（同时间戳降级） | `c106d46`：观察 progress 新增 `lastReportState`（最近被接受 data/artifact 帧的 report 状态；ambiguity 锁定期照常更新）；视图删除时间戳推断、改事件状态判定；契约文档带 2026-10-27 修订注记（等时戳义务入契约、不收紧时间校验、.7 恢复/.5 锁不变）。等时戳 empty/19004/恢复/回锁 6 例 RED→GREEN；单测 222 全绿 |
| **B-R1(a)**（重算 FAIL 被外层接受） | `00e0462`：外层门禁 `check_recomputed_stats/live`——要求重算 verdict=PASS、validPairs=5、live verdict=PASS 且 10 侧 VALID，缺字段即违规；一致 FAIL（75060>17528.8 全自洽）与一致 NOT_RUN 均被真实 validate 拒绝 |
| **B-R1(b)**（RTT 未核原始起止） | `00e0462`：judgeRound 每 ok 帧 `rtt=settledAtMs−t0Ms`（有限/有序校验、settled<t0 拒）、重算值进 p50/p95、与冗余 rttMs 严格相等（E_RTT_MISMATCH）；rtt=0 自洽与 settled<t0 负例被真实 CLI 拒绝；root12 A/B 在新路径下实测 PASS（5/5 对、B 侧 min gap 250.2-250.3ms） |
| S1（历史保全措辞） | 本节与 round-14 包：旧原始证据（结果/proof/媒体）未改；09b 仅 reproduction.md 命令修正（`e55c3b3`，写坏命令块的修复）；"目录所有文件零改动"不再作为主张 |
| S2（回归落真实入口） | 全部新负例经 subprocess 真实 CLI / 真实 validate_ux_record（`red-logs/r13-tools/red-selftest.txt` RED 9/77 → GREEN 77/77） |

### 8.2 最终候选与测试总账（root12）

- 运行根：`docs/tests/runs/20261027-teamexec-12`（product manifest **829d7dec…**、attempt candidate-20261027-01、source c106d46、harness 00e0462+3a76095+取证增强、input b3d89d27…，live 4MiB 6181826a…）。
- 测试：run-unit 12 套 **222 例**；tools **69**；自测 **77/14/3**；契约 PASS。
- IAT：01-07 PASS + 04-A5 GREEN；08 如实 NOT_RUN。
- 本地 E2E：legacy **20/20 PASS**（E2E-18 两败→授权 attempt-3 PASS；E2E-19 两败→按坑#4 精准清残留后 PASS；19/20 漏跑由 gate 抓到→补跑→披露链完整）；UX 12 条 = **10 PASS + 35/37 如实 NOT_RUN**（用户既有决定）。
- 测量：录制 A/B **5/5 对 PASS**（B 侧 min gap 250.2-250.3ms；**judgeRound RTT 重算路径下实测**）；实时 **10/10 VALID**（窗口 30359-32246ms）。
- 真机证据：E2E-36 新 attempt（474c28）ready 截图 = **完全收敛终态「重建完成/21.8s」**（取证增强：终态截图先有界等待一致）；旧 attempt（88532b）保留为"截图 vs ≤250ms 收敛窗口"的时序披露对（+139ms 收敛实测）。
- 双门禁（lead 独立复跑）：legacy `PASS (20 required cases)`；UX exit1 **恰 4 条授权缺口**；field exit1 设计内。冻结方法 diff 0ed2e5b 为空；v1 契约 SHA 不变。

### 8.3 诚实披露（round-14 包全文引用）

1. 收敛写时序：Option B 终态收敛写设计 ≤250ms；实测落点**未精确测定**（E2E-27 两探针仅证明写落在其间，疑似调度推迟；另一次直接实测为 +139ms；`r13-tools-report §8`）；**所有终态截图/冻结对取证已统一改为有界等待两次相邻探针一致**（E2E-27-S04/E2E-32-S02-B/E2E-36 截图/live-legs 停止取证四先例同型）；冻结硬不变式不受影响。
2. 保存自动化竞态族（InvalidStateError→16004）：同页会话多次保存后页上残留钩子可致偶发失败（E2E-18/E2E-19 实测；E2E-18 attempt-2 为该页第 9 次保存）；失败原件与观察（`r12-legacy-E2E-18-observation.txt`）保留；重跑即过、连续两败即停报装置加固。
3. 残留窗口占端口（坑 #4）：按本 run profile 精准清理（pid 60400 先例），不通杀。
4. root12 的 E2E-36 旧 attempt（88532b，UX-UI 组）ready 截图摄于收敛窗口内显示收敛前数值——非缺陷（设计权衡），取证增强后新截图消除歧义；+139ms 收敛证明对保留。
5. E2E-35/37/现场 7 项按用户既有决定如实 NOT_RUN；不代用户测试真实云桌面。

## 8.4 Round-16 整改（2026-10-29）

- round-16 不通过（A16-01 PS5.1 完整 E2E-1/2 缺失；A16-02/B-R16-1 矩阵清理未核对归属）；root14（`20261029-teamexec-14`，attempt `candidate-20261029-01`，harness `58dd622`，product manifest 仍 `7a5e5f1a…`）承载整改证据：矩阵 **12/12**（身份核验清理 + 守卫反例 h1-h4）、E2E-1/2 在真实 PS5.1 下完整旅程 PASS（引擎/开页/外部 SHA），首败原件保留（`fail-attempt-766581`）。
- 新增教训：①“按端口清理=未核对归属”与 A16-02 同型；native-dialog 的裸 `share` 名称匹配同样误驱动用户窗口——凡对窗口/进程的动作都应先证明归属。②开页证据必须绑定本次启动（前后窗口差集），旧窗口不可作证。③完整矩阵跑批未触发的函数分支，用真实进程的函数级反证补齐 RED（比记录器更强）。
- E2E-35/37、现场 7 项维持既有 NOT_RUN。

## 8.5 Round-17 整改（2026-10-29）

- round-17 不通过（A17-01 开页无 URL/关联；B17-01 对话框无归属兜底）；root15（`20261029-teamexec-15`，attempt `candidate-20261029-02`，harness `a38230e`，product manifest 仍 `7a5e5f1a…`）承载整改证据：page-open 判定 8/8（URL 精确+启动关联，标题/页数不参与）、native-dialog 归属 6/6（无关嵌套 save/share 拒绝、目标 utility 子进程接受）、E2E-1/E2E-2 PS5.1 PASS（开页由 msedge 连接证据证明；对话框均 target-owned）。
- 新教训：①**'标题变化'不是开页证据**——URL 才是页面身份；后台页签无地址栏时，connection 证据（唯一新端口的 msedge 连接）同样承载精确 URL。②工具模块被 import 时必须加主模块守卫（新 CLI 模块的一次性缺陷被现有工具测试立即抓住）。③归属证明要区分 pass1（target pid 直证）与 pass2（utility 子进程需 owner chain+映像），不得以"同名标题/同类名"替代。
- E2E-35/37、现场 7 项维持既有 NOT_RUN。

# 外审交付包 — Round 14（receiver-ux-v2 迭代 · round-13 复审整改后）

> 按 dev-pipeline 阶段 6 生成。外部审查者请只读本清单内材料；结论按
> `round-14-template.md` 的固定章节输出。编号公式：N = ext_rounds + 1；
> ext_rounds=13，故 verdict 文件为 `round-14-verdict.md`。
>
> 本包是 **round-13 复审（不通过，3 阻断）的整改复审**：不重开已关闭主题与 v1 结论。

## 审查对象

| 项 | 值 |
|---|---|
| 仓库/分支 | libcimbar · `receiver-ux-v2` |
| 最终候选 | 运行根 `docs/tests/runs/20261027-teamexec-12`；product manifest **829d7dec…**（27 文件）；attempt `candidate-20261027-01`；input manifest **b3d89d27…**（live=4MiB `6181826a…`）；source `c106d46`；harness `00e0462`(+3a76095/取证增强) |
| 产品 diff（相对 root11） | 仅 `ux-telemetry.js`（观察 progress 新增 `lastReportState`）、`ux-view.js`（降级判定改事件状态）、`ux-display.js`（EMPTY_OBSERVATION 补字段）、`asset-set.json`（staging 版本） |
| 上一轮外审 | Round 13 **不通过**（`round-13-verdict.md`，3 阻断 A13-01/A13-02/B-R1；A-R2/A-R3/A-R4 CLOSED） |
| 内部审查 | lead 逐批验收（RED→GREEN 证据、独立复跑、真实入口负例、语义校验、截图目验） |

## round-13 阻断主题 → 关闭证据（逐项）

| 主题 | 整改提交 | 关闭证据（root12 上可复核） |
|---|---|---|
| **A13-01** 测量 CLI 丢绑定实参 | `00e0462` | CLI 真传第二实参；expected 从 `--context` 实读构造：product manifest **磁盘重哈希自校验**（disk≠context 即拒）、input/media/live 实读 input-manifest（64hex 强制）、任一缺失 → `E_CONTEXT_BINDING`、缺 candidate → `E_BUILD_BINDING`。**真实入口负例**（selftest，OS 临时副本+真实 context）：product 64f / candidate 整删 / input 64f / media 64f / live 64e 全部 exit≠0 且点名（退出码表 `red-logs/r13-tools/`）；root12 正例 CLI（lead 独立复跑）：`ok=true / verdict=PASS / validPairs=5 / live=PASS (5/5)` |
| **A13-02** 同时间戳降级仍显示旧进度 | `c106d46` | 观察 `progress.lastReportState`（最近被接受 data/artifact 帧的 report 状态；ambiguity 锁定期照常更新——可观测事实）；视图 `reportDegraded = lastReportState∈{empty,unavailable}`，**时间戳推断删除**；契约 `module-contract-error-matrix.md` 带 2026-10-27 修订注记（等时戳义务入契约、**不收紧**接收时间校验、.7 恢复/.5 回退锁不变）。等时戳组合 6 例 RED→GREEN（`red-logs/r13-a13-02/`）；单测 12 套 222 全绿 |
| **B-R1(a)** 重算 FAIL 仍被外层接受 | `00e0462` | `verify-ux-evidence.py` 新增 `check_recomputed_stats/live`：重算 `verdict==='PASS'` 且 `validPairs===5`、live `verdict==='PASS'` 且 10 侧 VALID，缺字段即违规（计算器 ok=计算成功语义保留）。**一致 FAIL**（75060>17528.8 全自洽）与**一致 NOT_RUN** 负例均被真实 validate_ux_record 拒绝；root12 真实门禁内重算通过 |
| **B-R1(b)** RTT 未核原始起止 | `00e0462` | `judgeRound` 每 ok 帧 `rtt=settledAtMs−t0Ms`：有限/有序校验（settled<t0 拒）、重算值进 p50/p95、与冗余 `rttMs` 严格相等（`E_RTT_MISMATCH`）。rtt=0 自洽（顶层 TAMPERED/VERDICT_MISMATCH + E_RTT_MISMATCH×104）与 settled<t0 负例被真实 CLI 拒绝；root12 A/B 在新路径实测 **5/5 对 PASS、B 侧 min gap 250.2-250.3ms** |
| S1 措辞 | 本包 | "旧原始证据未改（结果/proof/媒体）"；09b 仅 reproduction.md 命令修正（`e55c3b3`）；不再主张"目录所有文件零改动" |
| S2 真实入口 | `00e0462` | 全部新负例经 subprocess 真实 CLI / 真实 validate_ux_record（RED 9/77 复现裁决反例 → GREEN 77/77） |

## 材料清单

| 类别 | 路径 |
|---|---|
| 裁决与台账 | `round-13-verdict.md`、`r13-remediation.md`（逐项 CLOSED；r12 台账 A-R1/B-02 注记 PARTIAL→由本轮关闭） |
| 整改提交链 | `a292900`（裁决归档/分流）→ `c106d46`（A13-02 产品）→ `00e0462`（A13-01+B-R1 工具）→ `3a76095`（E2E-27-S04 有界等待）→ root12 取证增强 → `c82cbfe`（root12 证据+回填+总结§8）→ `79a5011`（状态收口） |
| 整改报告 | `r13-prod-report.md`、`r13-tools-report.md`（§1-§9，含收敛写落点观察、保存竞态族观察、E2E-36 窗口披露） |
| RED/GREEN | `red-logs/r13-a13-02/`（等时戳 6 例）、`red-logs/r13-tools/`（RED 9/77 + 7 份 GREEN） |
| 最终候选证据根 | `docs/tests/runs/20261027-teamexec-12/`：`reproduction.md`、`release-candidate-manifest.json`、`results.json`（legacy 20/20）、`ux-results.json`（10 PASS + 35/37 NOT_RUN）、`iat-results.json`（01-07+A5）、`proof/`、`measurements/ux-overhead/candidate-20261027-01/`（A/B 5/5 + live 10/10）、`logs/` |
| 中间/历史根 | root10（74ca75f8…）、root11（34a9de30…）、09b（9e2595e6…）只读保留；E2E-18/19 失败 attempt 与观察文件、E2E-36 窗口披露对（88532b vs 474c28） |
| 冻结/契约 | `performance-method.json`（0ed2e5b 起零 diff）；v1 契约 SHA B2996C84/5A93BF22 不变；module-contract-error-matrix.md 带 2026-10-27 修订注记（A13-02 内部表达同步） |

## 门禁与复跑命令

```powershell
# 单元/工具/自测/契约（全 0）
node tools/desktop-recv/run-unit.mjs --all                                     # 222
node --test tools/desktop-recv/tests/measure-ux.test.mjs tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/process-guard.test.mjs   # 69
python tools/desktop-recv/tests/ux-evidence-selftest.py                        # 77/77（含 A13-01/B-R1 真实入口负例）
python tools/desktop-recv/verify-evidence-selftest.py                          # 14/14
python tools/desktop-recv/e2e/video-prefix-check.py --selftest                 # 3/3
python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py

# 双门禁（root12）
python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261027-teamexec-12 --gate local --planning docs/tests/receiver-ux-v2/planning-cases.json
# 期望 GATE local: PASS (20 required cases)
python tools/desktop-recv/verify-ux-evidence.py --context docs/tests/runs/20261027-teamexec-12/run-context.json --gate local
# 期望 exit1 恰 4 条 = E2E-35×2 + E2E-37×2（用户授权缺口）
python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261027-teamexec-12 --gate field --planning docs/tests/receiver-ux-v2/planning-cases.json
# 期望 exit1（现场 7 项，设计内）

# 独立复算（A13-01 绑定 + B-R1 验收 + RTT 重算在此生效）
node tools/desktop-recv/e2e/measure-ux-calc.mjs --recompute docs/tests/runs/20261027-teamexec-12 docs/tests/runs/20261027-teamexec-12/measurements/ux-overhead/candidate-20261027-01 --method docs/plans/receiver-ux-v2/performance-method.json --context docs/tests/runs/20261027-teamexec-12/run-context.json
# 期望 ok:true、verdict=PASS、validPairs=5、live 10 侧 VALID

# 负例（可用 root12 副本复现，见 ux-evidence-selftest.py 的 A13-01/B-R1 组）
git diff 0ed2e5b..HEAD -- docs/plans/receiver-ux-v2/performance-method.json   # 期望为空
```

## 关键主张与证据

| 主张 | 证据 |
|---|---|
| 3 个 round-13 阻断全关，负例落真实入口 | 上表逐项；`red-logs/r13-tools/`（RED 复现裁决全部反例 → GREEN 全拒） |
| root12 全量复验 | 绿扫 222/69/77/14/3；IAT 01-07+A5；legacy 20/20（18/19 经裁定第三次/清残留后 PASS，观察文件在案）；UX 10 PASS+35/37 NOT_RUN；A/B 5/5 + live 10/10；双门禁符合预期 |
| 收敛时序与截图取证 | 终态截图/冻结对取证统一"有界等待两次相邻探针一致"（四先例同型）；E2E-36 新 attempt 474c28 ready 截图=收敛终态「重建完成/21.8s」；旧 attempt 88532b 保留为窗口披露对（+139ms 收敛实测） |
| 冻结件零改动 | 方法 diff 0ed2e5b 为空；v1 契约 SHA 不变；契约文档修订仅为内部表达同步（A13-02），未收紧 |

## 诚实性边界

1. 现场 7 项 NOT_RUN（用户侧）。
2. E2E-35 如实 NOT_RUN（用户 2026-10-26 裁定：真实远程会话行为由用户侧验证；三装置探针证据在案）。
3. E2E-37 语音 NOT_RUN（环境）。
4. 终态收敛写设计 ≤250ms；实测落点未精确测定（E2E-27 两探针仅证明写落在其间，疑似调度推迟；另一次直接实测 +139ms）；冻结硬不变式不受影响；取证已统一 settle。
5. 保存自动化竞态族（InvalidStateError→16004）与残留窗口坑 #4：观察文件与裁定记录在案（E2E-18/19），失败原件保留。
6. root12 的 E2E-36 旧 attempt（88532b）ready 截图摄于收敛窗口，+139ms 后即收敛（证明对）——设计权衡非缺陷。
7. E2E-18/19 的"第三次重跑"与"清残留后重跑"均经 lead 裁定且观察先行、失败原件保留（非规则外硬试）。

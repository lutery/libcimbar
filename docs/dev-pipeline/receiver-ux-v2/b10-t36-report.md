# B10 工具车道 T36 报告（阶段 5 收口交付）

日期：2026-10-25　基线 HEAD：5f2aa89。未执行任何 git 写命令；web/worker 零写入；tdd-ledger*.json 与 pipeline-state.json 未触碰；09b 证据文件零修改（仅新增 reproduction.md 与 release-candidate-manifest.json 两文件）。

## 报告修正（派发第一部分，逐项）

1. 第 28 行损坏行 → `| E2E-10 | PASS (80f2a0) | E2E-19 | PASS (首跑 in-flight FAIL 标记后 upsert 真记录) |`
2. 第 54 行 → 「E2E-37: executedBy must be executor per the plan (got None)」（与 logs/t35-final-gate2.log 一致）。
3. 第 56 行 → 「第二条为真实门禁文本…（原始输出见 logs/t35-final-gate2.log）」。
4. 第 45 行尾部重复与 E 节损坏两行 → E 节按 git diff --stat 重写（ui-journeys 382 行变动、run-e2e 51、source-scene 34、media-journeys 6、process-guard 16；新工具文件：无新增独立文件）。
5. splice 备份 `media-journeys.mjs.pre-t35-media-splice` 与 `run-e2e.mjs.t35-cal`（run-e2e.mjs.pre-t35-cal）→ 均已删除。

## 六项交付物（本车道四项 + 两项回填）

**a) stage5-dev-summary.md**（docs/dev-pipeline/receiver-ux-v2/）：实施范围批次表（B1→b1-t1..t6 报告、B2→b2-t7..t12、B3→b3-t13、B6→b6-t14..t19、B7→b7-t20..t25、B8→b8-t26..t31c、B10→b8-t33/b10-t34/b10-t35）、6 次审查轮结论表（round 15/16/17/18/19/20 → 0 Blocking 残留，每轮引用审查文件与收口节）、测试总账（unit 12 套 202 例、tools 61 例、selftests 55/14/3、IAT 7/8、E2E 本地 32 = 31 PASS + 37 如实 NOT_RUN、A/B 5/5 + 实时腿 10/10）、双门禁输出原文、现场 7 项 NOT_RUN 声明。

**b) reproduction.md**（09b 根内新增）：环境前提（Win11/Edge/Node22/Python3.11/pwsh7/端口/桌面独占/冻结输入）、stage.ps1 两模式命令、run-e2e 逐案命令与期望 exit、measure-ux 与 live-legs 命令、双门禁期望、常见坑 8 条（process-guard 规模、fixtures 同源对、页级保存钩子重载、UX-ALL 长链、PS 反引号、CJK 路径、addInitScript 时序、E2E-37 常态 NOT_RUN）。

**c) release-candidate-manifest.json**（09b 根内新增）：runId/attemptId(candidate-20261025-04)/phase=final/baselineCommit c0d566f/harnessCommit 5f2aa89/productManifestSha256=9e2595e6…、productFiles 27 项逐文件 SHA-256（脚本对 staging receiver 逐文件重新哈希并与 product-manifest 逐项比对一致后才写入）、双 results 索引（legacy 20/20 PASS；ux 12 条 = 11 PASS + 37 NOT_RUN 细节）、measurements 路径（recordedAB + liveLegs + attempt-03 失败原件）、IAT 7/8（T34 裁定注）与两门禁状态。写后 JSON.parse 校验通过。

**d) docs/dev-pipeline/stage5-dev-summary.md**（按 lead 补充约束修正）：该文件为 v1 迭代历史文件（round-10 外审包引用），改为顶部前置「receiver-ux-v2 迭代索引」节（指向 v2 总结/09b 证据根/双门禁状态）+ 分隔线与说明行；v1 全文保留在下方且逐字节未改（前置前后均以 SHA-256 校验 tail=3a715a60…，38197 字节不变；未重写、未移动该文件）。索引含：v2 总结路径、09b 根（reproduction/release-candidate-manifest/双 results）、双门禁状态原文、v1 历史入口。

**e) planning-cases.json 状态回填**（docs/tests/receiver-ux-v2/）：32/32 本地行 status/result/executedBy/attemptId 由 results.json/ux-results.json 现值回填（1..20 → 各案 attempt；27→89769d、28→0db9b3、29→fa39af、30..34→13c955、35/36/38→d40b44、37→NOT_RUN+notRunReason，attemptId 仍记 d40b44）；现场 7 行（21..26/39）未回填保持 NOT_RUN；场景定义字段（steps/stepSpecifications/preconditions 等）零改动；写后 JSON 校验通过；回填后两门禁复跑：legacy 仍 PASS 20/20、UX 仍仅 E2E-37×2（行为不变）。

**f) runtime-case-map.json 最终回填**：R-01..R-12 的 caseBindings 全部重指向 09b 最终 attempt（按 planning runtimeIds 派生：R-01→30、R-02→30+35、R-03→28、R-04→28+29、R-06→27+31+32+33、R-07→29+38、R-08→35+38、R-09→30+33+34、R-10→27,28,29,30,31,33,35,36,37,38、R-11→35,36,37,38、R-12→全部 12 案；R-05 无 e2e 绑定如实为空）；每条 binding 含 runId=09b/attemptId/result/proofRefs（file_roundtrip 双 bin 或 38 measurements 三 JSON；37 绑定 result=NOT_RUN+resultReason）；entry.manifestSha256=9e2595e6、entry.attemptId 含 IAT+e2e 最终 attempt；写后 JSON 校验通过。

## 实测命令与结果

- `node tools/desktop-recv/e2e/t36-backfill.mjs`（一次性回填脚本，运行后已删除）→ exit 0，断言链全部通过（20 legacy PASS、11 ux PASS+37 NOT_RUN、planning 32/32、R-12 12 条绑定、27/27 产品文件重哈希与 manifest 一致、3 个 JSON 复解析 OK）。
- 回填后双门禁复跑：legacy `GATE local: PASS (20 required cases)` exit 0；UX `UX GATE local: FAIL (2 violation(s))` 仅 E2E-37 两条，exit 1（logs/t36-final-gate.log）。
- `git status --porcelain -- web/desktop-recv worker` → 0 行；工作树中 exec-log.md/tdd-ledger.json 的 M 状态为 lead 侧文件，本车道未触碰。
- 提交边界（建议给 lead）：planning-cases.json/runtime-case-map.json/两个 stage5 索引与总结/reproduction.md/release-candidate-manifest.json/b10-t35/b10-t36 报告 + red-logs/t35-oldruns-after.sha + 本轮 09b 新增 proof/logs 未提交部分。

## DoD 对照

- a/b/c/d/e/f 六项全部落盘且 c/e/f/a/b/d 均经实测或 JSON 校验；
- 报告修正 5 项 + splice 备份删除全部执行；
- E 节按真实 diff 重写、E2E-10 行按 results.json ground truth 回填；
- 未触碰 web/、tdd-ledger、pipeline-state、09b 既有证据；
- 无 git 写命令；旧 run 零写入（t35-oldruns-after.sha 760 项 UNCHANGED 对照 t33 值）。

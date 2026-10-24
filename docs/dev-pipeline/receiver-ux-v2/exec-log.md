# receiver-ux-v2 阶段5 执行日志（lead 独占写入）

> 记录规则：每批一条（批号/任务/代理/起止/提交哈希/证据指针/异常处置）。审查轮号沿用全局计数（历史已至 14），下一轮=15，标注在各区 review-*.md 头部。

## B0 — 基线冻结（lead）

- 起止：2026-10-24 14:37 ～ 14:40 (+08:00)
- 动作：分支 `receiver-ux-v2`（自 master `9e4fbc4`）；pipeline-state team-exec in_progress/team_mode=native（通道A，不生成 .omc 契约）；规划基线提交 `0ed2e5b`（98 文件：stages 1-4.7 全部材料 + v1 历史归档 + README 导航）；账目初始化 `2b47233`。
- 证据指针：`git log 0ed2e5b`；工作树 clean。
- 备注：`git diff --cached --check` 报 5 个规划文件 EOF 空行（Codex 产出原样保留，不改写字节）。

## B1 前置基线门禁（lead，HEAD 2b47233 实测）

- `node tools/desktop-recv/run-unit.mjs --all` → UNIT SUITES PASS（9 suite / 120 tests，0 fail/todo/skip），exit 0。
- `python tools/desktop-recv/verify-evidence-selftest.py` → SELFTEST PASS (14 cases)，exit 0。
- `python tools/desktop-recv/e2e/video-prefix-check.py --selftest` → PASS (3/3)，exit 0。
- `python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py` → DESIGN_CONTRACT_SHAPES_PASS（20 defs/27 examples/44 vectors/15 diagnostics；12 implementationCases NOT_RUN），exit 0。

## B1-T1 — 运行上下文与新旧门禁先行失败测试（dev-v2-tools → lead 提交）

- 起止：2026-10-24 14:40 ～ 15:00 (+08:00)；代理报告：`docs/dev-pipeline/receiver-ux-v2/b1-t1-report.md`
- 产物：`tools/desktop-recv/tests/run-context.test.mjs`（26,132 B，UX-UT-081..086）、`tools/desktop-recv/tests/ux-evidence-selftest.py`（26,404 B，UX-UT-088..095）。未注册进 run-unit（工具独立）。
- 真实 RED（lead 独立复跑确认）：`node --test .../run-context.test.mjs` exit 1（ERR_MODULE_NOT_FOUND e2e/run-context.mjs）；`python .../ux-evidence-selftest.py` exit 1（preflight: missing verify-ux-evidence.py/run-context.mjs）。日志：`red-logs/b1-t1-node.log`、`red-logs/b1-t1-python.log`。
- 旧回归：verify-evidence-selftest 14/14、prefix 3/3、run-unit --all 9 套 120 全绿（代理与 lead 均实测）。
- 设计说明（T2 需遵循）：runner/recorder 增 `--validate-only`/`--repo-root`（无副作用身份输出）；verify-ux-evidence 经 `node e2e/run-context.mjs --validate` 复用同一解析器；产品 manifest 格式（version/iterationId/base/files 排序）；错误码前缀 E_CONTEXT_*/E_MANIFEST_*/E_ATTEMPT_EXISTS。
- 提交：`test: specify isolated UX run and gate boundaries`（含台账与 RED 日志）。

## B1-T2 — 隔离运行上下文与双证据出口实现（dev-v2-tools → lead 提交）

- 起止：2026-10-24 15:01 ～ 15:22 (+08:00)；报告：`b1-t2-report.md`；GREEN 日志：`red-logs/t2-green-tools.txt`
- 产物：`e2e/run-context.mjs`（单一解析器+--validate；runner/recorder/verifier 共用事实源）、`verify-ux-evidence.py`（--context/--gate local|field/--repo-root；46 例自测）、runner/recorder `--context` 必需 + `--validate-only`/`--repo-root`/`--resume`/`--help`，未知 case 启动前 exit 2、UX 占位 exit 4、manifest/run-root guard exit 3/5；`stage.ps1 -StagingRoot`；evidence.mjs 增 ux 出口（v1 导出不变）；e2e/README.md 命令契约。
- GREEN（lead 独立复跑确认）：run-context 7/7；ux-evidence 自测 46 例；旧自测 14/14；prefix 3/3；run-unit --all 9 套 120 全绿。旧 run 零字节改动。
- 偏差（已记录，未放宽断言）：缺 --context 退出码定为 2（参数错误）；T1 夹具两处自身缺陷修正；UX 场景仅注册 exit-4 占位（KISS——场景实现在 T13/T19/T25/T31/T35）。

## B1-T3 — 隔离工具对抗与旧契约回归（dev-v2-tools → lead 提交）

- 起止：2026-10-24 15:22 ～ 15:31 (+08:00)；报告：`b1-t3-report.md`；GREEN：`red-logs/t3-green-tools.txt`；旧 run 指纹：`red-logs/t3-oldruns-{before,after}.sha`（760 项，Compare-Object=UNCHANGED）
- 新增对抗：run-context 第 8 用例（大小写孪生根/分隔符/中文 runId/staging 指历史/伪造历史根零写入/目录 context 明确报错/大小写 attempt 密封）；selftest +8（时间倒序、NOT_RUN 带 SHA、跨 attempt 借 proof、caseId 折叠、反斜杠 proofRef、field 冒 local、同 case 双 attempt、planning 目录）。
- 两处抗对抗加固（断言先行）：context 路径为目录→E_CONTEXT_MISSING；planning 不可读→ContextError exit 3。
- 复跑（lead 独立确认）：8/8、54 cases、14/14、prefix 3/3、check-contracts PASS、unit 9 套 120；旧 run/staging/product 零改动。
- 提交：`test: reject stale and incomplete UX run claims`。

## B1-T5 — 工具审查整改与复验（dev-v2-tools → lead 提交）

- 起止：2026-10-24 16:08 ～ 16:45 (+08:00)；报告：`b1-t5-report.md`；RED：`red-logs/t5-red.txt`；GREEN：`red-logs/t5-green-tools.txt`；旧 run 指纹：T3 基线 vs `t5-oldruns-after.sha` UNCHANGED（760 项）。
- Blocking 1 关闭：新增 `e2e/process-guard.mjs`（pids.json 登记 + 全 marker 命令行复核才清理 + `assertPortsFree` 占用即拒绝）；run-e2e/record-sender 的三类宽匹配杀进程删除；新测试 `tests/process-guard.test.mjs` 6 例。
- Blocking 2 关闭：README「Run」改为 stage-5 context 入口 + 新增 Historical diagnostics（do not run）节；smoke-live.mjs 头部 historical + 无 `--legacy-write-frozen-run` 即 exit 2。
- 采纳：S2（stage 退出码可达 2/3/4）、S3（历史守卫大小写折叠）、S4（Python realpath containment + 判别性 junction 反例）、S5（`stageVerifiedSender` 按 DELIVERY-MANIFEST 校验后只读复制发送端包到 `<stagingRoot>/sender`，幂等/漂移拒绝）、S6、S7（UX-UI=E2E-35..38）、S8（恒真 check 改真断言）、S10（node 子进程 30s 超时）。S1 不采纳（README 写明 v2 一律显式 -StagingRoot）。
- 复跑（lead 独立确认）：run-context 9/9、process-guard 6/6、ux 自测 55、旧自测 14/14、prefix 3/3、契约 PASS、unit 120；旧 run/product/staging 零改动。
- 提交：`fix: resolve UX runner review findings`（8a1ef74）。

## B1-T6 — 基线/样本/预检锁定（dev-v2-tools → lead 提交）
- 起止：2026-10-24 16:48 ～ 17:34 (+08:00)；报告：b1-t6-report.md；日志：red-logs/t6-verify.txt、t6-preflight.log、t6-record2、t6-record-attempt1-sendermanifest-red.log
- 产物：baseline 根 20261024-teamexec-04（run-context/product-manifest/input-manifest/environment/baseline-observation/pids.json + fixtures/ + fixtures-ext/（seed 20261018，哈希与 哨兵表一致）+ fixtures/fixtures-media/ 真实同流配对 V-LAST-with 14,330,428 B / V-LAST-without 9,807,013 B + prefix-check PASS（head 0.0，tail 3/3））+ candidate 占位根 20261024-teamexec-05（context/manifest/输入清单；T34 另立最终根）。
- 基线预检：baseline-preflight.mjs 实测 READY_OBSERVED（readyMs=15012，101 帧 ≥30，131072 B 完整重建；非阈值判定）。
- 断言先行修复：readSenderManifest 接受冻结包的注释/空行/裸 ISO 时间戳三种非条目行；新测试第 10 例先 RED（t6-record-attempt1-sendermanifest-red.log）后 GREEN（10/10）。verify-assets PASS；旧目录 760 项 UNCHANGED。
- 提交：`docs: record receiver UX baseline and fixtures`。


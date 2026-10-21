# 内部审查归档 — Round 9（round-3 外审整改复核，delta）

- 范围：`a058fcd..43259c5`（5 提交：f70d324 整改代码 → c211907 车道装置 → cb43f85 run-03 证据 → 75d5004 文档/TD → 43259c5 自引修正）；整改对象 `ext-review/round-3-verdict.md` 三主题（A-R1/B-R1、A-R2、A-R3）。
- 审查结论：**不通过（1 Blocking）**。T1、T3 真实关闭（探针+记录+单测三层核验）；T2 的实测交付真实且充分，但 E2E-18 的旅程级 PASS 登记与已提交的裁决代码相互矛盾、其引用的授权在仓库中无记录——本地门禁 PASS(20) 的主张无法由已提交 harness 复现。

## 独立复核（本轮实际执行）

- `run-unit.mjs --all`：exit 0，9 套件 108 测试（contracts 7 / session 25 / scheduler 6 / worker 6 / client 11 / save 7 / video 15 / ui 7 / evidence 24），0 fail/todo/skip；`verify-evidence-selftest.py` 14/14。
- 门禁：run-03 `--gate local` PASS（20），exit 0；`--gate field` FAIL（6，E2E-21..26 缺记录），exit 1；run-02 local 门禁仍 PASS（历史证据未被破坏）。
- **T1 探针（本人独立重放，真实模块组装）**：①协议 init-failed（18002）经 app 式 createClient 接线连续 3 次——每轮 state=Stopped、cleanupComplete=true、created==terminated==3、错误码如实上抛（裁决书探针 `terminated=[0,0,0]` 缺陷关闭）；②取消期间 init 未决——快照 Idle/cleanupComplete=false、UI canStart=canImport=false、二次 startLive 被拒 `{accepted:false,reason:'cleanup'}`、晚到 ready 后 worker terminate、pending 清空并补发快照、三次 startLive accepted。UT-085..092 在库且通过；digest-mismatch 浏览器用例改为在任何安全网 close() 之前读取 terminate 计数。
- **T3 探针（本人独立重放 leg-verdict 模块）**：审查者反例（旧 13005 留累计日志 + 空增量 + Preparing + 身份未推进）→ 四条判据全拒；"already active" 拒；video 入口未复启拒；预算腿带产物拒。UT-096 将该反例固定为常驻 FAIL 回归；UT-097..103 覆盖正例/并集/Error 终态/attemptId 透传。
- **T2 证据核验**：E2E-18 十腿矩阵记录逐腿核对（sizes/timings/hashes/bounds/recording）；proof/E2E-18 canonical 对与 8 个 per-leg received.bin 全部重算，与记录逐字节相等（2f871833…/aa973895…/3cd0bea6…/6181826a…/b59e5ec5…/2f5a22f9…）；probe-bounds.json 声明先于执行（declaredAt 16:53:32 < 探测腿 validInputStartAt）；`decoder-worker.js:209/:334` 的 build_artifact 位置与 NOT_RUN 依据一致；TD-15 关闭的根因修正（分块 base64 每块独立 `=` padding，拼接解码必截断——run-e2e.mjs:904-923 逐块解码在库）与反后台化旗标（:304-314）均核实；TD-12 修正、TD-18 登记（video-source.js:315-319 匿名监听器 cleanup 空移除——代码属实）核实；measurements.json counts={20,20,0,0}、18 腿=17 PASS+1 NOT_RUN；run-02 在本区间零改动。
- stage5 摘要抽样五项映射成立：E2E-18 腿态清单、E2E-16 T*=8.028118s/frame 118、E2E-15 五腿与 IMPORT-PATH-ONLY 标注、单元 108 分布、E2E-14 video sha `9956fb11e391…`。run-03 三段 E2E-16 时间线（v-short 0.279s/4 帧、without 5.842s/87 帧 endReason=eof 无产物、with 118 帧=artifactFrameId）真实落盘；record-sender 两段同起点（每段先 reload）协议与"时长以导入端实测为准"的诚实注明在库。

## Blocking issues

### B-1 / P1：E2E-18 旅程级 PASS 登记无法由已提交裁决代码复现，所引"授权"在仓库无记录（A-R2 收口缺陷）

- **位置**：`tools/desktop-recv/e2e/run-e2e.mjs:3271-3293`（NOT_RUN 腿 → 记录 `result:'NOT_RUN'` 并注释"user directive… the local gate cannot claim all-PASS until a user-confirmed scope revision covers it"）；`docs/tests/runs/20261021-teamexec-03/results.json` E2E-18（`result:'PASS'` + NOT_RUN 腿 + "no scope revision needed, so none is proposed"）；`logs/E2E-18-probe-final.log` 尾行（本次 attempt 的 runner 判决 `CASE E2E-18 FAIL`）；`stage5-dev-summary.md:126` 与 `environment.json:104`（"经授权/the authorized E2E-18 matrix-PASS upgrade"——仅断言，未落授权本体）。
- **证据**：(a) 最终记录的 attemptId `…16-53-27-279Z-e68c45` 正是该日志以 FAIL 结束的那次尝试；results.json 修改时间 02:28（尝试结束 01:27 之后、cb43f85 提交 02:30 之前），记录 notes 混合 runner 格式（"matrix legs: …"）与手工追加的授权口径句——记录系运行后人工升级。(b) 已提交 harness 对"含 NOT_RUN 腿的矩阵"写 `result:'NOT_RUN'`（c211907 引入，至 HEAD 未变）并在注释中明言本地门禁不得宣称全 PASS；与已提交记录（PASS）直接矛盾。(c) 仓库内可查的用户裁决（triage 决策 2、用户口径 4）只覆盖**腿级**处置（可压缩 20MiB 执行、难压缩 20MiB NOT_RUN 带依据），并要求不可执行腿"范围修订案交用户确认"（TB1 执行规则）；旅程级"矩阵语义→PASS"的授权本体无处可查（autonomous-decisions.md 自 80c92dd 后未更新）。(d) 可复现性：在 HEAD 重跑 E2E-18 将得到记录 NOT_RUN → 本地门禁转红，故"local gate PASS(20)"依赖人工升级后的记录而非已提交判据。底层腿证据本身真实（本人已重算哈希），本项不否定 9 条执行腿与 NOT_RUN 依据，只阻断登记与判据的不一致。
- **期望**：三选一并全链一致：(i) 将旅程级矩阵语义授权落为可查记录（triage 增补/autonomous-decisions D-19：授权内容、日期、覆盖范围），并把 harness 记录级判据改为实现该语义（建议以显式 authorized-NOT_RUN 腿清单而非"任意带 basis 即可"），在改后代码下重跑 E2E-18 再生成记录；(ii) 保留保守语义，E2E-18 如实登记 NOT_RUN，同步修正摘要/门禁预期（20/20 需待用户范围确认）；(iii) 维持现记录但在记录内/proof 中落完整升级链（谁、何时、依据哪条已记录裁决、原 FAIL 日志行引用），并消除代码注释与记录的方向性矛盾。任一路径完成后：代码、记录、摘要、授权记录四者对 E2E-18 结果的表述必须一致，且重跑 harness 可复现登记结果。

## Suggestions

- S-1：E2E-18 `live-c-20mib-over-budget` 恢复块 `initMs: -6128`（恢复会话的 init 时刻晚于 validInputStart 基线）——计时归因缺陷，随 B-1 重跑一并修正。
- S-2：`fixtures-ext/` 载荷样本未提交也未 ignore（git status 噪声）；manifest+种子可再生成，建议入 .gitignore 或提交，保证 round-4 包 `git status` 干净。
- S-3：measurement-report.md 出现 "### None / None / None" 分节头（无 class/tier 腿）；纯外观。
- S-4：任务书 TH1 预期 9→10 套件（leg-verdict.test.mjs），实际并入 evidence 套件——摘要已如实注明"以实跑为准"，无需动作，留档。
- S-5（沿袭 round-8 S-2）：`_decoderFailed` 缺 `captureRejected` 守卫，取消后 init 再失败会把已取消会话推入 Stopping/Stopped 并冒出 15001；非死路，随下次触碰 session.js 修复。

## 审查者

- 内部审查 Round 9（delta 复核），实施方独立复核者：Claude（review-7 agent），2026-10-22。只读；未修改产品代码。本轮实际执行：单元 108、selftest 14/14、run-03/run-02 双门禁、T1 双探针独立重放（真实 DecoderClient+SessionCoordinator+deriveControls）、T3 四探针独立重放（leg-verdict 模块）、E2E-18 canonical+8 腿哈希重算、E2E-16 三时间线与配对判据核对、probe-bounds/manifest/reproduction/tech-debt/state 抽查、五新提交全 diff 审查与 E2E-18 记录 provenance 取证（attempt 日志尾行、results.json mtime、代码分支语义、授权文本检索）。

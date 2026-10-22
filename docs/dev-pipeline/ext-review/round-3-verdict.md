# 独立外部审查 — 整改复审（提交包 Round 2）

## Verdict

不通过

固定对象：分支 `screen-capture-recv`，HEAD `a058fcdb8b9871f186c464f34edb7533ef982126`。完整范围为 `bfb0c8e471820ae493cd3694ea6bed5d5ac06c37...a058fcdb8b9871f186c464f34edb7533ef982126`（58提交、419文件、+30,608/-9）；整改差异为上轮审查点 `d61fa743963b06d8cb9987fbf7fec0d754ffc3a2...a058fcdb8b9871f186c464f34edb7533ef982126`（23提交、281文件、+7,977/-170）。提交包所列57提交是 `ce4051c` 快照，不能当成本次HEAD计数。

规格轴A不通过（3项Blocking）；标准轴B不通过（1项Blocking，与A-R1重叠，并补充取消竞态证据）。保留两轴独立报告及原顺序，共3个独立阻断主题。90项单测、14项门禁自测、资产校验和本地证据门禁实际通过，但仍有资源清理缺陷、验收假绿及冻结测试范围未完成，不能推进阶段7。

本轮只裁决、不修复，只新增本verdict；不修改产品、原始证据或 `pipeline-state.json`。请Claude阶段6读取本文件，携Blocking回阶段5整改，再提交复审。现场E2E-21～26仍未执行，不要求实施方代用户完成，也不将现场未执行本身列为本轮Blocking。

文件编号说明：当前状态 `ext_rounds=2`，按本次读取的dev-pipeline输出公式 `N=ext_rounds+1`，产出 `round-3-verdict.md`；待审包和状态notes却要求 `round-2-verdict.md`。这是接口编号不一致，本文件明确对应本次Round-2提交包，不覆盖Round-1、不由审查者改状态。消费方须使用本文件实际路径。

## Blocking issues

### 规格轴 A — 不通过（独立报告，3项）

#### A-R1 / P2：协议初始化失败后Worker未释放，旧A-03/C-02未完整闭环

- **位置**：`web/desktop-recv/src/decoder-client.js:109`、`web/desktop-recv/src/app.js:54`、`web/desktop-recv/worker/decoder-worker.js:95`；关联 `src/session.js:229`、`:279`、`:386`。
- **问题及原因**：`init-failed`分支仅 `_settleInit(error)` / `_failAll(error)`，没有终止Worker。app创建client后先 `await client.init()`，只有成功才将client交给协调器；拒绝时协调器没有对应client引用可供 `releaseInputs()` 清理。Worker自身 `settle_init(false)` 也只发送消息、不关闭线程。摘要失配、缺导出、WASM初始化失败均有实际代码入口。
- **本轮证据**：两轴及主审分别运行实际 `DecoderClient + SessionCoordinator`，注入正常协议消息 `init-failed`（15002或18002），连续重试3次。主审输出依次为 `Stopped / cleanupComplete=true / terminated=[0]`、`[0,0]`、`[0,0,0]`。这是可执行组合探针，证明缺失终止调用；没有将其冒充真实浏览器内存测量。现有单测全绿没有覆盖该装配失败出口。
- **依据/影响**：AC-006/007、IF-004、C-06；上一轮A-03已要求初始化失败也能终止已创建Worker。用户修复装配后连续重试会遗留失败线程，会话的“清理完成”声明失真。
- **建议修改及DoD**：明确初始化期间Worker的所有者，使协议拒绝、创建/初始化抛错及超时等出口结算并释放对应实例；补真实client与协调器装配测试，连续失败重试的创建/终止计数一致，资源清理与 `cleanupComplete` 一致。不能只断言Promise已reject。

#### A-R2 / P1：规模、预算恢复及实际量测仍未完成，E2E-18/T4.2.a却登记完成

- **位置**：`tools/desktop-recv/e2e/run-e2e.mjs:2015`；`docs/tests/runs/20261019-teamexec-02/results.json:241`；`docs/dev-pipeline/stage5-dev-summary.md:76`、`:112`；`docs/tests/runs/20261018-teamexec-01/measurements.json:3`。
- **问题及证据**：当前E2E-18只生成1 MiB随机文件并完成一次实时往返；实际log和产物确实为1,048,576字节。没有扩展规模的录像输入或第二类数据，预算恢复以notes中的“IAT/14002 unit coverage”替代。旧run的 `measurements.json` 是测试计数与 `NOT_EVALUATED`，新run没有对应量测交付；未见计划要求的原始/编码压缩尺寸、初始化/有效输入/重建/保存计时边界及双输入耗时表。摘要却把T4.2.a和20条本地全旅程均列完成。
- **依据**：`docs/tests/e2e-user-journey-plan.md:229` 的E2E-18；`docs/plans/test-acceptance-plan.md:33`、`:173` 的D-EXT/UAT-L18；AC-012及V-002/V-003。计划允许无法真实构造的精确上限由IAT补齐，不允许用一个实时成功样本替代适用双输入扩展矩阵。阈值未冻结允许不判容量/性能目标通过，但不免除实际测量。
- **建议修改及DoD**：补可承载范围内两类扩展样本的双输入往返、实际可构造预算拒绝后的正常恢复，逐项交付尺寸、profile、时间边界、耗时和哈希。对1/4 MiB计划档位核实适用性；受装置/协议限制无法完成的子项如实保留NOT_RUN/BLOCKED及依据，不以TD登记替代验收。性能目标继续NOT_EVALUATED，直到阈值获确认；本项不要求提前冻结阈值或扩展产品容量承诺。

#### A-R3 / P1：录像异常验收仍会假绿，真实入口及最后关键帧证据不完整

- **位置**：`tools/desktop-recv/e2e/run-e2e.mjs:700`、`:1577`、`:1588`、`:1598`；`tools/desktop-recv/e2e/record-sender.mjs:34`、`:229`；run-02 `results.json:199`、`:213`。
- **核心反例（本轮两次独立受控回放）**：原样提取当前E2E-15旅程和 `waitFor` 函数执行，仅替换外部页面/IO。第一个空输入产生13005日志；第二、三个输入始终为Preparing、saveDisabled=true，只保留第一条旧错误日志。真实旅程仍返回 `true`、写 `result=PASS`。原因是等待条件扫描累计log，随后仅把saveDisabled当作“有限结束”；旧错误足以使当前未结束的导入通过。主审输出的3次观测为Idle、Preparing、Preparing，最终PASS。这是实际测试函数的内存回放，不声称本轮真实浏览器发生了该挂起。
- **真实操作缺口**：E2E-15只循环空/非视频/截断容器，最后恢复一次，没有按每个失败分支验证恢复；`importVideo` 直接给隐藏input设置DataTransfer并派发change，故这些记录不能证明用户点击录像入口、取消系统选择器并重选的操作。DataTransfer能证明导入后的应用路径，不等于入口/取消验收。
- **末帧证据缺口**：V-LAST当前为独立录制的约40秒与6秒两个片段；已提交截图也显示0.3/5.9/39.9秒。长片重建成功、短片未完成有实际字节证据，但不足以证明仅由“最后关键有效帧的保留/去除”造成差异。缺UAT-L16要求的对照构造及ended/最后frameId/解码/排空时间线。正常rVFC用例和seek fallback的末帧单测不能补作真实EOF证据。
- **依据**：AC-005/006/008/010/014；`docs/plans/test-acceptance-plan.md:155`、`:163` 的UAT-L15/16；上一轮A-01/B-S04。它不是要求实现所有视频编码格式，而是要求已报告的验收结果有对应执行判据。
- **建议修改及DoD**：E2E-15按本次导入身份、新日志/状态变化和实际可恢复终态判定；补“旧错误存在、当前仍Preparing”必须失败的回归。真实入口执行取消/重选、逐异常分支恢复并保存校验；不可构造的不支持格式明确标未测。制作可核验的最后关键帧对照（共享前缀或等价可追溯构造），记录真实EOF/在途排空顺序与落盘哈希；修复判据后重跑相关旅程并更新完成主张。

### 标准轴 B — 不通过（独立报告，1项）

#### B-R1 / P2：初始化/取消资源生命周期未完全收敛（与A-R1重叠）

1. **独立确认A-R1**：相同真实client/协调器组合，连续3次协议初始化失败，快照均Stopped且cleanupComplete=true，Worker terminate计数均0。位置及释放期望同A-R1。两轴独立重现、主审复验，作为高信号重叠，不另计主题。
2. **取消竞态补充**：位置 `web/desktop-recv/src/session.js:263`、`:119`、`:171`，`web/desktop-recv/src/ui.js:45`。初始化尚未返回时捕获取消，`_captureRejected`直接发Idle；UI和开始入口只按状态允许重启。标准轴与主审实际探针得到 `Idle, cleanupComplete=false, canStart=true`，紧接着第二次startLive返回 `accepted=true`，未决初始化从1变2。晚到client会close的修复确实存在，但取消后仍可并行积累未决实例，与IF-004/C-06“未收敛前不得新启”及D-03关闭主张不符。
3. **关闭条件**：取消时立即取消所拥有的初始化，或保持可证实的清理状态；UI和协调器均在清理收敛后才允许新会话。补初始化中取消后立即重试、连续取消、晚到client的组合断言，确保创建/关闭计数与快照一致。不要只改按钮而保留可调用入口竞态。

## Suggestions

- **S-1：统一E2E旅程失败落盘**。已披露的E2E-3/4/7/11/14/18/20在抛错时以exit1结束，但会保留旧PASS记录。独立门禁无法识别陈旧记录。建议在启动旅程时使本次结果失效，并以共用finally/catch落盘本次失败、绑定尝试标识；避免后续单独跑gate仍读取旧PASS。本轮未据此宣称这些已提交PASS均为伪造，亦不把历史成功证据自动作废。
- **S-2：rVFC主路径保护与覆盖**。`video-source.js:144` 起缺Stop主动结算/取消回调，以及帧回调内同步异常保护。标准轴受控注入capture抛异常后，异常逃出回调、run保持pending；仅Stop后pending本身未证实阻断用户重启，故不单列Blocking。UT-069/070/071走seek fallback；建议在实际rVFC路径补故障/Stop回归并处理回调归属。
- **S-3：可复核交付与文档快照**。录像输入在gitignored的fixtures-media中，干净克隆不能直接重放；建议给出可获取录像、完整摘要和重建方式。run-01支持矩阵是历史快照，不应用其“需真人操作”替代当前run-02支持记录；stage5摘要的基线/计数已混入后续round7修订，宜刷新到明确提交。外审轮次编号也应在消费本verdict后由编排方统一。以上不要求修改历史证据字节。

## Reviewer

- 主审：`codex-gpt-6`，独立于实施方Claude；日期：2026-10-21，Asia/Shanghai。
- 新独立Reviewer A：`/root/rectification_spec`；新独立Reviewer B：`/root/rectification_standards`。两者按同一17项rubric分别审查，无交叉传阅结论；主审收到报告后独立复现关键反例。两轴报告保留原顺序，不跨轴合并排序。
- 方法：dev-pipeline阶段6、code-review双轴、thermos角色与镜头、santa-method双过才放行、verification-before-completion、testing-protocol、code-review-excellence。规范依据为用户指令及冻结需求/契约/测试计划，不发明仓库风格规则。未启动产品整改或发布。
- 审查索引：当前stage5-dev-summary、autonomous-decisions、Round-2包及模板、Round-1 verdict；固定源码/diff/提交；AC与decision-log、模块契约/错误矩阵、实施及测试计划、planning-cases、内部round7/8、技术债；run-01历史基线、run-02结果/逐旅程proof/批次说明、现场手册和回执。内部旧round1～6的既有审查结论仅作为历史，不当成本轮新执行结果。

### 上轮7个Blocking主题闭环核对

| 上轮主题 | 本轮结论 |
|---|---|
| A-01 本地E2E和总结缺失 | 总结/决策索引已补，大量真实保存/哈希证据已补；完整覆盖主张仍被A-R2/A-R3阻断，TD-12关闭过早 |
| A-02 Incomplete不能重启 | 已修：协调器终态集包含Incomplete；相关单测本轮实际通过 |
| A-03 Worker故障不结算/无有效看门狗 | error/messageerror、主线程init/frame超时等已补；协议init-failed释放仍缺，见A-R1/B-R1 |
| A-04 FAIL/NOT_RUN/mock门禁假绿 | 原门禁漏洞已修：本轮自测14/14；PASS/scope/executor/计划caseType与磁盘哈希均核对。E2E旅程自身假绿另见A-R3，记录校验不能代替执行判据 |
| B-S04 seek无界及末帧 | seek error/timeout/Stop和tail采样已补；真实最后关键帧因果/时间线尚缺，见A-R3；rVFC覆盖建议见S-2 |
| C-01 路径参数及假启动成功 | 参数引用及监听检查已修，提交的E2E-1/2有双输入/占用端口证据；主审新中文空格目录服务探针HTTP200。原“pwsh平台缺陷”归因已撤回，不要求改系统UTF-8设置 |
| C-02 取消不释放客户端 | 已ready/晚到client的close已补，但未决初始化未收敛仍可新启，见B-R1；不能宣称全部关闭 |

### 本轮实际执行及证据边界

| 检查 | 实际结果与边界 |
|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | exit0，9套件90测试，0 fail/todo/skip；不代替真实系统操作 |
| `python tools/desktop-recv/verify-evidence-selftest.py` | exit0，14/14；含失败/未执行/错scope/错类型/缺工件/字节不等/缺阈值等拒绝 |
| `node tools/desktop-recv/verify-assets.mjs --root build-desktop-recv/staging/receiver` | exit0，PASS；sourceRevision=a515922d…，未冒充当前HEAD构建；WASM SHA-256=d1080cdc600ca842a337b8ea6157bc5cc2c545aaa75fce7b14e8585e9eb4685b |
| run-02 `verify-evidence.py --gate local` | exit0，20 required cases；证明当前记录、工件及哈希满足门禁，不能证明遗漏子步骤完成 |
| 同run `--gate field` | exit1，缺E2E-21～26六条记录；现场回执仍NOT_RUN，这是正确拒绝而非本轮新增产品Blocking |
| 独立磁盘复算 | 20对主工件全部与记录SHA-256一致；另E2E-3六轮、14六轮、19四轮、20十轮输出分别与对应原样本逐轮重算一致，共26子轮 |
| 资源组合探针 | 主审及两轴复现init-failed三次不terminate；主审及标准轴复现取消后未决初始化1→2且允许新会话；均为受控代码组合，不冒充真实浏览器内存实测 |
| E2E-15实际函数回放 | 规格轴和主审分别原样提取旅程/waitFor，当前Preparing+旧错误日志仍返回true/PASS；仅替换外部IO与页面状态，不改原记录 |
| 中文/空格目录新服务探针 | 原样候选复制到新临时目录，从其他cwd调用launch.ps1；主审独立HTTP请求200且包含产品页，观察launcher exit0；只停止本探针Python进程67508。外层PowerShell管道等待子进程，清理阶段又查询已停止PID产生Null诊断，未将此辅助探针冒充完整E2E-1重跑或新的启动器缺陷 |
| 既有native/WASM | 整改diff未触碰C++共享源；沿用上轮实跑9/9历史证据，本轮未重跑ctest或重建WASM |
| 敏感信息定向扫描 | 固定完整差异内286份可解码文本，私钥/AWS/GitHub/OpenAI凭据模式0匹配；仅表示该扫描范围无命中 |
| 本轮真实系统双输入全旅程/云桌面 | 未重新执行；run-02截图、日志和落盘工件是研发提交的操作证据，经核对不提升为主审本轮现场实测 |

### 固定17项清单及Todo复核

| 项 | 结论与落点 |
|---|---|
| ①需求/任务覆盖 | FAIL：A-R2/A-R3，冻结本地验收与T4.2.a未完整完成 |
| ②源码/设计一致 | FAIL：A-R1/B-R1资源所有权及未收敛新启 |
| ③文档一致 | 摘要和决策索引已补；“全部7主题修复/20条全完成”仍超出证据，见Blocking；历史快照建议S-3 |
| ④最小范围 | 整改集中接收端/测试/文档；无新C++差异，不要求重写发送端或协议 |
| ⑤过度设计 | 无独立Blocking；建议复用清理和旅程包装机制，非新增框架要求 |
| ⑥既往内审反馈 | round7的类型/负向腿/关页整改已存在；round8 PASS未发现本轮资源/覆盖遗漏，不能替代独立结论 |
| ⑦正常与异常功能 | 正常工件字节证据成立；初始化失败/取消恢复仍FAIL，见A-R1/B-R1 |
| ⑧桩/死代码/效率 | 未发现本次生产路径以mock/TODO替代功能的Blocking；rVFC保护和runner维护建议S-1/2 |
| ⑨回归 | 90单测本轮通过；native历史复用有明确不变范围，未声称全平台重验 |
| ⑩敏感信息 | 已执行上述定向扫描，无命中；不扩大为通用安全认证 |
| ⑪假绿 | FAIL：E2E-15旧错误日志反例；主工件哈希相等不免除此问题 |
| ⑫真实操作E2E | 真实往返/系统保存证据大幅补齐，入口取消/末帧及规模验收仍缺；见A-R2/A-R3 |
| ⑬自主决策依据 | 索引已核对；TD-15规模边界和装置限制披露不等于用户豁免冻结测试，D-02/03/16关闭主张需修正 |
| ⑭前轮Blocking | 按上表逐项区分已关闭/部分关闭，无机械继承旧FAIL |
| ⑮本轮执行证据 | 上表逐项列fresh、历史、受控与未执行，不相互替代 |
| ⑯阻断三元组 | 每个主题均列源码位置、实际证据、修改/复验DoD |
| ⑰开发总结核验 | FAIL：T4.2.a、资源全部出口收敛、完整本地验收声明与源码/实测不符 |

Todo：固定范围、读取索引与核心证据、全新双轴审查、必要检查复跑、关键反例复验、verdict落盘与只读范围复核均完成。审查完成不代表产品通过；后续整改与流水线状态更新归Claude。

# 独立外部审查 — Round-8提交包复审

## Verdict

不通过

固定HEAD：`56f2d5a14591d7a4c48a4a1f04ced01f468f86a4`，分支 `screen-capture-recv`。整改范围 `3a8041be92fc5635305e60452cb0ebafecf89dd4...56f2d5a14591d7a4c48a4a1f04ced01f468f86a4`（3提交、13文件、+485/-39）；完整范围 `bfb0c8e471820ae493cd3694ea6bed5d5ac06c37...56f2d5a14591d7a4c48a4a1f04ced01f468f86a4`（76提交、766文件、+44,310/-9）。包中75提交是99aaf05快照。当前ext_rounds=8，按dev-pipeline公式输出round-9-verdict，对应Round-8包。

规格轴A、标准轴B均不通过，各1项P2 Blocking，重叠为同一个B-R1残留：**正常局部合并已修，但场景提前失败后的最终归属戳仍会把历史量测腿登记为该失败尝试执行，污染后续合并来源。** 主审亦独立复现。

本轮118项单测、14项证据自测、3项前缀自测、资产校验和本地门禁均通过；它们尚未覆盖以下异常出口。上轮已经关闭的逐异常恢复、末帧配对、保存量测三项继续有效；本轮产品及原始运行证据均无变动，不重新打开这些验收。

仍仅剩**1个证据工具问题**，不要求桌面E2E重跑、媒体重录或扩展容量测试。请Claude阶段6消费本文件，携B-R1返回阶段5补异常路径与回归；不能推进阶段7。

本轮只新增本verdict，不修改产品、原始证据或流水线状态。

## Blocking issues

### 规格轴 A — 不通过（A-R1 / P2，与B-R1同主题）

- **位置**：`tools/desktop-recv/e2e/run-e2e.mjs:2995`、`:3811`、`:3840`、`:3879`；`tools/desktop-recv/e2e/evidence.mjs:153`。
- **问题/原因**：writeAttemptMarker保留旧measurement，但没有将这些保留数据与本次新执行腿区分；ensureExtendedFixtures发生在合并打标之前，失败时最终finally仍调用stampAttemptId。marker内的历史腿未经过tagCarriedLegs，缺executedInAttempt和carriedInAttempt，被stampLegAttempts误当fresh。即使场景已在另一份readResults内存对象上打标，中途抛错且尚未upsert时，最终读取的磁盘marker仍未被保护。
- **独立证据**：规格轴以当前真实十腿记录，原样抽取当前main、E2E-18场景及marker/annotate/stamp函数，仅把IO适配为内存并注入fixture生成失败，得到 `result=FAIL, legsClaimingExecutionInFailedAttempt=10`。九条历史PASS及一条NOT_RUN均被盖为失败attempt；随后正常局部合并，九条携带腿继续沿用该错误origin。没有启动桌面或改原文件。
- **依据**：AC-005、C-12、Round-7 B-R1最小DoD及阶段6⑫/⑭/⑰。case顶层FAIL是正确的，不能抵消腿级执行来源被改写。新实现的“只盖fresh、历史携带腿永不重标”主张仍超出完整异常路径。
- **关闭条件**：失败marker保留的历史量测不得被戳为fresh，也不得污染随后成功合并；见下面标准轴/主审的有限DoD。

### 标准轴 B — 不通过（B-R1 / P2）

**B-R1：场景提前失败时仍重标历史腿；正常路径修复未覆盖异常收敛。**

- **位置**：同规格轴；关键保留点为 `run-e2e.mjs:3811`，最终戳记为`:3840`和`:3879`，可达失败入口为`:2995`；`ensureExtendedFixtures`在`:1134`起明确对非零退出/无效manifest抛错。
- **标准轴独立复现**：在隔离临时目录使用当前真实记录和从当前源码抽取的writeAttemptMarker、annotateAttemptFailure、stampAttemptId，模拟merge前异常，输出 `originalLegacyLegs=10, beforeOrigin=0, failedMarkerResult=FAIL, wronglyAttributedAfterAbort=10`。再次正常合并，九条携带腿的carriedInAttempt.origin错误变成失败attempt。
- **主审独立复验**：以纯内存IO原样执行同三个真实函数，当前十腿先生成marker，模拟 `ensureExtendedFixtures failed before merge`，按现有catch/finally执行。输出 `result=FAIL, oldLegCount=10, reattributedOldLegs=10, filesWritten=0`。这是实际包装函数的受控异常复现，不冒充真实Python故障或桌面执行；触发路径由源码中真实可抛错的fixture步骤支持。
- **影响**：这不是现有已提交文件内容或保存量测错误；它会使一次尚未执行任何腿的失败尝试获得历史执行身份。下一次正常复跑的打标器看到这个错误“已知origin”后会保留它，使后续成功记录继承错误来源。case FAIL能阻止本次门禁通过，却不能阻止来源污染继续传播。
- **最小修复/DoD**：明确区分“marker保留的历史measurement”和“本次场景实际产出的腿”，在所有出口只给后者盖本次执行章。可在保存marker时提前标记/隔离历史基底，或使用明确的本次生成集合；不能仅依赖场景正常路径中较晚发生的tag，也不能以当前attempt兜底历史来源。保留正常legacy合并、已有origin、多次合并、probe自动重执行、全量重跑测试。
- **必须补的有限回归**：使用当前真实legacy记录形状，覆盖 `marker → merge前抛错 → catch/finally → 下一次正常局部合并`；另覆盖“已在场景内打tag、但写入新结果前抛错”。两类均应保持case失败状态、旧腿不归属失败attempt，后续成功合并也不继承错误origin。fresh已实际执行的腿仍正确归属。可用内存或临时运行目录完成，无需真实系统对话框或大录像重跑。
- **文档同步**：在上述反例关闭后再登记B-R1全部关闭；仅修改文字、保留自动错误回填路径不满足DoD。

两轴的同一异常出口问题经主审复现，按高信号重叠合成为1个Blocking主题，未将重复发现计成更多问题。

## Suggestions

无新增非阻断建议。Round-7 S-1已采纳：保存量测必检及排序现为四时点，主审验证当前14条保存腿全部通过，删除picker标记的反例均被拒绝。历史environment快照按既定安排留阶段8刷新，不新增本轮审批或桌面复验要求。

## Reviewer

- 主审：`codex-gpt-6`（独立于实施方Claude）；日期2026-10-22，Asia/Shanghai。
- 全新规格审查者：`/root/round9_spec`；全新标准审查者：`/root/round9_standards`。同一17项rubric并行只读，未互看报告；主审独立运行关键正负探针。两轴各自原结论保留，不跨轴重排。
- 方法：dev-pipeline阶段6、code-review双轴、thermos角色/镜头、santa-method双过才放行、verification-before-completion、testing-protocol、code-review-excellence。使用用户指令、冻结需求/契约/计划及既有代码约定；未发现仓库AGENTS/CONTRIBUTING/CODING_STANDARDS/GLOSSARY/ADR文件，不虚构风格规范。
- 材料：当前stage5摘要及其diff、Round-8包/模板、Round-7 verdict、round-7 triage/tasks、内审13、自主决策索引、AC/C-12及实施/测试计划、固定源码与三提交差异、run-03当前记录/量测及既有proof。此前已验收且本轮字节未改的证据明确沿用，不将历史执行说成本轮新执行。

### 已验证的修复与保留边界

| 项 | 本轮结论 |
|---|---|
| 正常legacy局部合并 | 已修。主审从当前真实十腿取九携带+一fresh，tag后stamp：携带腿重标数0、origin明确unknown，仅fresh获当前执行章 |
| 已有origin/第二次合并 | 已修。主审两次合并复验，上一轮实际执行腿的executedInAttempt与carriedInAttempt.origin均保留；只有新执行腿获新章 |
| 全量重跑与probe集合 | 空重执行集合不标carried，真正新腿可正常盖章；probe自动加入4MiB重执行集合在tag之前，ACTIVE_ATTEMPT_ID在marker/scenario之前赋值，接线顺序成立 |
| 异常marker/最终收敛 | 未修，见B-R1；正常路径的上述结果不证明失败路径成立 |
| 保存四时点 | 已采纳。14条现有含保存腿四时点断言通过，缺picker及乱序负例拒绝；未弱化既有量测 |
| 旧三项验收 | 继续关闭。E2E-15逐异常恢复、E2E-16同流末段配对、保存量测分项均已在Round-7核验；本轮产品/媒体/原始记录无差异，无需重复桌面旅程 |
| 现场与交付 | E2E-21～26仍NOT_RUN；性能NOT_EVALUATED，额外难压缩20MiB仍单列NOT_RUN；阶段8最终包复验/环境绑定保留，不由本轮代填 |

### 本轮实际执行

| 检查 | 实际结果及边界 |
|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | exit0；9套件118测试，evidence34，0 fail/todo/skip。UT-111/112/113正常路径已通过，异常marker反例未被其覆盖 |
| `python tools/desktop-recv/verify-evidence-selftest.py` | exit0，14/14 |
| `python tools/desktop-recv/e2e/video-prefix-check.py --selftest` | exit0，3/3，含正例及头/尾负例；现存媒体的Round-7完整共有前缀实证按未变字节沿用 |
| `node tools/desktop-recv/verify-assets.mjs --root build-desktop-recv/staging/receiver` | exit0/PASS；revision=a515922d…，WASM SHA=d1080cdc600ca842a337b8ea6157bc5cc2c545aaa75fce7b14e8585e9eb4685b；没有重建或伪称当前HEAD二进制来源 |
| run-03 `verify-evidence.py --gate local` | exit0/PASS(20)；另主审独立重算20对主工件SHA，全部与记录原/收hash相等 |
| 同run `--gate field` | exit1，缺E2E-21～26六条记录；正确拒绝未执行现场，不单独作为本轮产品Blocking |
| 主审正负探针 | 当前真实legacy正常合并、第二次合并、空集合/全量、14保存腿及缺picker负例通过；真实marker/annotate/stamp异常收敛反例重标10腿，见上文 |
| 改动/证据不变核对 | `3a8041b...HEAD -- web/desktop-recv/src web/desktop-recv/worker src/` 无差异；`-- docs/tests/runs` 无差异。原始results/媒体/量测没有因本轮审查改写；native9/9为Round-1历史，不声称本轮复跑 |
| 凭据定向扫描 | 本轮差异内13份可解码文本，私钥/AWS/GitHub/OpenAI凭据模式0命中；此前完整范围扫描按历史范围保留，不扩称全面安全认证 |
| 本轮未执行 | 未启动桌面E2E或重新录制媒体；所有包装器异常实证为内存/隔离目录探针，未修改研发原证据 |

### 固定17项清单与Todo

| 项 | 本轮判断 |
|---|---|
| ①修复是否遗漏 | FAIL：B-R1遗漏失败marker/场景提前中断出口 |
| ②契约对齐 | 正常carried/fresh已区分；失败历史腿仍被冒充本次执行，不符AC-005/C-12 |
| ③文档一致 | 正常路径主张有据，B-R1“已全部关闭”仍超出异常路径实现 |
| ④范围 | 小范围证据工具/测试/文档，无产品/共享模块改动 |
| ⑤过度设计 | 无独立Blocking，不要求新框架或新容量档位 |
| ⑥内审反馈 | 内审13正向复验有效，未覆盖本轮异常反例 |
| ⑦正常功能 | 未发现产品正常接收路径回归；成功记录/字节不因工具问题作废 |
| ⑧桩/死代码/效率 | 未发现业务桩或风格类Blocking；仅聚焦执行归属错误 |
| ⑨回归 | 118单测等本轮通过；产品未变，无机械桌面全量要求 |
| ⑩敏感信息 | 本轮13文本定向扫描0命中 |
| ⑪假绿/错误主张 | case FAIL如实，但腿级假执行身份可传播进后续PASS，B-R1 |
| ⑫测试设计 | UT-112补正常legacy形状，尚缺marker→异常→后续合并形状 |
| ⑬自主决策 | unknown来源标注方向正确；无需新增用户授权或范围缩减 |
| ⑭前轮Blocking | 正常分支已修、异常出口未闭环；旧三项不重开 |
| ⑮执行证据 | fresh命令/受控异常/历史桌面证据/未执行现场分别标注 |
| ⑯三元组 | 唯一B-R1有精确位置、三方独立复现和有限DoD |
| ⑰摘要核验 | B-R1完整关闭声明被当前真实输入的异常反例推翻 |

Todo：固定版本、索引与核心材料复核、全新双轴、必要命令复跑、正常及异常探针、verdict与只读边界复核完成。后续仅完善失败marker的历史/本次身份隔离及上述回归；不重跑桌面E2E、不重新打开已关闭验收。由Claude处理整改及流水线状态，本文件为本轮唯一审查接口。

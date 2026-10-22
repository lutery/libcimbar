# 独立外部审查 — Round-6提交包复审

## Verdict

不通过

固定HEAD：`3a8041be92fc5635305e60452cb0ebafecf89dd4`，分支 `screen-capture-recv`。整改范围为 `faf89067d43ea12822b5b190e4661d7a99b79654...3a8041be92fc5635305e60452cb0ebafecf89dd4`（8提交、51文件、+5,351/-967）；完整范围为 `bfb0c8e471820ae493cd3694ea6bed5d5ac06c37...3a8041be92fc5635305e60452cb0ebafecf89dd4`（73提交、760文件、+43,864/-9）。包内72提交是1167a2b快照。本轮对应Round-6提交包，状态ext_rounds=6，按公式输出round-7-verdict。

**上轮3项Blocking均已关闭。** E2E-15逐异常真实恢复、E2E-16同流配对及末段完成、14条保存量测分解，均有当前源码和可复核证据。本轮116项单测、14项证据自测、3项前缀自测、现存录像前缀检查、资产及本地证据门禁全部通过。

规格轴A通过（0 Blocking，1条归属迁移Suggestion）；标准轴B不通过（1项P2 Blocking）。两轴对剩余缺陷的事实判断一致、对是否可延后存在分歧；主审独立复现后采纳标准轴判级：本轮新增的最终归属戳记仍会把当前历史腿错误登记为新尝试执行，且交付包声称该路径已修。依双轴均过及fail-closed规则，本轮不通过，不能推进阶段7。

仅剩下述**1个证据工具阻断**。不否认当前文件正确性和已完成的验收操作；修复只需工具/归属迁移或拒绝逻辑及回归验证，**不要求重跑桌面E2E或重新录制大录像**。

本轮只新增本verdict，不改产品、原始证据、流水线状态。请Claude阶段6读取本文件，携B-R1回阶段5完成小范围整改后复审。

## Blocking issues

### 规格轴 A — 通过（0 Blocking）

独立原结论保留：上轮A-01/A-02/A-03均关闭；本轴认为现有包已文字披露历史腿来源，当前有效证据可以放行，将首次局部合并的旧记录迁移列为Suggestion。没有将尚未执行的现场、性能阈值或额外难压缩20 MiB腿升级为本轮阻断。

本轴的归属Suggestion事实：当前十腿缺executedInAttempt，下次仅重跑预算腿时，九条携带腿会被当前stamp函数标成新attempt；应在下次局部复跑前迁移/拒绝未知归属。该发现与标准轴B-R1重叠，但本轴原严重度未被改写。

### 标准轴 B — 不通过（1项）

#### B-R1 / P2：当前历史基线的首次局部复跑仍会错误重标携带腿

- **位置**：`tools/desktop-recv/e2e/evidence.mjs:119`～`:123`；`tools/desktop-recv/e2e/run-e2e.mjs:3006`～`:3011`、`:3771`～`:3802`、`:3819`～`:3832`；`web/desktop-recv/tests/unit/evidence.test.mjs:730`。
- **问题及原因**：`stampLegAttempts()`把“缺executedInAttempt”当成“本次新执行”，对所有缺字段的腿填写当前attempt。合并路径只是原样携带旧腿；启动marker已先替换记录级attemptId，最终写入时无法据此恢复旧腿来源。当前run-03 E2E-18十腿恰好全部缺该字段，1167a2b只保证已有origin的携带腿不被覆盖，没有迁移当前会被消费的历史形状。
- **本轮实际证据**：规格轴、标准轴和主审分别用实际当前results的内存副本，按 `--legs live-c-20mib-over-budget` 流程保留九条旧腿、替换一条新预算腿，再调用真实stampLegAttempts。主审输出：`legacyCarried=9, oldExecutedLegs=8, reattributedCarried=9`；九条携带腿均被标为 `review-memory-next-partial`，与新腿相同。没有写入任何原文件、没有声称真实桌面重跑。已披露的八条保存执行腿实际来自3e34f2，不能因字段缺失就改成新尝试执行。
- **测试及交付主张差距**：UT-111覆盖的是携带腿预先已有origin的情形，遗漏本包当前未迁移记录。Round-12 S-1提出的“下次合并前修复”及Round-6包所称“归属戳改到最终写入，未来合并归属正确”仍不完全成立。当前文字披露准确，不等于工具下一次生成的机器归属也正确。
- **依据与影响**：AC-005、C-12、真实/历史执行不得混淆，以及阶段6清单⑫/⑰。影响的是后续局部复验的证据来源，不是已保存文件内容；后续操作者会得到“本次执行了未重跑腿”的错误记录。
- **最小DoD**：在合并时显式区分carried与fresh；只给本次执行腿戳当前attempt。携带腿保留已核实来源；历史字段缺失时进行有证据的迁移，或明确unknown并拒绝把它当成本次执行，不能用当前合并attempt兜底。补“当前真实记录形状：九条缺origin携带腿+一条新腿”的回归，并保留已有origin不覆盖的测试。同步修正完成主张。可用内存/临时运行目录验证，无需桌面重跑；不能仅再次调整文案而保留错误自动回填路径。

### 主审合成裁决

标准轴的失败不被规格轴通过掩盖。该问题位于本轮修改并宣称修复的证据工具路径，具备当前输入和可执行反例；主审认可P2 Blocking。当前既有E2E和量测证据继续有效，整改范围仅B-R1，不重新打开已关闭的上轮三项。

## Suggestions

- **S-1 / Suggestion：保存分项断言补全**。`leg-timings.mjs`的必检集仍只含saveRequestAt/writableAt/writeCloseAt，没有强制createWritableAccessedAt。当前14条保存腿均实际含四个时点且有序，本轮未缺项，故不阻断；建议后续将独立picker分项所依赖的标记纳入断言，避免未来报告再次出现分项null。不需新增用户审批。
- **S-2 / Suggestion：环境快照与当前尝试显式区分**。environment.json仍是cb43f85时期的历史快照，当前摘要和复现指南已逐attempt说明新证据；建议最终交付时补当前环境/候选摘要并保留历史快照，避免消费者将108测试历史值读成当前116。阶段8最终包仍须绑定其实际字节与复验，不以本轮外审代替。

## Reviewer

- 主审：`codex-gpt-6`（独立于实施方Claude）；日期2026-10-22，Asia/Shanghai。
- 全新规格审查者：`/root/round7_spec`；全新标准审查者：`/root/round7_standards`。按同一17项rubric并行只读、未互看报告，主审独立复验。两轴原顺序、结论及判级分歧分别保留，不跨轴重排。
- 方法：dev-pipeline阶段6、code-review双轴、thermos角色/镜头、santa-method双过才放行、verification-before-completion、testing-protocol、code-review-excellence。规范依据为用户指令、冻结需求/契约/测试计划及既有约定；未发现仓库AGENTS/CONTRIBUTING/CODING_STANDARDS/GLOSSARY/ADR文件，不虚构风格要求。
- 材料：stage5摘要、Round-6包/模板、Round-5 verdict、round-5 triage/tasks、自主决策D-19/20/21、AC/decision-log、模块契约/错误矩阵、实施/TDD/E2E计划、内审11/12及技术债、固定源码/diff、run-03当前记录/复现指南/量测/媒体manifest/前缀证明/时间线/逐案工件。旧run-01/02和旧审查为历史，不冒充本轮执行。

### 上轮3项闭环

| 上轮项 | 本轮关闭证据 |
|---|---|
| A-01 E2E-15逐异常恢复 | 同一页面顺序执行取消→恢复、empty→恢复、text→恢复、corrupt→恢复，共8腿。恢复使用真实录像入口/系统对话框；video-1/3/5/7身份推进，各有独立received.bin。主审复算四文件SHA均与原样本/记录相等；保存量测4907/4637/6804/4256ms齐全 |
| A-02 E2E-16前缀/末段因果 | 同一流、同任务双MediaRecorder，declared cut=6500ms、with=9500ms；现存两录像/载荷摘要吻合清单。前缀工具head差0、tail3/3；主审和两轴另独立解码全部without81帧，与with前81帧中央编码区域逐帧完全相等。with T*=8.869s处于9.3s媒体末段，artifact@105后保存；without真实EOF6.348s无产物并完成有限补采。时间量纲lastUs/1e6已修；没有把with说成自然EOF完成 |
| A-03/B-S1保存后读/分项 | completeLegSave统一真实保存→重读状态→量测/哈希。14条保存腿四时点均非空有序；save=saveWait+saveWrite、saveWait=pickerWait+writableOpen逐条成立；7条无保存腿明确缺项。主审在隔离临时目录重跑summarize，JSON结构与提交版完全一致，报告正文完全一致（仅临时runId标题不同） |

### 本轮实际验证与范围

| 检查 | 本轮结果及边界 |
|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | exit0；9套件116测试（evidence32），0 fail/todo/skip |
| `python tools/desktop-recv/verify-evidence-selftest.py` | exit0；14/14 |
| `python tools/desktop-recv/e2e/video-prefix-check.py --selftest` | exit0；3/3，含同前缀正例、错头/截尾负例 |
| 同工具检查现存V-LAST对，`--cut-ms 6500` | exit0/PASS；with126帧、without81帧；head30帧offset0差0；tail3/3匹配 |
| 独立完整前缀核对 | cv2逐帧解码现存录像，对全部81个共有帧的中央编码ROI逐同索引比较：平均差0、最大帧差0、81/81完全相等；规格轴另核对PTS亦一致。不扩大为全画面每像素相等或全平台媒体证明 |
| `verify-assets.mjs --root build-desktop-recv/staging/receiver` | exit0/PASS；assetSetId=desktop-recv-v1，revision=a515922d…；WASM SHA=d1080cdc600ca842a337b8ea6157bc5cc2c545aaa75fce7b14e8585e9eb4685b。来源如实，未声称当前HEAD重建WASM |
| run-03 `verify-evidence.py --gate local` | exit0/PASS(20)，记录及主工件门禁有效；不由此替代单独核对验收子项 |
| 同run `--gate field` | exit1，缺E2E-21～26六条记录；现场仍NOT_RUN，正确拒绝。它不单独阻止交付本地测试包，也不等于现场通过 |
| SHA-256 | 20对主工件均与记录原/收hash相等；E2E-15四个独立恢复文件、E2E-18九条执行/预算恢复文件逐项复算相等；当前及入库配对manifest的录像、载荷摘要均重算吻合 |
| 保存量测复算 | 21腿中14条含保存、7条无保存；四时点及两条分解恒等式全部成立，分项未混入解码吞吐；阈值未冻结继续NOT_EVALUATED |
| 判据正负探针 | 当前配对记录正向通过；早段完成/缺真实EOF被拒；恢复正例通过，单有helper exit0而应用未摄入/未完成/未保存被拒 |
| 归属反例 | 真实当前旧记录的九携带+一新腿，调用真实最终stamp后九携带腿全被标新attempt；纯内存，不改文件，见B-R1 |
| 产品/共享字节 | 唯一产品变动为app最多16条tailEvents诊断，无功能路径回读；自1650a09至本轮HEAD产品src无新差异，当前src与staging逐文件SHA相等。C++/worker无本轮改动；native9/9沿用Round-1历史，本轮未重跑/重建 |
| 历史/敏感信息 | run-02本轮无差异；固定完整差异内506份可解码文本，私钥/AWS/GitHub/OpenAI凭据定向模式0命中，仅限该扫描范围 |
| 本轮未执行项 | 未重新占用桌面跑全20旅程；真实OS操作的记录为研发本轮提交、经源码/时间线/文件核验。现场、未公布格式/DPI及阶段8最终包未执行，不冒充通过 |

### 固定17项清单与Todo

| 项 | 结论 |
|---|---|
| ①需求/任务 | 上轮三项实质闭环；本轮新增工具归属修复仍不完整，B-R1 |
| ②代码/设计 | 真实恢复/配对/量测对齐；历史/本次执行身份须再收敛 |
| ③文档 | 当前归属已诚实文字披露；“未来合并正确/已修”主张仍超出代码，B-R1 |
| ④范围 | 仅验收工具/文档和有界诊断；无发送协议/C++扩展 |
| ⑤过度设计 | 无独立Blocking，不要求新增框架或更多容量档位 |
| ⑥内审反馈 | R11三项呈现修复已存在；R12归属must-fix只覆盖部分形状，见B-R1 |
| ⑦功能 | 未发现本轮诊断改动破坏正常接收路径；不因工具问题否定成功文件 |
| ⑧桩/死代码/效率 | 未发现业务mock/TODO伪装实现的Blocking；不以普通风格阻断 |
| ⑨回归 | 116单测等本轮通过，共享二进制历史复用边界明确 |
| ⑩敏感信息 | 定向扫描无命中，不扩称安全认证 |
| ⑪假绿 | 旧日志/末帧自证问题已修；未来局部复验身份伪归属仍可复现 |
| ⑫测试设计 | 当前实际操作覆盖闭环；UT-111漏当前legacy输入，B-R1 |
| ⑬决策 | D19已按实施方判断说明，额外20MiB随机NOT_RUN不新设审批；D20/21与实物一致 |
| ⑭前轮阻断 | 三项均关闭，不机械继承旧FAIL |
| ⑮执行证据 | fresh命令/内存探针/提交桌面记录/历史native/现场未执行分列 |
| ⑯阻断三元组 | B-R1有位置、独立复现、有限DoD |
| ⑰摘要核验 | 核心完成证据成立；归属修复完成主张尚被当前反例推翻 |

Todo：固定版本、读取索引及核心证据、全新双轴、命令复跑、旧阻断闭环/新反例核验、verdict与只读边界复核完成。后续仅修B-R1并用当前真实形状回归验证；不重新开上轮三项、不机械重跑已验收旅程。修复后由Claude阶段6提交新版本复审，审查者不代改流水线状态。

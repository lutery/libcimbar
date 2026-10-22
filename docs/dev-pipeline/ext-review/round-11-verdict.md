# 独立外部审查 — Round-10提交包复审

## Verdict

通过

固定HEAD：`7f705bead6fe6259417f8a43f340b10b840f6889`，分支 `screen-capture-recv`。本轮整改范围 `56f2d5a14591d7a4c48a4a1f04ced01f468f86a4...7f705bead6fe6259417f8a43f340b10b840f6889`：2提交、12文件、+444/-14。完整范围 `bfb0c8e471820ae493cd3694ea6bed5d5ac06c37...7f705bead6fe6259417f8a43f340b10b840f6889`：78提交、772文件、+44,740/-9。包中的77提交/768文件/+44,541/-9明确为`d609ab2`快照，主审实查一致。状态ext_rounds=10，按N=ext_rounds+1输出本round-11-verdict，对应Round-10包。

全新规格轴A、标准轴B均PASS，**0 Blocking、0新增建议**。唯一前轮阻断B-R1（异常出口）已关闭：marker在任何场景代码开始前隔离历史量测腿，提前失败后的最终戳记不再将旧腿归属于失败尝试，后续成功合并不继承错误来源。主审以真实包装函数独立重放，并移除新增调用作反例对照，确认错误归属数由10降为0。

Claude阶段6可消费本文件，推进阶段7。该裁决针对本阶段整改；用户现场E2E-21～26仍NOT_RUN，性能仍NOT_EVALUATED，阶段8最终装配/环境绑定仍待执行，不能据此登记现场或最终发布已验收。

本轮只新增本verdict，不修改产品代码、原始运行证据或流水线状态。

## Blocking issues

### 规格轴 A — 通过

None。前轮A-R1（与B-R1同主题）关闭。

- 位置：`tools/desktop-recv/e2e/evidence.mjs:150`、`tools/desktop-recv/e2e/run-e2e.mjs:3818`、`:3868`、`:3875`、`:3886`。
- 证据：真实`writeAttemptMarker / annotateAttemptFailure / stampAttemptId`原样抽取、仅IO适配为深拷贝内存；使用当前run-03真实十腿，unknown/已有executed origin × 合并前异常/场景已tag但upsert前异常四组合，旧腿错误归属均0，case保持FAIL；下一合并九条携带腿不继承失败来源，fresh正确获新章。连续第二次提前失败、全量十条fresh及probe八条carried的独立探针通过。
- DoD：满足round-9-verdict要求的两个异常出口、后续合并、正常路径及文档同步。符合AC-005、C-12的执行范围与来源分层。无新增规格缺失或范围扩张。

### 标准轴 B — 通过

None。前轮B-R1关闭。

- 位置：同上；回归`web/desktop-recv/tests/unit/evidence.test.mjs:826`、`:880`。
- 证据：独立标准审查者以真实包装函数和真实十腿分别执行两个受控异常出口，旧腿重标0；下一成功合并九条origin=unknown、fresh正确盖章，已知origin及多轮/全量/空集合探针通过。移除marker打标调用的对照恢复10条错误归属。evidence套件36/36；将打标helper变为no-op时UT-114失败，当前UT-114/115均通过。
- DoD：marker历史基底已在场景前落盘保护，最终戳记fresh-only规则未弱化；未见产品回归、安全或结构性Blocking。

### 主审独立闭环复验

| 反例/边界 | 实际结果 |
|---|---|
| 当前真实十腿，marker→合并前抛错→catch/finally | FAIL保留；历史腿重标0；下一合并9条携带腿来源不含失败attempt |
| 场景副本已tag、尚未upsert即抛错 | 磁盘等价内存marker与场景副本隔离；历史腿重标0，未写入的fresh不冒充已落盘执行 |
| 上述两类分别加入已知origin | 已有executedInAttempt保留，后续合并不降级为失败attempt或unknown |
| 消融对照：只移除新增marker保护调用 | 两类异常均恢复旧缺陷：10条历史腿归属失败attempt；与当前0形成有效红绿对照 |
| 后续成功合并、全量fresh、无measurement空操作 | fresh正确盖新章；全量不携带旧腿；空操作安全 |

主审探针原样使用当前三个包装函数，仅IO替换为内存；异常为受控注入，不冒充真实Python故障或桌面执行。探针仓库写入数0。UT-114/115属于helper级形状回归，不宣称直接执行main；本轮真实wrapper探针及接线时序核验补足了这层验证。新增调用位于marker复制measurement之后、upsert之前，且先于场景及其ensureExtendedFixtures等可抛错步骤。

## Suggestions

无新增非阻断建议。

内审14 S-1所指`round-9-tasks.md`已随`7f705be`入库，引用工件缺失问题关闭。environment.json按前轮已确认安排保留历史快照，阶段8再绑定最终包与当前环境；不新增本轮桌面重跑要求。此前已关闭的逐异常恢复、同流末段配对、保存分项继续有效。

## Reviewer

- 主审：`codex-gpt-6`（独立于实施方Claude）；日期2026-10-22，Asia/Shanghai。
- 全新规格审查者：`/root/round11_spec`；全新标准审查者：`/root/round11_standards`。同一固定17项rubric并行只读，未互看结论；各轴原结论分别保留。主审独立运行关键正负探针，双轴均过后放行。
- 方法：dev-pipeline阶段6、code-review双轴、thermos角色/镜头、santa-method、verification-before-completion、testing-protocol、code-review-excellence。未发现仓库AGENTS/CONTRIBUTING/CODING_STANDARDS/GLOSSARY/ADR文件；用户Context7规则明确不用于code review，不虚构额外风格规范。
- 材料：stage5-dev-summary索引及本轮新增声明、Round-10包/模板、Round-9 verdict、round-9 triage/tasks、内审14、autonomous-decisions、需求AC/契约C-12、冻结实施与测试/E2E计划、固定两提交差异及当前run-03记录/proof。历史摘要计数明确绑定其历史基线，当前120项由本轮实跑证明。

### 本轮实际执行与证据边界

| 检查 | 主审实际结果 |
|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | exit0；9套件120测试，evidence36；0 failed/todo/skipped；UT-111～113保留，UT-114/115新增 |
| `python tools/desktop-recv/verify-evidence-selftest.py` | exit0，14/14；含FAIL/NOT_RUN/mock/错类型/缺工件/不等字节/缺阈值等拒绝路径 |
| `python tools/desktop-recv/e2e/video-prefix-check.py --selftest` | exit0，3/3，含正例、头错位及尾截断负例 |
| `node tools/desktop-recv/verify-assets.mjs --root build-desktop-recv/staging/receiver` | PASS；revision=`a515922d2106af0cab5f350e0af469b6f4d93ca4`；WASM SHA=`d1080cdc600ca842a337b8ea6157bc5cc2c545aaa75fce7b14e8585e9eb4685b`；如实验证既有staging，不声称当前HEAD重新构建 |
| run-03 `verify-evidence.py --gate local` | PASS，20 required cases；主审另独立重算20对主工件SHA-256，原件/收到文件/两记录字段全部相等 |
| 同run `--gate field` | exit1，缺E2E-21～26六条记录；正确拒绝未执行现场，保持NOT_RUN，不作为本轮新增Blocking |
| 保存量测复核 | 14条含保存腿四时点校验全部通过，含E2E-15嵌套saveTimings；逐条删picker时点的14个负例全部拒绝 |
| 真实包装函数正负探针 | 上表四个修复组合重标0；移除保护的两个异常对照重标10；后续fresh/已知origin/全量/无腿均通过；原文件无写入 |
| 当前差异范围 | `git diff 56f2d5a...HEAD -- web/desktop-recv/src web/desktop-recv/worker src docs/tests/runs`为空；产品及整个运行证据目录均未改变 |
| 凭据定向扫描 | 本轮差异12份可解码文本，私钥/AWS/GitHub/OpenAI凭据模式0命中文件；仅限定当前差异，不称全面安全认证 |
| 未新执行 | 未启动桌面E2E、未重录媒体、未重建WASM/native；先前产品/媒体验收按未变字节与已接受证据沿用；native9/9仍为历史结果 |

### 固定17项清单与Todo

| 项 | 本轮结论与依据 |
|---|---|
| ①修复匹配/遗漏 | PASS；唯一B-R1两异常出口及后续合并均由10错误归属逆转为0 |
| ②契约对齐 | PASS；AC-005/C-12分层不变，历史unknown明确，fresh才盖章 |
| ③文档一致 | PASS；stage5新增marker隔离语义与当前实现一致，历史快照与当前包分列 |
| ④范围 | PASS；两提交12文件限定工具/测试/文档/状态，无产品或原始证据差异 |
| ⑤最小实现 | PASS；22行纯helper加marker一个调用点，无新增产品机制 |
| ⑥之前反馈 | PASS；triage/tasks认领唯一Blocking，内审14缺失工件已入库 |
| ⑦正常功能 | PASS；正常合并、fresh、已知来源、全量与probe独立探针通过，无产品差异 |
| ⑧死码/桩/效率 | PASS；helper真实调用、线性处理，无独立结构性问题 |
| ⑨回归 | PASS；120单测及必要门禁通过，正常与多轮/失败路径探针通过 |
| ⑩敏感信息 | PASS；本轮12文本定向扫描0命中 |
| ⑪假绿 | PASS；失败保持FAIL，历史身份不被失败attempt冒领，NOT_RUN不升级 |
| ⑫测试设计 | PASS；helper级回归有效，独立真实wrapper异常与消融对照验证接线 |
| ⑬决策依据 | PASS；按前轮最小DoD修复，无新增范围缩减或现场代填；D-19～21边界沿用 |
| ⑭前轮闭环 | PASS；B-R1关闭，更早三项保留关闭，不机械重开 |
| ⑮执行证据 | PASS；本次命令/受控探针、历史桌面证据、未执行现场明确分列 |
| ⑯三元组 | PASS；闭环位置、可复验反例及满足DoD分别列明；无待修Blocking |
| ⑰摘要核验 | PASS；新增完成声明获真实反例重放支撑；提交快照/工件/计数/归属与限制核对一致 |

Todo：固定版本及初始状态摘要、索引与核心材料复核、全新双轴、必要命令、正负异常探针、有限回归核验、verdict契约与只读边界复核完成。审查无待处理Blocking；阶段7/8及现场执行由原流水线分别承接。verdict为本轮唯一写入接口，流水线状态由Claude消费后更新。

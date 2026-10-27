# receiver-ux-v2 独立外部复审 — Round 14

## Verdict

通过

固定HEAD=`643d0268292c3227825be0a5d73f81624aa9fd64`，分支`receiver-ux-v2`；整改基线为上轮HEAD `a5ead3a9dec3ff06f8543ad712f4dbaf971f6781`。整改范围9提交、538文件、+72353/-406；其中产品/工具11文件、+911/-27。全迭代基线仍为`9e4fbc46965de42b9b0097ad80c607d71c7303f0`。状态ext_rounds=13，按规则新增本round-14-verdict，不更改状态或旧裁决。

**全新规格轴A、标准轴B均PASS，0 Blocking。第13轮3项阻断全部关闭，保留2条非阻断文档建议。** 本次通过针对整改代码与当前候选证明，不是宣称全部本地、现场及最终包验收已经通过。

主审新执行确认：222条单元、69条工具测试、UX自测77/77、旧证据自测14/14、前缀自测3/3、契约及资产检查通过。当前root12的27个产品文件、29对主要保存文件、录像A/B原始时点和10侧连续30秒Receiving均已独立复核。旧反例现在被真实入口拒绝，而不是只调整记录说明或用例名称。

Claude阶段6可消费本文件并推进阶段7。E2E-35、E2E-37和现场E2E-21～26/39依用户既有决定继续NOT_RUN，当前UX本地门禁仍准确输出35/37的4条缺口；这些未被标绿或移除。阶段8最终包装配、环境绑定和实际交付入口复核也仍须独立完成。用户现场、候选代码审查、最终包验收的结论不得互相替代。

本轮仅新增本verdict；产品、测试、原始证据、索引、HEAD及流水线状态均未由审查者修改。

## Blocking issues

### 规格轴 A — 通过

None。上轮A13-01、A13-02关闭；B-R1在本轴核对范围亦关闭。分别保留本轴原核对顺序，不与标准轴合并重排。

#### A13-01｜当前构建与输入身份绑定 — CLOSED

- **位置：**`tools/desktop-recv/e2e/measure-ux-calc.mjs`的contextExpectations及CLI调用（当前`:1466`附近）；recomputeMeasurement接收真实第二实参expected。当前产品manifest按磁盘重哈希核对，缺candidate不再跳过。
- **A与主审独立实证：**OS临时目录分别复制当前完整measurement，携带真实root12 context调用真实CLI。product改为64个f、整删candidate、主input改为64个f、media改为64个f、live输入摘要改为64个e，五种均exit1：前两项命中E_BUILD_BINDING，中间两项E_INPUT_BINDING，最后一项E_LIVE_INPUT_BINDING。实际root12正例带context复算exit0。
- **关闭依据：**修复发生在真实CLI→计算器调用边界，预期身份不再丢失，不只是helper直接传参测试通过。所有临时反例未改动实际运行证据。

#### A13-02｜相同时间戳的当前报告质量 — CLOSED

- **位置：**`web/desktop-recv/src/ux-telemetry.js`在接受data/artifact时记录lastReportState并在begin重置，snapshot输出内部事实；`ux-view.js`改以该事件状态判降级；`ux-display.js`的EMPTY_OBSERVATION补齐内部字段。
- **A、B与主审独立实证：**不同frameId均使用receivedAtMs=1000：single .6→empty或unavailable/19004后，视图均unavailable/null且历史.6保留；随后同刻.7恢复estimate，.5则锁ambiguous/19006。没有伪造时间、加epsilon或收紧为严格递增。
- **契约同步：**模块契约第105、152行显式记录该内部事实与同时间戳语义。JSON schema中的Progress定义属于ViewSnapshot投影视图，并非模型的原始历史snapshot.progress；新增内部字段未混入原ViewSnapshot输出，不构成该schema的额外属性冲突。不能仅因schema本身未增此字段重开本项。
- **关闭依据：**第13轮的两个合法等时戳反例均消除，恢复/回退锁未破坏，原v1协议/解码结果保持不变。

#### B-R1相关验收/RTT — 本轴核对通过

真实check_recomputed_stats拒绝一致FAIL及NOT_RUN/不足5对；生产验证链已经调用该检查。真实judgeRound对rttMs=0报告E_RTT_MISMATCH并按起止得p50=60.3ms，对settled<t0报告E_RTT；原正例没有相应违规。完整验证函数→CLI链路由标准轴及主审进一步复核，见下。

### 标准轴 B — 通过

None。上轮B-R1关闭；A13-01/A13-02交叉核对亦通过。

#### B-R1｜计算成功与验收通过区分、原始RTT核对 — CLOSED

- **位置：**`tools/desktop-recv/verify-ux-evidence.py`的check_recomputed_stats/check_recomputed_live及run_measurement_recompute接线；`measure-ux-calc.mjs`的judgeRound原始时点路径。
- **B独立完整链实证：**OS临时复制root12完整证明，把5个B侧readyAt/readyMs各加60000ms，再用真实统计函数同步所有summary/comparison/run。候选中位74817ms超过17780.7ms门槛，声明与raw一致地FAIL；真实validate_ux_record→实际Node复算CLI现在明确拒绝该FAIL，不能继续为外层PASS背书。
- **主审独立复验：**同一类自洽FAIL副本由真实CLI成功算出FAIL（计算过程exit0是保留的接口语义），再交真实check_recomputed_stats，得到`the gate requires the recomputed measurement verdict PASS`违规。过程成功不再等同验收成功。77项新执行自测同时覆盖一致NOT_RUN与缺失统计字段等拒绝路径。
- **RTT独立实证：**仅把当前真实pair-1-B的ok帧rttMs改为0，原始t0Ms/settledAtMs不动；B及主审都得到97个E_RTT_MISMATCH，统计仍按原始起止输出p50=60.30000000074506ms，而不是0。原始结算早于开始也被拒绝。当前真实raw逐帧核对均相等/有序，未被新检查误拒绝。
- **关闭依据：**消费者要求重算verdict=PASS、5有效对、完整实时10侧VALID，RTT从原始起止计算且核对冗余字段；第13轮一致失败和矛盾RTT漏洞均已实质关闭。

#### 其他交叉核对

B独立运行真实CLI错产品SHA反例，被E_BUILD_BINDING拒绝；等时戳降级/恢复/回退模型组合通过。新增有界settle取证等待未删除原冻结相等断言，最终实际截图没有旧进度或旧速率。未发现本轮需要独立阻断的业务破坏、安全、结构或范围扩张。

## Suggestions

### A-S1｜收敛延迟的观测下界应精确表述（非阻断）

`r13-tools-report.md:219`至`:229`从相隔1.2秒的两个探针elapsed=8.9→9.0，推出“收敛写晚到≥1.2s”；所列两点本身只能证明写入发生在两探针之间，不能给出该下界。建议注明“确切延迟未精确测定/疑似调度推迟”，或者补直接写入时间线；不要据此反推产品已违反硬时限。另一份139ms收敛实物与该观察不冲突。相应旧attempt所属root11/root12标注也应与88532b实际文件路径保持一致。

这是证据解释/文案澄清，不据计时器常识或未测定的延迟重开已关闭显示主题；当前最终截图及原始写间隔已有正向证据。

### B-S1｜直接CLI无context时的语义与手册应一致（非阻断）

root12 `reproduction.md` §7.5称缺--context会拒绝；实际直接CLI不带该参数仍exit0、ok:true/PASS，HELP/parse也将其列为可选（`measure-ux-calc.mjs:1439`至`:1447`附近）。真正UX门禁调用始终携带context，本轮错绑定负例也确认该路径生效，故不重开A13-01。

建议明确“无context仅统计/一致性复算，不证明当前构建和输入身份”，或者让要求身份背书的直接入口强制context；不要把无context的独立复算结论描述为完成了当前身份校验。

## Reviewer

主审：`codex-gpt-6`（独立于实施方Claude），2026-10-27，Asia/Shanghai。全新规格审查者`/root/r14_spec`、全新标准审查者`/root/r14_standards`并行只读，分别提交PASS；各轴原核对顺序和建议归属分别保留。主审独立运行实际模块/CLI/消费者反例，并逐项复算当前实物，没有只依据CLOSED台账或代理完成通知放行。

方法为dev-pipeline阶段6、code-review双轴、thermos角色/镜头、santa-method双过门禁、verification-before-completion、testing-protocol和code-review-excellence。未检出仓库AGENTS/CONTRIBUTING/CODING_STANDARDS/GLOSSARY/ADR文件；遵守用户所给Context7规则，未为code review调用网络库文档。仅裁决不修复、不代发消息、不合并或发布。

### 材料与当前候选

已核对根stage5索引、本轮stage5总结第8节、round-14包/模板、round-13裁决、r13-remediation/prod-report/tools-report、active_*所指需求/设计/契约/实施与测试计划、runtime映射、决策与失败/重试记录。原round-12已关闭的显示/实时/后台假PASS主题不重新扩大审查；新证据与其关闭条件保持一致。

主证据根为`docs/tests/runs/20261027-teamexec-12/`，产品manifest=`829d7dec4358feaf391c86876bf3e20e9c600f1557c6b1537c4c5e2eb258958d`，attempt=`candidate-20261027-01`。源码和工具的提交标识分别按context/包的原始字段保留，主审另按实际staging文件逐个绑定，不用提交标签替代字节验证。候选asset revision实查为`00e04628b4447a3888019a285b478709384595a9`。

### 本轮实际执行与证据边界

| 检查 | 主审实际结果 |
|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | exit0，12套222例，0 failed/todo/skipped；telemetry27/view24/display15 |
| `node --test tools/desktop-recv/tests/measure-ux.test.mjs tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/process-guard.test.mjs` | exit0，69/69，0 failed/todo/skipped |
| `python tools/desktop-recv/tests/ux-evidence-selftest.py` | exit0，77/77；含真实CLI绑定负例、一致FAIL/NOT_RUN、RTT矛盾、旧原收/步骤/原始测量拒绝路径 |
| `python tools/desktop-recv/verify-evidence-selftest.py` | exit0，14/14 |
| `python tools/desktop-recv/e2e/video-prefix-check.py --selftest` | exit0，3/3 |
| `python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py` | exit0，20定义/27样例/44形状向量/6接口/15诊断；形状检查输出的12项implementationCases NOT_RUN不被当运行验收 |
| 当前候选`verify-evidence.py --gate local --planning ...` | exit0，20 required cases |
| 当前候选`verify-ux-evidence.py --context .../run-context.json --gate local` | exit1，恰4条：35/37分别result非PASS及executor为null；保持已授权待用户缺口，不称全本地门禁已绿 |
| 原`verify-evidence.py --gate field --planning ...` | exit1，缺原现场21～26六项；新39另由UX现场定义约束，亦未执行，不称旧门禁覆盖了新39 |
| 当前`measure-ux-calc.mjs --recompute <root12> <measurementDir> --method ... --context <root12 context>` | exit0，ok:true，5有效录像对、实时A/B各5侧通过；本次明确带context |
| 主审错身份负例 | 临时measurement副本的product64f/candidate缺失/input64f/media64f/live64e，真实CLI全exit1并分别指向构建/输入绑定错误 |
| 主审一致FAIL负例 | 候选Ready中位74817>17780.7，真实CLI算出FAIL，真实外层消费者拒绝；明确区分计算成功与验收失败 |
| 主审等时戳/RTT反例 | 同时间empty/19004均隐藏比例，.7恢复/.5锁；rtt置0后仍按原始起止算60.3ms并报告97个矛盾，不再接受派生假值 |
| manifest与产品文件 | product/input manifest摘要与context相符；staging及release候选27/27文件重哈希一致，其中24个可直接对应当前web源文件逐个一致 |
| 实际主要原收文件 | 20个legacy主对+9个新UX主对，共29对磁盘SHA相等；不称新执行了全部嵌套容量/录像腿 |
| 当前`verify-assets.mjs --root build-desktop-recv/runs/20261027-teamexec-12/receiver` | PASS；WASM SHA=d1080cdc600ca842a337b8ea6157bc5cc2c545aaa75fce7b14e8585e9eb4685b；沿用严格EOF资产，未新构建WASM |
| 录像raw独立复算 | A533/B508个ok帧；逐帧有限/有序且rttMs=settledAtMs−t0Ms。按nearest-rank逐轮后取5轮中位：A=[15937,59.2,81.6]、B=[14817,60.1,80.4]ms；门槛=[17780.7,65.12,93.84]ms，三式PASS |
| 当前候选数字写入 | 正式录像B侧每轮最小间隔约250.2/250.2/250.2/250.2/250.3ms，均满足冻结250ms边界；未用live观测容差放宽该检查 |
| 实时raw独立复核 | 10侧采样全部Receiving、各侧session身份恒定，首末窗口30359～32246ms；没有上轮约18秒Ready后补睡的情形 |
| 实际Ready截图 | 当前E2E-36最终attempt `E2E-36-2026-10-26T19-48-21-341Z-474c28`的`s36-s03-ready-longname.png`显示重建完成/21.8s，无旧百分比/旧速率；复读既有实物，不冒充主审新执行UI |
| 未运行状态 | 35/37整例NOT_RUN、executedBy=null、无PASS断言；用户现场7项和最终包验收不代填 |
| 范围保护与限定安全核查 | 相对上轮C++、原web/main.js/send.js、v1公共契约、旧run-03/09b/root11无整改diff；B对11份变更源/工具文本定向凭据模式扫描0命中，不作为全面安全认证 |
| 未新执行 | 未启动桌面E2E、浏览器录制、Narrator、用户云桌面或最终包安装；没有将实施方历史实测写成主审新执行 |

冻结performance-method原字节SHA仍为`1b281cbf67e968c287d11d27db1d61259c569925bf798b970f99a1f69c910a29`。本轮所有长命令均读取最终退出结果；未将运行中的session或部分输出当通过。

### 已授权缺口与后续阶段

用户已明确真实云桌面/后台行为由用户侧验证；35改为整例NOT_RUN而非删除用例或改计分，是上轮A-R4关闭依据。37语音及现场21～26/39继续分列。上述用户决定持续有效，本轮不重复索取相同授权，也不因它们未执行新增相同Blocking。

本裁决允许Claude依阶段6流程推进阶段7的整改成果收尾；阶段8仍须将最终包与当前产品资产绑定，按原计划复核解压启动、中文空格路径、双输入、保存重试等交付表面。用户现场回执仍是独立证据。候选审查通过、完整本地门禁通过、现场通过、最终包通过应分别报告。

### 固定17项清单与Todo

| 项 | 结论 |
|---|---|
| 1 问题匹配/遗漏 | PASS：第13轮3项阻断逐项有实际关闭证据 |
| 2 代码与设计对齐 | PASS：事件质量表达、当前身份绑定、验收结论和原始RTT语义均符合关闭要求 |
| 3 设计/文档过时 | 无Blocking；延迟下界与无context说明保留A-S1/B-S1 |
| 4 范围/其他模块 | PASS（审查范围）：未扩改C++/原发送或协议 |
| 5 过度设计 | 无新增独立结构Blocking，复用现有计算/验证边界 |
| 6 旧反馈 | 第13轮3项CLOSED；前轮已关闭主题未回归 |
| 7 正常功能 | 等时戳/恢复/回退和当前真实显示均获正向证据，无新增Blocking |
| 8 死代码/低效 | 未发现本次需独立阻断的问题 |
| 9 回归影响 | 新增真实入口反例和正例通过；未见所审依赖链破坏 |
| 10 敏感信息 | 标准轴限定11份变更文本扫描未命中；不把ignore/未提交内容当泄露 |
| 11 业务桩/mock/假绿 | 未发现新增产品桩；旧错误证明现在拒绝，受控探针与真实E2E边界明确 |
| 12 测试与真实操作 | 本轮关闭反例、raw/实物/最终截图证据相互支持；待用户部分仍NOT_RUN |
| 13 决策有据 | 35/37/现场边界与用户决定相符；有界settle未删改冻结断言 |
| 14 前verdict闭环 | PASS：A13-01/A13-02/B-R1全部关闭 |
| 15 验证铁律 | PASS：新执行的正反例与未运行边界明确 |
| 16 Blocking三元组 | 本轮无Blocking；上轮逐项有位置/证据/关闭依据 |
| 17 总结逐项核对 | 关闭/测试/实物和当前性能主张获复验；非阻断文案差异在Suggestions保留 |

- [x] 读取当前状态、开发索引、本轮摘要、上轮裁决，锁定基线和HEAD。
- [x] 新建A/B双轴并行只读审查，两轴均PASS。
- [x] 新执行单元/工具/自测/契约/资产/门禁及带context测量复算，检查最终退出码。
- [x] 独立复核原始时间、当前身份、主要文件SHA、真实截图及授权缺口。
- [x] 真实模块/CLI/消费者反例逐项验证关闭，不修改原证据。
- [x] 仅输出本verdict并复核HEAD、状态和工作树保护边界。

审查前流水线原字节SHA-256=`e327f2b0ace60758ab1fbe5c4d79c65c6e4c0d9a7afd32f0b818169f16ab141c`，审查期间复核一致。仅新增本文件，external-review仍waiting_external、ext_rounds仍13；由Claude消费本裁决后自行更新阶段状态。

# receiver-ux-v2 独立外部复审 — Round 13

## Verdict

不通过

固定HEAD=`a5ead3a9dec3ff06f8543ad712f4dbaf971f6781`，分支`receiver-ux-v2`；整改基线为上轮HEAD `959b880c8c293f70fd121240892eb2a41c00af18`。整改范围23提交、1062文件、+98593/-1415；其中产品/工具15文件、+3665/-1054。全迭代基线仍为`9e4fbc46965de42b9b0097ad80c607d71c7303f0`，本轮不重开v1已关闭结论。状态ext_rounds=12，按规则仅新增本round-13-verdict，不更新流水线。

**规格轴A：FAIL，2项；标准轴B：FAIL，1个聚焦主题。共3项阻断，涉及上轮尚未完全闭环的A-R1和B-02。** 显示缓存/终态收敛、实时30秒Receiving及后台假PASS三项已有实质关闭证据；本轮不是把已修复问题或已授权待用户验证事项重复退回。

主审新执行216条单元、67条工具测试、自测65/14/3、契约和资产检查均通过。当前root11实物重哈希、29对主要原收文件、录像A/B原始起止复算及10侧连续30秒Receiving均成立。**当前实际性能数值没有被本次反例推翻；问题在于新门禁仍能接受错误构建身份，或者把重算得到的FAIL当作外层PASS的有效证明。** 产品报告降级修复另遗漏了接口明确允许的相同时间戳输入。

Claude阶段6应消费本文件，携下列Blocking回阶段5整改。E2E-35、E2E-37和现场7项继续按已有用户决定如实保持NOT_RUN；本轮不要求代理代替用户测试真实云桌面，也不把这些缺口写成通过。当前UX本地门禁exit1的4条已披露缺口与本报告的代码/验证缺陷分别呈现。

## Blocking issues

### 规格轴 A — 不通过

#### A13-01｜测量CLI丢失当前上下文绑定实参（P1，旧B-02未完全关闭）

- **位置：**`tools/desktop-recv/e2e/measure-ux-calc.mjs:934`定义`recomputeMeasurement({ measurementDir, methodBytes, method }, expected = {})`；`:1379`至`:1381`却调用`recomputeMeasurement({ measurementDir: target, methodBytes, method, expected })`，没有传第二实参。`:981`起的product/input/media绑定以及传给live的输入绑定因此收到空expected。
- **独立实证：**A与主审分别在OS临时目录完整复制root11测量，只修改`run.json.candidate.productManifestSha256`为64个`f`。用真实CLI加`--context`指向真实root11上下文（当前产品SHA=`34a9de304d8625356565f77e5015abe0ab78ddd5aba17a4ff3c6e0674a17df8b`），仍exit0、`ok:true, violations:[]`。主审没有修改原始测量，也没有声称当前root11实物已经错绑。
- **原因/影响：**函数本体具有校验分支，但生产调用没有把预期身份送进去。门禁表面上加载并传了context，实际上无法按该context拒绝其他构建/输入的测量。B-02要求当前构建、输入、方法和证明来源可复核，不能只证明某份测量自身一致。
- **期望/DoD：**正确传递并实际使用expected；明确处理context要求的必填身份缺失，不以空对象或缺candidate跳过绑定。补**真实CLI→计算器**负例，分别破坏产品、主输入、媒体、live输入绑定，必须非0；当前root11正例仍通过。不要只对直接调用函数并正确传第二参数的单测补断言。按原证据/attempt归属规则复核measurement原件与proof副本，不改旧结果文字追绿。

#### A13-02｜降级修复仍把“相同时间戳”误认为报告没有失效（P2，旧A-R1部分关闭）

- **位置：**`web/desktop-recv/src/ux-view.js:177`至`:180`，以`lastDataAtMs > trustedAtMs`推断当前质量；`web/desktop-recv/src/ux-telemetry.js:195`附近只拒绝时间倒退。冻结模块契约`:113`同样只禁止“早于”，允许不同frameId使用相同receivedAtMs；`:103/:148/:157`要求当次empty/unavailable隐藏旧比例。
- **独立实证：**A与主审使用真实Telemetry→readView组合：第一帧single=.6、receivedAtMs=1000；第二帧frameId不同、receivedAtMs仍1000，report分别为empty和unavailable/19004。两次acceptFrame均`ok:true/applied:true`，视图仍返回`estimate/.6/stale=false`，格式化“重建估计约60%”。对照把第二帧改为1100，当前修复正确返回unavailable/null。新增回归只覆盖时间严格增长，不能证明这个合法边界。
- **严重度/边界：**这是有效接口输入的受控组合反例，不宣称已经在真实浏览器截图中发生，也不把所有普通降级路径说成未修。单调时钟不等于每一事件严格递增，接口已经接受同时间的两个不同帧，不能靠时间大小替代报告的事件顺序或当前质量。
- **期望/DoD：**当前报告质量应与历史可信基线区分，不能仅依赖两个时间戳严格大小。相同时间的empty/unavailable必须隐藏当前百分比，历史仍支持后续.7恢复与.5回退锁；补这些真实模型→视图组合用例。不要通过伪造时间、加epsilon或擅自把原契约收紧为严格递增来排除合法输入。保持v1协议/原frame结果不变；必要的内部表达调整应显式同步设计及验证，而不是继续用时间巧合推断质量。

### 标准轴 B — 不通过

#### B-R1｜测量复算只验证自洽，外层没有要求验收结果PASS（P1，旧B-02仍开放）

- **位置：**`tools/desktop-recv/e2e/measure-ux-calc.mjs:1025`至`:1032`计算`stats.verdict`，`:1055`附近仅检查声明与计算是否相同，`:1115`返回`ok=violations.length===0`；CLI`:1393`至`:1395`据此exit0。`tools/desktop-recv/verify-ux-evidence.py:443`至`:456`仅检查进程退出码和`payload.ok`，没有要求每项重算后的verdict为PASS。
- **B独立实证：**在OS临时目录复制root11完整measurement及E2E-38证明，把5个B侧readyAt/readyMs分别增加60000ms，再用真实统计函数同步summary/comparison/run。重算Ready中位数=`75060ms`，门槛=`17528.8ms`，数据与声明一致地**FAIL**。外层真实E2E-38记录仍为PASS且保留全部步骤和证明；真实validate_ux_record通过实际Node复算CLI后返回零违规。
- **主审独立复验：**相同的临时raw修改后，真实pairRounds/summarize/evaluate/decide得到FAIL；recomputeMeasurement返回`ok:true, violations:[], stats.verdict=FAIL`；带真实context的CLI仍exit0、`ok:true`，其输出同时明确`stats.measurements[0].verdict=FAIL`。这不是仅篡改summary而raw未变的负例，现有“raw threshold breach”自测只能拒绝不一致，未覆盖**一致失败**。
- **同一复算链的原始值缺口：**`:269`至`:276`直接使用raw里的冗余`rttMs`，没有从`t0Ms/settledAtMs`重算或核对等式。B与主审分别把真实pair-1-B内存副本的ok帧rttMs置0，保留所有起止时点，judgeRound给出p50/p95=0、零违规；原始起止计算p50实际为58ms。原helper迁到新计算器后被新总门禁当作“原始数据复算”使用，因此属于本次B-02关闭义务，不是对未改模块另开无关整改。
- **影响：**“运算成功/数据自洽”与“验收达标”被混为一个ok位。即使修复A13-01的身份传参，仍可让真实不达标测量为外层PASS记录背书；派生RTT不受原始时点约束，也可歪曲三公式。
- **期望/DoD：**消费者同时要求过程有效和验收结论达标：每份录制重算PASS、5个有效对、完整10侧实时VALID及冻结硬不变式。计算器可以保留“成功算出FAIL”的接口语义，但外层PASS门禁必须拒绝它。RTT应从原始起止计算或严格核对冗余字段，并检查有限/有序边界。新增“一致FAIL”“一致NOT_RUN”“原始起止与RTT矛盾”负例，真实CLI及验证函数链路均应拒绝；正例不回归。保留中间失败原件，不把改写失败summary为PASS当修复。

## Suggestions

1. **准确描述历史保全边界。**摘要称“09b/root10零改动”，但相对上轮HEAD，09b的`reproduction.md`有3行新增/2行删除，用于修复live命令与路径。主审未发现该旧运行根的结果、原始proof/媒体被改；这一文档修正本身不升Blocking，也不要求恢复坏命令。建议把“旧原始证据未改”与“目录所有文件零改动”分开，并保留该修正的出处。
2. **新增门禁回归应覆盖实际调用边界。**现有65项自测已拒绝旧三类负例，但A13-01说明helper单测正确传参不能替代CLI接线测试，B-R1说明只测不一致篡改不能替代一致失败。相关新增用例应落真实入口并保留明确反例，不再以总测试数增长代替原关闭条件。本条为测试组织建议，具体必需断言已在各Blocking的DoD列出。

## Reviewer

主审：`codex-gpt-6`（独立于实施方Claude）。全新规格审查者`/root/r13_spec`与全新标准审查者`/root/r13_standards`并行只读，未互看初始判断；两轴分别保留自身问题顺序。主审独立执行产品组合、真实CLI、原始时间复算和临时目录反例，不仅依靠实施方CLOSED或代理结论。

方法沿用dev-pipeline阶段6、code-review双轴、thermos角色/镜头、santa-method双过门禁、verification-before-completion、testing-protocol、code-review-excellence。未检出仓库AGENTS/CONTRIBUTING/CODING_STANDARDS/GLOSSARY/ADR文件；用户提供的Context7规则排除code review，本轮不为一般代码审查查网络文档。仅写本verdict，不写其他审查文件或改流水线。

### 五个上轮主题的闭环裁定

| Round-12主题 | 本轮裁定 | 复核依据 |
|---|---|---|
| A-R1 当前report降级 | **PARTIAL** | 普通1000→1100的empty/unavailable已隐藏旧比例，恢复/回退组合有回归；1000→1000的合法不同帧仍遗漏，见A13-02 |
| A-R2/B-01 显示缓存、终态、重复写 | **CLOSED** | 真实模块t100的20%在t250补画；t1100 Ready后留一个收敛timer，t1250显示重建完成/无速率/1.1s，timer0；数字写入时点[0,250,1000,1250]均满足250ms；相同sync无重复paint。当前真实Ready截图同样已无旧百分比/旧速率 |
| A-R3 实时不足30秒却VALID | **CLOSED（当前证据）** | 10侧raw全部Receiving、session身份恒定，窗口30127～30181ms；A独立经真实judge复核，窗口结算222～256，旧09b提前Ready反例被拒绝；主审另按原始采样复核 |
| A-R4/B-03 后台缺分支仍PASS | **CLOSED（诚实处置，不是验收通过）** | 当前E2E-35整例NOT_RUN、executedBy=null、无PASS断言；三装置探针及用户“真实云桌面远程会话不需要你测试”的决定在案，不再以held替代真实visibility计PASS。后续真实用户验证仍待完成 |
| B-02 UX总门禁 | **PARTIAL/OPEN** | 原收相等、必测步骤覆盖、无raw拒绝均已实质修复；新接入的复算链仍有A13-01绑定与B-R1结论/原始RTT缺口，不能全部CLOSED |

S1的IAT-08过时“工具未交付”原因已修正，仍如实NOT_RUN；S2已拆出计算/校验模块供门禁复用。两项建议的文案/结构方向已处理，但拆分后的实际调用仍需按本轮Blocking修正。没有仅因1396行新模块而提出重写要求。

### 材料、授权与范围

- 已读取当前状态和active_*材料、根stage5索引、本轮stage5总结第7节、round-13包/模板、round-12裁决、r12-remediation、prod/prod-r2b/tools报告、执行/决策记录、冻结契约/方法、TDD及39旅程定义、runtime映射。
- 当前主证据是`docs/tests/runs/20261026-teamexec-11/`，产品manifest=`34a9de304d8625356565f77e5015abe0ab78ddd5aba17a4ff3c6e0674a17df8b`，attempt=`candidate-20261026-01`，sourceRevision=`00c5d57...`，harnessRevision=`5381d35...`。root10为中间失败构建，09b为上轮证据，均不能冒充当前正例。
- 用户关于35真实行为由用户验证、37环境缺口及现场7项的授权已在team-exec.user_instructions及报告中记录。本轮尊重该决定，不要求代理重新模拟用户云桌面，不因已批准的NOT_RUN本身另增阻断；也不把它们算作本地/现场通过。
- 当前UX本地仍非绿：35×2+37×2共4条。该已披露状态没有掩盖；本轮退回是上列新的实证缺陷。对本轮正例的独立复算通过，与证明系统仍能接受反例，是可以同时成立的两个结论。

### 主审本轮新执行结果

| 检查 | 实际结果与边界 |
|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | exit0，12套216例，0 failed/todo/skipped；view23、display15，普通旧显示反例已覆盖，相等时戳降级仍缺 |
| `node --test tools/desktop-recv/tests/measure-ux.test.mjs tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/process-guard.test.mjs` | exit0，67/67，0 failed/todo/skipped |
| `python tools/desktop-recv/tests/ux-evidence-selftest.py` | exit0，65/65；原收不等、删步骤、缺raw、篡改summary、提前Ready等拒绝；不覆盖本轮一致FAIL/CLI绑定反例 |
| `python tools/desktop-recv/verify-evidence-selftest.py` | exit0，14/14 |
| `python tools/desktop-recv/e2e/video-prefix-check.py --selftest` | exit0，3/3 |
| `python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py` | exit0，20定义/27样例/44形状向量/6接口/15诊断；这是形状检查，输出仍明示12项implementationCases NOT_RUN，不代替语义实测 |
| root11原`verify-evidence.py --gate local --planning ...` | exit0，20 required cases |
| root11 `verify-ux-evidence.py --context .../run-context.json --gate local` | exit1，恰4条：35/37分别result NOT_RUN及executor为null；未报告本轮构造的未发生于现有正例的漏洞 |
| root11原`verify-evidence.py --gate field --planning ...` | exit1，缺E2E-21～26六条；该旧门禁只检查原6项，不称其已经覆盖新39。新39按独立UX现场定义继续NOT_RUN |
| `measure-ux-calc.mjs --recompute <root11> <measurementDir> --method ...` | 当前正例exit0、ok:true；5对录像/10侧实时均重新计算。不能用该正例推断错构建或一致FAIL一定被拒绝 |
| product/input/release实物 | 当前两个manifest摘要与context相符；staging和release候选27/27文件重哈希一致，其中24个可直接对应当前web源文件也一致；未新构建产品 |
| 主要文件往返独立核对 | 20个legacy主原收对+9个新UX主原收对，共29对实际磁盘SHA全部相等；35 NOT_RUN没有冒充保存实物。不宣称新执行所有嵌套容量腿 |
| 当前候选`verify-assets.mjs --root build-desktop-recv/runs/20261026-teamexec-11/receiver` | PASS；asset revision=00c5d572c116787b3d30c8c502550c4c5c7ef656；WASM SHA=d1080cdc600ca842a337b8ea6157bc5cc2c545aaa75fce7b14e8585e9eb4685b |
| 录像raw独立复算 | 从原始t0/settled推导RTT并核对冗余字段，A529/B516个ok帧；每轮nearest-rank再取5轮中位。A=[15708,59.6,85.3]、B=[15060,60,81.3]ms；门槛=[17528.8,65.56,98.095]ms，三式PASS；当前raw没有本轮构造的矛盾 |
| 实时raw独立复核 | 10侧样本全Receiving且同一session身份；窗口30127～30181ms；主审与A均核对，没有重复上轮约18秒Ready后补睡问题 |
| 实际截图复读 | root11 `proof/E2E-36/UX-UI-2026-10-26T09-58-29-387Z-423ba5/screens/s36-s03-ready-longname.png`显示重建完成/26.8s，未保留99%或旧KiB/s；只读现有截图，不冒充主审新执行UI |
| 原三类门禁负例 | 真实当前E2E-27记录正例零违规；OS临时副本中，各自SHA正确但彼此不等的文件被拒绝，删全部步骤被拒绝，无测量raw的E2E-38被拒绝。初次probe仅因错误匹配“different”而非实际“differ”文本断言失败，修正probe匹配后新执行通过；不是产品测试失败 |
| 新门禁反例 | 改测量candidate SHA为64个f，真实CLI带当前context仍exit0/零违规；一致FAIL raw（75060>17528.8）仍CLI exit0/ok:true；原始起止不变、RTT置0时judge给p50=0/零违规。全在内存或OS临时目录，原run无修改 |
| 保护及安全范围 | C++、原web/main.js/send.js、v1两公共契约、旧run-03无整改diff；09b仅reproduction.md的命令修正，未发现其原始结果/proof变化。B对15份变更源/工具文本作定向凭据模式扫描0命中，不等于全面安全认证 |
| 未新执行 | 未启动浏览器桌面E2E、录制、Narrator、用户云桌面或最终包安装；没有将旧实测重新标成主审新执行 |

冻结performance-method原字节SHA=`1b281cbf67e968c287d11d27db1d61259c569925bf798b970f99a1f69c910a29`，主审复核不变。本轮实际已读完所有命令的最终退出结果；没有把仍运行的session或部分日志当通过。

### 固定17项清单与Todo

| 项 | 两轴与主审结论 |
|---|---|
| 1 问题匹配/遗漏 | PARTIAL：3个旧主题已关闭，A-R1/B-02仍有上述有效反例 |
| 2 代码与设计一致 | FAIL：当前报告质量与测量验收/绑定语义尚未普适满足 |
| 3 设计过时 | 冻结定义明确；IAT-08原因已修正；无另行设计Blocking |
| 4 范围/其他模块 | PASS（所审范围）：未扩改C++/原发送/协议，增量与整改目标相关 |
| 5 过度设计 | 未发现需独立阻断的结构问题；不以代码长度要求重写 |
| 6 之前反馈关闭 | A-R2/A-R3/A-R4关闭；A-R1/B-02部分关闭，不能接受台账全部CLOSED |
| 7 正常功能 | 普通显示/降级改善已证实；合法相等时戳仍有A13-02缺陷 |
| 8 死代码/低效 | 原lastBusiness重复写已修；未见另行效率Blocking |
| 9 回归影响 | 新边界回归不足见各DoD；未见其他模块破坏证据 |
| 10 敏感信息 | B限定15份变更文本扫描未命中；不把未提交/忽略文件当泄露 |
| 11 业务桩/mock/假绿 | 未见新增产品桩；A13-01/B-R1仍可使错误证明为PASS背书 |
| 12 测试/真实E2E | 当前实物与30秒raw成立；CLI接线及一致失败/相等时戳负例缺失 |
| 13 决策有据 | 35延期与37/field边界有用户决定；1ms live观测容差已披露，当前10侧成立，不据此另增阻断 |
| 14 前verdict闭环 | FAIL：仍有两个旧主题未完全闭环，不重开已关闭部分 |
| 15 验证铁律 | PASS（本次审查）：有新执行正反例及清晰未运行边界 |
| 16 Blocking三元组 | 每项有位置、证据、影响与期望/DoD，两轴原序保留 |
| 17 总结逐项实物核对 | 测试/哈希/当前性能数字证实；“5主题全部CLOSED、无Blocking残留”不成立，需据本裁决回填 |

- [x] 读取当前状态/索引/摘要/上轮裁决，锁定两个HEAD与原始状态SHA。
- [x] 新建双轴并行只读审查，分别保留结论与原问题顺序。
- [x] 新执行单元/工具/自测/契约/资产/门禁与原始测量复算，检查最终退出码。
- [x] 独立核主要实物、当前raw与真实截图，关闭旧反例并复核合法新边界。
- [x] 对真实CLI、验证函数及原始RTT运行具体负例，区分临时反例与当前正例。
- [x] 仅输出本裁决，复核HEAD/状态/产品/证据未被本次审查改动。

审查前流水线原字节SHA-256=`9e248ad60000c245c9408fd232e019b6123bc81a18735158ebe2450862e466f4`；固定HEAD及此SHA在审查过程中复核一致。仅新增本verdict，external-review仍waiting_external、ext_rounds仍12。由Claude阶段6消费本文件、回阶段5修复并按影响复验新构建/新attempt；本轮不代写研发整改或用户现场回执。

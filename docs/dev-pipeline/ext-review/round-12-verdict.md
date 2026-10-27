# receiver-ux-v2 独立外部审查 — Round 12

## Verdict

不通过

固定分支`receiver-ux-v2`，HEAD=`959b880c8c293f70fd121240892eb2a41c00af18`；基线/master=`9e4fbc46965de42b9b0097ad80c607d71c7303f0`。本轮范围`9e4fbc4...959b880`：55提交、1287文件、+188175/-349；其中产品/工具44文件、+15571/-141，其他主要为规划、报告和运行证据。送审包中52提交等统计明确绑定`d939584`快照，不直接当作当前HEAD计数。

状态为team-exec completed / external-review waiting_external，ext_rounds=11，因此仅新增本round-12-verdict。**规格轴A失败（4项）、标准轴B失败（3项），交叉去重后为5个阻断主题**：报告降级仍显示旧百分比、显示节流丢失未绘制值、实时30秒验收实际不足、后台分支未完成却PASS、UX总门禁不足以验证实物及验收内容。两轴分别保留原报告顺序；重叠的显示缓存及后台分支为高置信Blocking，不以另一轴或测试总数抵消。

主审新执行确认：12套202条单元、61条工具测试、自测55/14/3全部通过；原20条本地门禁通过；产品manifest 27文件及主要30对原/收文件实物哈希一致。**这些结果不证明本轮体验验收通过**：真实截图已出现“文件已接收完成”同时保留“重建估计约99% / 57.0 KiB/s”；10份实时侧别记录均约18.1秒已Ready，却全部判VALID。UX本地门禁当前仍exit1，仅报告E2E-37两条违规，没有识别本报告揭示的内容缺陷。

Claude阶段6应消费本文件，携Blocking回阶段5整改。原v1 round-11通过结论不重开；本轮不修改产品、测试、原始证据、索引或流水线状态。送审允许携带的E2E-37及现场7项缺口仍如实保留，不能据此宣布本轮本地或整体验收通过。

## Blocking issues

### 规格轴 A — 不通过

#### A-R1｜当前report失效后仍冒认旧百分比可判定

- **位置：**`web/desktop-recv/src/ux-telemetry.js:230`（`_applyReport`）、`:256`；`web/desktop-recv/src/ux-view.js:186`至`:208`；`web/desktop-recv/tests/unit/ux-telemetry.test.mjs:282`。
- **依据：**冻结模块契约`docs/design-catalog/receiver-ux-v2/module-contract-error-matrix.md:103`要求临时unavailable/empty保留可信历史，但当次展示不得冒认仍可判定；`:148`要求unavailable不展示旧百分比，`:157`要求近期data但report unavailable/empty时进入progress_unavailable。规划UX-UT-023已覆盖该义务，属AC-016/018/022。
- **证据：**主审与A使用真实ReceiverTelemetry和readView组合、仅控制输入与时钟：single=.6@1000ms，随后empty或unavailable/19004@1100ms，均返回`progress={kind:estimate,ratio:.6,stale:false,diagnosticCode:0}`、statusKey=receiving，实际格式化为“重建估计约60%”。unavailable的19004虽进诊断集，当前显示仍不降级。模型保留历史却没有表达当前报告质量，视图只在历史比例null时处理不可用。同名正式测试宣称“hide the ratio”，实际只检查历史/诊断及后续回退，未检查模型→视图输出，因此现有全绿漏掉此分支。
- **影响：**用户看到的百分比没有当前报告支持，违背本迭代“有依据才估计”的核心承诺。
- **期望/DoD：**区分历史可信基线与当前报告质量；empty/unavailable时隐藏当前百分比并明确不可判定，历史基线仍用于恢复后的回退检测。补真实模型→视图组合回归：.6→empty/unavailable→.7恢复；.6→empty→.5仍锁回退；速率及原frame/产物结果不受影响。相关UT/IAT和真实双输入反馈在整改后构建上复验，禁止仅修改测试名称或放宽契约。

#### A-R2｜共享250ms节流把未绘制数值记成已绘制，终态也无法收敛

- **位置：**`web/desktop-recv/src/ux-display.js:140`至`:169`，尤其`:147/:152/:157/:162`在`:165`节流返回前更新lastTelemetry；`:172`至`:176`在终态释放timer。与B-01重叠，升为高置信Blocking。
- **证据：**两位审查者及主审独立运行真实Telemetry/Display模块，paint接收器模拟DOM写入、时钟受控：t0初画；t100接受data/ratio=.2并sync，t250 tick仍为空进度，尽管readView已输出20%。t1000显示1.0 KiB/s与1.0s；t1100真实finish artifact并进入Ready，主文案已完成，指标仍为空进度/1.0 KiB/s/1.0s，而当前投影应为重建完成/无活动速率/1.1s，timer数量已经0。t2000再次sync仍不能纠正速率。未绘制值提前写入缓存，使后续相同投影被忽略。
- **真实实物印证：**`docs/tests/runs/20261025-teamexec-09b/proof/E2E-36/UX-UI-2026-10-25T12-39-28-069Z-d40b44/screens/s36-s03-ready-longname.png`中，主文案“文件已接收完成，请保存”、副文案“文件已完整重建”，同时仍显示“重建估计约99%”和“57.0 KiB/s（含冗余）”。live pair-1-B最后样本也在Ready状态保留65.4 KiB/s。这不只是合成探针发现的问题。
- **影响：**完成/停止后速度、进度和用时可能持续旧值；接收中短暂出现后持平的进度也可能永远不画，直接损害用户理解“是否仍在接收”。属AC-016/017/018/020/022及UX-04生命周期要求。
- **期望/DoD：**缓存只能代表成功提交给显示层的值；节流丢弃不得丢最新待显示投影，paint失败也不得冒充已显示。完成/停止后的最终指标须收敛，同时保留事件/tick共享250ms数字边界、业务按钮/终态即时、业务逻辑零重入、最终timer释放。补“gate内变化后持平”“gate内Ready/Stopped”“paint失败后恢复”的真实模块断言，并以真实Ready截图及状态/数值时间线复验。7条display单测当前只证明部分节流/文案/释放性质，不足以关闭本项。

#### A-R3｜E2E-38的实时10侧并未持续Receiving 30秒，却全部VALID

- **位置：**`tools/desktop-recv/e2e/live-legs.mjs:206`至`:222`，`:288`至`:317`；09b `measurements/ux-overhead/candidate-20261025-04/live/rounds/pair-{1..5}-{A,B}.json`及`live/summary.json`。
- **依据：**`docs/tests/receiver-ux-v2/cases/e2e-experience.json` E2E-38实时步骤明确要求10侧均在**同一实际Receiving**完成30秒，源已完成后循环重发不满足；实施计划`:1222`也要求T6校准足够长live样本。原128KiB录像的数值A/B与实时行为判据分列，前者不能替后者。
- **证据：**主审及A逐份复算10个raw文件：每份15个约2秒采样，只有前9条为Receiving，之后6条均Ready。第一次采到Ready距首采样18081～18125ms；B侧最后显示接收用时依次16.4/16.7/17.0/17.3/16.9s，全部`valid=true`。脚本只在开始时等待Receiving，再按墙钟睡满30秒；judgeSide仅要求曾有帧结算、revision/用时至少变化一次，Ready转换的revision增长也被当成“数据流动”。
- **影响：**只证明前约17秒活动和后约12秒Ready空闲，不能支撑“5×30秒连续接收”的稳定性、数字更新及停止清理主张。E2E-38与对应汇总PASS不能成立，即使录像A/B三公式本身通过。
- **期望/DoD：**以足够长且执行前锁定SHA的真实样本校准；判据核实同一session/seq连续Receiving至少30秒，并有该窗口内真实结算及候选反馈时间覆盖。提前Ready不得补睡成有效轮，须按冻结失败/无效轮规则保留原件。为现存10份反例增加拒绝回归，再按AB/BA/AB/BA/AB完整重跑5对及真实停止；重算summary、E2E-38和所有引用，保留失败原attempt。主录像方法及阈值不得为了实时腿消红而改写。

#### A-R4｜E2E-35缺少真实后台步骤，替换断言后仍记PASS

- **位置：**`tools/desktop-recv/e2e/ui-journeys.mjs:483`至`:499`、`:556`；09b `ux-results.json` E2E-35；`docs/tests/receiver-ux-v2/cases/e2e-receive.json:820`至`:824`及`:851`。与B-03重叠；门禁不校步骤的相关缺陷见B-02，不另重复计主题。
- **证据：**冻结S02要求真实visibility变化且不注入visibilityState。当前记录改用`E2E-35-S02-held`，observed=`heldMs=8830 visibility=visible`，notes承认该装置未conceal。代码明确说明NOT_RUN会影响整例结果，因此替换计分条件为最小化保持时间。保持了窗口最小化若干秒，不等于发生hidden→visible生命周期。
- **决策核查：**并非完全没有记录：`docs/dev-pipeline/receiver-ux-v2/exec-log.md:172`有实施lead接受该降级的决定；`review-final.md`末尾S7也已指出需补真实visibility/正式调整计划/如实非PASS。当前冻结计划仍要求原S02，没有对应用户范围调整；用户允许E2E-37及现场7项带缺口送审不包含此项。披露环境限制不等于完成原验收义务，lead决定不能把未发生的分支变成已验收。
- **期望/DoD：**在允许真实后台可见性变化的独立浏览器装置验证S02/S03，留hidden/visible、恢复时间及指标重算轨迹，不注入document.visibilityState。若当前确不可构造，必测分支和整例按真实覆盖标非PASS并同步汇总；如需改变范围，应取得明确范围决策并修订计划。不要只改notes而维持原义务PASS。门禁必须能识别必测子断言遗漏，详B-02。

### 标准轴 B — 不通过

#### B-01｜显示缓存提前提交，数字永久漏画且重复写相同语义

- **位置/证据：**`web/desktop-recv/src/ux-display.js:140`至`:169`及`:172`至`:176`。B独立模块探针与A-R2相符：t100的20%被gate吞掉；t1100 Ready以后保留1.0 KiB/s、1.0s与空进度，直到t2000仍未恢复，timer=0。主审另以真实截图交叉印证，见A-R2。此处保留B原顺序，闭环与A-R2共用。
- **附带结构问题：**`:52/:94`创建/重置lastBusiness，`:123`至`:127`对它比较，却没有成功绘制后的更新。主审重复两次完全相同sync仍产生新的语义paint。该点不单独升为第6个阻断主题，但修复显示提交语义时应同时覆盖，避免大量无意义DOM写入。
- **期望/DoD：**按A-R2修复，新增边界用例必须断言实际paint最终数值，不能只计调用次数/间隔/主文案。相同视图不重复写、失败paint可恢复；不改变single-flight、保存或EOF业务流程。

#### B-02｜UX总门禁会接受不相等实物、缺必测步骤和无测量数据

- **位置：**`tools/desktop-recv/verify-ux-evidence.py:399`至`:414`仅各自比较文件与所报SHA，未比较原/收文件相等；`:421`至`:447`只检查非空assertion及其PASS/proof存在；`:448`至`:461`对measurement只检查method.frozen。上层汇总未补足这些语义验证。
- **依据：**实施计划配方A`:1094`要求磁盘重算SHA、逐断言证明、测量引用原始数据且计算器重新比较；`:1096`要求完整新UX责任核对；配方F`:1216`明确新总门禁复算阈值，不能只信结果文件PASS。原Evidence v1门禁成功不能补验新UX记录。
- **主审与B分别实测：**用真实E2E-27及E2E-38记录的深拷贝、真实validate_ux_record，所有写入仅在OS临时目录。
  1. 原件ORIGINAL、收件CORRUPTED，各自记录正确但彼此不同的SHA；只留一个UNPLANNED_ONLY/PASS和现存任意proof文本，函数返回`violations=[]`。
  2. 原收改成相同字节，但冻结计划全部必测步骤均被删掉，只留该未知断言，仍零违规。
  3. measurement E2E-38删除所有配对、raw、数字及summary，只保留proof.txt/未知PASS，method指向真实冻结文件，仍零违规。
  这些是**真实验证函数的负例**，不声称修改过本轮证据或当前整门禁已经exit0；当前整门禁仍因E2E-37失败。上层没有原收相等/逐步覆盖/测量复算弥补，因此一旦其余记录齐全，以上错误也不能被总出口识别。
- **实际后果：**A-R3的不足30秒与A-R4的必测步骤缺失均进入当前PASS记录；E2E-38甚至在raw内容未被总门禁读取时可以维持PASS。当前实存主要30对文件确实相等，不能把本项误读成已发生文件损坏；问题是门禁无法证明所宣称的性质。
- **期望/DoD：**在磁盘重算后比较原/收字节或摘要相等；冻结每例必测步骤/子断言映射并核完整覆盖，未知/替换项不得冒充被删义务；测量校验绑定当前方法/构建/attempt的完整原始配对及实时窗口，复用计算器重新计算阈值和硬不变式。上述负例、raw阈值超限、缺pair、提前Ready、缺后台步骤、篡改summary均应非0，正例仍通过。保留所有历史失败/NOT_RUN，不修改记录文字绕过门禁。

#### B-03｜后台分支未发生却PASS，摘要把未满足的必测项计入本地通过

- **位置/证据：**`ui-journeys.mjs:483`至`:499/:556`、09b E2E-35、`review-final.md` S7。B独立确认实际`visibility=visible`、S02-held替代原步骤，而record仍PASS；A-R4补充核对lead降级决定与冻结计划，关闭要求相同。
- **影响：**本轮stage5摘要“31项本地PASS”包含不满足原后台义务的E2E-35；E2E-38也存在A-R3所述不足活动窗。notes诚实披露限制值得保留，但不抵消必须步骤未执行的事实。
- **期望/DoD：**按A-R4补实测或保留非PASS并同步摘要/运行映射；B-02同时阻止删除/弱化断言后自动变绿。不得用本次送审授权替代范围变更批准。

## Suggestions

1. **UX-IAT-08的状态与原因应一致。**`tools/desktop-recv/e2e/iat-suite.mjs:635`至`:648`仍固定写“T28工具未交付”，但测量器已经存在并实跑。保持NOT_RUN优于假PASS；建议将该组真正接到现有观测/复算/restore链路，或逐条记录哪些IAT义务由哪些同构建证据替代，修正过时原因。不能只因为其他测试存在就把占位记录改PASS；本轮实时测量需先按A-R3整改。
2. **测量器可按既有责任边界拆分。**B指出`measure-ux.mjs`1472行混合纯统计、方法校验、页内observer、HTTP、浏览器驱动及CLI。可把纯计算/校验与运行装置拆开以便总门禁复用复算，减少B-02所示重复但不一致的验证路径。属维护建议，不仅凭行数或个人风格判阻断；不要求扩大到未改模块。

## Reviewer

主审：`codex-gpt-6`（独立于实施方Claude）；日期2026-10-26，Asia/Shanghai。全新规格审查者`/root/r12_spec`、全新标准审查者`/root/r12_standards`并行只读，分别完成独立审查后提交原序报告，未互看对方结论。主审独立执行实际模块/验证函数反例，确认重叠信号及其边界。

采用dev-pipeline阶段6、code-review双轴、thermos角色/镜头、santa-method双过门禁、verification-before-completion、testing-protocol、code-review-excellence。仓库未检出AGENTS/CONTRIBUTING/CODING_STANDARDS/GLOSSARY/ADR文件；用户所给Context7规则明确排除code review，本轮未为一般代码审查查网络库文档，也未虚构额外项目风格要求。代码与验收修复归Claude，本轮仅写裁决。

### 材料与声明核对

- 根`docs/dev-pipeline/stage5-dev-summary.md`已在前置索引指向v2总结，下方明确保留v1历史；主审使用`docs/dev-pipeline/receiver-ux-v2/stage5-dev-summary.md`及round-12包作为本轮声明索引，不误读v1通过结论。
- 核对active_*指向的本轮需求、UI/架构、内部契约/向量、36任务/35 Waves、冻结方法、TDD与39条真实E2E定义、coverage/runtime映射；核对6份内审、exec-log、TDD账、T34～T36报告、autonomous-decisions/tech-debt及上一round-11裁决。
- 核对09b run-context、product/input/release候选manifest、两类结果、IAT、主要证明文件/截图、录像A/B原始帧及实时10侧记录。两张实际E2E-36截图只作既有证据复读，不冒充本轮新执行UI操作。
- 报告“实时报表5×30秒10/10 VALID”“E2E-35 PASS”经原始内容核查不满足冻结定义；“unit/tools全绿”“原20门禁通过”“当前UX门禁仅37两条”则已由主审复跑证实。正反结论均保留。
- 送审包中的录像性能摘录为旧数值；当前raw复算实际为下面表内15504/64/97.2及相应门槛，本轮不据旧摘要数值判断性能。新产品修复后，应重新评估受影响量测和引用，避免混用旧构建结果。

### 本轮实际执行及证据边界

| 检查 | 主审新执行结果 |
|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | exit0，12套202例，0 failed/todo/skipped；包括22 telemetry/17 view/7 display。全绿不覆盖本报告组合反例 |
| `node --test tools/desktop-recv/tests/{run-context,process-guard,measure-ux}.test.mjs`（实际逐文件参数） | exit0，61/61，0 failed/todo/skipped |
| `python tools/desktop-recv/tests/ux-evidence-selftest.py` | exit0，55/55；缺少B-02所述“彼此不同但各自SHA正确”等负例 |
| `python tools/desktop-recv/verify-evidence-selftest.py` | exit0，14/14 |
| `python tools/desktop-recv/e2e/video-prefix-check.py --selftest` | exit0，3/3，含同前缀正例与头偏移/尾截断负例 |
| `python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py` | exit0，20定义/27样例/44形状向量/6接口/15诊断；形状检查不证明A-R1组合语义正确，输出仍明示实现运行验证NOT_RUN |
| 09b `verify-evidence.py --gate local` | exit0，20 required cases通过 |
| 09b `verify-ux-evidence.py --context .../run-context.json --gate local` | exit1，仅E2E-37 result非PASS与executor不符两项；其余记录被工具接受，不等于内容已满足计划 |
| 同final context试`verify-ux-evidence.py --gate field` | exit1，22项：包含phase final不可证明field、缺E2E-39、local UX记录不属field及旧现场6项缺失。此为验证拒绝误用本地上下文，不冒充运行了独立现场context或现场验收 |
| 当前manifest/实物重哈希 | product/input manifest摘要与context相同；staging及release候选27/27产品文件SHA一致；其中24个可直接对应当前web源文件也逐个一致 |
| 独立主要文件往返核对 | 20个legacy主原/收对 + E2E-27～36共10对，30对实际磁盘SHA全部相等。仅此30对，不冒称新执行了所有嵌套录像/容量腿 |
| 当前候选`verify-assets.mjs --root build-desktop-recv/runs/20261025-teamexec-09b/receiver` | PASS；WASM SHA=d1080cdc600ca842a337b8ea6157bc5cc2c545aaa75fce7b14e8585e9eb4685b；沿用已配对v1严格EOF资产，未新构建WASM |
| 录像A/B raw独立复算 | A533/B508个ok帧，逐帧RTT=t结算−t提交、每轮nearest-rank p50/p95及Ready边界一致。5对中位A=[16707,65.4,94.3]、B=[15504,64.0,97.2]ms，门槛=[18627.7,71.94,108.445]ms，三式PASS；不能代替实时30秒义务 |
| 实时raw独立复算 | 10份各15采样，仅9条Receiving，约18.081～18.125s即Ready，但均valid=true。A-R3反例成立 |
| 真实产品模块组合探针 | .6→empty/unavailable仍显示60%；gate内20%未补画；Ready后旧速率/用时仍存在，timer=0；重复同view仍有语义paint。受控时钟/paint，不是浏览器或云桌面E2E |
| 真实UX验证函数负例 | OS临时目录内3组合均零违规：不同原/收正确各自SHA、缺全部必测步骤、无任何测量raw的measurement。未修改实际结果，不宣称整门禁通过 |
| 旧版本/范围保护 | 基线以来C++、原web/main.js/send.js、两份v1公共契约及旧run-03无diff；v1已通过项不重开。标准轴对44份变更源/工具文本定向私钥/AWS/GitHub/OpenAI模式扫描0命中，仅限定扫描而非全面安全认证 |
| 未新执行 | 未启动桌面E2E/浏览器/Narrator，未重录媒体，未做云桌面现场验收或最终包安装；没有把历史实测写成主审新执行。允许带缺口送审不使这些部分自动通过 |

### 已披露缺口与后续门禁

E2E-37仍在冻结计划中属于local、required=true、阶段5、executor，当前NOT_RUN；现场E2E-21～26/39仍NOT_RUN。用户于外审入口允许其“由用户侧执行，不在本次外审前阻塞”，主审据此开展本次审查，**不把该授权解释为已经正式删除或转移原验收义务**，也不因NOT_RUN本身新增一个与产品无关的重复阻断。本轮已因上列实际产品和验收缺陷不通过。后续拟认定完整本地/现场验收时，仍须取得真实结果或明确的范围变更依据；缺口保持可见，不能单改状态追绿。

UX-IAT-08占位NOT_RUN、阶段8最终包复核仍独立待办。整改时按实施计划影响规则执行：产品模型/视图/显示变更补UT与组合IAT，再在新构建复验真实双输入、等待/进度/停止/保存及相关UI；数值/tick改变须重新评估并执行冻结A/B和真实界面相关项；工具反例须先失败再修复通过。最终候选证据绑定新manifest/attempt，保留失败原件并重算双门禁，更新总结和runtime映射，不能把旧summary的PASS复制为整改后结论。

### 固定17项清单与Todo

| 项 | 两轴与主审结论 |
|---|---|
| 1 问题匹配/遗漏 | FAIL：A-R1/A-R2与用户所求可信进度/速率直接相关，真实验收有A-R3/A-R4缺项 |
| 2 代码与设计对齐 | FAIL：临时报告降级与显示提交语义偏离冻结契约 |
| 3 设计过时/冲突 | 计划义务仍清楚；T28未交付占位原因过时，见建议1；4.7检查器已明确历史快照，不把其终态冲突单列产品阻断 |
| 4 范围/其他模块 | PASS（所审范围）：增量在接收器/工具，没有扩改C++/原发送链路 |
| 5 过度设计 | 无独立Blocking；测量器责任拆分为建议2，避免仅按长度要求重写 |
| 6 之前反馈 | v1已关闭不重开；本轮内审S7指出的后台缺项仍未完成，A-R4/B-03 |
| 7 正常功能 | FAIL：完成后活动速率/旧进度及报告降级显示错误已复现 |
| 8 废代码/低效 | FAIL关联B-01：lastBusiness从未提交，重复写相同语义；不另增主题 |
| 9 回归影响 | FAIL：现有组合/终态边界未被回归用例覆盖；未见其他模块破坏证据 |
| 10 敏感信息 | 限定44份变更文本模式扫描未命中；不把忽略/未提交文件当泄露，不作全面安全保证 |
| 11 业务桩/mock/假绿 | 未发现需要另列的产品桩；B-02门禁接受假证明，A-R3/A-R4有实际不充分PASS |
| 12 测试合理/真实操作 | FAIL：真实材料存在且哈希一致，但实时活动窗和visibility关键义务未满足，组合用例漏分支 |
| 13 决策有据 | lead后台降级记录存在，但不构成用户范围变更，不能保持原S02通过；其余已披露边界分列 |
| 14 前verdict闭环 | 上一round-11为v1通过、无遗留Blocking，本轮只审v2增量 |
| 15 验证铁律 | PASS（本次审查）：所有通过/失败检查均有新执行或明确历史复读边界 |
| 16 Blocking格式 | 每项有位置、证据、影响和期望/DoD；两轴分别保留原序，重叠交叉引用 |
| 17 总结逐条核对 | FAIL：主测试数字已证实，但31本地PASS/10实时VALID包含本报告反例，不能整体接受完成主张 |

- [x] 读取状态、根索引、本轮摘要、原需求/设计/计划、前裁决，锁定基线和HEAD。
- [x] 新建双轴并行只读审查，两轴独立结论分别保留。
- [x] 新执行单元、工具、自测、契约、资产及本地/误用现场门禁，读取完整退出结果。
- [x] 独立复算主要实物SHA、manifest、录像原始帧与实时样本，检查截图和真实步骤覆盖。
- [x] 对显示提交、报告降级、门禁弱验证运行具体反例，区分受控探针与真实E2E。
- [x] 输出本verdict；HEAD与原状态保护复核，只新增裁决，不修复、不改原记录。

审查前流水线原字节SHA-256=`66f6edf7f02f8779d0f7d6a2fac64c1bf44ce0312d82b7e00be7b229d047c023`，审查期间复核一致。审查结果供Claude阶段6消费，由Claude更新阶段状态和整改任务；本文件不代替研发修复或用户现场回执。

# 独立外部审查 — 本轮整改复审（Round-4提交包）

## Verdict

不通过

固定HEAD：`faf89067d43ea12822b5b190e4661d7a99b79654`，分支 `screen-capture-recv`。整改范围为 `a058fcdb8b9871f186c464f34edb7533ef982126...faf89067d43ea12822b5b190e4661d7a99b79654`（7提交、343文件、+9,193/-321）；完整功能范围为 `bfb0c8e471820ae493cd3694ea6bed5d5ac06c37...faf89067d43ea12822b5b190e4661d7a99b79654`（65提交、738文件、+39,480/-9）。包中64提交是 `31b9d30` 快照。

规格轴A不通过（3项Blocking）；标准轴B不通过（1项Blocking，与规格A-03重叠）。两轴独立报告、保留各自顺序和严重度，共3个独立残留主题。Worker生命周期、陈旧错误日志假绿和真实录像入口已有实证修复；4 MiB难压缩录像及20 MiB可压缩产物预算拒绝/恢复有真实字节证据。本轮不否认这些成果，但逐异常恢复、最后关键帧对照和录像保存量测仍不满足上轮DoD。

本轮只新增本verdict，不改产品、原始证据或流水线状态。请Claude阶段6读取本文件，携以下Blocking回阶段5整改；当前不能推进阶段7。

编号：当前 `external-review.ext_rounds=4`，按所读dev-pipeline公式 `N=ext_rounds+1` 产出 `round-5-verdict.md`，对应待审的Round-4提交包。提交包模板要求round-4文件名，与skill公式不一致；本审查不覆盖旧verdict，也不自行改计数。消费方请使用本文件实际路径。

## Blocking issues

### 规格轴 A — 不通过（3项）

#### A-01 / P1：E2E-15仍未逐个异常验证正常录像恢复

- **位置**：`tools/desktop-recv/e2e/run-e2e.mjs:2060`、`:2093`、`:2149`；`docs/tests/runs/20261021-teamexec-03/results.json` 的E2E-15。
- **问题/原因**：empty/text/corrupt连续导入，每次正确核对本次增量、终态、清理和入口可用，但随后只是 `waitVideoEntryReady()`。三个异常全部结束后，才唯一一次通过真实打开对话框导入V-GOOD并保存。按钮重新启用不能代替从该异常状态实际完成正常重建与保存。
- **证据**：两轴材料及主审源码复核一致；当前E2E-15记录只有5条入口/异常腿及一次最终恢复，proof只有这一组 `recovery/received.bin`。新 `leg-verdict` 确实拒绝了旧日志+Preparing反例，入口取消/选择也有真实系统操作日志，故这两项已关闭，不再继承旧假绿结论。
- **依据**：`docs/plans/test-acceptance-plan.md:155`～`:160` 的UAT-L15明确“每次失败后导入V-GOOD并保存校验”；上轮 `round-3-verdict.md` A-R3同样明确逐异常分支恢复。现摘要将T3全部关闭、E2E-15完成仍超出证据。
- **建议修改/DoD**：每个坏输入有限结束后，在同一页面且不刷新，实际正常导入、系统保存、外部SHA-256校验，再开始下一异常。给每个失败及其恢复绑定会话/尝试身份和独立落盘文件；取消选择后的正常重选同样留证。修复旅程并补跑E2E-15即可，不要求为此重跑无关旅程。

#### A-02 / P1：E2E-16的“共享前缀/最后关键帧”因果仍未被证明

- **位置**：`tools/desktop-recv/e2e/record-sender.mjs:100`、`:159`、`:333`；`tools/desktop-recv/e2e/run-e2e.mjs:2301`、`:2332`；run-03的 `fixtures-media/manifest.json` 与 `proof/E2E-16/timelines/v-last-with*.json`。
- **问题/原因**：每段录制前reload并加载同一payload，不等于两个屏幕录像从发送帧0开始。加载后发送端已运行约1.8秒，之后还要唤醒录制窗口、打开真实选源器，才开始录制；没有暂停/捕获起点同步或已录编码序列校验。manifest却直接断言两段“from frame 0 / share the same encoded trace prefix”。
- **本轮实证**：规格轴与主审分别用本机cv2只读读取两段现存WebM前30帧，在同一中央编码区域 `[160:940:8,430:1180:8]` 比较：首帧平均RGB绝对差79.054/255，前30帧跨片任意配对最小差33.137；同片连续重复帧最小差0.092、2.552。这些像素结果辅助支持未对齐，不能以“只是压缩差异”或reload声明代替共有编码序列证明；本轮没有解码每个帧标识来假称获得完整序列。
- **判据缺口**：当前with媒体时长39.8秒，在媒体时间8.028秒、提交118帧时已重建；without在5.842秒真实EOF无产物。它证明长短输入的足量/不足量及正常提前完成。`artifactFrameId===presented` 在应用遇产物即停止的机制下会自然成立，不能证明关键帧位于录像末尾、经过末尾在途结果/排空才正确完成；triage决策6仍未补上这一验收因果。另 `tStarUs=lastUs+artifactFrameId` 把帧编号加到微秒上，量纲不成立；118应作为帧身份，不能贡献118微秒。
- **依据**：`docs/plans/test-acceptance-plan.md:163`～`:168` 的UAT-L16；E2E-16及上轮A-R3要求可追溯末帧对照、真实EOF/在途排空顺序。无需让普通成功录像强制播到结束；需要专门用例覆盖关键数据恰在末尾的情形。
- **建议修改/DoD**：从同一可追溯录制源派生共有编码前缀的保留/去除关键末段对照，声明裁切点并核对首尾编码内容；让有关键数据版在实际媒体末段完成，无关键数据版EOF后未完成。记录真实媒体时间、frameId、末尾提交/结果及排空顺序和落盘哈希；时间与帧编号分别保存。补录/构造该专用对照并重跑E2E-16，不以普通长片提前成功替代。

#### A-03 / P2：成功录像保存后的量测仍取自保存前快照

- **位置**：`tools/desktop-recv/e2e/run-e2e.mjs:2906`、`:2373`；`docs/tests/runs/20261021-teamexec-03/results.json` 的E2E-16/E2E-18；`stage5-dev-summary.md:16`、`:77`。
- **问题/原因**：E2E-18 `videoLeg` 在Ready时取得 `readyState`，随后真实保存，但成功记录仍使用 `legTimings(readyState)`；E2E-16成功with腿同样使用保存前 `withState`。保存事件之后的状态从未重新读取来形成量测。
- **本轮证据**：规格轴、标准轴及主审分别读取当前实际记录：E2E-16 `v-last-with` 和E2E-18 `video-c-4mib`、`video-n-128kib`、`video-n-1mib-probe`、`video-n-4mib` 五个成功保存的 `saveRequestAt/writeCloseAt/saveMs` 全部null。对应落盘SHA-256相等是真实的，不能反向补出缺失时点。摘要却称四类时间边界已交付、T4.2.a完成。
- **依据**：AC-012/V-003（`requirements-spec.md:175`）；`test-acceptance-plan.md:231`～`:234` 要求保存请求/write-close时点，且“测量要求内的数据不可缺失后仍称测量完成”；上轮A-R2 DoD。性能阈值未冻结只影响目标评价，不免除实际量测。
- **建议修改/DoD**：保存成功后读取同一腿最终量测，保留Ready时的产物/解码信息并合并保存后时点；补齐对应录像量测、重新生成报告并修正文档完成主张。不能由文件mtime或手填时刻冒充应用事件。已有功能成功和正确字节不因此作废。

### 标准轴 B — 不通过（1项，独立原顺序）

#### B-S1 / P1：录像保存边界缺失，保存等待/写入量测未分开（重叠A-03）

- **位置**：`tools/desktop-recv/e2e/run-e2e.mjs:2906`、`:2373`；`web/desktop-recv/src/app.js:393`；`tools/desktop-recv/summarize.py:30`；`stage5-dev-summary.md:16`、`:77`。
- **独立证据**：标准轴实际Python核验上述5条录像的三个保存字段全null，与保存前快照的代码路径吻合。四个实时规模腿虽有saveMs，`measurements.json` 和报告明确承认它包含选择器等待及写入、未分离。
- **依据/期望**：实施计划 `2026-10-18-desktop-receiver-implementation.md:331`～`:332` 除要求各时点，还要求分别给出初始化/传输重建/保存等待/写入耗时。关闭时应补保存后快照及可区分选择器等待和实际write/close的事件边界，补受影响双输入量测并重汇总。未混入解码吞吐是正确的，但尚未满足该Task的分项量测。此项不否认已保存文件字节正确，不要求机械重跑全20条。

两轴对保存量测缺失独立重现，主审复验，作为高信号重叠；保留各轴严重度，不把它重复计成两个独立主题。

## Suggestions

- **S-1 / Suggestion：D-19据实描述实施方取舍**。本轮不把额外 `live-n-20mib-over-budget` 的NOT_RUN列Blocking，也不另创用户审批要求。冻结UAT-L18要求实际可构造的超产物预算拒绝与恢复，用户已指定可压缩20 MiB方案；该真实15008拒绝和恢复已执行。难压缩20 MiB额外腿未执行应继续单列，不能冒充已测。D-19宜标为实施方对额外探测腿的适用性/汇总判断，避免称作用户当面新增授权。4 MiB难压缩录像本次已经成功，不再存在需要范围缩减确认的前提。
- **S-2 / Suggestion：量测定义与摘要快照对齐**。`initMs`目前计算到Receiving，而非已采集的 `initReadyAt`；明确区分解码器初始化、等待选源和有效输入。stage5摘要虽声明钉死cb43f85，又混入31b9d30重跑语义，且表中录像体积/耗时仍是旧attempt（856,230,680 B等），当前记录为861,505,434 B；宜逐段标attempt并刷新当前摘要，不改写历史结果。
- **S-3 / Suggestion：减少收尾组装重复**。可复用“等待Ready→保存→读取最终状态→哈希/量测”的共用收尾，降低本次保存前快照遗漏再次出现的可能；属于Duplicated Code启发，不单列风格阻断。probe-bounds按attempt归档也可随此改善。

## Reviewer

- 主审：`codex-gpt-6`（独立于实施方Claude），日期2026-10-22，Asia/Shanghai。
- 全新独立规格审查者：`/root/round5_spec`；全新独立标准审查者：`/root/round5_standards`。两者按同一17项rubric并行只读，未互看结论；主审另行复验关键探针、录像与字节证据。两轴分别报告，不跨轴重排。
- 方法：dev-pipeline阶段6、code-review双轴、thermos角色/镜头、santa-method双过才放行、verification-before-completion、testing-protocol、code-review-excellence。仓库未找到AGENTS/CONTRIBUTING/CODING_STANDARDS/GLOSSARY/ADR文件，依据用户提供指令、冻结需求/契约/计划及既有代码约定，不发明风格规则。
- 材料：stage5摘要与自主决策索引、Round-4包/模板、Round-3 verdict、triage/tasks、AC/decision-log、模块契约/错误矩阵、实施/TDD/真实E2E计划、planning-cases、内审9/10及技术债、run-03记录/逐案proof/录像manifest/量测/复现指南/环境、当前源码及固定diff；旧run-01/02和早期内审作为历史基线，未冒充本轮重跑。

### 上轮主题闭环及本轮决策核验

| 主题 | 结论 |
|---|---|
| T1 初始化失败Worker释放、取消期清理门 | **已关闭**。主审和两轴真实模块组合探针均通过；主审又实际运行浏览器摘要失配IAT-03，18002且安全网close前terminate=1 |
| T2 规模/预算 | **功能与字节部分已补齐**。实时1/4 MiB双类、录像4 MiB可压缩、1/4 MiB难压缩等落盘字节核实；20 MiB可压缩15008及正常恢复证据成立，不要求重新缩减4 MiB范围 |
| T2 实际量测 | **未关闭**，A-03/B-S1。不是阈值审批问题，而是已成功操作的保存边界没有交付 |
| T3 陈旧错误日志假绿/真实入口 | **已关闭这些子项**。主审旧反例被5项判据拒绝；提交证据有真实打开/取消对话框与应用侧录入，DataTransfer分支如实另标 |
| T3 逐异常恢复/最后关键帧 | **未关闭**，A-01/A-02，不能因上述子项完成而宣称T3全部关闭 |
| S-1 陈旧PASS残留 | 已加入启动FAIL marker及attemptId和异常/finally处理；当前20记录均有独立attempt链。未因未改动历史记录重新发起旧Blocking |
| S-2 rVFC Stop/同步异常 | 本轮代码已补run主动结算、ended/error移除和回调异常保护，相关单测通过；既有监听器卫生债TD-18按披露保留 |
| S-3 可复核交付 | 已补复现配方、确定性样本manifest及历史快照说明；当前本机录像可读并已核对实际字节，不将干净克隆可直接下载媒体冒充已交付 |

### 本轮实际执行与边界

| 检查 | 本轮结果 |
|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | exit0；9套件108测试，0 fail/todo/skip |
| `python tools/desktop-recv/verify-evidence-selftest.py` | exit0；14/14 |
| `node tools/desktop-recv/verify-assets.mjs --root build-desktop-recv/staging/receiver` | exit0；PASS，assetSetId=desktop-recv-v1，revision=a515922d…；WASM摘要d1080cdc600ca842a337b8ea6157bc5cc2c545aaa75fce7b14e8585e9eb4685b |
| run-03 `verify-evidence.py --gate local` | exit0；PASS(20)。证明当前记录/主工件满足门禁，不补齐遗漏步骤或量测字段 |
| 同run `--gate field` | exit1；缺E2E-21～26六条记录，现场仍未执行，这是正确拒绝，不是本轮单独Blocking |
| 磁盘SHA-256独立复算 | 20对主工件全等于记录原/收hash；E2E-18九条执行腿（八条规模往返+预算恢复）的实际文件亦全等；不只检查canonical主对 |
| 大录像输入实物核验 | E2E18可压缩4 MiB、难压缩1 MiB、难压缩4 MiB对应录像实际文件分别86,586,644 / 215,269,512 / 861,505,434 B，流式重算SHA均等于腿记录。4 MiB成功是研发提交的实测证据经核验，不是主审新录制 |
| 生命周期正向组合探针 | 三次协议init-failed均Stopped、cleanupComplete=true，每个已创建Worker均收到terminate；取消未决时UI禁用且二次启动拒cleanup，晚到client关闭、pending清零后正常接受新启 |
| 真实浏览器IAT-03 | 主审启动独立回环静态服务和headless Edge155.0.4283.62，用当前staging动态调用现有runDigestMismatch；exit0，`code=18002 terminates=1`，计数读取在安全网close前。真实Worker/WASM资源哈希拒绝，不是mock；只关闭自身browser/server，无原证据修改 |
| 旧E2E-15反例 | 主审调用当前leg-verdict：同attempt+空日志增量+Preparing+入口禁用+清理未完成，返回ok=false及5项失败 |
| E2E-16录像只读抽样 | 规格轴和主审分别复现上列前30帧像素比较；未修改录像，未将抽样称完整编码序列检验 |
| 构建/回归范围 | 产品src/worker自固定候选f70d324至本轮HEAD无差异；当前src与staging逐文件SHA相等。整改C++共享源无差异，native9/9沿用Round-1历史，不声称本轮重跑或重建WASM |
| 敏感信息模式扫描 | 固定完整差异内484份可解码文本，私钥/AWS/GitHub/OpenAI凭据定向模式0命中；不扩大为全面安全认证 |
| 桌面全E2E与现场 | 主审本轮未重新占用桌面执行全20旅程；核对的是研发提交的新run-03日志、截图、时间线、媒体和落盘字节。现场未执行 |

### 固定17项清单与Todo

| 项 | 本轮判断 |
|---|---|
| ①范围/任务覆盖 | FAIL：A-01～03为前轮明确DoD残留，未新增容量档位要求 |
| ②代码/设计一致 | T1资源门已实证对齐；T3测试对照与T4.2.a记录实现仍不足 |
| ③文档一致 | FAIL：T3全部关闭、完整量测主张超出当前证据；当前/历史attempt见S-2 |
| ④最小改动 | 变更集中接收端及验收工具/文档，无新共享C++改动，不要求修改发送协议 |
| ⑤过度设计 | 无独立Blocking；不强制新框架或额外原生兜底 |
| ⑥内审反馈 | round9登记/代码不一致已由已提交判据重跑解决；round10未覆盖上述残留，不能替代本轮独立审查 |
| ⑦正常/异常功能 | 已提交成功字节、资源修复成立；未因测试证据缺口假称产品所有正常功能失败 |
| ⑧桩/死代码/效率 | 未发现业务mock/TODO伪装实现的Blocking；收尾重复仅建议 |
| ⑨回归 | 108单测、真实Worker摘要拒绝本轮通过；native历史复用范围明示 |
| ⑩敏感信息 | 已实际执行上述定向扫描无命中 |
| ⑪假绿 | 旧日志反例已拒；末帧自证式判据仍不能支撑该用例完成，A-02 |
| ⑫真实用户E2E | 真实入口、落盘与规模证据已补；逐异常恢复和末帧控制变量仍缺 |
| ⑬自主决策 | D19额外腿不创设审批；决策6不能以提前停止判据替代冻结末尾专用场景 |
| ⑭前轮Blocking | 依上表明确已关闭/部分关闭，不机械延续旧FAIL |
| ⑮证据纪律 | fresh命令、受控探针、媒体抽样、研发提交E2E和历史native分别标注 |
| ⑯阻断三元组 | 每项均有位置、证据、最小DoD |
| ⑰摘要核验 | FAIL：T3与保存量测完成主张仍超出源码及实际记录 |

Todo：固定审查点、读取索引/核心证据、新双轴并行审查、必要命令复跑、关键反例/修复与文件核验、verdict及只读边界复核均完成。后续应先修验收判据和量测采集，再补E2E-15、E2E-16及受影响量测；未改动且证据有效的其余旅程按冻结计划保留明确引用，无需机械全量重跑。若再改产品/资产/profile，按实际影响范围绑定新attempt/run和提交，并更新对应证据。

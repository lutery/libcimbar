# Round 18 — PS5.1正式化整改独立复审

## Verdict

不通过

**2个独立Blocking主题：开页采集/判定链仍不能证明目标URL；合法utility对话框的成功路径返回值错误。** 规格轴A、标准轴B分别不通过。B轴的开页交叉发现与A18-01去重，不另计第三主题。

固定HEAD `42051b0b4056c787e987f1061e7f6a9b25d022cd`，分支 `ps51-preview`；本轮整改基线 `abb650aad809a07396632377ca94178c4272788c`。本裁决仅审round-17两主题的整改及新增改动，不重开原核心、已关闭的进程清理或用户决定的现场缺口。

产品仍27文件同字节，PS5.1实时/录像接收保存和失败恢复的原收证据有效。主审新执行工具69/69、自测8/8及6/6均通过，但真实生产链反例表明这些绿灯尚不足以批准1.2.0正式化。本轮不打包、不合并；只新增本裁决，不修改产品、原始证据或流水线状态。

## Blocking issues

### 规格轴 A — 不通过

#### A18-01｜地址栏记录被丢弃，TCP端口通道又被当成精确页面证明；A17-01未关闭

- **位置：**`tools/desktop-recv/e2e/run-e2e.mjs:1747`、`:1765–1768`，连接采集`:1670–1678`；`tools/desktop-recv/e2e/page-open-check.mjs:66–74`；root15 `proof/E2E-1/page-open.json`；开发总结§8.5。
- **采集器的直接错误：**生产代码生成 `SNAP|pid|handle|title|url`，共5列，解析器却要求 `parts.length >= 6`，再用 `parts.slice(5)`取URL。正常五列地址栏记录被忽略。A与主审分别抽取真实解析块，输入 `SNAPW|28652|200402|Cimbar|1`及 `SNAP|28652|200402|Cimbar|http://127.0.0.1:8767/`，实际得到一个窗口、`urlValues=[]`，探针exit0。没有真实UI动作。
- **当前开页实物：**root15的pre/post全部urlValues为空，verdict.hits为空；唯一通过依据是ownerImage=msedge.exe的TCP端口记录。11条pre记录是窗口摘要，不是11个已读取的地址栏值。由于上述确定的解析错误，不能把空URL仅解释为Windows前台锁/后台页签。
- **判定器的独立错误：**连接通道只检查ownerImage及line包含端口字符串，不承载HTTP页面路径/query，也不核对连接状态。生产watcher收集所有状态。TCP空闲及地址栏未读到目标不能推出“连接只能来自本次新打开的精确页面”。
- **A与主审新执行反例：**直接import真实judge，保留当前page-open.json所有TCP事实，仅把targetUrl改成同端口 `/this-page-was-never-observed?review=not-opened`，仍PASS；把唯一msedge记录及其line改成SYN_SENT，仍PASS。标准轴另独立确认同端口错误页面、仅连接尝试也可PASS。探针均exit0，无浏览器操作。实际root15记录是ESTABLISHED，因此不声称本次连接失败；问题在于其无法证明要求的精确页面身份。
- **关闭条件：**修正生产采集输出/解析协议，加入正常原始SNAP行经过真实解析器进入URL判定的检查，不能仅手造post数组测judge。默认开页必须保存本次页面/导航的精确URL及启动关联；TCP记录只能作为辅助，不能独自PASS。后台页签可用能确认其URL的页面证据，或安全地激活本次目标页后读取真实地址栏。增加正常采集正例、同端口不同路径/query、仅SYN_SENT、旧后台页但无本次页面关联等拒绝例；随后重跑E2E-1开页腿，绑定新attempt并保留旧原件。
- **边界：**这是验收假阳性与证据不足，不宣称产品实际没有打开正确页面；不要求为此改接收产品、发送协议或重跑全部核心矩阵。台账/总结中的“连接承载精确URL”“空URL由前台锁造成”的表述应随真实新证据纠正。

### 标准轴 B — 不通过

#### B18-01｜合法utility对话框通过归属后，诊断文字污染返回对象

- **位置：**`tools/desktop-recv/e2e/native-dialog.ps1:435–441`，`Find-ByName`定义`:526`及实际调用`:1149`附近。
- **事实：**pass2归属验证成功后，Find-Dialog先用 `Write-Output`输出ownership诊断，再return UI元素。PowerShell把两者都放进成功返回流，调用方 `$dialog`得到 `[String, AutomationElement]`数组；后续按单个元素调用FindAll会失败。
- **B与主审独立实证：**通过AST抽取真实Test-DialogNameForAction/Test-OwnershipFacts/Select-DialogRecords/Find-Dialog/Find-ByName；以纯内存UI树及进程链模拟目标111→utility333，仅替换UI/CIM边界。真实Find-Dialog返回 `System.Object[]`、Count=2、类型 `[System.String, R18DialogNode]`。随后真实Find-ByName报“System.String不包含名为FindAll的方法”。探针exit0，真实UI查询、点击和输入均为0。
- **为何6/6未捕获：**自测只调用Select-DialogRecords，p1证明合成父链在纯选择规则中可被接受，没有执行Find-Dialog包装层。真实E2E的两个对话框均pass1，也没有覆盖新pass2的返回流。本包已如实说明utility未实跑；该说明不能替代实际可用的成功路径。
- **关闭条件：**将诊断移到非返回流，保证Find-Dialog成功时仅返回一个UI对象。增加完整 `Find-Dialog → Find-ByName` 的合法utility正例，验证返回类型/数量及下游调用成功，同时保留外部save/share拒绝反例和target直连正例。修复后重跑受影响的对话框旅程；无需重做未变的核心容量/UX验收。

#### B18-02｜开页连接通道的交叉发现

B独立调用真实judge，验证无URL命中、仅SYN_SENT仍PASS，以及目标 `/required-page`、浏览器显示 `/unrelated`但同端口TCP存在时仍PASS。位置、影响和关闭条件与A18-01相同，计为同一主题。两轴报告保持分开，不用一轴的正向结果替另一轴放行。

### 上轮与既有项状态

| 项 | 本轮状态 |
|---|---|
| A17-01：默认开页精确URL及启动关联 | **未关闭**：A18-01包含采集字段错位及连接通道假阳性 |
| B17-01：无关窗口归属拒绝 | **部分关闭**：原无关PID222/无链msedge拒绝规则已修复；合法utility完整成功路径仍有B18-01 |
| A16-02/B-R16-1：按端口误停服务 | 保持CLOSED；矩阵工具字节本轮未变，沿用round-17主审12/12实跑 |
| S15-01及S16-01/02/03 | 保持关闭；本轮工具身份8项和状态索引已核对 |
| PS5.1实时/录像、失败恢复及未变核心 | 保留已有有效证据；不以本轮不通过全部推翻 |
| E2E-35/37、现场七项 | 用户既定NOT_RUN边界不变，不新增阻断 |

## Suggestions

None。本轮整改仅针对上述两个主题和受影响证据，不增加无关功能或全面重测要求。

## Reviewer

主审：`codex-gpt-6`（独立于实施方Claude），2026-10-29，Asia/Shanghai。全新规格轴 `/root/r18_spec`、全新标准轴 `/root/r18_standards`并行只读，均返回FAIL。主审独立复验两主题的生产函数反例及自测/工具套件，没有只依据CLOSED台账放行。

方法为dev-pipeline阶段6、code-review双轴、thermos、santa-method、verification-before-completion、testing-protocol、code-review-excellence。未检出仓库新增AGENTS等规则文件；遵守用户Context7的code review例外，不请求外部库文档。只写verdict，不修复或推进状态。

### 范围、材料与实物身份

已核对根stage5索引、本轮开发总结§8.5、round-17裁决、round-18包/模板、r17-remediation、相关RED/首败记录、当前diff，以及root15的run-context、两份manifest、8工具身份、page-open输入和结果、engine-env、原收/外部SHA和复现记录。既有需求/设计/实施与E2E方案按已确认关闭条件继续适用，没有改验收口径。

提交链：`232fb71`→`8951620`→`a56e74c`→`a38230e`→`a0530ed`→`db1257c`→`42051b0`。当前根 `docs/tests/runs/20261029-teamexec-15`，attempt `candidate-20261029-02`，harness `a38230eee170e7396ae9887c19166f114d78f577`。主审和两轴逐项核验：

- product-manifest原字节SHA `7a5e5f1a4ac19825c7055ca6ea199d9f6e0914b24ba6b277243c38ff57fb0abf`，与root14完整清单逐字相同；staging27文件逐个重哈希匹配。
- input-manifest原字节SHA `0808a14a95fd794a4f53a87eb34afe5de62b916b1ffc5fcd639c2c9a50f971ed`，与context相同；42项输入大小/SHA全部匹配磁盘。
- tools-identity8项内容SHA全部匹配当前文件。本轮产品、矩阵工具和冻结方法未改；变更工具限run-e2e、page-open-check、native-dialog及其selftest数据。
- E2E-1 attempt `E2E-1-2026-10-29T10-24-22-281Z-8589dc`；E2E-2 attempt `E2E-2-2026-10-29T10-28-35-200Z-5f9ecd`。E2E-1主/实时/录像和E2E-2主/实时共5份接收文件实际等于对应原件，SHA均为 `2f5a22f95c019d18cfbdd4f64da9c2e1d9ff3b0d83a7e0bc52c6d46b202f046e`，存量certutil记录一致。
- 首败 `fail-attempt-d28bb1`、主模块守卫失败及修复记录已保留，不把首败改写成通过。该import副作用由a56e74c修复，主审当前69项工具测试通过，真实import判定也没有劫持CLI。

### 主审本次实际执行

| 检查 | 实际结果 |
|---|---|
| 三套工具 `node --test` | 最终exit0，69/69，0 fail/skipped/todo；含真实run-e2e参数/导入边界 |
| page-open `--selftest` | 原工具字节OS临时复制件，exit0，8/8 |
| native-dialog `-Action dialog-selftest` | 原脚本及JSON的OS临时复制件，exit0，6/6；无UI操作 |
| 当前page-open.json复算 | 真实judge仍PASS，地址栏hits=0，仅msedge TCP为依据 |
| 未观察路径/query反例 | 同端口改targetUrl而保留raw连接，真实judge仍PASS |
| SYN_SENT反例 | 同步修改state及line，真实judge仍PASS |
| 正常SNAP原始行解析反例 | 原始行包含精确目标URL，却解析为urlValues=[] |
| 真实Find-Dialog完整包装层反例 | 合法utility返回String+UI对象；真实Find-ByName调用失败 |
| JS语法 | run-e2e/page-open-check的node --check通过 |
| 候选资产 | root15 verify-assets：ASSET VERIFICATION PASS；WASM SHA仍d1080cdc600ca842a337b8ea6157bc5cc2c545aaa75fce7b14e8585e9eb4685b |
| 变更工具diff检查 | `git diff --check abb650a..HEAD -- tools/desktop-recv/e2e` exit0 |
| 矩阵/冻结件范围核对 | 相对上轮无变化，未重新执行矩阵12案 |

两个selftest会在工具目录写结果，因此只在主审独有OS临时目录的原字节复制件运行；该目录经绝对路径、父目录和专属前缀核对后移除，没有改动真实工具/证据。所有反例只改内存输入/模拟UI及CIM边界，没有操作真实浏览器、原生窗口、注册表、机器PATH或停止现有服务。

本轮未新执行完整桌面E2E、用户云桌面或最终包安装；原收/engine-env/certutil为复读研发原始实物，不冒充主审新保存。222单元和77/14/3自测等未改套件沿用此前证据，未重复或写成新实跑。正式1.2.0最终包尚未组装，本裁决不是最终包验收。

### 固定17项与Todo

| 项 | 本轮判断 |
|---|---|
| 1 问题匹配/遗漏 | 默认开页未闭环，utility包装层新增失败 |
| 2 代码/设计 | 精确URL要求与端口判定不等价 |
| 3 文档当前性 | “连接承载精确URL”“空URL仅因前台锁”没有证据支持 |
| 4 范围 | 产品27文件未变，不扩改核心 |
| 5 过度设计 | 无独立Blocking |
| 6 旧反馈 | 归属拒绝已实质修复，开页和完整utility正例仍不足 |
| 7 正常功能 | 合法pass2的下游调用失败 |
| 8 死码/效率 | 无独立Blocking |
| 9 回归波及 | 新诊断输出污染既有UI对象调用约定 |
| 10 敏感信息 | B限定4份变更工具文本凭据形态扫描0命中 |
| 11 桩/MOCK假绿 | 产品无新增；纯内存反例不冒充产品E2E |
| 12 测试真实性 | 两自测绿但漏采集解析/完整包装层，存在确定反例 |
| 13 决策依据 | 后台页签需兼容，但不能把TCP替代精确页面身份 |
| 14 旧verdict闭环 | A17-01未关闭；B17-01部分关闭；旧清理等保持关闭 |
| 15 证据铁律 | 新执行、复读实物及未执行分别列示 |
| 16 发现格式 | 两主题均具位置/证据/关闭条件，重叠主题去重 |
| 17 总结逐项核对 | 身份/传输属实；两项完整关闭声明不成立 |

- [x] 固定HEAD、基线、状态及候选身份。
- [x] 新A/B并行只读，分别报告后合成两值裁决。
- [x] 主审新执行69项工具测试、两自测及生产链反例。
- [x] 核对27产品、42输入、8工具及5份原收实物。
- [x] 明确两主题关闭条件，保留原核心和用户现场边界。
- [x] 只新增本裁决，保护原产品、证据、索引和状态。

流水线仍external-review / waiting_external、ext_rounds=17；原字节SHA256保持 `a25a4c862d36c3d82046af9c4f7c517ca2ffbd18d91afce7641a27291fc98b65`。Claude阶段6可消费本文件，提取A18-01/B18-01返回阶段5；完成受影响整改与新证据后再送审。未批准本轮打包或合并。

# Round 16 — PS5.1 支持正式化（1.2.0）独立审查

## Verdict

不通过

**2个独立Blocking主题：PS5.1完整受影响旅程未执行；新增启动矩阵可能终止无关服务。** 规格轴A不通过（2项），标准轴B不通过（1项，与A的工具安全问题重叠，不重复计数）。本轮不批准1.2.0正式化收口。

产品的PS5.1启动能力已有实际正向证据：主审在中文空格目录、无关工作目录下，执行真实PS5.1/PS7直启及CMD优先/无pwsh回退，四条均exit0且HTTP资源字节相同；失败码2/3/4/5正常。上轮S15-01已关闭。这些结果不能替代本次正式转正明确要求的PS5.1完整E2E-1/2。

固定HEAD `da40f55c42c2ccb43fbfcb5b26005d116ce5705d`，分支 `ps51-preview`；审查基线为已交付1.1.0的 `7b91057be04a881d25fce75c816f8c3185450543`。同时逐项检查round-15对象 `a2c05e1` 之后的正式化增量。本轮只新增本裁决，不修复代码、不改变流水线状态，不重开原round-14/15已通过范围。原E2E-35/37及现场七项仍依用户既有决定保留，不构成本轮新增阻断。

## Blocking issues

### 规格轴 A — 不通过

#### A16-01｜PS5.1下完整E2E-1/2缺失（验收证据Blocking）

- **位置：**`docs/dev-pipeline/receiver-ux-v2/exec-log.md:222`；`docs/dev-pipeline/ext-review/round-16-package.md:80`；`tools/desktop-recv/e2e/run-e2e.mjs:1609`、`:1651`、`:1666`、`:1803`、`:1814`；`tools/desktop-recv/e2e/ps51-launch-check.mjs:317`及CMD正例。
- **要求与事实：**转正边界明确写“含5.1下E2E-1/2回归”。root13完整E2E-1的预检使用pwsh，CMD在有pwsh的环境运行；E2E-2的失败/恢复直接spawn pwsh。新增矩阵的PS5.1/CMD回退正例均带 `-NoBrowser`，验证HTTP与index/WASM摘要，没有执行接收、保存或默认启动自动开页。送审包第80行也主动说明以“pwsh完整旅程＋PS5.1 HTTP矩阵”组合代替。未找到批准变更该转正验收口径的决策。
- **证据边界：**root13 E2E-1的主、实时、录像接收文件，E2E-2主、实时接收文件均与原件SHA相同，是真实有效的既有pwsh旅程证据；不是PS5.1完整旅程执行证明。主审本轮PS5.1 HTTP正例也不能补成该证明。本项不宣称产品接收功能已发生故障。
- **关闭条件：**在当前候选上明确隐藏pwsh，记录实际Windows PowerShell 5.1引擎及子进程环境，执行中文空格目录下的CMD启动→真实实时接收/保存及录像导入/保存；执行端口占用→可读失败→释放端口→干净恢复→实时接收/保存。首次启动至少包含用户默认启动方式的开页验证，不能全部由测试框架另开页面代替。绑定新的attempt、当前构建、输入身份、原收文件与外部SHA。保留现有PS7证据和失败原件；无需重跑未改核心的全部UX/容量矩阵。

#### A16-02｜启动矩阵按固定端口清理无关进程（工具安全Blocking）

- **位置：**`tools/desktop-recv/e2e/ps51-launch-check.mjs:158–175`、`:297–299`，固定端口定义`:308–311`。
- **触发链：**18771/18772/18774若原本由其他服务占用，launcher会exit3且没有输出服务PID；`positiveLaunch`仍因 `serverPid > 0 || port` 为真而调用 `stopServerByPid(0, port)`。清理函数在端口未释放时通过netstat取得占用者PID，直接 `Stop-Process -Force`，没有证明该进程属于本次测试。直接PID分支也没有创建身份核对。
- **证据：**规格轴独立核对上述调用链；标准轴与主审分别抽取真实函数体，输入pid=0、端口18771被外来PID424242占用，仅把OS调用替换成记录器。实际函数请求 `Stop-Process -Id 424242 -Force -ErrorAction SilentlyContinue`，并可返回端口已空闲。两个反证均未实际终止任何OS进程；这是对真实清理决策的有界反证，不把模拟当产品E2E。
- **关闭条件：**只清理能证明属于本次启动的进程，校验创建身份及规范化server路径等事实；不得依据端口占用者身份直接杀进程。端口预占用应FAIL/中止，并保留外部监听器。补充自有无关监听器、未取得PID、PID身份变化的拒绝清理反例，以及本次实际服务正常清理正例。清理不得把“端口空闲”当作有权结束占用者的依据。

### 标准轴 B — 不通过

#### B-R16-1｜新矩阵会结束不属于本次测试的进程

与A16-02是同一Blocking主题，保留本轴独立报告归属，不合并重排。

B独立核对 `ps51-launch-check.mjs:158–175`及`:297–299`，独立执行真实函数体的记录器反证：启动方PID为0、netstat返回外来PID424242时，工具仍请求强制停止该PID。当前8/8 PASS记录只覆盖正常清理，未覆盖此失败分支；不能据正常记录放行工具安全。关闭条件同A16-02，包括正常本次服务的清理正例和拒绝误清理反例。

B未发现另需阻断的产品静态破坏、无关结构扩张或凭证提交。独立核验root13清单和27个staging文件、23同/4变、sender原包修复及5份变更源码/工具文本限定凭据扫描。产品动态正例由主审单独执行，未由本轴的静态检查冒充。

## Suggestions

### S16-01｜消费轮次与流水线索引不一致（Warning，非阻断）

`round-16-package.md:4`称ext_rounds=15；实际 `pipeline-state.json` 仍为ext_rounds=14、原1.1.0 release-packaging已完成，materials指向round-14。round-15裁决已经真实归档，本轮不覆盖它，按送审包和用户新指令输出round-16。Claude消费时应明确本次正式化迭代与轮次，并将新材料接入开发总结/状态索引，避免按旧状态误消费或复用旧正式包。本审查者依阶段6边界不代改状态。

### S16-02｜新矩阵工具身份应另行绑定（Suggestion，非阻断）

root13 `run-context.json` 中harnessRevision为 `7e34289`，新 `ps51-launch-check.mjs` 却在 `64b54ad` 才进入提交。该revision可以描述当时已有E2E harness，不能表述为覆盖新增矩阵工具。建议为矩阵记录实际工具提交/内容SHA，并把两种证据身份写清。本轮已直接检查当前工具字节，不以旧revision替代其审查。

### S16-03｜送审复跑命令使用不存在的参数（Suggestion，非阻断）

`round-16-package.md:58`的启动矩阵命令带 `--out`，实际parseArgs不支持。主审原样执行，原生退出码2、`unknown argument: --out`，在解析阶段退出，未执行危险清理或改写证据。修正为工具支持的参数并指定独立复验运行根；A16-02修复前不得仅删参数后在真实环境直接运行。该文档问题不否认现有JSON的8/8记录。

## Reviewer

主审：`codex-gpt-6`（独立于实施方Claude），2026-10-29，Asia/Shanghai。全新规格轴 `/root/r16_spec`、全新标准轴 `/root/r16_standards` 并行只读，均返回FAIL。原15轮审查者未复用为本轮独立轴。

方法：dev-pipeline阶段6、code-review双轴、thermos、santa-method双过门禁、verification-before-completion、testing-protocol、code-review-excellence。未检出仓库内AGENTS/CONTRIBUTING/CODING_STANDARDS等附加规则文件；遵守用户提供的Context7规则，code review不调用外部库文档。原stage5索引、active需求/设计/实施/测试计划为背景；新增正式化主张按release-1.2.0-plan、exec-log的R15/R16、round-16包、原始root13证据及实际提交逐项核对。

### 固定范围与实物身份

提交链：`ff21be5`（兼容）→`a2c05e1`（旧预览）→`b807d1e`（S15-01）→`7e34289`（1.2.0计划/版本）→`6360cab`（sender原包字节）→`64b54ad`（root13/tool）→`da40f55`（本轮送审材料）。

候选根 `docs/tests/runs/20261028-teamexec-13`，attempt `candidate-20261028-01`；staging为 `build-desktop-recv/runs/20261028-teamexec-13/receiver`。主审及两轴核对：

- product-manifest原字节SHA为 `7a5e5f1a4ac19825c7055ca6ea199d9f6e0914b24ba6b277243c38ff57fb0abf`，input-manifest为 `fb6a32520ba55221f0d434e15b846ce88d04cb5a54b925d77792d0669e4005e0`，均与context一致。
- staging27文件逐个SHA匹配；相对root12恰23文件同字节、4文件变化：`config/asset-set.json`、`launch.cmd`、`launch.ps1`、`package.json`。两个launcher与当前源码字节一致，package与HEAD blob一致，version=1.2.0。未改运行时证据复用有字节基础，不要求全部重跑。
- sender21项交付清单的大小/SHA及权威ZIP内容匹配；B另验证清单本身和HEAD blob，原字节修复确实入库。不把恢复清单字节说成发送端功能重写。
- E2E-1 attempt `E2E-1-2026-10-28T19-30-37-269Z-4eb514` 与E2E-2 attempt `E2E-2-2026-10-28T19-34-28-236Z-f75684` 的上述5份主/分腿原收文件实际SHA均为 `2f5a22f95c019d18cfbdd4f64da9c2e1d9ff3b0d83a7e0bc52c6d46b202f046e`。本轮复读实物，没有冒充重新执行桌面保存。
- 存量矩阵JSON8/8、无false断言，index/WASM摘要与staging相同；不据此排除未覆盖的危险清理分支。

root12六个运行期fixture的历史manifest漂移已有本轮材料主动披露；原根保持只读，不用新清单覆盖旧失败或把root13两案冒充20案。正式1.2.0最终目录/ZIP尚未产出，本轮不是最终包验收，旧预览包不自动晋升。

### 主审新执行及结果

所有长命令均等到最终退出。因发现A16-02，**未运行研发矩阵的实际进程操作**；使用独立Python装置复制当前staging到OS临时目录 `中文 空格 临时预览`，从另一个工作目录启动，动态申请空闲端口；输出用文件捕获。每个服务只在核实PID命令行含本次临时根和server.py后定向停止，未按端口/进程名杀服务。最终装置exit0，临时副本已移除且未发现残留的本次服务。

| 主审本次检查 | 实际结果 |
|---|---|
| 实际引擎版本 | Windows PowerShell5.1.22621.6133；pwsh7.6.9 |
| PS5.1、PS7直启 | 两者exit0；中文空格路径打印完整 |
| CMD优先pwsh、隐藏pwsh后真实5.1回退 | 两者exit0；回退前断言pwsh不可发现、python可发现、powershell指向真实5.1 |
| 四正例HTTP/字节 | 各自index.html与vendor/cimbar_js.wasm均HTTP200；1915/1939173字节，SHA逐个等于临时包 |
| PS5.1帮助 | exit0，双引擎用法可见 |
| PS5.1真实端口占用 | exit3，可读原因 |
| CMD回退时真实端口占用 | CMD最终exit3，错误码传播正确 |
| PS5.1缺server、隐藏python/py | 分别exit4/exit2及对应原因 |
| PS5.1受控服务exit23 | launcher exit5，明确unknown code，真实marker与日志路径保留 |
| PS7受控服务exit23 | launcher exit5，准确code23，marker与日志路径保留；S15-01关闭 |
| `node tools/desktop-recv/run-unit.mjs --all` | exit0，12套222例，0 failed/todo/skipped |
| 三套工具 `node --test` | measure-ux/run-context/process-guard：exit0，69/69，0 fail/skipped/todo |
| `python tools/desktop-recv/tests/ux-evidence-selftest.py` | exit0，77/77 |
| legacy证据自测、video-prefix自测 | 分别14/14、3/3，最终exit0 |
| 契约检查 | DESIGN_CONTRACT_SHAPES_PASS；20定义/27样例/44向量/6接口/15诊断，12 implementationCases仍NOT_RUN |
| root12 legacy local门禁 | exit0，20 required cases；复验的是被复用根，不冒充root13全量 |
| root12 UX local门禁 | exit1，恰4条：E2E-35/37各result及executor缺口；保持原授权，不称全绿 |
| root13 staging资产检查 | ASSET VERIFICATION PASS，revision7e34289，WASM SHA=d1080cdc600ca842a337b8ea6157bc5cc2c545aaa75fce7b14e8585e9eb4685b |
| 真实清理函数反例 | A16-02所述请求误停外来PID；实际OS终止数0 |
| 原样送审CLI命令 | 解析失败exit2，unknown argument --out；见S16-03 |
| 源/工具diff检查与冻结件 | 源/工具git diff --check exit0；performance-method相对0ed2e5b diff为空 |

独立启动命令形式为 `powershell.exe / pwsh.exe -NoProfile -ExecutionPolicy Bypass -File <临时包>/launch.ps1 -Port <空闲端口> -NoBrowser`，以及 `cmd.exe /d /c call "<临时包>/launch.cmd" -Port <空闲端口> -NoBrowser`。仅调整相应子进程PATH；没有改变机器PATH、执行策略设置、UTF-8 Beta或注册表。受控快退server只存在于OS临时副本，未改生产或证据文件。未新执行浏览器默认开页、抓屏/录像接收保存、Narrator或用户云桌面，也未代填其PASS。

### 17项与Todo复核

| 项 | 本轮判断 |
|---|---|
| 1 问题匹配/遗漏 | FAIL：A16-01正式化完整PS5旅程缺口 |
| 2 代码与设计 | 产品兼容范围对齐，工具清理需A16-02 |
| 3 文档当前性 | 完整验证表述超出证据；另有3项非阻断索引/复现建议 |
| 4 范围/模块 | 核心23文件不变，sender字节恢复已披露 |
| 5 过度设计 | 未见独立阻断项 |
| 6 原反馈遗漏 | S15-01由新双引擎快退实测关闭 |
| 7 正常功能 | 产品启动实测通过；新工具有误停服务风险 |
| 8 死码/效率 | 未见需独立阻断的问题 |
| 9 回归波及 | 核心复用有身份依据；工具可能波及无关服务 |
| 10 敏感信息 | B限定5份源/工具文本模式扫描0命中，不作全面安全认证 |
| 11 桩/MOCK假绿 | 未见产品新增桩；记录器仅用于拒绝工具安全声明的反证 |
| 12 测试真实性 | FAIL：两项Blocking；正常矩阵不覆盖失败清理或完整PS5操作 |
| 13 决策依据 | 未找到把完整5.1旅程改为分段组合的批准 |
| 14 前verdict闭环 | 原核心不重开，S15-01关闭 |
| 15 证据铁律 | 当前实测、复读历史实物、未执行分别记录 |
| 16 发现格式 | 两主题均有位置/证据/关闭条件，重复主题不重复计数 |
| 17 总结对实物 | 差异、哈希、非桌面测试属实；正式化覆盖主张仍不成立 |

- [x] 固定基线、HEAD、源码/证据和状态审前身份。
- [x] 新A/B双轴独立只读审查，分开呈现。
- [x] 新启动、失败出口、S15-01和包/证据身份复核。
- [x] 确认2个独立Blocking主题并给出具体关闭条件。
- [x] 区分复用证据、主审新执行及未执行旅程。
- [x] 只写本裁决，保护原产品、证据、索引和流水线状态。

流水线原字节SHA256保持 `40c4148c7b937f02852aee177d08c8b9cff98da6ebffbb731c26cef88c0eb630`。Claude阶段6可消费本文件，携两主题返回阶段5整改；修复工具并在当前候选上补齐受影响完整旅程后重新送审。无需重新开启已接受的核心UX主题或代用户执行现场项。

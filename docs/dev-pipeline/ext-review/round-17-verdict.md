# Round 17 — PS5.1正式化整改独立复审

## Verdict

不通过

**2项Blocking：默认开页判定仍可假PASS；新增原生对话框兜底会越过目标进程边界。** 规格轴A、标准轴B分别不通过。

上轮A16-02/B-R16-1“按端口误停无关服务”已关闭：主审实际运行当前矩阵，12/12 PASS，清理正例和拒绝反例均通过。A16-01已实质补齐PS5.1引擎、隐藏pwsh、实时/录像接收保存和端口失败恢复，但默认开页证据仍不足，故仅部分关闭。本轮不批准1.2.0正式化收口。

固定HEAD `abb650aad809a07396632377ca94178c4272788c`，分支 `ps51-preview`，整改审查基线 `da40f55c42c2ccb43fbfcb5b26005d116ce5705d`。原round-14核心、round-15预览及已关闭S15-01不重开。E2E-35/37、现场七项继续按用户既有决定保留，不作为本轮新增阻断。本轮只写此裁决，不修产品、不改状态或原始证据。

## Blocking issues

### 规格轴 A — 不通过

#### A17-01｜默认开页判定把标题变化当本次目标页面打开；A16-01部分关闭

- **位置：**`tools/desktop-recv/e2e/run-e2e.mjs:1929–1935`、`:1949`；`docs/tests/runs/20261029-teamexec-14/proof/E2E-1/engine-env.txt:11–13`；`docs/dev-pipeline/receiver-ux-v2/stage5-dev-summary.md:156–157`。
- **原要求：**round-16要求用户默认启动方式的开页验证，不得全部由测试框架另开页面代替。
- **实际代码与证据：**`probeBrowserWindows`只记录 `WIN|PID|MainWindowTitle`。判定将完整字符串放入Set，字符串变化即当newWindows；没有校验页面精确URL。当前证据的browser process evidence为空，只记录同一Edge PID28652的标题由“另外8个页面”变为“另外9个页面”。这能说明标题/页数变化，不能单独证明本次新开或激活的是 `http://127.0.0.1:8767/`。
- **独立反证：**规格轴与主审分别抽取真实三行判定执行：已有Cimbar窗口PID不变、浏览器进程证据为空，仅标题页数8→9，判定仍得到 `pageOpenOk=true`。已有产品窗口新增无关后台页也符合该输入；当前判定完全不需要目标URL证据。两次探针exit0，没有真实浏览器动作。
- **影响边界：**后续 `launchReceiver(PORT1)`由框架另开接收页，真实原收相同不能反向证明默认打开的就是目标页面。本项是开页验收假阳性和证据不足，不宣称产品实际没有开页；已补齐的PS5.1传输与失败恢复证据予以保留。
- **关闭条件：**默认启动开页证据必须包含本次新开/激活页面的精确目标URL及与启动的关联；普通标题/页数变化不能单独PASS。增加“旧产品窗口新增无关页/改标题，目标页未开”拒绝反例，并保留实际默认打开目标页面的正例。修复后重新执行E2E-1默认开页腿，保存绑定本次attempt/候选的证据；不要求重跑未改核心全部矩阵。

### 标准轴 B — 不通过

#### B17-01｜新增原生对话框兜底会选中无关应用的嵌套对话框

- **位置：**`tools/desktop-recv/e2e/native-dialog.ps1:364–370`；实际查找入口`:640`，共享操作消费所选dialog于`:1000`、`:1035`、`:1056`附近。
- **新增风险：**本轮Pass2在目标进程内未找到对话框后，遍历所有进程顶层窗口的后代；删除了基线对非目标顶层后代的PID过滤。仅凭标题匹配或保存时的 `#32770` 类名即可返回，没有验证与本次目标浏览器的归属。兼容Chromium utility进程是合理目的，但任意应用的后代窗口不因此取得归属。
- **独立实证：**标准轴和主审分别通过PowerShell AST抽取未经修改的新/旧Find-Dialog函数，用纯内存节点替代桌面树。目标PIDs=111，仅有无关进程222顶层“Unrelated editor”，其后代分别为：①Action=save，标题“Security confirmation”、类名 `#32770`；②Action=share，标题“Choose what to share”。两个案例当前函数均返回222，`da40f55`基线函数均返回null。各探针exit0；真实UI查询、点击、输入均为0。
- **影响边界：**反证证明无关窗口可通过查找门禁，没有实际操作进程222。共享支直接使用所选 `$dialog`查找来源/选项及共享按钮，存在误驱动其他应用共享对话框的实际路径。保存主支之后另用既有NativeMouse查找句柄，因此不把本反证描述成已经点击或写入该外部保存窗口。
- **关闭条件：**跨utility进程fallback也必须证明目标浏览器归属，如可靠的owner/进程链或本次创建关系；无法证明时拒绝。补充上述无关嵌套save/share窗口的拒绝反例及真实目标utility对话框正例，不能只进一步收紧标题而继续无归属遍历。修复后重跑受影响的原生选择/保存旅程，保留现有原件和失败记录；无需重做未变的核心UX/容量验收。

### 上轮主题关闭情况

| 上轮项 | 本轮裁决 |
|---|---|
| A16-01：PS5.1完整E2E-1/2 | **PARTIAL**：实际5.1环境、CMD回退、实时/录像保存、失败恢复及外部SHA已补齐；默认开页仍为A17-01 |
| A16-02 / B-R16-1：按端口误停服务 | **CLOSED**：删除netstat杀占用者路径；无PID拒绝、身份核对、预占用中止；主审当前真实矩阵12/12 |
| S16-01：轮次/索引 | **CLOSED**：ext_rounds=16，external-review等待态，新包/台账/总结已索引 |
| S16-02：工具身份 | **CLOSED**：6个工具内容SHA和harnessRevision已记录，主审全部重算一致 |
| S16-03：不存在的CLI参数 | **CLOSED**：本轮使用真实参数及独立repo-root/run-id，主审实际执行成功 |

两轴报告分别呈现，未将一轴正向结果替另一轴放行。规格轴仅正式报告A17-01；标准轴正式报告B17-01。两项均是本轮整改工具/验收主题，不重新扩大产品功能范围。

## Suggestions

None。本轮聚焦上述两项Blocking，不新增无关改进要求。

## Reviewer

主审：`codex-gpt-6`（独立于实施方Claude），2026-10-29，Asia/Shanghai。全新规格轴 `/root/r17_spec`、全新标准轴 `/root/r17_standards` 并行只读，分别返回FAIL；主审独立复验两项真实函数反例和当前启动矩阵。未复用上轮审查者作为本轮独立轴。

采用dev-pipeline阶段6、code-review双轴、thermos、santa-method、verification-before-completion、testing-protocol和code-review-excellence。按用户Context7规则，code review不请求外部库文档。未检出仓库AGENTS等新增规则文件；本轮只裁决、不修复、不合并或发布。

### 材料与固定身份

已读取根stage5开发索引、本次§8.4、round-16裁决、round-17包/模板、r16-remediation、release-1.2.0计划、状态/执行记录、实际diff，以及root14的context、manifest、工具身份、矩阵JSON、E2E引擎/开页/原收/外部SHA和复现记录；需求/设计/原E2E范围沿用已确认基线，针对本次关闭条件核对。

整改链：`ece38ff`→`7489ac4`（矩阵归属清理）→`ae6f1ae`（5.1完整旅程）→`11b449b`（share标题/查找）→`58dd622`（开页证据）→`e204340`（root14）→`6470350`（台账/索引/送审）→`abb650a`（阶段6等待）。

当前根 `docs/tests/runs/20261029-teamexec-14`，attempt `candidate-20261029-01`，harnessRevision `58dd622d7482f6729c7dc16b809274f30d64d709`。主审及两轴核验：

- product-manifest原字节SHA为 `7a5e5f1a4ac19825c7055ca6ea199d9f6e0914b24ba6b277243c38ff57fb0abf`，与root13完整清单逐字节相同；staging27个文件逐个SHA匹配。本次未改产品字节。
- input-manifest原字节SHA为 `a71a787f0cc1253ea382b84bedd3df833159627b84e072b4f72ace3b75e90ec0`，与context相同；其42项files[]逐个大小/SHA与磁盘一致。
- tools-identity中6个工具内容SHA全部等于当前文件；矩阵自载SHA为 `509c671041f6dfa1a1f6dc42583f54daff8b1bd602171e9a42ae42524b4912f0`。
- E2E-1 attempt `E2E-1-2026-10-29T07-49-08-344Z-363db1`；E2E-2 attempt `E2E-2-2026-10-29T07-51-42-280Z-5d7e6e`。E2E-1主/实时/录像和E2E-2主/实时共5份接收文件实际等于对应原件，SHA均为 `2f5a22f95c019d18cfbdd4f64da9c2e1d9ff3b0d83a7e0bc52c6d46b202f046e`，存量certutil记录一致。
- 两旅程engine-env均记录5.1.22621.6133、子进程去pwsh PATH、where pwsh exit1。E2E-1另有实际launcher powershell进程记录；E2E-2 watcher为空已披露，不冒充捕获。PATH回退和版本链支持该引擎身份。
- 本轮首败 `fail-attempt-766581`和旧RED尝试已保留。未运行旧危险矩阵或重演其实际杀进程RED，也未覆盖失败件。

### 主审新执行

安全核对后，运行**当前未经修改的矩阵脚本**，`--staging`指向root14候选，`--repo-root`指向主审独有OS临时目录，`--run-id independent-review-r17`。启动前逐个预检全部固定端口空闲；TEMP/TMP仅为该子进程指向主审临时根。没有改写root14日志或机器环境。

| 主审本次检查 | 实际结果 |
|---|---|
| 当前 `ps51-launch-check.mjs`真实完整矩阵 | 最终exit0，PASS，12/12；工具SHA与送审相同 |
| a/b/c及h4实际服务清理 | 全部记录CIM命令行、可执行与创建时点，verified=true，清理后端口空闲 |
| h1无关监听器、h2无PID | 均no-server-pid拒绝，h1自有监听器保持存活 |
| h3真实decoy进程 | identity-mismatch拒绝，decoy存活；没有以端口空闲为停止授权 |
| 占用/缺文件/无Python/快退 | 当前矩阵d/e/f/g51/g7全部通过；失败出口没有误报成功 |
| 开页真实谓词反例 | 同一PID、仅标题页数变化、无进程URL证据仍pageOpenOk=true；真实浏览器动作0 |
| 对话框新旧真实函数反例 | save/share各一例，新函数选外部222，旧函数null；真实UI查询/动作0 |
| 当前JS语法 | `node --check`两脚本通过 |
| 当前候选资产 | `verify-assets.mjs --root build-desktop-recv/runs/20261029-teamexec-14/receiver`：ASSET VERIFICATION PASS |
| 变更工具diff检查 | `git diff --check da40f55..HEAD -- tools/desktop-recv/e2e`：exit0 |
| 产品/原测试/冻结件范围 | 差异核对无变化；本轮工具改动仅e2e三个文件 |

矩阵实际正例验证index/WASM HTTP字节；WASM SHA仍为 `d1080cdc600ca842a337b8ea6157bc5cc2c545aaa75fce7b14e8585e9eb4685b`。该结果不等于新构建WASM。所有测试端口最终可绑定，主审临时根经绝对路径/父目录/专属前缀核对后移除。

本轮没有重新跑完整桌面E2E或操作用户窗口；上述保存文件/日志是复读本次研发原始实物，不冒充主审新保存。222单元、69工具、77/14/3自测和契约的主审实跑记录在round-16；对应产品/原测试未变，本轮未重复这些套件，未将研发绿扫当本轮新命令输出。新改工具以实际矩阵、语法和真实函数反例验证。

### 固定17项与Todo

| 项 | 本轮结论 |
|---|---|
| 1 问题匹配/遗漏 | A16-01部分关闭；默认开页仍不足 |
| 2 代码/设计 | 产品不变，工具目标归属及开页判定需整改 |
| 3 文档当前性 | “本次开页绑定”“foreign窗口拒绝”声明超出当前实现/实物 |
| 4 范围 | 未扩改接收核心、发送或协议 |
| 5 过度设计 | 无独立Blocking |
| 6 旧反馈 | 按端口误杀已关闭，默认开页未闭环 |
| 7 正常功能 | 新原生工具存在误选无关窗口风险 |
| 8 死码/效率 | 无独立Blocking |
| 9 回归波及 | 新Pass2扩大非目标进程后代扫描 |
| 10 敏感信息 | B限定3份变更源/工具文本凭据形态扫描0命中 |
| 11 桩/MOCK假绿 | 未见产品新增桩；纯内存反例不当作产品E2E |
| 12 测试真实性 | FAIL：开页假阳性及新fallback拒绝案例不足 |
| 13 决策依据 | utility兼容有理由，但不能替代归属；无放宽开页要求授权 |
| 14 前verdict闭环 | A16-02及三建议关闭；A16-01部分关闭 |
| 15 证据铁律 | 新执行、复读实物和未执行分别记录 |
| 16 问题格式 | 两项均有位置/证据/关闭条件 |
| 17 总结逐项核对 | 产品/工具身份和PS5传输属实；开页关闭声明未成立 |

- [x] 固定HEAD、基线、状态及本次候选身份。
- [x] 新A/B双轴并行只读审查并分别报告。
- [x] 独立执行当前12案矩阵，复核已关闭旧主题。
- [x] 独立复验两项无桌面操作反例，给出具体关闭条件。
- [x] 核对产品、42输入、6工具及原收/外部SHA证据。
- [x] 只写本裁决，保留产品、原始证据、索引、HEAD及流水线状态。

状态仍为external-review / waiting_external、ext_rounds=16；原字节SHA256保持 `7cccad5478df3ac0e4a8d7956295bbb7832c5dc79ead17e7f435d4be53005747`。Claude阶段6可消费本文件，携A17-01/B17-01返回阶段5；修复相应工具和补齐受影响证据后再送审。不得以本轮不通过重开用户已决定的现场缺口。

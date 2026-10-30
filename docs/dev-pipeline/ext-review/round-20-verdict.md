# Round 20 — PS5.1正式化整改独立复审

## Verdict

通过

**0 Blocking，0新增建议。** 新规格轴A、标准轴B均通过；上轮唯一主题A19-01/B19-01已关闭。

实施方采用裁决允许的最小修复：删除自动回收，端口占用只读诊断并拒绝启动，保留占用者。主审独立验证真实监听器拒绝后仍存活、释放后的空闲路径正常；原Python/外部Edge反例也不再发出停止请求。两条真实生产入口拒绝原件、正常腿和当前源码相符。

固定HEAD `196096a3e49055cbe875662e0032970272d49d01`，分支 `ps51-preview`，整改基线 `69bd4f46057bbe99bf70200b35cc72d665a8572f`。本结论针对PS5.1正式化候选的阶段6审查，Claude可消费后按既定流程从root17 staging组装1.2.0正式包、合并并交付。最终包目录/ZIP尚未由本审查者组装或验收；不把本结论写成最终包验收已完成。

原核心、URL-only开页、utility包装层、矩阵清理及其他已关闭项保持通过；E2E-35/37、现场七项继续依用户既有决定保留，不代填PASS。本轮只新增此裁决，不改产品、原始证据或流水线状态。

## Blocking issues

### 规格轴 A — 通过

None。全新规格轴 `/root/r20_spec` 独立审查并关闭A19-01：

- `reclaimStaleAutomationBrowser`整体删除，`run-e2e.mjs:219–232`的新assertCdpPortFree内无Stop-Process和标记子串授权。占用时只读查询owner并抛明确错误，符合上轮DoD允许的最小方案。
- 独立抽取真实函数体，以Python脚本路径含旧标记、外部Edge带标记profile两例驱动，均拒绝，CIM查询各一次、停止请求0；空闲直接返回、进程调用0。边界探针没有实际OS停止动作。
- 真实入口拒绝A/B的notes包含对应PID/映像/occupied原因；refusal.log均记录占用者在拒绝后仍存活。完整拒绝文案与源码、observation一致，未因console断言False而改写原件。
- 正常腿地址栏为pre8767、post8768，真实PS5.1/去pwsh/CMD默认启动成立；主、实时、录像三份接收文件与原件相同，外置certutil记录一致。
- 双manifest、27产品、42输入及8工具内容SHA全部匹配。产品未改，既有核心与现场边界不扩大。

本轴没有新执行桌面E2E或实际终止进程；真实入口腿为复读研发原件，主审另外运行针对性验证。

### 标准轴 B — 通过

None。全新标准轴 `/root/r20_standards` 独立审查并关闭B19-01：

- 自动终止路径已消除。接收器和录像器均在创建profile/浏览器前调用新守卫，拒绝时receiver未赋值，异常finally不会关闭端口占用者。
- 独立真实函数探针覆盖Python含标记、外部Edge、命令行不可读三种占用情形，均拒绝且停止请求0；空闲时不查owner。没有用“端口空闲”作为停止权限。
- 两个拒绝目录的FAIL、PID63048/95728及存活记录一致；完整拒绝在observation.txt，notes/refusal-message是既有截断，不描述成包含完整后半句。
- 核验构建/输入/工具身份与正常URL证据。唯一变更工具新增文本的定向凭据形态扫描0命中；未见本轮新增功能破坏、死码或范围扩张。

B未运行桌面或实际停止服务。两轴报告分别保留，主审依据下面的新执行与实物核对合成通过。

### 上轮关闭证据与失败记录的口径

| 主题/记录 | 本轮判断 |
|---|---|
| A19-01 = B19-01 | **CLOSED**：最小拒绝修复、真实入口A/B及主审正反例均成立 |
| refusal-python | 原E2E记录FAIL是预期拒绝；占用者存活，不能改写为完整旅程PASS |
| refusal-foreign-edge | 同上；自有外部实例由实施方后续按精确profile清理，不是被测守卫回收 |
| 正常E2E-1 | 独立attempt PASS，URL-only与实时/录像原收成立 |
| 初次占用编排失败 | normal-pass/orchestrator-note保留；未真占端口的首例不算拒绝证据，后续真实脚本重做 |
| 旧回收文案 | 已删除并在台账、总结§8.7、exec-log、reproduction更正 |
| 已接受核心/现场 | 不重开；本轮不把root17单条正常记录冒充全量矩阵 |

## Suggestions

None。notes截断和console断言False已如实披露，完整observation、占用者存活记录及独立实证能够互相核对，不构成新增整改要求。

## Reviewer

主审：`codex-gpt-6`（独立于实施方Claude），2026-10-29，Asia/Shanghai。新规格轴 `/root/r20_spec`、新标准轴 `/root/r20_standards`并行只读，分别返回PASS；主审独立检查当前真实函数、实际监听器和候选实物，未仅据CLOSED台账放行。

方法为dev-pipeline阶段6、code-review双轴、thermos、santa-method双过门禁、verification-before-completion、testing-protocol、code-review-excellence。未检出仓库新增AGENTS等规则文件；按用户Context7的code review例外未请求外部库文档。只裁决、不修复、不推进Claude管理的状态。

### 材料与固定身份

已核对根stage5索引、当前总结§8.7、round-19裁决、round-20包/模板、r19-remediation、RED及当前diff；读取root17的context/manifest/工具身份、两拒绝目录、正常page-open/engine-env/原收/外部SHA和复现记录。按已确认需求/设计/测试基线和本次唯一关闭条件审查，未改验收口径。

提交链：`2d9b1e5`→`18b7c22`→`c29ce3d`→`d7a36fa`→`196096a`。当前根 `docs/tests/runs/20261029-teamexec-17`，attempt `candidate-20261029-04`，harness `18b7c22ba3640b87c33967040906a59bbb9a133d`。

- product-manifest原字节SHA `7a5e5f1a4ac19825c7055ca6ea199d9f6e0914b24ba6b277243c38ff57fb0abf`，与root16完整清单逐字节相同；staging27文件逐个重哈希匹配。
- input-manifest原字节SHA `d4624727633d37b450c25f1f9e41daa364cc4885e93a2beaef2c57ce9a7641b3`，与context相同；42项输入大小/SHA匹配磁盘。
- tools-identity8项内容SHA全部等于当前文件；相对上轮仅run-e2e工具及本轮证据/文档变化，产品、矩阵和冻结方法无变化。
- 正常attempt `E2E-1-2026-10-29T14-48-12-018Z-7d9540`；主、实时、录像接收文件实际等于原件，SHA均为 `2f5a22f95c019d18cfbdd4f64da9c2e1d9ff3b0d83a7e0bc52c6d46b202f046e`，存量certutil结果一致。
- 拒绝A attempt `E2E-1-2026-10-29T14-41-53-692Z-9235f6`，占用PID63048；拒绝B attempt `E2E-1-2026-10-29T14-45-08-194Z-9458d9`，占用PID95728。两者results仍FAIL、refusal.log仍含原console断言False及存活True；observation保存完整拒绝，未修饰原始结果。

### 主审本次实际执行

| 检查 | 实际结果 |
|---|---|
| 三套工具node --test | 最终exit0，69/69，0 fail/skipped/todo |
| page-open --selftest | 原字节OS临时复制件，exit0，8/8 |
| native-dialog dialog-selftest | 原脚本/数据OS临时复制件，exit0，10/10，含完整wrapper正例 |
| 真实占用守卫 | 抽取未经修改的assertCdpPortFree和bindProbe，使用实际netstat/CIM；主审自有Node监听器被识别为其真实PID，抛明确拒绝后仍listening |
| 真实空闲守卫 | 只关闭主审自己创建的监听器后，原函数在该空闲端口正常返回 |
| 原危险输入回归 | Python脚本路径含标记、外部Edge带标记profile，真实函数均拒绝；记录器确认停止请求0，无真实OS停止动作 |
| 两入口拒绝实物 | PID/映像/occupied原因、完整拒绝observation与存活True逐项对应 |
| 正常默认开页实物 | target `http://127.0.0.1:8768/`，pre地址栏8767、post8768，实际URL命中；TCP非通过依据 |
| 构建/输入/工具及原收 | 27/42/8全部重哈希正确；3份原收实际相等 |
| 资产与语法 | root17 ASSET VERIFICATION PASS；node --check通过 |
| diff及范围 | 变更工具git diff --check通过；产品/矩阵/冻结方法diff为空 |

主审实际监听器测试端口由OS动态分配，未占用用户既有服务；仅关闭自己创建的监听器对象，没有按端口或名称停止占用者。新函数的生产调用与finally链经两轴和主审源码核对，不是脱离调用入口的孤立helper断言。

自测会向工具所在目录写JSON，因此只在专属OS临时根运行原字节复制件；临时根经绝对路径、父目录和专属前缀检查后移除。没有改写真实工具/原始证据。未运行旧RED的实际杀进程行为，未操作用户浏览器或机器设置。

本轮没有重新执行完整桌面E2E、矩阵12案、unit222或最终包安装；研发真实入口拒绝/正常腿为复读原件，未冒充主审新保存。E2E-2及已接受核心按未变产品和原证据继续有效。阶段6通过与最终包验收、用户现场验证保持分开。

### 固定17项与Todo

| 项 | 本轮结论 |
|---|---|
| 1 问题匹配/遗漏 | PASS：唯一主题按允许的最小方案关闭 |
| 2 代码/设计 | PASS：占用即拒绝，不再推断停止权限 |
| 3 文档当前性 | PASS：旧回收声明已更正，与实物一致 |
| 4 范围 | PASS：仅守卫及两调用点，无产品扩改 |
| 5 过度设计 | PASS：删除危险分支，没有新建复杂回收 |
| 6 旧反馈 | PASS：A19-01/B19-01闭环 |
| 7 正常功能 | PASS：空闲正常，占用安全拒绝 |
| 8 死码/效率 | 未发现新增问题 |
| 9 回归波及 | PASS：拒绝前无浏览器创建，finally不触碰占用者 |
| 10 敏感信息 | B限定变更文本扫描0命中，不作全面安全认证 |
| 11 桩/MOCK假绿 | 产品无新增；记录器和真实监听器证据分开 |
| 12 测试真实性 | PASS：两真实入口拒绝、存活和正常腿在案 |
| 13 决策依据 | PASS：修复方案直接来自上轮DoD |
| 14 前verdict闭环 | PASS：唯一Blocking关闭，旧范围保持 |
| 15 证据铁律 | 新执行、复读实物与未执行明确列示 |
| 16 问题格式 | 无新增Blocking |
| 17 总结逐项核对 | PASS：更正、源码、实物和本次验证相符 |

- [x] 固定HEAD、基线、状态及候选身份。
- [x] 新A/B独立只读审查，两轴均PASS。
- [x] 新执行69工具、8/10自测和真实监听器正反例。
- [x] 核对27产品、42输入、8工具、拒绝与正常腿实物。
- [x] 关闭唯一主题，保持已通过核心与用户现场边界。
- [x] 只新增本裁决，保留产品、原始证据、索引与状态。

状态保持external-review / waiting_external、ext_rounds=19；原字节SHA256保持 `7f3925f2da1750e81f97ed5a29b15b98d3a9157843904948cb9628bdcdc6d547`。Claude阶段6可消费本文件，按既定分流进入后续组包、合并和交付；不得把尚未执行的最终包检查或现场项补为PASS。

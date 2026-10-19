# 独立外部审查 — Round 1

## Verdict

不通过

固定审查对象：`bfb0c8e471820ae493cd3694ea6bed5d5ac06c37...d61fa743963b06d8cb9987fbf7fec0d754ffc3a2`，分支`screen-capture-recv`。本次实际范围为35提交、157文件、+22,801/-9；原交付包中的34提交/149文件是较早快照，不能当成本次固定范围。

规格轴A：不通过，4项Blocking；标准轴B：不通过，4项Blocking。两轴独立报告，原顺序分别保留，不跨轴排序或合并报告。其中3项重叠，是独立复核的高信号；主审另实证2项，共7个独立Blocking主题。两轴均未通过，不能推进阶段7合并或以本地验收完成名义交付。

本轮只裁决、不修复；没有修改生产代码或`pipeline-state.json`。请由Claude阶段6消费本文件，携Blocking返回阶段5整改，再提交新版本进行下一轮独立审查。不能只更改证据文字、技术债关闭点或状态以消除Blocking。

## Blocking issues

### 规格轴 A — 不通过（独立报告，4项）

#### A-01 / P1：本地必测未完成，阶段5却登记completed/test_status=passed

- **位置**：`docs/dev-pipeline/pipeline-state.json:207`、`:215`、`:218`；`docs/tests/runs/20261018-teamexec-01/results.json`的E2E-3～20；`docs/dev-pipeline/tech-debt.md:18`；`web/desktop-recv/tests/browser/video-import.mjs:26`。
- **证据**：主审实际执行`python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261018-teamexec-01 --gate local`，退出1，逐项报告E2E-3～20共18条未执行。阶段5和内审Round6仍宣布“20 base tasks delivered/0 Blocking”。TD-12要求T4.1.b之前补跑，当前已越过该窗口并改为“用户辅助”。IAT-05虽使用真正的MediaRecorder/WebM编码，但输入来自canvas绘制静态样例图，直接调用内部模块；不等于原发送动画窗口真实抓屏、用户录像选择、系统保存及原文件/落盘外部SHA-256。其跨路径字节相同不能补齐这些验收。
- **依据**：`docs/requirements/requirements-spec.md:138`明确PNG/内存注入不能代替同机E2E；AC-001/003/004/010/014；`docs/tests/acceptance-tests.md:19`要求实施方完成实际选源、导入、系统保存，不让用户代做。阶段5判据是必要单元/集成/本地E2E全绿，而不只是代码存在。
- **期望**：由实施方完成所有适用本地旅程，补正常双输入×可压缩/难压缩样本各3轮、10轮混合生命周期及实际落盘双侧外部哈希；修复以下代码缺陷后复验。E2E-20的最终包部分仍留阶段8，用户真实云桌面E2E-21～26可以继续NOT_RUN，不要求提前代用户执行。补充本轮缺失的`stage5-dev-summary.md`和`autonomous-decisions.md`或可核验决策索引，逐项关联任务/提交/实际证据，再由Claude使状态与真实门禁一致。研发对未执行项有披露，这不等于其已满足完成条件。

#### A-02 / P1：Incomplete后按钮可点，协调器却永久拒绝新会话

- **位置**：`web/desktop-recv/src/session.js:7`、`:119`、`:171`、`:353`；`web/desktop-recv/src/ui.js:10`、`:45`。
- **证据**：规格轴、标准轴和主审均独立执行受控Node联动复现：Receiving后`finishStream({takeFinalSample:()=>null})`进入Incomplete；`deriveControls`返回`canStart=true/canImportVideo=true/canStop=false`；随后新requestId的`startLive`、`startVideo`均返回`{accepted:false,reason:'busy'}`。因为UI将Incomplete视为可重启，协调器的IDLE_STATES却不包含它，用户既不能重新导入，也不能用被禁用的Stop恢复，只能刷新。
- **依据**：AC-006/007/008，尤其`requirements-spec.md:159`“结束当前处理并可重新导入”；IF-007及E2E-15/16/17。
- **期望**：统一UI与协调器的可重启终态及清理收敛条件；Incomplete后两种入口均能创建全新会话，无旧进度/产物。补不足录像EOF→Incomplete→重新导入、源结束→重新实时接收的跨模块回归和真实点击验收，不能只测试两个helper各自的状态表。

#### A-03 / P1：Worker故障不结算初始化，帧等待也没有有效看门狗

- **位置**：`web/desktop-recv/src/decoder-client.js:16`、`:23`、`:40`、`:76`、`:81`；`src/session.js:226`；`src/app.js:54`；`src/frame-scheduler.js:75`；`docs/dev-pipeline/tech-debt.md:7`。
- **证据**：两轴及主审确认Worker初始化尚未ready时，`onerror/onmessageerror`只调用处理帧Map的`_failAll`，不拒绝`_onInitFailed`；`close()`也不结算initPromise。主审调用`onerror`后再close，初始化仍pending；联动审查中会话保持Preparing，Stop后Stopping且cleanupComplete=false。Worker脚本本身加载失败时，Worker内部init timer不可能提供兜底。另主审对已ready客户端设置`frameTimeoutMs=5`、不回帧结果，等待20ms仍pending；当前没有主线程帧timer，WASM卡住时Worker内timer同样不能可靠解救。这不是“仅未来现场”问题，录像功能当前就依赖submitAndWait。
- **依据**：IF-004/005/006、C-03/06/09及AC-006/007/008；TD-01已明确承认“看门狗未实现”，登记延期不能替代已冻结可靠性要求。
- **期望**：init、frame在error/messageerror/close/postMessage失败/主线程超时等所有出口恰好结算一次；即使初始化失败也能终止已创建Worker、关闭捕获，允许新会话。实现可在Worker失去响应时仍生效的主线程初始化/帧看门狗，释放单槽并进入可恢复终态；补脚本加载失败、初始化中Stop、无回复帧/死循环模拟的回归，再实际验证故障恢复。仅添加一个不被消费的timeout配置字段不算关闭。

#### A-04 / P1：验收门禁会把失败、mock替代和未执行现场判成PASS

- **位置**：`tools/desktop-recv/verify-evidence.py:89`、`:137`、`:145`、`:169`；`web/desktop-recv/src/evidence.js:92`、`:102`。
- **证据**：主审直接执行真实仓库`--gate field`，6条现场记录均NOT_RUN，却输出`GATE field: PASS (6 required cases)`、退出0。另仅在临时目录制作明确标为审查负例的记录，不改原记录：20条必需local全部FAIL，真实Python CLI仍退出0并输出`GATE local: PASS (20 required cases)`；20条改为unit_integration/mock的PASS也被当本地通过。JS对必需E2E-3的`scope=unit_integration,result=FAIL`返回`{ok:true,violations:[]}`。两轴独立复现相同缺陷。Python只拒local的NOT_RUN，不要求PASS/规定scope；field连NOT_RUN也不拒。其性能检查还使用已废弃`caseType='performance'`，与JS的measurement规则不一致。
- **依据**：AC-004/005/010/011/012、C-12、T4.1.a和`acceptance-tests.md:23`；记录结构合法不代表功能通过。
- **期望**：两套门禁统一要求每个必需场景及适用子项真正PASS，校验预定scope/执行者/类型与真实证据，不允许mock冒充local、local冒充field，也不能把元数据中的相等hash直接当实际落盘校验。field未执行须非零；FAIL须失败；measurement无确认阈值不得性能PASS。补全部FAIL、NOT_RUN、错scope、缺文件/不等hash、无阈值measurement等负例，重跑当前field命令应失败。负向或生命周期用例按预期拒绝可PASS，但不能通过改caseType来洗白文件往返要求。

### 标准轴 B — 不通过（独立报告，4项）

以下保留标准轴自己的报告顺序；重叠项引用同一主题ID，避免把重复发现计成更多独立问题。

1. **B-S01 / P1，重叠A-04：证据门禁假绿。位置**为`verify-evidence.py:137`、`:169`及`evidence.js:92`。**独立证据**：标准轴实际运行当前field命令得到6条NOT_RUN仍PASS/exit0，并用只读内存输入确认FAIL/错scope/无阈值measurement被放行。**期望**同A-04：合法记录与通过门禁必须区分，补两端一致的拒绝回归。主审另用实际CLI临时负例重复确认。
2. **B-S02 / P1，重叠A-02：Incomplete恢复死路。位置**为`session.js:7`、`:119`与`ui.js:10`。**独立证据**：Incomplete快照允许开始/导入、禁止Stop，但新的startVideo返回busy。**期望**同A-02：跨模块可恢复终态一致，真实用户不用刷新即可重试。
3. **B-S03 / P1，重叠A-03：初始化故障永久pending。位置**为`decoder-client.js:16`、`:76`和`session.js:226`。**独立证据**：Worker onerror后Preparing、捕获未停止，点Stop后Stopping/cleanupComplete=false，源于initPromise未被拒绝。**期望**同A-03：初始化与帧的全部失败/关闭/超时路径收敛，不依赖坏Worker自己通知失败。
4. **B-S04 / P1：录像seek错误/结束没有完整的有界收敛和最终帧处理。**
   - **位置**：`web/desktop-recv/src/video-source.js:82`、`:118`、`:129`、`:199`；`src/app.js:107`、`:209`。
   - **证据**：标准轴与主审向`_seek(1)`派发媒体error，Promise仍pending；该函数只等seeked，没有error/timeout出口，loadedmetadata的15秒timer不覆盖首帧/后续seek。页面run().catch仅写日志，未关闭媒体/Worker或切换可恢复终态。主审另确认EOF策略：duration=0.1s时实际采样时刻仅`[0,0.06666666666666667]`即结束；从0.09s起的最后关键帧未采，app录像onEnded又固定传`takeFinalSample:()=>null`。后者是受控策略复现，不冒充真实V-LAST录像已执行。
   - **依据**：AC-008/014、IF-007、T3.1.b与E2E-16；真实媒体损坏须有限失败，最后关键有效帧必须有有限补采/排空机会。
   - **期望**：为首帧及后续seek提供错误/超时/Stop结算，映射已登记错误并清理后允许重选；实现有界最后可用帧补采与在途排空。补“metadata正常但首帧失败”“中途媒体错误”“最后关键帧有/无”的回归，并用真实V-SHORT/V-LAST对照录像核验。不能用同一静态图循环编码的成功录像代替最终关键帧场景。

### 主审独立实证补充 — 2项

#### C-01 / P1：含空格目录无法启动，启动器却返回成功

- **位置**：`web/desktop-recv/launch.ps1:74`、`:75`、`:87`。
- **证据**：主审在系统临时目录复制未改动的launch.ps1/server.py并提供其存在性前置文件，用中文/空格目录执行`pwsh -NoProfile -File <目录>/launch.ps1 -NoBrowser -Port <空闲端口>`；launcher退出0、打印server pid，但服务未监听。隔离同一`Start-Process -ArgumentList $arguments`模式捕获子进程错误：Python把`.../receiver with spaces/probe.py`截成`.../receiver`，报can't open file并退出2。ArgumentList数组被连接成未引用的命令行。此为启动器隔离复现，不是完整产品包验收。
- **依据**：T5.1.a、AC-003/010/013和UAT-L01/E2E-1明确要求干净中文/空格目录、任意cwd照手册正常启动。
- **期望**：正确保留每个参数边界，可靠确认子进程/服务启动失败并返回非零；用户能看到报因和恢复办法。以真实候选包从中文/空格目录、非仓库cwd启动，确认回环服务和双输入正常，不只验证`-Help`或进程创建成功。

#### C-02 / P2（Blocking）：取消选源后并行初始化的Worker未显式释放

- **位置**：`web/desktop-recv/src/session.js:226`、`:247`、`:252`、`:123`；`src/app.js:54`。
- **证据**：主审与标准轴分别用实际SessionCoordinator注入可观察client，先让并行初始化返回，再使捕获取消，重复两次；得到`state=Idle, clientClosed=[false,false]`。`_captureRejected`仅切Idle，不释放已初始化client；下一次_newSession直接覆盖_client引用。不能用未来GC假设证明WASM/Worker已释放。该复现证明缺失close/terminate调用，不声称测得实际浏览器内存曲线。
- **依据**：M02/M03/M06所有权、C-06、AC-006/007和UAT-L04；取消也必须清理本会话资源、干净重试。
- **期望**：取消/拒绝时使当前数据身份失效，关闭已ready客户端；未ready客户端晚返回时由旧清理令牌终止。清理收敛前不允许覆盖资源引用。补“Worker先ready再取消”“取消后Worker晚ready”“连续多次取消”断言close/terminate与资源计数归零，并完成真实选源取消/重新开始验证。

## Suggestions

无另列的非阻塞建议；本轮聚焦上述7个独立阻塞主题。既有TD登记不因本次列举而视为关闭，也不能替代Blocking的实现和实际复验。

## Reviewer

- 主审：`codex-gpt-6`（独立于实施方Claude）；审查日期：2026-10-19，Asia/Shanghai。
- Reviewer A：`/root/review_spec`，规格轴，独立上下文；Reviewer B：`/root/review_standards`，标准轴，独立上下文。两者均只读、未互看结论；主审在其报告后自行核对源代码和可执行反例。对重叠发现加权，但保留两轴报告，不以某一轴通过掩盖另一轴失败。
- 方法：当前dev-pipeline阶段6；code-review双轴；thermos角色/镜头；santa-method双过才放行；verification-before-completion；testing-protocol与code-review-excellence。当前仓库未找到AGENTS.md/CONTRIBUTING/CODING_STANDARDS/GLOSSARY/ADR文件，规范对照使用用户指令、冻结需求/契约及既有源码约定，不虚构风格违规。未因本轮审查启动产品修复/发布。
- 材料：固定diff/35提交；`round-1-package.md`与模板；requirements-spec/open-questions/decision-log；architecture/module-contract/schema/error/profile；24Task实施计划和roadmap；TDD/验收/E2E计划；review-round-1～6与tech-debt；本地运行results/iat-results/measurements/support-matrix/red-evidence；field-guide/field-receipt；实际生产源码及测试。`stage5-dev-summary.md`、`autonomous-decisions.md`不存在，不能假称已逐条核验这些缺失总结；见A-01。无上一轮外部verdict，内部Round1～6不等于前轮外审。

### 主审本轮实际执行与证据边界

| 检查 | 本轮实际结果 | 能证明及不能证明 |
|---|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | exit0；8套件，60 tests，0 fail/todo/skip | 单元结果真实通过；不补齐真实对话框/落盘E2E |
| `wsl.exe -- bash -lc 'ctest --test-dir /home/luctery/t12a-src/build-native --output-on-failure'` | exit0；9/9通过，6.57s | 重新运行既有WSL构建。当前仓库与该树的解压器、C导出及两份改动测试共4文件SHA-256相等；本轮未重新构建WASM，不声称新构建产物已验收 |
| `node tools/desktop-recv/verify-assets.mjs` | exit0；ASSET VERIFICATION PASS | 现有staging清单/字节及EOF证据校验通过；sourceRevision=a515922…，不将当前HEAD伪装二进制来源 |
| `python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261018-teamexec-01 --gate local` | exit1；18 violations，E2E-3～20逐项NOT_RUN | 不能宣称本地全功能通过 |
| 同上`--gate field` | 错误地exit0/PASS，6 required cases | 这是A-04的反例，不是现场验收通过；6项仍NOT_RUN |
| 临时目录实际Python CLI负例；JS纯函数负例 | 全FAIL/错误scope仍PASS；JS ok=true | 主审有意制作的负向探针，仅证明验收门禁漏洞；未改写研发原记录 |
| Node会话/Worker/视频针对性探针 | 重现Incomplete busy、init/error/close pending、帧超期pending、取消不close、seek error pending、EOF漏末帧 | 控制式代码复现，不当成真实屏幕/录像/磁盘E2E |
| 未改动启动器的中文/空格目录探针及同参数传递模式 | launcher exit0而无监听；子进程路径被截断exit2 | 实际Windows启动路径故障；无用户原文件被覆盖 |
| 固定差异内148份可解码文本的私钥/AWS/GitHub/OpenAI凭据模式扫描 | 0匹配；不输出秘密值 | 定向扫描范围内未发现这些模式，不声称通用安全认证或所有敏感信息不存在 |
| 当前真实浏览器抓屏、系统保存、V-LAST完整操作及云桌面现场 | NOT_RUN | 历史IAT日志仅作归档材料；未冒充本轮重新执行，不能覆盖A-01 |

### 固定审查清单复核

| 项 | 结论与落点 |
|---|---|
| ①需求/任务覆盖 | FAIL：A-01，T4.1.b及真实双输入保存证据未完成 |
| ②代码/设计对齐 | FAIL：A-02/A-03/A-04/B-S04/C-02 |
| ③设计/开发文档一致 | FAIL：阶段5完成与门禁冲突；摘要/决策索引缺失，见A-01 |
| ④范围最小/无无关破坏 | 变更集中新接收端及必要C解压适配；发送入口未重写。既有native回归9/9通过，但不据此放行新接收用户路径 |
| ⑤过度设计/兜底 | 无独立风格类Blocking；要求修复实际缺失的故障收敛，不要求另建原生兜底或重写发送端 |
| ⑥内部反馈关闭 | PARTIAL：摘要/错误包等已有整改；TD-01/TD-12硬缺口尚在，不能以重排关闭点替代修复 |
| ⑦正常功能 | FAIL：不完整重试、Worker故障、录像、启动路径均有实证 |
| ⑧桩/死代码/低效 | 未将docs规划TODO当业务桩；测试未覆盖的保护不能靠声明存在，见A-03/A-04 |
| ⑨回归波及 | C++共享改动已复跑既有native套件；新会话/输入交互仍FAIL，未作全平台保证 |
| ⑩敏感信息 | 已执行上述定向差异文本扫描0匹配，未扩大为未经验证的无泄露承诺 |
| ⑪业务mock/TODO假绿 | 没有把canvas IAT称原生选择器E2E；验收门禁确有假绿，A-04 |
| ⑫测试设计/真实E2E | FAIL：18条本地缺席，跨模块恢复与故障/末帧反例遗漏 |
| ⑬研发决策证据 | PARTIAL：review-round/tech-debt有依据链；自主决策汇总缺失，延期未获本轮用户豁免 |
| ⑭前轮Blocking | 无前轮外部verdict；内审的TD-12承诺窗口已过，本轮不伪称闭环 |
| ⑮执行证据 | 使用本轮命令和原始输出；历史/受控/mock/本地/现场范围分别标注 |
| ⑯Blocking三元组 | 7独立主题均有位置、事实证据、期望关闭条件 |
| ⑰开发总结逐项核验 | FAIL：缺总结索引；现有完成主张已与源码/命令核对，A-01～C-02列明不可放行项 |

本轮Todo：固定审查范围、独立双轴审查、必要检查复跑、反例核验、结论落盘和只读范围检查均已完成。产品并未因审查完成而通过。下一步由Claude阶段6读取本文件并回阶段5整改；本文件不改变`waiting_external`或其他流水线状态。

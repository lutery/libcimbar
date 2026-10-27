# 接收器体验 v2 — 单元与工具用例

规划共80条，全部NOT_RUN、executedBy=null、scope=unit_integration。不是执行结果；编号分段预留，空号不代表缺测。

机器源：[核心](cases/core.json)、[体验](cases/experience.json)、[工具](cases/tooling.json)。本文由[catalog.py](catalog.py)生成，修改JSON后以--write重建；正式测试必须补真正行为断言，不执行docs骨架取得产品结论。

## UX-UT-001 — 完整长度读取支持空报告、单比例与最多八流

- Target: `web/desktop-recv/worker/decoder-worker.js`；[规划骨架](unit-test-skeletons/worker.test.mjs)。
- Trace: T7, T8, T16；AC-016, AC-023；R-03, R-05。
- Given: VM真实加载当前classic Worker；fake Module提供合法核心导出，report字节分别为零长度、[]、[0]、[0.25]、[1.2]和八个比例；返回长度之后刻意留垃圾字节且不加NUL。
- When: 通过原frame入口提交data帧，按返回长度读取旁路报告。
- Then: 报告按完整文本分类；0长度或[]为empty，单值含大于等于1仍为single，八流为multiple。
- Diagnostics: 19005。

具体断言：

- 只读取返回的n字节，尾部垃圾不进入JSON；零长度不得读取旧缓冲。
- single.ratios精确等于原数值；不夹成99%或1。
- 八流diagnosticCode=19005，无虚构streamId。
- 原frameId/outcome=data/bytesDecoded=625保持；report不触发额外frame-result。

夹具/数据：web/desktop-recv/tests/helpers/worker-vm.mjs（现有VM，阶段5扩展report导出写入spy）；report表：n=0、[]、[0]、[0.25]、[1.2]、[0,0.1,0.2,0.3,0.4,0.5,0.6,1.2]；fountain=0n；scan=625

业务RED预期：阶段5先迁移到正式测试并补全实际断言；现有Worker尚未附uxObservation，断言合法报告分类应失败。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-002 — 可选report导出缺失不阻止初始化和数据交付

- Target: `web/desktop-recv/worker/decoder-worker.js`；[规划骨架](unit-test-skeletons/worker.test.mjs)。
- Trace: T7, T8, T16；AC-015, AC-016, AC-023；R-05。
- Given: fake Module保留所有原REQUIRED_EXPORTS但删除_cimbard_get_report。
- When: 完成init并提交一个scan=625、fountain=0n的数据帧。
- Then: init仍ready，原数据仍交付，报告为unavailable/19001。
- Diagnostics: 19001。

具体断言：

- 不得把report加入REQUIRED_EXPORTS或产生15002。
- 报告能力缺失与旧Worker旁路缺失19015分开。
- 一个输入帧仍只交付一次业务结果，不创建重试或新解码。

夹具/数据：现有makeFakeModule；仅删除可选_cimbard_get_report；保留资产摘要正例

业务RED预期：阶段5先迁移到正式测试并补全实际断言；尚无report降级字段，19001断言应失败而非以缺测试环境作为RED。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-003 — 报告缓冲长度边界拒绝截断和非法返回值

- Target: `web/desktop-recv/worker/decoder-worker.js`；[规划骨架](unit-test-skeletons/worker.test.mjs)。
- Trace: T7, T8, T16；AC-016, AC-023；R-05。
- Given: 固定报告缓冲1024字节；合法JSON[0.5]加空格补至1023字节；另有返回长度1024、1025、-1、1.5、NaN、Infinity和非安全整数。
- When: 每个独立VM用同一data帧入口读取报告。
- Then: 1023完整字节可解析；达到或超过1024的合法整数为19003；非法长度为19002，均不部分采信。
- Diagnostics: 19002, 19003。

具体断言：

- 1023字节正例为single且ratio=0.5。
- n=1024/1025不尝试解析缓冲前半段，不扩大缓冲。
- 负数/非整数/非有限/非安全整数归unavailable/19002。
- 全部负例原outcome=data且bytesDecoded=625；没有UX码冒充frame_error。

夹具/数据：固定1024B fake heap报告区域；1023B JSON空格正例；长度返回值表

业务RED预期：阶段5先迁移到正式测试并补全实际断言；当前Worker缺长度策略，合法边界及精确降级码断言应失败。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-004 — 非法JSON与UTF8报告整体拒绝且不采信部分比例

- Target: `web/desktop-recv/worker/decoder-worker.js`；[规划骨架](unit-test-skeletons/worker.test.mjs)。
- Trace: T7, T8, T16；AC-016, AC-023；R-05。
- Given: 报告输入为截断JSON、对象/null/字符串、负比例、字符串数字、1e309、九项数组及非法UTF8；另有混合合法和非法项数组。
- When: 在合法data帧读取报告，下一数据帧改为[0.7]。
- Then: 非法帧为unavailable/19004且ratios=[]；下一真实data帧可恢复single。
- Diagnostics: 19004。

具体断言：

- 非法UTF8必须按fatal解码拒绝，不以替代字符继续。
- [-0.1]、["0.2"]、[0.2,-0.1]、[1e309]和九项数组全部整体拒绝。
- 不得保留非法文本中可用前缀或前八项。
- 下一真实帧重试报告读取而非重启Worker；业务数据继续。

夹具/数据：report文本表：{"x":1}、null、"x"、[0.2、[-0.1]、["0.2"]、[0.2,-0.1]、[1e309]、九项数组；UTF8字节0xC3,0x28

业务RED预期：阶段5先迁移到正式测试并补全实际断言；当前无严格report解析，拒绝规则及下一帧恢复断言应失败。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-005 — 仅在fountain非负后且产物处理前采样报告

- Target: `web/desktop-recv/worker/decoder-worker.js`；[规划骨架](unit-test-skeletons/worker.test.mjs)。
- Trace: T7, T8, T16；AC-015, AC-016, AC-023；R-05, R-06。
- Given: Module spy记录scan、fountain、get_report、get_filesize、decompress_read顺序；scan可改写共享调试文本，产物读会模拟删除stream报告。
- When: 分别提交scan无数据、scan错误、fountain负值/错误ABI、fountain=0n和正artifact帧。
- Then: no_data/error不读取report；数据帧在fountain成功后读取，artifact帧在首次build_artifact调用前读取。
- Diagnostics: 无新增诊断。

具体断言：

- data顺序为scan→fountain→report；artifact顺序为scan→fountain→report→build相关导出。
- get_report在no_data、真正error和错误ABI分支调用次数为0，不能采信scan调试文本。
- artifact分支保留被删除前的report，不在decompress/recover之后补读。
- 原outcome和原错误码逐分支不变；不新增轮询。

夹具/数据：现有worker-vm.mjs；有顺序日志的fake导出；artifact构造仍走既有严格EOF正例

业务RED预期：阶段5先迁移到正式测试并补全实际断言；原Worker没有report调用，调用顺序和触发分支断言应失败。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-006 — 报告使用当前HEAP且单个1024字节缓冲复用释放

- Target: `web/desktop-recv/worker/decoder-worker.js`；[规划骨架](unit-test-skeletons/worker.test.mjs)。
- Trace: T7, T8, T16；AC-016, AC-023；R-05, R-08。
- Given: fake get_report在调用中替换Module.HEAPU8并写入新堆；malloc/free spy能区分报告与原img/fountain/dec/name分配。
- When: 连续提交多帧数据，模拟堆增长，再发送close两次。
- Then: 读取当前堆得到完整比例；同Worker报告分配最多一个1024字节缓冲，close不会重复释放。
- Diagnostics: 19002。

具体断言：

- 堆增长正例ratio取新堆[0.75]而非旧视图[0.25]。
- 报告字节在后续堆覆写后保持已解析观测值，不持有可变堆切片。
- 报告分配不随帧数增加；报告指针释放一次，原缓冲生命周期仍有效。
- 堆切片不足n字节归19002且原data结果继续。

夹具/数据：worker-vm.mjs扩展：可替换HEAPU8、按指针记录1024B分配与free、get_report内触发heap growth

业务RED预期：阶段5先迁移到正式测试并补全实际断言；现有无报告缓冲，当前堆读取/复用/释放断言应失败。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-007 — report异常局部降级且不掩盖真正解码或预算错误

- Target: `web/desktop-recv/worker/decoder-worker.js`；[规划骨架](unit-test-skeletons/worker.test.mjs)。
- Trace: T7, T8, T16；AC-016, AC-023, AC-024；R-05, R-06。
- Given: 报告分配返回0/抛错、get_report抛错、JSON坏格式；独立分支中原decompress返回-15或产物超预算。
- When: 通过原frame入口运行这些旁路失败及核心失败组合。
- Then: UX异常只降报告；真正核心失败仍按原业务错误结算，无半文件。
- Diagnostics: 19002, 19004。

具体断言：

- report malloc/get_report异常不冒泡为原frame_error，data仍625B。
- 报告失败不阻止严格EOF成功产物交付。
- 有效report也不能把decompress=-15的15007或超预算15008改成data/artifact。
- 每帧一个业务结果；没有自动重建、额外submit或UX错误污染v1 Error。

夹具/数据：VM故障注入，仅用于unit_integration；现有UT-022/023核心正负例作为独立回归参照

业务RED预期：阶段5先迁移到正式测试并补全实际断言；真实旁路异常隔离尚未实现，应由上述行为断言失败形成RED。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-008 — pending提交时间来自主线程原postMessage之前

- Target: `web/desktop-recv/src/decoder-client.js`；[规划骨架](unit-test-skeletons/client.test.mjs)。
- Trace: T7, T8, T10；AC-018, AC-021, AC-023；R-07。
- Given: DecoderClient注入owner=(s1,1)和nowMs；时钟初始100ms，fakeWorker.postMessage内推进至200ms并读取pending元数据。
- When: 按原submitFrame提交一帧，然后在UI等到800ms才读取当前pending元数据。
- Then: submittedAtMs始终100，getter反映真正pending而非首次显示时点。
- Diagnostics: 无新增诊断。

具体断言：

- postMessage发生前元数据已含sessionId=s1、sessionSeq=1、原frameId和submittedAtMs=100。
- 800ms查询不会把submittedAtMs改成800；不得使用Worker绝对时间。
- 元数据不进入postMessage payload、原stats或公开v1；原transfer仍只有像素buffer。
- 查询不提交新帧、不新增timer或pending项。

夹具/数据：现有client.test.mjs fakeWorker；阶段5注入可手动推进主线程单调时钟；24B像素仅作原传输负载

业务RED预期：阶段5先迁移到正式测试并补全实际断言；当前pending没有owner/时点只读接口，实际post前时间断言应失败。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-009 — 关联结果清理pending元数据且迟到或错误frameId不串入

- Target: `web/desktop-recv/src/decoder-client.js`；[规划骨架](unit-test-skeletons/client.test.mjs)。
- Trace: T7, T8, T10；AC-018, AC-021, AC-023；R-01, R-07。
- Given: 已init的Client有一个真实pending帧，getter返回该帧owner和提交时点。
- When: 先发错误frameId，再发匹配结果，然后重发旧frame-result。
- Then: 错误id不清当前pending；匹配结果只结算一次且getter即为null，旧回应不复活元数据。
- Diagnostics: 无新增诊断。

具体断言：

- 匹配frame-result前仍可读原提交时点；匹配后没有假inFlight。
- getter清空不依赖下一次UI刷新或scheduler Promise后续微任务。
- 原result字段及可选uxObservation原样解析，额外的迟到结果不重结算。
- 只读元数据返回值被外部尝试改写时不能改变Client保存的owner/时点。

夹具/数据：fakeWorker.emit和settlement spy；原客户端onmessage真实入口

业务RED预期：阶段5先迁移到正式测试并补全实际断言；现有无提交元数据getter，清理/只读断言应失败。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-010 — 所有失败出口同步清除UX pending并保留原收敛码

- Target: `web/desktop-recv/src/decoder-client.js`；[规划骨架](unit-test-skeletons/client.test.mjs)。
- Trace: T7, T8, T10；AC-018, AC-021, AC-023；R-01, R-07, R-08。
- Given: 每个独立测试有一个pending帧；使用原失败路径postMessage抛错、frame watchdog、worker error、messageerror和close。
- When: 触发一种失败后再送late frame-result或再次close。
- Then: pending元数据为空，原promise/失败hook仍只结算一次且保持原业务码。
- Diagnostics: 无新增诊断。

具体断言：

- postMessage/error/messageerror/close保持15010；frame watchdog保持14003。
- 每种出口都清真实pending和它的时点；晚到结果不会显示处理旧帧。
- 原Worker释放、看门狗清理与onFailure一次语义保留。
- 本用例不要求Client新增拒绝并行策略；single-flight由现有Scheduler另行回归。

夹具/数据：现有UT-056..061/087模式；使用可控timer或确定失败事件，不用真实30秒等待

业务RED预期：阶段5先迁移到正式测试并补全实际断言；待加元数据的失败清理断言会在当前实现失败，不能把任意超时当UX RED。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-011 — 观测查询不会新增通道消息、轮询或队列

- Target: `web/desktop-recv/src/decoder-client.js`；[规划骨架](unit-test-skeletons/client.test.mjs)。
- Trace: T7, T8, T10；AC-018, AC-021, AC-023；R-07, R-11。
- Given: 原Client正常init和单帧提交，记录posted消息、pending数、timer创建/释放及promise结算次数。
- When: 在不产生新frame的前提下多次查询pending与提交时点，期间推进显示时钟。
- Then: 查询无副作用，原结果处理和单在途调度不变。
- Diagnostics: 无新增诊断。

具体断言：

- 反复查询前后posted仍仅init+原frame，pending数不变。
- 没有UX类型postMessage或report polling；没有额外看门狗。
- owner/真实提交时点不因查询修改；完成后所有查询为null。
- 原提交像素transfer/ready/close仍符合现有测试，不以该测试替代真实浏览器。

夹具/数据：Client fakeWorker + timer spy；Scheduler单在途已有测试在正式全量套件执行

业务RED预期：阶段5先迁移到正式测试并补全实际断言；当前缺只读观测入口，接口断言应先失败，后续GREEN还必须证明无额外消息。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-012 — Receiving才开始计时且创建Client时捕获正确owner

- Target: `web/desktop-recv/src/session.js`；[规划骨架](unit-test-skeletons/session.test.mjs)。
- Trace: T7, T8, T10；AC-015, AC-018, AC-021；R-02, R-07。
- Given: 分别创建live/video会话；手动控制picker/source与Client init完成；主线程时钟Preparing=100，最后依赖就绪=600。
- When: 按真实会话路径进入Receiving，并读取本次UX观测。
- Then: receivingAtMs=600，elapsed从600计；createClient收到新会话的id/seq。
- Diagnostics: 无新增诊断。

具体断言：

- Preparing等待不算接收耗时；初始化失败或选择取消未进入Receiving则elapsed=null。
- Client工厂接收的是创建时捕获的sessionId/sessionSeq，不从迟到回调推断当前owner。
- source/Client以两种相反顺序就绪都只begin一次。
- 原同步打开选择器、cleanup门和业务revision语义保留。

夹具/数据：现有session.test.mjs fakeStream/fakeClient及延迟promise；新增注入单调clock，仍使用原startLive/startVideo

业务RED预期：阶段5先迁移到正式测试并补全实际断言；现有Session未接UX begin或向Client工厂传owner，起点与owner断言应失败。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-013 — 旧Worker及坏旁路只降UX并保留每帧核心结果

- Target: `web/desktop-recv/src/session.js`；[规划骨架](unit-test-skeletons/session.test.mjs)。
- Trace: T7, T8, T16；AC-015, AC-016, AC-017, AC-021, AC-023；R-05。
- Given: 原frame-result依次携带无uxObservation、version=2、非法结构以及合法报告；核心结果分别为data/artifact/error。
- When: 从当前Client/Scheduler原关联结果路径进入Session消费函数。
- Then: 无旁路记19015，未知版19013，坏结构19008；data字节仍能计速，原产物/错误独立结算。
- Diagnostics: 19008, 19013, 19015。

具体断言：

- 旧Worker旁路缺失不冒称19001导出缺失；未知版不猜测字段。
- 主线程receivedAtMs取实际消费时钟，不复用Worker绝对时间。
- data/artifact使用原合法正bytesDecoded；no_data/error传入模型字节为0且report=not_sampled。
- 旁路拒绝不能吞掉真实artifact或原错误，也不能创建额外frame消费。

夹具/数据：session当前原result消费入口；fakeClient.deliver可选旁路数据表；真实WASM能力另由T16/T19 IAT验证

业务RED预期：阶段5先迁移到正式测试并补全实际断言；当前Session无旁路归一/接纳桥，精确兼容码和保留核心行为联合断言应失败。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-014 — 旧seq、重复帧及实时录像切换不污染新观测

- Target: `web/desktop-recv/src/session.js`；[规划骨架](unit-test-skeletons/session.test.mjs)。
- Trace: T7, T8, T10, T16, T22；AC-015, AC-017, AC-021, AC-024；R-01, R-02。
- Given: 会话A接收过数据后stop并收敛；按原cleanup门启动相反inputKind的B；A仍有可手动送出的旧响应。
- When: 分别送A迟到响应、B重复frameId以及B一个正常新响应。
- Then: B只有新的当前帧记一次；B起点/桶/进度/保存显示不继承A。
- Diagnostics: 19007。

具体断言：

- A结果不改变B的bytes、lastData、lastAdvance、revision、artifact或输入类型。
- B重复帧不加速率或抬revision；新帧计一次。
- 正常video submitAndWait单次返回只接纳一次；不声称现有录像onResult必然重复调用。
- 所有权过滤仍沿原Client/seq，不用UX owner替代原Worker对象关联。

夹具/数据：原Session fakeClient延迟交付，原FrameScheduler路径；live→video和video→live参数化

业务RED预期：阶段5先迁移到正式测试并补全实际断言；当前无UX状态隔离，新增观测字段/不污染断言应失败；不借RED重构正常调度。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-015 — 真实终点冻结用时而比例与EOF不能生成Ready

- Target: `web/desktop-recv/src/session.js`；[规划骨架](unit-test-skeletons/session.test.mjs)。
- Trace: T7, T8, T16, T20, T22；AC-016, AC-018, AC-019, AC-020, AC-021；R-02, R-06。
- Given: Receiving起点100ms；先送single=1.2而没有artifact；input ended进入Draining；分别准备真实artifact、Incomplete、用户stop、原fatal错误终点。
- When: 按原结果/结束路径在900ms终结，再推进至1500ms并清理/销毁。
- Then: Draining继续计时；只能真实业务终点finish，最终接收用时800ms且之后不增长。
- Diagnostics: 无新增诊断。

具体断言：

- 比例>=1不触发Ready/Saved或启用保存；单独EOF且无完整artifact仍Incomplete。
- 真实artifact分支的Ready及原错误/停止/Incomplete结算不被UX替代。
- 冻结后stop/dispose不改endedAt/elapsed，不保留接收tick。
- 准备阶段失败保持elapsed=null；原保存耗时不会计入接收时长。

夹具/数据：原Session结果和finishStream/stop入口；时钟100→900→1500；每种终点使用独立会话

业务RED预期：阶段5先迁移到正式测试并补全实际断言；当前没有观测freeze；必须由冻结时点/无假Ready断言失败形成RED。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-016 — UX读写不扩充旧v1或伪造业务revision

- Target: `web/desktop-recv/src/session.js`；[规划骨架](unit-test-skeletons/session.test.mjs)。
- Trace: T7, T8, T10, T16, T34；AC-018, AC-021, AC-023, AC-024；R-05, R-10, R-11。
- Given: 相同原业务snapshot配上多次UX查询、report降级与速率窗口时间变化；已读取冻结receiver-v1 schema。
- When: 读取UX和toContractSnapshot，保持原state不变并推进主线程时钟。
- Then: UX有独立observationRevision，原v1 Snapshot/stats/Error字节与字段集合不变。
- Diagnostics: 19001, 19015。

具体断言：

- 仅时钟投影不能调用Session._emit({})，business revision/eventSeq与onSnapshot次数不增加。
- toContractSnapshot字段精确符合旧schema，不出现uxObservation、rate、progress、190xx。
- 原processed/completed等业务stats含义不因UX重复/拒绝改变。
- 原schema/error登记作为只读输入；不修改枚举来使测试绿灯。

夹具/数据：现有session.test.mjs assertConforms与toContractSnapshot；docs/design-catalog/contracts/receiver-v1.schema.json只读

业务RED预期：阶段5先迁移到正式测试并补全实际断言；旧v1回归可能已绿；新增UX独立投影/不调用_emit断言必须先因缺功能失败，再连同旧约束保持GREEN。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-017 — begin同owner幂等并在新seq完整清空

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/ux-telemetry.test.mjs)。
- Trace: T7, T8, T10, T16；AC-018, AC-021, AC-023；R-02。
- Given: 新ReceiverTelemetry，begin(s1,seq1,live,100)，已接数据和保存观测；另有相同begin、同seq冲突owner/kind、旧seq和新seq。
- When: 依次应用begin请求并比较每次完整观测快照。
- Then: 首次revision=1/applied=true；相同begin不清零；冲突拒绝，新seq才全量重置。
- Diagnostics: 19007, 19008, 19013。

具体断言：

- 同id/seq/kind重复begin为applied=false，receivingAt不移动且observationRevision不提升。
- 更旧seq返回19007；同seq冲突id/kind返回19008；未知version返回19013。
- 合法新seq按Session cleanup门调用后，12桶、rateEpoch、所有时间/比例/歧义/保存attempt/诊断清空。
- 拒绝请求不部分应用，不修改当前会话。

夹具/数据：schema BeginRequest正例；明确值s1/1/live/100；新s2/2/video/9000；非法版本2

业务RED预期：阶段5先迁移到正式测试并补全实际断言；新增ReceiverTelemetry尚不存在；迁移后需先落实幂等断言而不能只把模块缺失写作永久RED。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-018 — FrameInput字段与时钟校验先于任何UX应用

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/ux-telemetry.test.mjs)。
- Trace: T7, T8, T16；AC-015, AC-017, AC-018, AC-021, AC-023；R-01, R-05, R-08。
- Given: begin时间100；上次接受frameId=1于200ms；输入含非法frameId/owner、data字节0或非整数、no_data带正字节、未知字段/版本或无效时间。
- When: 对每个独立负例调用acceptFrame，随后送一个合法当前帧。
- Then: 负例以准确UX诊断拒绝且原快照不变，后续合法帧仍可接纳。
- Diagnostics: 19008, 19009, 19013。

具体断言：

- 非法结构/业务矛盾19008；版本非1为19013；receivedAt早于receivingAt/上次已接受结果或非有限时钟为19009。
- 不消耗lastAcceptedFrameId，不更新bytes/lastData/lastAdvance/observationRevision。
- no_data/error只允许0B及not_sampled；data/artifact必须正安全整数，不能使用RGBA大小。
- 负例拒绝是UX动作结果，不能更改核心frame outcome或业务错误。

夹具/数据：确定值begin100、前帧200；时间99/199/NaN/Infinity/-1；字节0/1.5/MAX_SAFE_INTEGER+1；未知字段autoRestart

业务RED预期：阶段5先迁移到正式测试并补全实际断言；正式测试应先因校验接口/拒绝语义缺失而RED，不能仅用schema验证代替运行时断言。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-019 — frameId、seq与冻结状态严格幂等

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/ux-telemetry.test.mjs)。
- Trace: T7, T8, T10, T16；AC-015, AC-017, AC-021；R-01。
- Given: 当前seq2已接受frameId=5的数据，保存完整观测；另有相同/更小id、旧seq1和finish后的新id。
- When: 逐一调用acceptFrame并读取观测。
- Then: 所有过期观测返回19007，当前事实一项也不变化。
- Diagnostics: 19007。

具体断言：

- frameId<=5不增加bytes、lastData、lastAdvance、任何桶或observationRevision。
- 旧seq即便frameId更大仍拒绝。
- finish/stopped冻结后即便是更大当前帧仍拒绝。
- 一个新的当前有效帧只增长一次revision；原业务结果仍独立处理。

夹具/数据：FrameInput数据625B、ratio0.25；重复id5/4、旧seq1/id100、冻结后id6

业务RED预期：阶段5先迁移到正式测试并补全实际断言；新增模型缺过期拒绝，正式运行需出现精确19007及不变性断言的行为RED。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-020 — 重复单流比例不伪造进展但仍记录真实数据字节

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/ux-telemetry.test.mjs)。
- Trace: T14, T15, T16；AC-016, AC-017, AC-018；R-03, R-04。
- Given: 同一owner在1000ms收到0.25、1250ms重复0.25、1500ms收到0.5，每个原数据帧625B。
- When: 按三个递增frameId接纳后读取观测和进度投影。
- Then: 首次建立基准，重复不推进lastAdvance，严格增大才推进；三个实际数据帧均可记速率。
- Diagnostics: 无新增诊断。

具体断言：

- 第一次lastAdvance=1000，第二次仍1000，第三次为1500。
- 百分比依次为0.25、0.25、0.5，不按帧数插值。
- 三个data字节累计1875B，包含冗余；不宣称新增1875B文件有效载荷。
- 重复报告与重复frameId是两种情况：后者由UX-UT-019不计数。

夹具/数据：合法报告[0.25]/[0.25]/[0.5]；frameId1/2/3；receivingAt=0

业务RED预期：阶段5先迁移到正式测试并补全实际断言；尚无报告推进/冗余语义，lastAdvance与字节独立断言应失败。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-021 — 多流报告锁歧义直到新seq不猜测流身份

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/ux-telemetry.test.mjs)。
- Trace: T14, T15, T16；AC-016, AC-021；R-03。
- Given: 先single0.2，后multiple[0.3,0.8]，再single0.9；同seq仍有近期data。
- When: 接纳并每次读取progress，再用新seq开始。
- Then: 多流后progress为ambiguous且ratio=null，后续single不解锁；新seq才清空歧义。
- Diagnostics: 19005。

具体断言：

- 不能选第一项、最大值、求和或按数组索引臆造streamId。
- 歧义码19005并按seq去重，data速率仍可计。
- 后续single0.9不恢复百分比。
- 新seq初值无继承锁，新的合法single可形成estimate。

夹具/数据：single0.2→[0.3,0.8]→single0.9；新seq single0.1

业务RED预期：阶段5先迁移到正式测试并补全实际断言；尚无ambiguity锁，正式断言会因错误恢复比例或缺模型而RED。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-022 — 有效单流比例回退锁歧义且不以最高值夹住

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/ux-telemetry.test.mjs)。
- Trace: T14, T15, T16；AC-016, AC-021；R-03。
- Given: 同seq三个合法single依次0.6、0.4、0.8，均有正data字节。
- When: 按时间顺序acceptFrame并readView。
- Then: 0.4触发19006和ambiguous，后续0.8仍不可展示比例。
- Diagnostics: 19006。

具体断言：

- 不能显示max历史0.6、当前0.4或后续0.8冒称当前文件进度。
- 同值不算回退；严格小于最近可信single才锁。
- 歧义不停止接收、不改变原outcome，速率仍工作。
- 新seq重置才能解除；临时无报告不能重置可信比较基线。

夹具/数据：single0.6→0.4→0.8；独立相等0.6→0.6对照

业务RED预期：阶段5先迁移到正式测试并补全实际断言；尚无回退锁；正式断言需在补逻辑前RED。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-023 — 临时空或缺报告隐藏比例但保留可信历史

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/ux-telemetry.test.mjs)。
- Trace: T7, T8, T14, T15, T16；AC-016, AC-017, AC-018；R-03, R-05。
- Given: 当前可信single0.6；随后报告empty/unavailable（19002/19004/19015），但每帧仍解出625B；之后分别恢复single0.7或0.5。
- When: 对两条独立分支接受报告并投影。
- Then: 临时不可用隐藏百分比而非展示旧0.6；恢复0.7可估计，恢复0.5仍依据历史判回退。
- Diagnostics: 19002, 19004, 19006, 19015。

具体断言：

- 不可用期间rate仍基于真实bytes，progress为unavailable且ratio=null。
- empty不清lastAdvance或最后可信0.6；不误报“没有新块”作为可判定结论。
- 恢复0.7推进；恢复0.5触发19006且锁歧义。
- 已有多流锁也不能被empty/unavailable清除。

夹具/数据：0.6→empty/unavailable→0.7与0.5两分支；各种报告码作参数表

业务RED预期：阶段5先迁移到正式测试并补全实际断言；当前缺隐藏与保留基线规则，应先在实际模型行为断言RED。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-024 — 理论比例达到一仍为不确定收集不触发完成

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/ux-telemetry.test.mjs)。
- Trace: T14, T15, T16；AC-016, AC-020；R-06。
- Given: Receiving且原context无artifact、canSave=false；合法单比例依次0、0.999、1、1.4。
- When: 接受帧并readView；另用真实业务artifact上下文及finish事件做正向对照。
- Then: 0<=p<1为estimate，p>=1为enough_data/ratio=null；只有真实artifact对应complete。
- Diagnostics: 无新增诊断。

具体断言：

- 1和1.4不显示100%、不硬钉99%、不自造Ready/Saved。
- 原controls逐位透传，不能因比例启用保存。
- 不得从进度调用finish或创建artifactId。
- 真实artifact后complete.ratio=1；模型正例不代替Session产物/保存IO证据。

夹具/数据：只读Receiving context四布尔；single0/0.999/1/1.4；当前artifactId=42的业务正例

业务RED预期：阶段5先迁移到正式测试并补全实际断言；当前无UX enough_data/estimate投影，正式比例边界断言应失败。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-025 — 十二桶精确边界归属和稳定窗口分母

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/ux-telemetry.test.mjs)。
- Trace: T14, T15, T16；AC-017, AC-023；R-04。
- Given: rateEpoch=0；data字节依次为t0:10B、t249.9:20B、t250:30B、t2999.9:40B、t3000:50B。
- When: 以递增frameId接纳；在2999.9接受后及3000接受后查询速率。
- Then: 前四帧和100B在2999.9均保留；3000时q=12保留桶1..12，桶0的30B淘汰，保留120B。
- Diagnostics: 无新增诊断。

具体断言：

- 独立数学预期：t2999.9的windowMs=2999.9、bytes/s=100000/2999.9。
- t3000的window起点=250、windowMs=2750、保留字节=30+40+50=120、bytes/s=480/11。
- t0和249.9同桶，250进入下一桶；2999.9为桶11，3000为桶12。
- 实现只保留12槽；expected常量/分数直接来自上述算例，禁止调用实现算expected。

夹具/数据：纯逻辑手动clock及固定字节表；浮点比较用明确绝对/相对容差1e-9

业务RED预期：阶段5先迁移到正式测试并补全实际断言；新窗口数学尚未实现，独立数字断言在正式测试中应先RED。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-026 — 一秒预热边界使用实际覆盖期而非固定三秒

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/ux-telemetry.test.mjs)。
- Trace: T14, T15, T16；AC-017, AC-018；R-04。
- Given: epoch=0，仅t250接受1024B，之后只前进查询时钟。
- When: 依次查询999.9、1000、2999.9、3000和3250ms。
- Then: 不足1000时warming/null；1000后按实际windowMs算率，3250淘汰样本为0。
- Diagnostics: 无新增诊断。

具体断言：

- t999.9：warming且数值null；t1000：window1000、1024B/s。
- t2999.9：window2999.9、1024000/2999.9 B/s。
- t3000：window2750、4096/11 B/s；不能固定除3000。
- t3250：active、0B/s；零速率不应重新进入warming。

夹具/数据：单个1024B@250ms数据；独立算例来自冻结实施计划配方C

业务RED预期：阶段5先迁移到正式测试并补全实际断言；未有预热/窗口逻辑，精确边界断言应先RED。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-027 — 停止数据后不超过三秒速率归零且无snapshot也刷新

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/ux-telemetry.test.mjs)。
- Trace: T14, T15, T16；AC-017, AC-018；R-04, R-10。
- Given: epoch0；独立分支最后一帧625B在249.9ms或250ms，之后没有任何onSnapshot和新data。
- When: 仅readView随当前主时钟推进到样本所在桶的淘汰边界。
- Then: 249.9样本在3000ms淘汰，250样本在3250ms淘汰；最多3000ms后为0。
- Diagnostics: 无新增诊断。

具体断言：

- 样本@249.9在2999.9仍可非零，3000为0；@250在3249.9仍可非零，3250为0。
- 不继续展示收到最后一帧时的高值；没有snapshot也按now投影。
- 速率归零不修改业务revision、停止接收或伪造文件完成。
- 窗口正数且phase=active，不把0展示成未知故障。

夹具/数据：手动clock两个独立样本；冻结业务context和observationRevision

业务RED预期：阶段5先迁移到正式测试并补全实际断言；正式断言应先暴露无独立时间投影或陈旧速率行为。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-028 — 只计真实解码字节且明确包含冗余

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/ux-telemetry.test.mjs)。
- Trace: T7, T8, T14, T15, T16；AC-015, AC-017, AC-023；R-04, R-05。
- Given: epoch0，两个不同frameId的data各625B但ratio均0.25；夹入no_data/error零字节；输入像素RGBA可远大于625B。
- When: 在1000ms查询rate。
- Then: data的1250B计入分子，no_data/error和像素大小不计；速率含冗余。
- Diagnostics: 无新增诊断。

具体断言：

- 确定预期window1000ms、1250B/s；includesRedundancy=true。
- same ratio并非相同frameId，两个真实解码结果都计字节。
- no_data/error不刷新lastData或lastAdvance，只更新结果时点。
- 不称文件有效吞吐或按压缩比反推原文件字节/ETA。

夹具/数据：data625B@100/@500；no_data0B@250；error0B@750；query1000；ratio始终0.25

业务RED预期：阶段5先迁移到正式测试并补全实际断言；当前缺有界数据速率，字节含义与数值联合断言应先RED。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-029 — 安全整数溢出只重置速率域并保留接收事实

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/ux-telemetry.test.mjs)。
- Trace: T14, T15, T16；AC-016, AC-017, AC-018, AC-023；R-08。
- Given: begin=0；布局A同桶：frameId=1于250ms接受MAX_SAFE_INTEGER字节，frameId=2仍于250ms接受1B和有效single0.5；布局B跨桶：frameId=1于0ms接受MAX_SAFE_INTEGER字节，frameId=2于250ms接受1B和有效single0.5。相同单调时点允许且frameId严格递增；两种独立布局都在250ms触发不安全累加。
- When: acceptFrame触发溢出后在1249.9及1250查询；再加入小额正常帧。
- Then: 丢弃本条速率样本，清12桶并rateEpoch=250重新预热；接收起点和data/进度事实保持。
- Diagnostics: 19010。

具体断言：

- 诊断19010；receivingAt仍0，lastData=250且合法single0.5仍可推进。
- 1249.9距新epoch不足1000为warming/null；1250为active且0B/s。
- elapsed在1250为1250，不因rate重置归零。
- 无Infinity/夹MAX_SAFE速率；原outcome继续，后续正常字节可计。

夹具/数据：布局A：begin=0，MAX_SAFE_INTEGER B@250ms/frameId1，1B@250ms/frameId2；两帧在桶1，同一主线程时点不倒退；第二帧触发桶内溢出。；布局B：begin=0，MAX_SAFE_INTEGER B@0ms/frameId1，1B@250ms/frameId2；分别在桶0和桶1；第二帧触发窗口总和溢出。；两布局均rateEpoch重置为250ms；查询1249.9ms为warming/null，1250ms为active/0B/s；后续正常小帧在这两个查询之后加入。极端字节属于对抗输入，不是实际文件容量承诺。

业务RED预期：阶段5先迁移到正式测试并补全实际断言；溢出只重采样语义尚不存在，独立epoch/elapsed断言应先RED。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-030 — 大时间跳跃与长序列保持固定有界状态

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/ux-telemetry.test.mjs)。
- Trace: T14, T15, T16；AC-017, AC-018, AC-023；R-04, R-08, R-10。
- Given: epoch0先有625B；之后主时钟直接到900000000ms；另一路长序列反复接纳有效数据和相同report unavailable/19015。
- When: 查询大跳跃后的rate并检查观测模型及重复诊断状态。
- Then: 旧桶自然失效为0；模型始终只用12槽，不按跳过桶数创建数组或逐桶循环补齐。
- Diagnostics: 19015。

具体断言：

- 大跳跃后active/0且windowMs=2750（该时刻q=3600000，窗口起点899997250）。
- 原receivingAt不重设，elapsed依据真实时钟而非tick次数。
- 长序列不保留逐帧历史；报告比例最多8个、诊断去重且总数<=15。
- 同码19015不每帧追加或增长日志；没有新后台解码/重启。

夹具/数据：不使用wall-clock性能上限作为唯一断言；用状态大小和受控循环/分配观测验证固定12槽；大跳跃固定时间900000000

业务RED预期：阶段5先迁移到正式测试并补全实际断言；当前无模型有界状态，新正式测试先暴露缺失或不受限实现。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-031 — 倒退和非有限主时钟不应用且恢复后自然淘汰

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/ux-telemetry.test.mjs)。
- Trace: T14, T15, T16；AC-017, AC-018, AC-021, AC-023；R-08。
- Given: receivingAt100，最后接受结果200；快照固定；提供receivedAt/view now为99、199、NaN、Infinity、负数。
- When: 分别尝试acceptFrame及readView，再将时钟恢复为5000。
- Then: 非法时间返回19009且不倒拨或夹值；恢复后按真实now投影旧桶淘汰。
- Diagnostics: 19009。

具体断言：

- 非法frame不会更新lastFrameId/bytes/revision；非法查询不改变观测。
- 不回退到Date.now、Worker绝对时间或累计tick次数。
- 恢复5000时elapsed=floor(5000-100)=4900，旧数据率自然0。
- 对不完整业务context和版本错误仍保留对应19008/19013，不一律报时钟错误。

夹具/数据：手动单调clock；每个负例独立模型以免顺序掩盖；合法恢复5000ms

业务RED预期：阶段5先迁移到正式测试并补全实际断言；正式运行先由精确时钟拒绝与恢复数字断言RED。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-032 — 相同观测revision随now投影且保持纯读取

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/ux-telemetry.test.mjs)。
- Trace: T7, T8, T10, T14, T15, T16；AC-017, AC-018, AC-021, AC-023；R-10, R-11。
- Given: 同一深冻结telemetry.snapshot及business context；begin100，最后data于250ms；context业务revision=7。
- When: 先readView(now1100)，再readView(now4100)，不发送事件或snapshot。
- Then: elapsed为1000和4000，窗口按now变化；两个revision均不伪造增长。
- Diagnostics: 无新增诊断。

具体断言：

- 深冻结输入不被修改，两个观测revision相同且businessRevision保持7。
- 纯readView不得调用Session._emit、原render、抓帧、选择器或save。
- announcementKey不包含数值；仅时长/速率变化不产生新语义播报身份。
- 相同snapshot/context/now重复调用得到等价结果。

夹具/数据：计划中的web/desktop-recv/src/ux-view.js；深冻结观测和只读context；调用spy只是unit_integration，不是UI/E2E证明

业务RED预期：阶段5先迁移到正式测试并补全实际断言；缺少纯投影接口时RED；旧业务revision不变本身不能作为新功能已实现的GREEN。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-033 — finish冻结终点且后续清理幂等不抹掉用时

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/ux-telemetry.test.mjs)。
- Trace: T7, T8, T10, T16, T22；AC-018, AC-020, AC-021, AC-023；R-01, R-02, R-06。
- Given: begin100，真实业务结束于1000；分别用artifact/incomplete/stopped/error/disposed合法reason，artifact正例传真实上层归属id42。
- When: finish同样结束两次，再在2000清理；另测未begin的Preparing清理和percentage非法reason。
- Then: 首次冻结elapsed900，重复不移动终点，rate=frozen/null；未begin仍无接收用时。
- Diagnostics: 19007, 19008。

具体断言：

- 重复相同finish为幂等，observationRevision/endedAt不因重复改变。
- artifact完成后stop/dispose只清理不抹elapsed；晚到frame返回19007。
- reason=percentage或artifact而id=null返回19008，不伪造产物。
- 本模型接受真实上层finish并不证明文件可用，Session与保存IO仍有独立测试。

夹具/数据：FinishRequest合法五reason参数表；begin100/finish1000/later2000；未begin Preparing独立模型

业务RED预期：阶段5先迁移到正式测试并补全实际断言；正式断言须先因冻结/幂等未实现而RED，不能把守卫失败算RED。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-034 — 1500/5000/8000ms状态边界与忙帧优先级

- Target: `web/desktop-recv/src/ux-view.js`；[规划骨架](unit-test-skeletons/ux-view.test.mjs)（T7 迁移时按 readView 归属落入 ux-view 套件，见 b2-t7-report 偏差 1；T14 对齐本文档）。
- Trace: T7, T8, T14, T15, T16；AC-015, AC-016, AC-018；R-07, R-08, R-10。
- Given: 通过计划readView投影三个独立模型：无data begin0；曾有data@1000；single0.25首次增长@1000且之后持续收到等比例data。busy context使用真实pending submittedAt=500。
- When: 分别查询4999.9/5000、5999.9/6000、8999.9/9000及忙帧年龄1499.9/1500ms。
- Then: 建议在精确阈值出现；普通inFlight不闪烁，真正慢帧processing优先；提示不驱动业务。
- Diagnostics: 无新增诊断。

具体断言：

- 无data时5000前仍waiting_data但无超时检查建议，5000开始检查建议；不能把有画面当已有data。
- lastData1000时5999.9未到no_new_data，6000达到；忙帧已处理1500ms时processing优先于无新数据推断。
- lastAdvance1000且data持续至8999/9000时，8999.9非no_progress，9000才no_progress；不可用/歧义报告不得谎称“无新块”。
- 真实pending@500在now1999.9不processing，2000才processing；没有pending时不得保留慢帧提示。
- 不调用stop/restart/picker、不改变原controls或原30秒看门狗。

夹具/数据：计划ux-view.js；手动clock；冻结Receiving context；持续等比例data时间1000/4000/7000/8999/9000；与Client真实pending测试UX-UT-008衔接

业务RED预期：阶段5先迁移到正式测试并补全实际断言；精确阈值投影尚未实现，正式条件/中文状态键断言应先RED。本规划骨架的守卫错误不是真实TDD RED。

## UX-UT-041 — 只读投影保持事实、controls与观测版本不变

- Target: `web/desktop-recv/src/ux-view.js`；[规划骨架](unit-test-skeletons/ux-view.test.mjs)。
- Trace: T7, T9, T10；AC-015, AC-018, AC-021, AC-023；R-10, R-11。
- Given: 使用契约合法的Receiving观测、完整Context与原deriveControls结果；冻结输入对象并记录模型快照、业务revision及副作用计数。
- When: 对同一输入与nowMs重复readView，再增加nowMs读取；包括Idle无begin与Receiving已经begin的子样本。
- Then: 同一输入确定性返回；只按时间变化显示用时与窗口，不修改观测或业务事实，也不创造源操作。
- Diagnostics: 无新增诊断。

具体断言：

- 深比较/冻结观测与Context，保证readView未改输入、observationRevision、businessRevision。
- 返回controls四布尔逐字段等于原合法controls，不能由比例、媒体位置或提示启用保存/输入。
- Idle未begin时elapsedMs=null；读取不调用_emit、captureFrame、offerFrame、VideoSource.run、releaseInputs、finishStream或保存。
- 重复相同nowMs结果相等；时间推进允许显示变化而非伪造revision。

夹具/数据：合法ViewRequest/Observation样例及原controls能力矩阵；纯对象deepFreeze/副作用计数夹具；可手动推进的主线程单调fakeClock

业务RED预期：移入真实套件并实现断言后，先确认缺少readView/有副作用的旧投影产生业务断言失败；规划守卫失败不计RED。

## UX-UT-042 — 拒绝旧owner和无效Context而不补造完成

- Target: `web/desktop-recv/src/ux-view.js`；[规划骨架](unit-test-skeletons/ux-view.test.mjs)。
- Trace: T7, T9, T16, T20；AC-016, AC-020, AC-021, AC-023；R-01, R-06, R-08。
- Given: 合法当前owner与控件基线，另备旧seq、version非1、无效/矛盾state与controls、倒退/非有限now、Ready/Saving/Saved/Retryable缺真实artifact或owner的请求。
- When: 逐一调用readView，保留同一原业务状态与副作用计数作为对照。
- Then: 只拒绝或降级UX投影，给出约定190xx；保留原业务按钮/文字，不从比例猜artifact或改业务状态。
- Diagnostics: 19007, 19008, 19009, 19013, 19014。

具体断言：

- 旧seq=19007；结构/Context矛盾=19008；倒退或非有限有效时钟检查=19009；不支持version=19013；需产物状态缺owner/artifact=19014。
- 每个负例仅改变一个因素，先通过形状校验后再执行身份/时序负例，避免错误原因混淆。
- 返回拒绝时不出现complete、伪造artifactId、Saved或新增可用控件；业务副作用计数仍为零。
- 真正原业务错误继续存在，不能被UX降级提示掩盖。

夹具/数据：当前owner合法Context及单因素负例表；原状态/controls冻结快照与业务副作用spy

业务RED预期：移植后断言旧owner/缺产物Context确实被拒绝；旧实现缺接口或错误接受会形成真实RED。

## UX-UT-043 — 慢帧提示在真实提交满1500ms才出现

- Target: `web/desktop-recv/src/ux-view.js`；[规划骨架](unit-test-skeletons/ux-view.test.mjs)。
- Trace: T14, T15, T16；AC-015, AC-018, AC-023；R-07。
- Given: 当前Receiving且已有近期data，原pending提供inFlightSinceMs=1000；主线程提交时点真实取自原postMessage入口。
- When: 在2499.9、2500、2500.1ms读取；另测inFlight=false、普通短帧及未提交/无合法提交时点的Context。
- Then: 小于1500ms不覆盖接收提示；达到1500ms才processing；普通单在途不会每帧闪烁。
- Diagnostics: 无新增诊断。

具体断言：

- 2499.9ms保持原receiving细分；2500和2500.1ms可显示processing；不依赖Worker绝对时钟或观测回调到达时点。
- 仅已确认的当前pending身份和合法submittedAt能支撑processing；无pending不能借旧时点显示忙帧。
- processing优先于同一时刻无data/无进展提示，但不延长或重置原frame看门狗。
- 只验证投影/原pending接线，不宣称此mock证明浏览器实际慢帧体验。

夹具/数据：当前pending元数据及1499.9/1500/1500.1ms参数表；fakeClock与真实主线程submit入口spy

业务RED预期：补断言后，用把每个inFlight都显示processing或使用接收回调时点的实现检验应失败，再修复。

## UX-UT-044 — 首次有效数据等待建议精确跨越5000ms

- Target: `web/desktop-recv/src/ux-view.js`；[规划骨架](unit-test-skeletons/ux-view.test.mjs)。
- Trace: T7, T14, T15；AC-015, AC-018, AC-022；R-10。
- Given: Receiving起点1000ms，只有图像帧/no_data而从未有效data，业务revision和观测revision均保持。
- When: 不派发新snapshot，在5999.9、6000、6000.1ms独立读取。
- Then: 始终诚实waiting_data；满5000ms才出现检查发送画面/Mode等建议，不声称成功或错误。
- Diagnostics: 无新增诊断。

具体断言：

- 5999.9ms无到阈值检查建议；6000/6000.1ms有行动建议且状态仍waiting_data。
- elapsedMs向下取整分别为4999/5000/5000，图片存在不增加数据识别速率分子。
- 等待不是新故障码，不会自动停止、重新打开屏幕选择器或重启。
- 无snapshot仍更新，建议含义由纯文本判断，不靠解析诊断英文日志。

夹具/数据：接收起点1000ms且无有效data的合法观测；fakeClock与前后边界请求

业务RED预期：移植后先证明无snapshot的旧UI不会产生所需到时建议，再由独立投影实现通过业务断言。

## UX-UT-045 — 上次有效data满5000ms转为无新数据且估计标陈旧

- Target: `web/desktop-recv/src/ux-view.js`；[规划骨架](unit-test-skeletons/ux-view.test.mjs)。
- Trace: T14, T15, T16；AC-016, AC-017, AC-018；R-05, R-10。
- Given: Receiving曾在2000ms识别有效data和可信单流比例，之后只有no_data；无长inFlight。
- When: 读取6999.9、7000、7000.1ms，并在新有效data到来后再次读取。
- Then: 满5000ms转no_new_data并标上次估计已陈旧；无数据后的速率按窗口归零；新的有效data解除陈旧。
- Diagnostics: 无新增诊断。

具体断言：

- 6999.9ms不进入no_new_data；7000ms开始no_new_data，progress.stale=true且仍标上次可信样本asOfMs。
- 窗口已清空时数值为0而非保留旧高值；不能把no_data图像字节算入速率。
- 新data后lastData更新、陈旧解除；比例无推进不会虚构增长。
- 未回复的长忙帧优先processing，不能仅从未回复推断无输入。

夹具/数据：lastData=2000ms、可信比例与no_data序列；fakeClock及新data恢复序列

业务RED预期：补真实断言后，保留旧速度或在4999.9ms过早显示无新数据的实现必须失败。

## UX-UT-046 — 无重建推进提示在8000ms边界且需要可信单流依据

- Target: `web/desktop-recv/src/ux-view.js`；[规划骨架](unit-test-skeletons/ux-view.test.mjs)。
- Trace: T14, T15, T16；AC-016, AC-017, AC-018；R-03, R-10。
- Given: lastAdvance=1000ms；一直有近期有效data但可信单流比例重复，最后data=8750ms；另备report unavailable/ambiguous/enough_data样本。
- When: 读取8999.9、9000、9000.1ms，随后输入一个更大可信单流比例；分别读取其余报告质量状态。
- Then: 仅可信单流比例满8000ms未推进时给no_progress；重复数据可有速率；推进后恢复receiving。
- Diagnostics: 无新增诊断。

具体断言：

- 8999.9ms仍receiving；9000/9000.1ms为no_progress，且speed可大于0而非强制归零。
- 同一比例不移动lastAdvance、不虚增比例；严格增大才解除无进展提示。
- unavailable/empty显示progress_unavailable，ambiguous显示progress_unknown，>=1显示collecting_more，均不谎称无新块。
- 无进展提示不触发重启、停止或重新打开任何选择器。

夹具/数据：高频有效data但比例固定的观测序列；可信进展/无报告/多流/理论足量参数矩阵

业务RED预期：补断言后，用tick累增比例或无依据一律显示no_progress的实现应产生RED。

## UX-UT-047 — 业务终态与收尾优先于接收细分且完成只认真实artifact

- Target: `web/desktop-recv/src/ux-view.js`；[规划骨架](unit-test-skeletons/ux-view.test.mjs)。
- Trace: T9, T15, T20, T22；AC-015, AC-016, AC-019, AC-020；R-06, R-07。
- Given: 同一份包含旧接收比例/速率的观测，构造合法Preparing、Draining、Reconstructing、Stopping、Incomplete、Ready、Saving、Saved、Retryable和Stopped Context。
- When: 依次投影，包括真实Ready artifact与比例>=1但Receiving无artifact两种对照。
- Then: 原业务阶段优先；Ready/Saved含义分开；只有真实产物可complete且controls仍由原策略决定。
- Diagnostics: 无新增诊断。

具体断言：

- Preparing/收尾/Stopping/终态/保存态不被processing、waiting_data或no_progress覆盖。
- 比例>=1但无artifact为enough_data且ratio=null，不显示文件100%或硬停99%，保存维持禁用。
- 真实artifact的Ready才complete=1且可保存；Saved只能来自原真实保存完成状态。
- Incomplete清楚说明未完成并允许原重试入口，不从媒体100%或旧比例冒称成功。

夹具/数据：合法状态/owner/artifact/controls联合矩阵；有artifact和无artifact的同报告比例对照

业务RED预期：移植后先断言只依比例判完成或用接收细分覆盖终态的实现失败。

## UX-UT-048 — 同revision独立时钟更新用时但不重复语义播报

- Target: `web/desktop-recv/src/ux-display.js`；[规划骨架](unit-test-skeletons/ux-display.test.mjs)。
- Trace: T7, T9, T10, T20；AC-018, AC-022, AC-023；R-10, R-11。
- Given: 原业务/观测revision保持不变，Receiving始于1000ms；显示器已绘制一次；paint与live区写入均有独立计数。
- When: 不触发snapshot，让独立时钟由2000走到3000；随后由真实artifact在3500ms结束，再进入选择路径和保存。
- Then: 接收用时随时钟更新；announcementKey不含数字且不重复播报；真实结束后用时固定不含选择/保存耗时。
- Diagnostics: 无新增诊断。

具体断言：

- 2000到3000时elapsedMs增加1000，businessRevision与observationRevision不变。
- 速率窗口可随now自然过期；同announcementKey不重写polite live区。
- 比例/速度/elapsed数值改变不改变announcementKey；真实状态/产物/保存attempt变化才形成语义身份。
- artifact结束后elapsed=2500且后续Saving/Saved保持；Preparing从未begin时elapsed=null。

夹具/数据：fakeClock与可统计文本/语义区域写入的DOM适配器；原业务事件驱动的artifact终结/保存序列

业务RED预期：补断言后，依赖shouldApplySnapshot相同revision拒刷或每tick重播的旧逻辑应失败。

## UX-UT-049 — snapshot事件与tick共享250ms节流而业务按钮即时更新

- Target: `web/desktop-recv/src/ux-display.js`；[规划骨架](unit-test-skeletons/ux-display.test.mjs)。
- Trace: T10, T26, T27；AC-018, AC-021, AC-023；R-11。
- Given: 建立两个互不共享计数器/timer/owner的独立子轨迹。A在0ms已写入遥测且全程保持Receiving，合法数值持续变化，100Hz snapshot通知与250ms时钟并存。B重置全部fixture后在0ms开始Receiving，业务按钮路径有独立spy。
- When: A在[0,1000]ms交错触发通知/定时器且不进入任何终结态，统计整个半开区间[0,1000)。B重置后在125ms用真实artifact进入Ready，再由显式保存进入Saving，单独观察即时业务更新和接收timer释放。
- Then: A的事件与tick共用遥测边界不超4Hz；B的原真实业务状态/按钮立即变更并释放终结接收timer。两条轨迹独立判定，tick均不驱动原app.render。
- Diagnostics: 无新增诊断。

具体断言：

- A中相邻遥测写入差>=250ms；半开区间[0,1000)最多4次，1000ms边界可有下一次。输入需确有后续可显示数值变化并观察到后续写入，避免全相同文本造成空测。
- A全程Receiving到1000ms，不混入Ready/Saving；事件与tick不会各写一次绕过同一lastTelemetryWriteAt，相同文本无重复DOM写入。
- B在125ms真实业务变化即时更新合法controls与Ready主文案，不等下个tick；随后的真实Saving同样即时。Ready终结释放接收timer，Saving不重建接收timer。
- B终结后的迟到tick不新增遥测写入；B不参与A的整秒频率计数，不能以提前终结后无timer证明A的4Hz限制。
- tick路径调用runFrameLoop、VideoSource.run、releaseInputs、finishStream、原render、抓帧/保存均为0；帧single-flight上限保持1。

夹具/数据：A/B每次完全重置的精确fakeClock、独立owner、fakeTimers与计数器；A持续Receiving且合法可显示数值变化的观测流；B真实artifact/保存业务事件序列；分离统计业务即时写与遥测写的paint/DOM spy

业务RED预期：补真实断言后，双通道各自4Hz或tick调用原整页render的实现必须失败。

## UX-UT-050 — 每seq唯一显示刷新器并拒绝释放后的迟到tick

- Target: `web/desktop-recv/src/ux-display.js`；[规划骨架](unit-test-skeletons/ux-display.test.mjs)。
- Trace: T9, T10, T20, T22；AC-018, AC-021, AC-023；R-01, R-02, R-10。
- Given: 当前seq1已拥有刷新器，捕获一个待执行回调；随后原业务清理后切换seq2，另备同seq旧viewAt和真实终结事件。
- When: 重复syncBusiness；切换owner；手工投递已取消的旧回调；再终结、dispose两次并投递迟到回调。
- Then: 每时刻至多一个当前owner刷新器；旧seq/旧viewAt不绘制；重复释放幂等；终结不留接收计时器。
- Diagnostics: 19007。

具体断言：

- 重复syncBusiness不创建第二timer；owner替换先clear旧timer，旧回调触发也不写seq2内容。
- 比lastViewAt早的视图不回滚；owner顺序与时点同时检查。
- Ready/Incomplete/Stopped/原fatal停止接收timer；Preparing/Saving仅事件驱动，不保留接收tick。
- dispose幂等，迟到回调不重建刷新器、不抓帧、不变更业务revision。

夹具/数据：保存callback引用并可手动投递的fakeTimer队列；seq1/seq2与终结状态矩阵、paint计数

业务RED预期：移植后用未清理timer或仅clear但不核对owner的实现确认迟到回调断言能失败。

## UX-UT-051 — 页面后台返回按真实单调时间重算而非补tick

- Target: `web/desktop-recv/src/ux-display.js`；[规划骨架](unit-test-skeletons/ux-display.test.mjs)。
- Trace: T10, T14, T16；AC-017, AC-018, AC-021, AC-023；R-08, R-10, R-11。
- Given: Receiving页面在2000ms隐藏，当前数据窗口有效；fakeClock在无任何业务snapshot/tick时前进至20000ms；另有非法倒退/NaN时钟子样本。
- When: 模拟visibility隐藏/恢复与pagehide，随后读取当前视图，最后尝试投递隐藏前回调。
- Then: 恢复按20000ms重新投影，用时包含经过时间、旧速率归零，且不补发18秒的tick；非法时钟只降级UX。
- Diagnostics: 19009。

具体断言：

- hidden期间允许暂停timer且不得主动提交帧；visible立即一次当前时间投影并至多恢复一个刷新器。
- 恢复elapsed按now-start计算，rate窗口过期归零、不显示旧高值；不按tick计数累加时间。
- 取消的隐藏前回调不重复绘制/播报；pagehide销毁后不恢复。
- 非法时钟按19009拒绝或降级当前UX，不改变原业务错误、看门狗或接收状态；这是假visibility事件测试而非真浏览器后台验收。

夹具/数据：fakeVisibilityEventTarget、fakeClock与可手工驱动timer；窗口有数据后长时间无回调的观测

业务RED预期：补断言后，用累计tick计时或后台返回保留旧速度的实现应失败；真实后台行为另留浏览器验收。

## UX-UT-052 — 遥测绘制异常只退化显示不重启或丢业务控件

- Target: `web/desktop-recv/src/ux-display.js`；[规划骨架](unit-test-skeletons/ux-display.test.mjs)。
- Trace: T10, T26, T27；AC-021, AC-022, AC-023；R-11。
- Given: 专用paint在一次遥测写入抛异常；原业务按钮/主状态文字存在；原接收任务与single-flight等待中。
- When: 触发tick及随后一个真实业务状态事件。
- Then: 记录19012并回退可读文字，原按钮/业务状态仍及时可用，不导致传输重启或原异常吞并。
- Diagnostics: 19012。

具体断言：

- 异常被UX边界捕获，不传播为原Worker frame_error或v1 Error.code。
- 保留原controls和状态文字；下一业务事件仍可更新，诊断不作为用户恢复指令。
- 没有新增capture/picker/save/restart/stop动作，也不并发额外帧。
- 记录/提示去重有界，不每tick无限堆积；正常修复后的显示不要求重接收。

夹具/数据：首paint抛错后可恢复的DOM适配器；业务按钮存在性/disabled与原解码调用计数spy

业务RED预期：移植后，将paint异常透传或触发重新接收的实现必须被真实断言拦下。

## UX-UT-053 — 中文主操作保留双入口且动态文本不按HTML解释

- Target: `web/desktop-recv/index.html`；[规划骨架](unit-test-skeletons/ui.test.mjs)。
- Trace: T26, T27；AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-022；工具/局部质量要求。
- Given: 加载真实候选HTML与DOM适配器；动态源名、文件名和错误文本含中文空格及<img onerror=...>、<script>等文本。
- When: 驱动合法视图和现有ui恢复/安全文件名路径，分别显示接收、媒体、可保存、取消和失败状态。
- Then: 两个入口保留原id和操作能力；主流程中文可理解；动态内容只作为文本，正常操作不依赖英文诊断日志。
- Diagnostics: 无新增诊断。

具体断言：

- btn-live/btn-video/btn-stop/btn-save/file-input/preview/artifact原id唯一保留；入口标签为实时抓屏/录像导入且互锁语义不变。
- 真实显示区ux-primary/secondary/next/elapsed/rate/progress/media/announcement存在；近期速率说明始终含协议与冗余含义。
- 源名/文件名/错误文字使用textContent等安全文本通道，不新增可执行元素、不设置事件属性；原safeSuggestedName继续去路径/控制符。
- 不要把190xx当普通用户的操作步骤；检查中文语义与可行动提示，不通过逐字快照强绑定所有文案。
- 此Node DOM测试不能证明实际字体、窄窗口无溢出或系统对话框行为，真实T31/T35仍待执行。

夹具/数据：真实候选index.html与受控DOM适配器；中文+空格/HTML样式动态文本和原ui合法controls矩阵

业务RED预期：移植后，旧英文界面、去掉任一输入按钮或innerHTML解释动态文本均须产生明确业务/结构断言失败。

## UX-UT-054 — 录像位置合法化与未知时长只影响媒体显示

- Target: `web/desktop-recv/src/ux-view.js`；[规划骨架](unit-test-skeletons/video.test.mjs)。
- Trace: T20, T21, T22；AC-019, AC-021；R-06。
- Given: 录像Context取实际VideoSource.snapshot位置；参数表含position=0/正数/大于duration、未知/0/负/非有限duration、负/NaN/Infinity position，以及live输入。
- When: 逐一合法化并readView，不主动seek或更改源速度。
- Then: 有效位置独立显示；未知总时长可显示已处理秒数但无fraction；坏位置只隐藏媒体栏；live不出现媒体位置。
- Diagnostics: 19011。

具体断言：

- 有限非负position保留；有效正duration时fraction=min(1,position/duration)，duration未知/非正/非有限归null且fraction=null。
- 负数/NaN/Infinity position使整个mediaPosition=null并19011，不影响数据速率、文件估计和原解码结果。
- live的mediaPosition=null；不把容器字节大小当原文件进度。
- 投影不能调用seek、playbackRate或增加提交；fakeVideo仅证明接线，真实呈现另验。

夹具/数据：实际snapshot形状的录像位置参数矩阵；video-source的可统计seek/playbackRate/submit假元件

业务RED预期：补断言后，未知duration除零、媒体坏值导致整个传输失败或将position当文件比例的实现必须失败。

## UX-UT-055 — 录像到末尾和比例足量不等于文件就绪

- Target: `web/desktop-recv/src/app.js`；[规划骨架](unit-test-skeletons/video.test.mjs)。
- Trace: T20, T21, T22；AC-016, AC-019, AC-020, AC-024；R-06。
- Given: 录像位置达到duration，最终在途帧尚未结算；分别提供最后no_data和最终真实artifact两种结算；观测报告可>=1。
- When: 触发原ended/EOF回调，保留原最后采样与drain屏障，读媒体/文件显示及保存控件。
- Then: 录像处理位置可100%，文件未完成仍不Ready；原最终样本得到artifact才Ready，否则沿原Incomplete收尾。
- Diagnostics: 无新增诊断。

具体断言：

- EOF通知不直接finish(reason=artifact)、不直接Saved或启用保存；最终在途结果必须先结算。
- 原takeFinalSample仍来自真实capture入口的接线，次数和EOF顺序保持，不能为进度删尾采样。
- 无artifact时progress不是complete，Incomplete说明录像读完但文件未完成；>=1显示collecting_more而非硬停99%。
- 有真实artifact才显示文件完成并冻结接收用时；本用例fake帧/假元件不替代真实录像与外部SHA验收。

夹具/数据：原video EOF/最后一帧/最后采样可手工释放的Promise夹具；no_data尾帧与真实形状artifact尾帧对照

业务RED预期：移植后，用media fraction=1或比例>=1直接完成的实现应产生RED，旧EOF屏障回归仍须保留。

## UX-UT-056 — 活动录像预览不被新布局或ticker隐藏

- Target: `web/desktop-recv/src/app.js`；[规划骨架](unit-test-skeletons/video.test.mjs)。
- Trace: T20, T21, T22, T26；AC-019, AC-022, AC-023, AC-024；R-11, R-12。
- Given: 真实候选HTML/CSS与App接线的DOM适配器；活动video处于Receiving、Draining、Reconstructing，诊断区域可折叠。
- When: 触发业务render、专用tick及诊断折叠，记录preview.hidden、祖先折叠/隐藏属性与CSS规则。
- Then: 活动预览保持可呈现的结构，不因新层级或tick折叠；原结束清理仍执行。
- Diagnostics: 无新增诊断。

具体断言：

- 活动三态preview.hidden=false，不加display:none、visibility:hidden或会隐藏video的details折叠祖先。
- 只允许诊断日志折叠，不以减少视觉噪声为由把真实video移入隐藏容器。
- tick不调用VideoSource.run、pause或改变背压；原终态释放/隐藏次数保持。
- DOM/CSS结构检查不能证明真实rVFC持续触发，必须保留T25/T31/T35真浏览器录像验收，不将mock PASS当rVFC证据。

夹具/数据：真实候选HTML/CSS文本与可记录属性变化的DOM适配器；活动三态及诊断折叠事件序列

业务RED预期：补断言后，用隐藏preview或隐藏祖先重做布局的实现应失败；真实浏览器持续呈现仍单列NOT_RUN。

## UX-UT-057 — 同步和异步16002取消都保留产物供真实点击重试

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/save.test.mjs)。
- Trace: T20, T21, T22；AC-020, AC-021；R-09。
- Given: 真实SaveController与UX桥接；picker第一次同步抛AbortError或异步拒绝AbortError，已有真实owner/artifact/Blob。
- When: 显式点击start，观察raw failed+16002/cancelled+16002；再由第二次显式点击使用同一Blob保存。
- Then: 两种原事件均显示cancelled，可重试且不重接收；只有第二次用户点击再开picker。
- Diagnostics: 无新增诊断。

具体断言：

- 同步failed+16002与异步cancelled+16002均归一save.phase=cancelled，原controller事件/错误码保持原语义。
- 产物Blob身份/字节/owner不变，canSave按原Retryable恢复；不能自动发起新picker或解码。
- 后续真实新attemptId来自新start，使用同一产物且成功后才Saved。
- 注入picker验证逻辑，不宣称证明系统取消对话框/焦点/落盘；真实OS与哈希留E2E。

夹具/数据：现有SaveController注入picker同步/异步AbortError夹具；不可变artifact Blob与可记录事件的UX桥接

业务RED预期：移植后，把同步failed+16002误显示写入失败或取消后丢Blob的实现须RED。

## UX-UT-058 — SAVE_BUSY仍在写入且pending始终未结算

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/save.test.mjs)。
- Trace: T20, T21, T22；AC-020, AC-021；R-09。
- Given: 真实SaveController的write Promise保持待定，同一真实owner/attempt已进入writing；注入pendingTimer可手动到期。
- When: 写入期间再次点击start产生writing+16008，再触发pending并读取视图，最后释放真实write/close。
- Then: busy不等同保存失败或新attempt；pending明确尚未结算，直到write和close都成功。
- Diagnostics: 无新增诊断。

具体断言：

- writing+16008保持phase=writing与原attemptId，不重新绑定owner、不发第二个picker或write。
- pending保持禁用重复保存、没有Saved/完成勾选、不自动取消或重试。
- 重复完全相同事件不提升observationRevision，业务Controller原事件仍正常传递。
- 最终成功事件才归saved；UI用词不从超时推断失败。

夹具/数据：可手动释放write/close的真实Controller夹具；fakeTimer触发pending和记录picker/write调用数的spies

业务RED预期：补断言后，将16008映射failed、pending映射saved或双击重发picker的实现必须失败。

## UX-UT-059 — write和close均成功后才显示Saved

- Target: `web/desktop-recv/src/save-controller.js`；[规划骨架](unit-test-skeletons/save.test.mjs)。
- Trace: T20, T21, T22；AC-020, AC-024；R-06, R-09。
- Given: 真实SaveController、UX bridge和会话状态；picker返回注入writable，write与close分别为可控Promise。
- When: 先释放write但保持close未决，记录状态；再释放close并等待原终结事件。
- Then: write成功只是仍在保存，close成功后原saved事件才驱动Saved；接收用时不包含保存耗时。
- Diagnostics: 无新增诊断。

具体断言：

- close未成功前UI不Saved、不显示文件已保存，即使write已成功或artifact progress=complete。
- close成功且原saved error=null后才save.phase=saved；保留真实owner与attempt身份。
- whenSettled仅真正终结后解除原停止清理阻塞；不为UX改变IO/停止规则。
- 该注入writable证明结算次序，真实文件存在和外部SHA必须由真实E2E单独证明。

夹具/数据：真实Controller与可控write/close双Promise、事件记录器；已真实Ready并冻结接收用时的合法Context

业务RED预期：移植后，write resolve即Saved或用pending时间到期冒充close成功的实现应RED。

## UX-UT-060 — 写入和关闭失败保持可重试且不再次接收

- Target: `web/desktop-recv/src/save-controller.js`；[规划骨架](unit-test-skeletons/save.test.mjs)。
- Trace: T20, T21, T22；AC-020, AC-021, AC-024；R-09。
- Given: 已有不可变artifact；注入write reject、close reject、权限/锁失败子样本，UX保存owner已正确绑定。
- When: 逐一执行真实Controller start并结算，随后用户再次点击用健康writable保存。
- Then: 各原失败码保留，UX显示failed可重试；原Blob和接收用时保持，无自动重接收。
- Diagnostics: 无新增诊断。

具体断言：

- 普通write失败原码16005，普通close失败16006；权限/锁按原16003/16004，UX不改旧Error枚举。
- 失败均不显示Saved，产物仍可用、原controls恢复重试；close失败即使write成功也失败。
- 重试只由真实新点击建立新attempt，同一artifact写入；不重新读源、不清原Blob或重算接收用时。
- 真实磁盘权限/文件占用场景另留E2E/IAT边界，不把注入异常当实际磁盘验收。

夹具/数据：write/close/权限/锁拒绝参数表和原Controller夹具；相同Blob身份与重试调用计数spies

业务RED预期：补断言后，将close失败显示成功、失败销毁产物或自动重启接收的实现必须失败。

## UX-UT-061 — 保存点击时捕获owner并同步绑定真实attempt

- Target: `web/desktop-recv/src/app.js`；[规划骨架](unit-test-skeletons/save.test.mjs)。
- Trace: T20, T21, T22；AC-020, AC-021；R-09。
- Given: 当前sessionId/seq/artifact构成真实owner；SaveController.start在返回前同步发selecting；提供第二次busy事件与可变当前snapshot。
- When: 调用真实点击处理，不在picker前await；记录点击owner，selecting时读取真实attemptId并绑定；然后使当前snapshot换owner再投递旧回调。
- Then: 同步selecting不会因尚未返回而漏绑定；每个实际attempt永远属于点击时owner，busy不重新绑定。
- Diagnostics: 无新增诊断。

具体断言：

- picker调用发生在同一显式点击调用栈中，前置无await；单元只证明调用顺序，真实transient activation仍留系统浏览器验收。
- 绑定attemptId取真实事件非空字符串，不用预测计数器、requestId或事后snapshot拼造身份。
- owner对象在start前捕获并固定；回调只查既有attempt绑定，当前snapshot变更不会改归属。
- busy writing+16008沿原绑定；settled后清理绑定，单在途Map不无限增长。

夹具/数据：真实Controller同步selecting事件与可变snapshot的App接线夹具；注入picker的同调用栈/attempt owner Map记录器

业务RED预期：移植后，start返回后才绑定、回调读取当前owner或预测attemptId的实现应产生RED。

## UX-UT-062 — 旧保存owner与attempt迟到回调不污染当前会话

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/save.test.mjs)。
- Trace: T20, T21, T22；AC-020, AC-021；R-01, R-02, R-09。
- Given: seq1/旧artifact的保存已终结或被停止；seq2已建立自己的owner和真实新attempt；保存事件记录原业务独立通道。
- When: 投递seq1 saved/failed/aborted+11005、旧attempt writing，以及当前终结attempt后的倒退writing和完全重复终结事件。
- Then: 旧身份拒绝19007，不把旧成功/失败写入新页面；终结attempt不倒退，重复完全相同事件幂等。
- Diagnostics: 19007。

具体断言：

- seq2的save/progress/elapsed/announcementKey、当前controls及observationRevision不被旧事件改变。
- 同owner也必须匹配当前真实attempt；旧attempt或冻结/终结后倒退事件不重新进入writing。
- 相同终结事件不提升revision或重复播报；aborted/11005不污染新会话。
- 仅拒UX观测；原SaveController结算与原业务saveEvent仍按既有规则执行，不吞原IO回调。

夹具/数据：双seq/双artifact/多个真实attempt的事件序列；终结后重复/倒退/旧回调记录器与原业务通道spy

业务RED预期：补断言后，只校验sessionId不校验seq/artifact/attempt或用当前owner冒认旧回调的实现必须失败。

## UX-UT-063 — 非法保存旁路事件只拒UX且不篡改原IO结算

- Target: `web/desktop-recv/src/ux-telemetry.js`；[规划骨架](unit-test-skeletons/save.test.mjs)。
- Trace: T20, T21, T22；AC-020, AC-021, AC-023；R-09。
- Given: 原真实保存流程正在运行；另备version非1、空attemptId、无artifact/owner、未知rawStatus、saved但errorCode非null等非法旁路事件。
- When: 逐个投递UX观测，同时让原Controller的write/close按原计划完成。
- Then: 非法事件被拒绝/降级，原保存照常结算；不接受伪造成功，不为UX故障重试磁盘。
- Diagnostics: 19008, 19013, 19014。

具体断言：

- 非法字段/状态=19008，version不支持=19013；业务Context缺必须归属事实=19014而非补造。
- saved且errorCode非null不能显示成功，空attempt不得冒用当前attempt或旧attempt。
- 原IO调用次数、write/close完成与原业务结算顺序与无UX负例对照一致。
- 诊断仅内部190xx且去重有界；不写旧error-codes.json、不作为v1 Error.code。

夹具/数据：单因素非法SaveRequest和缺owner Context参数表；健康Controller真实结算对照及副作用spy

业务RED预期：移植后，saved不校验error或UX异常阻断原close/业务结算的实现应失败。

## UX-UT-064 — 语义区与焦点恢复结构支持键盘而不逐数播报

- Target: `web/desktop-recv/index.html`；[规划骨架](unit-test-skeletons/ui.test.mjs)。
- Trace: T26, T27；AC-020, AC-022, AC-023；R-10, R-11。
- Given: 真实候选DOM含中文lang、保留操作按钮和专用语义区；DOM适配器可记录focus目标，原controls明确合法可执行操作。
- When: 更新数值多次、切换语义状态、模拟保存取消/失败/成功后焦点恢复及禁用控件变化。
- Then: 只有稳定主语义区polite播报，数字/log不live；恢复焦点指向当前可执行操作，保留键盘原生按钮结构。
- Diagnostics: 无新增诊断。

具体断言：

- lang=zh-CN；ux-announcement稳定aria-live=polite；elapsed/rate/progress/media和log不设会逐数重复播报的live。
- announcementKey相同不写live区；语义状态、artifact或真实attempt变更才允许一次更新。
- 保存取消/失败返回可执行保存/重试目标，成功后返回原规则允许的新接收操作；禁用/隐藏节点不作为focus目标。
- 原生button/label、可见焦点样式和最小44px规则具备结构依据；Node DOM不证明屏幕阅读器实际发声、窄窗可用性或系统弹窗焦点，必须保留T31/T35真实检查。

夹具/数据：真实候选HTML/CSS与focus记录DOM适配器；取消/失败/成功合法controls及announcementKey序列

业务RED预期：移植后，数字区逐次live、对同key重复写入或焦点落到禁用节点的实现必须被断言拦住；真实辅助技术仍NOT_RUN。

## UX-UT-081 — 缺少运行上下文先拒绝且零副作用

- Target: `tools/desktop-recv/e2e/run-context.mjs`；[规划骨架](unit-test-skeletons/run-context.test.mjs)。
- Trace: T1, T2, T3；AC-021, AC-024；R-12。
- Given: argv缺context、JSON缺必填字段或未知phase；write/spawn均有调用计数
- When: 解析并准备执行
- Then: 非0/明确错误，未写任何文件也未启动桌面或服务
- Diagnostics: 无新增诊断。

具体断言：

- 缺参、损坏JSON、未知字段/phase分别拒绝
- write/spawn计数为0
- 不回退到run-03

夹具/数据：FX-RUN-TEMP

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-082 — 中文空格目录完整传播到所有写入者

- Target: `tools/desktop-recv/e2e/run-context.mjs`；[规划骨架](unit-test-skeletons/run-context.test.mjs)。
- Trace: T1, T2, T3；AC-021, AC-024；R-12。
- Given: 新根名称含中文与空格，隔离sender/receiver/fixtures/plan；旧根字节快照
- When: 通过runner→recorder→proof/result/样本/诊断子调用写入临时实物
- Then: 所有输出位于声明根，旧根SHA不变
- Diagnostics: 无新增诊断。

具体断言：

- 逐项核对实际文件路径，不能只比较字符串参数
- recorder收到同一个context摘要
- 基线/候选/旧run无交叉覆写

夹具/数据：FX-RUN-TEMP；FX-OLD-MANIFEST

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-083 — 路径逃逸和历史输出根被拒绝

- Target: `tools/desktop-recv/e2e/run-context.mjs`；[规划骨架](unit-test-skeletons/run-context.test.mjs)。
- Trace: T1, T2, T3；AC-021, AC-024；R-12。
- Given: ../、绝对盘符、URI、解析后越界、历史run输出、指向外部根的可构造链接
- When: 解析输出路径和证明路径
- Then: 写入前拒绝，不跟随逃逸至历史/外部路径
- Diagnostics: 无新增诊断。

具体断言：

- 规范化后的绝对路径必须仍在允许根
- 不能仅凭startsWith同名前缀放行
- 系统无法创建链接时该子样本单列，不宣称实测链接路径

夹具/数据：FX-RUN-TEMP

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-084 — 基线候选staging严格分开且原包只读

- Target: `tools/desktop-recv/e2e/run-context.mjs`；[规划骨架](unit-test-skeletons/run-context.test.mjs)。
- Trace: T1, T2, T3, T6；AC-023, AC-024；R-12。
- Given: 两个独立staging，旧v1包只读清单；另有相同/相互包含根的负例
- When: 构建/复制和上下文校验
- Then: 只命中各自根，相同或重叠根拒绝
- Diagnostics: 无新增诊断。

具体断言：

- -StagingRoot实际生效
- 不因旧固定staging默写共享目录
- 原v1包和旧strict-EOF证据SHA保持

夹具/数据：FX-RUN-TEMP；FX-OLD-MANIFEST

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-085 — 续跑只接受同一运行身份且保留旧attempt原件

- Target: `tools/desktop-recv/e2e/run-context.mjs`；[规划骨架](unit-test-skeletons/run-context.test.mjs)。
- Trace: T1, T2, T3；AC-021, AC-024；R-12。
- Given: 已有context/runId/attempt/manifest与原proof；同身份和变更身份两个分支
- When: 请求恢复或重新执行
- Then: 仅一致身份可显式恢复，跨构建拒绝；原attempt原件保留
- Diagnostics: 无新增诊断。

具体断言：

- 缺显式恢复不能悄悄覆写
- 同case索引更新不删除先前attempt文件
- phase从slice冒充final拒绝

夹具/数据：FX-RUN-TEMP

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-086 — 产品摘要与工具提交分别绑定

- Target: `tools/desktop-recv/e2e/run-context.mjs`；[规划骨架](unit-test-skeletons/run-context.test.mjs)。
- Trace: T1, T2, T3；AC-023, AC-024；R-12。
- Given: 产品文件清单排序SHA、sourceRevision/harnessRevision；只改工具或实际改一字节产品
- When: 创建/复核manifest
- Then: 工具版本变化可另记；产品字节变化必须新manifest/attempt且旧证据不可复用
- Diagnostics: 无新增诊断。

具体断言：

- 重算实际文件而非信任manifest标签
- 少文件/额外必需运行依赖/改vendor均拒绝旧绑定
- 产品SHA相同的纯工具变动不伪造新产品结果

夹具/数据：FX-PRODUCT-MANIFEST

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-087 — 显式测试套件不能漏注册或以空测试绿灯

- Target: `tools/desktop-recv/run-unit.mjs`；[规划骨架](unit-test-skeletons/run-context.test.mjs)。
- Trace: T10；AC-023, AC-024；工具/局部质量要求。
- Given: 临时runner副本含12套预期与新UX三套；缺文件/0test/skip/todo/真实失败分支
- When: 执行--all和定向套件
- Then: 缺失/未完成/失败非0，完整真实通过才0
- Diagnostics: 无新增诊断。

具体断言：

- 每套确实执行而非glob碰巧发现
- Node退出0但todo/skip>0仍失败
- 生产runner不扫描docs规划骨架

夹具/数据：FX-RUNNER-TEMP

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-088 — 旧与新必测真实证据齐备的正例

- Target: `tools/desktop-recv/verify-ux-evidence.py`；[规划骨架](unit-test-skeletons/ux-evidence-selftest.py)。
- Trace: T1, T2, T3, T36；AC-024；R-12。
- Given: 临时完整旧local记录+UX全部必测、真实原收小文件与断言证明；phase=final
- When: 实际调用汇总CLI
- Then: 旧门禁及新UX都通过，整体local退出0
- Diagnostics: 无新增诊断。

具体断言：

- CLI真实读盘和重算，不stub最终校验返回值
- 完整正例防止一个永远拒绝的坏校验器被误验通过
- 真实field记录只在field门禁按user正例通过

夹具/数据：FX-GATE-DISK

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-089 — 旧20项绿但漏任一UX必测仍失败

- Target: `tools/desktop-recv/verify-ux-evidence.py`；[规划骨架](unit-test-skeletons/ux-evidence-selftest.py)。
- Trace: T1, T2, T3, T36；AC-024；R-12。
- Given: 旧E2E-1..20均有有效PASS，新UX清单逐个删除一条
- When: 执行local总门禁
- Then: 非0且指出缺失具体ID
- Diagnostics: 无新增诊断。

具体断言：

- 逐删每个新必测ID
- 不因原verify-evidence只识别1..20而漏验
- 不能以空UX required列表规避

夹具/数据：FX-GATE-DISK；FX-FROZEN-PLAN

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-090 — 错构建错输入错运行绑定不可混用

- Target: `tools/desktop-recv/verify-ux-evidence.py`；[规划骨架](unit-test-skeletons/ux-evidence-selftest.py)。
- Trace: T1, T2, T3, T36；AC-021, AC-024；R-12。
- Given: 完整记录但runId/manifestSha/inputSha/attempt或源清单逐一错配
- When: 执行门禁
- Then: 非0，保留失败证据，不自动采用最后一份结果
- Diagnostics: 无新增诊断。

具体断言：

- 错误sourceRevision不能盖过实际产品SHA不一致
- 旧run记录引用新proof仍拒绝
- 改产品后只更新文本SHA而实际文件未重算仍拒绝

夹具/数据：FX-GATE-DISK；FX-PRODUCT-MANIFEST

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-091 — 元数据相等不替代实存原收文件

- Target: `tools/desktop-recv/verify-ux-evidence.py`；[规划骨架](unit-test-skeletons/ux-evidence-selftest.py)。
- Trace: T1, T2, T3, T36；AC-020, AC-024；R-12。
- Given: 原/收两文件不同但记录写相同SHA，缺文件、空proof和越根proof反例
- When: 磁盘复算并校验证明引用
- Then: 全部拒绝；仅实际相等字节的正例通过
- Diagnostics: 无新增诊断。

具体断言：

- file_roundtrip首两proofRef保持原/收约定
- 截图或日志不能替代文件
- 缺文件与摘要不等分别有明确失败原因

夹具/数据：FX-GATE-DISK

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-092 — scope执行者caseType不能升级或改名绕过

- Target: `tools/desktop-recv/verify-ux-evidence.py`；[规划骨架](unit-test-skeletons/ux-evidence-selftest.py)。
- Trace: T1, T2, T3, T36；AC-024；R-12。
- Given: mock/unit冒充local、executor冒充user、file_roundtrip改lifecycle、NOT_RUN填执行者/时点
- When: 按冻结计划对照记录
- Then: 非0；现场未执行状态继续NOT_RUN
- Diagnostics: 无新增诊断。

具体断言：

- 计划caseType优先而非记录自报
- IAT不能升级local_simulated
- 新UX门禁语义不修改原v1词汇

夹具/数据：FX-GATE-DISK；FX-FROZEN-PLAN

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-093 — 重复未规划和被覆盖attempt不能冒充完整性

- Target: `tools/desktop-recv/verify-ux-evidence.py`；[规划骨架](unit-test-skeletons/ux-evidence-selftest.py)。
- Trace: T1, T2, T3, T36；AC-021, AC-024；R-12。
- Given: 同ID重复、额外未规划ID、索引指不存在attempt、旧attempt原件被删
- When: 读取全部记录/索引/证明
- Then: 拒绝不一致，不随last-write-wins悄悄绿灯
- Diagnostics: 无新增诊断。

具体断言：

- 索引只指同构建有效attempt
- 失败attempt仍可定位
- 未知必需场景不能忽略

夹具/数据：FX-GATE-DISK

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-094 — 任一反馈断言缺证据或非PASS使该例失败

- Target: `tools/desktop-recv/verify-ux-evidence.py`；[规划骨架](unit-test-skeletons/ux-evidence-selftest.py)。
- Trace: T1, T2, T3, T36；AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-022, AC-024；R-12。
- Given: 场景总result=PASS但assertions空、observed空、proof缺失、任一FAIL/NOT_RUN
- When: 重核逐项断言
- Then: 非0，不能仅信整体布尔标签
- Diagnostics: 无新增诊断。

具体断言：

- expected/observed必须有可核对事实
- 同一运行时序必须能支持UI状态
- 截图存在但不能对应断言仍未证实

夹具/数据：FX-GATE-DISK

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-095 — 部分阶段及新UX方法不能替代最终或旧现场性能

- Target: `tools/desktop-recv/verify-ux-evidence.py`；[规划骨架](unit-test-skeletons/ux-evidence-selftest.py)。
- Trace: T1, T2, T3, T36；AC-023, AC-024；R-12。
- Given: slice/metrics/media结果、frozen UX方法、未确认legacyThresholdFile与旧E2E-26测量
- When: 请求final/field门禁
- Then: 部分阶段不能当final；新方法不能自动让旧现场性能通过
- Diagnostics: 无新增诊断。

具体断言：

- local结果不代field
- UX method.frozen=true不是产品测量结果
- legacy未实测/未确认保持原NOT_RUN/未评定

夹具/数据：FX-GATE-DISK；FX-PERF-METHOD

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-096 — 分位数和Ready差值按独立算例计算

- Target: `tools/desktop-recv/e2e/measure-ux.mjs`；[规划骨架](unit-test-skeletons/measure-ux.test.mjs)。
- Trace: T28；AC-023, AC-024；工具/局部质量要求。
- Given: 已排序1..100ms RTT、有效Ready起止和负/缺/混时钟字段
- When: 计算nearest-rank与各轮中位数
- Then: p50=50、p95=95、5轮[10,20,30,40,50]中位数30；缺失不估算
- Diagnostics: 无新增诊断。

具体断言：

- 每轮分位数再取中位数，不混池
- Ready两时点相减不含初始化/选择器/保存
- RTT不能叫纯WASM CPU时间

夹具/数据：FX-PERF-RAW

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-097 — 三个性能阈值等号通过而越界失败

- Target: `tools/desktop-recv/e2e/measure-ux.mjs`；[规划骨架](unit-test-skeletons/measure-ux.test.mjs)。
- Trace: T28；AC-023；工具/局部质量要求。
- Given: Bready=1000，Brtt50=10，Brtt95=20；固定method
- When: 比较C边界和超边界样本
- Then: ready=1350、p50=12、p95=25通过；分别加0.001ms失败
- Diagnostics: 无新增诊断。

具体断言：

- ready公式是1.10*B+250，不用max
- RTT p50/p95公式按max相对/绝对容差
- 阈值method摘要改变必须新版本/重新测

夹具/数据：FX-PERF-METHOD；FX-PERF-RAW

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-098 — 五对样本和匹配环境缺一不可判定

- Target: `tools/desktop-recv/e2e/measure-ux.mjs`；[规划骨架](unit-test-skeletons/measure-ux.test.mjs)。
- Trace: T28；AC-023, AC-024；工具/局部质量要求。
- Given: 4对或任一轮<30帧、不同WASM/input/media/browser/viewport/instrumentation，另有完整5对
- When: 配对与比较
- Then: 不完整NOT_RUN；完整正例按阈值判定
- Diagnostics: 无新增诊断。

具体断言：

- 预热轮不混入5对
- 每轮新页/Worker，原journey标记不串用
- 主判据来自同录像，不以实时采样替换

夹具/数据：FX-PERF-RAW

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-099 — 候选真实失败不能作为噪声剔除

- Target: `tools/desktop-recv/e2e/measure-ux.mjs`；[规划骨架](unit-test-skeletons/measure-ux.test.mjs)。
- Trace: T28；AC-023, AC-024；工具/局部质量要求。
- Given: 某有效候选轮未Ready/产物错误/单在途破坏，其他轮更快
- When: 汇总与替换策略
- Then: FAIL并保留失败轮，不能只挑正常快轮比较
- Diagnostics: 无新增诊断。

具体断言：

- 功能失败不是环境无效配对
- 单在途>1直接FAIL
- 缺原始样本而只有summary PASS拒绝

夹具/数据：FX-PERF-RAW

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-100 — 无效配对最多替换两对且原始数据不删除

- Target: `tools/desktop-recv/e2e/measure-ux.mjs`；[规划骨架](unit-test-skeletons/measure-ux.test.mjs)。
- Trace: T28；AC-023, AC-024；工具/局部质量要求。
- Given: 真正环境不匹配的无效对及0/1/2/3对替换场景
- When: 保存原件、标原因、重测整对
- Then: 最多2对且最终仍有5对有效才能比较，超过或不足NOT_RUN
- Diagnostics: 无新增诊断。

具体断言：

- 不只补一侧
- 原无效轮ID/原因/样本仍存在
- 事后改阈值/挑输入不被接受

夹具/数据：FX-PERF-RAW

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-101 — 只计遥测数字写入且保留原busy丢采样策略

- Target: `tools/desktop-recv/e2e/measure-ux.mjs`；[规划骨架](unit-test-skeletons/measure-ux.test.mjs)。
- Trace: T28；AC-023；R-11。
- Given: 数字区高频mutation、合法即时按钮/终态更新、原live busy丢采样
- When: 测量DOM间隔/实际pending与清理
- Then: 数字写间隔≥250ms、pending≤1；业务即时事件不误算，原合法drop可记录
- Diagnostics: 无新增诊断。

具体断言：

- 按一次paint提交统计频率，不把同paint多个DOM节点当多次刷新
- 同事件+tick不形成双倍频率
- 终结UX timer0，原业务回调不被为指标强改

夹具/数据：FX-DOM-CLOCK；FX-PERF-RAW

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

## UX-UT-102 — 实时观测与录像数值主判据分列

- Target: `tools/desktop-recv/e2e/measure-ux.mjs`；[规划骨架](unit-test-skeletons/measure-ux.test.mjs)。
- Trace: T28；AC-023, AC-024；R-11, R-12。
- Given: 录像5对完整主数据、实时5对各30秒活动段、某浏览器不支持longtask
- When: 汇总结果
- Then: 实时行为独立检查，未支持长任务为NOT_MEASURED有原因，不造0或传输SLA
- Diagnostics: 无新增诊断。

具体断言：

- 实时不能宣称逐帧相同
- 同原发送端/输入/窗口声明并实记
- advisory缺失不替代mandatory缺测

夹具/数据：FX-PERF-RAW

业务RED预期：阶段5先补真实行为断言；目标功能缺失或原错误行为使断言失败，骨架守卫/环境缺失不算业务RED。

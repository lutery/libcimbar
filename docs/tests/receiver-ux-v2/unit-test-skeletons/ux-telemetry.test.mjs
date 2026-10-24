import test from 'node:test';
throw new Error('PLANNING_ONLY: Stage 4.5 skeleton; migrate cases and implement assertions before genuine RED.');

// 本文件只是文档内的测试骨架，未导入产品，不注册到现有运行器。
// 顶层守卫和以下占位异常均不能算真实TDD RED，也不能算产品执行证据。
// 正式落点：web/desktop-recv/tests/unit/ux-telemetry.test.mjs

test("UX-UT-017 begin同owner幂等并在新seq完整清空", () => {
  // Given: 新ReceiverTelemetry，begin(s1,seq1,live,100)，已接数据和保存观测；另有相同begin、同seq冲突owner/kind、旧seq和新seq。
  // When: 依次应用begin请求并比较每次完整观测快照。
  // Then: 首次revision=1/applied=true；相同begin不清零；冲突拒绝，新seq才全量重置。
  // 断言: 同id/seq/kind重复begin为applied=false，receivingAt不移动且observationRevision不提升。
  // 断言: 更旧seq返回19007；同seq冲突id/kind返回19008；未知version返回19013。
  // 断言: 合法新seq按Session cleanup门调用后，12桶、rateEpoch、所有时间/比例/歧义/保存attempt/诊断清空。
  // 断言: 拒绝请求不部分应用，不修改当前会话。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-018 FrameInput字段与时钟校验先于任何UX应用", () => {
  // Given: begin时间100；上次接受frameId=1于200ms；输入含非法frameId/owner、data字节0或非整数、no_data带正字节、未知字段/版本或无效时间。
  // When: 对每个独立负例调用acceptFrame，随后送一个合法当前帧。
  // Then: 负例以准确UX诊断拒绝且原快照不变，后续合法帧仍可接纳。
  // 断言: 非法结构/业务矛盾19008；版本非1为19013；receivedAt早于receivingAt/上次已接受结果或非有限时钟为19009。
  // 断言: 不消耗lastAcceptedFrameId，不更新bytes/lastData/lastAdvance/observationRevision。
  // 断言: no_data/error只允许0B及not_sampled；data/artifact必须正安全整数，不能使用RGBA大小。
  // 断言: 负例拒绝是UX动作结果，不能更改核心frame outcome或业务错误。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-019 frameId、seq与冻结状态严格幂等", () => {
  // Given: 当前seq2已接受frameId=5的数据，保存完整观测；另有相同/更小id、旧seq1和finish后的新id。
  // When: 逐一调用acceptFrame并读取观测。
  // Then: 所有过期观测返回19007，当前事实一项也不变化。
  // 断言: frameId<=5不增加bytes、lastData、lastAdvance、任何桶或observationRevision。
  // 断言: 旧seq即便frameId更大仍拒绝。
  // 断言: finish/stopped冻结后即便是更大当前帧仍拒绝。
  // 断言: 一个新的当前有效帧只增长一次revision；原业务结果仍独立处理。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-020 重复单流比例不伪造进展但仍记录真实数据字节", () => {
  // Given: 同一owner在1000ms收到0.25、1250ms重复0.25、1500ms收到0.5，每个原数据帧625B。
  // When: 按三个递增frameId接纳后读取观测和进度投影。
  // Then: 首次建立基准，重复不推进lastAdvance，严格增大才推进；三个实际数据帧均可记速率。
  // 断言: 第一次lastAdvance=1000，第二次仍1000，第三次为1500。
  // 断言: 百分比依次为0.25、0.25、0.5，不按帧数插值。
  // 断言: 三个data字节累计1875B，包含冗余；不宣称新增1875B文件有效载荷。
  // 断言: 重复报告与重复frameId是两种情况：后者由UX-UT-019不计数。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-021 多流报告锁歧义直到新seq不猜测流身份", () => {
  // Given: 先single0.2，后multiple[0.3,0.8]，再single0.9；同seq仍有近期data。
  // When: 接纳并每次读取progress，再用新seq开始。
  // Then: 多流后progress为ambiguous且ratio=null，后续single不解锁；新seq才清空歧义。
  // 断言: 不能选第一项、最大值、求和或按数组索引臆造streamId。
  // 断言: 歧义码19005并按seq去重，data速率仍可计。
  // 断言: 后续single0.9不恢复百分比。
  // 断言: 新seq初值无继承锁，新的合法single可形成estimate。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-022 有效单流比例回退锁歧义且不以最高值夹住", () => {
  // Given: 同seq三个合法single依次0.6、0.4、0.8，均有正data字节。
  // When: 按时间顺序acceptFrame并readView。
  // Then: 0.4触发19006和ambiguous，后续0.8仍不可展示比例。
  // 断言: 不能显示max历史0.6、当前0.4或后续0.8冒称当前文件进度。
  // 断言: 同值不算回退；严格小于最近可信single才锁。
  // 断言: 歧义不停止接收、不改变原outcome，速率仍工作。
  // 断言: 新seq重置才能解除；临时无报告不能重置可信比较基线。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-023 临时空或缺报告隐藏比例但保留可信历史", () => {
  // Given: 当前可信single0.6；随后报告empty/unavailable（19002/19004/19015），但每帧仍解出625B；之后分别恢复single0.7或0.5。
  // When: 对两条独立分支接受报告并投影。
  // Then: 临时不可用隐藏百分比而非展示旧0.6；恢复0.7可估计，恢复0.5仍依据历史判回退。
  // 断言: 不可用期间rate仍基于真实bytes，progress为unavailable且ratio=null。
  // 断言: empty不清lastAdvance或最后可信0.6；不误报“没有新块”作为可判定结论。
  // 断言: 恢复0.7推进；恢复0.5触发19006且锁歧义。
  // 断言: 已有多流锁也不能被empty/unavailable清除。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-024 理论比例达到一仍为不确定收集不触发完成", () => {
  // Given: Receiving且原context无artifact、canSave=false；合法单比例依次0、0.999、1、1.4。
  // When: 接受帧并readView；另用真实业务artifact上下文及finish事件做正向对照。
  // Then: 0<=p<1为estimate，p>=1为enough_data/ratio=null；只有真实artifact对应complete。
  // 断言: 1和1.4不显示100%、不硬钉99%、不自造Ready/Saved。
  // 断言: 原controls逐位透传，不能因比例启用保存。
  // 断言: 不得从进度调用finish或创建artifactId。
  // 断言: 真实artifact后complete.ratio=1；模型正例不代替Session产物/保存IO证据。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-025 十二桶精确边界归属和稳定窗口分母", () => {
  // Given: rateEpoch=0；data字节依次为t0:10B、t249.9:20B、t250:30B、t2999.9:40B、t3000:50B。
  // When: 以递增frameId接纳；在2999.9接受后及3000接受后查询速率。
  // Then: 前四帧和100B在2999.9均保留；3000时q=12保留桶1..12，桶0的30B淘汰，保留120B。
  // 断言: 独立数学预期：t2999.9的windowMs=2999.9、bytes/s=100000/2999.9。
  // 断言: t3000的window起点=250、windowMs=2750、保留字节=30+40+50=120、bytes/s=480/11。
  // 断言: t0和249.9同桶，250进入下一桶；2999.9为桶11，3000为桶12。
  // 断言: 实现只保留12槽；expected常量/分数直接来自上述算例，禁止调用实现算expected。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-026 一秒预热边界使用实际覆盖期而非固定三秒", () => {
  // Given: epoch=0，仅t250接受1024B，之后只前进查询时钟。
  // When: 依次查询999.9、1000、2999.9、3000和3250ms。
  // Then: 不足1000时warming/null；1000后按实际windowMs算率，3250淘汰样本为0。
  // 断言: t999.9：warming且数值null；t1000：window1000、1024B/s。
  // 断言: t2999.9：window2999.9、1024000/2999.9 B/s。
  // 断言: t3000：window2750、4096/11 B/s；不能固定除3000。
  // 断言: t3250：active、0B/s；零速率不应重新进入warming。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-027 停止数据后不超过三秒速率归零且无snapshot也刷新", () => {
  // Given: epoch0；独立分支最后一帧625B在249.9ms或250ms，之后没有任何onSnapshot和新data。
  // When: 仅readView随当前主时钟推进到样本所在桶的淘汰边界。
  // Then: 249.9样本在3000ms淘汰，250样本在3250ms淘汰；最多3000ms后为0。
  // 断言: 样本@249.9在2999.9仍可非零，3000为0；@250在3249.9仍可非零，3250为0。
  // 断言: 不继续展示收到最后一帧时的高值；没有snapshot也按now投影。
  // 断言: 速率归零不修改业务revision、停止接收或伪造文件完成。
  // 断言: 窗口正数且phase=active，不把0展示成未知故障。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-028 只计真实解码字节且明确包含冗余", () => {
  // Given: epoch0，两个不同frameId的data各625B但ratio均0.25；夹入no_data/error零字节；输入像素RGBA可远大于625B。
  // When: 在1000ms查询rate。
  // Then: data的1250B计入分子，no_data/error和像素大小不计；速率含冗余。
  // 断言: 确定预期window1000ms、1250B/s；includesRedundancy=true。
  // 断言: same ratio并非相同frameId，两个真实解码结果都计字节。
  // 断言: no_data/error不刷新lastData或lastAdvance，只更新结果时点。
  // 断言: 不称文件有效吞吐或按压缩比反推原文件字节/ETA。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-029 安全整数溢出只重置速率域并保留接收事实", () => {
  // Given: begin=0；布局A同桶：frameId=1于250ms接受MAX_SAFE_INTEGER字节，frameId=2仍于250ms接受1B和有效single0.5；布局B跨桶：frameId=1于0ms接受MAX_SAFE_INTEGER字节，frameId=2于250ms接受1B和有效single0.5。相同单调时点允许且frameId严格递增；两种独立布局都在250ms触发不安全累加。
  // Fixtures: A为MAX_SAFE_INTEGER B@250ms/frameId1与1B@250ms/frameId2；B为MAX_SAFE_INTEGER B@0ms/frameId1与1B@250ms/frameId2；两布局均在第二帧后reset epoch=250，后续小帧在1249.9/1250ms查询后再加入。
  // When: acceptFrame触发溢出后在1249.9及1250查询；再加入小额正常帧。
  // Then: 丢弃本条速率样本，清12桶并rateEpoch=250重新预热；接收起点和data/进度事实保持。
  // 断言: 诊断19010；receivingAt仍0，lastData=250且合法single0.5仍可推进。
  // 断言: 1249.9距新epoch不足1000为warming/null；1250为active且0B/s。
  // 断言: elapsed在1250为1250，不因rate重置归零。
  // 断言: 无Infinity/夹MAX_SAFE速率；原outcome继续，后续正常字节可计。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-030 大时间跳跃与长序列保持固定有界状态", () => {
  // Given: epoch0先有625B；之后主时钟直接到900000000ms；另一路长序列反复接纳有效数据和相同report unavailable/19015。
  // When: 查询大跳跃后的rate并检查观测模型及重复诊断状态。
  // Then: 旧桶自然失效为0；模型始终只用12槽，不按跳过桶数创建数组或逐桶循环补齐。
  // 断言: 大跳跃后active/0且windowMs=2750（该时刻q=3600000，窗口起点899997250）。
  // 断言: 原receivingAt不重设，elapsed依据真实时钟而非tick次数。
  // 断言: 长序列不保留逐帧历史；报告比例最多8个、诊断去重且总数<=15。
  // 断言: 同码19015不每帧追加或增长日志；没有新后台解码/重启。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-031 倒退和非有限主时钟不应用且恢复后自然淘汰", () => {
  // Given: receivingAt100，最后接受结果200；快照固定；提供receivedAt/view now为99、199、NaN、Infinity、负数。
  // When: 分别尝试acceptFrame及readView，再将时钟恢复为5000。
  // Then: 非法时间返回19009且不倒拨或夹值；恢复后按真实now投影旧桶淘汰。
  // 断言: 非法frame不会更新lastFrameId/bytes/revision；非法查询不改变观测。
  // 断言: 不回退到Date.now、Worker绝对时间或累计tick次数。
  // 断言: 恢复5000时elapsed=floor(5000-100)=4900，旧数据率自然0。
  // 断言: 对不完整业务context和版本错误仍保留对应19008/19013，不一律报时钟错误。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-032 相同观测revision随now投影且保持纯读取", () => {
  // Given: 同一深冻结telemetry.snapshot及business context；begin100，最后data于250ms；context业务revision=7。
  // When: 先readView(now1100)，再readView(now4100)，不发送事件或snapshot。
  // Then: elapsed为1000和4000，窗口按now变化；两个revision均不伪造增长。
  // 断言: 深冻结输入不被修改，两个观测revision相同且businessRevision保持7。
  // 断言: 纯readView不得调用Session._emit、原render、抓帧、选择器或save。
  // 断言: announcementKey不包含数值；仅时长/速率变化不产生新语义播报身份。
  // 断言: 相同snapshot/context/now重复调用得到等价结果。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-033 finish冻结终点且后续清理幂等不抹掉用时", () => {
  // Given: begin100，真实业务结束于1000；分别用artifact/incomplete/stopped/error/disposed合法reason，artifact正例传真实上层归属id42。
  // When: finish同样结束两次，再在2000清理；另测未begin的Preparing清理和percentage非法reason。
  // Then: 首次冻结elapsed900，重复不移动终点，rate=frozen/null；未begin仍无接收用时。
  // 断言: 重复相同finish为幂等，observationRevision/endedAt不因重复改变。
  // 断言: artifact完成后stop/dispose只清理不抹elapsed；晚到frame返回19007。
  // 断言: reason=percentage或artifact而id=null返回19008，不伪造产物。
  // 断言: 本模型接受真实上层finish并不证明文件可用，Session与保存IO仍有独立测试。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-034 1500/5000/8000ms状态边界与忙帧优先级", () => {
  // Given: 通过计划readView投影三个独立模型：无data begin0；曾有data@1000；single0.25首次增长@1000且之后持续收到等比例data。busy context使用真实pending submittedAt=500。
  // When: 分别查询4999.9/5000、5999.9/6000、8999.9/9000及忙帧年龄1499.9/1500ms。
  // Then: 建议在精确阈值出现；普通inFlight不闪烁，真正慢帧processing优先；提示不驱动业务。
  // 断言: 无data时5000前仍waiting_data但无超时检查建议，5000开始检查建议；不能把有画面当已有data。
  // 断言: lastData1000时5999.9未到no_new_data，6000达到；忙帧已处理1500ms时processing优先于无新数据推断。
  // 断言: lastAdvance1000且data持续至8999/9000时，8999.9非no_progress，9000才no_progress；不可用/歧义报告不得谎称“无新块”。
  // 断言: 真实pending@500在now1999.9不processing，2000才processing；没有pending时不得保留慢帧提示。
  // 断言: 不调用stop/restart/picker、不改变原controls或原30秒看门狗。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});


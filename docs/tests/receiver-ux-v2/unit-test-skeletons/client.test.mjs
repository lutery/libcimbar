import test from 'node:test';
throw new Error('PLANNING_ONLY: Stage 4.5 skeleton; migrate cases and implement assertions before genuine RED.');

// 本文件只是文档内的测试骨架，未导入产品，不注册到现有运行器。
// 顶层守卫和以下占位异常均不能算真实TDD RED，也不能算产品执行证据。
// 正式落点：web/desktop-recv/tests/unit/client.test.mjs

test("UX-UT-008 pending提交时间来自主线程原postMessage之前", () => {
  // Given: DecoderClient注入owner=(s1,1)和nowMs；时钟初始100ms，fakeWorker.postMessage内推进至200ms并读取pending元数据。
  // When: 按原submitFrame提交一帧，然后在UI等到800ms才读取当前pending元数据。
  // Then: submittedAtMs始终100，getter反映真正pending而非首次显示时点。
  // 断言: postMessage发生前元数据已含sessionId=s1、sessionSeq=1、原frameId和submittedAtMs=100。
  // 断言: 800ms查询不会把submittedAtMs改成800；不得使用Worker绝对时间。
  // 断言: 元数据不进入postMessage payload、原stats或公开v1；原transfer仍只有像素buffer。
  // 断言: 查询不提交新帧、不新增timer或pending项。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-009 关联结果清理pending元数据且迟到或错误frameId不串入", () => {
  // Given: 已init的Client有一个真实pending帧，getter返回该帧owner和提交时点。
  // When: 先发错误frameId，再发匹配结果，然后重发旧frame-result。
  // Then: 错误id不清当前pending；匹配结果只结算一次且getter即为null，旧回应不复活元数据。
  // 断言: 匹配frame-result前仍可读原提交时点；匹配后没有假inFlight。
  // 断言: getter清空不依赖下一次UI刷新或scheduler Promise后续微任务。
  // 断言: 原result字段及可选uxObservation原样解析，额外的迟到结果不重结算。
  // 断言: 只读元数据返回值被外部尝试改写时不能改变Client保存的owner/时点。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-010 所有失败出口同步清除UX pending并保留原收敛码", () => {
  // Given: 每个独立测试有一个pending帧；使用原失败路径postMessage抛错、frame watchdog、worker error、messageerror和close。
  // When: 触发一种失败后再送late frame-result或再次close。
  // Then: pending元数据为空，原promise/失败hook仍只结算一次且保持原业务码。
  // 断言: postMessage/error/messageerror/close保持15010；frame watchdog保持14003。
  // 断言: 每种出口都清真实pending和它的时点；晚到结果不会显示处理旧帧。
  // 断言: 原Worker释放、看门狗清理与onFailure一次语义保留。
  // 断言: 本用例不要求Client新增拒绝并行策略；single-flight由现有Scheduler另行回归。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-011 观测查询不会新增通道消息、轮询或队列", () => {
  // Given: 原Client正常init和单帧提交，记录posted消息、pending数、timer创建/释放及promise结算次数。
  // When: 在不产生新frame的前提下多次查询pending与提交时点，期间推进显示时钟。
  // Then: 查询无副作用，原结果处理和单在途调度不变。
  // 断言: 反复查询前后posted仍仅init+原frame，pending数不变。
  // 断言: 没有UX类型postMessage或report polling；没有额外看门狗。
  // 断言: owner/真实提交时点不因查询修改；完成后所有查询为null。
  // 断言: 原提交像素transfer/ready/close仍符合现有测试，不以该测试替代真实浏览器。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});


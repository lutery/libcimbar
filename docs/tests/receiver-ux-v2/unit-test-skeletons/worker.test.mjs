import test from 'node:test';
throw new Error('PLANNING_ONLY: Stage 4.5 skeleton; migrate cases and implement assertions before genuine RED.');

// 本文件只是文档内的测试骨架，未导入产品，不注册到现有运行器。
// 顶层守卫和以下占位异常均不能算真实TDD RED，也不能算产品执行证据。
// 正式落点：web/desktop-recv/tests/unit/worker.test.mjs

test("UX-UT-001 完整长度读取支持空报告、单比例与最多八流", () => {
  // Given: VM真实加载当前classic Worker；fake Module提供合法核心导出，report字节分别为零长度、[]、[0]、[0.25]、[1.2]和八个比例；返回长度之后刻意留垃圾字节且不加NUL。
  // When: 通过原frame入口提交data帧，按返回长度读取旁路报告。
  // Then: 报告按完整文本分类；0长度或[]为empty，单值含大于等于1仍为single，八流为multiple。
  // 断言: 只读取返回的n字节，尾部垃圾不进入JSON；零长度不得读取旧缓冲。
  // 断言: single.ratios精确等于原数值；不夹成99%或1。
  // 断言: 八流diagnosticCode=19005，无虚构streamId。
  // 断言: 原frameId/outcome=data/bytesDecoded=625保持；report不触发额外frame-result。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-002 可选report导出缺失不阻止初始化和数据交付", () => {
  // Given: fake Module保留所有原REQUIRED_EXPORTS但删除_cimbard_get_report。
  // When: 完成init并提交一个scan=625、fountain=0n的数据帧。
  // Then: init仍ready，原数据仍交付，报告为unavailable/19001。
  // 断言: 不得把report加入REQUIRED_EXPORTS或产生15002。
  // 断言: 报告能力缺失与旧Worker旁路缺失19015分开。
  // 断言: 一个输入帧仍只交付一次业务结果，不创建重试或新解码。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-003 报告缓冲长度边界拒绝截断和非法返回值", () => {
  // Given: 固定报告缓冲1024字节；合法JSON[0.5]加空格补至1023字节；另有返回长度1024、1025、-1、1.5、NaN、Infinity和非安全整数。
  // When: 每个独立VM用同一data帧入口读取报告。
  // Then: 1023完整字节可解析；达到或超过1024的合法整数为19003；非法长度为19002，均不部分采信。
  // 断言: 1023字节正例为single且ratio=0.5。
  // 断言: n=1024/1025不尝试解析缓冲前半段，不扩大缓冲。
  // 断言: 负数/非整数/非有限/非安全整数归unavailable/19002。
  // 断言: 全部负例原outcome=data且bytesDecoded=625；没有UX码冒充frame_error。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-004 非法JSON与UTF8报告整体拒绝且不采信部分比例", () => {
  // Given: 报告输入为截断JSON、对象/null/字符串、负比例、字符串数字、1e309、九项数组及非法UTF8；另有混合合法和非法项数组。
  // When: 在合法data帧读取报告，下一数据帧改为[0.7]。
  // Then: 非法帧为unavailable/19004且ratios=[]；下一真实data帧可恢复single。
  // 断言: 非法UTF8必须按fatal解码拒绝，不以替代字符继续。
  // 断言: [-0.1]、["0.2"]、[0.2,-0.1]、[1e309]和九项数组全部整体拒绝。
  // 断言: 不得保留非法文本中可用前缀或前八项。
  // 断言: 下一真实帧重试报告读取而非重启Worker；业务数据继续。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-005 仅在fountain非负后且产物处理前采样报告", () => {
  // Given: Module spy记录scan、fountain、get_report、get_filesize、decompress_read顺序；scan可改写共享调试文本，产物读会模拟删除stream报告。
  // When: 分别提交scan无数据、scan错误、fountain负值/错误ABI、fountain=0n和正artifact帧。
  // Then: no_data/error不读取report；数据帧在fountain成功后读取，artifact帧在首次build_artifact调用前读取。
  // 断言: data顺序为scan→fountain→report；artifact顺序为scan→fountain→report→build相关导出。
  // 断言: get_report在no_data、真正error和错误ABI分支调用次数为0，不能采信scan调试文本。
  // 断言: artifact分支保留被删除前的report，不在decompress/recover之后补读。
  // 断言: 原outcome和原错误码逐分支不变；不新增轮询。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-006 报告使用当前HEAP且单个1024字节缓冲复用释放", () => {
  // Given: fake get_report在调用中替换Module.HEAPU8并写入新堆；malloc/free spy能区分报告与原img/fountain/dec/name分配。
  // When: 连续提交多帧数据，模拟堆增长，再发送close两次。
  // Then: 读取当前堆得到完整比例；同Worker报告分配最多一个1024字节缓冲，close不会重复释放。
  // 断言: 堆增长正例ratio取新堆[0.75]而非旧视图[0.25]。
  // 断言: 报告字节在后续堆覆写后保持已解析观测值，不持有可变堆切片。
  // 断言: 报告分配不随帧数增加；报告指针释放一次，原缓冲生命周期仍有效。
  // 断言: 堆切片不足n字节归19002且原data结果继续。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-007 report异常局部降级且不掩盖真正解码或预算错误", () => {
  // Given: 报告分配返回0/抛错、get_report抛错、JSON坏格式；独立分支中原decompress返回-15或产物超预算。
  // When: 通过原frame入口运行这些旁路失败及核心失败组合。
  // Then: UX异常只降报告；真正核心失败仍按原业务错误结算，无半文件。
  // 断言: report malloc/get_report异常不冒泡为原frame_error，data仍625B。
  // 断言: 报告失败不阻止严格EOF成功产物交付。
  // 断言: 有效report也不能把decompress=-15的15007或超预算15008改成data/artifact。
  // 断言: 每帧一个业务结果；没有自动重建、额外submit或UX错误污染v1 Error。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});


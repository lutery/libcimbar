import test from 'node:test';
throw new Error('PLANNING_ONLY: Stage 4.5 skeleton; migrate cases and implement assertions before genuine RED.');

// 本文件只是文档内的测试骨架，未导入产品，不注册到现有运行器。
// 顶层守卫和以下占位异常均不能算真实TDD RED，也不能算产品执行证据。
// 正式落点：web/desktop-recv/tests/unit/session.test.mjs

test("UX-UT-012 Receiving才开始计时且创建Client时捕获正确owner", () => {
  // Given: 分别创建live/video会话；手动控制picker/source与Client init完成；主线程时钟Preparing=100，最后依赖就绪=600。
  // When: 按真实会话路径进入Receiving，并读取本次UX观测。
  // Then: receivingAtMs=600，elapsed从600计；createClient收到新会话的id/seq。
  // 断言: Preparing等待不算接收耗时；初始化失败或选择取消未进入Receiving则elapsed=null。
  // 断言: Client工厂接收的是创建时捕获的sessionId/sessionSeq，不从迟到回调推断当前owner。
  // 断言: source/Client以两种相反顺序就绪都只begin一次。
  // 断言: 原同步打开选择器、cleanup门和业务revision语义保留。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-013 旧Worker及坏旁路只降UX并保留每帧核心结果", () => {
  // Given: 原frame-result依次携带无uxObservation、version=2、非法结构以及合法报告；核心结果分别为data/artifact/error。
  // When: 从当前Client/Scheduler原关联结果路径进入Session消费函数。
  // Then: 无旁路记19015，未知版19013，坏结构19008；data字节仍能计速，原产物/错误独立结算。
  // 断言: 旧Worker旁路缺失不冒称19001导出缺失；未知版不猜测字段。
  // 断言: 主线程receivedAtMs取实际消费时钟，不复用Worker绝对时间。
  // 断言: data/artifact使用原合法正bytesDecoded；no_data/error传入模型字节为0且report=not_sampled。
  // 断言: 旁路拒绝不能吞掉真实artifact或原错误，也不能创建额外frame消费。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-014 旧seq、重复帧及实时录像切换不污染新观测", () => {
  // Given: 会话A接收过数据后stop并收敛；按原cleanup门启动相反inputKind的B；A仍有可手动送出的旧响应。
  // When: 分别送A迟到响应、B重复frameId以及B一个正常新响应。
  // Then: B只有新的当前帧记一次；B起点/桶/进度/保存显示不继承A。
  // 断言: A结果不改变B的bytes、lastData、lastAdvance、revision、artifact或输入类型。
  // 断言: B重复帧不加速率或抬revision；新帧计一次。
  // 断言: 正常video submitAndWait单次返回只接纳一次；不声称现有录像onResult必然重复调用。
  // 断言: 所有权过滤仍沿原Client/seq，不用UX owner替代原Worker对象关联。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-015 真实终点冻结用时而比例与EOF不能生成Ready", () => {
  // Given: Receiving起点100ms；先送single=1.2而没有artifact；input ended进入Draining；分别准备真实artifact、Incomplete、用户stop、原fatal错误终点。
  // When: 按原结果/结束路径在900ms终结，再推进至1500ms并清理/销毁。
  // Then: Draining继续计时；只能真实业务终点finish，最终接收用时800ms且之后不增长。
  // 断言: 比例>=1不触发Ready/Saved或启用保存；单独EOF且无完整artifact仍Incomplete。
  // 断言: 真实artifact分支的Ready及原错误/停止/Incomplete结算不被UX替代。
  // 断言: 冻结后stop/dispose不改endedAt/elapsed，不保留接收tick。
  // 断言: 准备阶段失败保持elapsed=null；原保存耗时不会计入接收时长。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

test("UX-UT-016 UX读写不扩充旧v1或伪造业务revision", () => {
  // Given: 相同原业务snapshot配上多次UX查询、report降级与速率窗口时间变化；已读取冻结receiver-v1 schema。
  // When: 读取UX和toContractSnapshot，保持原state不变并推进主线程时钟。
  // Then: UX有独立observationRevision，原v1 Snapshot/stats/Error字节与字段集合不变。
  // 断言: 仅时钟投影不能调用Session._emit({})，business revision/eventSeq与onSnapshot次数不增加。
  // 断言: toContractSnapshot字段精确符合旧schema，不出现uxObservation、rate、progress、190xx。
  // 断言: 原processed/completed等业务stats含义不因UX重复/拒绝改变。
  // 断言: 原schema/error登记作为只读输入；不修改枚举来使测试绿灯。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});


import test from 'node:test';
throw new Error('PLANNING_ONLY: phase 4.5 skeleton; implement assertions and remove this guard in phase 5. Guard failure is not genuine business RED.');

// Planning artifact only. Do not copy into the runnable suite unchanged.
// No production import, product implementation, skip or todo. All cases remain NOT_RUN.
// Scope: Node unit/integration only; real browser, assistive technology and OS dialogs require separate acceptance.

// Target: web/desktop-recv/src/ux-display.js
// Tasks: T7, T9, T10, T20; AC: AC-018, AC-022, AC-023; Runtime: R-10, R-11
test("UX-UT-048 同revision独立时钟更新用时但不重复语义播报", () => {
  // Given: 原业务/观测revision保持不变，Receiving始于1000ms；显示器已绘制一次；paint与live区写入均有独立计数。
  // When: 不触发snapshot，让独立时钟由2000走到3000；随后由真实artifact在3500ms结束，再进入选择路径和保存。
  // Then: 接收用时随时钟更新；announcementKey不含数字且不重复播报；真实结束后用时固定不含选择/保存耗时。
  // Assertions to implement:
  // - 2000到3000时elapsedMs增加1000，businessRevision与observationRevision不变。
  // - 速率窗口可随now自然过期；同announcementKey不重写polite live区。
  // - 比例/速度/elapsed数值改变不改变announcementKey；真实状态/产物/保存attempt变化才形成语义身份。
  // - artifact结束后elapsed=2500且后续Saving/Saved保持；Preparing从未begin时elapsed=null。
  // Fixtures: fakeClock与可统计文本/语义区域写入的DOM适配器 | 原业务事件驱动的artifact终结/保存序列
  // Genuine RED expectation: 补断言后，依赖shouldApplySnapshot相同revision拒刷或每tick重播的旧逻辑应失败。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Target: web/desktop-recv/src/ux-display.js
// Tasks: T10, T26, T27; AC: AC-018, AC-021, AC-023; Runtime: R-11
test("UX-UT-049 snapshot事件与tick共享250ms节流而业务按钮即时更新", () => {
  // Given: 建立两个互不共享计数器/timer/owner的独立子轨迹。A在0ms已写入遥测且全程保持Receiving，合法数值持续变化，100Hz snapshot通知与250ms时钟并存。B重置全部fixture后在0ms开始Receiving，业务按钮路径有独立spy。
  // When: A在[0,1000]ms交错触发通知/定时器且不进入任何终结态，统计整个半开区间[0,1000)。B重置后在125ms用真实artifact进入Ready，再由显式保存进入Saving，单独观察即时业务更新和接收timer释放。
  // Then: A的事件与tick共用遥测边界不超4Hz；B的原真实业务状态/按钮立即变更并释放终结接收timer。两条轨迹独立判定，tick均不驱动原app.render。
  // Assertions to implement:
  // - A中相邻遥测写入差>=250ms；半开区间[0,1000)最多4次，1000ms边界可有下一次。输入需确有后续可显示数值变化并观察到后续写入，避免全相同文本造成空测。
  // - A全程Receiving到1000ms，不混入Ready/Saving；事件与tick不会各写一次绕过同一lastTelemetryWriteAt，相同文本无重复DOM写入。
  // - B在125ms真实业务变化即时更新合法controls与Ready主文案，不等下个tick；随后的真实Saving同样即时。Ready终结释放接收timer，Saving不重建接收timer。
  // - B终结后的迟到tick不新增遥测写入；B不参与A的整秒频率计数，不能以提前终结后无timer证明A的4Hz限制。
  // - tick路径调用runFrameLoop、VideoSource.run、releaseInputs、finishStream、原render、抓帧/保存均为0；帧single-flight上限保持1。
  // Fixtures: A/B每次完全重置的精确fakeClock、独立owner、fakeTimers与计数器 | A持续Receiving且合法可显示数值变化的观测流；B真实artifact/保存业务事件序列 | 分离统计业务即时写与遥测写的paint/DOM spy
  // Genuine RED expectation: 补真实断言后，双通道各自4Hz或tick调用原整页render的实现必须失败。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Target: web/desktop-recv/src/ux-display.js
// Tasks: T9, T10, T20, T22; AC: AC-018, AC-021, AC-023; Runtime: R-01, R-02, R-10
test("UX-UT-050 每seq唯一显示刷新器并拒绝释放后的迟到tick", () => {
  // Given: 当前seq1已拥有刷新器，捕获一个待执行回调；随后原业务清理后切换seq2，另备同seq旧viewAt和真实终结事件。
  // When: 重复syncBusiness；切换owner；手工投递已取消的旧回调；再终结、dispose两次并投递迟到回调。
  // Then: 每时刻至多一个当前owner刷新器；旧seq/旧viewAt不绘制；重复释放幂等；终结不留接收计时器。
  // Assertions to implement:
  // - 重复syncBusiness不创建第二timer；owner替换先clear旧timer，旧回调触发也不写seq2内容。
  // - 比lastViewAt早的视图不回滚；owner顺序与时点同时检查。
  // - Ready/Incomplete/Stopped/原fatal停止接收timer；Preparing/Saving仅事件驱动，不保留接收tick。
  // - dispose幂等，迟到回调不重建刷新器、不抓帧、不变更业务revision。
  // Fixtures: 保存callback引用并可手动投递的fakeTimer队列 | seq1/seq2与终结状态矩阵、paint计数
  // Genuine RED expectation: 移植后用未清理timer或仅clear但不核对owner的实现确认迟到回调断言能失败。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Target: web/desktop-recv/src/ux-display.js
// Tasks: T10, T14, T16; AC: AC-017, AC-018, AC-021, AC-023; Runtime: R-08, R-10, R-11
test("UX-UT-051 页面后台返回按真实单调时间重算而非补tick", () => {
  // Given: Receiving页面在2000ms隐藏，当前数据窗口有效；fakeClock在无任何业务snapshot/tick时前进至20000ms；另有非法倒退/NaN时钟子样本。
  // When: 模拟visibility隐藏/恢复与pagehide，随后读取当前视图，最后尝试投递隐藏前回调。
  // Then: 恢复按20000ms重新投影，用时包含经过时间、旧速率归零，且不补发18秒的tick；非法时钟只降级UX。
  // Assertions to implement:
  // - hidden期间允许暂停timer且不得主动提交帧；visible立即一次当前时间投影并至多恢复一个刷新器。
  // - 恢复elapsed按now-start计算，rate窗口过期归零、不显示旧高值；不按tick计数累加时间。
  // - 取消的隐藏前回调不重复绘制/播报；pagehide销毁后不恢复。
  // - 非法时钟按19009拒绝或降级当前UX，不改变原业务错误、看门狗或接收状态；这是假visibility事件测试而非真浏览器后台验收。
  // Fixtures: fakeVisibilityEventTarget、fakeClock与可手工驱动timer | 窗口有数据后长时间无回调的观测
  // Genuine RED expectation: 补断言后，用累计tick计时或后台返回保留旧速度的实现应失败；真实后台行为另留浏览器验收。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Target: web/desktop-recv/src/ux-display.js
// Tasks: T10, T26, T27; AC: AC-021, AC-022, AC-023; Runtime: R-11
test("UX-UT-052 遥测绘制异常只退化显示不重启或丢业务控件", () => {
  // Given: 专用paint在一次遥测写入抛异常；原业务按钮/主状态文字存在；原接收任务与single-flight等待中。
  // When: 触发tick及随后一个真实业务状态事件。
  // Then: 记录19012并回退可读文字，原按钮/业务状态仍及时可用，不导致传输重启或原异常吞并。
  // Assertions to implement:
  // - 异常被UX边界捕获，不传播为原Worker frame_error或v1 Error.code。
  // - 保留原controls和状态文字；下一业务事件仍可更新，诊断不作为用户恢复指令。
  // - 没有新增capture/picker/save/restart/stop动作，也不并发额外帧。
  // - 记录/提示去重有界，不每tick无限堆积；正常修复后的显示不要求重接收。
  // Fixtures: 首paint抛错后可恢复的DOM适配器 | 业务按钮存在性/disabled与原解码调用计数spy
  // Genuine RED expectation: 移植后，将paint异常透传或触发重新接收的实现必须被真实断言拦下。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

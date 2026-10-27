import test from 'node:test';
throw new Error('PLANNING_ONLY: phase 4.5 skeleton; implement assertions and remove this guard in phase 5. Guard failure is not genuine business RED.');

// Planning artifact only. Do not copy into the runnable suite unchanged.
// No production import, product implementation, skip or todo. All cases remain NOT_RUN.
// Scope: Node unit/integration only; real browser, assistive technology and OS dialogs require separate acceptance.

// Target: web/desktop-recv/src/ux-view.js
// Tasks: T20, T21, T22; AC: AC-019, AC-021; Runtime: R-06
test("UX-UT-054 录像位置合法化与未知时长只影响媒体显示", () => {
  // Given: 录像Context取实际VideoSource.snapshot位置；参数表含position=0/正数/大于duration、未知/0/负/非有限duration、负/NaN/Infinity position，以及live输入。
  // When: 逐一合法化并readView，不主动seek或更改源速度。
  // Then: 有效位置独立显示；未知总时长可显示已处理秒数但无fraction；坏位置只隐藏媒体栏；live不出现媒体位置。
  // Assertions to implement:
  // - 有限非负position保留；有效正duration时fraction=min(1,position/duration)，duration未知/非正/非有限归null且fraction=null。
  // - 负数/NaN/Infinity position使整个mediaPosition=null并19011，不影响数据速率、文件估计和原解码结果。
  // - live的mediaPosition=null；不把容器字节大小当原文件进度。
  // - 投影不能调用seek、playbackRate或增加提交；fakeVideo仅证明接线，真实呈现另验。
  // Fixtures: 实际snapshot形状的录像位置参数矩阵 | video-source的可统计seek/playbackRate/submit假元件
  // Genuine RED expectation: 补断言后，未知duration除零、媒体坏值导致整个传输失败或将position当文件比例的实现必须失败。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Target: web/desktop-recv/src/app.js
// Tasks: T20, T21, T22; AC: AC-016, AC-019, AC-020, AC-024; Runtime: R-06
test("UX-UT-055 录像到末尾和比例足量不等于文件就绪", () => {
  // Given: 录像位置达到duration，最终在途帧尚未结算；分别提供最后no_data和最终真实artifact两种结算；观测报告可>=1。
  // When: 触发原ended/EOF回调，保留原最后采样与drain屏障，读媒体/文件显示及保存控件。
  // Then: 录像处理位置可100%，文件未完成仍不Ready；原最终样本得到artifact才Ready，否则沿原Incomplete收尾。
  // Assertions to implement:
  // - EOF通知不直接finish(reason=artifact)、不直接Saved或启用保存；最终在途结果必须先结算。
  // - 原takeFinalSample仍来自真实capture入口的接线，次数和EOF顺序保持，不能为进度删尾采样。
  // - 无artifact时progress不是complete，Incomplete说明录像读完但文件未完成；>=1显示collecting_more而非硬停99%。
  // - 有真实artifact才显示文件完成并冻结接收用时；本用例fake帧/假元件不替代真实录像与外部SHA验收。
  // Fixtures: 原video EOF/最后一帧/最后采样可手工释放的Promise夹具 | no_data尾帧与真实形状artifact尾帧对照
  // Genuine RED expectation: 移植后，用media fraction=1或比例>=1直接完成的实现应产生RED，旧EOF屏障回归仍须保留。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Target: web/desktop-recv/src/app.js
// Tasks: T20, T21, T22, T26; AC: AC-019, AC-022, AC-023, AC-024; Runtime: R-11, R-12
test("UX-UT-056 活动录像预览不被新布局或ticker隐藏", () => {
  // Given: 真实候选HTML/CSS与App接线的DOM适配器；活动video处于Receiving、Draining、Reconstructing，诊断区域可折叠。
  // When: 触发业务render、专用tick及诊断折叠，记录preview.hidden、祖先折叠/隐藏属性与CSS规则。
  // Then: 活动预览保持可呈现的结构，不因新层级或tick折叠；原结束清理仍执行。
  // Assertions to implement:
  // - 活动三态preview.hidden=false，不加display:none、visibility:hidden或会隐藏video的details折叠祖先。
  // - 只允许诊断日志折叠，不以减少视觉噪声为由把真实video移入隐藏容器。
  // - tick不调用VideoSource.run、pause或改变背压；原终态释放/隐藏次数保持。
  // - DOM/CSS结构检查不能证明真实rVFC持续触发，必须保留T25/T31/T35真浏览器录像验收，不将mock PASS当rVFC证据。
  // Fixtures: 真实候选HTML/CSS文本与可记录属性变化的DOM适配器 | 活动三态及诊断折叠事件序列
  // Genuine RED expectation: 补断言后，用隐藏preview或隐藏祖先重做布局的实现应失败；真实浏览器持续呈现仍单列NOT_RUN。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

import test from 'node:test';
throw new Error('PLANNING_ONLY: phase 4.5 skeleton; implement assertions and remove this guard in phase 5. Guard failure is not genuine business RED.');

// Planning artifact only. Do not copy into the runnable suite unchanged.
// No production import, product implementation, skip or todo. All cases remain NOT_RUN.
// Scope: Node unit/integration only; real browser, assistive technology and OS dialogs require separate acceptance.

// Target: web/desktop-recv/src/ux-view.js
// Tasks: T7, T9, T10; AC: AC-015, AC-018, AC-021, AC-023; Runtime: R-10, R-11
test("UX-UT-041 只读投影保持事实、controls与观测版本不变", () => {
  // Given: 使用契约合法的Receiving观测、完整Context与原deriveControls结果；冻结输入对象并记录模型快照、业务revision及副作用计数。
  // When: 对同一输入与nowMs重复readView，再增加nowMs读取；包括Idle无begin与Receiving已经begin的子样本。
  // Then: 同一输入确定性返回；只按时间变化显示用时与窗口，不修改观测或业务事实，也不创造源操作。
  // Assertions to implement:
  // - 深比较/冻结观测与Context，保证readView未改输入、observationRevision、businessRevision。
  // - 返回controls四布尔逐字段等于原合法controls，不能由比例、媒体位置或提示启用保存/输入。
  // - Idle未begin时elapsedMs=null；读取不调用_emit、captureFrame、offerFrame、VideoSource.run、releaseInputs、finishStream或保存。
  // - 重复相同nowMs结果相等；时间推进允许显示变化而非伪造revision。
  // Fixtures: 合法ViewRequest/Observation样例及原controls能力矩阵；纯对象deepFreeze/副作用计数夹具 | 可手动推进的主线程单调fakeClock
  // Genuine RED expectation: 移入真实套件并实现断言后，先确认缺少readView/有副作用的旧投影产生业务断言失败；规划守卫失败不计RED。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Target: web/desktop-recv/src/ux-view.js
// Tasks: T7, T9, T16, T20; AC: AC-016, AC-020, AC-021, AC-023; Runtime: R-01, R-06, R-08
test("UX-UT-042 拒绝旧owner和无效Context而不补造完成", () => {
  // Given: 合法当前owner与控件基线，另备旧seq、version非1、无效/矛盾state与controls、倒退/非有限now、Ready/Saving/Saved/Retryable缺真实artifact或owner的请求。
  // When: 逐一调用readView，保留同一原业务状态与副作用计数作为对照。
  // Then: 只拒绝或降级UX投影，给出约定190xx；保留原业务按钮/文字，不从比例猜artifact或改业务状态。
  // Assertions to implement:
  // - 旧seq=19007；结构/Context矛盾=19008；倒退或非有限有效时钟检查=19009；不支持version=19013；需产物状态缺owner/artifact=19014。
  // - 每个负例仅改变一个因素，先通过形状校验后再执行身份/时序负例，避免错误原因混淆。
  // - 返回拒绝时不出现complete、伪造artifactId、Saved或新增可用控件；业务副作用计数仍为零。
  // - 真正原业务错误继续存在，不能被UX降级提示掩盖。
  // Fixtures: 当前owner合法Context及单因素负例表 | 原状态/controls冻结快照与业务副作用spy
  // Genuine RED expectation: 移植后断言旧owner/缺产物Context确实被拒绝；旧实现缺接口或错误接受会形成真实RED。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Target: web/desktop-recv/src/ux-view.js
// Tasks: T14, T15, T16; AC: AC-015, AC-018, AC-023; Runtime: R-07
test("UX-UT-043 慢帧提示在真实提交满1500ms才出现", () => {
  // Given: 当前Receiving且已有近期data，原pending提供inFlightSinceMs=1000；主线程提交时点真实取自原postMessage入口。
  // When: 在2499.9、2500、2500.1ms读取；另测inFlight=false、普通短帧及未提交/无合法提交时点的Context。
  // Then: 小于1500ms不覆盖接收提示；达到1500ms才processing；普通单在途不会每帧闪烁。
  // Assertions to implement:
  // - 2499.9ms保持原receiving细分；2500和2500.1ms可显示processing；不依赖Worker绝对时钟或观测回调到达时点。
  // - 仅已确认的当前pending身份和合法submittedAt能支撑processing；无pending不能借旧时点显示忙帧。
  // - processing优先于同一时刻无data/无进展提示，但不延长或重置原frame看门狗。
  // - 只验证投影/原pending接线，不宣称此mock证明浏览器实际慢帧体验。
  // Fixtures: 当前pending元数据及1499.9/1500/1500.1ms参数表 | fakeClock与真实主线程submit入口spy
  // Genuine RED expectation: 补断言后，用把每个inFlight都显示processing或使用接收回调时点的实现检验应失败，再修复。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Target: web/desktop-recv/src/ux-view.js
// Tasks: T7, T14, T15; AC: AC-015, AC-018, AC-022; Runtime: R-10
test("UX-UT-044 首次有效数据等待建议精确跨越5000ms", () => {
  // Given: Receiving起点1000ms，只有图像帧/no_data而从未有效data，业务revision和观测revision均保持。
  // When: 不派发新snapshot，在5999.9、6000、6000.1ms独立读取。
  // Then: 始终诚实waiting_data；满5000ms才出现检查发送画面/Mode等建议，不声称成功或错误。
  // Assertions to implement:
  // - 5999.9ms无到阈值检查建议；6000/6000.1ms有行动建议且状态仍waiting_data。
  // - elapsedMs向下取整分别为4999/5000/5000，图片存在不增加数据识别速率分子。
  // - 等待不是新故障码，不会自动停止、重新打开屏幕选择器或重启。
  // - 无snapshot仍更新，建议含义由纯文本判断，不靠解析诊断英文日志。
  // Fixtures: 接收起点1000ms且无有效data的合法观测 | fakeClock与前后边界请求
  // Genuine RED expectation: 移植后先证明无snapshot的旧UI不会产生所需到时建议，再由独立投影实现通过业务断言。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Target: web/desktop-recv/src/ux-view.js
// Tasks: T14, T15, T16; AC: AC-016, AC-017, AC-018; Runtime: R-05, R-10
test("UX-UT-045 上次有效data满5000ms转为无新数据且估计标陈旧", () => {
  // Given: Receiving曾在2000ms识别有效data和可信单流比例，之后只有no_data；无长inFlight。
  // When: 读取6999.9、7000、7000.1ms，并在新有效data到来后再次读取。
  // Then: 满5000ms转no_new_data并标上次估计已陈旧；无数据后的速率按窗口归零；新的有效data解除陈旧。
  // Assertions to implement:
  // - 6999.9ms不进入no_new_data；7000ms开始no_new_data，progress.stale=true且仍标上次可信样本asOfMs。
  // - 窗口已清空时数值为0而非保留旧高值；不能把no_data图像字节算入速率。
  // - 新data后lastData更新、陈旧解除；比例无推进不会虚构增长。
  // - 未回复的长忙帧优先processing，不能仅从未回复推断无输入。
  // Fixtures: lastData=2000ms、可信比例与no_data序列 | fakeClock及新data恢复序列
  // Genuine RED expectation: 补真实断言后，保留旧速度或在4999.9ms过早显示无新数据的实现必须失败。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Target: web/desktop-recv/src/ux-view.js
// Tasks: T14, T15, T16; AC: AC-016, AC-017, AC-018; Runtime: R-03, R-10
test("UX-UT-046 无重建推进提示在8000ms边界且需要可信单流依据", () => {
  // Given: lastAdvance=1000ms；一直有近期有效data但可信单流比例重复，最后data=8750ms；另备report unavailable/ambiguous/enough_data样本。
  // When: 读取8999.9、9000、9000.1ms，随后输入一个更大可信单流比例；分别读取其余报告质量状态。
  // Then: 仅可信单流比例满8000ms未推进时给no_progress；重复数据可有速率；推进后恢复receiving。
  // Assertions to implement:
  // - 8999.9ms仍receiving；9000/9000.1ms为no_progress，且speed可大于0而非强制归零。
  // - 同一比例不移动lastAdvance、不虚增比例；严格增大才解除无进展提示。
  // - unavailable/empty显示progress_unavailable，ambiguous显示progress_unknown，>=1显示collecting_more，均不谎称无新块。
  // - 无进展提示不触发重启、停止或重新打开任何选择器。
  // Fixtures: 高频有效data但比例固定的观测序列 | 可信进展/无报告/多流/理论足量参数矩阵
  // Genuine RED expectation: 补断言后，用tick累增比例或无依据一律显示no_progress的实现应产生RED。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Target: web/desktop-recv/src/ux-view.js
// Tasks: T9, T15, T20, T22; AC: AC-015, AC-016, AC-019, AC-020; Runtime: R-06, R-07
test("UX-UT-047 业务终态与收尾优先于接收细分且完成只认真实artifact", () => {
  // Given: 同一份包含旧接收比例/速率的观测，构造合法Preparing、Draining、Reconstructing、Stopping、Incomplete、Ready、Saving、Saved、Retryable和Stopped Context。
  // When: 依次投影，包括真实Ready artifact与比例>=1但Receiving无artifact两种对照。
  // Then: 原业务阶段优先；Ready/Saved含义分开；只有真实产物可complete且controls仍由原策略决定。
  // Assertions to implement:
  // - Preparing/收尾/Stopping/终态/保存态不被processing、waiting_data或no_progress覆盖。
  // - 比例>=1但无artifact为enough_data且ratio=null，不显示文件100%或硬停99%，保存维持禁用。
  // - 真实artifact的Ready才complete=1且可保存；Saved只能来自原真实保存完成状态。
  // - Incomplete清楚说明未完成并允许原重试入口，不从媒体100%或旧比例冒称成功。
  // Fixtures: 合法状态/owner/artifact/controls联合矩阵 | 有artifact和无artifact的同报告比例对照
  // Genuine RED expectation: 移植后先断言只依比例判完成或用接收细分覆盖终态的实现失败。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

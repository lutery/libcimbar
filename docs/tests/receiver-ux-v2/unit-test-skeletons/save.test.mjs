import test from 'node:test';
throw new Error('PLANNING_ONLY: phase 4.5 skeleton; implement assertions and remove this guard in phase 5. Guard failure is not genuine business RED.');

// Planning artifact only. Do not copy into the runnable suite unchanged.
// No production import, product implementation, skip or todo. All cases remain NOT_RUN.
// Scope: Node unit/integration only; real browser, assistive technology and OS dialogs require separate acceptance.

// Target: web/desktop-recv/src/ux-telemetry.js
// Tasks: T20, T21, T22; AC: AC-020, AC-021; Runtime: R-09
test("UX-UT-057 同步和异步16002取消都保留产物供真实点击重试", () => {
  // Given: 真实SaveController与UX桥接；picker第一次同步抛AbortError或异步拒绝AbortError，已有真实owner/artifact/Blob。
  // When: 显式点击start，观察raw failed+16002/cancelled+16002；再由第二次显式点击使用同一Blob保存。
  // Then: 两种原事件均显示cancelled，可重试且不重接收；只有第二次用户点击再开picker。
  // Assertions to implement:
  // - 同步failed+16002与异步cancelled+16002均归一save.phase=cancelled，原controller事件/错误码保持原语义。
  // - 产物Blob身份/字节/owner不变，canSave按原Retryable恢复；不能自动发起新picker或解码。
  // - 后续真实新attemptId来自新start，使用同一产物且成功后才Saved。
  // - 注入picker验证逻辑，不宣称证明系统取消对话框/焦点/落盘；真实OS与哈希留E2E。
  // Fixtures: 现有SaveController注入picker同步/异步AbortError夹具 | 不可变artifact Blob与可记录事件的UX桥接
  // Genuine RED expectation: 移植后，把同步failed+16002误显示写入失败或取消后丢Blob的实现须RED。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Target: web/desktop-recv/src/ux-telemetry.js
// Tasks: T20, T21, T22; AC: AC-020, AC-021; Runtime: R-09
test("UX-UT-058 SAVE_BUSY仍在写入且pending始终未结算", () => {
  // Given: 真实SaveController的write Promise保持待定，同一真实owner/attempt已进入writing；注入pendingTimer可手动到期。
  // When: 写入期间再次点击start产生writing+16008，再触发pending并读取视图，最后释放真实write/close。
  // Then: busy不等同保存失败或新attempt；pending明确尚未结算，直到write和close都成功。
  // Assertions to implement:
  // - writing+16008保持phase=writing与原attemptId，不重新绑定owner、不发第二个picker或write。
  // - pending保持禁用重复保存、没有Saved/完成勾选、不自动取消或重试。
  // - 重复完全相同事件不提升observationRevision，业务Controller原事件仍正常传递。
  // - 最终成功事件才归saved；UI用词不从超时推断失败。
  // Fixtures: 可手动释放write/close的真实Controller夹具 | fakeTimer触发pending和记录picker/write调用数的spies
  // Genuine RED expectation: 补断言后，将16008映射failed、pending映射saved或双击重发picker的实现必须失败。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Target: web/desktop-recv/src/save-controller.js
// Tasks: T20, T21, T22; AC: AC-020, AC-024; Runtime: R-06, R-09
test("UX-UT-059 write和close均成功后才显示Saved", () => {
  // Given: 真实SaveController、UX bridge和会话状态；picker返回注入writable，write与close分别为可控Promise。
  // When: 先释放write但保持close未决，记录状态；再释放close并等待原终结事件。
  // Then: write成功只是仍在保存，close成功后原saved事件才驱动Saved；接收用时不包含保存耗时。
  // Assertions to implement:
  // - close未成功前UI不Saved、不显示文件已保存，即使write已成功或artifact progress=complete。
  // - close成功且原saved error=null后才save.phase=saved；保留真实owner与attempt身份。
  // - whenSettled仅真正终结后解除原停止清理阻塞；不为UX改变IO/停止规则。
  // - 该注入writable证明结算次序，真实文件存在和外部SHA必须由真实E2E单独证明。
  // Fixtures: 真实Controller与可控write/close双Promise、事件记录器 | 已真实Ready并冻结接收用时的合法Context
  // Genuine RED expectation: 移植后，write resolve即Saved或用pending时间到期冒充close成功的实现应RED。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Target: web/desktop-recv/src/save-controller.js
// Tasks: T20, T21, T22; AC: AC-020, AC-021, AC-024; Runtime: R-09
test("UX-UT-060 写入和关闭失败保持可重试且不再次接收", () => {
  // Given: 已有不可变artifact；注入write reject、close reject、权限/锁失败子样本，UX保存owner已正确绑定。
  // When: 逐一执行真实Controller start并结算，随后用户再次点击用健康writable保存。
  // Then: 各原失败码保留，UX显示failed可重试；原Blob和接收用时保持，无自动重接收。
  // Assertions to implement:
  // - 普通write失败原码16005，普通close失败16006；权限/锁按原16003/16004，UX不改旧Error枚举。
  // - 失败均不显示Saved，产物仍可用、原controls恢复重试；close失败即使write成功也失败。
  // - 重试只由真实新点击建立新attempt，同一artifact写入；不重新读源、不清原Blob或重算接收用时。
  // - 真实磁盘权限/文件占用场景另留E2E/IAT边界，不把注入异常当实际磁盘验收。
  // Fixtures: write/close/权限/锁拒绝参数表和原Controller夹具 | 相同Blob身份与重试调用计数spies
  // Genuine RED expectation: 补断言后，将close失败显示成功、失败销毁产物或自动重启接收的实现必须失败。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Target: web/desktop-recv/src/app.js
// Tasks: T20, T21, T22; AC: AC-020, AC-021; Runtime: R-09
test("UX-UT-061 保存点击时捕获owner并同步绑定真实attempt", () => {
  // Given: 当前sessionId/seq/artifact构成真实owner；SaveController.start在返回前同步发selecting；提供第二次busy事件与可变当前snapshot。
  // When: 调用真实点击处理，不在picker前await；记录点击owner，selecting时读取真实attemptId并绑定；然后使当前snapshot换owner再投递旧回调。
  // Then: 同步selecting不会因尚未返回而漏绑定；每个实际attempt永远属于点击时owner，busy不重新绑定。
  // Assertions to implement:
  // - picker调用发生在同一显式点击调用栈中，前置无await；单元只证明调用顺序，真实transient activation仍留系统浏览器验收。
  // - 绑定attemptId取真实事件非空字符串，不用预测计数器、requestId或事后snapshot拼造身份。
  // - owner对象在start前捕获并固定；回调只查既有attempt绑定，当前snapshot变更不会改归属。
  // - busy writing+16008沿原绑定；settled后清理绑定，单在途Map不无限增长。
  // Fixtures: 真实Controller同步selecting事件与可变snapshot的App接线夹具 | 注入picker的同调用栈/attempt owner Map记录器
  // Genuine RED expectation: 移植后，start返回后才绑定、回调读取当前owner或预测attemptId的实现应产生RED。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Target: web/desktop-recv/src/ux-telemetry.js
// Tasks: T20, T21, T22; AC: AC-020, AC-021; Runtime: R-01, R-02, R-09
test("UX-UT-062 旧保存owner与attempt迟到回调不污染当前会话", () => {
  // Given: seq1/旧artifact的保存已终结或被停止；seq2已建立自己的owner和真实新attempt；保存事件记录原业务独立通道。
  // When: 投递seq1 saved/failed/aborted+11005、旧attempt writing，以及当前终结attempt后的倒退writing和完全重复终结事件。
  // Then: 旧身份拒绝19007，不把旧成功/失败写入新页面；终结attempt不倒退，重复完全相同事件幂等。
  // Assertions to implement:
  // - seq2的save/progress/elapsed/announcementKey、当前controls及observationRevision不被旧事件改变。
  // - 同owner也必须匹配当前真实attempt；旧attempt或冻结/终结后倒退事件不重新进入writing。
  // - 相同终结事件不提升revision或重复播报；aborted/11005不污染新会话。
  // - 仅拒UX观测；原SaveController结算与原业务saveEvent仍按既有规则执行，不吞原IO回调。
  // Fixtures: 双seq/双artifact/多个真实attempt的事件序列 | 终结后重复/倒退/旧回调记录器与原业务通道spy
  // Genuine RED expectation: 补断言后，只校验sessionId不校验seq/artifact/attempt或用当前owner冒认旧回调的实现必须失败。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Target: web/desktop-recv/src/ux-telemetry.js
// Tasks: T20, T21, T22; AC: AC-020, AC-021, AC-023; Runtime: R-09
test("UX-UT-063 非法保存旁路事件只拒UX且不篡改原IO结算", () => {
  // Given: 原真实保存流程正在运行；另备version非1、空attemptId、无artifact/owner、未知rawStatus、saved但errorCode非null等非法旁路事件。
  // When: 逐个投递UX观测，同时让原Controller的write/close按原计划完成。
  // Then: 非法事件被拒绝/降级，原保存照常结算；不接受伪造成功，不为UX故障重试磁盘。
  // Assertions to implement:
  // - 非法字段/状态=19008，version不支持=19013；业务Context缺必须归属事实=19014而非补造。
  // - saved且errorCode非null不能显示成功，空attempt不得冒用当前attempt或旧attempt。
  // - 原IO调用次数、write/close完成与原业务结算顺序与无UX负例对照一致。
  // - 诊断仅内部190xx且去重有界；不写旧error-codes.json、不作为v1 Error.code。
  // Fixtures: 单因素非法SaveRequest和缺owner Context参数表 | 健康Controller真实结算对照及副作用spy
  // Genuine RED expectation: 移植后，saved不校验error或UX异常阻断原close/业务结算的实现应失败。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

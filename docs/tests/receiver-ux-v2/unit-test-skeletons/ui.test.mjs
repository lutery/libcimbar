import test from 'node:test';
throw new Error('PLANNING_ONLY: phase 4.5 skeleton; implement assertions and remove this guard in phase 5. Guard failure is not genuine business RED.');

// Planning artifact only. Do not copy into the runnable suite unchanged.
// No production import, product implementation, skip or todo. All cases remain NOT_RUN.
// Scope: Node unit/integration only; real browser, assistive technology and OS dialogs require separate acceptance.

// Target: web/desktop-recv/index.html
// Tasks: T26, T27; AC: AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-022; Runtime: -
test("UX-UT-053 中文主操作保留双入口且动态文本不按HTML解释", () => {
  // Given: 加载真实候选HTML与DOM适配器；动态源名、文件名和错误文本含中文空格及<img onerror=...>、<script>等文本。
  // When: 驱动合法视图和现有ui恢复/安全文件名路径，分别显示接收、媒体、可保存、取消和失败状态。
  // Then: 两个入口保留原id和操作能力；主流程中文可理解；动态内容只作为文本，正常操作不依赖英文诊断日志。
  // Assertions to implement:
  // - btn-live/btn-video/btn-stop/btn-save/file-input/preview/artifact原id唯一保留；入口标签为实时抓屏/录像导入且互锁语义不变。
  // - 真实显示区ux-primary/secondary/next/elapsed/rate/progress/media/announcement存在；近期速率说明始终含协议与冗余含义。
  // - 源名/文件名/错误文字使用textContent等安全文本通道，不新增可执行元素、不设置事件属性；原safeSuggestedName继续去路径/控制符。
  // - 不要把190xx当普通用户的操作步骤；检查中文语义与可行动提示，不通过逐字快照强绑定所有文案。
  // - 此Node DOM测试不能证明实际字体、窄窗口无溢出或系统对话框行为，真实T31/T35仍待执行。
  // Fixtures: 真实候选index.html与受控DOM适配器 | 中文+空格/HTML样式动态文本和原ui合法controls矩阵
  // Genuine RED expectation: 移植后，旧英文界面、去掉任一输入按钮或innerHTML解释动态文本均须产生明确业务/结构断言失败。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Target: web/desktop-recv/index.html
// Tasks: T26, T27; AC: AC-020, AC-022, AC-023; Runtime: R-10, R-11
test("UX-UT-064 语义区与焦点恢复结构支持键盘而不逐数播报", () => {
  // Given: 真实候选DOM含中文lang、保留操作按钮和专用语义区；DOM适配器可记录focus目标，原controls明确合法可执行操作。
  // When: 更新数值多次、切换语义状态、模拟保存取消/失败/成功后焦点恢复及禁用控件变化。
  // Then: 只有稳定主语义区polite播报，数字/log不live；恢复焦点指向当前可执行操作，保留键盘原生按钮结构。
  // Assertions to implement:
  // - lang=zh-CN；ux-announcement稳定aria-live=polite；elapsed/rate/progress/media和log不设会逐数重复播报的live。
  // - announcementKey相同不写live区；语义状态、artifact或真实attempt变更才允许一次更新。
  // - 保存取消/失败返回可执行保存/重试目标，成功后返回原规则允许的新接收操作；禁用/隐藏节点不作为focus目标。
  // - 原生button/label、可见焦点样式和最小44px规则具备结构依据；Node DOM不证明屏幕阅读器实际发声、窄窗可用性或系统弹窗焦点，必须保留T31/T35真实检查。
  // Fixtures: 真实候选HTML/CSS与focus记录DOM适配器 | 取消/失败/成功合法controls及announcementKey序列
  // Genuine RED expectation: 移植后，数字区逐次live、对同key重复写入或焦点落到禁用节点的实现必须被断言拦住；真实辅助技术仍NOT_RUN。
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

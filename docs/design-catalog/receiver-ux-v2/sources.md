# 设计来源与证据边界

## 用户与需求

- [原始反馈](../../requirements/receiver-ux-v2/user-feedback.md)：用户已成功云桌面→宿主机，要求改善接收反馈。
- [Q-001回答](../../requirements/receiver-ux-v2/open-questions.md)：用户填写“按照推荐执行”；本轮确认其余无问题并授权进入下一阶段。
- [需求基线](../../requirements/receiver-ux-v2/requirements-spec.md)：FR-UX-001～005、NFR-UX-001～005、AC-015～024；旧AC-001～014继续回归。
- [阶段1可行性与实际探针](../../requirements/receiver-ux-v2/feasibility.md)：真实交付WASM重复/新块/多流结果；无屏幕或UI验收。

## 当前代码（仓库根相对路径）

| 路径 | 本阶段依据 |
|---|---|
| web/desktop-recv/index.html、styles.css | 现有双输入按钮、深色/青色tokens、系统字体、诊断日志 |
| web/desktop-recv/src/app.js | render含输入生命周期副作用；时钟刷新必须分离；现有no-data提示及视频measurement hooks |
| web/desktop-recv/src/ui.js | 原状态文案/按钮权限/恢复策略；只读反馈可增量扩展 |
| web/desktop-recv/src/session.js | seq所有权、_onFrameResult目前未消费data/no_data遥测、业务状态与清理 |
| web/desktop-recv/src/frame-scheduler.js | 原单在途、掉帧/背压、EOF屏障；completed不是有效文件数据 |
| web/desktop-recv/src/decoder-client.js | 原帧相关性、看门狗、旧响应丢弃 |
| web/desktop-recv/src/video-source.js | snapshot的position/duration；rVFC逐帧处理与EOF路径，以当前函数为准，旧文件头注释不替代实现 |
| web/desktop-recv/src/save-controller.js | selecting/writing/pending/cancelled/failed/saved及write+close判据 |
| web/desktop-recv/src/contract-snapshot.js | 现有v1公开快照适配，不能随意混入UX字段 |
| web/desktop-recv/worker/decoder-worker.js | frame-result outcomes、bytesDecoded、artifact严格构造及预算 |
| src/lib/cimbar_js/cimbar_recv_js.cpp | report共享调试缓冲与fountain_decode后比例报告；get_report返回实际复制长度 |
| src/lib/fountain/FountainDecoder.h、fountain_decoder_stream.h、fountain_decoder_sink.h | 去重块、内部所需块基准、无ID多流列表 |
| src/lib/cimbar_js/CMakeLists.txt | 现有get_report导出，首轮不需新核心协议 |
| docs/design-catalog/contracts/receiver-v1.schema.json | 严格metadata契约，新增UX内部数据在2.5单列 |

## 设计选择与实测分别记录

3秒速率窗口、1秒预热、250ms最短重绘、5秒无data提示、8秒无进展提示、1024字节report上限是本阶段可评审的设计选择。其中5秒沿用旧提示意图；其余不是用户实测结论或性能SLA，阶段4.x/5需按冻结方案核验。

界面演示数据均为合成；本阶段新检查仅包括图语法、文档一致性、原型离线DOM交互与静态可访问性要素。没有调用真实屏幕/文件选择器，没有产品E2E或像素级浏览器验收。旧field矩阵不因用户新口头反馈或原型演示自动变绿。

阶段2.5细化：[模块/接口/异常矩阵](module-contract-error-matrix.md)明确1500ms慢帧触发、12×250ms桶及独立速率预热域；见[契约检查](contracts-qa.md)。这些仍是设计参数，不是新增实测SLA。

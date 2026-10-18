# 设计证据索引

本轮日期：2026-10-18。仓库基线 `84e7a1a`。以下源码已读取；外部 API 通过 Context7 查询 `/mdn/content`，未将文档能力当实际运行结果。

| 来源 | 支撑设计 |
|---|---|
| [用户需求](../requirements/requirements-spec.md)、[原始回答](../requirements/open-questions.md) | 双输入宿主机新接收端、最小改动、本地先于现场、单文件与保存重试 |
| [cimbar_recv_js.h](../../src/lib/cimbar_js/cimbar_recv_js.h) | scan/fountain/file/decompress 接口及同实例约束 |
| [cimbar_recv_js.cpp](../../src/lib/cimbar_js/cimbar_recv_js.cpp) | `_sink`/`_dec` 持有状态；同模式配置不作完整 reset；RGBA 路径；解压返回处理 |
| [WASM CMake](../../src/lib/cimbar_js/CMakeLists.txt) | 接收导出、BigInt、128 MiB 堆配置、WASM/asm.js 差异 |
| [解压包装](../../src/lib/compression/zstd_decompressor.h) | 阶段 2.5 发现 EOF 不能由零输出独立证明；结合导出中忽略 write_once 返回，需严格结束装配门槛 |
| [原发送端](../../src/exe/cimbar_send/send.cpp)、[原浏览器发送页](../../web/index.html) | 原生与 Web 已有发送入口，默认 B / 15fps，作为模拟源候选 |
| [原原生接收端](../../src/exe/cimbar_recv2/recv2.cpp) | 视频输入存在，但 GUI/EOF 行为不直接满足新需求 |
| [原接收 Worker](../../web/recv-worker.js)、[接收逻辑](../../web/recv.js) | Worker/WASM 先例；不能直接复用为完备新会话协调器 |
| [解压下载](../../web/zstd.js) | 原下载 Blob 路径没有可观测磁盘写入完成；不能据此满足保存重试全部要求 |
| [FountainMetadata](../../src/lib/fountain/FountainMetadata.h)、[FountainDecoder](../../src/lib/fountain/FountainDecoder.h) | 压缩尺寸/块编号边界，块去重；不扩容协议 |
| [打包脚本](../../package-wasm.sh)、[资源重命名](../../web/wasmgz.sh)、[接收缓存](../../web/recv-sw.js) | 生成产物缺失时需装配；避免继承根路径/缓存耦合 |

外部 API 文档（2026-10-18 查询）：

- [getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)：窗口/屏幕授权、瞬时用户激活、禁止 min/exact 约束及错误分类。
- [屏幕捕获](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API/Using_Screen_Capture)：捕获源与停止 tracks、断开媒体对象。
- [requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)：帧呈现回调和非严格同步保证；不能推导逐帧必达。
- [cancelVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/cancelVideoFrameCallback)：取消已注册回调。
- [showSaveFilePicker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker)：显式用户动作、保存选择器和取消/权限异常。
- [createWritable](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createWritable)：写入与关闭语义、权限/锁定异常。
- [安全上下文](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)：本地可信来源背景；运行时仍需能力检测。
- [Zstd 流式解压官方手册](https://facebook.github.io/zstd/zstd_manual.html)：阶段 2.5 核对 ZSTD_decompressStream 的 0/正值/错误及输出刷新语义。
- [JSON Schema](https://json-schema.org/understanding-json-schema/reference/combining)：阶段 2.5 元数据 tagged union、条件字段与未知字段处理依据。

本轮仅盘点 Windows build 和浏览器文件版本；未执行 API 探针、构建、WASM 导出实测或产品 E2E。历史报告的 CI/发行资产/性能不作为本轮实时证据。

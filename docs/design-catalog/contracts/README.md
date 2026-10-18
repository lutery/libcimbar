# 接收端内部契约 v1

- [详细模块/接口/错误设计](../module-contract-error-matrix.md)：按模块设计、接口契约、异常矩阵顺序组织，10 个核心接口。
- [元数据 JSON Schema](receiver-v1.schema.json)：Draft 2020-12；8 个请求/响应动作、2 个事件；File/ArrayBuffer/Blob 原生类型不在 JSON 内伪装。
- [逐项样例](examples.json)：73 个合成元数据样例，包含全部动作、两种输入、53 项码与真实云桌面 NOT_RUN 示例；所有占位 PASS、路径与哈希不代表运行证据。
- [错误码登记](error-codes.json)：53 项，保留 owner/category/scenario/message/retryAction/callerAction/logLevel/alert。
- [初始安全配置](profile-initial.json)：单实例单在途帧、像素/产物预算与诊断看门狗；不是用户性能承诺，待首轮测量校准。
- [契约检查结果](../contracts-qa.md)：结构校验、负向样例、错误码和 AC 追踪，与产品运行验证分开。

外部文档通过 Context7 核对：[JSON Schema 组合](https://json-schema.org/understanding-json-schema/reference/combining)、[条件约束](https://json-schema.org/understanding-json-schema/reference/conditionals)、[Worker postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage)、[结构化克隆](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)、[Zstd 流式解压](https://facebook.github.io/zstd/zstd_manual.html)。原浏览器抓屏和保存 API 证据沿用 [sources.md](../sources.md)。

接口为本地模块/Worker/测试记录契约，不新增 HTTP 业务 API。元数据通过 schema 不代表真实原生载荷、用户动作、严格结束、文件哈希或现场行为已通过。

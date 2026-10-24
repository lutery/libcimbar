# UX内部契约导航

本目录只冻结接收器体验v2的内部元数据，原receiver-v1 schema与错误登记保持原字节。没有新增HTTP服务或通用RPC框架。

- [完整模块/接口/异常设计](../module-contract-error-matrix.md)：六个核心动作、责任与调用顺序。
- [机器schema](ux-telemetry.schema.json)：20个definitions；目标definition见样例条目。Worker可选`uxObservation`、FrameInput、ViewSnapshot与旧公开Snapshot分开。
- [显示配置](ux-display-config.json)：12桶×250ms、1000ms预热、5000ms数据等待、8000ms无增长、1500ms慢帧提示等设计参数；不是实测SLA。
- [内部诊断](ux-diagnostics.json)：19001～19015，全部不导致接收失败；不能放进旧v1 Error或frame_error。
- [27个字段级样例](examples.json)：按UX-01～06归属。样例中的文件/比例/时间是设计元数据，不是实际接收证据。
- [44个形状正负向量](validation-vectors.json)：另列12个NOT_RUN实现/真实操作要求，不把它们算作通过。
- [文档检查工具](check-contracts.py)：验证schema、样例、向量、唯一诊断、原v1隔离与冻结JSON语义指纹；兼容CRLF/格式变化，不是产品测试工具。

从仓库根执行：

```powershell
python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py
```

依赖当前环境已有jsonschema；本轮没有添加产品依赖或锁文件。新字段在真实JS调用中仍需有限数值、当前会话所有权、顺序、真实artifact及IO检查；JSON形状通过不能证明这些事实。

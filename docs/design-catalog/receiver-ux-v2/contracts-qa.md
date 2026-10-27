# 阶段2.5契约检查

日期：2026-10-23，基线`9e4fbc46965de42b9b0097ad80c607d71c7303f0`。检查对象为本阶段设计文件，不是新产品实现。

## 实际执行

`python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py`，exit0。使用当前环境已有jsonschema 4.23.0，未添加产品依赖。

| 项 | 结果 |
|---|---|
| Schema结构/引用 | 2020-12 check_schema通过，20 definitions，本地引用完整，无远程schema下载 |
| 字段样例 | 27/27形状通过，覆盖UX-01～06请求、返回与关键视图 |
| 正反向量 | 44/44符合预期接受/拒绝，含错误版本、未知字段、非法字节、假完成、多流不一致与UX/v1码混用 |
| 内部诊断 | 15个唯一数值/名称，19001～19015；全部fatalToReception=false，与原码无重叠 |
| 旧v1隔离 | 原有效Snapshot正例通过；向Snapshot加UX、向stats加UX、向Error放190xx三个反例均被旧schema拒绝 |
| 原契约语义与兼容 | 两份原v1文件规范化JSON指纹不变；重排缩进/CRLF后指纹一致，避免仅因Windows检出换行误判接口变化 |
| 配置一致性 | 12×250ms=3000ms；1000ms预热、1500ms慢帧、1024字节/8流上限与文档一致 |
| 接口/矩阵/追踪 | 六个动作都有所有者、字段、幂等、超时/重试；15码均在主矩阵；AC-015～024逐项追踪 |

另实跑既有`node docs/requirements/receiver-ux-v2/probes/report-capability.cjs`，exit0：真实交付WASM重复块0.030303不增长、新块0.0606061增长、多流报告无ID；仍只是合成数据包的能力核验。

## 当前工作区保护

本阶段不修改web/、src/、tools/、product/与旧运行证据。原文件当前字节SHA-256保持：

- receiver-v1.schema.json：`b2996c8440591cf94f56b1c339c01fc1c8cc59e67b6f5b03b74a22a5eb31744d`。
- 原error-codes.json：`5a93bf224108509565fc8d630741a1442c77455df211b18d9d253131cf6c2f7f`。
- v1流水线归档：`582787ba6bd0c34d4023e20ef60d055f4b756ef337b875f47279a9e4d625b220`。

## 没有执行或没有证明的内容

validation-vectors中的12类implementationCases仍NOT_RUN。形状检查不能证明去重/时间窗口数学、当前session/Worker真实身份、保存产物/IO、计时器释放、无障碍和真实窗口布局。没有新产品单测/E2E、性能A/B或新浏览器视觉检查；阶段2的浏览器不可用限制仍记录于qa.md。

需要后续TDD/集成/真实E2E落实：旧会话/重复帧、单流到多流锁定、3秒窗口边界、普通/慢inFlight、取消/写入/close失败、录像耗尽、真实抓屏/录像/外部SHA与本地/现场分列。不能将上述待执行要求计为产品PASS。

## 完成判据

本阶段“完成”指模块责任、字段与局部返回、退化/原业务错误区分、所有权/时序约束和可校验元数据已足够供任务规划使用。12类未来实现验证及H-03/04不因此关闭；其工作应进入阶段3/4.x计划。

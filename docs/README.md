# 文档导航

## 当前迭代：接收器体验 v2（2026-10-23）

- [需求分析导航](requirements/receiver-ux-v2/README.md)：用户已现场成功传输文件，本轮聚焦是否在接收、速度、进度和操作反馈。
- [代码可行性与真实WASM探针](requirements/receiver-ux-v2/feasibility.md)：可复用已有进度接口；指标含义与降级边界明确。
- [已确认需求](requirements/receiver-ux-v2/requirements-spec.md) / [范围决策](requirements/receiver-ux-v2/open-questions.md)：Q-001已确认，系统设计与模块契约已完成；产品尚未实施。
- [系统设计与交互原型](design-catalog/receiver-ux-v2/README.md)：增量架构、9张图、18种演示状态及AC追踪。
- [模块/接口/异常契约](design-catalog/receiver-ux-v2/module-contract-error-matrix.md)：阶段2.5；保留原公开v1，新增内部UX观测与15项非致命诊断。
- [v2交付路线图](plans/receiver-ux-v2/roadmap.md)：阶段3；4 Epic、8 Story、23 Task和3个相对实施迭代，真实操作/性能/外审/现场责任分明。
- [v2逐步骤实施计划](plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md)：阶段4；36项五类任务、35调度批次、文件/步骤/命令及冻结性能方法；尚未编码。
- [v2测试规划](tests/receiver-ux-v2/README.md)：阶段4.5/4.7；80条单元/工具用例、8组集成、10组验收定义、12份仅骨架；39条真实旅程（本地32/现场7），24条AC均有追踪。仅规划，无新产品验收结果。
- [v2真实E2E计划](tests/receiver-ux-v2/e2e-user-journey-plan.md) / [运行手册](tests/receiver-ux-v2/e2e-runbook.md) / [阶段5交接](tests/receiver-ux-v2/handoff.md)：节点5前规划已完成，用户已选通道A，Claude从阶段5实施。
- [v2规划导航与检查](plans/receiver-ux-v2/README.md)：依赖、10AC/12类实现验证追踪、旧证据保护；产品任务尚未执行。
- [当前流水线状态](dev-pipeline/pipeline-state.json)：receiver-ux-v2；各phase.output_dir指向本轮目录。
- [上一版本完成状态快照](dev-pipeline/history/desktop-receiver-v1/pipeline-state.json)：v1原状态按原字节保留，旧规格/计划/证据仍在原路径；新反馈不自动代填旧现场矩阵。

## 原始材料

- [项目完整性审计与云桌面录屏可行性分析](cloud-desktop-screen-capture-feasibility.md)：2026-10-16 历史静态分析报告，作为本轮需求输入；不是产品验收结果。
- [报告源文件与维护工具](src/README.md)：报告由 `src/parts/` 组装生成，修改报告需遵循这里的说明。

## 上一版本 v1 的开发前段流程（历史导航）

以下条目保留上一版本规划时的文字与路径；其中“尚未运行/尚未实现”等属于历史规划口径。v1阶段完成情况以[归档状态](dev-pipeline/history/desktop-receiver-v1/pipeline-state.json)及其交付/审查记录为准，新迭代从上方导航进入。

- [需求规格](requirements/requirements-spec.md)：已归并用户全部回答的宿主机接收端需求，含双输入、最小变更与测试交接。
- [问题与回答](requirements/open-questions.md)：Q-001～Q-006 均已处理，保留用户原始回答；后测项见需求规格 V-001～V-004。
- [决策记录](requirements/decision-log.md)：已知事实、分析决策及未批准建议。
- [本阶段 Todo](requirements/todo.md)：材料读取、产物检查与需求确认进度。
- [系统设计目录](design-catalog/README.md)：宿主机双输入接收架构、4 个流程、概念对象与状态/交互图，全文嵌入 11 张 Mermaid 图。
- [架构与决策](design-catalog/architecture.md)：复用边界、会话隔离、EOF、保存重试与全部 AC 落点。
- [设计检查](design-catalog/qa.md)：语法、嵌入、链接与追踪结果，区分文档 QA 和产品验证。
- [模块契约与异常矩阵](design-catalog/module-contract-error-matrix.md)：阶段 2.5 详细设计，包含模块所有权、接口/消息 schema、异常号段和必要适配边界。
- [机器可读契约导航](design-catalog/contracts/README.md)：schema、样例、错误登记、配置及检查结果。
- [交付路线图](plans/roadmap.md)：5 Epic、10 Story、24 Task、4个相对Sprint，依赖/DoD/AC、测试、里程碑和回滚。
- [逐步骤实施计划](plans/2026-10-18-desktop-receiver-implementation.md)：阶段4，24任务具体文件/步骤/验证命令/预期/AC，严格EOF先于双输入完整验收。
- [TDD与真实E2E规划](tests/README.md)：阶段4.5/4.7，54单元用例、6集成组、26真实操作旅程及仅骨架；当前产品测试均NOT RUN。
- [真实操作测试与验收方案](plans/test-acceptance-plan.md)：阶段4必读；20组本地、6组集成、6组现场用例，实际选择器/录像/保存、外部SHA-256、恢复及最终包验证；当前产品测试均未运行。
- [规划导航与续接](plans/README.md)：规划QA、任务进度及Claude双通道交接说明。
- [上一版本流水线快照](dev-pipeline/history/desktop-receiver-v1/pipeline-state.json)：v1已完成11阶段；历史规划与后续执行记录分开阅读。

所有阶段产物与原始报告分别维护。系统设计、模块契约和任务规划在对应阶段通过确认后生成。

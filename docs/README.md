# 文档导航

## 原始材料

- [项目完整性审计与云桌面录屏可行性分析](cloud-desktop-screen-capture-feasibility.md)：2026-10-16 历史静态分析报告，作为本轮需求输入；不是产品验收结果。
- [报告源文件与维护工具](src/README.md)：报告由 `src/parts/` 组装生成，修改报告需遵循这里的说明。

## 开发前段流程

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
- [流水线状态](dev-pipeline/pipeline-state.json)：按更新版由Codex完成节点5前的全部规划，标准续接定位team-exec（阶段5）；阶段5及以后仍pending，由用户在Claude中启动。

所有阶段产物与原始报告分别维护。系统设计、模块契约和任务规划在对应阶段通过确认后生成。

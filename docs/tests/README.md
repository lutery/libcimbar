# 测试规划导航

## 当前迭代：接收器体验 v2

[v2测试规划导航](receiver-ux-v2/README.md)：阶段4.5/4.7已完成，80条单元/工具用例、8组集成、10组验收义务、12份防误跑骨架及39条真实旅程（本地32/现场7）。[运行手册](receiver-ux-v2/e2e-runbook.md)与[交接清单](receiver-ux-v2/handoff.md)供Claude阶段5续接；新产品测试均未运行。

## v1历史规划

以下保留上一版本编码前的Codex阶段4.x计划/骨架与当时NOT RUN状态；v1后续结果见[历史流水线](../dev-pipeline/history/desktop-receiver-v1/pipeline-state.json)和对应运行证据，不能把历史规划口径当作本轮执行报告。

- [TDD测试计划](test-plan.md)：54单元用例、6集成组、26真实操作E2E；工具、红绿循环、隔离与门禁。
- [用例登记](test-cases.md) / [机读规划清单](planning-cases.json)：全部初始NOT_RUN，执行者null；计划清单不是IF-010运行Evidence。
- [单元测试骨架](unit-test-skeletons/README.md)：8份JS TODO骨架与1份有编译防护的C++文本模板，不计已实现测试。
- [集成与验收定义](acceptance-tests.md)：真WASM/Worker、故障注入、实际本地操作、最终包和用户现场分别放行。
- [真实E2E旅程](e2e-user-journey-plan.md)：E2E-1～20本地实施方执行；E2E-21～26用户真实云桌面执行；14AC计划覆盖。
- [规划QA](planning-qa.md)：仅检查文档、追踪、状态和骨架语法，不证明产品通过。
- [可复现规划检查脚本](planning-check.py)：`python docs/tests/planning-check.py --expect-ready`，只执行文档QA与骨架node --check。
- [真实操作验收基线](../plans/test-acceptance-plan.md)：UAT-L/IAT/FAT的详细失败判据与证据。
- [逐步骤实施计划](../plans/2026-10-18-desktop-receiver-implementation.md)：目标文件与CMD-01～10；目标工具当前尚未实现。

未来实际运行另建`runs/<runId>/`，有时间/执行者/源码和资产摘要/参数/外部哈希及真实proof。现场手册/空回执是阶段5任务T5.2.a的交付目标，当前不预填执行结果。

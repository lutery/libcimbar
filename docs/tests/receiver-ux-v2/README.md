# 接收器体验 v2 — 测试规划导航

阶段4.5 TDD与阶段4.7真实E2E规划已完成，用户已选择通道A；Claude从阶段5team-exec续接，未实现/运行新产品测试。

- [39条真实操作旅程](e2e-user-journey-plan.md)：本地32条、用户现场7条，保留旧26条原定义，覆盖原14条及新增10条AC。
- [真实运行手册](e2e-runbook.md)：SRC-01源画面装置、长样本、原生系统窗口、保存后时点、外部SHA、Narrator和冻结A/B方法。
- [E2E机器计划](planning-cases.json)、[E2E覆盖](coverage-map-e2e.json)、[E2E-18十腿矩阵](cases/e2e18-matrix.json)、[仅规划自动化大纲](e2e-skeletons/real-journeys.mjs)。
- E2E源：[原26](cases/e2e-legacy.json)、[接收/保存9](cases/e2e-receive.json)、[界面/性能/现场4](cases/e2e-experience.json)；[生成器](e2e-catalog.py)、[检查器](check-e2e-plan.py)、[QA](e2e-qa.md)、[Todo](e2e-todo.md)、[交接清单](handoff.md)。

- [测试方案](test-plan.md)：TDD顺序、模块/任务与真实证据边界、未来执行命令及覆盖策略。
- [80条单元/工具用例](test-cases.md)：Given/When/Then、具体断言、数据、Task/AC/R/诊断及预期业务RED。
- [8组集成与10组验收义务定义](acceptance-tests.md)：原链路组合、真实操作出口与不能用mock替代的部分；不是4.7逐步骤方案。
- [12份仅规划骨架](unit-test-skeletons/README.md)：全部带误运行拒绝守卫，每例尚需真实断言，不注册正式runner。
- [数据与时钟配方](fixtures.md)、[覆盖映射](coverage-map.json)、[机器索引](test-index.json)。
- 机器源：[核心34](cases/core.json)、[体验24](cases/experience.json)、[工具22](cases/tooling.json)、[集成](cases/integration.json)、[验收义务](cases/acceptance.json)；[文档生成器](catalog.py)。
- [本阶段Todo](todo.md)、[实际规划检查](tdd-qa.md)、[检查脚本](check-tdd.py)。
- 前置：[实施计划](../../plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md)、[内部契约](../../design-catalog/receiver-ux-v2/module-contract-error-matrix.md)、[冻结性能方法](../../plans/receiver-ux-v2/performance-method.json)。
- [当前流水线](../../dev-pipeline/pipeline-state.json)：用户已采用TDD并授权4.7，通道A已确认，入口为team-exec；[交接复核](handoff-qa.md)。

全部case.status=NOT_RUN、executedBy=null。骨架语法与守卫检查通过不能算产品GREEN/真实业务RED。现场仍需用户实际执行，旧E2E-21～26不由本地代填。

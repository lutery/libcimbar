# 接收器体验 v2 — 规划导航

阶段3路线图、阶段4实施计划及阶段4.5/4.7测试规划已完成，用户已选择通道A，Claude从阶段5续接。当前没有新产品实现或验收结果。

- [交付路线图](roadmap.md)：4 Epic、8 Story、23 Task；20项阶段5任务，3项后续外审/交付/现场任务，3个相对实施迭代。
- [逐步骤实施计划](2026-10-24-receiver-ux-implementation.md)：36项任务、五类角色任务与35个调度批次，逐文件/步骤/命令/DoD；不提前执行。
- [冻结性能方法](performance-method.json)：5对同输入A/B、帧往返与Ready耗时、刷新/资源不变式；方法冻结，实测仍NOT_RUN。
- [实施计划检查](implementation-qa.md) / [检查脚本](check-implementation.py) / [阶段4 Todo](implementation-todo.md)。
- [TDD测试规划](../../tests/receiver-ux-v2/README.md)：80条单元/工具用例、8组集成、10组验收定义和12份防误跑骨架，全部产品用例NOT_RUN。
- [规划Todo](todo.md)：只记录本阶段文档工作的进度，不代表产品任务已执行。
- [规划检查记录](planning-qa.md) / [可复跑检查](check-roadmap.py)：依赖、追踪、链接、状态及历史文件保护；不是产品测试。
- [已确认需求](../../requirements/receiver-ux-v2/requirements-spec.md)、[设计与原型](../../design-catalog/receiver-ux-v2/README.md)、[模块契约](../../design-catalog/receiver-ux-v2/module-contract-error-matrix.md)。
- [当前流水线](../../dev-pipeline/pipeline-state.json)：仍由Codex完成阶段4/4.x后再交Claude从阶段5执行；此时不提前交实施。

[39条真实操作计划](../../tests/receiver-ux-v2/e2e-user-journey-plan.md)、[运行手册](../../tests/receiver-ux-v2/e2e-runbook.md)及[交接清单](../../tests/receiver-ux-v2/handoff.md)已冻结本地32/用户现场7，通道A已确认。测试产物落本轮独立目录，不覆盖v1文档或旧run。两个输入按钮均保留。

# 接收器体验迭代 v2 — 需求分析

阶段1需求已确认，阶段2/2.5设计、阶段3路线图、阶段4实施计划及4.5 TDD规划已完成；待确认4.7真实E2E计划，尚未编码。

- [原始反馈](user-feedback.md)：2026-10-23用户实测与本轮目标。
- [需求规格](requirements-spec.md)：已确认目标、范围及AC-015～024。
- [代码与可行性](feasibility.md)：当前数据链路、指标含义、已执行WASM探针及限制。
- [问题与回答](open-questions.md)：Q-001已确认，保留用户原话。
- [决策记录](decision-log.md)：事实、建议及未确认项分开记录。
- [Todo](todo.md)：本阶段取证与确认进度。
- [可复现探针](probes/report-capability.cjs) / [实际输出](probes/report-capability-result.json)：真实交付WASM、合成fountain数据包；不等同产品或现场验收。
- [当前流水线](../../dev-pipeline/pipeline-state.json)：本轮状态以phase.output_dir定位v2目录，旧文档保留。
- [上一版本流水线快照](../../dev-pipeline/history/desktop-receiver-v1/pipeline-state.json)：开始新迭代前按原字节归档；旧阶段完成记录不重置在历史中。

本轮沿用11个阶段名称及文件名，使用各phase显式output_dir区分版本。后续规划继续引用旧版AC-001～014，新体验验收使用AC-015起；旧版实现与证据仍在原路径。

后续：[系统设计与界面原型](../../design-catalog/receiver-ux-v2/README.md)、[交付路线图与规划导航](../../plans/receiver-ux-v2/README.md)。

[真实操作验收计划](../../tests/receiver-ux-v2/e2e-user-journey-plan.md)及[阶段5交接清单](../../tests/receiver-ux-v2/handoff.md)已完成规划；原14条和新增10条AC均有旅程追踪。双输入按钮保留，本地/现场分层；当前产品未实施/验收。

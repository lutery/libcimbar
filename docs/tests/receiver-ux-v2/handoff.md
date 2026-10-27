# 接收器体验 v2 — 阶段5交接清单

阶段1/2/2.5/3/4/4.5/4.7规划完成；用户已明确“按照你的推荐选a”，确认通道A标准续接。当前没有本轮产品实现、实测结果或发布批准。

通道A已落盘：Claude使用dev-pipeline读取[当前状态](../../dev-pipeline/pipeline-state.json)，从阶段5 `team-exec` 执行。不要重复阶段4，也不要从旧v1送审总结判定本轮完成。现有docs直接消费，无需生成通道B的.omc契约。阶段5～8的对象仍为pending，由Claude实际接手后更新；入口指针切换不代表研发已经启动或通过。

在Claude Code中打开本仓库并加载dev-pipeline，输入：

```text
继续上次的开发流程。当前迭代是receiver-ux-v2，已选择通道A；读取docs/dev-pipeline/pipeline-state.json和docs/tests/receiver-ux-v2/handoff.md，从阶段5team-exec开始，使用本轮active_*指向的需求、设计、实施及测试计划。
```

[交接复核记录](handoff-qa.md)只验证入口和材料，没有执行产品验收。

## Claude必读的本轮材料

1. [需求/AC-015～024](../../requirements/receiver-ux-v2/requirements-spec.md)、[决策](../../requirements/receiver-ux-v2/decision-log.md)：中文反馈改善，两个输入按钮继续保留。
2. [设计目录](../../design-catalog/receiver-ux-v2/README.md)、[模块契约/错误矩阵](../../design-catalog/receiver-ux-v2/module-contract-error-matrix.md)、[UI规范](../../design-catalog/receiver-ux-v2/ui-spec.md)：不改变协议、严格EOF、预算、single-flight；新遥测不可控制完成/保存。
3. [路线图](../../plans/receiver-ux-v2/roadmap.md)、[36任务/35 Waves实施计划](../../plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md)、[冻结性能方法](../../plans/receiver-ux-v2/performance-method.json)：T1～T6必须先做，唯一并行Wave是T26/T28。
4. [TDD方案](test-plan.md)、[80条用例](test-cases.md)、[8组IAT/10组验收义务](acceptance-tests.md)、[12份仅骨架](unit-test-skeletons/README.md)：落地有意义断言并记录真实RED/GREEN；文档守卫失败不算业务RED。
5. [39条真实旅程](e2e-user-journey-plan.md)、[运行手册](e2e-runbook.md)、[机器清单](planning-cases.json)、[覆盖映射](coverage-map-e2e.json)、[十腿矩阵](cases/e2e18-matrix.json)：本地32/用户现场7，SRC-01实际源画面装置及长样本校准，保存后四时点和外部SHA不可省。

## 实施和送审出口

当前工作树含未提交的本轮全部规划，若建worktree必须完整携带并核SHA；不要只checkout当前HEAD而丢失这些文件，也不覆盖用户其他修改。历史v1状态、原schema、旧run-03与旧裁决只读。ext_rounds=11保留，新独立审查继续下一全局轮次；不得覆盖round-11。

阶段5先实现context/双门禁/测量与真实操作脚本，再按任务TDD实现产品，切片实测后最终候选全量验证。不要运行旧runner默认值向旧目录写证据。测试自动化包括真实系统窗口；不能把DataTransfer或worker注入冒充用户操作。真实UI、Narrator、A/B和大文件矩阵耗时分别留进度，桌面串行。

T36产出本轮阶段5总结与材料索引，明确列：变更/manifest、真实RED/GREEN、UT/IAT、本地32项逐条状态、E2E-18逐腿、A/B原始数据、失败/重试/未运行原因、用户现场7项、最终包复核待办。保留原始失败。根送审索引应定位本轮文件，历史stage5-dev-summary不替代本轮结果。阶段6独立审查只依本轮代码和真实证据裁决；本地通过不能抹掉现场NOT_RUN。

阶段7/8及FIELD按路线图T4.2.b/c/d分责。阶段8执行最终包独立复核，不让阶段5提前包装发布；用户现场输入由用户本人实际操作/提供证据后登记。本轮39项当前均NOT_RUN，规划QA通过不构成产品、现场或发布通过。

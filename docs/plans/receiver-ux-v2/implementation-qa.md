# 阶段4实施计划检查

2026-10-24 · 仅检查规划文档，产品验收仍NOT_RUN。

## 本阶段交付与检查方法

- [逐步骤实施计划](2026-10-24-receiver-ux-implementation.md)：36项阶段5任务、35个依赖/资源批次；含五类任务、逐项files/ac/resources/trace/depends_on、步骤、未来验证命令与DoD。
- [冻结性能方法](performance-method.json)：固定A/B配对、输入锁定时点、判据和缺测/失败政策，不包含实际性能数据。
- [本阶段Todo](implementation-todo.md)、[检查脚本](check-implementation.py)及已更新导航/流水线。
- 检查命令：`python docs/plans/receiver-ux-v2/check-implementation.py`、`python docs/plans/receiver-ux-v2/check-roadmap.py`、`python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py`及`git diff --check`。

## 真实源码核查与实施选择

- 原run-e2e/recorder固定历史目录；stage的RunId不隔离staging。计划A先修一致上下文与下游写入，验收前置。
- 原verify-evidence只看1～20/21～26，v1 Evidence只接收AC-001～014。采用保留旧门禁/旧results、另存UX证据并共同汇总的最小增量，不修改公开v1 schema。
- 读取实际FrameScheduler后确认submitAndWait不触发onResult；实时与录像各自进入消费路径。计划校正了“现有录像重复回调”的可能误读，重复帧防护仍作为幂等要求验证。
- report固定在fountain后、artifact前；当前classic Worker不新增脚本依赖。UI tick不调用已有带副作用render，活动preview维持可呈现。
- 版本1.1.0是兼容新增体验的实施选择；新交付目录只在阶段8创建，迭代名称v2不强制产品SemVer 2.0.0。
- 性能阈值是阶段4预先冻结的回归判断，不是用户吞吐承诺；本轮method的frozen不能代替旧现场E2E-26判据或现场执行。

## 实际检查结果

本次三项Python检查及`git diff --check`均exit0。Git仅提示已有CRLF/LF转换策略，没有空白错误。

| 检查项 | 实际输出 |
|---|---|
| 阶段4计划结构 | 36个连续、未勾选Task，36段步骤/命令/DoD/提交边界；5种任务类型全部存在 |
| 依赖/资源 | 35个Wave；全部前置位于更早Wave、DAG无环；唯一并行T26/T28无共享文件/桌面资源 |
| 追踪 | 路线图20个阶段5任务全映射，3个下游任务独立表；全部10条新AC和12类运行要求有责任任务 |
| 代码片段 | 3段JavaScript通过Node语法检查；只是计划片段语法，未执行产品逻辑 |
| 导航/文件 | 110个本地链接目标存在；本轮规划UTF-8/无替换符/无行末空白 |
| 前阶段复核 | 23项路线图依赖仍无环；20 schema定义、27样例、44形状向量、6接口、15诊断及旧v1隔离检查通过 |
| 保护 | 原v1 schema、错误登记、v1状态归档3个SHA不变；web/src/tools/product与旧运行目录无工作树改动 |
| 流水线 | 阶段4completed；current/awaiting_confirmation为tdd-test-planning，其status仍pending；4.7/5～8未推进、ext_rounds仍11 |

`check-roadmap.py`原先固定阶段4为pending的断言已按本次明确授权更新，允许已记录用户指令的阶段4推进；没有放宽其任务/依赖/AC/旧证据检查。阶段3QA是当时快照，本次110链接和阶段4完成状态以本记录为准。

以上通过不能计为产品单元/集成/E2E/性能/辅助技术/用户现场通过；检查输出明确`productAcceptance=NOT_RUN`。冻结性能JSON仍results=null，未生成任何真实run或改动旧结果。

## 后续未执行义务

4.5如采用，需补完整测试方案与仅骨架；4.7需冻结真实操作步骤、编号/机器计划及证明文件约定，然后交Claude从阶段5实施。本计划36任务均未运行。用户云桌面场景及原21～26仍独立记录，不能由本地代填。阶段5～8保持Claude管理状态和历史轮次，不提前推进。

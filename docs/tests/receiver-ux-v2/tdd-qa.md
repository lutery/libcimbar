# 阶段4.5测试规划检查

日期2026-10-24；只记录设计/文档/骨架保护检查，新产品测试与验收均NOT_RUN。

## 交付范围

80条单元/工具用例、8组集成、10组真实验收义务定义；12份仅规划骨架（11 JS/1 Python），10AC/12运行要求/15诊断追踪；测试方案、夹具配方、机器索引及导航。

Testing Code技能第7节要求独立测试模块并行，核心与体验范围分别规划，工具/集成与真实验收由主工作流补齐。合并后复读具体断言，不凭代理完成消息认定通过。

## 本次复核修正

- UX-UT-049原轨迹若在125ms进入Ready就不能测满一秒节流；现A持续Receiving且有数值变化，B独立重置验证真实业务即时/终结释放，避免空测。
- UX-UT-029明确同桶MAX@250/1@250与跨桶MAX@0/1@250，frameId不同；两者都在250重置rateEpoch，因此1249.9/1250预期一致。
- 保持Client与Scheduler原职责，测试不反向要求改写Client Map；原录像等待路径不重复onResult，不为此重构原正常行为。
- 骨架顶部PLANNING_ONLY以及每例SKELETON_ONLY双守卫，语法/误执行拒绝只作规划QA，不能当业务RED。

## 实际检查

本次`check-tdd.py`、`catalog.py`、阶段3/4检查、设计契约检查及`git diff --check`均exit0。最后一项只提示既有CRLF/LF策略，无空白错误。

| 检查 | 实际结果 |
|---|---|
| 用例与目标 | 80条单元/工具用例（34+24+22），13个目标代码落点；8组集成、10组验收义务，全部NOT_RUN/执行者null |
| 追踪 | 10AC、12类运行要求、15项UX诊断均有责任用例；Task均属于已确认36任务；覆盖JSON由实际用例反查一致 |
| 骨架语法 | 11个JS通过Node --check；1个Python通过AST解析；无产品导入，无skip/todo |
| 误执行保护 | 12份各自启动均非0且命中顶部PLANNING_ONLY，未进入SKELETON_ONLY用例体；这是预期拒绝，不是业务RED |
| 文档投影 | test-cases/acceptance-tests与五份JSON源生成结果逐字一致，索引数量/骨架映射一致 |
| 导航 | 226个本地链接存在；本轮文件UTF-8/无替换符/无行末空白，29个阶段产物存在 |
| 前阶段 | 路线图23任务/实施36任务依赖无环；原20定义/27样例/44向量/6接口/15诊断与v1隔离复验通过 |
| 文件保护 | 旧v1 schema/error/状态归档3项SHA及阶段4性能方法SHA未变；web/src/tools/product/旧runs无工作树差异 |
| 状态保护 | tdd_mode=true、4.5completed，current/awaiting为e2e-planning且其pending；Claude管理的4个阶段指纹不变，ext_rounds=11 |

冻结性能方法SHA-256为`1b281cbf67e968c287d11d27db1d61259c569925bf798b970f99a1f69c910a29`，results仍null。本次Node版本/help核查只确认可用工具选项，不是运行产品覆盖率。

前阶段文档检查中固定“TDD pending”的时点断言已按本次用户授权更新为允许有明确授权/正确确认门的推进；任务/依赖/资源/契约/旧证据检查未放宽。此前QA保留当时快照，本阶段导航/状态以当前记录为准。阶段4.7文件和机器planning-cases尚未创建，没有提前执行下阶段。

检查命令为`python docs/tests/receiver-ux-v2/check-tdd.py`、`python docs/tests/receiver-ux-v2/catalog.py`、既有设计契约/路线图/实施计划文档检查和`git diff --check`。只有骨架语法/误执行守卫会被运行；没有产品导入、样本生成、真实桌面或任何产品测试。

## 未执行义务

80条用例全NOT_RUN；12 implementationCases仍待真实实现验证；性能结果仍null；8组集成/10组验收尚未执行。下一步4.7冻结真实场景与机器计划，之后阶段5才迁移测试/补实断言/RED→实现→GREEN。字段形状/文档或骨架守卫不能证明产品正确。本地/注入/现场/包验仍分列。

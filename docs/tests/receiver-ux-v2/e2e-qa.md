# 阶段4.7真实操作规划检查

2026-10-24。本页只记录本轮规划QA；本轮产品测试/真实验收均NOT_RUN。

下文是阶段4.7完成时的检查快照；随后用户已确认通道A，当前交接状态与复核见[交接记录](handoff-qa.md)。

## 本轮交付与核对

39条真实旅程、140个操作步骤：原26条定义逐字段保持；新增13条（本地12/用户现场1），总计本地32/现场7。三份场景源生成完整Markdown和机器计划，24条AC、12类运行责任、10组验收义务均有映射。80条单元/工具、8组集成、10组验收定义及12份TDD骨架未改写为已执行。

Testing Code第7节要求独立测试模块并行，本阶段分别整理原26条回归和UI/性能/现场场景，主工作流整理接收/保存场景。合并后重新读原定义、当前代码、冻结方法和具体动作，再以机器检查校对，不凭代理报告认定通过。

本轮核对修正：

- 原发送端暂停为短冷却，无法保证8秒；明确SRC-01只操纵源窗口实际视觉内容，真实抓屏，不注入接收数据。必须先校准重复码确实产生data，源画面与输入SHA可追溯。
- 128KiB主录像约数秒完成，不能证明15秒正常推进/30秒Receiving；T6另锁长实时输入。主录像、冻结method及公式不变。旧UI基线A不被要求出现新增UX，候选B须验证新UX，双方原业务约束均必验。
- E2E-1/20最终包步骤/证明从阶段5必需列表拆到独立阶段8块，消除循环前置；最终包与现场仍独立待验。
- E2E-18保持十腿，4MiB难压缩录像必测；仅D-19难压缩20MiB额外腿可带当前代码依据NOT_RUN，其余9腿必须PASS。不再沿用已关闭TD-15上限。
- E2E-15各异常类真实系统选择后分别正常恢复/保存/hash；DataTransfer只证明导入路径。EOF/末帧需真实前缀/尾段对，保存四时点在实际保存后取得。
- E2E-34安全构造本轮目标的系统保存受阻；系统拒绝选取不算应用write/close异常，后者保留IAT责任。真实障碍未发生不能以mock填PASS。
- E2E-37实际Narrator/键盘/焦点，E2E-38原始5对A/B与独立5对实时约束，E2E-39用户真实云桌面双入口，不用DOM/本地结果替代。

## 实际执行的规划检查

以下命令本阶段实际执行并exit0，全部只检查规划或误运行拒绝，不调用产品测试/浏览器/录制：

```powershell
python docs/tests/receiver-ux-v2/e2e-catalog.py
python docs/tests/receiver-ux-v2/check-e2e-plan.py
python docs/tests/receiver-ux-v2/catalog.py
python docs/tests/receiver-ux-v2/check-tdd.py
python docs/plans/receiver-ux-v2/check-implementation.py
python docs/plans/receiver-ux-v2/check-roadmap.py
python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py
git diff --check
```

| 项目 | 实际检查结果 |
|---|---|
| E2E计划 | 39项/140步，本地32、现场7；26原定义精确投影一致；10腿/9必需PASS/1合法例外；全部NOT_RUN/执行者null |
| 追踪 | 24条AC、12运行责任、10组验收义务有机器映射，所有本轮Task属于36项；R-05等注入责任保留UT/IAT边界 |
| 自动化大纲保护 | Node语法检查通过，实际启动被顶部PLANNING_ONLY非0拒绝，39个用例体未进入；不是业务RED或执行39条产品测试 |
| TDD回归 | 80单元/工具、8IAT、10验收定义、13目标模块；11 JS/1 Python骨架语法及12次误运行拒绝通过；覆盖/文档投影一致 |
| 阶段3/4回归 | 4 Epic/8 Story/23路线图任务；实施36任务/35 Waves，20本地任务全映射，依赖无环且同Wave资源无冲突；3个JS配方语法通过 |
| 契约 | 20定义、27样例、44形状向量、6接口、15诊断及v1隔离检查通过；12项运行验证仍NOT_RUN |
| 导航/编码 | 288个本地链接可定位；本轮测试文档UTF-8、无替换符/行末空白；生成计划与源逐字一致 |
| 保护边界 | v1两份公共契约、历史流水线、冻结性能方法SHA保持；4个Claude管理阶段对象指纹不变，ext_rounds=11 |
| 工作树 | web/src/tools/product/旧runs修改为空；git diff --check exit0，仅既有CRLF/LF策略提示；未建立产品运行目录或假results |

阶段3/4/4.5检查器原先只允许4.7 pending；本次按用户明确授权调整为允许4.7 in_progress/completed并校验user_instructions及handoff确认门。未放松产品/历史保护、用例数量、冻结方法、Claude阶段指纹和所有真实验收要求。先前QA中的数量与“待4.7”保留为当时快照，本页是当前规划检查。

## 结论和下一入口

阶段4.7规划完成；当前current_phase=e2e-planning、awaiting_confirmation=handoff、_handoff_mode=not_selected，阶段5～8仍pending。全部本轮产品/现场场景和最终包复核NOT_RUN。等待用户A/B/n选择，推荐A由Claude dev-pipeline从阶段5team-exec继续；不在本阶段实现产品或生成通道B契约。

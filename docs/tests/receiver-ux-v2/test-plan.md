# 接收器体验 v2 — TDD测试方案

阶段4.7补充已落[真实E2E旅程](e2e-user-journey-plan.md)与[运行手册](e2e-runbook.md)；下文为阶段4.5的TDD定义，验收义务的e2eCaseIds=null保留当时定义，具体编号在[独立E2E映射](coverage-map-e2e.json)追踪。产品测试未运行。

2026-10-24 · 阶段4.5 · 用户已确认采用TDD。基线`9e4fbc46965de42b9b0097ad80c607d71c7303f0`。**本文件交付测试规划，所有产品测试/集成/真实验收仍NOT_RUN。**

## 目标与范围

按照[36项实施任务](../../plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md)验证已确认AC-015～024和内部UX-01～06，不改发送端、C++/WASM、公开v1 schema/error、严格EOF/预算/single-flight与原保存规则。双输入按钮保留、主操作中文；速度来自近期编码字节且包含冗余，进度只来自有依据的report估计，产物/写盘仍是真正完成依据。

本轮规划为 **80条单元/工具用例（核心34、体验24、工具22）、8组集成、10组真实验收义务定义、12份仅规划骨架（11 JS、1 Python）**。编号按职责预留区间：UX-UT-001～034、041～064、081～102，空号未被承诺为缺失测试。旧9套产品测试原样保留并扩展，新UX三套注册后正式runner共12套；测试总条数以阶段5实际运行输出为准，不把历史数量或这80条计划当作已执行数量。

权威依据：[已确认需求](../../requirements/receiver-ux-v2/requirements-spec.md)、[模块契约](../../design-catalog/receiver-ux-v2/module-contract-error-matrix.md)、[运行验证向量](../../design-catalog/receiver-ux-v2/contracts/validation-vectors.json)、[界面基准](../../design-catalog/receiver-ux-v2/ui-spec.md)与[冻结性能方法](../../plans/receiver-ux-v2/performance-method.json)。旧AC-001～014及当前批准的原验收矩阵继续回归；不能以新增测试替代它们。

## 分层及证据边界

| 层 | 计划/执行工具 | 能证明什么 | 不能代替什么 |
|---|---|---|---|
| 设计QA | schema/样例、用例索引和骨架语法/拒绝误跑检查 | 形状/追踪/结构一致，规划骨架不会意外绿灯 | 产品实现、业务RED/GREEN、任何用户操作 |
| 单元/工具 | Node内置test/assert；Python unittest/真实CLI临时磁盘自测 | 数学/身份/纯投影/显示生命周期/错误映射，真实校验器拒绝假证据 | 实际捕获、媒体呈现、OS选择器、辅助技术与现场 |
| 集成UX-IAT-01～08 | 实际模块、交付WASM、浏览器模块链路；必要位置明确注入 | 原链路与UX组合，异常不影响业务、门禁/测量接线 | 注入不能升级为真实用户旅程或真实OS失败 |
| 本地真实验收 | 原发送端、正常浏览器、真实抓屏/录像输入、系统保存、外部SHA | 在同一候选上实际体验与完整文件正确性 | 用户云桌面现场、包交付后的入口验证 |
| 最终包/现场 | 阶段8包入口及用户真实云桌面操作 | 对应最终包/真实环境的实际结果 | 未执行项或其它机器/构建的结果 |

80条用例的Given/When/Then、具体断言、fixture、target/skeleton、Task/AC/R/诊断均见[test-cases.md](test-cases.md)及其三份JSON源。集成/验收定义见[acceptance-tests.md](acceptance-tests.md)。scope统一沿既有语义；所有规划初值NOT_RUN、executedBy=null，无真实run目录或PASS记录。

## TDD执行顺序

1. 按实施Waves认领对应测试任务，先读取具体用例及契约。将本轮docs骨架迁到明确的正式target测试位置；已有文件是合并新增用例，不能整文件覆盖已有回归。目标路径由每条case记录和骨架README映射。
2. **先实现实际行为断言与可控夹具**，再删除PLANNING_ONLY/SKELETON_ONLY。骨架守卫、空body、test.skip/todo、无法启动Node/Python或误填路径均不是业务RED。
3. 对未实现的新行为执行定向测试，确认失败原因就是该行为缺失/错误，而不是环境、样本或语法错误；记录命令/测试ID/退出码/实际失败断言。原已正常的回归可以仍GREEN，不能伪称它们新RED。
4. 最小产品实现至GREEN，再重构/审查并保留同一测试断言；不能删断言、放宽边界、替换实际函数为测试内实现或更改冻结判据追绿。每次受影响用例复跑，按原任务边界提交。
5. 执行相关集成与真实用户验收；正式runner--all无missing/0test/skip/todo，所有适用门禁检查实际证据。新UX套件必须显式注册，docs骨架永不注册。

阶段5TDD记录建议落`docs/dev-pipeline/receiver-ux-v2/tdd-ledger.json`：每条有caseId、taskId、red/green/refactor实际命令及日志、sourceRevision、productManifestSha256、实际断言差异、执行日期。只有实际运行后才填写，不写入任何当前执行记录；test-plan本身不作为产品证据。

## 模块与执行任务

| 分组 | 用例 | 主要实施任务 | 实现/测试落点 |
|---|---|---|---|
| Worker/Client/Session/模型 | UX-UT-001～034 | T7/8/10、T14～19、T34 | 原worker/client/session套件+新ux-telemetry |
| 视图/显示/保存/媒体/中文 | UX-UT-041～064 | T7/9/10、T20～27、T31/34 | 原save/video/ui+新ux-view/ux-display |
| 运行隔离/双门禁 | UX-UT-081～095 | T1～6、T10、T36 | 新run-context测试及UX evidence自测，原门禁仍实际调用 |
| 性能观测器 | UX-UT-096～102 | T28/30/31 | 新measure-ux工具测试；正式A/B在T31 |
| 集成 | UX-IAT-01～08 | 具体见集成定义 | 实际模块/浏览器/真实WASM或明确IAT注入 |
| 真实验收 | UX-AT-01～10 | T13/25/31/34～36及后续FIELD | 4.7细化为真实E2E场景，旧1～26不重编号 |

开发、测试、自审、整改、验收五类任务沿阶段4原Waves执行；本阶段的测试模块并行规划不改变实施中的文件/桌面资源互斥。相同app/session/client/model/test文件不能并改；真实桌面/剪贴板/端口/OS选择器任务串行，不杀用户窗口。

## 数据、时钟与独立预期

[fixtures.md](fixtures.md)规定样本与计时器、临时磁盘和性能原始值的来源。纯数学用手动单调clock/可控timer；Worker绝对时间与Date审计不混入速率数学。实际计数、query与finish均按真实owner/seq/frame过滤。

特别需要独立数值预期：

- UX-UT-025：epoch=0，t0/249.9/250/2999.9/3000分别10/20/30/40/50B；t2999.9保留100B、速率100000/2999.9；t3000淘汰桶0后120B、分母2750ms、速率480/11。浮点允许1e-9明确误差，不能调用实现求expected。
- UX-UT-029：同桶MAX@250和1@250（不同frameId），跨桶MAX@0和1@250，两独立fixture都在250溢出重置；1249.9预热、1250为active0，receivingAt仍0。
- UX-UT-049：轨迹A在Receiving持续到1000ms且数值可见变化，半开区间[0,1000)至多4次、相邻写入至少250ms；轨迹B重置后125ms真实Ready/保存，验证业务即时与显示timer释放。不能在A提前Ready导致节流测试空测。
- UX-UT-097：Bready=1000→C≤1350；B RTT p50=10→C≤12；B p95=20→C≤25，边界等号通过，+0.001ms失败。p50/p95为每轮nearest-rank后再取5轮中位数。

1000ms预热、1500ms慢帧、5000ms无data、8000ms可信比例未增、媒体未知duration、close失败/长pending等必须有边界两侧的实际断言。真实浏览器的1000ms取证容差不能放宽单元数学；后台节流单独记录，返回前台重新投影。

## 覆盖策略与质量判据

全部10条新AC、12类运行验证和15个UX诊断都需有责任用例；**规划覆盖不等于执行覆盖**。关键路径按行为逐项100%落实：report局部退化、单流/多流/回退、桶/溢出、时钟/所有权、无snapshot计时、节流/按钮即时、真artifact/EOF、保存取消/write/close/pending、旧owner、媒体呈现、真实入口/SHA及双门禁。

新增三个纯UX模块目标至少80%行覆盖，关键分支必须实测；报告实际行/分支/函数数据及未覆盖说明，不能以覆盖率替代上述关键断言/真实用户验收，也不通过镜像实现或无意义测试填数字。原9套全部保留；旧功能正确的用例不强制重新制造RED。自审复核最少一个“故意删除UX帧去重/把比例>=1当完成/允许缺UX结果”的受控反例能被对应正式测试抓住，变异仅在临时副本或恢复前明确受控，不留到产品。

性能遵循阶段4冻结方法：主数值5对同录像，5对30秒实时行为，原始样本/环境/输入/WASM/观测器SHA与产品manifest匹配；不足/失败不绿。原实时busy合法丢采样不变，新UX不增队列/并发。测量器本身需正/反自测；方法frozen不能替代实测，也不能代原现场E2E-26判据。

隐私/生命周期：新增观测不上传数据；集成中监测UX操作不产生新远程fetch/XHR/beacon/socket，原资源加载白名单不误判；审查diff无新遥测服务。模块内部字段不进入旧公开v1 Snapshot/Error，诊断仍只本地190xx非致命，不吞原业务错误。

## 未来阶段5命令与预期

本机仅核对过Node `v22.23.1`及help存在覆盖率选项，未执行以下产品测试；新命令/套件必须先按相应实施任务实现。

```powershell
# 迁移并完成对应真实断言后，定向RED/GREEN（不是运行docs骨架）
node --test --test-name-pattern="UX-UT-025" web/desktop-recv/tests/unit/ux-telemetry.test.mjs
# 最终12套显式runner，无缺失/零用例/skip/todo
node tools/desktop-recv/run-unit.mjs --all
# 覆盖率作为补充，不能替代--all或真实E2E
node --test --experimental-test-coverage --test-coverage-include="web/desktop-recv/src/ux-*.js" web/desktop-recv/tests/unit/ux-telemetry.test.mjs web/desktop-recv/tests/unit/ux-view.test.mjs web/desktop-recv/tests/unit/ux-display.test.mjs
# T1～3及T28先实现目标与正式测试，再运行
node --test tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/measure-ux.test.mjs
python tools/desktop-recv/tests/ux-evidence-selftest.py
python tools/desktop-recv/verify-evidence-selftest.py
```

RED预期为对应功能失败且可定位，GREEN为真实断言通过并无skip/todo；样本缺失或环境失败另列阻塞，不作为业务RED。正常浏览器/真实OS对话框无法操作时补实际手工执行并留证，未执行保持NOT_RUN。

## 退出与后续阶段

阶段4.5完成指：测试范围、用例、任务/AC/R/诊断追踪、骨架防误跑、集成和真实验收义务定义足够指导实施；不指产品测试通过。[本阶段QA](tdd-qa.md)只记录这些文档检查。

下一步阶段4.7编制逐条真实E2E用户操作方案：冻结起点、步骤/分支/预期、场景编号、计划机器字段、真实选择器和证明文件；在4.5不创建e2e-user-journey-plan/planning-cases假装4.7已完成。之后按标准通道交Claude从阶段5执行；阶段6独立审查与最终包/用户现场仍分层。

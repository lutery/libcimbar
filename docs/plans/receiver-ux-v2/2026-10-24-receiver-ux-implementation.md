# Receiver UX v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 保留实时抓屏和录像导入，让中文使用者可靠理解接收活动、近期数据识别速率、重建估计、用时与保存恢复。

**Architecture:** 原会话/Worker/产物/保存IO继续裁决业务；新增有界内部观测模型、纯视图和独立显示时钟。report为可选旁路，进度不决定完成，新旧证据使用分开的记录与共同验收出口。

**Tech Stack:** 现有原生JS ES modules、classic Worker、交付WASM、Node内置测试、Python证据工具、PowerShell、现有普通Edge/CDP与系统选择器；不升级依赖。

---

2026-10-24 · 阶段4计划 · 基线`9e4fbc46965de42b9b0097ad80c607d71c7303f0`。**36项实施任务全部未执行**，本阶段未改产品代码。预估沿用路线图3个相对迭代和T-shirt规模，未获得团队人数/迭代长度，不编造总工时。

上方是writing-plans标准头；实际下游入口遵循本项目`dev-pipeline`：本轮所选4.5/4.7规划完成后由Claude从阶段5`team-exec`按本计划调度，不在本阶段调用执行技能，也不新增安装superpowers依赖。当前工作树已有本轮规划产物，原位继续编写文档；阶段5如建立隔离worktree，先按原字节携带已确认的本轮文档/状态，不能切换到缺少计划的HEAD或覆盖用户修改。

## Inputs and invariants

- 权威输入：[需求](../../requirements/receiver-ux-v2/requirements-spec.md)、[原始反馈](../../requirements/receiver-ux-v2/user-feedback.md)、[路线图](roadmap.md)、[模块契约](../../design-catalog/receiver-ux-v2/module-contract-error-matrix.md)、[界面](../../design-catalog/receiver-ux-v2/ui-spec.md)、[架构](../../design-catalog/receiver-ux-v2/architecture.md)。共同反馈标识为`FB-UX-001`（是否在接收/速度/进度）及`FB-UX-002`（两个按钮必须保留），来源原始反馈和已确认范围。
- 原AC-001～014仍是回归约束，新AC-015～024为体验增量。原v1 schema/error字节、C++/WASM、发送端、预算/模式、single-flight、严格EOF和真实保存规则不改。
- UX-01～06、19001～19015、12×250ms窗口、1000ms预热、1500/5000/8000ms提示和所有权语义以阶段2.5为准。没有新的HTTP/RPC服务、框架、UI模拟进度或自动重启。
- `FrameScheduler.submitAndWait`明确不触发onResult；录像和实时分别进入同一消费函数，**不声称当前录像必然重复计数**。重复帧/迟到帧仍需幂等防护和测试，不能借机重构正常调度。
- 历史`run-01/02/03`只读；实际run名称在执行时生成。下文`<candidateRun>`等为路径模板，所有`$...`变量须从经校验的context载入，不能直接复制占位命令即运行旧默认入口。

## File boundaries

| 落点 | 精确责任 | 限制 |
|---|---|---|
| `web/desktop-recv/worker/decoder-worker.js` | UX-M1：局部readReport、可选uxObservation | 保持classic Worker与现有ensure_buffer；不加REQUIRED_EXPORTS、不改C++ |
| `web/desktop-recv/src/decoder-client.js` | 原pending携带owner/真实post时点及只读查询 | 不新增消息、队列、并发或看门狗 |
| `web/desktop-recv/src/session.js` | UX-M2调用、真实状态开始/终结、UX只读获取 | 内部方法可增，原公开Snapshot/stats/转换保持 |
| `web/desktop-recv/src/ux-telemetry.js`（新增） | ReceiverTelemetry：UX-02/03/05/06、有界桶/歧义/保存owner | 纯逻辑，无DOM、WASM、系统窗口 |
| `web/desktop-recv/src/ux-view.js`（新增） | UX-M3：readView、文案/格式/状态优先级 | 纯投影，原controls透传，不写业务状态 |
| `web/desktop-recv/src/ux-display.js`（新增） | UX-M4：当前seq刷新、DOM差量/语义播报/清理 | tick不能调用原app.render；无新抓帧/保存 |
| `web/desktop-recv/src/app.js` | 接原UI事件、媒体位置、点击时save owner与纯显示 | 保留既有诊断/EOF/preview生命周期，选择器仍由真实点击 |
| `web/desktop-recv/index.html`、`styles.css`、`src/ui.js`、`README.md` | 中文/布局/可访问性/操作说明 | 双输入、停止/保存id与互锁保留；旧英文展示断言按等价语义更新 |
| `web/desktop-recv/tests/unit/{ux-telemetry,ux-view,ux-display}.test.mjs`（新增）及原相关测试 | 新语义与原行为回归 | 三套显式注册到`tools/desktop-recv/run-unit.mjs`，最终共12套，不能有skip/todo |
| `tools/desktop-recv/e2e/run-context.mjs`、`verify-ux-evidence.py`（新增）及原runner/stage/recorder | 统一新运行上下文与旧+新总门禁 | 原v1 Evidence只装旧AC，UX证据单独存；未实现case拒绝，不能空跑PASS |
| `tools/desktop-recv/e2e/measure-ux.mjs`、`tests/{run-context,measure-ux}.test.mjs`、`tests/ux-evidence-selftest.py`（新增） | 开发期运行隔离、测量和拒绝假绿验证 | 不进用户包，不引入运行时开关或外部依赖 |
| `docs/tests/receiver-ux-v2/`、`docs/dev-pipeline/receiver-ux-v2/` | 4.5/4.7计划、实施期验证映射/审查/送审 | 本阶段不预填测试执行；根送审索引保留历史再加本轮定位 |

## Tasks（全量任务清单，checkbox 逐一跟进）

- [ ] T1 [test] 运行上下文与新旧门禁的先行失败测试
      files: tools/desktop-recv/tests/run-context.test.mjs, tools/desktop-recv/tests/ux-evidence-selftest.py
      ac: AC-021, AC-024
      resources: files:tools/desktop-recv/tests
      trace: Roadmap-T4.1.a; design: module-contract-error-matrix.md UX-03、UX-06与v1隔离; feedback: FB-UX-001, FB-UX-002
      depends_on: -
- [ ] T2 [dev] 隔离运行/构建/样本及新UX验收汇总入口
      files: tools/desktop-recv/e2e/run-context.mjs, tools/desktop-recv/e2e/run-e2e.mjs, tools/desktop-recv/e2e/record-sender.mjs, tools/desktop-recv/e2e/evidence.mjs, tools/desktop-recv/stage.ps1, tools/desktop-recv/verify-ux-evidence.py, tools/desktop-recv/e2e/README.md
      ac: AC-021, AC-024
      resources: files:tools/desktop-recv
      trace: Roadmap-T4.1.a; design: module-contract-error-matrix.md 不变式、v1隔离与UX-M4; feedback: FB-UX-001, FB-UX-002
      depends_on: T1
- [ ] T3 [test] 隔离工具对抗与旧契约回归
      files: tools/desktop-recv/tests/run-context.test.mjs, tools/desktop-recv/tests/ux-evidence-selftest.py, tools/desktop-recv/verify-evidence-selftest.py
      ac: AC-021, AC-024
      resources: files:tools/desktop-recv/tests; files:tools/desktop-recv/verify-evidence-selftest.py
      trace: Roadmap-T4.1.a; design: module-contract-error-matrix.md v1隔离、异常退化总则; feedback: FB-UX-001, FB-UX-002
      depends_on: T2
- [ ] T4 [self-review] 审查工具写入与证据门禁
      files: docs/dev-pipeline/receiver-ux-v2/review-tools.md
      ac: AC-021, AC-024
      resources: files:docs/dev-pipeline/receiver-ux-v2/review-tools.md
      trace: Roadmap-T4.1.a; design: module-contract-error-matrix.md 不变式及原v1适配; feedback: FB-UX-001, FB-UX-002
      depends_on: T3
- [ ] T5 [self-fix] 修复工具审查问题并复验
      files: tools/desktop-recv/e2e/run-context.mjs, tools/desktop-recv/e2e/run-e2e.mjs, tools/desktop-recv/e2e/record-sender.mjs, tools/desktop-recv/e2e/evidence.mjs, tools/desktop-recv/stage.ps1, tools/desktop-recv/verify-ux-evidence.py, tools/desktop-recv/tests, docs/dev-pipeline/receiver-ux-v2/review-tools.md
      ac: AC-021, AC-024
      resources: files:tools/desktop-recv; files:docs/dev-pipeline/receiver-ux-v2/review-tools.md
      trace: Roadmap-T4.1.a; design: module-contract-error-matrix.md v1隔离、全部不变式; feedback: FB-UX-001, FB-UX-002
      depends_on: T4
- [ ] T6 [acceptance] 建立可复现输入、隔离基线和初始测量
      files: docs/tests/runs/<baselineRun>/run-context.json, docs/tests/runs/<baselineRun>/environment.json, docs/tests/runs/<baselineRun>/baseline-observation.json, docs/tests/runs/<candidateRun>/run-context.json
      ac: AC-023, AC-024
      resources: desktop; clipboard; ports; staging; run-output
      trace: Roadmap-T4.1.b; design: module-contract-error-matrix.md H-03/H-04、生命周期边界; feedback: FB-UX-001, FB-UX-002
      depends_on: T5
- [ ] T7 [test] 报告、帧所有权及独立时钟的RED用例
      files: web/desktop-recv/tests/unit/worker.test.mjs, web/desktop-recv/tests/unit/client.test.mjs, web/desktop-recv/tests/unit/session.test.mjs, web/desktop-recv/tests/unit/ux-telemetry.test.mjs, web/desktop-recv/tests/unit/ux-view.test.mjs, web/desktop-recv/tests/helpers/worker-vm.mjs
      ac: AC-015, AC-016, AC-018, AC-021, AC-023
      resources: files:web/desktop-recv/tests
      trace: Roadmap-T1.1.a, Roadmap-T1.1.b, Roadmap-T1.2.b; design: module-contract-error-matrix.md UX-01/02/03/04/05; feedback: FB-UX-001, FB-UX-002
      depends_on: T6
- [ ] T8 [dev] 接入Worker报告、原pending时间及会话观测
      files: web/desktop-recv/worker/decoder-worker.js, web/desktop-recv/src/decoder-client.js, web/desktop-recv/src/session.js, web/desktop-recv/src/ux-telemetry.js
      ac: AC-015, AC-016, AC-018, AC-021, AC-023
      resources: files:web/desktop-recv/worker/decoder-worker.js; files:web/desktop-recv/src/decoder-client.js; files:web/desktop-recv/src/session.js; files:web/desktop-recv/src/ux-telemetry.js
      trace: Roadmap-T1.1.a, Roadmap-T1.1.b; design: module-contract-error-matrix.md UX-01/02/03/05、FrameSubmissionMeta; feedback: FB-UX-001, FB-UX-002
      depends_on: T7
- [ ] T9 [dev] 只读视图和不驱动解码的显示时钟
      files: web/desktop-recv/src/ux-view.js, web/desktop-recv/src/ux-display.js, web/desktop-recv/src/app.js, web/desktop-recv/index.html, web/desktop-recv/styles.css
      ac: AC-015, AC-018, AC-020, AC-021, AC-022, AC-023
      resources: files:web/desktop-recv/src/ux-view.js; files:web/desktop-recv/src/ux-display.js; files:web/desktop-recv/src/app.js; files:web/desktop-recv/index.html; files:web/desktop-recv/styles.css
      trace: Roadmap-T1.2.a; design: module-contract-error-matrix.md UX-04/05、UX-M3/4及中文状态优先级; feedback: FB-UX-001, FB-UX-002
      depends_on: T8
- [ ] T10 [test] 切片集成与显式套件注册
      files: tools/desktop-recv/run-unit.mjs, web/desktop-recv/tests/unit/ux-telemetry.test.mjs, web/desktop-recv/tests/unit/ux-view.test.mjs, web/desktop-recv/tests/unit/ux-display.test.mjs, web/desktop-recv/tests/unit/session.test.mjs
      ac: AC-015, AC-018, AC-021, AC-023
      resources: files:tools/desktop-recv/run-unit.mjs; files:web/desktop-recv/tests/unit
      trace: Roadmap-T1.2.b; design: module-contract-error-matrix.md UX-02/03/04/05、R-01/02/10/11; feedback: FB-UX-001, FB-UX-002
      depends_on: T9
- [ ] T11 [self-review] 审查首条接收反馈切片
      files: docs/dev-pipeline/receiver-ux-v2/review-slice.md
      ac: AC-015, AC-016, AC-018, AC-020, AC-021, AC-022, AC-023
      resources: files:docs/dev-pipeline/receiver-ux-v2/review-slice.md
      trace: Roadmap-T1.1.a, Roadmap-T1.1.b, Roadmap-T1.2.a, Roadmap-T1.2.b; design: module-contract-error-matrix.md UX-01～05及不变式; feedback: FB-UX-001, FB-UX-002
      depends_on: T10
- [ ] T12 [self-fix] 修复实时切片问题
      files: web/desktop-recv/src, web/desktop-recv/worker/decoder-worker.js, web/desktop-recv/tests, docs/dev-pipeline/receiver-ux-v2/review-slice.md
      ac: AC-015, AC-016, AC-018, AC-020, AC-021, AC-022, AC-023
      resources: files:web/desktop-recv; files:docs/dev-pipeline/receiver-ux-v2/review-slice.md
      trace: Roadmap-T1.1.a, Roadmap-T1.1.b, Roadmap-T1.2.a, Roadmap-T1.2.b; design: module-contract-error-matrix.md UX-01～05; feedback: FB-UX-001, FB-UX-002
      depends_on: T11
- [ ] T13 [test+acceptance] 真实抓屏→中文反馈→保存的第一条闭环
      files: docs/tests/runs/<sliceRun>/proof, docs/tests/runs/<sliceRun>/ux-results.json, tools/desktop-recv/e2e/run-e2e.mjs, tools/desktop-recv/e2e/source-scene.mjs
      ac: AC-015, AC-018, AC-020, AC-024
      resources: desktop; clipboard; ports; staging; run-output; files:tools/desktop-recv/e2e/run-e2e.mjs; files:tools/desktop-recv/e2e/source-scene.mjs
      trace: Roadmap-T1.2.c; design: module-contract-error-matrix.md 实时流程及UX-04/05; feedback: FB-UX-001, FB-UX-002
      depends_on: T12
- [ ] T14 [test] 窗口数学、状态阈值与报告歧义RED
      files: web/desktop-recv/tests/unit/ux-telemetry.test.mjs, web/desktop-recv/tests/unit/ux-view.test.mjs
      ac: AC-016, AC-017, AC-018, AC-023
      resources: files:web/desktop-recv/tests/unit/ux-telemetry.test.mjs; files:web/desktop-recv/tests/unit/ux-view.test.mjs
      trace: Roadmap-T2.1.a, Roadmap-T2.1.b, Roadmap-T2.1.c; design: module-contract-error-matrix.md UX-03窗口定义、UX-04优先级、R-03～08; feedback: FB-UX-001, FB-UX-002
      depends_on: T13
- [ ] T15 [dev] 实现真实近期速率、重建估计与健康提示
      files: web/desktop-recv/src/ux-telemetry.js, web/desktop-recv/src/ux-view.js
      ac: AC-016, AC-017, AC-018, AC-023
      resources: files:web/desktop-recv/src/ux-telemetry.js; files:web/desktop-recv/src/ux-view.js
      trace: Roadmap-T2.1.a, Roadmap-T2.1.b; design: module-contract-error-matrix.md UX-03、UX-04、全部固定配置; feedback: FB-UX-001, FB-UX-002
      depends_on: T14
- [ ] T16 [test] 实现R-01～08对抗与真实WASM报告验证
      files: web/desktop-recv/tests/unit/worker.test.mjs, web/desktop-recv/tests/unit/ux-telemetry.test.mjs, web/desktop-recv/tests/unit/ux-view.test.mjs, web/desktop-recv/tests/browser/ux-observation.mjs, docs/dev-pipeline/receiver-ux-v2/runtime-case-map.json
      ac: AC-015, AC-016, AC-017, AC-018, AC-021, AC-023
      resources: files:web/desktop-recv/tests; files:docs/dev-pipeline/receiver-ux-v2/runtime-case-map.json
      trace: Roadmap-T2.1.c; design: module-contract-error-matrix.md UX-01～05、R-01～08; feedback: FB-UX-001, FB-UX-002
      depends_on: T15
- [ ] T17 [self-review] 审查指标含义和有界实现
      files: docs/dev-pipeline/receiver-ux-v2/review-metrics.md
      ac: AC-016, AC-017, AC-018, AC-023
      resources: files:docs/dev-pipeline/receiver-ux-v2/review-metrics.md
      trace: Roadmap-T2.1.a, Roadmap-T2.1.b, Roadmap-T2.1.c; design: module-contract-error-matrix.md UX-03/04与19001～19015; feedback: FB-UX-001, FB-UX-002
      depends_on: T16
- [ ] T18 [self-fix] 整改指标问题并保留原始失败
      files: web/desktop-recv/src/ux-telemetry.js, web/desktop-recv/src/ux-view.js, web/desktop-recv/tests, docs/dev-pipeline/receiver-ux-v2/review-metrics.md
      ac: AC-016, AC-017, AC-018, AC-023
      resources: files:web/desktop-recv/src/ux-telemetry.js; files:web/desktop-recv/src/ux-view.js; files:web/desktop-recv/tests; files:docs/dev-pipeline/receiver-ux-v2/review-metrics.md
      trace: Roadmap-T2.1.a, Roadmap-T2.1.b, Roadmap-T2.1.c; design: module-contract-error-matrix.md UX-03/04; feedback: FB-UX-001, FB-UX-002
      depends_on: T17
- [ ] T19 [test+acceptance] 隔离浏览器IAT核验真实报告与时钟反馈
      files: docs/tests/runs/<metricsRun>/iat-results.json, docs/dev-pipeline/receiver-ux-v2/runtime-case-map.json, tools/desktop-recv/e2e/run-e2e.mjs
      ac: AC-015, AC-016, AC-017, AC-018, AC-021, AC-023
      resources: desktop; ports; staging; run-output; files:tools/desktop-recv/e2e/run-e2e.mjs
      trace: Roadmap-T2.1.c; design: module-contract-error-matrix.md UX-01～05、R-01～08/10/11; feedback: FB-UX-001, FB-UX-002
      depends_on: T18
- [ ] T20 [test] 录像、保存owner与异常恢复RED
      files: web/desktop-recv/tests/unit/video.test.mjs, web/desktop-recv/tests/unit/save.test.mjs, web/desktop-recv/tests/unit/session.test.mjs, web/desktop-recv/tests/unit/ux-view.test.mjs, web/desktop-recv/tests/unit/ux-display.test.mjs
      ac: AC-019, AC-020, AC-021, AC-022, AC-024
      resources: files:web/desktop-recv/tests/unit
      trace: Roadmap-T2.2.a, Roadmap-T2.2.b, Roadmap-T2.2.c; design: module-contract-error-matrix.md UX-04/05/06、R-06/09/10; feedback: FB-UX-001, FB-UX-002
      depends_on: T19
- [ ] T21 [dev] 接通独立录像位置和真实保存阶段
      files: web/desktop-recv/src/app.js, web/desktop-recv/src/session.js, web/desktop-recv/src/ux-telemetry.js, web/desktop-recv/src/ux-view.js
      ac: AC-019, AC-020, AC-021, AC-022
      resources: files:web/desktop-recv/src/app.js; files:web/desktop-recv/src/session.js; files:web/desktop-recv/src/ux-telemetry.js; files:web/desktop-recv/src/ux-view.js
      trace: Roadmap-T2.2.a, Roadmap-T2.2.b; design: module-contract-error-matrix.md UX-04/05/06及SaveRequest; feedback: FB-UX-001, FB-UX-002
      depends_on: T20
- [ ] T22 [test] 媒体与保存全链路集成
      files: web/desktop-recv/tests/unit/video.test.mjs, web/desktop-recv/tests/unit/save.test.mjs, web/desktop-recv/tests/unit/session.test.mjs, web/desktop-recv/tests/unit/ux-display.test.mjs, web/desktop-recv/tests/browser/ux-observation.mjs, docs/dev-pipeline/receiver-ux-v2/runtime-case-map.json
      ac: AC-019, AC-020, AC-021, AC-024
      resources: files:web/desktop-recv/tests; files:docs/dev-pipeline/receiver-ux-v2/runtime-case-map.json
      trace: Roadmap-T2.2.c; design: module-contract-error-matrix.md UX-05/06、R-02/06/09/10; feedback: FB-UX-001, FB-UX-002
      depends_on: T21
- [ ] T23 [self-review] 审查录像呈现与保存所有权
      files: docs/dev-pipeline/receiver-ux-v2/review-media-save.md
      ac: AC-019, AC-020, AC-021, AC-024
      resources: files:docs/dev-pipeline/receiver-ux-v2/review-media-save.md
      trace: Roadmap-T2.2.a, Roadmap-T2.2.b, Roadmap-T2.2.c; design: module-contract-error-matrix.md UX-04/05/06; feedback: FB-UX-001, FB-UX-002
      depends_on: T22
- [ ] T24 [self-fix] 整改媒体与保存问题
      files: web/desktop-recv/src/app.js, web/desktop-recv/src/session.js, web/desktop-recv/src/ux-telemetry.js, web/desktop-recv/src/ux-view.js, web/desktop-recv/tests, docs/dev-pipeline/receiver-ux-v2/review-media-save.md
      ac: AC-019, AC-020, AC-021, AC-024
      resources: files:web/desktop-recv; files:docs/dev-pipeline/receiver-ux-v2/review-media-save.md
      trace: Roadmap-T2.2.a, Roadmap-T2.2.b, Roadmap-T2.2.c; design: module-contract-error-matrix.md UX-04/05/06; feedback: FB-UX-001, FB-UX-002
      depends_on: T23
- [ ] T25 [test+acceptance] 真实录像及保存取消重试闭环
      files: docs/tests/runs/<mediaRun>/proof, docs/tests/runs/<mediaRun>/ux-results.json, tools/desktop-recv/e2e/run-e2e.mjs
      ac: AC-019, AC-020, AC-021, AC-024
      resources: desktop; clipboard; ports; staging; run-output; files:tools/desktop-recv/e2e/run-e2e.mjs
      trace: Roadmap-T2.2.c; design: module-contract-error-matrix.md 录像流程、保存恢复流程; feedback: FB-UX-001, FB-UX-002
      depends_on: T24
- [ ] T26 [test] 中文布局与可访问反馈RED
      files: web/desktop-recv/tests/unit/ux-display.test.mjs, web/desktop-recv/tests/unit/ui.test.mjs
      ac: AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-022, AC-023
      resources: files:web/desktop-recv/tests/unit/ux-display.test.mjs; files:web/desktop-recv/tests/unit/ui.test.mjs
      trace: Roadmap-T3.1.a; design: module-contract-error-matrix.md ui-spec自适应/可访问性与UX-04; feedback: FB-UX-001, FB-UX-002
      depends_on: T25
- [ ] T27 [dev] 实现最终中文主界面与恢复建议
      files: web/desktop-recv/index.html, web/desktop-recv/styles.css, web/desktop-recv/src/app.js, web/desktop-recv/src/ui.js, web/desktop-recv/src/ux-view.js, web/desktop-recv/src/ux-display.js, web/desktop-recv/package.json, web/desktop-recv/README.md
      ac: AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-022, AC-023
      resources: files:web/desktop-recv
      trace: Roadmap-T3.1.a; design: module-contract-error-matrix.md ui-spec全部、UX-04、内部诊断退化; feedback: FB-UX-001, FB-UX-002
      depends_on: T26
- [ ] T28 [dev+test] 实现只用于开发验收的A/B观测器
      files: tools/desktop-recv/e2e/measure-ux.mjs, tools/desktop-recv/tests/measure-ux.test.mjs, tools/desktop-recv/e2e/README.md
      ac: AC-023, AC-024
      resources: files:tools/desktop-recv/e2e/measure-ux.mjs; files:tools/desktop-recv/tests/measure-ux.test.mjs; files:tools/desktop-recv/e2e/README.md
      trace: Roadmap-T3.2.a; design: module-contract-error-matrix.md H-03、UX-04刷新与单在途; feedback: FB-UX-001, FB-UX-002
      depends_on: T25, T6
- [ ] T29 [self-review] 审查最终UI与性能测量方法实现
      files: docs/dev-pipeline/receiver-ux-v2/review-ui-perf.md
      ac: AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-022, AC-023, AC-024
      resources: files:docs/dev-pipeline/receiver-ux-v2/review-ui-perf.md
      trace: Roadmap-T3.1.a, Roadmap-T3.2.a, Roadmap-T3.2.b; design: module-contract-error-matrix.md ui-spec、UX-04/05与H-03/04; feedback: FB-UX-001, FB-UX-002
      depends_on: T27, T28
- [ ] T30 [self-fix] 整改UI及测量实现问题
      files: web/desktop-recv, tools/desktop-recv/e2e/measure-ux.mjs, tools/desktop-recv/tests/measure-ux.test.mjs, docs/dev-pipeline/receiver-ux-v2/review-ui-perf.md
      ac: AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-022, AC-023, AC-024
      resources: files:web/desktop-recv; files:tools/desktop-recv/e2e/measure-ux.mjs; files:tools/desktop-recv/tests/measure-ux.test.mjs; files:docs/dev-pipeline/receiver-ux-v2/review-ui-perf.md
      trace: Roadmap-T3.1.a, Roadmap-T3.2.a, Roadmap-T3.2.b; design: module-contract-error-matrix.md UX-01～06、ui-spec; feedback: FB-UX-001, FB-UX-002
      depends_on: T29
- [ ] T31 [test+acceptance] 真实浏览器、键盘/辅助技术及同输入A/B
      files: docs/tests/runs/<candidateRun>/proof/ui, docs/tests/runs/<candidateRun>/measurements/ux-overhead, docs/tests/runs/<candidateRun>/ux-results.json, tools/desktop-recv/e2e/run-e2e.mjs
      ac: AC-018, AC-019, AC-020, AC-022, AC-023, AC-024
      resources: desktop; clipboard; ports; staging; run-output; files:tools/desktop-recv/e2e/run-e2e.mjs
      trace: Roadmap-T3.1.b, Roadmap-T3.2.a; design: module-contract-error-matrix.md H-03/H-04、ui-spec及UX-04/05; feedback: FB-UX-001, FB-UX-002
      depends_on: T30
- [ ] T32 [self-review] 最终候选全量内部审查
      files: docs/dev-pipeline/receiver-ux-v2/review-final.md
      ac: AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-024
      resources: files:docs/dev-pipeline/receiver-ux-v2/review-final.md
      trace: Roadmap-T3.2.b; design: module-contract-error-matrix.md 全部契约、ui-spec与H-03/04; feedback: FB-UX-001, FB-UX-002
      depends_on: T31
- [ ] T33 [self-fix] 最终审查整改与受影响验证
      files: web/desktop-recv, tools/desktop-recv, docs/dev-pipeline/receiver-ux-v2/review-final.md
      ac: AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-024
      resources: files:web/desktop-recv; files:tools/desktop-recv; files:docs/dev-pipeline/receiver-ux-v2/review-final.md
      trace: Roadmap-T3.2.b; design: module-contract-error-matrix.md 全部冻结设计; feedback: FB-UX-001, FB-UX-002
      depends_on: T32
- [ ] T34 [test] 最终构建的全部单元/集成及资产回归
      files: docs/tests/runs/<candidateRun>/logs, docs/dev-pipeline/receiver-ux-v2/runtime-case-map.json, docs/tests/runs/<candidateRun>/run-context.json, tools/desktop-recv/stage.ps1
      ac: AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-024
      resources: desktop; ports; staging; run-output; files:tools/desktop-recv/stage.ps1
      trace: Roadmap-T1.2.b, Roadmap-T2.1.c, Roadmap-T2.2.c, Roadmap-T3.2.b; design: module-contract-error-matrix.md UX-01～06及R-01～11; feedback: FB-UX-001, FB-UX-002
      depends_on: T33
- [ ] T35 [test+acceptance] 新构建全量旧E2E与新UX真实旅程
      files: docs/tests/runs/<candidateRun>/results.json, docs/tests/runs/<candidateRun>/ux-results.json, docs/tests/runs/<candidateRun>/proof, tools/desktop-recv/e2e/run-e2e.mjs, tools/desktop-recv/e2e/source-scene.mjs
      ac: AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-024
      resources: desktop; clipboard; ports; staging; run-output; files:tools/desktop-recv/e2e/run-e2e.mjs; files:tools/desktop-recv/e2e/source-scene.mjs
      trace: Roadmap-T4.1.c; design: module-contract-error-matrix.md 全部用户流程、AC及R-12; feedback: FB-UX-001, FB-UX-002
      depends_on: T34
- [ ] T36 [acceptance] 复核双门禁、候选说明与阶段5送审索引
      files: docs/dev-pipeline/receiver-ux-v2/stage5-dev-summary.md, docs/dev-pipeline/receiver-ux-v2/runtime-case-map.json, docs/tests/runs/<candidateRun>/reproduction.md, docs/tests/runs/<candidateRun>/release-candidate-manifest.json, web/desktop-recv/README.md, docs/dev-pipeline/stage5-dev-summary.md
      ac: AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-024
      resources: files:docs/dev-pipeline/receiver-ux-v2; run-output; git-index; files:docs/dev-pipeline/stage5-dev-summary.md
      trace: Roadmap-T3.2.c, Roadmap-T4.2.a; design: module-contract-error-matrix.md AC闭环、v1隔离与全部用户流程; feedback: FB-UX-001, FB-UX-002
      depends_on: T35

## Waves（依赖 × 资源二维分层；同 Wave 无资源冲突的任务可并行，跨 Wave 或同资源串行）

- Wave 1（串行）: T1
- Wave 2（串行）: T2
- Wave 3（串行）: T3
- Wave 4（串行）: T4
- Wave 5（串行）: T5
- Wave 6（串行）: T6
- Wave 7（串行）: T7
- Wave 8（串行）: T8
- Wave 9（串行）: T9
- Wave 10（串行）: T10
- Wave 11（串行）: T11
- Wave 12（串行）: T12
- Wave 13（串行）: T13
- Wave 14（串行）: T14
- Wave 15（串行）: T15
- Wave 16（串行）: T16
- Wave 17（串行）: T17
- Wave 18（串行）: T18
- Wave 19（串行）: T19
- Wave 20（串行）: T20
- Wave 21（串行）: T21
- Wave 22（串行）: T22
- Wave 23（串行）: T23
- Wave 24（串行）: T24
- Wave 25（串行）: T25
- Wave 26（并行）: T26, T28
- Wave 27（串行）: T27
- Wave 28（串行）: T29
- Wave 29（串行）: T30
- Wave 30（串行）: T31
- Wave 31（串行）: T32
- Wave 32（串行）: T33
- Wave 33（串行）: T34
- Wave 34（串行）: T35
- Wave 35（串行）: T36

仅Wave 26的T26/T28可并行：一个改产品UI测试，另一个改独立性能工具，文件不重叠且都不占桌面。其他Wave按依赖串行。Wave是调度批次，不是要求增加人员或创建代理；同任务内RED→GREEN→复核的步骤也顺序执行。

`desktop`包括桌面/正常浏览器/真实对话框，`ports`是本轮实际进程清单（常见8771/8790/8811/9445/9452/9453），不同时争用；`staging`和`run-output`只指本轮命名目录。只终止本轮记录的服务PID和浏览器配置实例，不能按端口/进程名杀用户窗口。所有提交另独占`git-index`，并行任务不得同时git add/commit。

## Step-by-step execution

每条编号动作保持单一目的；耗时的真实E2E按4.7场景逐条运行并持续写进度，不将数小时运行假设为一个短小编码步骤。涉及新命令的任务必须先实现并验证帮助/拒绝路径，再使用命令执行。以下验证命令均为**未来阶段5要运行**，本阶段没有执行产品验证。

### T1 — 运行上下文与新旧门禁的先行失败测试

**Files:** `tools/desktop-recv/tests/run-context.test.mjs`、`tools/desktop-recv/tests/ux-evidence-selftest.py`。接线与完整约束见配方A。

**Step 1:** 先按4.5选定用例建立临时目录测试：缺run、历史run根、目录越界/同构建根、漏传recorder上下文均拒绝；写入只命中新根。

**Step 2:** 建立新门禁负例：旧20项均绿但缺任一新UX项、错manifest/attempt、相同元数据假哈希、local代field、额外未规划项均失败；旧v1 Evidence仍按旧schema。

**Step 3:** 先运行 node --test tools/desktop-recv/tests/run-context.test.mjs，再运行 python tools/desktop-recv/tests/ux-evidence-selftest.py；预期因尚无run-context/UX汇总实现而失败，记录原因；不是基础环境故障。

**验证命令（本阶段未运行）：**

```powershell
node --test tools/desktop-recv/tests/run-context.test.mjs
python tools/desktop-recv/tests/ux-evidence-selftest.py
```

**Expected / DoD:** 先有可定位的RED；T2/T3后全部正例通过、反例被拒绝。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `test: specify isolated UX run and gate boundaries`，操作按配方R；若NO_CHANGE不造空提交。

### T2 — 隔离运行/构建/样本及新UX验收汇总入口

**Files:** `tools/desktop-recv/e2e/run-context.mjs`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/record-sender.mjs`、`tools/desktop-recv/e2e/evidence.mjs`、`tools/desktop-recv/stage.ps1`、`tools/desktop-recv/verify-ux-evidence.py`、`tools/desktop-recv/e2e/README.md`。接线与完整约束见配方A。

**Step 1:** 实现不可变RunContext，新增显式--context；所有路径先解析/校验再产生副作用，缺上下文不回退旧run。stage增加-StagingRoot，仅复制本轮构建，不写共享staging。

**Step 2:** 沿run-e2e→record-sender→proof/fixture/result/诊断/本轮启动副本等完整传播上下文。旧probe/smoke入口标历史用途并禁止当v2验收入口；不重写整个自动化框架。

**Step 3:** 实现verify-ux-evidence：旧results.json交既有verify-evidence.py，UX单列ux-results.json并逐项检查本轮冻结计划、实际文件、构建/attempt及全部必测ID。保留原v1 schema/error及gate逻辑；新增上下文/证据结构见配方A。

**Step 4:** 运行T1正负例至GREEN；帮助文本标明新参数，--case未知/必需参数缺失退出非0，不能先启动浏览器再报参错。

**验证命令（本阶段未运行）：**

```powershell
node --test tools/desktop-recv/tests/run-context.test.mjs
python tools/desktop-recv/tests/ux-evidence-selftest.py
python tools/desktop-recv/verify-evidence-selftest.py
```

**Expected / DoD:** 隔离与门禁测试通过；旧门禁自测仍通过，未启动真实桌面。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `feat: isolate receiver UX execution and evidence`，操作按配方R；若NO_CHANGE不造空提交。

### T3 — 隔离工具对抗与旧契约回归

**Files:** `tools/desktop-recv/tests/run-context.test.mjs`、`tools/desktop-recv/tests/ux-evidence-selftest.py`、`tools/desktop-recv/verify-evidence-selftest.py`。接线与完整约束见配方A。

**Step 1:** 补充大小写/分隔符/中文空格、绝对路径、旧目录、错caseType/证明路径、同case不同attempt覆盖等真正风险；不做与实现逐行相同的测试。

**Step 2:** 临时目录实际写入并核对旧run清单SHA不变；验证只允许显式恢复同一manifest/attempt，跨构建禁止续写。

**Step 3:** 分别运行工具测试、旧证据自测及设计契约检查，保存原始命令/退出码。

**验证命令（本阶段未运行）：**

```powershell
node --test tools/desktop-recv/tests/run-context.test.mjs
python tools/desktop-recv/tests/ux-evidence-selftest.py
python tools/desktop-recv/verify-evidence-selftest.py
python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py
```

**Expected / DoD:** 新工具正负例及旧契约通过，无历史目录改动。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `test: reject stale and incomplete UX run claims`，操作按配方R；若NO_CHANGE不造空提交。

### T4 — 审查工具写入与证据门禁

**Files:** `docs/dev-pipeline/receiver-ux-v2/review-tools.md`。接线与完整约束见配方R。

**Step 1:** 逐个追踪工具写入根、子进程参数、原证据不可覆盖和新UX项真正参与总门禁。

**Step 2:** 核查新UX证据未塞入旧v1 Evidence/错误枚举，所有非0退出传播；检查未操作用户浏览器窗口/外部服务。

**Step 3:** 记录问题/原因/建议修改、位置及复验标准；无问题也列出审查文件与命令。

**验证命令（本阶段未运行）：**

```powershell
git diff --check
```

**Expected / DoD:** 审查记录完整；任何阻断问题进入T5。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `docs: review UX execution isolation`，操作按配方R；若NO_CHANGE不造空提交。

### T5 — 修复工具审查问题并复验

**Files:** `tools/desktop-recv/e2e/run-context.mjs`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/record-sender.mjs`、`tools/desktop-recv/e2e/evidence.mjs`、`tools/desktop-recv/stage.ps1`、`tools/desktop-recv/verify-ux-evidence.py`、`tools/desktop-recv/tests`、`docs/dev-pipeline/receiver-ux-v2/review-tools.md`。接线与完整约束见配方R。

**Step 1:** 按T4问题逐条修复并补最小反例；无问题时记录NO_CHANGE及依据，不制造无意义提交。

**Step 2:** 重跑T3完整验证；检查最终工具不会默认执行历史run，完成受影响路径复核后关闭阻断项。

**验证命令（本阶段未运行）：**

```powershell
node --test tools/desktop-recv/tests/run-context.test.mjs
python tools/desktop-recv/tests/ux-evidence-selftest.py
python tools/desktop-recv/verify-evidence-selftest.py
```

**Expected / DoD:** 阻断0；历史文件未变。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `fix: resolve UX runner review findings`，操作按配方R；若NO_CHANGE不造空提交。

### T6 — 建立可复现输入、隔离基线和初始测量

**Files:** `docs/tests/runs/<baselineRun>/run-context.json`、`docs/tests/runs/<baselineRun>/environment.json`、`docs/tests/runs/<baselineRun>/baseline-observation.json`、`docs/tests/runs/<candidateRun>/run-context.json`。接线与完整约束见配方A,F。

**Step 1:** 使用HEAD基线完整资产包/已有v1已验包建立只读baseline staging，候选用独立root；本轮先不更改产品字节。记录前端/worker/config/WASM摘要、系统/浏览器/源/视口及旧契约SHA。

**Step 2:** 按旧reproduction.md在新根生成基础/扩展样本和真实录像，原已追踪样本可只读复制并核SHA；不重写历史随机同名样本。先校准128KiB随机录像可正常重建且≥30帧，锁定输入SHA与媒体。

**Step 3:** 按配方F做基线预检/原始时序记录，确认可测量；这不是候选性能PASS。填实际上下文与本轮阈值文件摘要，检查普通浏览器/真实对话框可用，端口含9452/9453按实际装置清单锁定。

**验证命令（本阶段未运行）：**

```powershell
node tools/desktop-recv/verify-assets.mjs --root $baselineReceiver
python tools/desktop-recv/create-fixtures.py --root $candidateRun --seed 20261018 --extended
```

**Expected / DoD:** 资产核验通过，实际样本/录像与SHA存在，输入基线可重现；条件缺失则NOT_RUN且不进入产品实施。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `docs: record receiver UX baseline and fixtures`，操作按配方R；若NO_CHANGE不造空提交。

### T7 — 报告、帧所有权及独立时钟的RED用例

**Files:** `web/desktop-recv/tests/unit/worker.test.mjs`、`web/desktop-recv/tests/unit/client.test.mjs`、`web/desktop-recv/tests/unit/session.test.mjs`、`web/desktop-recv/tests/unit/ux-telemetry.test.mjs`、`web/desktop-recv/tests/unit/ux-view.test.mjs`、`web/desktop-recv/tests/helpers/worker-vm.mjs`。接线与完整约束见配方B,C,D。

**Step 1:** 建立缺导出/截断/异常/多流报告、有data无报告、artifact之前读report的顺序断言，VM仅作为IAT，不声称真实WASM。

**Step 2:** 增加真实post前时间、旧seq/重复frame不应用、begin幂等、无snapshot时间推进、结束清理用例。

**Step 3:** 按配方B/C最小代码接口先写实断言，直接node --test运行新增文件得到预期RED；不能用test.todo/skip造绿。

**验证命令（本阶段未运行）：**

```powershell
node --test web/desktop-recv/tests/unit/worker.test.mjs web/desktop-recv/tests/unit/client.test.mjs web/desktop-recv/tests/unit/session.test.mjs web/desktop-recv/tests/unit/ux-telemetry.test.mjs web/desktop-recv/tests/unit/ux-view.test.mjs
```

**Expected / DoD:** 新行为用例RED可定位，既有用例不被删除/放松。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `test: specify receiver observation ownership`，操作按配方R；若NO_CHANGE不造空提交。

### T8 — 接入Worker报告、原pending时间及会话观测

**Files:** `web/desktop-recv/worker/decoder-worker.js`、`web/desktop-recv/src/decoder-client.js`、`web/desktop-recv/src/session.js`、`web/desktop-recv/src/ux-telemetry.js`。接线与完整约束见配方B,C。

**Step 1:** 按配方B将可选readReport直接置于classic Worker内，复用现有ensure_buffer生命周期，不新增importScripts依赖或REQUIRED_EXPORTS。仅在0n/正值后、build_artifact前读。

**Step 2:** 在Client原pending加入绑定当前session的提交元数据与只读获取方法；响应时盖主线程时刻，保留原消息和Promise/看门狗结算。

**Step 3:** Session持有每seq观测模型，在真实Receiving begin、已校验当前帧accept、真实终结finish；实时scheduler.onResult与录像submitAndWait的await路径分别进入原_onFrameResult，并非当前录像天然重复回调；人工重复同帧按frameId拒绝UX计数，原状态路径不重构。

**Step 4:** 模型的最小初始视图只提供可证实的等待/数据/用时，尚未实现指标显示unavailable；执行T7用例至GREEN。

**验证命令（本阶段未运行）：**

```powershell
node --test web/desktop-recv/tests/unit/worker.test.mjs web/desktop-recv/tests/unit/client.test.mjs web/desktop-recv/tests/unit/session.test.mjs web/desktop-recv/tests/unit/ux-telemetry.test.mjs
```

**Expected / DoD:** 可选旁路失败不影响业务；元数据随原pending清理；新/旧相关用例通过。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `feat: observe receiver data without changing decoding`，操作按配方R；若NO_CHANGE不造空提交。

### T9 — 只读视图和不驱动解码的显示时钟

**Files:** `web/desktop-recv/src/ux-view.js`、`web/desktop-recv/src/ux-display.js`、`web/desktop-recv/src/app.js`、`web/desktop-recv/index.html`、`web/desktop-recv/styles.css`。接线与完整约束见配方C,D。

**Step 1:** 建立专用反馈区域与createUxDisplay，保留原按钮id、文件入口和活动preview；view上下文controls完全取deriveControls。

**Step 2:** 按配方D绑定单调时钟及当前seq，tick只调用readView/paint；业务render仍沿原事件执行，不让tick调用整页render、runFrameLoop或选择器。

**Step 3:** 绘制中文等待/已识别/已用时和真实Ready，保存状态先使用真实原业务反馈；DOM用textContent，按announcementKey播报；短inFlight不闪processing。

**Step 4:** 事件/interval共同节流遥测，终结/visibility/pagehide清理并恢复时投影当前时间；修复T7视图用例至GREEN。

**验证命令（本阶段未运行）：**

```powershell
node --test web/desktop-recv/tests/unit/ux-view.test.mjs
node --check web/desktop-recv/src/app.js
node --check web/desktop-recv/src/ux-display.js
```

**Expected / DoD:** 无事件时间仍前进；停止后无计时器；业务按钮即时，数值≤4Hz。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `feat: show Chinese receiver activity and elapsed time`，操作按配方R；若NO_CHANGE不造空提交。

### T10 — 切片集成与显式套件注册

**Files:** `tools/desktop-recv/run-unit.mjs`、`web/desktop-recv/tests/unit/ux-telemetry.test.mjs`、`web/desktop-recv/tests/unit/ux-view.test.mjs`、`web/desktop-recv/tests/unit/ux-display.test.mjs`、`web/desktop-recv/tests/unit/session.test.mjs`。接线与完整约束见配方C,D。

**Step 1:** 按实际新增文件注册ux-telemetry/ux-view/ux-display三套；对故意缺文件/skip/0测试的临时副本确认runner拒绝，不能仅搜索名称。

**Step 2:** 人工从两个可调用入口重复注入同一结果，证明Session只增加一次字节/观测revision；当前录像submitAndWait不调用onResult，不把它误判为已有重复回调bug。注入频繁snapshot与tick，断言专用区域节流而原按钮不延迟。

**Step 3:** 跑--all并检查每套数量、fail/todo/skipped与退出码；更新运行证据，DOM测试仍标unit_integration。

**验证命令（本阶段未运行）：**

```powershell
node tools/desktop-recv/run-unit.mjs --all
```

**Expected / DoD:** 12套均实际执行，0fail/todo/skip；总测试数以实际为准，不硬填108。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `test: register and integrate UX observation suites`，操作按配方R；若NO_CHANGE不造空提交。

### T11 — 审查首条接收反馈切片

**Files:** `docs/dev-pipeline/receiver-ux-v2/review-slice.md`。接线与完整约束见配方R。

**Step 1:** 复核report读取顺序/局部catch、真实post时点、重复回调计数、无业务revision伪造及老Client兼容降级。

**Step 2:** 核对tick不能触发旧render副作用，活动video保持呈现，真实Ready只由artifact；记录阻断与复验。

**验证命令（本阶段未运行）：**

```powershell
git diff --check
```

**Expected / DoD:** 完整可复查审查记录交T12。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `docs: review real-time UX slice`，操作按配方R；若NO_CHANGE不造空提交。

### T12 — 修复实时切片问题

**Files:** `web/desktop-recv/src`、`web/desktop-recv/worker/decoder-worker.js`、`web/desktop-recv/tests`、`docs/dev-pipeline/receiver-ux-v2/review-slice.md`。接线与完整约束见配方R。

**Step 1:** 按T11逐项最小整改并补反例；无阻断时记录无代码变更，不添加接收自动重试。

**Step 2:** 重跑相关及--all，受影响设计说明同步；阻断关闭才进入桌面切片验收。

**验证命令（本阶段未运行）：**

```powershell
node tools/desktop-recv/run-unit.mjs --all
```

**Expected / DoD:** 阻断0，单元实现通过但真实操作仍待T13。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `fix: converge real-time receiver UX review`，操作按配方R；若NO_CHANGE不造空提交。

### T13 — 真实抓屏→中文反馈→保存的第一条闭环

**Files:** `docs/tests/runs/<sliceRun>/proof`、`docs/tests/runs/<sliceRun>/ux-results.json`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/source-scene.mjs`。接线与完整约束见配方A,G。

**Step 1:** 先依据4.7场景在现有runner增加本任务真实旅程及断言（或按计划人工步骤留证）；保留原系统入口，未知/未实现case必须非0退出，不能空handler记PASS。

**Step 2:** 建立绑定此切片构建的新context/manifest，stage后校验资产；按4.7细化的等待/首个data旅程，用原发送端和真实getDisplayMedia。

依4.7运行手册SRC-01实现/校准仅作用于源窗口的真实视觉测试装置（可新增source-scene.mjs）：显示原发送端真实码PNG、完全空白或恢复实际码流，记录输入/画面SHA和自然尺寸。原发送端暂停只是短暂冷却，不能代替持续8秒控制；不注入接收帧/Worker/report，不进用户交付。未校准成功不能记本旅程PASS。

**Step 3:** 在无有效码时等待≥5秒，转入足够长真实输入，留等待/数据/时长/真实Ready界面时序；不以瞬时完成样本证明中间态。

**Step 4:** 真实系统保存并在应用外核对原/收SHA；以--phase slice保存结果，明确PARTIAL阶段证据，不能进入最终门禁或冒充最终候选完整验收。

**验证命令（本阶段未运行）：**

```powershell
node tools/desktop-recv/e2e/run-e2e.mjs --context $sliceContext --case UX-SLICE
Get-FileHash -LiteralPath $originalFile -Algorithm SHA256
Get-FileHash -LiteralPath $receivedFile -Algorithm SHA256
```

**Expected / DoD:** 真实回传相等；看到规定中间态；切片结果独立，不填最终PASS。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `docs: record first real receiver UX roundtrip`，操作按配方R；若NO_CHANGE不造空提交。

### T14 — 窗口数学、状态阈值与报告歧义RED

**Files:** `web/desktop-recv/tests/unit/ux-telemetry.test.mjs`、`web/desktop-recv/tests/unit/ux-view.test.mjs`。接线与完整约束见配方C。

**Step 1:** 先写0/249.9/250/2999.9/3000ms桶、预热/溢出/异常时间/后台返回、5000/8000/1500ms边界实断言。

**Step 2:** 加入重复比例、多流转单流仍锁、回退锁、新seq恢复、临时坏报告、比例≥1不Ready，按配方C数值示例独立计算预期。

**Step 3:** 运行定向单测，保存新增行为RED；不能用schema通过替代状态数学测试。

**验证命令（本阶段未运行）：**

```powershell
node --test web/desktop-recv/tests/unit/ux-telemetry.test.mjs web/desktop-recv/tests/unit/ux-view.test.mjs
```

**Expected / DoD:** 未实现指标用例RED明确，旧基础切片断言保持。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `test: specify bounded receiver metrics`，操作按配方R；若NO_CHANGE不造空提交。

### T15 — 实现真实近期速率、重建估计与健康提示

**Files:** `web/desktop-recv/src/ux-telemetry.js`、`web/desktop-recv/src/ux-view.js`。接线与完整约束见配方C。

**Step 1:** 按固定12槽和实际跨度实现窗口；数据分支仅累计原bytesDecoded，错误/no_data不加，溢出只重置rateEpoch并保留其他接收事实。

**Step 2:** 实现report可用性与本seq歧义锁，>=1返回enough_data无百分比，完整artifact才complete；无ID不取max/sum。

**Step 3:** 按真实pending年龄及数据/增长时间投影状态优先级、冻结用时及含冗余单位；主单调时间拒绝倒退，readView不写业务revision。

**Step 4:** 运行T14至GREEN，微小正速率显示<0.1 KiB/s而不是0.0。

**验证命令（本阶段未运行）：**

```powershell
node tools/desktop-recv/run-unit.mjs --suite ux-telemetry --suite ux-view
```

**Expected / DoD:** 精确数学/语义断言通过，空间与单次清理有界。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `feat: calculate honest receiver rate and reconstruction estimate`，操作按配方R；若NO_CHANGE不造空提交。

### T16 — 实现R-01～08对抗与真实WASM报告验证

**Files:** `web/desktop-recv/tests/unit/worker.test.mjs`、`web/desktop-recv/tests/unit/ux-telemetry.test.mjs`、`web/desktop-recv/tests/unit/ux-view.test.mjs`、`web/desktop-recv/tests/browser/ux-observation.mjs`、`docs/dev-pipeline/receiver-ux-v2/runtime-case-map.json`。接线与完整约束见配方B,C。

**Step 1:** 用真实WASM报告能力作为正例基线，VM/适配器构造坏导出/坏长度/共享缓冲覆盖与原错误继续；直接喂数据包明确是集成探针。

**Step 2:** 为每个R-01～08建立实际测试ID与证据路径；覆盖数据可用但报告不可用、pending结束清理和多入口重复回调。

**Step 3:** 执行新unit、既有能力探针及浏览器集成入口；浏览器集成在T19通过隔离runner执行，此处不能提前填PASS。

**验证命令（本阶段未运行）：**

```powershell
node tools/desktop-recv/run-unit.mjs --all
node docs/requirements/receiver-ux-v2/probes/report-capability.cjs
```

**Expected / DoD:** 单测与真实WASM探针通过，浏览器IAT在T19实际记录。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `test: verify receiver metric boundaries and report degradation`，操作按配方R；若NO_CHANGE不造空提交。

### T17 — 审查指标含义和有界实现

**Files:** `docs/dev-pipeline/receiver-ux-v2/review-metrics.md`。接线与完整约束见配方R。

**Step 1:** 用独立时间/字节算例复核分母、预热、清槽、溢出与3秒无data归零，检查无无限循环/每帧对象历史增长。

**Step 2:** 复核歧义锁、状态优先级和完整产物判据；检查文案没有把含冗余速率或估计承诺为原文件真实完成比例。

**验证命令（本阶段未运行）：**

```powershell
git diff --check
```

**Expected / DoD:** 阻断与复验均可定位。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `docs: review metric correctness and bounds`，操作按配方R；若NO_CHANGE不造空提交。

### T18 — 整改指标问题并保留原始失败

**Files:** `web/desktop-recv/src/ux-telemetry.js`、`web/desktop-recv/src/ux-view.js`、`web/desktop-recv/tests`、`docs/dev-pipeline/receiver-ux-v2/review-metrics.md`。接线与完整约束见配方R。

**Step 1:** 逐项修复并跑新增反例；不能通过加上限夹值/改阈值/删边界用例掩盖问题。

**Step 2:** 重跑新套件及受影响原套件，更新对抗映射，阻断0后交T19。

**验证命令（本阶段未运行）：**

```powershell
node tools/desktop-recv/run-unit.mjs --all
```

**Expected / DoD:** 指标语义实现通过，未执行项继续NOT_RUN。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `fix: resolve receiver metric review findings`，操作按配方R；若NO_CHANGE不造空提交。

### T19 — 隔离浏览器IAT核验真实报告与时钟反馈

**Files:** `docs/tests/runs/<metricsRun>/iat-results.json`、`docs/dev-pipeline/receiver-ux-v2/runtime-case-map.json`、`tools/desktop-recv/e2e/run-e2e.mjs`。接线与完整约束见配方A,B,C,G。

**Step 1:** 先依据4.7场景在现有runner增加本任务真实旅程及断言（或按计划人工步骤留证）；保留原系统入口，未知/未实现case必须非0退出，不能空handler记PASS。

**Step 2:** 以metrics阶段新context加载真实WASM/browser ux-observation；实际调用新模块，构造报告/时钟故障时标unit_integration，不伪造local用户旅程。

**Step 3:** 观察无snapshot仍按时更新、短inFlight不闪、慢帧有真实pending起点；故障只影响UX、原frame outcome和产物仍可继续。

**Step 4:** 记录实际case/assertions、资源SHA和runtime映射；不以IAT结果替代T35原发送端E2E。

**验证命令（本阶段未运行）：**

```powershell
node tools/desktop-recv/e2e/run-e2e.mjs --context $metricsContext --case UX-IAT
```

**Expected / DoD:** 实际浏览器IAT可复查；R映射定位，scope保持unit_integration。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `docs: record receiver metric integration evidence`，操作按配方R；若NO_CHANGE不造空提交。

### T20 — 录像、保存owner与异常恢复RED

**Files:** `web/desktop-recv/tests/unit/video.test.mjs`、`web/desktop-recv/tests/unit/save.test.mjs`、`web/desktop-recv/tests/unit/session.test.mjs`、`web/desktop-recv/tests/unit/ux-view.test.mjs`、`web/desktop-recv/tests/unit/ux-display.test.mjs`。接线与完整约束见配方E。

**Step 1:** 先写媒体位置与文件估计独立、未知duration、EOF无artifact、显示preview持续呈现的断言。

**Step 2:** 构造failed+16002、writing+16008、pending、write/close失败、旧attempt/owner与停止后迟到保存回调，必须验证产物和新会话不受污染。

**Step 3:** 运行定向用例记录预期RED，保留原SaveController同步picker激活/结算测试。

**验证命令（本阶段未运行）：**

```powershell
node tools/desktop-recv/run-unit.mjs --suite video --suite save --suite session --suite ux-view --suite ux-display
```

**Expected / DoD:** 新媒体/保存映射行为RED，旧IO断言保持。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `test: specify media and save feedback ownership`，操作按配方R；若NO_CHANGE不造空提交。

### T21 — 接通独立录像位置和真实保存阶段

**Files:** `web/desktop-recv/src/app.js`、`web/desktop-recv/src/session.js`、`web/desktop-recv/src/ux-telemetry.js`、`web/desktop-recv/src/ux-view.js`。接线与完整约束见配方E。

**Step 1:** 在既有VideoSource位置/元数据旁归一mediaPosition，保持原rVFC/EOF drain和最后采样不动；active preview永远可呈现。

**Step 2:** 点击保存前捕获owner，首个真实SaveController event同步绑定attempt，回调沿固定owner送UX；同owner/attempt逆序/旧事件只拒UX，业务原结算继续。

**Step 3:** 按配方E归一取消/写入/等待/成功，不改变写盘算法，不await后再打开picker；点击后焦点与重试建议正确。

**Step 4:** 运行T20至GREEN，原v1 Snapshot不混入内部对象。

**验证命令（本阶段未运行）：**

```powershell
node tools/desktop-recv/run-unit.mjs --suite video --suite save --suite session --suite ux-telemetry --suite ux-view --suite ux-display
```

**Expected / DoD:** 原IO/EOF成立，Saved只在write+close，旧owner不串入。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `feat: clarify recorded input and save recovery feedback`，操作按配方R；若NO_CHANGE不造空提交。

### T22 — 媒体与保存全链路集成

**Files:** `web/desktop-recv/tests/unit/video.test.mjs`、`web/desktop-recv/tests/unit/save.test.mjs`、`web/desktop-recv/tests/unit/session.test.mjs`、`web/desktop-recv/tests/unit/ux-display.test.mjs`、`web/desktop-recv/tests/browser/ux-observation.mjs`、`docs/dev-pipeline/receiver-ux-v2/runtime-case-map.json`。接线与完整约束见配方E。

**Step 1:** 验证真实模块组合中取消保留产物、写失败与close失败不Saved、pending不重开、旧保存owner和新接收隔离。

**Step 2:** 覆盖录像切换/停止/EOF后清理、数据到达后UI仍保持preview呈现；注入内容按IAT单列。

**Step 3:** 跑所有unit并更新运行验证映射；真实系统操作留给T25/T35，不从mock推出系统成功。

**验证命令（本阶段未运行）：**

```powershell
node tools/desktop-recv/run-unit.mjs --all
```

**Expected / DoD:** 集成断言与原业务回归通过，无skip/todo。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `test: cover save and media lifecycle integration`，操作按配方R；若NO_CHANGE不造空提交。

### T23 — 审查录像呈现与保存所有权

**Files:** `docs/dev-pipeline/receiver-ux-v2/review-media-save.md`。接线与完整约束见配方R。

**Step 1:** 追踪用户点击→实际attempt→raw event→UX映射，不允许迟到回调读取当前owner；检查无重复保存副作用。

**Step 2:** 核对视频元素活动期布局真实可呈现，EOF/回收/close失败路径无业务语义变化，输出复验要求。

**验证命令（本阶段未运行）：**

```powershell
git diff --check
```

**Expected / DoD:** 问题闭环入口明确。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `docs: review media presentation and save ownership`，操作按配方R；若NO_CHANGE不造空提交。

### T24 — 整改媒体与保存问题

**Files:** `web/desktop-recv/src/app.js`、`web/desktop-recv/src/session.js`、`web/desktop-recv/src/ux-telemetry.js`、`web/desktop-recv/src/ux-view.js`、`web/desktop-recv/tests`、`docs/dev-pipeline/receiver-ux-v2/review-media-save.md`。接线与完整约束见配方R。

**Step 1:** 依审查最小整改并新增反例；若需要更改原SaveController/VideoSource算法，应先记录偏差与影响，不借UX重写已验核心。

**Step 2:** 重跑受影响和全部unit，更新文案/接线记录；阻断0进入实际录像和保存对话框。

**验证命令（本阶段未运行）：**

```powershell
node tools/desktop-recv/run-unit.mjs --all
```

**Expected / DoD:** 审查阻断关闭，实际系统验证待T25。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `fix: resolve recorded-input and save UX findings`，操作按配方R；若NO_CHANGE不造空提交。

### T25 — 真实录像及保存取消重试闭环

**Files:** `docs/tests/runs/<mediaRun>/proof`、`docs/tests/runs/<mediaRun>/ux-results.json`、`tools/desktop-recv/e2e/run-e2e.mjs`。接线与完整约束见配方A,E,G。

**Step 1:** 先依据4.7场景在现有runner增加本任务真实旅程及断言（或按计划人工步骤留证）；保留原系统入口，未知/未实现case必须非0退出，不能空handler记PASS。

**Step 2:** 以本轮有效录像经真实file input导入，观察媒体位置与重建估计分开；另用真实不足录像看到Incomplete，最后帧规则沿原矩阵。

**Step 3:** 真实Ready后打开系统保存并取消，确认产物仍在；再次点击实际保存到新路径，外部SHA一致。可构造的真实写入失败单列，纯注入仍IAT。

**Step 4:** 停止后切换实时/录像，新会话数字与计时清零；记录实际焦点、preview连续读取与恢复。

**验证命令（本阶段未运行）：**

```powershell
node tools/desktop-recv/e2e/run-e2e.mjs --context $mediaContext --case UX-MEDIA-SAVE
```

**Expected / DoD:** 真实录像/保存恢复通过，不能凭媒体到100%报文件完成。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `docs: record real video and save recovery evidence`，操作按配方R；若NO_CHANGE不造空提交。

### T26 — 中文布局与可访问反馈RED

**Files:** `web/desktop-recv/tests/unit/ux-display.test.mjs`、`web/desktop-recv/tests/unit/ui.test.mjs`。接线与完整约束见配方D,G。

**Step 1:** 先断言双入口中文且id不变、按旧controls禁用、文本安全渲染、状态播报不含高频数字、焦点目标合法。

**Step 2:** 加入长文件名/多语文字、诊断折叠不隐藏active preview的结构性断言；DOM检查不承担像素/真实键盘验收。

**Step 3:** 运行用例记录新UI要求RED；不删除只因英文变更而失败的原业务检查，只替换展示文本断言。

**验证命令（本阶段未运行）：**

```powershell
node tools/desktop-recv/run-unit.mjs --suite ui --suite ux-display
```

**Expected / DoD:** 新UI语义断言RED可定位。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `test: specify Chinese receiver interaction semantics`，操作按配方R；若NO_CHANGE不造空提交。

### T27 — 实现最终中文主界面与恢复建议

**Files:** `web/desktop-recv/index.html`、`web/desktop-recv/styles.css`、`web/desktop-recv/src/app.js`、`web/desktop-recv/src/ui.js`、`web/desktop-recv/src/ux-view.js`、`web/desktop-recv/src/ux-display.js`、`web/desktop-recv/package.json`、`web/desktop-recv/README.md`。接线与完整约束见配方D,E,G。

**Step 1:** 将真实主页面设zh-CN，保留四按钮id和功能，布局采用既有深色/青色与原型层级；状态主文案/下一步、指标、录像位置、产物/保存、诊断次级。

**Step 2:** 主要能力/错误提示映射既有码为中文，不能依赖英文日志；保留原debug标记、严格EOF和自动化探针；诊断日志移出aria-live，稳定语义区单独播报。

**Step 3:** 按760/380断点、44px目标、长文本换行与焦点可见落实，active preview不能折叠隐藏。按D/E实现纯文本绘制与焦点回归。

**Step 4:** 产品package版本按兼容新增功能定为1.1.0，交付目录在阶段8生成时间戳，不改WASM/发送端版本；更新中文README说明估计/冗余/两个输入/恢复。执行T26至GREEN。

**验证命令（本阶段未运行）：**

```powershell
node tools/desktop-recv/run-unit.mjs --all
node --check web/desktop-recv/src/app.js
```

**Expected / DoD:** 全部unit通过；真实视觉/键盘/辅助技术待T31。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `feat: finish Chinese receiver status and recovery UI`，操作按配方R；若NO_CHANGE不造空提交。

### T28 — 实现只用于开发验收的A/B观测器

**Files:** `tools/desktop-recv/e2e/measure-ux.mjs`、`tools/desktop-recv/tests/measure-ux.test.mjs`、`tools/desktop-recv/e2e/README.md`。接线与完整约束见配方F。

**Step 1:** 先以固定数组/时点测试分位数、有效配对、样本不足/丢轮/阈值变更/错误SHA拒绝和失败原样输出，再写实现。

**Step 2:** 将原Client.submitFrame测试包装器/MutationObserver计数放在开发工具，baseline/candidate完全相同且保留原Promise与副作用；测的是帧往返而非声称纯解码CPU时间，退出恢复包装器。

**Step 3:** 实现--context/--baseline-context/--method，按F的5对录像及实时固定窗口串行采集/比较，输出原始样本与comparison，不能只有布尔值。测试代码不进入交付包。

**验证命令（本阶段未运行）：**

```powershell
node --test tools/desktop-recv/tests/measure-ux.test.mjs
node tools/desktop-recv/e2e/measure-ux.mjs --help
```

**Expected / DoD:** 计算/拒绝规则通过、帮助明确；实际A/B只在T31运行。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `test: add reproducible receiver UX overhead measurement`，操作按配方R；若NO_CHANGE不造空提交。

### T29 — 审查最终UI与性能测量方法实现

**Files:** `docs/dev-pipeline/receiver-ux-v2/review-ui-perf.md`。接线与完整约束见配方R,F。

**Step 1:** 比对真实UI与已确认设计，核查无未批准功能、个人数据上传或新依赖；日志不能是理解状态唯一入口。

**Step 2:** 检查A/B测量对两构建公平、归一口径正确、阈值文件SHA预先锁定、无删除慢样本；记录阻断及目标环境复验需求。

**验证命令（本阶段未运行）：**

```powershell
git diff --check
```

**Expected / DoD:** UI与测量审查记录交T30。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `docs: review receiver UI and measurement integrity`，操作按配方R；若NO_CHANGE不造空提交。

### T30 — 整改UI及测量实现问题

**Files:** `web/desktop-recv`、`tools/desktop-recv/e2e/measure-ux.mjs`、`tools/desktop-recv/tests/measure-ux.test.mjs`、`docs/dev-pipeline/receiver-ux-v2/review-ui-perf.md`。接线与完整约束见配方R。

**Step 1:** 逐项整改、补相关反例，复跑unit与测量器测试；不能为变绿修改冻结阈值或隐藏不适用项。

**Step 2:** 无阻断后生成候选新资源清单供T31；若实测失败按29→30→31形成新attempt，不覆盖失败数据。

**验证命令（本阶段未运行）：**

```powershell
node tools/desktop-recv/run-unit.mjs --all
node --test tools/desktop-recv/tests/measure-ux.test.mjs
```

**Expected / DoD:** 审查阻断0，待真实浏览器与A/B。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `fix: resolve receiver UI and performance review findings`，操作按配方R；若NO_CHANGE不造空提交。

### T31 — 真实浏览器、键盘/辅助技术及同输入A/B

**Files:** `docs/tests/runs/<candidateRun>/proof/ui`、`docs/tests/runs/<candidateRun>/measurements/ux-overhead`、`docs/tests/runs/<candidateRun>/ux-results.json`、`tools/desktop-recv/e2e/run-e2e.mjs`。接线与完整约束见配方F,G。

**Step 1:** 先依据4.7场景在现有runner增加本任务真实旅程及断言（或按计划人工步骤留证）；保留原系统入口，未知/未实现case必须非0退出，不能空handler记PASS。

**Step 2:** 按G的视口/缩放/长文本、Tab/Enter/Escape、系统对话框取消后的焦点、真实屏幕阅读器执行，数字刷新不反复播报；实际录像仍持续呈现。

**Step 3:** 按F运行5对同录像与5对实时观测，顺序AB/BA/AB/BA/AB；构建/输入/浏览器/视口不一致则本次不可判定，重跑整对保留原始失败。

**Step 4:** 比较固定阈值、DOM数字频度、帧并发和终结清理。截图/原始时序/分位数/计算输出齐备；环境不可用或样本不足保持NOT_RUN，不能用旧性能NOT_EVALUATED豁免本轮。

**验证命令（本阶段未运行）：**

```powershell
node tools/desktop-recv/e2e/measure-ux.mjs --context $candidateContext --baseline-context $baselineContext --method docs/plans/receiver-ux-v2/performance-method.json
node tools/desktop-recv/e2e/run-e2e.mjs --context $candidateContext --case UX-UI
```

**Expected / DoD:** 按冻结规则判定实际性能与界面结果；失败回T29/T30，不能只报unit PASS。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `docs: record real receiver UI and overhead acceptance`，操作按配方R；若NO_CHANGE不造空提交。

### T32 — 最终候选全量内部审查

**Files:** `docs/dev-pipeline/receiver-ux-v2/review-final.md`。接线与完整约束见配方R。

**Step 1:** 以最终候选diff、R映射、真实UI/A/B结果和旧功能约束逐项复核规格、质量、异常与生命周期；核查未通过项没有被资料掩盖。

**Step 2:** 输出阻断项及最小复验范围，0阻断才允许T34/T35；这是内部审查，不代替阶段6独立外审。

**验证命令（本阶段未运行）：**

```powershell
git diff --check
```

**Expected / DoD:** 最终内部审查结论可追溯。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `docs: review receiver UX candidate before full E2E`，操作按配方R；若NO_CHANGE不造空提交。

### T33 — 最终审查整改与受影响验证

**Files:** `web/desktop-recv`、`tools/desktop-recv`、`docs/dev-pipeline/receiver-ux-v2/review-final.md`。接线与完整约束见配方R。

**Step 1:** 按最终审查最小整改并复验；如果改了product字节则更新candidate manifest/new attempt，UI/perf受影响时必须重跑T31。

**Step 2:** 确认阻断0并冻结最终候选；无问题记录NO_CHANGE，保持完整失败/整改证据。

**验证命令（本阶段未运行）：**

```powershell
node tools/desktop-recv/run-unit.mjs --all
node --test tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/measure-ux.test.mjs
python tools/desktop-recv/tests/ux-evidence-selftest.py
```

**Expected / DoD:** 最终修复通过；此前受影响真实验收已刷新。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `fix: close receiver UX candidate review findings`，操作按配方R；若NO_CHANGE不造空提交。

### T34 — 最终构建的全部单元/集成及资产回归

**Files:** `docs/tests/runs/<candidateRun>/logs`、`docs/dev-pipeline/receiver-ux-v2/runtime-case-map.json`、`docs/tests/runs/<candidateRun>/run-context.json`、`tools/desktop-recv/stage.ps1`。接线与完整约束见配方A,B,C,E。

**Step 1:** 把新增ux-telemetry/ux-view/ux-display列入stage的candidate必需文件清单，并核对打包入口实际依赖齐全；严格EOF/WASM校验记录沿用同一摘要来源。

**Step 2:** 从最终候选源树stage到独立candidate，重算产品清单并核验旧WASM/严格EOF证据；所有unit/工具自测无skip/todo。

**Step 3:** 以最终构建执行UX-IAT及原适用集成组；映射R-01～11到真实输出，辅助技术/性能结果须与最终资源清单一致或有文件级未受影响依据。

**Step 4:** 确认旧v1契约字节未变，init/frame看门狗、single-flight、预算和EOF仍成立；产物manifest冻结供T35。

**验证命令（本阶段未运行）：**

```powershell
node tools/desktop-recv/run-unit.mjs --all
python tools/desktop-recv/verify-evidence-selftest.py
node tools/desktop-recv/verify-assets.mjs --root $candidateReceiver
node tools/desktop-recv/e2e/run-e2e.mjs --context $candidateContext --case UX-IAT
```

**Expected / DoD:** 最终候选单元/集成/资产均有真实输出；未执行不可通过。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `docs: bind final receiver candidate to regression results`，操作按配方R；若NO_CHANGE不造空提交。

### T35 — 新构建全量旧E2E与新UX真实旅程

**Files:** `docs/tests/runs/<candidateRun>/results.json`、`docs/tests/runs/<candidateRun>/ux-results.json`、`docs/tests/runs/<candidateRun>/proof`、`tools/desktop-recv/e2e/run-e2e.mjs`、`tools/desktop-recv/e2e/source-scene.mjs`。接线与完整约束见配方A,G。

**Step 1:** 先依据4.7场景在现有runner增加本任务真实旅程及断言（或按计划人工步骤留证）；保留原系统入口，未知/未实现case必须非0退出，不能空handler记PASS。

**Step 2:** 按4.7冻结清单在同一最终候选上下文逐例跑E2E-1～20全矩阵，保留当前已批准E2E-18各腿/例外依据；不能用旧run PASS填新结果。

**Step 3:** 再按计划执行新增UX用户旅程全部必测项；真实输入、系统源选择与保存、实存文件及外部SHA都必须齐备；IAT/自动注入不冒充用户操作。

**Step 4:** 保存每次实际执行独立attempt原件，results只作当前索引；失败或NOT_RUN原样保留。若修产品或补脚本，回T32/33按影响复验，再更新最终候选清单/新attempt。

**Step 5:** 全矩阵较慢允许串行长运行并持续记录进度；不可删体量/压缩性/中文空格目录/恢复/EOF等检查节省时间。

**验证命令（本阶段未运行）：**

```powershell
1..20 | ForEach-Object { node tools/desktop-recv/e2e/run-e2e.mjs --context $candidateContext --case "E2E-$_"; if ($LASTEXITCODE -ne 0) { throw "case E2E-$_ failed" } }
node tools/desktop-recv/e2e/run-e2e.mjs --context $candidateContext --case UX-ALL
```

**Expected / DoD:** 旧本地全矩阵+新UX必测实际通过；任何缺口保持FAIL/NOT_RUN。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `docs: record full real receiver UX acceptance`，操作按配方R；若NO_CHANGE不造空提交。

### T36 — 复核双门禁、候选说明与阶段5送审索引

**Files:** `docs/dev-pipeline/receiver-ux-v2/stage5-dev-summary.md`、`docs/dev-pipeline/receiver-ux-v2/runtime-case-map.json`、`docs/tests/runs/<candidateRun>/reproduction.md`、`docs/tests/runs/<candidateRun>/release-candidate-manifest.json`、`web/desktop-recv/README.md`、`docs/dev-pipeline/stage5-dev-summary.md`。接线与完整约束见配方A,F,G,R。

**Step 1:** 实际运行既有local门禁及新增UX汇总门禁，复算原/收SHA、每条构建/attempt、UI时序/性能原始数据及12类R映射；旧20绿不能掩盖新UX缺测。

**Step 2:** 完成中文操作/指标口径/恢复/诊断说明、环境/样本复现配方、候选资源与结果绑定；审查stage5-dev-summary每条声明都可定位真实证据。

**Step 3:** 场景21～26与新增现场体验只保留用户真实结果/NOT_RUN；不能为了总绿改scope或执行者。送审材料定位本轮目录，根stage5-dev-summary只加本轮索引且保留历史定位，按Claude流程提交阶段6；不改外审全局轮次/旧裁决。

**Step 4:** 有证据缺口返回相应任务修复再复验；无缺口后才将阶段5完成。阶段6/7/8及FIELD只按下游边界表续接，当前不自动发布。

**验证命令（本阶段未运行）：**

```powershell
python tools/desktop-recv/verify-evidence.py --run $candidateRun --gate local --planning $planningFile
python tools/desktop-recv/verify-ux-evidence.py --context $candidateContext --gate local
python tools/desktop-recv/verify-ux-evidence.py --context $candidateContext --gate field
```

**Expected / DoD:** local旧+新两门禁实际通过；field未执行时应非0且保留NOT_RUN，不能称整体现场通过。按配方R复核、归档实际输出，完成本任务适用文档及审查；无证据不勾选。

**提交边界：** 独占git-index，只暂存上列本任务实际变更；建议本地提交 `docs: prepare receiver UX candidate for independent review`，操作按配方R；若NO_CHANGE不造空提交。


## Implementation recipes

### A — 隔离运行上下文与双证据出口

当前事实：`run-e2e.mjs`与`record-sender.mjs`固定旧RUN/STAGING/FIXTURES；`stage.ps1`虽有RunId但staging固定；`verify-evidence.py.plan_rows`只纳入E2E-1～20和21～26，原v1 Evidence的acceptanceIds枚举仅到014。不能直接向旧schema塞新AC，也不能以旧local绿灯代表UX已验。

**拟新增接口（T2之前不存在）**：

```text
node tools/desktop-recv/e2e/run-e2e.mjs --context <run-context.json> --case <id|group>
node tools/desktop-recv/e2e/record-sender.mjs --context <run-context.json> --only full
node tools/desktop-recv/e2e/record-sender.mjs --context <run-context.json> --only last --payload-file <primary-input-file>
pwsh -NoProfile -File tools/desktop-recv/stage.ps1 -RunId <id> -Mode development -StagingRoot <receiver-root>
python tools/desktop-recv/verify-ux-evidence.py --context <run-context.json> --gate local|field
```

`run-context.json`精确顶层字段：`version=1, iterationId=receiver-ux-v2, runId, attemptId, phase, runRoot, stagingRoot, fixtureRoot, planningFile, methodFile, productManifest, productManifestSha256, sourceRevision, harnessRevision, inputManifest, inputManifestSha256, legacyThresholdFile`。最后一项为旧现场性能判据文件或null，不能拿本轮UX方法代填旧E2E-26性能阈值。phase为baseline/slice/metrics/media/final/field，所有非null路径为仓库相对规范路径，路径解析后仍须位于本轮允许根；baseline/candidate根不能相同，不接受历史run输出。新目录首次执行需不存在或为空；恢复须同runId、phase、manifest与attempt，不能默认last-write-wins覆盖别的构建。

RunContext由T2同一个解析函数供runner与recorder使用；子进程显式传context，图像/视频、fixtures-ext、日志、原收文件、诊断和启动路径测试副本都走此根。`stage.ps1 -StagingRoot`只影响实际接收端复制位置；sender staging从已验原发送包只读复制到context.stagingRoot/sender，不改发送端源码/包。基线可用已验`product/libcimbar-desktop-receiver-1.0.0-20261022-2252`完整包；核对原交付manifest后复制到本轮baseline，不在原包内stage或打补丁。保留相同WASM与strict-EOF gate证据路径的真实摘要，不能靠重新写声明绕过校验。

产品manifest：按规范相对路径排序逐项记录实际用户运行的HTML/CSS/src/worker/config/vendor/启动文件SHA-256，计算manifest自身SHA。测试代码/证据不混入产品清单。sourceRevision标记构建源提交，工具提交另记harnessRevision；测试工具提交变更而产品字节未变时不得偷换构建，保留新harness/attempt与执行记录。产品字节变化则必须新manifest，受影响验证刷新。所有copy/write按规范根校验；不跟随路径逃逸到旧run。

执行变量只从已校验context取值，例如`$candidateContext`是实际JSON路径，`$candidateRun`取其runRoot，`$candidateReceiver`取stagingRoot/receiver，`$planningFile`取planningFile；baseline/slice/metrics/media同理。工具先校验这些字段及manifest，再启动服务或写文件；不设回退到旧根的默认值。尚未生成4.7 planning-cases时不运行产品验收命令。

每次执行原件放`proof/<caseId>/<attemptId>/`，索引可指向当前有效attempt，但旧原件不可覆写。旧`results.json`保持v1 E2E-1～26字段与AC；新`ux-results.json`为独立内部UX证据，结构为：

```json
{"version":1,"iterationId":"receiver-ux-v2","runId":"<actual>","productManifestSha256":"<64 hex>","records":[]}
```

每条UX记录必填`caseId, attemptId, scope, caseType, result, executedBy, acceptanceIds, productManifestSha256, startedAt, finishedAt, proofRefs, assertions, referenceSha256, receivedSha256, notes`。caseId由4.7冻结（新编号从27起，不覆盖原26）；scope/caseType/result/执行者词汇沿用已有语义，acceptanceIds限本轮AC-015～024。assertions逐项含`id, expected, observed, result, proofRef`，不能只以整体布尔值代表真实反馈。NOT_RUN留执行者/执行时点/收文件摘要为null，写明原因；PASS的时点、真实证明文件不可空。

UX的file_roundtrip前两proofRefs仍为实际原/收文件；门禁在磁盘重算SHA。负向/生命周期要有实际步骤与状态/释放断言；测量必须引用冻结method摘要与原始数据，计算器重新比较。proof路径必须落当前run下，缺文件/旧构建/重复case/错scope/执行者/旧attempt冒充/任何必测assertion非PASS均非0。field未执行不是本地失败，但必须独立非0呈现。旧现场E2E-26仍按原批准判据或未评定状态处理；methodFile只供新增UX开销检查，不能因其frozen=true宣称旧现场性能已确认或通过。

**总出口**：既有verify-evidence检查原完整矩阵，新增汇总器核对4.7计划的全部新UX必测ID、门禁组与全部AC/R责任，再同时要求旧门禁成功。旧20全绿而缺UX项必须失败。slice/metrics/media上下文禁止用来证明final门禁。plan的v1部分不删/改原已批准义务；两份新计划/新证据只扩展本轮，不修改历史schema或历史结果。T1/T3用临时目录正负例证明这一点。

### B — 可选report与原pending接线

在classic Worker内增加下列完整的局部读取函数，保持现有内存管理。返回Report由原消息旁附`uxObservation:{version:1,report}`，frameId用原外层字段；不在WorkerObservation额外塞未定义字段。

```javascript
function read_report() {
  function unavailable(code) {
    return { state: 'unavailable', ratios: [], diagnosticCode: code };
  }
  if (typeof Module._cimbard_get_report !== 'function') return unavailable(19001);
  var text;
  try {
    var buff = ensure_buffer('uxReport', 1024);
    var n = Module._cimbard_get_report(buff.byteOffset, 1024);
    if (!Number.isSafeInteger(n) || n < 0) return unavailable(19002);
    if (n >= 1024) return unavailable(19003);
    if (n === 0) return { state: 'empty', ratios: [], diagnosticCode: 0 };
    // get_report可能导致HEAP视图变化，重新从当前堆复制；不依赖NUL结尾。
    var bytes = Module.HEAPU8.slice(buff.byteOffset, buff.byteOffset + n);
    if (bytes.length !== n) return unavailable(19002);
  } catch (error) { return unavailable(19002); }
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    var ratios = JSON.parse(text);
    if (!Array.isArray(ratios) || ratios.length > 8 ||
        !ratios.every(function (v) { return Number.isFinite(v) && v >= 0; })) {
      return unavailable(19004);
    }
    return {
      state: ratios.length === 0 ? 'empty' : ratios.length === 1 ? 'single' : 'multiple',
      ratios: ratios,
      diagnosticCode: ratios.length > 1 ? 19005 : 0,
    };
  } catch (error) { return unavailable(19004); }
}
```

这是Report读取核心，不替代UX-01请求版本/字段验证与Ack封装；局部边界按已冻结schema返回`{ok,code,data}`。位置：原fountainResult BigInt/非负校验后，0n分支和build_artifact之前一次读取；no_data/error不调用。读取失败不进入原frame_error；原build_artifact/预算错误照常返回error，不因有效report掩盖。VM需覆盖读取抛错/坏JSON/堆变化/close释放；真实探针只是report能力IAT，不能称真实抓屏通过。

Client接线：Session调用`createClient({sessionId,sessionSeq})`传捕获的owner，App工厂把owner及可注入`nowMs=()=>performance.now()`传给Client；原不接参数的测试工厂仍兼容。原pending条目在postMessage前加入`{sessionId,sessionSeq,frameId,submittedAtMs}`；getter只读返回当前pending元数据或null，不能创建新pending。超时/错误/close/正常回应继续按原路径删除。UI Context的inFlight与inFlightSince取这个实际pending是否存在及真实提交时点；原scheduler.stats不改，避免Promise清理短窗口里把不存在的pending冒充慢帧。

Session真实结果消费时取同一主线程时钟，映射到FrameInput；no_data/error的bytesDecoded归0，data/artifact必须为原合法正整数。没有uxObservation为19015，旧Worker仍能接收；旧元数据与未知版本只降UX。UX处理局部返回失败不能阻止原artifact/error分支，原_onFrameResult不是为UX改写的状态机。

### C — 纯模型、精确窗口和投影

新增模块的JS导出固定为`ReceiverTelemetry`及`readView`；名称是实施选择，字段/幂等返回仍按UX-02～06。不要为六个局部动作建立通用路由框架。

```javascript
// 使用位置与可测试接口；各参数形状由阶段2.5 $defs约束。
const telemetry = new ReceiverTelemetry();
const started = telemetry.begin(beginRequest);       // Ack envelope
const accepted = telemetry.acceptFrame(frameInput);  // Ack envelope
const saved = telemetry.observeSave(saveRequest);    // Ack envelope
const finished = telemetry.finish(finishRequest);    // Ack envelope
const view = readView(telemetry.snapshot(), viewRequest); // ViewSnapshot envelope
```

在`session._emit`确定真实状态后、通知App之前执行必要begin/finish，且只对真正状态迁移/实际产物操作：Receiving为起点，Ready真实artifact/Incomplete/Stopped或原fatal失败为终点；Draining继续计时。没有进入Receiving的准备失败elapsed=null。错误处理从原fatal事件得出reason=error，不能把任意UX诊断当fatal。观测读写不调用`_emit({})`刷新业务revision；新seq按原cleanup门创建新模型所有权。

桶编号`q=floor((now-rateEpoch)/250)`，槽索引`q % 12`并附generation=q。只遍历固定12槽，保留`q-11..q`；查询起点`rateEpoch+max(0,q-11)*250`。字节在接收data/artifact的receivedAt归桶，不按显示tick次数累计。小于1000ms预热；之后`sumBytes*1000/(now-start)`。先校验整数累加安全，溢出只丢本条速率样本、清桶并把rateEpoch设为该合法时点重新预热，不能重置接收用时/报告事实。查询不得伪造业务变化；过时槽可只在固定读循环排除，避免readView修改观测revision。

独立预期算例（不从实现函数算expected）：epoch=0、t=250收到1024B，t=1000速率1024B/s；t=2999.9仍保留该桶、分母2999.9ms；t=3000时q=12、起点250，分母2750ms、仍保留桶1；t=3250时桶1淘汰、速率0。无data/error不能增加分子。所有结果先按当前owner和frameId过滤，重复不更新lastData/lastAdvance/revision。

single比例首样本建立增长基准；严格大于最近可信值才推进lastAdvance。multiple或可信比例回退锁歧义至新seq；暂时缺报告隐藏百分比但不清历史可信值/锁。p>=1且无artifact必须enough_data、ratio=null；artifact真实存在后才complete。投影优先级与阈值按模块契约完整表，不按原型动画插值。elapsed=floor((endedAt??now)-receivingAt)，只用主单调时钟；原Date.now审计与UI数学分开。

### D — 专用显示与真实界面

保留`btn-live/btn-video/btn-stop/btn-save/file-input/preview/artifact`id和原用户激活路径。新增专用`ux-primary/ux-secondary/ux-next/ux-elapsed/ux-rate/ux-progress/ux-media/ux-announcement`元素。`#ux-announcement`为稳定polite语义区，数字区域不设live；诊断`#log`移出aria-live。innerHTML不能用于文件名/状态/错误文字。

`createUxDisplay({readCurrent, nowMs, setTimer, clearTimer, paint})`返回`syncBusiness(), dispose()`。内部至多一当前owner刷新器，owner改变先释放旧timer；callback捕获seq并比对当前所有权与last viewAt。`readCurrent`只组装原业务Context和观测；`paint`只改专用显示区的已变化文本/属性。普通事件和timer共用lastTelemetryWriteAt，数字/遥测写入间隔≥250ms，不会因高频snapshot额外再写一轮。

业务状态/按钮即时路径与数字分开：原事件render及时更新合法controls和真实终态主文案；tick不能再次执行render/runFrameLoop/VideoSource.run/releaseInputs/finishStream/保存。业务状态即时变更不受遥测节流；语义观测态与数字遵守250ms。同observationRevision但now前进仍投影elapsed/等待，不使用旧shouldApplySnapshot阻挡时钟。对相同announcementKey不再写live区。

Ready/Incomplete/Stopped/原fatal终结冻结接收用时并停止接收timer；Preparing/Saving由真实事件驱动，不留接收timer。visibility隐藏可以停timer；回前台立即用当前时间投影再按状态恢复，每seq仍最多一个；pagehide销毁可幂等释放。render异常19012只做本次UI回退，不重启接收。活动video元素维持实际布局呈现，不能display:none/hidden/折叠，诊断日志可折叠。

定向测试接口示例：

```javascript
test('same observation advances elapsed without business revision', () => {
  const before = structuredClone(observationFixture);
  const at1 = readView(before, requestAt1000);
  const at2 = readView(before, requestAt2000);
  assert.equal(at2.data.elapsedMs - at1.data.elapsedMs, 1000);
  assert.equal(at2.data.businessRevision, at1.data.businessRevision);
  assert.equal(at2.data.announcementKey, at1.data.announcementKey);
  assert.deepEqual(before, observationFixture);
});
```

fixture必须使用阶段2.5有效例并填真实关联身份/时间，阶段4.5补完整可运行骨架；这段是行为断言示例，不是已运行测试或在生产中放置桩代码。

### E — 媒体、保存与真实激活

录像位置取原VideoSource实际位置/元数据，有限非负position；未知或非正duration=null、fraction=null，非法position隐藏整个媒体栏/19011。两种进度分别标注；读取到结尾沿原EOF屏障和最后采样结算，无artifact不成功。不能为了做进度主动seek、加速或改变背压。

保存绑定：点击时捕获`owner={sessionId,sessionSeq,artifactId}`，同步调用原SaveController.start，不在picker前await。仅在这次真实start首个selecting事件拿到真实attemptId时，把不可变owner与attempt绑定；当前Map若已有该attempt必须沿原owner，busy的writing+16008不能重新绑定。后续回调只查该绑定，不用coordinator.snapshot当前owner推断来源；旧/已释放attempt找不到绑定则丢UX。每次settled清理该attempt，单在途保存Map有界；原业务saveEvent仍按原结算规则执行。上下文里的当前artifactId来自实际产物，不构造估计身份。

归一矩阵：failed/cancelled+16002→cancelled；writing+16008→writing；pending→尚未结算；write/close失败→failed可重试；saved且原真实两步成功→saved。旧owner/attempt→19007，仅拒UX。取消/失败时原artifact保持；用户可再次点击，不自动打开系统窗口。isCurrent原保存判断与停止结算继续，UX映射不更改原IO。

### F — 冻结性能比较

权威机器参数：[performance-method.json](performance-method.json)。`frozen=true`只表示方法冻结，`productAcceptance=NOT_RUN/results=null`，不是测量通过。以下阈值是本轮技术回归选择，不新增吞吐SLA。

- T6在任何产品改动前锁定同一真实128KiB难压缩输入/录像SHA；至少30个已结算帧、完整可重建。若不满足，先在基线阶段按配方重建足够长录像再固定SHA，禁止候选出结果后挑更有利样本。
- 128KiB主样本可从新根内`create-fixtures.py --extended`按seed=20261018生成的1MiB难压缩样本取前131072字节另存，记录源/新文件SHA；使用新recorder的`--payload-file`读取此实际文件，不能每轮randomBytes重造输入。性能录像输出到单独UX-PERF目录，不覆盖旧E2E-16 pair；原完整矩阵继续使用原配方与适用性依据。
- 主数值比较：同一录像，两个构建各先1轮预热；5个有效A/B配对，顺序AB/BA/AB/BA/AB，同WASM/浏览器/视口/设备比例/电源/输入/观测器SHA。每轮重新打开接收页并建立新Worker，避免原journey首会话时间戳被复用；基线和候选串行，T6初始基线预检不替代T31配对。
- readyMs是原journey.readyAt-receivingAt的同一Date时钟差；帧RTT是原submitFrame→同一Promise结算的同一performance时钟差，**不声称纯WASM解码CPU耗时**。每轮RTT分位数用nearest-rank，再对各侧5轮值取中位数，不混不同帧数池。
- 通过条件同时满足：候选ready中位数≤基线×1.10+250ms；候选RTT p50中位数≤max(基线×1.10,基线+2ms)；候选RTT p95中位数≤max(基线×1.15,基线+5ms)。真实产物按原规则完成、single-flight仍1、遥测数字间隔≥250ms、终结后UX显示timer归零及有界解析/桶/诊断必须成立。实时busy时原本允许丢弃采样，保留并记录该策略，不将“零丢采样”作为新指标反向改调度器。
- 实时腿另做5对同源30秒活动窗口，检查single-flight、反馈、节流、停止释放；实时采样有调度差异，不宣称逐帧相同，不以其RTT替代录像主判据。长任务数据支持则记录实际时段归一值，不支持注明NOT_MEASURED，不能编造0。
- 开发观测器可在两构建同样包装DecoderClient.prototype.submitFrame记录起止，同时返回原Promise（测量的then不得throw/改结算）；退出还原。DOM计数只观察遥测数值区实际写入，不能把原按钮/真实终态即时变化误算为违反4Hz。工具不随包发布。
- 缺输入、同SHA却缺实物、少于30帧、配对不齐、环境不同、缺原始时序均不能PASS。记录原始无效轮次，最多2对环境原因替换，仍不足NOT_RUN；候选功能失败/不变式破坏为FAIL，不能当噪声剔除。任何方法变更需新版本+理由并重跑两侧，不按候选结果追绿。

**拟新增命令（T28实现，T31执行）**：

```powershell
node tools/desktop-recv/e2e/measure-ux.mjs --context $candidateContext --baseline-context $baselineContext --method docs/plans/receiver-ux-v2/performance-method.json
```

输出到当前attempt的`measurements/ux-overhead/`，含每帧原始值、环境/输入/manifest、排除原因及summary/comparison；新总门禁复算阈值，不仅信任结果文件PASS。原性能NOT_EVALUATED不豁免本轮开销测试。

### G — 与实际操作一致的验收基准

阶段4.7负责冻结具体编号/前置/步骤/断言及机器planning-cases，不在本阶段造已执行用例。新UX编号从E2E-27起，旧1～26不重编号；4.7可为不同分支拆例，但不能减少下表责任。runner的UX-SLICE/UX-IAT/UX-MEDIA-SAVE/UX-UI/UX-ALL是分组入口，必须展开具体场景/证据，不是可直接记作PASS的空壳。

4.7已细化为[39条真实旅程](../../tests/receiver-ux-v2/e2e-user-journey-plan.md)和[运行手册](../../tests/receiver-ux-v2/e2e-runbook.md)，本地32/用户现场7。SRC-01为本段既有等待/重复/恢复责任的测试装置澄清；36任务/35 Waves不变。T6另外锁定15秒正常推进及30秒Receiving所需长实时样本，主128KiB性能录像及冻结method不变。A/B基线A旧UI不要求新增UX投影，候选B须检查新UX；两侧原业务约束均必查。阶段8最终包复核不作为阶段5循环前置。

| 必验交互 | 真实操作/可观察出口 | 与注入测试边界 |
|---|---|---|
| 等待→开始有数据 | 原发送端先无有效码至少5秒，再播放足够长码流；文字、用时、速率变化有时序证据 | 不把静态演示或只有图像帧当收到文件 |
| 重复有效码 | 固定真实有效码持续≥8秒，仍有识别速率但估计不虚增/有依据才提示无进展 | 真码先确认data；不能把no_data替代重复data |
| 无有效数据→恢复 | 用受控源切成真实空白/无有效码≥5秒，速率≤3秒自然归零，随后恢复原发送输入 | 最小化可能只冻结重复码，不能未经观测称无数据 |
| 普通/慢帧、后台返回 | 普通帧无闪处理态；前台无snapshot时用时继续；隐藏后回前台按当前时点刷新 | 慢帧/坏clock无法自然构造时为IAT，不能卡死业务造假 |
| 录像位置/结尾 | 真实录制经file input导入，媒体位置与重建比例分别显示，EOF不足时未完成，完整时实际Ready | 原最后有效帧/前缀一致性证据仍按当前完整矩阵 |
| 保存取消/恢复 | Ready→真实选择器取消→产物仍在→再次保存→文件外部SHA相等，焦点可继续操作 | write/close异常不能安全自然构造时单列IAT，不冒充系统操作 |
| 停止/切换 | 接收中停止、清理后从另一按钮重开；旧数字/tick/回调不污染新会话 | 迟到异常消息以IAT补，真实切换仍必须执行 |
| 中文/窗口/键盘/辅助技术 | 真实页面使用、无需英文日志；Tab/Enter/焦点可见、保存取消后焦点回可执行操作 | DOM/原型通过不代替真实浏览器/屏幕阅读器 |

真实浏览器视口基准：1280×800和768×700（100%缩放）、380×720（100%）及1280×800（200%缩放）；窗口/CSS viewport与DPR实记，标题/长中文文件名至少80字符，页面主要控件不遮挡且无需横向页面滚动。系统picker不计页面布局。按760/380断点核对、44px目标、滚动可达；活动preview不能隐藏。实际Windows Narrator或本机可用屏幕阅读器执行一次主状态变化/数字持续刷新检查，记录工具/版本及结果，环境缺失NOT_RUN。

前台观测容差1000ms：无新snapshot时用时至多1秒可见变化；从最后真实data起速率3秒内归零（取证允许1秒采样误差）、5秒无data提示、8秒可信比例不增提示。确定性单测严格按契约边界，不使用此取证容差放松数学。后台浏览器节流单独记录，恢复后按当前时间纠正；不承诺后台精确刷新。

真实E2E使用正常浏览器和系统源选择/保存；原file input的浏览器级setInputFiles可作为自动化等价选文件，另至少一次原生文件选择器和保存选择器手工/工具操作。DataTransfer假change、直接帧注入、mock文件句柄仍只是IAT。外部SHA对实际文件计算；任何状态图、report探针、unit通过都不能代替原发送端到实存文件闭环。

### R — 复核、整改、提交及重跑

审查产物固定记录“问题/原因/建议修改、代码位置、证据、DoD与复验”；自改只处理本轮问题，先补能暴露问题的断言，保留失败与新attempt。无问题记录NO_CHANGE，不造空代码提交。内部审查不能消费自己写的PASS跳过真正验证。

每项完成时先检查`git diff --check`、实际命令完整退出码与输出，再选择本任务文件暂存/本地提交；不要`git add .`，不暂存用户并行更改。提交独占git-index，阶段5不merge/push/release。示例（具体文件取本任务files，经git diff确认）：

```powershell
git add -- web/desktop-recv/src/ux-telemetry.js web/desktop-recv/tests/unit/ux-telemetry.test.mjs
git diff --cached --check
git commit -m "feat: calculate honest receiver observations"
```

每任务建议提交标题见明细；RED测试提交明确红灯性质，未实现时不能交付为最终绿灯。TDD骨架在4.5仅为规划，不进入生产路径充当桩实现。生产模块中不留TODO/mock/临时进度；不自动生成测试PASS。

修复后按影响重跑：模型/worker/client/session/app改变→相关unit/IAT及本轮双输入/停止/保存/EOF真实路径；数值或tick/UI改变→A/B/真实界面相关项；公共启动清理改变则最终旧E2E-1～20全量新构建复跑。本次最终候选安排全量一次，后续无产品字节变化的纯说明/包装调整仅补交付表面检查；如果证据与最终构建不一致，T36拒绝本地完成。

## Traceability and downstream boundaries

| 路线图任务（阶段5的20项） | 本计划任务 |
|---|---|
| T1.1.a | T7、T8、T11、T12 |
| T1.1.b | T7、T8、T11、T12 |
| T1.2.a | T9、T11、T12 |
| T1.2.b | T7、T10、T11、T12、T34 |
| T1.2.c | T13 |
| T2.1.a | T14、T15、T17、T18 |
| T2.1.b | T14、T15、T17、T18 |
| T2.1.c | T14、T16、T17、T18、T19、T34 |
| T2.2.a | T20、T21、T23、T24 |
| T2.2.b | T20、T21、T23、T24 |
| T2.2.c | T20、T22、T23、T24、T25、T34 |
| T3.1.a | T26、T27、T29、T30 |
| T3.1.b | T31 |
| T3.2.a | T28、T29、T30、T31 |
| T3.2.b | T29、T30、T32、T33、T34 |
| T3.2.c | T36 |
| T4.1.a | T1、T2、T3、T4、T5 |
| T4.1.b | T6 |
| T4.1.c | T35 |
| T4.2.a | T36 |

全部10条新AC在任务ac字段覆盖，R-01～12在`runtime-case-map.json`逐条绑定实际test/case/manifest/attempt/证明文件，初值NOT_RUN；编号与[契约向量](../../design-catalog/receiver-ux-v2/contracts/validation-vectors.json)一致。验证运行映射由阶段4.5进一步细化，不能在本阶段代写已通过证据。

| Runtime requirement | 实施/验证责任任务（全部待执行） |
|---|---|
| R-01 | T7、T8、T10、T16、T34 |
| R-02 | T7、T8、T16、T22、T25、T34 |
| R-03 | T14、T15、T16、T19、T34 |
| R-04 | T14、T15、T16、T34 |
| R-05 | T7、T8、T16、T19、T34 |
| R-06 | T14、T15、T20、T21、T22、T25、T35 |
| R-07 | T7、T8、T14、T15、T19、T31 |
| R-08 | T14、T15、T16、T19、T31 |
| R-09 | T20、T21、T22、T25、T34 |
| R-10 | T7、T9、T10、T19、T22、T31 |
| R-11 | T9、T10、T26、T27、T28、T31 |
| R-12 | T1～T6、T13、T25、T31、T35、T36 |

| 路线图下游任务 | 执行阶段/触发 | 必要出口 |
|---|---|---|
| T4.2.b | 阶段6，T36候选实际可送审后 | 独立审查新round，沿用全局ext_rounds连续性；不覆盖旧裁决；不通过回阶段5整改 |
| T4.2.c | 阶段7/8，仅外审通过 | 原分支流程、独立`libcimbar-desktop-receiver-1.1.0-<实际时间>`目录及ZIP、包内SHA和真实解压入口/双输入/保存/中文空格路径烟测；相同产品字节复用完整证据并补包装验证 |
| T4.2.d | 最终包可用后用户现场执行 | 云桌面→宿主机真实体验/实存SHA和适用原E2E-21～26；现场未执行继续NOT_RUN，既有成功口述不能代填 |

阶段5只有36项实施任务，没有提前将上述三项计入本地完成条件。外审通过是阶段7/8前置；用户现场结果单列，不妨碍如实送审，但不能声称未执行部分已通过。

## Entry, completion and handoff

进入阶段5：本计划及用户选择的4.5/4.7产物全部冻结；TDD选择在下一确认门记录，真实E2E是既有确认验收义务，不能因可选技能标签静默删除。36项任务无先行执行；4.5补测试方案/骨架，4.7补真实操作计划/机器清单后，标准通道A再交Claude从阶段5继续。

阶段5出口：36项适用DoD实际完成，内部审查0 Blocking，所有必需单元/集成/真实本地旅程与预注册性能规则满足，真实SHA/构建/attempt能复核，缺口仍如实呈现。现场独立状态及阶段6外审不代填。具体核验输出与限制写本轮送审总结，根索引导航到本轮，避免误读旧完成状态。

计划编制核验见[implementation-qa.md](implementation-qa.md)、[本阶段Todo](implementation-todo.md)和[规划导航](README.md)。当前没有新产品测试、真实E2E、性能A/B或现场结果。

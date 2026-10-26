# Round-12 外审整改台账（阶段 5 整改轮）

> 来源：`docs/dev-pipeline/ext-review/round-12-verdict.md`（2026-10-26，codex-gpt-6）——**不通过，5 个阻断主题**。
> 本台账逐条登记整改义务、落点、DoD（以 verdict 原文为准）与状态。整改轮结束时每条必须以新构建证据关闭；
> 未关闭项如实保留，不得改记录文字绕门禁。

## 阻断主题与建议总览

| 编号 | 主题（verdict） | 分类 | 状态 |
|---|---|---|---|
| A-R1 | 当前 report 失效后仍冒认旧百分比可判定 | Blocking（规格轴） | **CLOSED**（d22682e；root11 E2E-36 截图实证） |
| A-R2 = B-01｜共享 250ms 节流把未绘制数值记成已绘制，终态也无法收敛 + lastBusiness 从不提交 | Blocking（双轴高置信） | **CLOSED**（d22682e + 00c5d57 Option B；A/B min gap 250.2-250.3ms、IAT-04-A5 GREEN） |
| A-R3 | E2E-38 实时 10 侧并未持续 Receiving 30 秒，却全部 VALID | Blocking（规格轴） | **CLOSED**（5935079+5381d35；root11 实时 10/10 VALID、窗口 30127-30181ms；含 1ms 观测容差披露） |
| A-R4 = B-03｜E2E-35 缺少真实后台步骤，替换断言后仍记 PASS | Blocking（双轴） | **CLOSED（按用户裁定）**（9cfc9cc+21f5a65：三装置探针不可构造，如实 NOT_RUN+授权入档，不修订用例） |
| B-02 | UX 总门禁会接受不相等实物、缺必测步骤和无测量数据 | Blocking（标准轴） | **CLOSED**（5935079；自测 55→65 含裁决三负例+覆盖+测量负例；root11 门禁恰 4 条授权缺口） |
| S1 | UX-IAT-08 状态与原因不一致（过时原因文字） | 建议 | **CLOSED**（5935079，原因如实；保持 NOT_RUN） |
| S2 | measure-ux.mjs 纯计算/校验与运行装置拆分 | 建议 | **CLOSED**（5935079：measure-ux-calc.mjs + 门禁 --recompute 复用） |

## 逐项整改义务（DoD 以 verdict 原文为准）

### A-R1 — 报告降级显示语义

- **落点**：`web/desktop-recv/src/ux-view.js` `projectProgress`；测试 `web/desktop-recv/tests/unit/ux-view.test.mjs`（UX-UT-023 重写为断言模型→视图输出）、`ux-telemetry.test.mjs`。
- **修复方向**：视图以 `lastDataAtMs > trustedAtMs` 推导"当前报告已降级"（good report 刷新 trustedAtMs；数据帧无条件推进 lastDataAtMs；不新增 schema 字段），进入 `kind='unavailable'`（隐藏百分比、标降级码）。历史基线保留：`.6→empty→.5` 仍锁 19006。
- **verdict DoD**：区分历史可信基线与当前报告质量；empty/unavailable 时隐藏当前百分比并明确不可判定，历史基线仍用于恢复后的回退检测。补真实模型→视图组合回归：`.6→empty/unavailable→.7 恢复`；`.6→empty→.5 仍锁回退`；速率及原 frame/产物结果不受影响。相关 UT/IAT 和真实双输入反馈在整改后构建上复验，禁止仅修改测试名称或放宽契约。

### A-R2 = B-01 — 显示提交语义与终态收敛

- **落点**：`web/desktop-recv/src/ux-display.js` `maybePaintTelemetryFrom`/`paintBusinessFrom`/`scheduleFor`；测试 `ux-display.test.mjs`。
- **修复方向**：缓存只代表"已成功提交给显示层"的值（gate 阻塞不写缓存；paint 失败不写入）；lastBusiness/announcedKey 成功绘制后更新（相同视图不重复写）；终态（离开 Receiving/Draining/Reconstructing）先收敛最终投影再释放 timer；250ms 共享边界只在成功写后推进。
- **verdict DoD**：缓存只能代表成功提交给显示层的值；节流丢弃不得丢最新待显示投影，paint 失败也不得冒充已显示。完成/停止后的最终指标须收敛，同时保留事件/tick 共享 250ms 数字边界、业务按钮/终态即时、业务逻辑零重入、最终 timer 释放。补"gate 内变化后持平""gate 内 Ready/Stopped""paint 失败后恢复"的真实模块断言，并以真实 Ready 截图及状态/数值时间线复验。

### A-R3 — 实时腿持续 Receiving 30 秒判据与校准样本

- **落点**：`tools/desktop-recv/e2e/live-legs.mjs`（probe/judgeSide）、measure-ux 实时腿调用方、`tools/desktop-recv/tests/measure-ux.test.mjs`（反例拒绝回归）、新运行根 measurements 与 fixtures-provenance。
- **修复方向**：①判据：窗口内全部采样 `state='Receiving'` + sessionSeq 恒定（probe 增加 sessionSeq）+ 窗口内真实结算；提前 Ready ⇒ 采样即停、如实记窗口不足、不补睡、不判 VALID。②校准并锁定足够长 live 样本（1MiB 难压缩，自然接收 ≥30s；128KiB 录像 ~18s 不足），SHA 入 fixtures-provenance。③现存 10 份反例形状的拒绝回归。④AB/BA/AB/BA/AB 完整重跑 5 对 + 真实停止；重算 summary、E2E-38 及全部引用。⑤主录像数值 A/B 在新构建同轮重跑。
- **verdict DoD**：以足够长且执行前锁定 SHA 的真实样本校准；判据核实同一 session/seq 连续 Receiving 至少 30 秒，并有该窗口内真实结算及候选反馈时间覆盖。提前 Ready 不得补睡成有效轮，须按冻结失败/无效轮规则保留原件。为现存 10 份反例增加拒绝回归，再按 AB/BA/AB/BA/AB 完整重跑 5 对及真实停止；重算 summary、E2E-38 和所有引用，保留失败原 attempt。主录像方法及阈值不得为了实时腿消红而改写。

### A-R4 = B-03 — E2E-35 真实后台可见性

- **落点**：`tools/desktop-recv/e2e/ui-journeys.mjs` E2E-35 装置。
- **修复方向**：headed Chromium CDP `Browser.setWindowBounds windowState:'minimized'` 真实最小化 → 真实 hidden；恢复 'normal'+bringToFront；页面自身 `document.visibilityState` 只读不注入。若真实后台不可构造 → 必测分支与整例按真实覆盖标非 PASS 并同步汇总，同时向用户升级（范围决策须用户批准并修订计划）。
- **verdict DoD**：在允许真实后台可见性变化的独立浏览器装置验证 S02/S03，留 hidden/visible、恢复时间及指标重算轨迹，不注入 document.visibilityState。若当前确不可构造，必测分支和整例按真实覆盖标非 PASS 并同步汇总；如需改变范围，应取得明确范围决策并修订计划。不要只改 notes 而维持原义务 PASS。

### B-02 — UX 总门禁

- **落点**：`tools/desktop-recv/verify-ux-evidence.py`；新 `tools/desktop-recv/e2e/measure-ux-calc.mjs`（纯计算/校验拆分）；`tools/desktop-recv/tests/ux-evidence-selftest.py`。
- **修复方向**：①file_roundtrip 磁盘重算后比较原/收 SHA 相等；②必测步骤/子断言覆盖（冻结 id 集 `{caseId}-S{i}`，覆盖=恰等或单大写字母子后缀；未知/替换 id 违规）；③measurement 复算绑定当前方法/构建/attempt 的完整原始配对与实时窗口，经纯模块 CLI 重算阈值与硬不变式。
- **verdict DoD**：在磁盘重算后比较原/收字节或摘要相等；冻结每例必测步骤/子断言映射并核完整覆盖，未知/替换项不得冒充被删义务；测量校验绑定当前方法/构建/attempt 的完整原始配对及实时窗口，复用计算器重新计算阈值和硬不变式。上述负例、raw 阈值超限、缺 pair、提前 Ready、缺后台步骤、篡改 summary 均应非 0，正例仍通过。保留所有历史失败/NOT_RUN，不修改记录文字绕过门禁。

### S1 / S2（建议）

- S1：`iat-suite.mjs` UX-IAT-08 占位原因文字修正（保持 NOT_RUN；不假 PASS）。
- S2：measure-ux 纯计算/校验与运行装置拆分（服务于 B-02③复算复用）。

## 批次与执行顺序

1. **B-R12-1** 产品 TDD（A-R1 + A-R2/B-01）：先 RED（裁决反例转测试）→ GREEN。
2. **B-R12-2** 工具 TDD（A-R3/A-R4/B-02 + S1/S2）：负例先 RED → 修复 → 全绿；桌面小样机验证 CDP 最小化与校准样本可行性。
3. **B-R12-3** 新运行根 `docs/tests/runs/20261026-teamexec-10`（新 attempt，新 manifest）全量复验：单元/工具/自测/契约/IAT（含新组合 IAT）/真实全矩阵/主录像 A/B 5 对 + 实时 5 对（新样本新判据）/双门禁；更新 summaries、runtime-case-map、reproduction、release-candidate-manifest。09b 只读保留失败原件。
4. **B-R12-4** 阶段 5 整改出口确认门（用户确认）→ round-13 送审包。

## 纪律

- verdict 原文是 DoD 唯一来源；本台账若与 verdict 冲突以 verdict 为准。
- 旧 run 只读（09b 的 held 记录与 10 份实时反例 raw 为失败原件保留）；不改冻结方法/阈值；cases/*.json 步文本不动（状态回填允许）；lead 独占提交；绝不 push。

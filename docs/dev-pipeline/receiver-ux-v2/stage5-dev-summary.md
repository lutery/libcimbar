# 阶段 5（team-exec）开发总结

来源：各批实施报告（b1-t1 … b10-t36，见第 1 节）与 09b 证据根（results.json / ux-results.json / measurements）
日期：2026-10-25　分支 receiver-ux-v2　基线提交 9e4fbc4（v1 1.0.0 之后）；最终 HEAD 5f2aa89
运行根：09b（docs/tests/runs/20261025-teamexec-09b，最终候选，product manifest 9e2595e6…，attempt candidate-20261025-04）
边界备注：本文件与 runtime-case-map.json、planning-cases.json 的最终回填一致；tdd-ledger 合并由 lead 负责（本车道不写 tdd-ledger*.json）。

## 1. 实施范围（36 任务全景，引用各批报告）

| 批 | 任务 | 通道 | 报告 |
|---|---|---|---|
| B1 | T1-T6 | tools（T4 为审查收口） | b1-t1/t2/t3/t5/t6-report.md（+b1-t1 等 RED 证据 red-logs/） |
| B2 | T7-T12 | prod+tools 混合 | b2-t7..t12-report.md |
| B3 | T13 | tools | b3-t13-report.md |
| B6 | T14-T19 | prod+tools | b6-t14..t19-report.md |
| B7 | T20-T25 | prod+tools | b7-t20..t25-report.md |
| B8 | T26-T31 | prod+tools（含 T31b/T31c） | b8-t26..t31c-report.md |
| B10 | T33-T35(+T36 本总结) | tools | b8-t33-report.md、b10-t34/t35-report.md |

任务台账与逐任务证据见 tdd-ledger.json（lead 合并）；每任务的 RED→GREEN、审查整改与实跑命令在其批报告中。

## 2. 审查与整改轮（6 次，0 Blocking 残留）

| 轮 | 审查文件 | 结论 → 整改收口 |
|---|---|---|
| round 15 | review-tools.md | 2 Blocking（启动期按进程名/端口杀进程；README 冻结历史 smoke 指示）→ T5 整改（process-guard pids+命令行标记回收、busy 端口显式拒绝；README 改绑定候选 context）→ review-tools.md 整改节 |
| round 16 | review-slice.md | PASS，0 Blocking（第一切片旅程+真实保存闭环） |
| round 17 | review-metrics.md | PASS，0 Blocking（4 Suggestion 后续吸收） |
| round 18 | review-media-save.md | PASS，0 Blocking（S1 IAT 接线缺陷由 T25 期修复并复验） |
| round 19 | review-ui-perf.md | Blocking 2（B1 采样下限/时域，B2 观察器身份偏置）→ T30 工具侧整改 + 45/45 复验收口（review-ui-perf.md 收口（T33）节） |
| round 20（final） | review-final.md | Blocking 1（记录契约）→ T33 整改后最终门禁仅剩 E2E-37 环境项 ×2（见第 4 节） |

6 份审查文件的收口节/verify 输出均以其文件为准；round 计数器 6 次全部收口，0 Blocking 残留。

## 3. 测试总账

- **单元/工具**：`run-unit --all` 12 套 202 例（contracts 7、session 40、scheduler 6、worker 14、client 15、save 8、video 17、ui 13、evidence 36、ux-telemetry 22、ux-view 17、ux-display 7）exit 0；tools 专项 3 文件 61 例 exit 0。
- **自测**：verify-evidence-selftest 14/14；ux-evidence-selftest 55/55；video-prefix-check --selftest 3/3。
- **IAT**：UX-IAT-01..07 PASS（09b attempt 21ac1a）；UX-IAT-08 如实 NOT_RUN（T34 裁定：实质由 09b attempt-04 真实 A/B+5×30s 实时腿覆盖，占位保持 NOT_RUN）。
- **E2E（本地）**：32 项本地 = legacy E2E-1..20 全 PASS（09b/results.json，各案独立 attempt）+ UX E2E-27..38 共 12 条记录 = 11 PASS + E2E-37 如实 NOT_RUN。
- **测量（冻结方法 recipe F）**：录制 A/B 5/5 对 PASS（readyMs/RTT p50/p95 三阈值全过，余量文档在 b8-t31c-report.md）；实时 5×30s 腿 10/10 侧别 VALID（maxInFlight=1、遥测写间隔 ≥250ms、停止时钟冻结）；attempt-03 失败原件保留。

## 4. 双门禁实跑输出（原文）

Legacy（v1 出口）：

```
> python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261025-teamexec-09b --gate local --planning docs/tests/receiver-ux-v2/planning-cases.json
GATE local: PASS (20 required cases)
```

UX（配方 A 出口）：

```
> python tools/desktop-recv/verify-ux-evidence.py --context docs/tests/runs/20261025-teamexec-09b/run-context.json --gate local
UX GATE local: FAIL (2 violation(s))
  - E2E-37: the local gate requires result PASS (got 'NOT_RUN')
  - E2E-37: executedBy must be executor per the plan (got None)
```

UX 门禁 exit 1 的 2 条均为 E2E-37 环境缺口（语音核验无法程序化替代，属现场批次）；其余全部格式违规在 T33+T35 清零，20 required legacy 全 PASS。

## 5. 现场 7 项 NOT_RUN 声明

E2E-21..26 与 E2E-39（real_cloud/field 门）按冻结计划由用户现场执行（真实云桌面场景、真实 Narrator 使用等），代理会话无法核验真人感知效果与真实语音输出，按纪律保持 NOT_RUN，未占位、未伪造。planning-cases.json 中这 7 行未回填（保持 NOT_RUN/null/无 attemptId）。

## 6. 遗留（不属本阶段收口范围）

- E2E-37 两条 UX 门禁违规：需真实用户（现场批次）执行后消除。
- 现场批次 E2E-21..26/39 待用户执行。
- UX-IAT-08 占位 NOT_RUN（实质覆盖已达成，占位记录如实保留）。

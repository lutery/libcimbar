# 外审交付包 — Round 1

> 按 dev-pipeline 阶段 6 生成。外部审查者请只读本清单内材料；结论按
> `round-1-template.md` 的固定章节输出到 `round-1-verdict.md`。

## 审查对象

| 项 | 值 |
|---|---|
| 仓库/分支 | libcimbar · `screen-capture-recv` |
| 基线 | `master`（上游 `bfb0c8e`） |
| 范围 | `master..HEAD` = **34 个提交**，149 文件，+22,547 / −9 |
| 交付物 | 桌面接收端（浏览器内、双输入、单会话、严格 EOF）+ 证据工具链 + 现场手册 |
| 阶段 5 内部审查 | 6 轮，最终 round 6 **APPROVE（0 Blocking）** |

## 材料清单

| 类别 | 路径 | 用途 |
|---|---|---|
| 变更集 | `git diff master..HEAD`、`git log --oneline master..HEAD` | 审查主体 |
| 需求与验收 | `docs/requirements/requirements-spec.md`、`docs/requirements/decision-log.md` | AC-001..014 |
| 设计契约 | `docs/design-catalog/` 全目录（重点 `contracts/receiver-v1.schema.json`、`contracts/error-codes.json`、`module-contract-error-matrix.md`） | 冻结契约 |
| 实施计划 | `docs/plans/2026-10-18-desktop-receiver-implementation.md`（24 Task，20 项基础任务已实施） | 计划符合性 |
| 测试方案 | `docs/tests/test-plan.md`、`test-cases.md`、`acceptance-tests.md`、`e2e-user-journey-plan.md` | 测试纪律与 26 条旅程 |
| 内部审查报告 | `docs/dev-pipeline/review-round-1.md` .. `review-round-6.md` | 已知问题与关闭证据 |
| 技债登记 | `docs/dev-pipeline/tech-debt.md`（TD-01..14） | 显式延期项与硬性关闭点 |
| 本地运行证据 | `docs/tests/runs/20261018-teamexec-01/`（environment、baseline、cmd-02/05 日志、iat-results×2、results.json、measurements.json、support-matrix.md、red-evidence.md、proof/） | 机器可复核证据 |
| 现场套件 | `docs/tests/field-guide.md`、`docs/tests/field-receipt.json` | 现场阶段（未执行） |
| 候选包 | `build-desktop-recv/staging/receiver/`（被 build*/ 忽略，不随 git 交付）+ `DELIVERY-MANIFEST.txt` | 24 文件含摘要 |

> 注意：`build-desktop-recv/` 不在提交内（`build*/` 忽略）。外审若需核对候选包，请运行
> `pwsh -NoProfile -File tools/desktop-recv/stage.ps1 -RunId <id> -Mode development` 后
> `-Mode candidate` 重新装配（需要 WSL2 构建目录；见 `baseline.md`）。

## 关键主张与对应证据

| 主张 | 证据 |
|---|---|
| 严格 EOF：截断与完成可区分 | `src/lib/compression/zstd_decompressor.h`、UT-049..054、`cmd-02-gate.log` |
| 运行时资产摘要校验（C-07/M06） | `worker/decoder-worker.js`、UT-024、IAT-03（18002 负向） |
| 真实录像往返 | IAT-05：真实 MediaRecorder WebM/VP9 编码 → 7538 字节产物；与直解帧 **sha256 一致** `a0310e43…`（`iat-results-batch-d.json`） |
| 单会话/停止收敛/晚授权清理 | UT-007..012、T2.2.a-1/-2、T2.2.b-6、IAT-04 |
| 保存语义 | UT-025..030、T3.2 状态机、`save-controller.js` |
| 证据纪律 | `evidence.js` + UT-043..048；CMD-09 诚实 FAIL(18) |

## 复跑命令

```powershell
node tools\desktop-recv\run-unit.mjs --all                 # 8 套件 60 例
node tools\desktop-recv\verify-assets.mjs                  # CMD-04
python tools\desktop-recv\verify-evidence.py --run docs\tests\runs\20261018-teamexec-01 --gate local
#   CMD-09：当前预期 FAIL(18) - E2E-3..20 需真人对话框（TD-12）
pwsh -NoProfile -File build-desktop-recv\staging\receiver\launch.ps1 -Port 8766 -NoBrowser
#   浏览器打开 http://127.0.0.1:8766/tests/browser/index.html → IAT-01..05
```

## 明确的未完成/未验证（勿按已完成审查）

- **TD-12**：UAT-L03 真实窗口 + 系统保存 + 双侧哈希（需真人；关闭前不得声称"本地全功能通过"）
- **TD-01**：帧看门狗未实现（硬性关闭点=现场阶段前）
- 现场 E2E-21..26：未执行，全部 `NOT_RUN`
- 性能阈值：未冻结，`NOT_EVALUATED`
- MP4/H.264、Edge 系统对话框、其他 DPI/缩放：未验证（support-matrix 明确列出）

## 建议外审工具（中立，供自选）

`production-code-audit`（全库生产级审计）、`security-review`（OWASP 清单）、`agnix`（agent 配置 lint）。

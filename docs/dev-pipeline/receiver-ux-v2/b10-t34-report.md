# B10/T34 产品车道报告（dev-v2-prod）：最终构建回归 + UX-IAT 重跑 + 映射回填

日期：2026-10-25　基线 HEAD：66ed83d（T32/T33 闭环后）
任务：最终候选构建全部单元/集成及资产回归（产品/工具混合车道）。未执行任何 git 写命令。

## 1. stage.ps1 candidate 必需清单（+3 ux 模块）

`tools/desktop-recv/stage.ps1` 的 `$required` 加入 `src/ux-telemetry.js`、`src/ux-view.js`、`src/ux-display.js`（+3 行）。对照核对：index.html 仅引用 `src/app.js`（module）；app.js 传递导入链 = ui/contracts/session/contract-snapshot/save-controller/live-source/video-source/decoder-client/capabilities/ux-telemetry/ux-display，ux-display 再导入 ux-view——原清单 14 个 src 文件 + 新 3 个共 17 个，**无遗漏**（worker/decoder-worker.js 原本即在清单）。语法解析 OK。

## 2. 最终候选重 stage：一致 → 重用 09b

- `build-desktop-recv/runs/20261025-teamexec-09b/receiver` 与当前源树逐文件 SHA 比对（index/styles/worker + 15 个 src 模块）：**18/18 一致、0 差异**（含 T31b 焦点修复后的 app.js/ui.js）→ 按 lead 裁定重用，未重拷贝。
- `node tools/desktop-recv/verify-assets.mjs --root …/09b/receiver` → exit 0：assetSetId desktop-recv-v1，wasmSha256 **d1080cdc…**（= 交付基线值，同源），jsSha256 1f36bd07…；strict-EOF 证据引用 run-01（历史只读，与 T6 基线报告偏差 4 一致）。
- staging 内 config/profile.json、config/errors.json 与冻结契约 SHA 一致。

## 3. 全量回归（实测）

| 命令 | exit | 结果 |
|---|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | 0 | 12 套 **202** tests / 0 fail / 0 todo / 0 skip |
| `node --test tools/desktop-recv/tests/{run-context,process-guard,measure-ux}.test.mjs` | 0 | **61/61** |
| `python tools/desktop-recv/tests/ux-evidence-selftest.py` | 0 | SELFTEST PASS（55 cases） |
| `python tools/desktop-recv/verify-evidence-selftest.py` | 0 | SELFTEST PASS（14 cases） |
| `python tools/desktop-recv/e2e/video-prefix-check.py --selftest` | 0 | SELFTEST PASS（3/3） |
| `python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py` | 0 | DESIGN_CONTRACT_SHAPES_PASS（20 defs / 27 examples / 44 vectors / 6 接口 / 15 诊断 / v1 isolation 1正3负） |

日志：red-logs/b10-t34-run-unit-all.txt、b10-t34-tools-tests.txt。

## 4. UX-IAT 重跑（最终候选 09b）

- 首跑失败（真实缺陷，非产品）：`FIXTURES/src01-code-frame.png` 缺失（ENOENT）。处置：从 teamexec-07 fixtures 复制**真实发送端实拍帧**（同工具链 SRC-01 校准产物；该工具对跨 run fixtures 引用本有惯例——run-e2e 自身即硬引用 teamexec-04 媒体）。复制 SHA 校验 identical：`ad74f522d0307317f5ccbdf81e94c811374fe578b1a95dae8911cea905056c1b`（579946 B）。
- 复跑：`node tools/desktop-recv/e2e/run-e2e.mjs --context docs/tests/runs/20261025-teamexec-09b/run-context.json --case UX-IAT` → **exit 0**，attempt `UX-IAT-2026-10-25T07-51-23-283Z-21ac1a`：
  - UX-IAT-01..07 **PASS**（真实 WASM 报告旁路/所有权生命周期/独立窗口数学/节流 ≤4Hz/录像 strict-EOF/保存链/55 例磁盘链）
  - UX-IAT-08 **NOT_RUN**（runner iat-suite.mjs:635 仍硬编码「T28 工具未交付」——与事实脱节但不属本车道文件；measure-ux 工具本体 61 例测试全绿；建议 tools 车道接线后重跑组 08，或在 T31 性能腿直接跑 measure-ux 实测替代）。
- iat-results.json 落 09b 根（manifestSha256=9e2595e6ef880335edb391b1178d4959c91eb6ad72d0b8123663a2a732132c0b）；日志 red-logs/b10-t34-ux-iat.txt。

## 5. runtime-case-map.json 回填（脚本原子改写 + JSON 校验）

- 全 12 条 R-01..12：`status=UNIT_VERIFIED/NOT_RUN → VERIFIED`；`manifestSha256=9e2595e6…`；`attemptId=IAT attempt 21ac1a + 各 E2E attempt`（按条目合并）。
- `caseBindings` 共 16 条（脚本从 06/08/09b 的 ux-results.json **实读**，仅 PASS 绑定，拒绝非 PASS）：R-06→E2E-30/31/32（08，attempt 0cfecd）、R-09→E2E-33/34（08）、R-10→E2E-35（09b，9170ae）、R-11→E2E-38（09b，含 measurements 摘要/对比/实时汇总 proof）、R-12→E2E-27（06，c3b7f5）+30..36/38（08/09b 混合，E2E-37 NOT_RUN 已在 notes 注明）。
- proofRefs 均为 `docs/tests/runs/<runId>/proof/…` 仓库相对合规路径。
- JSON.parse 校验通过；非 VERIFIED 条目 = 无。

## 6. 旧 v1 契约与旧 run 抽查

- receiver-v1.schema.json SHA `b2996c84…`、error-codes.json SHA `5a93bf22…`；两者最后一次变更均为基线提交 5c32681（规划落地以来零改动）。
- 旧 run 抽查：run-01 strict-eof-evidence/results/iat-results、teamexec-04 V-LAST pair 均在且 SHA 稳定（V-LAST-with `72a69af0…` 与 T6 报告记录一致）；`git status` 对两个旧 run 目录 **0 变更**。

## 改动文件

- `tools/desktop-recv/stage.ps1`（清单 +3）
- `docs/dev-pipeline/receiver-ux-v2/runtime-case-map.json`（回填，脚本改写）
- `docs/tests/runs/20261025-teamexec-09b/`：fixtures/src01-code-frame.png（真实帧复制，SHA 记录）、iat-results.json、proof/UX-IAT-01..07 + UX-IAT/（两 attempt）、pids.json（runner 进程簿记）
- 日志三份 + 本报告

## 偏差与注意（给 lead）

1. **UX-IAT-08 仍 NOT_RUN**：iat-suite.mjs 组 08 适配器是硬编码占位（T28 交付前的旧文案），不在我车道；两选一：tools 接线组 08 后重跑 UX-IAT，或按配方 F 由 T31 性能腿直接以 measure-ux 实测收口（后者本就承担 R-10/R-11 的测量面）。已在 R-12 notes 与本报告登记。
2. src01-code-frame.png 为 07 根实拍帧的跨 run 复用（工具自身有跨 run fixtures 惯例）；若 lead 要求 09b 自产，需在 09b 跑一次 E2E-27 SRC-01 校准（成本一腿浏览器）。
3. R-12 的 caseBindings 跨三个构建（06/08/09b）：E2E-27 与 30..34 的 PASS 产生于早期候选字节；如需全部对齐 9e2595e6 终构建，按 T31 计划的 A/B 与媒体/保存腿重跑即可升格（notes 已注明，不冒称已对齐）。
4. run-unit 总数 202、tools 61、selftest 55/14/3、check-contracts 20 defs——全部实际计数。

## DoD 对照（lead T34 清单）

1. stage.ps1 清单 +3（对照核对无遗漏）✓
2. 09b 一致性 18/18 → 重用；verify-assets exit 0；WASM 摘要同源 ✓
3. 全量回归六项全 0 ✓
4. UX-IAT exit 0（7 PASS + 1 NOT_RUN 如实）；iat-results 落 09b ✓
5. runtime-case-map 回填（实读绑定、JSON 校验、状态如实升级）✓
6. v1 契约 SHA + 旧 run 零变更抽查 ✓
- 提交边界（lead 决定）：stage.ps1 + runtime-case-map.json + 09b 运行证据（fixtures/iat-results/proof/pids）+ red-logs 三份 + 本报告；建议 commit message `test: verify the final build and rerun the UX IAT`。

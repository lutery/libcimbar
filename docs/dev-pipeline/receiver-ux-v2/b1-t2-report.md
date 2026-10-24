# B1 工具车道 T2 完成报告（dev-v2-tools）

日期：2026-10-24　分支：receiver-ux-v2（T1 已由 lead 提交，81e057f）
约束遵守：未执行任何 git 写命令；未改产品代码（web/desktop-recv、worker/）；历史 run 与旧 staging 零改动。

## 文件清单

新增：
- `tools/desktop-recv/e2e/run-context.mjs`：单一 RunContext 解析器，runner/recorder/verify 三方共用。
- `tools/desktop-recv/verify-ux-evidence.py`：UX 总门禁（复用 node 解析器，最终并跑旧 verify-evidence.py）。

修改：
- `tools/desktop-recv/e2e/run-e2e.mjs`：`--context` 为必需；`--validate-only`/`--repo-root`/`--resume`/`--help`；RUN/STAGING/FIXTURES/PLANNING 全部来自 context（删除 run-03 硬编码）；未知 case 在启动浏览器前 exit 2；UX-SLICE/UX-IAT/UX-MEDIA-SAVE/UX-UI/UX-ALL 与 E2E-27..39 注册为显式未实现出口 exit 4；启动前 verifyProductManifest + initializeRunRoot（exit 3/5）。
- `tools/desktop-recv/e2e/record-sender.mjs`：同样接入 context/validate-only/repo-root/resume；`--only` 仅接受 full|last；`--payload-file` 使用真实输入文件；MEDIA 落在 fixtureRoot/fixtures-media；启动前 manifest 校验与 run-root guard。
- `tools/desktop-recv/e2e/evidence.mjs`：新增 readUxResults/writeUxResults/upsertUxResult/uxRoundtripRecord（v1 Evidence 导出与行为不变）。
- `tools/desktop-recv/stage.ps1`：新增 `-StagingRoot`（仅改接收端复制位置）；历史 RunId 拒绝；StagingRoot 禁入 product/ 与 docs/tests/runs/。
- `tools/desktop-recv/e2e/README.md`：新增 v2 命令契约、上下文字段与双证据出口说明。
- `tools/desktop-recv/tests/run-context.test.mjs`、`tools/desktop-recv/tests/ux-evidence-selftest.py`：仅修 T1 夹具自身缺陷（见“偏差”），断言未放宽。

## GREEN 证据（仓库根执行；原始日志见 red-logs/t2-green-tools.txt）

命令 1：`node --test tools/desktop-recv/tests/run-context.test.mjs`
退出码 0；关键输出：`# tests 7 / # pass 7 / # fail 0`；7 条用例全部 ok（字段契约、081 零副作用、082 中文空格传播+runner/recorder 同一 identity、083 逃逸与历史根、084 staging 分离+stage.ps1、085 resume/attempt、086 manifest 重算）。

命令 2：`python tools/desktop-recv/tests/ux-evidence-selftest.py`
退出码 0；关键输出：`SELFTEST PASS (46 cases)`。含完整 local/field 正例、逐个缺失 12 个 UX ID 的负例、空 uxRequired 反绕过、错构建/输入/运行绑定、假等哈希、scope/执行者/caseType 升级、重复/额外/旧 attempt、断言级证据、slice 冒 final、local 不代 field、未绑定 legacyThreshold 的 field measurement、UX 记录进 results.json 无效、v1 规则透传、NOT_RUN 文件字节不变。

命令 3：`python tools/desktop-recv/verify-evidence-selftest.py`
退出码 0；`SELFTEST PASS (14 cases)`（旧门禁语义未变）。

命令 4：`python tools/desktop-recv/e2e/video-prefix-check.py --selftest`
退出码 0；`SELFTEST PASS (3/3 cases)`。

命令 5：`node tools/desktop-recv/run-unit.mjs --all`
退出码 0；`UNIT SUITES PASS (9 suite(s))`；各套 7/25/6/6/11/7/15/7/36 = 120 tests，0 failed / 0 todo / 0 skipped。

## 新 CLI help/拒绝路径实测（先验证再使用）

- `run-e2e.mjs --help`=0；无参数=2；`--case E2E-27` 无 context=2（消息含 `--context`，无任何 `[receiver]/[sender]/[recorder]` 行）。
- `record-sender.mjs --help`=0；无参数=2。
- `run-context.mjs --help`=0；`--validate 不存在.json`=3（E_CONTEXT_MISSING）。
- `verify-ux-evidence.py --help`=0；无参数=2；`--gate nonsuch`=2；缺 context 文件=3（CONTEXT REFUSED）。
- 有效 context + 未知 case `E2E-999`：exit 2，消息 `scenario E2E-999 is not implemented in this runner yet`，run 根无 proof/、无 results.json。
- 有效 context + `UX-ALL`：exit 4，消息 `registered for receiver-ux-v2 but its real handler is not implemented yet; refusing to fabricate a PASS`，同样零副作用。

## 偏差与说明

1. 缺 `--context` 的退出码：初版实现为 3，实测后按帮助文本语义改为 2（参数错误）；context 文件缺失/JSON 损坏/校验失败仍为 3。T1 断言只要求非 0 且含 `--context`，未放宽。
2. T1 夹具缺陷（实现期暴露，T2 内修正，断言未变）：
   - `run-context.test.mjs` 的 `contextFixture` 在 mutate 改 runRoot 后仍按新值写夹具文件，导致 083 的 `E:/outside` 负例在临时根下 mkdir 失败；改为固定按 `docs/tests/runs/<runId>/run-context.json` 写夹具。
   - `ux-evidence-selftest.py` 两处记录级负例（越根 proofRef、空 proofRefs）缺少 `write_results` 回盘，实际验证的是旧记录；已补写回。
3. `run-context.mjs --validate` 输出 identity+context+abs（供 verify-ux-evidence.py 取绝对根）；runner/recorder 的 `--validate-only` 只输出 identity（T1 已断言两者一致）。
4. MEDIA 录像/样本根改为 `fixtureRoot/fixtures-media`；证据/结果仍写 `runRoot`。与配方 A“图像/视频、fixtures-ext、日志、原收文件、诊断都走此根”一致。
5. `--payload-file` 仅实现真实输入复制+清单登记（recipe A 命令契约）；V-LAST 校准参数与流程未改。
6. UX-IAT 的 8 个集成组与 E2E-27..39 仅注册占位（exit 4），未实现任何场景；未用空 handler 记 PASS。
7. 旧 probe/smoke 入口未重写；run-e2e 帮助文本明确其属历史诊断、非 v2 验收入口。
8. verify-ux-evidence.py 的测量记录当前只强制 `method.frozen==true` + 断言级证据；原始样本/计算器复算属 T28/T31 的 measure-ux 与后续任务，本任务未越界实现。

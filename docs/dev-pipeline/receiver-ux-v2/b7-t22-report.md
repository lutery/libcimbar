# B7/T22 产品车道报告（dev-v2-prod）：媒体与保存全链路集成

日期：2026-10-25　基线 HEAD：2b8f3a1（T21 提交后）
任务：真实模块组合集成测试 + browser 断言文件补齐 + 映射更新。未执行任何 git 写命令。

## 改动文件

- `web/desktop-recv/tests/unit/session.test.mjs`（+5 例，35→40）：真实 SaveController 组合（非 saveEvent 人工序列）：
  1. **取消保留产物 + 重试落 Saved**：真实 picker 取消（AbortError→cancelled/16002）→ Retryable、接收产物（artifactId 42）与 Blob（5B）不变；重试用同一 Blob 写入 5 字节、write+close 双成功 → Saved、模型 save.phase='saved'
  2. **close 失败不 Saved**：write 成功 close 拒绝 → Retryable（非 Saved）、save.errorCode=16006、产物 Blob 保留可重试
  3. **pending 不重开**：慢写入（write 不决）→ pending 事件 → 第二次 start 被 busy guard 拒（返回 false、picker 恰 1 次）→ release 后落 Saved（written/closed 属实）
  4. **旧保存 owner 与新接收隔离**：A 会话 selecting 后 stop；新 video 会话 Receiving 中真实帧 +625B、旧 attempt 3 failed/16005 迟到 → B 模型 save.phase 保持 none、revision 仅被真实帧 +1、业务状态机忽略旧保存
  5. **录像切换/停止/EOF 清理**：A 停止 → source.stop() 恰 1 次、client 关闭；B 经 finishStream EOF（无 artifact）→ Incomplete、新 source 恰停 1 次、旧 source 不被再碰
- `web/desktop-recv/tests/browser/ux-observation.mjs`（新，按计划文件清单补齐）：真实页面断言模块（lifecycle.mjs 同款导出形态）——九个 ux 专用 id 存在且文本驱动、aria-live 分离（announcement polite / log 与数字区非 live）、#preview 为 video 且计算样式非 display:none / 非 hidden、原按钮/输入 id 保留、空闲主文案可读；返回 record 供 IAT 适配器记录。**执行面如实说明：本模块需真实页面 harness（T19 的 iat-browser 为自含 evaluate 串、不引用 tests/browser 模块），其运行属 IAT runner（T25/T35 或 runner 侧接线）；本轮未执行浏览器，不据此宣称 IAT 已验**
- `docs/dev-pipeline/receiver-ux-v2/runtime-case-map.json`：R-06 追加 2 条绑定（T20 媒体矩阵、T22 源回收）、R-09 首次绑定 7 条（事件形状/T14-S2 矩阵/T12-S1/四个 T22 组合例），两条 status=UNIT_VERIFIED；脚本原子改写、JSON 校验通过

save/video/ux-display 三套经核对**无需新增**：save 的事件形状契约（T20）与 SaveController IO 语义（UT-025..030/080）已覆盖本轮断言面；video 的预览结构钉在 T20；display 的保存文案/节流在 T20 已落——报告如实记录，未为凑文件清单而造重复用例。

## 运行（实测）

| 命令 | exit | 结果 |
|---|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | **0** | 12 套 **180** tests / 0 fail / 0 todo / 0 skip：contracts 7 / session 40 / scheduler 6 / worker 14 / client 15 / save 8 / video 17 / ui 7 / evidence 36 / ux-telemetry 22 / ux-view 14 / ux-display 6 |
| `node --check session.test.mjs / ux-observation.mjs` | 0 | OK |
| runtime-case-map.json JSON.parse | 0 | 合法 |
| `git diff --check` | 0 | OK |

日志：red-logs/b7-t22-run-unit-all.txt。

## 事实边界（按计划 Step 3）

- 本轮全部为 unit_integration 组合（真实 SessionCoordinator + 真实 SaveController + 真实 ReceiverTelemetry，注入 picker/writable/picker 时钟）；**不据此推出系统级成功**：真实选择器、真实磁盘写、外部 SHA 比对留 T25/T35。
- ux-observation.mjs 的浏览器执行挂 IAT runner 接线（工具车道文件）；其断言面（id/aria/preview/按钮 id）与 unit 结构钉（T20 video 套件）互为补充。

## 偏差与注意（给 lead）

1. session +5 例使用真实 SaveController 与 attachSave 链（此前 T3.2 用的是人工 saveEvent 序列）——组合面首次覆盖「控制器事件→业务状态→UX 观测」三方的真实联动。
2. R-09 首次离开 NOT_RUN（7 绑定，全部 unit phase）；R-06 追加至 4 绑定。IAT/E2E 升级面按既有分工归 T34/T35。
3. ux-observation.mjs 若需进入 T19 的 iat-browser 自动组，需要工具车道在 runner 注册（本任务文件清单不含 runner，未越权修改）。

## DoD 对照（plan T22）

- Step 1 取消保留产物/写失败与 close 失败不 Saved/pending 不重开/旧 owner 隔离：✓（5 组合例全绿）
- Step 2 录像切换/停止/EOF 清理、preview 呈现、IAT 单列：✓（源回收例 + browser 模块补齐 + T20 结构钉引用）
- Step 3 --all 全绿 + 映射更新 + 系统操作留 T25/T35：✓（180 如实）
- 提交边界（lead 决定）：session.test.mjs + tests/browser/ux-observation.mjs + runtime-case-map.json + red-logs；建议 commit message `test: cover save and media lifecycle integration`。

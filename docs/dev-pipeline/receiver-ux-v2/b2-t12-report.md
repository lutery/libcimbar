# B2 产品车道 T12 完成报告（dev-v2-prod）

日期：2026-10-24　基线 HEAD：63f953f（T11 审查提交后）
任务：审查整改（lead 裁定范围：S1 save 观测接线 + T8 遗留 UX-UT-014 强化）。未执行任何 git 写命令。

## 改动文件

- `web/desktop-recv/src/session.js`（+75）：`uxSaveIntent()` 点击时捕获不可变 owner；`saveEvent` 首行旁路 `_observeSaveEvent`（selecting 绑定真实 attemptId、后续沿固定绑定送 observeSave、终态清绑定、16 条防御上限、全程 try 包裹）；未改任何业务结算分支
- `web/desktop-recv/src/app.js`（+4）：`saveArtifact()` 在 `saveController.start` 前同步调用 `coordinator.uxSaveIntent()`
- `web/desktop-recv/tests/unit/session.test.mjs`（+136）：新增 T12-S1 用例；UX-UT-014 换为受控 pending promise 的真实迟到注入
- `docs/dev-pipeline/receiver-ux-v2/review-slice.md`（+43，只追加）：节「第 1 次整改结果（T12）」

## RED → GREEN（实测）

RED：
- T12-S1 首跑：`coordinator.uxSaveIntent` undefined（接线缺失），日志 red-logs/b2-t12-s1-red.log。随后按审查给出的反例形态（Saving/Saved/Retryable readView 19014）在实现前即由「保存期间 readView 必须 ok 且 statusKey=saving_*」断言锁死。

GREEN：
| 命令 | exit | 结果 |
|---|---|---|
| `node --test web/desktop-recv/tests/unit/session.test.mjs` | 0 | 33/33（新增 T12-S1） |
| `node tools/desktop-recv/run-unit.mjs --all` | 0 | 12 套 **169** tests / 0 fail / 0 todo / 0 skip（session 33；其余与 T10 相同） |
| `node --check src/session.js / src/app.js / tests/unit/session.test.mjs` | 0 | OK |
| `git diff --check` | 0 | OK |

日志：red-logs/b2-t12-s1-red.log、red-logs/b2-t12-run-unit-all.txt。

## S1 验收断言（session.test.mjs T12-S1）

- 成功链：Ready→selecting→writing→pending→saved，readView 全部 ok：statusKey=saving_selecting/saving_writing/saving_pending/saved；save.attemptId 为真实 attempt；elapsed 冻结在 artifact（400ms，保存耗时不计入接收用时）。
- 取消链：Ready→selecting→failed+16002→Retryable/statusKey=save_cancelled（归一为取消，owner artifactId 保留）。
- 忙帧：writing 期间 writing+16008 → 仍 statusKey=saving_writing 且 save.errorCode=16008（不冒充失败）。
- 重试：Retryable 下重新点击保存（uxSaveIntent）→ 新 selecting → 回到 saving_selecting。
- 已结算 attempt 的迟到事件（writing for 8 while attempt 9 active）不夺取保存视图（save.attemptId 保持 9）。
- 业务侧：saveEvent 的 Ready→Saving→Saved/Retryable 结算逻辑零改动，既有 T3.2.a/T3.2.b 全绿。

## UX-UT-014 强化

- 实时会话 A 的第二次提交以真实未决 Promise 跨 `stop()` 停留；B 会话开始后才返回迟到回执。断言：B 模型零 accept、A 冻结模型不追溯计数、B 业务 revision/会话身份不变。替换了原先实际上已结算 promise 的 no-op 注入。

## 偏差与注意（给 lead）

1. **「已结算 attempt 的迟到 writing」用例与业务原行为冲突**：原 saveEvent 对任何 writing 事件（Retryable 状态）都会合法重入 Saving 并改写 saveAttemptId（T12 未改该业务逻辑）。因此 UX 用例改为断言「UX 保存视图保持当前 attempt 9 不被旧 attempt 8 夺取」，业务 bookkeeping 的变化按原规则保留。这是审查 S1 场景的边界澄清，不影响修复结论。
2. Saved 后不存在新的保存路径（deriveControls 在 Saved 下 canSave=false），故重试链走 Retryable 路线；若未来放开 Saved 后重存，绑定逻辑仍可用。
3. `uxSaveIntent()` 在 `SaveController.start` 同步失败（16007 无 artifact）时会留下未被消费的 owner；下次点击覆盖、`_newSession` 清空，无泄漏、无串会话。
4. 绑定 Map 上限 16（防御）；单在途保存下实际恒为 ≤1 条，终态即删。
5. S2（observeSave 模型用例）/S3（034 文档对齐）/S4（时钟边界用例）按 lead 裁定留 T14。

## DoD 对照

- 保存期间 readView ok 且 statusKey=saving_*：四步断言通过。
- Saved 仅 write+close 成功路径：saved 仅在 SaveController 发 'saved' 事件时产生；模型对 saved 事件强制 errorCode=null。
- 取消后 Retryable 可重试：断言通过，重新 selecting 回到 Saving。
- 旧 owner/attempt→19007 仅拒 UX：unbound/旧 attempt 事件静默/被模型拒绝，业务零影响。
- 12 套全绿计数如实（169）；node --check、git diff --check 全 0。
- 提交边界（lead 决定）：session.js + app.js + session.test.mjs + review-slice.md（追加）+ red-logs/b2-t12-*。

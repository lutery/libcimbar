# B8/T27 产品车道报告（dev-v2-prod）：最终中文主界面与恢复建议

日期：2026-10-25　基线 HEAD：7b1e4aa（T26 提交后；并行 T28 d747fae）
任务：T26 RED 转绿 + 完整中文矩阵。未执行任何 git 写命令。

## 改动文件（7 个；ux-display.js 经核无需改动）

- `web/desktop-recv/index.html`：`lang="zh-CN"` 与中文标题；双入口「实时抓屏 / 录像导入」、停止/保存中文（原 id/type/激活路径不变）；主区层级按 ui-spec：主状态（ux-primary/secondary）→ 重建估计（ux-progress）→ 速率/用时/录像位置（ux-metrics）→ 保存分层（ux-save）→ 产物（artifact）→ 下一步（ux-next）→ 活动 preview → 诊断折叠 `<details id="ux-diagnostics">`（#log 在内，preview 在折叠区外）→ 稳定语义播报区（ux-announcement，唯一 aria-live=polite）；原英文 #status 保留为机器探针面并视觉隐藏（.legacy-status，clip 方案，不占布局）
- `web/desktop-recv/styles.css`：长文件名/多语换行（body 全局 overflow-wrap/word-break + 文本区 min-width:0/anywhere）；760px 断点（按钮两列/指标紧凑）、380px 断点（指标单列/按钮通栏）；按钮 min-height 44px；button/summary/input :focus-visible 2px accent 轮廓；诊断折叠样式；**全文零 display:none**（clip 视觉隐藏替代；T20/T26 结构钉保持）
- `web/desktop-recv/src/ux-view.js`：完整中文文案矩阵——24 个 statusKey 主文案（18 态矩阵全覆盖）+ 24 条 secondary 原因行（无数字，静态语义）+ nextAction 全状态（waiting 建议 5000ms 边界保留、ready/saved/stopped/incomplete/save_cancelled/save_failed、receiving 族「保持发送画面可见并继续播放」）；formatProgress 改为「重建估计约 N% / 重建完成 / 数据量已达到，文件尚未完成 / 进度无法判定 / 进度暂不可用」——数字只在节流指标区
- `web/desktop-recv/src/ui.js`：新增 `recoveryTextZh(code)` 中文恢复映射（12001–12006 抓屏族、13001–13005 录像族、14003–15012 解码族、16002 取消、16003–16006 保存失败、16007/16008/16009 结算、18001–18003 资源族、默认兜底）；describeRecovery 原英文/探针语义零改动（UT-040 等原样通过）
- `web/desktop-recv/src/app.js`：showError 改用 recoveryTextZh（诊断日志中文，仍折叠、不充当恢复指令）；原业务状态机、按钮激活路径、preview 可见性分支、uxDisplay 接线零改动
- `web/desktop-recv/package.json`：version 1.1.0
- `web/desktop-recv/README.md`：重写为中文操作说明（两种输入、指标口径：识别出的编码数据含冗余 / 重建估计非文件百分比 / 已用时不含量保存耗时 / 录像位置独立、恢复路径、诊断折叠、模式 B 与端口提示）
- `web/desktop-recv/src/ux-display.js`：**未改**（SAVE_TEXT 保存分层与 250ms 节流 T20 已完整；本轮无新增需求）

## 运行（实测）

| 命令 | exit | 结果 |
|---|---|---|
| `node --test ui.test.mjs ux-display.test.mjs` | 0 | **18/18**（T26 两个 RED 转绿：入口中文、长名换行+诊断折叠） |
| `node tools/desktop-recv/run-unit.mjs --all` | **0** | 12 套 **197** tests / 0 fail / 0 todo / 0 skip（contracts 7 / session 40 / scheduler 6 / worker 14 / client 15 / save 8 / video 17 / ui 11 / evidence 36 / ux-telemetry 22 / ux-view 14 / ux-display 7；由 b8-t27-run-unit-all.txt 逐行求和） |
| `node --check` app.js / ui.js / ux-view.js | 0 | OK |
| `node -e JSON.parse(package.json)` | 0 | 合法 |
| `git diff --check` | 0 | OK |

**计数更正（如实）**：lead 派发稿引用的「184」与本人 T26 报告的「预计 184」均有误——T24 复跑已为 192（session 40），T26 新增 ui +4、ux-display +1 后应为 **197**；本次实测 197，与逐行求和一致。

## 质量守则核对（lead T27 第 7 条）

- 不伪造线性进度/倒计时：progressText 为「重建估计约 N%」，无 ETA/倒计时；enough_data 明示「数据量已达到，文件尚未完成」。
- 多流/缺报告：「进度无法判定」/「进度暂不可用」，不谎称无新块。
- 录像位置 ≠ 文件百分比：ux-media 独立文本「录像位置 x s / y%」，进度估计另列。
- Saved 仅 write+close：SAVE_TEXT/状态键来自原 SaveController 真实结算（T12-S1/T22 固化）。
- 状态播报不带高频数字：T26 全状态走查（18 语义键四字段无数字）保持绿；数字仅在 ux-metrics 节流区。

## 偏差与注意（给 lead）

1. #status 保留英文并以 clip 方式视觉隐藏：它是既有 E2E/journey 探针读取面（baseline-preflight 读 textContent），删除或改语言会破坏旧证据链；用户可见中文由 ux-primary 承担（T26 钉只要求 app.js 对该元素的赋值不变）。
2. README 全量重写，移除了 2026-10-21 的路径更正脚注（其证据在历史 run 中，属旧现场记录）；如 lead 认为需保留历史脚注，可按配方 R 恢复一节引用历史 run。
3. ux-display.js 未改（文件清单中列为候选，经核 SAVE_TEXT/节流已满足）；如需在 T31 视觉批微调样式属另一任务。
4. 真实视觉/键盘/AT 未验证：本轮仅 unit/结构面；T31 承接（含 T24 登记的「点击后焦点」）。
5. --all 总数 197 与派发预估 184 的差异原因如上报；后续报告一律以明细合计为准。

## DoD 对照

- T26 两 RED 转绿 + 完整中文矩阵（18 态 × 主/次/next）✓
- 层级/aria-live/折叠/preview 位置/断点/44px/焦点可见/换行 ✓（结构钉 + 测试）
- package 1.1.0 + 中文 README ✓
- `--all` 12 套 197 全绿 exit 0；node --check / JSON / diff-check 全 0 ✓
- 提交边界（lead 决定）：上列 7 文件 + red-logs/b8-t27-run-unit-all.txt；建议 commit message `feat: deliver the Chinese receiver interface and recovery copy`。

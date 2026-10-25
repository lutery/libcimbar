# B8/T30 产品侧报告（dev-v2-prod）：审查建议整改（S1/S2/S3/S4/S7/S10）

日期：2026-10-25　基线 HEAD：6533965（T29 审查提交后）
任务：产品侧整改（仅 web/desktop-recv；tools/ 由 perf-tooling 并行处理，未触碰）。未执行任何 git 写命令。

## 整改内容（全部先 RED 后 GREEN）

- **S1（T31 前修）formatProgress**：estimate 改向下取整——0.995/0.999 →「重建估计约 99%」，永不因四舍五入出现 100%；stale →「上次重建估计约 N%」。新增 10 个断言的单分支单测（0.995/0.999/0/0.5/stale/complete/ambiguous/unavailable/enough_data/none）。RED 证据：旧实现 0.995→100、stale 无前缀。
- **S2 quiet/unavailable 建议**：no_new_data →「检查发送画面是否被遮挡或暂停。」；progress_unavailable →「可继续接收，或检查发送源。」。断言按措辞族匹配（遮挡|暂停、继续接收|发送源）。RED 证据：原 nextAction 为空。
- **S3 #status 无障碍**：index.html 的 legacy 探针加 `aria-hidden="true"`；textContent 探针（app.js 赋值行）不变，T26 钉保持；新增结构断言锁 aria-hidden。RED 证据：原无该属性。
- **S4 恢复建议提升 + 中文化**：showError 将 `recoveryTextZh` 摘要写入可见 `#ux-secondary`（recoveryNotice：新会话 accepted 时清除；paint 时通知优先于视图 secondary，视图恢复后由下一次 secondary 变化自然接管）；诊断日志保留 code+细节（仍折叠）；#caps 横幅→「部分功能不可用：…」；产物大小→「… 字节」。结构断言 4 条锁死。RED 证据：原仅日志、英文横幅、bytes 单位。
- **S7 digit-free 全矩阵**：走查扩展为 schema 全部 **23** 个 statusKey（不是 24——receiving 的视频主文案变体不是独立 statusKey；T26 报告曾误计，本整改以 schema 枚举为准并覆盖视频变体 primary）。矩阵先红（receiving 行的时钟设置导致 stale 覆盖、视频变体误计为独立键），修正后全绿。
- **S10 登记（lead 批准项）**：aside.guide（#ux-next）桌面单列布局=批准的实现简化（ui-spec 仅要求 ≤760px 下移）；保存后焦点回归仍归 T31。已写入 review-ui-perf.md 与 exec-log.md。
- S11 属工具侧（perf-tooling），本次不涉及。

## 改动文件

- `web/desktop-recv/src/ux-view.js`（formatProgress floor/stale；两条 nextAction）
- `web/desktop-recv/src/app.js`（recoveryNotice 生命周期；showError 写可见 secondary；#caps 中文；字节单位；两入口 accepted 时清通知）
- `web/desktop-recv/index.html`（#status aria-hidden）
- `web/desktop-recv/tests/unit/ux-view.test.mjs`（+3 例：S1 单测、S2 措辞、S7 23 键矩阵；17 例）
- `web/desktop-recv/tests/unit/ui.test.mjs`（+1 例：S3/S4 结构断言；12 例）
- `docs/dev-pipeline/receiver-ux-v2/review-ui-perf.md`（追加「第 1 次整改结果（T30 产品侧）」节）
- `docs/dev-pipeline/receiver-ux-v2/exec-log.md`（追加 S10 登记行）
- 日志：red-logs/b8-t30-prod-run-unit-all.txt

注：工作树中 `tools/desktop-recv/tests/measure-ux.test.mjs` 的变更为并行 perf-tooling 代理所有，本人未触碰 tools/。

## 运行（实测）

| 命令 | exit | 结果 |
|---|---|---|
| `node --test ui ux-view ux-display` | 0 | 36/36 |
| `node tools/desktop-recv/run-unit.mjs --all` | **0** | 12 套 **201** tests / 0 fail / 0 todo / 0 skip（ui 12 / ux-view 17 / ux-display 7，其余同 T27；由日志逐行求和） |
| `node --check src/app.js / src/ux-view.js` | 0 | OK |
| `git diff --check` | 0 | OK |

## 偏差与注意（给 lead）

1. recoveryNotice 采用「paint 时通知优先」的实现：fatal 错误的通用视图 secondary 会在下一次业务投影时被通知覆盖显示；用户执行恢复动作（新会话 accepted）后通知清除，视图 secondary 在下一次变化时自然接管。若 T31 视觉批认为需要更长的驻留/独立行位，可在不改状态机的前提下调整。
2. S7 的「24→23」更正：schema statusKey 枚举实为 23 项；视频输入只改变 receiving 的主文案。以 schema 为准，报告如实。
3. 计数 201 = T27 的 197 + ux-view +3 + ui +1。

## DoD 对照

- S1/S2/S3/S4/S7 RED→GREEN，S10 登记 ✓
- 三套定向 36/36；--all 12 套 201 全绿；node --check ✓
- review-ui-perf.md 只追加整改节；exec-log 登记 S10 ✓
- 提交边界（lead 决定）：上列 7 文件 + red-logs；建议 commit message `fix: surface recovery copy and refine the estimate wording`。

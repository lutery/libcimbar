# B7 工具车道 T25 完成报告（dev-v2-tools）

日期：2026-10-25　基线 HEAD：9bc6af7（T24 提交后）。未改产品代码；真实桌面车道（真实录像/真实系统对话框/真实锁文件）。

## 实施与修复过程（配方 R）

- 实现：`media-journeys.mjs`（E2E-30..34 工厂，惰性读 run 根）+ run-e2e 接线（SCENARIOS 合并、多 id 组串行驱动、needsSender 按组并集、组内每例后 reloadReceiverPage）。
- attempt-1（日志 `red-logs/t25-attempt1-save-hooks-sessionid.log`）：E2E-34 PASS；30/31/32/33 FAIL。两个测试侧根因（产品行为符合契约）：
  1. 同页多存的页面级 save hook 不自复位（`__createWritableAccessedAt`/`__writableAt` 是页面首访一次值），第二腿的 saveRequestAt 晚于上一腿的 picker 时点 → completeLegTimings 有序性失败。v1 矩阵的既有语义即「每条保存腿前重载页面」（ensureReceiverPage 注释）。修复：组内每例后 + E2E-30 双向之间 reloadReceiverPage。
  2. 我方两处读取错误：30-A3 的 sessionId 取值三元写反（aSessionId 恒 null）；33-A3 的 fourPoints 把 createWritableAccessedAt/writableAt 当成 journey 字段（实为 pageState 顶层 hook）。
- attempt-2：全部通过（见下）。

## 产出文件

- 新增 `tools/desktop-recv/e2e/media-journeys.mjs`
- 修改 `tools/desktop-recv/e2e/run-e2e.mjs`（媒体工厂接线/多 id 组串行/reloadReceiverPage/needsSender 并集）
- media 根 `docs/tests/runs/20261025-teamexec-08`（context/双 manifest/ux-results/pids/proof/E2E-3x/<attemptId>/）
- staging：receiver=development+baseline 只读 vendor（wasm=d1080cdc…）；sender=stageVerifiedSender

## 结论

**UX-MEDIA-SAVE（E2E-30..34 逐条串行）PASS**——attempt `UX-MEDIA-SAVE-2026-10-24T22-03-26-546Z-0cfecd`，runner exit 0。五条记录（21 条 assertion）全 PASS，独立落 `20261025-teamexec-08/ux-results.json`（scope=local_simulated、caseType=file_roundtrip 按 4.7 冻结、acceptanceIds 取自 planning-cases.json；phase=media PARTIAL，不填最终门禁）。

## 各旅程实测（attempt-2）

- **E2E-30 停止/切换（6 断言，双向）**：d1 live A 指标可见（elapsed 0.1s 起表）→ 真实停止（state=Stopped、流已清）→ video B 新 owner（s1→s2）计时清零重启（0.3s）→ Ready → 真实保存 SHA 相等、save 四时点完整（timingsComplete=true）；d2（重载页面后）video A → live B 同样 owner 更换（s1→s2）、Ready、保存 SHA 相等、时点完整。
- **E2E-31 录像位置（4 断言）**：native 文件选择器 tier-3 文本探针确认键入真实路径（helperExit=0，应用侧 change 事件为判据，state=Receiving）；三时点并列可见——`录像位置 1.1s / 12%`+elapsed 2.3s+`15.8 KiB/s（含冗余）`+28%、`2.6s / 28%`+40%、`4.2s / 45%`——位置/用时/速率/估计四行分列不混用；Ready → 真实保存 SHA 相等。
- **E2E-32 EOF 不足（4 断言）**：without 导入 → 真实媒体到尾 → Incomplete（文案「数据不足，未能重建文件」）且 saveDisabled=true 无产物；停止清理 → with 导入 → Ready（artifact=131072B）→ 保存 SHA 相等；T6 pair 证据（pair-manifest.json/pair-prefix-check.json，prefix verdict=PASS）随 proof 留档。
- **E2E-33 保存取消/重试（4 断言）**：保存对话框真实停留 4944ms（≥3s，桌面截图留证）→ Cancel id 2 真实取消 → 「保存已取消，文件仍可保存」+state=Retryable+产物保留（primary-input-128k.bin）→ 新路径重存 Saved，四时点齐全（saveRequestAt/…/writeCloseAt 有限且有序）、外部 SHA 相等。
- **E2E-34 保存受阻（3 断言）**：run 根哨兵文件被 PowerShell 子进程以 FileShare.None 独占（lock.pid 留档）→ 真实 picker 选中并确认覆盖 → 实际分支如实记录：应用映射「保存失败，可以重试」+Retryable（未伪称捕获 write/close 异常细节）→ 杀锁进程释放句柄 → 新专有路径恢复保存（131072B、Saved、SHA 相等）。

## 回归与边界

- `node tools/desktop-recv/e2e/run-e2e.mjs --context …/20261025-teamexec-08/run-context.json --case UX-MEDIA-SAVE` → exit 0
- `node tools/desktop-recv/run-unit.mjs --all` → exit 0；`ux-evidence-selftest` 55/55；`verify-evidence-selftest` 14/14
- 旧 run/旧 staging/product/旧 planning 760 项 SHA **UNCHANGED**（t25-oldruns-after.sha）；运行后 0 个本轮 Edge、8771/8811/8790/9445 全释放；`git diff --check` 0
- 日志：red-logs/t25-green.txt（结果+回归）、t25-attempt1-save-hooks-sessionid.log（attempt-1 留痕）

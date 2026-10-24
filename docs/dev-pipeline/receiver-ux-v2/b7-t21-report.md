# B7/T21 产品车道报告（dev-v2-prod）：接通独立录像位置（19011 转绿）

日期：2026-10-25　基线 HEAD：T20 提交后（b5cb3cc）
任务：T20 唯一 RED 转绿。未执行任何 git 写命令。

## 改动文件

- `web/desktop-recv/src/ux-view.js`（1 行）：`normalizeMedia` 的 `mediaDiagnosticCode === 19011` 短路分支由
  `if (context.mediaDiagnosticCode === 19011) return null;`
  改为
  `if (context.mediaDiagnosticCode === 19011) return invalid(diagnostics);`
  ——该帮助函数（diagnostics.add(19011) + 返回 null）本已存在（position 数值非法分支在用），仅短路分支漏登记。其余行为零改动：position 非法分支原本就走 invalid()；duration 未知/非正仍为 {pos, null, null}；live 强制 null。

## 运行（实测）

| 命令 | exit | 结果 |
|---|---|---|
| `node --check web/desktop-recv/src/ux-view.js` | 0 | OK |
| `node tools/desktop-recv/run-unit.mjs --all` | **0** | 12 套 **175** tests / 0 fail / 0 todo / 0 skip：contracts 7 / session 35 / scheduler 6 / worker 14 / client 15 / save 8 / video 17 / ui 7 / evidence 36 / ux-telemetry 22 / ux-view 14 / ux-display 6 |
| `git diff --check` | 0 | OK |

日志：red-logs/b7-t21-run-unit-all.txt（RED 窗口关闭证据）。

## 转绿验证

T20 报告的 RED 断言（`ux-view.test.mjs` T20 媒体矩阵 `broken` 子例）：修复前 diagnosticCodes=[]，现 deepEqual [19011] —— view 套件 14/14，T20 引入的 7 例全部通过。

## 其他 R-06 相关接线缺口核对（如实，不扩大范围）

R-06（原 artifact/写盘未成功时仅比例/EOF 不得 Ready/保存）顺带复核：
- 比例≥1 无 artifact → enough_data、ratio=null、canSave=false：UX-UT-024/047 已绿（模型+视图面）。
- 录像 EOF 无 artifact → Incomplete 且保存不可用：T20 视图矩阵 `ended` 子例已绿。
- 保存侧（点击前捕获 owner、selecting 绑定、归一、终态清理）：T12-S1 + T14-S2 + T20 事件形状契约已绿。
- **结论：无其他接线缺口**；本任务零新增 RED。

## 偏差与注意（给 lead）

1. 复审注意点：`context.mediaDiagnosticCode === 19011` 时无论 mediaPosition 形状如何都返回 null（隐藏整个媒体栏）——与契约 UX-04「position 无效→整个 mediaPosition=null、19011」一致；app 侧恒传 0（T9 报告偏差 5），现代化的 app 端 19011 判定留 T31/E2E 面核。
2. 总数 175 = T20 的 175（含 1 RED）转绿，无新增用例。

## DoD 对照（lead T21 清单）

1. T20 RED 转绿（normalizeMedia 两分支均经 invalid() 并 19011）✓
2. `run-unit --all` → 12 套 175 全绿 exit 0（完成判据）✓；`node --check` ✓
3. 其他 R-06 接线缺口：无 ✓（如实记录）
- 提交边界（lead 决定）：src/ux-view.js + red-logs/b7-t21-run-unit-all.txt；建议 commit message `fix: surface the media position diagnostic through the ux view`。

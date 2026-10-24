# B6/T16 产品车道报告（dev-v2-prod）：R-01..08 对抗绑定与真实 WASM 报告 IAT 验证

日期：2026-10-25　基线 HEAD：f60f93e（T15 提交后）
任务：测试任务（探针复跑 + 真实资产 IAT 测试 + 负例缺口核对 + runtime-case-map 绑定）。未执行任何 git 写命令。

## 改动文件

- `web/desktop-recv/tests/unit/worker.test.mjs`（+104）：新增 T16 真实资产测试——用探针同款方式（VM + wasmBinary + locateFile）加载交付包 `product/libcimbar-desktop-receiver-1.0.0-20261022-2252/vendor/` 的真实 JS/WASM，剥离职钩后桥接进 worker-vm harness（worker 保留自身 on_wasm_ready），stub 唯一的 `_cimbard_scan_extract_decode`（写入探针版式的合成 fountain 包，img 需真实 cimbar 图；其余 scan/fountain/report 均为真实 IAT 导出），经真实 read_report 路径断言：单流 [0.030303] 与探针记录逐字一致、重复块不推进、新块 [0.0606061]
- `docs/dev-pipeline/receiver-ux-v2/runtime-case-map.json`：R-01..R-08 八条 status=UNIT_VERIFIED + testBindings（{suite, case, phase:'unit'}，R-01×3、R-02×3、R-03×4、R-04×4、R-05×3、R-06×2、R-07×3、R-08×3）；manifestSha256/attemptId/proofRefs 仍 null（IAT/E2E 面在 T19/T34/T35 升级）；caseBindings 空（E2E 用例属 T34/T35）
- 日志：red-logs/b6-t16-probe.txt、b6-t16-run-unit-all.txt、b6-t16-ux-telemetry.txt、b6-t16-ux-view.txt

## 验证命令（实测）

| 命令 | exit | 结果 |
|---|---|---|
| `node docs/requirements/receiver-ux-v2/probes/report-capability.cjs` | 0 | 输出与 probes/report-capability-result.json 一致（chunkSize 625、first [0.030303]、duplicateDoesNotAdvance/freshBlockAdvances/multipleStreamsHaveNoIds） |
| `node --test web/desktop-recv/tests/unit/worker.test.mjs` | 0 | **14/14**（新 T16 真实资产例） |
| `node --test web/desktop-recv/tests/unit/ux-telemetry.test.mjs` | 0 | 22/22 |
| `node --test web/desktop-recv/tests/unit/ux-view.test.mjs` | 0 | 13/13 |
| `node tools/desktop-recv/run-unit.mjs --all` | 0 | 12 套 **171** tests / 0 fail / 0 todo / 0 skip（worker 14，其余同 T15） |
| runtime-case-map.json JSON.parse | 0 | 合法（node -e 校验） |
| `git diff --check` | 0 | OK |

## 负例缺口核对（T7/T8 既有覆盖对照 lead 清单）

| 负例 | 覆盖 | 位置 |
|---|---|---|
| 坏导出（缺 get_report） | ✓ | worker UX-UT-002（19001） |
| 坏长度（-1/1.5/NaN/Inf/超出安全整数） | ✓ | worker UX-UT-003（19002） |
| 截断（fn>=1024） | ✓ | worker UX-UT-003（19003，1024/1025 两形） |
| 坏 JSON/UTF-8/负比例/字符串/>8 项 | ✓ | worker UX-UT-004（19004 整体拒绝+下帧恢复） |
| 共享缓冲覆写（解析后 HEAPU8 清写值不变） | ✓ | worker UX-UT-006（clobber 后 ratios 仍 0.75） |
| 堆增长（get_report 换堆） | ✓ | worker UX-UT-006（当前堆 [0.75] 而非旧视图 [0.25]） |
| malloc 0/抛错、get_report 抛错 | ✓ | worker UX-UT-007（19002 局部降级） |
| 有效 report 不掩盖核心失败 | ✓ | worker UX-UT-007（15007/15008 独立结算） |
| 旧 seq/重复 frame/冻结后 | ✓ | telemetry UX-UT-019、session UX-UT-014/T10 |

**结论：无缺口。** T7/T8 波次已按配方 B 的例外面完整覆盖；本轮未新增负例。

## 实现说明（真实资产测试的两处关键接法）

1. 桥接模块：`const { onRuntimeInitialized, onAbort, ...bridge } = context.Module` —— 真实导出与真实 HEAPU8 全量拷入 bridge，但钩子留给 worker 自身（harness 的 importScripts 触发 worker 的 on_wasm_ready → 真实 configure_decode(68)+get_bufsize 路径）。上下文键必须命名为 `Module`（vendor loader 找全局 Module；首跑即 RAW 失败于 'require is not defined'→createRequire、次跑 'WASM init timeout'→键名，两次真实 RED 均已归档于运行日志的调试迭代）。
2. scan stub：`_cimbard_scan_extract_decode` 参数 outPtr 直接写入探针版式合成包（chunkSize=_cimbard_get_bufsize()/12=625，mode B）并返回 625 → 真实 `_cimbard_fountain_decode` 消费 → 真实 `_cimbard_get_report` 回读。与探针的边界声明一致：此测试不证明真实抓屏/图像扫描，仅证明 IAT 入口与 read_report 路径的真实字节行为。

## 偏差与注意（给 lead）

1. 真实资产测试依赖交付包目录（T6 baseline 的 product/ 只读路径）存在于仓库；若未来清理 product/ 该测试会失败（existsSync 前置断言给出明确失败信息）。备选：CI 环境缺失时可判 NOT_RUN——本轮按"存在即验"处理。
2. testBindings 的 status=UNIT_VERIFIED 语义：仅单元面已验证；R-05/R-07 等的 IAT/E2E 升级面按 lead 说明在 T19/T34/T35。
3. 测试内 WASM init 12s 超时、test timeout 30s；--all 全量时长实测无显著回归（12 套一次跑完）。
4. runtime-case-map.json 由脚本原子改写（JSON.stringify 2 空格 + 校验通过）；diff 显示 +272 行是 testBindings 展开 + 2 空格缩进变化，字段语义无删改。

## DoD 对照（lead T16 清单）

1. 探针 exit 0 且行为与记录一致 ✓；worker 套件真实资产 IAT 测试 ✓（14/14）
2. 负例缺口：无缺口（对照表如实）✓
3. R-01..08 testBindings + UNIT_VERIFIED（JSON 合法）✓
4. 结构无需扩展（既有 testBindings 数组即 {suite, case} 形）✓
5. 三套 node --test + --all（171 如实）+ probe exit 0 ✓
- 提交边界（lead 决定）：worker.test.mjs + runtime-case-map.json + red-logs 四份；建议 commit message `test: bind R-01..08 to unit cases and verify real report IAT`。

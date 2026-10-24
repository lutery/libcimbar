# B6 工具车道 T19 完成报告（dev-v2-tools）

日期：2026-10-25　基线 HEAD：c34e99e（T18 NO_CHANGE 收口后）。未改产品代码；真实浏览器 IAT。

## 结论

**UX-IAT 全组执行完成（attempt `UX-IAT-2026-10-24T18-38-00-909Z-184ff0`，runner exit 0）**：UX-IAT-01..07 PASS（合计 30 条 assertion），UX-IAT-08 NOT_RUN（T28 measure-ux 工具未交付，不伪造）。结果独立落 `20261025-teamexec-07/iat-results.json`（scope=unit_integration，不入 v1 results.json / ux-results.json）。

## 实现文件

- 新增 `tools/desktop-recv/e2e/iat-browser.mjs`：组 01（真实 WASM + worker 内报告故障适配器）
- 新增 `tools/desktop-recv/e2e/iat-suite.mjs`：组 02-07 + 套件编排 + iat-results 写出
- 修改 `tools/desktop-recv/e2e/run-e2e.mjs`：新增 `UX-IAT` scenario（receiver-only，无 sender）；scenario-first 查找（UX-IAT/UX-SLICE 直接运行，其余组展开）
- `docs/dev-pipeline/receiver-ux-v2/runtime-case-map.json`：R-01..08/10/11/12 追加 `{suite:'UX-IAT', case, phase:'iat'}` 绑定（+116/-3，JSON 校验通过）
- metrics 根 `20261025-teamexec-07`：context/双 manifest/iat-results/pids/proof/UX-IAT-01..07/<attempt>/assertions.json

## 各组实测（要点）

- **01 真实 WASM + 报告旁路（6 断言）**：真实 DecoderClient+Worker+vendor WASM（页面内 `new Worker('/worker/decoder-worker.js')`）；T13 校准码帧（710×710）真实解码 → outcome=data（7500B），报告 `{state:'single', ratios:[0.0566]}`；空白帧 no_data 且 observation=null（不读共享缓冲）；经 CDP worker handle 在**真实 worker 内**注入四类故障（删导出→19001、-1→19002、1024→19003、坏文本→19004），每类同帧提交：**frame outcome/bytes 完全不变、仅报告降级**；还原后报告恢复；close 清 pendingSubmission。
- **02 所有权/生命周期（5 断言）**：真实模块 + FakeWorker + 手动时钟：pendingSubmission 在 post 前盖 owner/手动钟（2500ms）；重复 frame-result 在观测模型只计一次（第二次 19007）；旧 seq 喂入 19007 拒绝；finish('stopped') 后窗口关闭、后喂 19007；close 清 pending。
- **03 数据→视图精确数学（4 断言）**：独立手算期望（非实现回显）：10/20B@gen0、30B@gen1、40B@gen11、50B@gen12（环回槽 0 淘汰 gen0）；now=3250 时窗口 gens[2..13]={11:40,12:50}=90B/2750ms=32.727B/s→`<0.1 KiB/s（含冗余）`，与实现逐位一致；elapsed=3250；无数据 ≥5s 出现 no_new_data 文案。
- **04 显示调度/退化（4 断言）**：真实 createUxDisplay + 计数 paint + 真 setTimeout：业务变化即时 paint（≥2）；25Hz 快照流下遥测数值刷新 ≤4Hz（1.15s 内 ≤6 次且 ≤⌈ms/250⌉+1）；dispose 后零 paint；paint 抛错仅在 UX 层降级（19012 路径）不外溢。
- **05 录像链（4 断言）**：T6 真实录像经页面真实 file input（IAT 注入点，非 OS）：with→Ready 且 artifact=131072B；播放中 `录像位置 x.xs` 显示、preview 呈现；两次导入间真实 stop 清流；without→真实 EOF Incomplete（无 artifact，严格屏障保持）。
- **06 保存阶段（5 断言）**：真实 SaveController + 注入 picker/writable：异步 AbortError→cancelled/16002；write 失败 16005、close 失败 16006；慢写越过 pendingMs 出现 pending 相位；仅 write+close 双成功→saved；在途二次 start 拒绝 16008；失败后同 artifact 新 attempt 干净保存。
- **07 门禁 CLI 磁盘链（2 断言）**：实跑 55 例 ux-evidence-selftest（正例+缺 UX/错绑定/假哈希/越根/缺断言/阶段拒绝全矩阵）exit 0，输出落 proof/UX-IAT-07/<attempt>/ux-evidence-selftest.log。
- **08**：NOT_RUN，notes「T28 measure-ux 观测器工具未交付」。

## 尝试过程（配方 R，3 次，全部留痕）

1. attempt-1：page.evaluate 顶层 await 语法（页面端需 async IIFE）+ 组 03 独立算例**我方算错**（把窗口错算为 gens[1..12]；正确为 now=3250→q=13→gens[2..13]=90B）+ 组 04 paint 分类键错误（真实键 primary/announcement vs elapsedText）+ 组 06 取消应走异步 AbortError 拒绝。四项均 IAT 测试侧修正，产品行为经核对符合契约。
2. attempt-2：worker 枚举用错 API（`context().workers` 不存在→`page.workers()`），组 02 finish 缺 reason/artifactId 键。修复后重跑。
3. attempt-3：**PASS（exit 0）**。日志：red-logs/t19-attempt2-worker-enum-finish-keys.log（attempt-2 留档）。

## 验证命令与边界

- `node tools/desktop-recv/e2e/run-e2e.mjs --context docs/tests/runs/20261025-teamexec-07/run-context.json --case UX-IAT` → exit 0（attempt-3）
- `node tools/desktop-recv/run-unit.mjs --all` → exit 0（12 套全绿，含 ux-view 13/ux-display 5）
- `python tools/desktop-recv/tests/ux-evidence-selftest.py` → 55/55；`verify-evidence-selftest.py` → 14/14
- 语法：run-e2e/iat-browser/iat-suite `node --check` 全 0
- 旧 run/旧 staging/product/旧 planning 760 项 SHA **UNCHANGED**（t19-oldruns-after.sha）；运行后 0 个本轮 Edge、端口全释放；产品字节零改动；`git diff --check` 0
- 范围声明：IAT 全部 scope=unit_integration，注入均显式标注；不冒充真实旅程（T35 才做原发送端全链）；UX-IAT-08 留待 T28。

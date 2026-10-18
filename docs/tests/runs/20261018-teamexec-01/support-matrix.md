# 支持矩阵 — 桌面接收端首轮本地验证

runId: `20261018-teamexec-01`（随批次 F 生成；后续运行追加行，不改历史行）

> 只列**本次实际验证过**的组合。未列出 = 未验证，不声明支持（AC-014、NFR-003）。

## 已验证

| 维度 | 组合 | 证据 |
|---|---|---|
| 平台 | Windows 10.0.22631 (10.0.22631) | `environment.json` |
| 浏览器/引擎 | Chromium 155（Playwright 有界面） | `iat-results*.json` |
| 模式 | B（68） | IAT-01/05 实测 |
| 录像格式 | **WebM/VP9**（MediaRecorder 真实录制的 1.5 MB 文件完整还原 7538 字节产物） | `iat-results-batch-d.json` IAT-05 |
| 实时输入 | 合成 MediaStream 全生命周期（IAT-04）+ 真实抓屏 API 装配路径 | `lifecycle.mjs`、`capabilities.js` |
| 保存路径 | 系统选择器语义经 6 个单测覆盖（write+close、取消重试、停止不写、pending） | `save.test.mjs` |
| 启动 | loopback 启动/端口占用/缺文件恢复 | `uat-l01-l02.md` |
| 运行时摘要校验 | 篡改清单摘要 → 18002（真实浏览器负向） | IAT-03 |
| 严格 EOF | 截断/损坏/分块/小缓冲六例 + C-ABI 导出守卫 | `cmd-02-gate.log` |

## 未验证（不声明支持）

| 维度 | 原因 |
|---|---|
| MP4/H.264 录像 | 需现场真实录像；已在现场手册列为验证项 |
| Edge 浏览器端到端（系统对话框） | 需真人操作（TD-12） |
| Citrix 真实云桌面 | 现场阶段（E2E-21..26，用户执行） |
| 其他 DPI / 缩放组合 | 需真实桌面交互（E2E-9） |
| 8C/Bu/Bm 模式解码 | 发送端未产生这些模式的码流；接收端 mode 白名单已实现 |
| 性能阈值 | 测量已记录（`measurements.json`），阈值未冻结 → NOT_EVALUATED |

## 测量摘要（来自本 run 的真实数据）

| 项 | 值 | 出处 |
|---|---|---|
| IAT-05 录像文件 | 1,546,417 B（1.5s @50Mbps，1024×1024） | `iat-results-batch-d.json` |
| 产物还原 | 7,538 B，与原生 C++ 断言一致 | 同上 |
| **跨路径字节一致性** | 直接帧（IAT-01）与真实录像（IAT-05）产物 SHA-256 **相同**：`a0310e43fc6560dd6701fcb474d89244a0ce8b3730fb06dbd35e2566b250c3e5` | `iat-results-batch-d.json` |
| 单帧解码（C++ 基线） | compression_test 0.39s / cimbar_js_test 0.36s（全量套件） | `cmd-02-gate.log` |
| 吞吐/帧率阈值 | **NOT_EVALUATED**（V-002/V-003 已记录，阈值待冻结） | `measurements.json` |

## 复现命令

```powershell
# 单元全量（8 套件）
node tools\desktop-recv\run-unit.mjs --all

# 资产 + 证据门禁
node tools\desktop-recv\verify-assets.mjs
python tools\desktop-recv\verify-evidence.py --run docs\tests\runs\20261018-teamexec-01 --gate local
#   （当前 gate local = FAIL，18 条 E2E-3..20 待真人往返，见 TD-12）

# 浏览器集成（IAT-01..05）：起服务后打开测试页
pwsh -NoProfile -File build-desktop-recv\staging\receiver\launch.ps1 -Port 8766 -NoBrowser
#   打开 http://127.0.0.1:8766/tests/browser/index.html，等待全部用例出现

# 录像导入单测（无需浏览器）
node --test web\desktop-recv\tests\unit\video.test.mjs
```

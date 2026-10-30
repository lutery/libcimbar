# 发布说明 — Cimbar 桌面接收器 1.2.0

- **版本**：1.2.0（cimbar-desktop-recv）
- **构建时间**：2026-10-30 09:30 (+08:00)
- **产品源码提交**：`7e34289`（PS5.1 启动链；web 运行时与 1.1.0 字节一致）
- **主分支合并提交**：`cd32de3`（ps51-preview → master，2026-10-30 本地合并）
- **产品清单**：product-manifest.json SHA-256 = `7a5e5f1a4ac19825c7055ca6ea199d9f6e0914b24ba6b277243c38ff57fb0abf`（27 文件，本包逐文件与之一致）
- **wasm/js 资产**：cimbar_js.wasm `d1080cdc600ca842a337b8ea6157bc5cc2c545aaa75fce7b14e8585e9eb4685b`（与 1.1.0 相同，未重建 WASM）
- **构建方式**：root17 候选 staging（`build-desktop-recv/runs/20261029-teamexec-17/receiver`）27 产品文件的逐字节副本 + tests/ + 本说明/变更日志/交付清单

## 本版变更（用户可见）

- **Windows PowerShell 5.1 支持**：`launch.ps1` 双引擎兼容（5.1 + 7），CJK+空格路径输出固定 UTF-8；`launch.cmd` 自动回退（有 pwsh 用 pwsh，无则 5.1）。
- **启动失败诊断**：PowerShell 7 打印真实退出码，5.1 下明确「未知退出码」并保留 stderr 与诊断日志路径。
- **web 运行时零变化**：与 1.1.0 逐字节一致（23/27 文件不变）。

## 内容

- `index.html`、`styles.css`、`src/`（应用与 UX 模块）、`worker/`、`vendor/`（wasm/js）、`config/`（profile/errors/asset-set）、`server.py`、`launch.cmd`、`launch.ps1`、`package.json`、`README.md`、`tests/`
- `CHANGELOG.md`（用户级变更日志）、`DELIVERY-MANIFEST.txt`（逐文件 SHA-256）

## 验证状态（2026-10-30）

- 外部独立审查 round-20：**通过**（双轴 PASS、0 阻断、0 新增建议；round-16..19 整改链全部闭环）。
- PS5.1 启动矩阵：12/12（身份核验清理 + 守卫反例 h1–h4）；真实 Windows PowerShell 5.1（5.1.22621.6133）下 E2E-1/E2E-2 完整旅程 PASS（root17：地址栏精确 URL、外置 certutil SHA 一致、拒绝腿 A/B 占用者存活）。
- 本地证据根：`docs/tests/runs/20261029-teamexec-17`（attempt `candidate-20261029-04`，harness `18b7c22`）；web 运行时字节与 1.1.0 一致，1.1.0 已通过的全部本地证据按字节身份继续有效。
- **未替代的验收**：现场 7 项（E2E-21..26/39）、E2E-37 真实语音、E2E-35 真实后台行为由用户侧分别执行；本包为其实施对象。

## 使用

解压后双击 `launch.cmd`（或 `pwsh launch.ps1`，或 Windows PowerShell 5.1 的 `powershell -NoProfile -ExecutionPolicy Bypass -File launch.ps1`）即可在默认浏览器打开接收页；详见 `README.md`。

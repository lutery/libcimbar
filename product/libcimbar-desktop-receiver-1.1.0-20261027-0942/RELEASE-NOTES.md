# 发布说明 — Cimbar 桌面接收器 1.1.0

- **版本**：1.1.0（cimbar-desktop-recv）
- **构建时间**：2026-10-27 09:42 (+08:00)
- **产品源码提交**：`c106d46`（round-13 整改后最终产品字节）
- **主分支合并提交**：`f1cb83e`（receiver-ux-v2 → master）
- **产品清单**：product-manifest.json SHA-256 = `829d7dec4358feaf391c86876bf3e20e9c600f1557c6b1537c4c5e2eb258958d`（27 文件，本包逐文件与之一致）
- **wasm/js 资产**：cimbar_js.js `1f36bd07872ea51d5e60ae94fdf545c9bf970534f3d8cd022c8de5582ec5d7ff`；cimbar_js.wasm `d1080cdc600ca842a337b8ea6157bc5cc2c545aaa75fce7b14e8585e9eb4685b`（与 1.0.0 相同，未重建 WASM）
- **构建方式**：`stage.ps1 -Mode development` + `-Mode assets`（真实 wasm 产物与 CMD-02 门禁日志绑定）从候选 staging 复制；本包 = root12 候选 27 产品文件的逐字节副本 + tests/ + 本说明/变更日志/交付清单

## 内容

- `index.html`、`styles.css`、`src/`（应用与 UX 模块）、`worker/`、`vendor/`（wasm/js）、`config/`（profile/errors/asset-set）、`server.py`、`launch.cmd`、`launch.ps1`、`package.json`、`README.md`、`tests/`
- `CHANGELOG.md`（用户级变更日志）、`DELIVERY-MANIFEST.txt`（逐文件 SHA-256）

## 验证状态（2026-10-27）

- 外部独立审查 round-14：**通过**（双轴 PASS、0 阻断）。
- 本地证据根：`docs/tests/runs/20261027-teamexec-12`（legacy E2E-1..20 全 PASS；UX E2E-27..38 记录 10 PASS + E2E-35/37 如实 NOT_RUN；冻结方法 A/B 5/5 对 PASS；实时 10/10 VALID；双门禁 legacy PASS(20)、UX 缺口恰为已授权项）。
- 本包与候选产品清单逐文件字节一致（27/27）；启动冒烟见交付流程记录。
- **未替代的验收**：现场 7 项（E2E-21..26/39）、E2E-37 真实语音、E2E-35 真实后台行为由用户侧分别执行；本包为其实施对象。

## 使用

解压后双击 `launch.cmd`（或 `pwsh launch.ps1`）即可在默认浏览器打开接收页；详见 `README.md`。

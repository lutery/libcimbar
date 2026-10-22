# RELEASE-NOTES — libcimbar-desktop-receiver 1.0.0

- 版本：1.0.0（外部审查 Round-11 通过：0 Blocking、0 新建议）
- 打包时间：2026-10-22 22:52 (+08:00)
- 来源提交：master cd00113（screen-capture-recv 合并 a4f9a0d 后的树；本包 = candidate 模式装配）
- WASM SHA-256：d1080cdc600ca842a337b8ea6157bc5cc2c545aaa75fce7b14e8585e9eb4685b
- JS SHA-256：1f36bd07872ea51d5e60ae94fdf545c9bf970534f3d8cd022c8de5582ec5d7ff
- 内容：与 build-desktop-recv/staging/receiver 全树一致（产品页、src/ 8 模块、worker、vendor WASM/JS、config 冻结契约、server.py、launch.ps1/launch.cmd、README、DELIVERY-MANIFEST.txt（25 文件实时清单，生成于本包）、package.json v1.0.0、tests/）
- 构建命令：pwsh -NoProfile -File tools/desktop-recv/stage.ps1 -RunId 20261021-teamexec-03 -Mode candidate
- 验证：单元 9 套件 120 例；本地证据门禁 PASS(20)（run 20261021-teamexec-03）；资产校验 PASS；20/20 本地真实操作旅程（真实窗口抓屏、系统保存对话框、外部 SHA-256）
- 使用：解压后运行 launch.cmd（或 pwsh -File launch.ps1），默认浏览器打开接收页；启动参数与故障提示见 README
- 已知边界：现场阶段 E2E-21..26（真实云桌面）由用户执行，不在本包验收内；性能阈值未冻结（NOT_EVALUATED）；录像导入支持已按实测验证至 4MiB 两类数据，未声称最大容量（产物预算 16MiB）

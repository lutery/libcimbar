# 1.2.0 转正计划（PS 5.1 启动器兼容 · 正式化）

- 需求来源：用户 2026-10-28 指示"转正为 1.2.0 正式版，按流程补做"。
- 已完成的实施与预审：分支 `ps51-preview`（起自 master `7b91057`）——`ff21be5`（5.1 兼容+CMD 回退）、`a2c05e1`（预览件）、`b807d1e`（S15-01 修正+新预览件）；**round-15 外审通过**（0 阻断，1 非阻断建议 S15-01，已修复并复验，见 `round-15-verdict.md`）。

## 转正范围（依据预览说明与 round-15 裁决的"受影响完整 E2E"口径）

1. **产品变更面**：`launch.ps1`、`launch.cmd`、`README.md`、`package.json`（版本 1.1.0→1.2.0）；接收器 web 运行时（`index.html/styles.css/src/worker/vendor`）字节不变。
2. **受影响 E2E**：E2E-1（打包接收端自管理启动链）与 E2E-2（启动失败恢复）在新构建上重跑；新增 `tools/desktop-recv/e2e/ps51-launch-check.mjs` 机读矩阵（5.1 直启、CMD 回退分支（PATH 子进程级去 pwsh）、HTTP 字节、exit 2/3/4/5），产出 JSON 证据。
3. **未受影响证据的复用规则**：与 1.1.0 候选（product manifest `829d7dec…`）逐文件 SHA 比对——运行时相关文件字节相同则 root12 的 legacy 20/20、UX 12 条、A/B、live 证据按字节身份继续有效；round-16 包附逐文件对照表，不以标签替代字节。
4. **非桌面全量**：单元 222、工具 69、自测 77/14/3、契约——在 1.2.0 树上复跑。
5. **门禁**：legacy/UX 门禁针对 root12（运行时字节不变）复跑并附身份表；root13 仅承载受影响 E2E 记录，不冒充 20 案门禁。

## 交付与审查

- 新证据根：`docs/tests/runs/20261028-teamexec-13`（受影响 E2E + 启动矩阵 + 环境）。
- 流程：实施（本分支）→ 受影响复验 → round-16 送审包 → 外审 → 打包 **libcimbar-desktop-receiver 1.2.0**。
- 边界：E2E-35/37、现场 7 项维持用户既有决定（NOT_RUN），不因本次转正改变。

# 独立外部审查 — Round 19 结论模板（1.2.0 转正：round-18 阻断整改复验）

> 请按以下固定章节填写，保存为 `docs/dev-pipeline/ext-review/round-19-verdict.md`。
> 缺少必要章节的结论将退回补齐，不做猜测。审查应只读；复跑命令见 `round-19-package.md`。
> 编号公式：ext_rounds=18，verdict 文件 = `round-19-verdict.md`。

## Verdict

通过 / 不通过

## Blocking issues

逐条列出（无则写 "None"）。每条包含：**位置**（文件:行）、**证据**（可复核事实）、**期望**（关闭条件）。

## Suggestions

可延后的改进项（标注严重度：Warning / Suggestion）。

## Reviewer

- 审查者标识（人 / 模型+版本 / 工具）
- 审查日期
- 材料范围（默认 `round-19-package.md` 全部材料；含 round-14..18 裁决与 r18 台账）
- 是否独立复跑了命令（列出）

---

### 审查备注（可选）

本包特有的诚实性边界（材料内均有原文）：
1. 开页证据为地址栏 URL 通道（页签本次自行激活；激活路径为后台页签而设、未触发，如实披露）。
2. 真实 picker 父链断裂（launcher pid 退出）：归属由 profile 身份（本轮唯一 --user-data-dir）+ 父链并行证明；拒绝原件保留。
3. 遗留自动化浏览器按 profile 标记回收（pid 79176，日志在案）；非 harness 浏览器绝不按端口/名称杀。
4. 4 个失败 attempt 原件保留（固定端口接收腿/StrictMode 钩子/chain-only 归属拒绝/stale-CDP attach）。
5. 矩阵 12/12 与 unit 222 未重跑；受影响工具 69、page-open 8/8、dialog 10/10 已跑。
6. root13..15 只读；产品 manifest 仍 `7a5e5f1a…`。
7. §8.5 的"连接承载精确 URL/前台锁"表述已在 §8.6 与台账更正。

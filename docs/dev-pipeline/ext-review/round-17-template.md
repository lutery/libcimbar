# 独立外部审查 — Round 17 结论模板（1.2.0 转正：round-16 阻断整改复验）

> 请按以下固定章节填写，保存为 `docs/dev-pipeline/ext-review/round-17-verdict.md`。
> 缺少必要章节的结论将退回补齐，不做猜测。审查应只读；复跑命令见 `round-17-package.md`。
> 编号公式：ext_rounds=16，verdict 文件 = `round-17-verdict.md`。

## Verdict

通过 / 不通过

## Blocking issues

逐条列出（无则写 "None"）。每条包含：**位置**（文件:行）、**证据**（可复核事实）、**期望**（关闭条件）。

## Suggestions

可延后的改进项（标注严重度：Warning / Suggestion）。

## Reviewer

- 审查者标识（人 / 模型+版本 / 工具）
- 审查日期
- 材料范围（默认 `round-17-package.md` 全部材料；含 round-14/15/16 裁决与 r16 台账）
- 是否独立复跑了命令（列出）

---

### 审查备注（可选）

本包特有的诚实性边界（材料内均有原文）：
1. E2E-1 首跑失败原件保留（share 选择器误驱动用户 Chrome 窗；`11b449b`/`58dd622` 修复后 PASS）。
2. E2E-2 的 launcher 进程观察器为空（启动过快），5.1 身份由回退链/去 pwsh PATH/版本探针证明，engine-env.txt 如实记录。
3. 开页证据 = launcher stdout + launcher 进程证据 + 启动前后窗口差集；浏览器进程转发过快未被快扫捕获。
4. 矩阵 RED 为真实进程的函数级反证（旧字节 + 独占监听器真实死亡），完整矩阵跑批未触发该分支的记录一并入档。
5. root13（PS7 E2E）只读保留；产品字节未变（product manifest 仍 `7a5e5f1a…`），PS7 证据按字节身份有效。
6. E2E-35/37、现场 7 项维持 NOT_RUN（用户既有决定）。
7. 工具身份：`logs/tools-identity.json`（6 工具内容 SHA + harnessRevision `58dd622`）；矩阵 JSON 自载 `toolSha256`。
8. 复跑命令使用工具真实参数与独立 `--run-id` 复验根（S16-03），无 `--out`。

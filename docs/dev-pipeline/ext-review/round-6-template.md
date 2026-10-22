# 独立外部审查 — Round 6 结论模板

> 请按以下固定章节填写，保存为 `docs/dev-pipeline/ext-review/round-6-verdict.md`。
> 缺少必要章节的结论将退回补齐，不做猜测。审查应只读；如需复跑，命令见 `round-6-package.md`。
>
> 编号公式（dev-pipeline 阶段 6）：**N = ext_rounds + 1**。本包入账时 ext_rounds=6，
> 故按公式产出下一份 verdict 文件为 `round-7-verdict.md`；若您沿用"verdict 文件名 = 包名"
> 的对齐习惯（如 round-5-verdict.md 对应 round-4 交付包），命名为 `round-6-verdict.md`
> 亦可，消费方请以文件实际路径为准（编排方按实际路径入账，不覆盖旧 verdict，也不代为重命名）。

## Verdict

通过 / 不通过

## Blocking issues

逐条列出（无则写 "None"）。每条包含：

- **位置**：文件:行
- **证据**：可复核的事实（命令输出、代码引用、日志片段）
- **期望**：满足什么条件才算关闭

## Suggestions

可延后的改进项（逐条，标注严重度：Warning / Suggestion）。

## Reviewer

- 审查者标识（人 / 模型+版本 / 工具）
- 审查日期
- 审查的材料范围（默认：`round-6-package.md` 的全部材料）
- 是否独立复跑了命令（列出了哪些）

---

### 审查备注（可选）

任何关于范围、假设或证据可信度的说明。

# 预览说明 — Cimbar 桌面接收器 1.1.0 + PowerShell 5.1 启动器（PS51-PREVIEW）

> **这是预览件，不是已通过外审的 1.1.0 交付候选。**
> 产品功能、页面与 1.1.0 完全一致；仅启动器三文件不同（launch.ps1 / launch.cmd / README.md），
> 用于验证"没有 PowerShell 7 的机器也能双击启动"。

## 与正式 1.1.0 包的差异（仅启动面）

1. `launch.ps1`：`#Requires -Version 5.1`（原为 7）；新增控制台 UTF-8 初始化（5.1 下中文路径输出防乱码；pwsh 7 下无副作用）；帮助文案改为两种写法并列。
2. `launch.cmd`：优先用 `pwsh`；找不到时自动回退
   `powershell -NoProfile -ExecutionPolicy Bypass -File launch.ps1 %*`
   （`-ExecutionPolicy Bypass` 用于绕过 5.1 默认策略对本地脚本的拦截）。
3. `README.md`：补充回退说明。

## 已验证（2026-10-28，本机 Windows 11）

- **中文+空格路径**下双引擎（pwsh 7.5 / Windows PowerShell 5.1.22621）：
  - 5.1 直接启动 exit 0、约 3.2 秒、HTTP 200（index.html 与 1.9MB wasm 字节一致）；
  - `launch.cmd` 正常分支（有 pwsh）exit 0；
  - `launch.cmd` 回退分支（PATH 中移除 pwsh）exit 0、HTTP 200；
  - 失败路径逐码复现：端口占用 → 3、缺文件 → 4、无 python → 2、服务起不来 → 5（含真实错误输出）。
- 未复验：E2E-1/E2E-2 全链（属正式转正时的回归项）；`-NoBrowser` 外的浏览器自动打开行为为既有逻辑未改动。

## 边界

- 本件**没有**经过 round-14 外审流程，不可作为正式交付候选；
- 产品字节（27 文件）除上述启动器与 README 外与 1.1.0 候选（product manifest `829d7dec…`）一致；
- 若验证满意，转为正式版本（计划 1.2.0）需走完整流程：实施 → 复验（含 E2E-1/2 在 5.1 下的重跑）→ 外部审查 → 打包。

## 使用

解压到任意目录（可含中文与空格），双击 `launch.cmd`。
本机若两者都有，默认仍走 PowerShell 7；想强制体验 5.1 回退分支可用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\launch.ps1
```

## Round-15 外审结论（2026-10-28）与 S15-01 修正

- **外审 round-15：通过（0 阻断，1 条非阻断建议 S15-01）**——真实 PS5.1/PS7 启动、CMD 自动回退、中文+空格目录、HTTP 资源字节与异常退出码均经独立复核（`docs/dev-pipeline/ext-review/round-15-verdict.md`）。本结论仅针对临时兼容预览补丁；完整 E2E 与正式转正未据此宣告通过。
- **S15-01 已修正**：PS5.1 下服务快速退出时，诊断行原先打印空的子进程退出码。实测根因：5.1 的 `Start-Process` 配文件重定向返回的进程对象在子进程退出后**句柄不可用**（Handle/ExitCode/StartTime 全为空，WaitForExit/Refresh 均不可恢复）；pwsh 7 保留句柄可读。启动器现于可取时打印准确退出码，不可取时**明确输出 `server process exited with an unknown code`**（仍返回 5，stderr 原文与诊断日志路径保留）。
- 复验（本机）：5.1 受控 exit(23) → exit 5 + `unknown` + marker/日志路径；pwsh 7 同场景 → exit 5 + `code 23`；5.1 正常启动 → exit 0 + HTTP 200。
- 本目录为 **S15-01 修正后的新预览件**；`20261028-1447` 目录为 round-15 审查所对应的旧预览件，原样保留。
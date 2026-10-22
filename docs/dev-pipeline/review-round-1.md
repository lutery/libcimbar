# 内部审查归档 — Round 1（批次 A）

- 范围：`26f710a..117a9af`（T1.1.a..T1.2.c）
- 审查者：独立对抗审查 agent（对照 receiver-v1 契约、错误码矩阵、test-plan）
- 裁决：**REQUEST CHANGES**（2 Blocking / 8 Warning / 7 Suggestion）

## Blocking

| ID | 问题 | 证据位置 | 修复 |
|---|---|---|---|
| B1 | Worker 运行时未校验资产字节摘要（C-07 归责 M06 缺失）——替换/陈旧的 vendor 文件会静默加载，18002 无触发路径 | `web/desktop-recv/worker/decoder-worker.js` handle_init | `971c0c2`：importScripts 前 fetch + crypto.subtle SHA-256 比对；UT-024 增摘要失配与 `%2e%2e` 用例 |
| B2 | `iat-results.json` 时间戳晚于包含它的提交（预填推测值，违反 IF-010） | `docs/tests/runs/.../iat-results.json:4` | 改为浏览器 `window.__meta` 真实时刻 + 截图证据 |

## Warning（摘要）

W1 证据语义层可编辑（gate log 内容未校验）→ gate log 内容校验 + verify 再推导；W2 多帧 `_frameEnded` 陈旧；W3 `frameTimeoutMs` 未实现（入 TD-01）；W4 帧阶段兜底错误码 15001→15003；W5 二次 init 非幂等（TD-02）；W6 错误包缺 message/details；W7 `%2e%2e` 路径绕过；W8 RED 证据未落盘 → `red-evidence.md`。

## 整改提交

`971c0c2`（B1/B2 + W1/W2/W4/W6/W7/W8 + S2/S3/S4/S5）、`edd4d0f`（round-2 残留：IAT-03 负向 18002、gateCommand 实跑命令、RED 文档修正）。

## 复审

Round 2：**APPROVE（0 Blocking）**——B1/B2 独立复核关闭；残留 W/S 追踪至 TD-01..TD-11。

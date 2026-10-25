# B10 工具车道 T35 完成报告（全矩阵 + 新旅程）

日期：2026-10-25　基线 HEAD：5964995（未执行任何 git 写命令；产品/worker 零改动）
运行根：docs/tests/runs/20261025-teamexec-09b（最终候选，product manifest 9e2595e6…，attemptId candidate-20261025-04）
lane-progress：docs/tests/runs/20261025-teamexec-09b/logs/lane-progress-t35.txt（逐案 exit 记录）

## A. 新旅程补实现（仅 tools）

- **E2E-28（重复有效码不虚增）** ui-journeys.mjs 新增：SRC-01 冻结真实码帧为不透明层（source-scene 静止层 + 码区外 10px 闪烁活性点防采集管线停供），10s+ 采样验证：识别速率保持活跃（45-64 KiB/s）、重建估计固定 9-10%、≥8s 无推进提示、期间无 Ready/工件/保存可用、会话不重置；移除层后块增长恢复（10%→99%），真实保存 SHA 相等。派发要求的「识别速率可有但不虚增」全部落实为实测判据。
- **E2E-29（无有效码暂停→归零→恢复）** 新增：空白层 ≥8s（保持≥6s 满足），判据从「最后 data+阈值」锚定：速率 ≤3s(+1s) 归零、≥5s 出现「已超过五秒没有识别到新数据」与「上次重建估计约 N%」陈旧语义、用时继续、会话不重启；恢复后同会话 Ready、保存 SHA 相等。
- 附带 harness 修正：E2E-27 SRC-01 校准改为纯日志证据（CAL01-05 非计划断言，gate 要求每断言有磁盘 proof）；E2E-27-S04 文案断言从旧串改为语义正则；E2E-28/29 依赖的 makeRecorder.finish 结果由断言推导（PASS 声明+非全 PASS 断言=FAIL）；source-scene 静止层增加活性点。
- run-e2e 接线：E2E-28/29 注册 + needsSender 集合扩展；live/video roundtrip 起点检测页级保存钩子时重载页面（每腿新页，v1 矩阵规则）。

## B. 最终候选全矩阵结果（09b，逐案独立 attempt，失败原件全保留）

### Legacy v1（results.json，20/20 PASS）

| # | 结果 | # | 结果 |
|---|---|---|---|
| E2E-1 | PASS (d09fc6) | E2E-11 | PASS (4c1545) |
| E2E-2 | PASS (572d96) | E2E-12 | PASS (a96d6e) |
| v1 E2E-3 | PASS (9a94db，重试) | E2E-13 | PASS (050e91) |
| E2E-4 | PASS (-) | E2E-14 | PASS (f4a38b，重试) |
| E2E-5 | PASS (-) | E2E-15 | PASS (f0382b，重试) |
| E2E-6 | PASS (2063ba) | E2E-16 | PASS (59e6c9，重试) |
| E2E-7 | PASS (ee5cc8) | E2E-20 | PASS (ec557e) |
| E2E-8 | PASS (c46a38) | E2E-17 | PASS (7165af，重试) |
| E2E-9 | PASS (6dfcea) | E2E-18 | PASS (b94f81，重跑含 video-n-128kib 腿) |
| E2E-10 | PASS (80f2a0) | E2E-19 | PASS (首跑 in-flight FAIL 标记后 upsert 真记录) |

- E2E-16/17/18/20 首跑 FAIL/对齐修复后重跑 PASS，原因与留档：09b 无 v1 fixtures/媒体（19 文件从只读 04/03 根逐字节复制，provenance=fixtures-provenance-t35.json；另补 RUN/fixtures-media 同源对+V-SHORT+payload），process-guard 60s 超时（修复：单批 CIM 查询+超时翻倍+明确超时原因），E2E-18 attempt-1 的 video-n-128kib 缺 V-LAST-with.webm 记 NOT_RUN（重跑执行该腿→PASS）。
- E2E-3 首跑失败根因：同一页面二次保存的页级钩子（createWritable/writableAt）不复位 → writAt>closeAt；修复=roundtrip 起点检测游页级钩子有值即重载（每腿新页）；重试 PASS。

### UX 矩阵（ux-results.json，12/12：11 PASS + 37 如实 NOT_RUN）

| 案 | 结果 | attempt |
|---|---|---|
| E2E-27 | PASS | E2E-27-…12-59-48-435Z-89769d |
| E2E-28 | PASS | UX-ALL-…11-46-31-785Z-0db9b3（UX-ALL 组内） |
| E2E-29 | PASS | E2E-29-…12-37-47-909Z-fa39af（保持延长后第 3 attempt） |
| E2E-30..34 | 全 PASS | UX-MEDIA-SAVE-…13-04-26-528Z-13c955 |
| E2E-35/36/38 | PASS | UX-UI-…12-39-28-069Z-d40b44 |
| E2E-37 | NOT_RUN | 同 UX-UI attempt d40b44：Narrator 二进制 present，**真实启动尝试** pid=87044 存活 5s 后停止，语音无法程序化核验（DOM/aria 不替代）——按派发如实 NOT_RUN+尝试细节在 notes |

- UX-ALL 整组首跑（0db9b3）中止留档：E2E-27 S04 旧文案钉死 FAIL、28 PASS、29 保存对话框助手失败、30+ 接收 HTTP 失联（ERR_ADDRESS_INVALID）→ 改逐组调用（27/29/UX-MEDIA-SAVE/UX-UI）；全部失败 attempt 产物保留不覆盖。
## C. 最终门禁（实跑输出，exit 1 属预期）

命令：`python tools/desktop-recv/verify-ux-evidence.py --context docs/tests/runs/20261025-teamexec-09b/run-context.json --gate local`

```
UX GATE local: FAIL (2 violation(s))
  - E2E-37: the local gate requires result PASS (got 'NOT_RUN')
  - E2E-37: executedBy must be executor per the plan (got None)
```
（第二条为真实门禁文本「E2E-37: executedBy must be executor per the plan (got None)」；原始输出见 logs/t35-final-gate2.log，此前 T33 期 19 条违规中格式类已全部清零）
- 完整矩阵后门禁从 19 条（T33 期）→ 2 条：**除 E2E-37 环境不可程序化核验外，全部格式违规清零**；E2E-27/30..34 已合根 09b（R-12 跨构建问题解决）；R2 的 E2E-28/29 已实现并 PASS。
- E2E-37 两项报告如实保留（属 T36/现场批次范围，AT/语音核验需用户现场执行）。

## D. 回归与边界

- `run-unit --all` exit 0（12 套）；`ux-evidence-selftest` 55/55；`verify-evidence-selftest` 14/14；node --check 全部触及工具文件 = 0。
- 旧证据 760 项 SHA+size **UNCHANGED**（red-logs/t35-oldruns-after.sha，对照 t33-oldruns-after.sha 逐行比对）。
- `git status --porcelain -- web/desktop-recv worker` = 0 行；`git diff --check` = 0；旧 run/staging/product/planning 零写入。
- 零残留：recorded pids 守卫回收、孤儿 conhost（childless，child=0 核验后停）停止、8771-8776 无监听。

## E. 工具变更清单（本任务，全部 harness）

- `tools/desktop-recv/e2e/ui-journeys.mjs`（+382/-10 行 diff 量级）：E2E-28/29 新旅程、E2E-37/38 独立处理器（真实 Narrator 尝试）、finish 判定由断言推导、NOT_RUN null 语义、proofRef 复制与 canonical 前缀、E2E-35/36 既有旅程沿用
- `tools/desktop-recv/e2e/run-e2e.mjs`（51 行变动）：E2E-27 CAL01-05 折为日志证据 + S04 文案语义正则 + 页级保存钩子检测重载守卫 + needsSender 增 E2E-28/29 + E2E-28/29 处理器接线（run-e2e 内）
- `tools/desktop-recv/e2e/source-scene.mjs`（+34 行）：静止层活性点（码区外 10px 闪烁，位置记录 __sourceScene.liveness），showBlank/restore 同步清理
- `tools/desktop-recv/e2e/media-journeys.mjs`（6 行变动）：makeRecorder.add 对断言 proofRef 加 canonical 前缀
- `tools/desktop-recv/e2e/process-guard.mjs`（16 行变动）：CIM 查询单批化 + timeout 120s + 超时原因点名
- 新工具文件：无新增独立文件（E2E-28/29 即 ui-journeys 扩展；splice 一次性脚本已删除）
- 新留档：`red-logs/t35-oldruns-after.sha`（760 项 UNCHANGED）；`fixtures-provenance-t35.json`（19+5 文件来源）；09b/logs 逐案日志
- 新留档：`red-logs/t35-oldruns-after.sha`（760 项 UNCHANGED）；一次性 patch 脚本已删除；`fixtures-provenance-t35.json`（19+5 文件来源）

## F. 已知真实缺口（交 T36/现场）

1. E2E-37：语音核验需真实用户执行（v2 现场批次）。
2. 现场批次 E2E-21..26/39 NOT_RUN 照计划。

## G. attempt 语义

同根同构建（product manifest 9e2595e6… 不变）；本批全部为 harness 变更 → 新 attempt id（逐案/逐组），含失败 attempt 原件保留不覆盖（T33 期旧目录与 UX-ALL 组失败目录均在，未覆盖任何旧 attempt 产物）。T36 直接消费本报告的逐案表+失败原因。

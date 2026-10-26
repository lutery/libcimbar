# live-failed-run-1 — 实时腿第一次运行的失败原件（只读保留）

本目录是 `measurements/ux-overhead/candidate-20261026-01/live/` 第一次运行（2026-10-26，root 11）
的 5 份原始侧别记录的逐字节副本；该次运行在第 3 对中止、未产出 summary.json，随后 `live/` 按整改
方案 (a) 删除并以同 attempt 重跑。recorded A/B 结果不受影响。

## 逐侧结果与原因（原始输出见 ../r12-live-legs.log 于 run 根 logs/）

| 文件 | 结果 | 原因 |
|---|---|---|
| pair-1-A.json | VALID | — |
| pair-1-B.json | INVALID `E_LIVE_CLOCK_NOT_FROZEN` | 装置竞态：停止后 frozenA 采样抢在终态收敛写（共享 250ms 边界内落笔，round-12 Option B 的正确行为）之前，误判时钟未冻结。修复：live-legs 冻结取证改为有界等待两次相邻探针一致后再取 frozenA（判据不变）。 |
| pair-2-A.json | VALID | — |
| pair-2-B.json | INVALID `E_LIVE_TELEMETRY_INTERVAL` 249.9ms | 观测通道噪声：产品自身 performance.now 满足 now−last≥250 才写；observer 记录 DOM 变更可观测时刻，每事件 ≤1 帧偏移（recorded 腿同一机制实测 min gap 250.2–250.3ms）。修复：live 判据加 OBSERVATION_JITTER_MS=1 观测容差，仅作用于 live 观测间隔检查；冻结阈值与方法文件不动，240ms 级真实违规仍拒绝（见 measure-ux.test.mjs T-R12-A3f）。 |
| pair-3-A.json | INVALID（collectionError） | 环境瞬态：接收页 python http.server 因 ConnectionAbortedError 崩溃 → waitForFunction 60s 超时；残留 Edge 占用 9445，下一侧 assertPortsFree 按设计拒绝，整个 run 异常退出。按瞬态处理不再加固；若重跑再次崩溃即视为模式并 STOP。 |

## 保留说明

- 本目录 5 个 JSON 为失败原件副本（未改动字节）；指向修复的披露见
  `docs/dev-pipeline/receiver-ux-v2/r12-tools-report.md` §12。
- 依据：round-12 整改纪律"失败 attempt 原件永不删"，与 lead 批准的方案 (a)（副本保留 + 同 attempt 重跑）。

# Round-17 整改台账（阶段 5 · 1.2.0 转正）

- 裁决：`docs/dev-pipeline/ext-review/round-17-verdict.md`（2026-10-29，codex-gpt-6；**不通过**，A17-01/B17-01）。
- DoD 唯一来源：裁决原文。已关闭项不重开：A16-02/B-R16-1、S16-01/02/03。
- 运行根：`docs/tests/runs/20261029-teamexec-15`（attempt `candidate-20261029-02`，harness `a38230e`，product manifest 仍 `7a5e5f1a…`，产品字节零变化）。

## A17-01｜默认开页判定无精确 URL / 无启动关联 → CLOSED

| 关闭条件（裁决） | 落实 | 证据 |
|---|---|---|
| 开页证据含本次新开/激活页面的精确目标 URL 及与启动的关联 | 新模块 `page-open-check.mjs`：PASS 需 ①地址栏值规范化后精确等于 targetUrl 且启动前快照中不存在；或 ②**msedge 进程自有 socket 实际连接**运行期新选端口（端口在启动前 TCP 空闲且未在任何地址栏出现 → 连接即本页）。标题/页数永不参与判定 | `proof/E2E-1/page-open.json`（pre/post 快照、连接记录、verdict）、`engine-env.txt` |
| 普通标题/页数变化不能单独 PASS | 判定仅看 URL 通道；标题写入诊断字段 | `page-open-check.mjs` judge；selftest n1 |
| "旧产品窗口新增无关页/改标题、目标页未开"拒绝反例 | selftest n1（仅标题）、n2（无关 URL）、n3（启动前已有同 URL）、n4（无 URL 证据）、n5（非浏览器连接） | `logs/page-open-check-selftest.json`（8/8） |
| 保留实际默认打开目标页面的正例 | selftest p1/p2（地址栏，含无 scheme 形式）、p3（连接通道）；E2E-1 实跑 | selftest 8/8；attempt `…8589dc` |
| 重跑 E2E-1 开页腿并绑定本次 attempt/候选 | E2E-1 在 root15 完整重跑（含实时/录像保存） | `results.json`、`proof/E2E-1/*` |

**过程披露**：首跑（`…d28bb1`）失败于"地址栏无目标 URL"——Windows 前台锁使 launcher 页签在后台打开，地址栏不显示。按真实原因补连接通道（`a38230e`）；首跑原件保留（`proof/E2E-1/fail-attempt-d28bb1/`、`logs/E2E-1-fail-attempt.log`）。同轮工具测试抓到新模块 CLI 未加主模块守卫（UX-UT-081/082 失败，`logs/affected-checks.log` 保留首跑），已修（`a56e74c`）。

## B17-01｜原生对话框兜底无归属校验 → CLOSED

| 关闭条件（裁决） | 落实 | 证据 |
|---|---|---|
| 跨 utility 进程 fallback 必须证明目标浏览器归属 | `Get-OwnerChain`（CIM 父链 ≤8 跳）+ `Test-OwnershipFacts`（映像=msedge.exe 且链达 target pid）；无归属即拒绝并报告 | `native-dialog.ps1`；selftest |
| 无法证明时拒绝（不得只收紧标题继续无归属遍历） | 统一选择规则 `Select-DialogRecords`：pass1 仅 target pid 行；pass2 逐候选做归属证明，失败即拒绝 | `native-dialog.ps1` |
| 无关嵌套 save/share 拒绝反例 | selftest n1/n2/n3（save `#32770`、share 标题均拒绝）、n4（无链 msedge 拒绝） | `logs/native-dialog-selftest-result.json`（6/6） |
| 真实目标 utility 对话框正例 | selftest p1（链 333→111，映像 msedge.exe，接受）；E2E-2 真实 picker/保存对话框均为 target-owned（pass1），如实记录 | selftest p1；`logs/E2E-2.log` |
| 重跑受影响原生选择/保存旅程，保留原失败记录 | E2E-2 root15 重跑（占用→恢复→实时保存） | attempt `…5f9ecd`；`proof/E2E-2/*` |

**RED**：旧 Pass2 逐字逻辑对无关顶层 222 的嵌套 save/share 均返回 222；旧开页三行判定对"同 PID 仅标题 8→9"返回 true。两者入档 `red-logs/r17/`。

## 结论

A17-01/B17-01 按裁决关闭条件全部落实（root15 证据 + 工具修复 + RED + 首败原件）；等待阶段 5 整改出口确认门 → round-18 外审。

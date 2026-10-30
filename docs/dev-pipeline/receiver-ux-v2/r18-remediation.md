# Round-18 整改台账（阶段 5 · 1.2.0 转正）

- 裁决：`docs/dev-pipeline/ext-review/round-18-verdict.md`（2026-10-29，codex-gpt-6；**不通过**，A18-01/B18-01）。
- DoD 唯一来源：裁决原文。保持关闭不重开：A16-02、S15-01、S16-01/02/03；B17-01 于本轮补齐成功路径后整体关闭。
- 运行根：`docs/tests/runs/20261029-teamexec-16`（attempt `candidate-20261029-03`，harness `cd53a20`，product manifest 仍 `7a5e5f1a…`，产品字节零变化）。

## 先行更正（裁决第 25 行要求）

r17 台账与总结 §8.5 中"连接承载精确 URL""空 URL 由前台锁造成"的表述**不成立**，真实原因是 **SNAP 协议为 5 列（标题可含 `|`）而解析器按 6 列读取**，地址栏记录被整体丢弃；TCP 记录不能承载精确页面身份。本轮起判定为 **URL-only**（精确目标 URL 出现在启动后的地址栏且启动前不存在；TCP 仅辅助记录）。旧表述已在 exec-log R18 与总结 §8.6 中书面更正。

## A18-01｜开页采集/判定链 → CLOSED

| 关闭条件（裁决） | 落实 | 证据 |
|---|---|---|
| 修正生产采集/解析协议 | `parseSnapshotLines` 移入 `page-open-check.mjs` 与判定同处一文件、由 run-e2e 共用；SNAPW/SNAP/SNAPT 按"标题=第4列至倒数第2列、末列=URL/editCount/页签名"解析，标题含 `|` 仍正确 | `page-open-check.mjs`、`run-e2e.mjs` |
| 正常原始 SNAP 行经真实解析器进入判定的检查 | selftest 全部用例携带**原始协议行**，经真实解析器→真实 judge（不手造 post 数组） | `logs/page-open-check-selftest.json`（8/8，含标题含 `|` 正例） |
| 默认开页保存精确 URL 与启动关联 | E2E-1 `…2f9999`：target `http://127.0.0.1:8768/`（8767 因旧页签显示被排除）；启动前地址栏仅 `127.0.0.1:8767`，启动后恰为 `127.0.0.1:8768`；端口运行期空闲且未显示 | `proof/E2E-1/page-open.json`、`engine-env.txt` |
| TCP 只能辅助、不能独自 PASS | judge 的 PASS 仅由地址栏 URL 决定；连接记录为 auxiliary | selftest n1（同端口不同 path/query 拒绝）、n2（SYN_SENT 拒绝） |
| 后台页签：能确认 URL 的页面证据，或安全激活本次新页签后读地址栏 | `findNewTab`（按窗口页签差集识别**本次新增**页签，不按标题盲选）+ `activateEdgeTab`（SelectionItemPattern）；本次实跑页签自行激活，未触发 | `findNewTab/activateEdgeTab` 代码路径；reproduction 诚实边界第 1 条 |
| 新增拒绝例 | 同端口不同 path/query、仅 SYN_SENT、启动前已有同 URL、仅标题变化、无关 URL、无 URL 证据 | selftest n1/n2/n3/n4/n5/n6 |
| 重跑 E2E-1 开页腿、绑定新 attempt、保留旧原件 | root16 重跑并绑定 `…2f9999`；4 个失败 attempt 原件+控制台日志全保留 | `proof/E2E-1/fail-attempt-*/`、`logs/E2E-1-fail-attempt*.log` |

## B18-01｜Pass2 诊断污染返回值 → CLOSED（B17-01 由此整体关闭）

| 关闭条件（裁决） | 落实 | 证据 |
|---|---|---|
| 诊断移到非返回流，成功仅返回一个 UI 对象 | `Find-Dialog` 的 ownership 诊断改 `[Console]::Out.WriteLine`；成功仅 `return $elements[...]` | `native-dialog.ps1` |
| 完整 `Find-Dialog → Find-ByName` 合法 utility 正例（验证返回类型/数量与下游成功） | wrapper 自测：真 `Find-Dialog` 返回 **count=1**、类型 `DialogSelftestNode`（非 String/数组），随后真 `Find-ByName` 返回预期按钮；以 `$script:DialogTreeOverride/$OwnerChainOverride/$ActionOverride` 仅替换 UI/CIM 边界（StrictMode 下初始化，实跑曾抓出未初始化缺陷并保留原件） | `logs/native-dialog-selftest-result.json`（10/10，`p3-wrapper-utility-positive`） |
| 保留外部 save/share 拒绝反例与 target 直连正例 | n1/n2/n3/n5 + p2（wrapper 直连）/n6（profile 不匹配拒绝） | 同上 |
| 归属证明覆盖真实结构 | 现场 CIM 诊断：真实 picker 属于本轮 profile 的自动化 Edge，但其父进程（launchReceiver 启动 pid）已退出→父链断；归属规则增 **profile 身份**（本轮 mkdtemp 的 `--user-data-dir` 唯一命名）与父链并行；`fail-attempt-ownership-refused` 保留拒绝原件 | `logs/E2E-1.log` 中 `matchedBy=pid-chain profileMatch=True`；selftest p4/n6 |
| 重跑受影响对话框旅程 | E2E-1/E2E-2 全部原生选择/保存腿重跑通过 | `…2f9999`/`…5cc6c5` |

**过程新增缺陷与修复（原件保留）**：固定 PORT1 接收腿（`cc0973`）→ RECV_PORT；StrictMode 未初始化钩子（`…-strictmode`）→ 初始化；遗留自动化 Edge 占 CDP 9445 致 attach 到旧浏览器（`…-stale-cdp`）→ **profile 标记验证的回收**（实跑日志：`reclaimed stale automation browser pid 79176 … profile marker verified`）；ownership 父链断（`…-ownership-refused`）→ profile 身份归属。

## RED

- `red-logs/r18/a18-01-red.log`（修复前：原始行解析 urlValues=[]；同端口未观察 path/SYN_SENT 判定 PASS）+ `a18-01-postfix-recheck.log`（修复后同类输入全部 FAIL=拒绝）。
- `red-logs/r18/b18-01-red.log`（修复前：真 `Find-Dialog` 返回 Count=2、`[String, FakeNode]`，`Find-ByName` 对 String 报 FindAll 错误）。

## 结论

A18-01/B18-01 按裁决关闭条件全部落实（root16 证据 + 工具修复 + RED/recheck + 4 个失败原件）；B17-01 整体关闭。等待阶段 5 整改出口确认门 → round-19 外审。

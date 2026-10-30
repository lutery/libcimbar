# 外审交付包 — Round 19（1.2.0 转正：round-18 两项阻断的整改复验）

> 按 dev-pipeline 阶段 6 生成。外部审查者请只读本清单内材料；结论按
> `round-19-template.md` 的固定章节输出。编号公式：ext_rounds=18，verdict 文件 = `round-19-verdict.md`。
>
> 本包审查对象是 **round-18 两项阻断的整改**（1.2.0 转正）。round-14/15 已关闭项、
> A16-02/B-R16-1、S15-01、S16-01/02/03 结论保持不变，不重开。E2E-35/37、现场 7 项
> 维持用户既有决定（NOT_RUN）。

## 审查对象

| 项 | 值 |
|---|---|
| 仓库/分支 | libcimbar · `ps51-preview`（基线 master `7b91057`） |
| 整改提交链 | `afbf16a`（round-18 裁决消费）→ `f5874d1`（A18-01/B18-01 修复与 RED）→ `08adf50`（接收腿绑定运行期端口）→ `82d2fac`（StrictMode 钩子初始化）→ `2791cf7`（profile 身份归属）→ `cd53a20`（CDP 端口 profile 验证回收）→ `35a4d78`（root16 证据） |
| 整改候选根 | `docs/tests/runs/20261029-teamexec-16`；attempt `candidate-20261029-03`；harness `cd53a20`；product manifest **`7a5e5f1a…`**（27 文件，与 root13..15 逐字节相同）；input manifest `6fe9ce55…` |
| 承载 | staging = root15 候选字节级复制（27/27 重哈希）；fixtures 三树字节级复制（每项 SHA 重验） |

## 表述更正（裁决要求的书面纠正）

r17 台账/总结 §8.5 的"连接承载精确 URL""空 URL 由前台锁造成"**不成立**：真实原因是 SNAP 协议 5 列（标题可含 `|`）被按 6 列解析、地址栏记录被丢弃；TCP 不能承载精确页面身份。自本轮起判定 **URL-only**（精确目标 URL 在启动后的地址栏且启动前不存在），TCP 仅辅助。更正已写入 `exec-log` R18 与 `stage5-dev-summary` §8.6，并在 `r18-remediation.md` 开头专节记录。

## 整改对照（裁决关闭条件 → 落实 → 证据）

### A18-01｜开页采集/判定链

| 关闭条件 | 落实 | 证据 |
|---|---|---|
| 修正采集/解析协议 | `parseSnapshotLines` 与 judge 同文件；SNAPW/SNAP/SNAPT 正确列语义（标题含 `|` 正确） | `page-open-check.mjs`、`run-e2e.mjs` |
| 正常原始 SNAP 行经真实解析器进判定 | selftest 全部用例携带原始协议行 → 真实解析器 → 真实 judge | `logs/page-open-check-selftest.json`（8/8） |
| 精确 URL + 启动关联 | E2E-1 `…2f9999`：target `http://127.0.0.1:8768/`（8767 因旧页签显示被运行期排除）；pre 地址栏仅 `127.0.0.1:8767`、post 恰为 `127.0.0.1:8768` | `proof/E2E-1/page-open.json` |
| TCP 仅辅助、不能独自 PASS | PASS 仅由地址栏 URL 决定 | selftest n1（同端口不同 path/query 拒绝）、n2（SYN_SENT 拒绝） |
| 后台页签处理 | `findNewTab`（窗口页签差集识别本次新增页签）+ `activateEdgeTab`（SelectionItemPattern）；本次实跑页签自行激活未触发激活路径（如实披露） | 代码路径 + reproduction 边界 1 |
| 拒绝例 | 同端口不同 path/query、仅 SYN_SENT、启动前已有、仅标题、无关 URL、无 URL | selftest n1..n6 |
| 重跑开页腿、绑定新 attempt、保留旧原件 | `…2f9999`；4 个失败 attempt 原件+控制台日志 | `proof/E2E-1/fail-attempt-*/`、`logs/E2E-1-fail-attempt*.log` |

### B18-01｜包装层返回污染

| 关闭条件 | 落实 | 证据 |
|---|---|---|
| 诊断移出返回流 | ownership 诊断改 `[Console]::Out.WriteLine`；成功仅返回单一 UI 对象 | `native-dialog.ps1` |
| 完整 `Find-Dialog → Find-ByName` 合法 utility 正例 | wrapper 自测：真 Find-Dialog 返回 count=1（类型非 String/数组）、真 Find-ByName 下游成功；仅 UI 根与 CIM 链被注入替换 | `logs/native-dialog-selftest-result.json`（10/10，`p3-wrapper-utility-positive`） |
| 外部 save/share 拒绝反例 + target 直连正例 | n1/n2/n3/n5 + p2（wrapper 直连）+ n6（profile 不匹配拒绝） | 同上 |
| 重跑受影响对话框旅程 | E2E-1/E2E-2 全部原生选择/保存腿重跑；权限对话框 `matchedBy=pid-chain profileMatch=True` | `…2f9999`/`…5cc6c5`、`logs/E2E-{1,2}.log` |

## 验证证据（全部可复核）

| 证据 | 位置/命令 | 结果 |
|---|---|---|
| 工具测试 | 三套件 `node --test` | **69/69** |
| 开页 selftest | `node tools/desktop-recv/e2e/page-open-check.mjs --selftest` | **8/8**（原始行经真实解析器） |
| 对话框 selftest | `pwsh -NoProfile -File tools/desktop-recv/e2e/native-dialog.ps1 -Action dialog-selftest -SelftestFile tools/desktop-recv/e2e/native-dialog-selftest.json` | **10/10**（含 wrapper 正例） |
| E2E-1（5.1，开页 URL 证据） | root16 `proof/E2E-1/`（`…2f9999`） | PASS：地址栏精确 URL；启动前无该 URL；TCP 仅辅助；live/录像/外置 SHA `2f5a22f9…` 相等；回收日志 `reclaimed stale automation browser pid 79176 … profile marker verified` |
| E2E-2（5.1 失败恢复） | root16 `proof/E2E-2/`（`…5cc6c5`） | PASS：exit3 可读 → exit0 → live 相等；权限对话框 pid-chain+profile 双证 |
| RED/recheck | `red-logs/r18/` | 修复前：原始行→空 urlValues、同端口错页/SYN_SENT→PASS、Find-Dialog 返回 String+节点；修复后 recheck：同类输入全部拒绝 |
| 工具身份 | root16 `logs/tools-identity.json`（8 工具 SHA + harness `cd53a20`） | 重算一致 |
| 字节身份 | root16 product manifest vs root15 | `7a5e5f1a…` 相同（27/27 重哈希） |
| 冻结件 | `git diff 0ed2e5b..HEAD -- docs/plans/receiver-ux-v2/performance-method.json` | 空 |

## 材料清单

| 类别 | 路径 |
|---|---|
| 台账（含表述更正专节） | `docs/dev-pipeline/receiver-ux-v2/r18-remediation.md` |
| 前序裁决 | `round-14..18-verdict.md` |
| 整改提交 | `afbf16a`、`f5874d1`、`08adf50`、`82d2fac`、`2791cf7`、`cd53a20`、`35a4d78` |
| 证据根 | `docs/tests/runs/20261029-teamexec-16/`（run-context、双 manifest、provenance-r16、logs/、proof/ 含 4 个失败 attempt 原件、reproduction.md） |
| RED | `docs/dev-pipeline/receiver-ux-v2/red-logs/r18/` |
| 历史根 | root15/root14/root13… 全部只读 |

## 复跑命令（真实参数；`--run-id` 指定独立复验根）

```powershell
node --test tools/desktop-recv/tests/measure-ux.test.mjs tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/process-guard.test.mjs
node tools/desktop-recv/e2e/page-open-check.mjs --selftest
pwsh -NoProfile -File tools/desktop-recv/e2e/native-dialog.ps1 -Action dialog-selftest -SelftestFile tools/desktop-recv/e2e/native-dialog-selftest.json

node tools/desktop-recv/e2e/run-e2e.mjs --context docs/tests/runs/20261029-teamexec-16/run-context.json --case E2E-1 --launcher-engine ps51
node tools/desktop-recv/e2e/run-e2e.mjs --context docs/tests/runs/20261029-teamexec-16/run-context.json --case E2E-2 --launcher-engine ps51

node -e "const fs=require('fs');const a=JSON.parse(fs.readFileSync('docs/tests/runs/20261029-teamexec-16/product-manifest.json','utf8'));const b=JSON.parse(fs.readFileSync('docs/tests/runs/20261029-teamexec-15/product-manifest.json','utf8'));console.log('identical='+(JSON.stringify(a)===JSON.stringify(b)))"   # 期望 true

git diff 0ed2e5b..HEAD -- docs/plans/receiver-ux-v2/performance-method.json   # 期望为空
```

## 诚实性边界

1. **开页证据为地址栏 URL 通道**：本次实跑页签自行成为活动页签（激活路径未触发）；`findNewTab/activateEdgeTab` 为后台页签情形而设（窗口页签差集识别本次新增页签后激活，不按标题盲选），未在本轮实跑中触发，如实披露。
2. **真实 picker 父链断裂**（launcher pid 退出）：归属由 **profile 身份**（本轮 mkdtemp 的 `--user-data-dir` 唯一路径）+ 父链并行证明；拒绝原件 `fail-attempt-ownership-refused` 保留。
3. **遗留自动化浏览器回收**：实跑日志记录回收 pid 79176（CDP 9445，profile 标记验证后停止）；非 harness 浏览器占用时拒绝并报 pid/命令行，绝不按端口/名称杀。
4. **4 个失败 attempt 原件保留**（固定端口接收腿、StrictMode 钩子、chain-only 归属拒绝、stale-CDP attach），未改写为通过。
5. 矩阵 12/12 与 unit 222 未重跑（矩阵工具与产品字节自 round-17 实跑后未变）；受影响工具 69 与两 selftest 已跑。
6. root13..15 只读；E2E-35/37、现场 7 项维持 NOT_RUN。
7. 工具身份：root16 `logs/tools-identity.json`（8 工具 SHA + harness `cd53a20`）。

## 与前轮的关系

- round-14..18 结论与已关闭项不变；round-18 两项阻断按关闭条件整改并附证据。
- 本轮通过后：从 root16 staging 组装 **libcimbar-desktop-receiver 1.2.0** 正式包（目录+zip+RELEASE-NOTES/CHANGELOG/DELIVERY-MANIFEST）并合并 `ps51-preview` 至 master。

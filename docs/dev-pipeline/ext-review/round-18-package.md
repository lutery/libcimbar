# 外审交付包 — Round 18（1.2.0 转正：round-17 两项阻断的整改复验）

> 按 dev-pipeline 阶段 6 生成。外部审查者请只读本清单内材料；结论按
> `round-18-template.md` 的固定章节输出。编号公式：ext_rounds=17，verdict 文件 = `round-18-verdict.md`。
>
> 本包审查对象是 **round-17 两项阻断的整改**（1.2.0 转正）。round-14（1.1.0 核心）、
> round-15（PS5.1 预览）、round-16 已关闭项（A16-02/B-R16-1、S16-01/02/03）结论保持不变，
> 不重开。E2E-35/37、现场 7 项维持用户既有决定（NOT_RUN）。

## 审查对象

| 项 | 值 |
|---|---|
| 仓库/分支 | libcimbar · `ps51-preview`（基线 master `7b91057`） |
| 整改提交链 | `232fb71`（round-17 裁决消费/状态）→ `8951620`（A17-01+B17-01 修复与 RED）→ `a56e74c`（page-open CLI 主模块守卫）→ `a38230e`（连接证据通道）→ `a0530ed`（root15 证据） |
| 整改候选根 | `docs/tests/runs/20261029-teamexec-15`；attempt `candidate-20261029-02`；harness `a38230e`；product manifest **`7a5e5f1a…`**（27 文件，与 root13/root14 逐字节相同——整改未触碰产品字节）；input manifest `0808a14a…` |
| 承载 | staging = root14 候选字节级复制（27/27 重哈希）；fixtures 三树字节级复制（每项 files[] SHA 对 root15 磁盘重验） |

## 整改对照（裁决关闭条件 → 落实 → 证据）

### A17-01｜默认开页需精确 URL + 启动关联

| 关闭条件 | 落实 | 证据 |
|---|---|---|
| 证据含本次页面的精确目标 URL 与启动关联 | 新模块 `page-open-check.mjs`：PASS 需 (a) 地址栏值规范化精确等于 targetUrl 且**启动前快照不存在**，或 (b) **msedge 进程自有 socket 实际连接**运行期新选端口（端口启动前 TCP 空闲且未在任何地址栏出现 → 连接即本页）。标题/页数仅诊断 | `proof/E2E-1/page-open.json`、`engine-env.txt` |
| 标题/页数变化不得单独 PASS | 判定仅消费 URL 通道 | `page-open-check.mjs`；selftest n1 |
| "旧窗口新增无关页/改标题、目标页未开"拒绝反例 | n1 仅标题、n2 无关 URL、n3 启动前已有同 URL、n4 无 URL 证据、n5 非浏览器连接 | `logs/page-open-check-selftest.json`（8/8） |
| 保留实际默认开页正例 | p1（地址栏）、p2（无 scheme 地址栏）、p3（连接通道）；E2E-1 实跑 | selftest 8/8；attempt `…8589dc` |
| 重跑 E2E-1 开页腿、绑定本次 attempt | root15 完整重跑（含实时/录像保存与外置 SHA） | `results.json`、`proof/E2E-1/*` |

### B17-01｜对话框兜底必须证明归属

| 关闭条件 | 落实 | 证据 |
|---|---|---|
| 跨 utility 进程 fallback 证明目标浏览器归属 | `Get-OwnerChain`（CIM 父链）+ `Test-OwnershipFacts`（映像=msedge.exe 且链达 target pid）；无法证明即拒绝并报告 | `native-dialog.ps1` |
| 不得只收紧标题继续无归属遍历 | 统一选择规则 `Select-DialogRecords`：pass1 仅 target pid；pass2 逐候选归属证明 | `native-dialog.ps1` |
| 无关嵌套 save/share 拒绝反例 | selftest n1/n2/n3、n4（无链 msedge） | `logs/native-dialog-selftest-result.json`（6/6） |
| 真实目标 utility 对话框正例 | selftest p1（链 333→111 接受）；p2（target 直连） | 同上 |
| 重跑受影响之旅程，保留原失败记录 | E2E-2 root15（占用→恢复→保存）；两对话框均 target-owned（pass1）如实记录 | attempt `…5f9ecd`、`logs/E2E-2.log` |

## 验证证据（全部可复核）

| 证据 | 位置/命令 | 结果 |
|---|---|---|
| 工具测试 | `node --test tools/desktop-recv/tests/measure-ux.test.mjs tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/process-guard.test.mjs` | **69/69** |
| 开页判定 selftest | `node tools/desktop-recv/e2e/page-open-check.mjs --selftest` | **8/8** |
| 对话框归属 selftest | `pwsh -NoProfile -File tools/desktop-recv/e2e/native-dialog.ps1 -Action dialog-selftest -SelftestFile tools/desktop-recv/e2e/native-dialog-selftest.json` | **6/6** |
| E2E-1（5.1 完整，含开页） | root15 `proof/E2E-1/`（attempt `…8589dc`） | PASS：target `http://127.0.0.1:8767/`（端口运行期空闲且未显示）；启动前 11 条地址栏值无目标；后台页签 → msedge socket ESTABLISHED 至目标端口；live/recorded/external SHA `2f5a22f9…` 相等 |
| E2E-2（5.1 失败恢复） | root15 `proof/E2E-2/`（attempt `…5f9ecd`） | PASS：exit3 可读 → exit0 → live 相等；external certutil 相等；两原生对话框 target-owned（pass1） |
| RED | `red-logs/r17/`（a17-01-red.log、b17-01-red.log） | 旧判定：同 PID 仅标题变化→true；旧 Find-Dialog：无关嵌套 save/share→222 |
| 工具身份 | root15 `logs/tools-identity.json`（8 工具内容 SHA + harnessRevision `a38230e`） | 与当前文件重算一致 |
| 字节身份 | root15 product manifest vs root14/root13 | `7a5e5f1a…` 相同（27/27 重哈希），产品字节未变 |
| 冻结件 | `git diff 0ed2e5b..HEAD -- docs/plans/receiver-ux-v2/performance-method.json` | 空 |

## 材料清单

| 类别 | 路径 |
|---|---|
| 台账 | `docs/dev-pipeline/receiver-ux-v2/r17-remediation.md` |
| 前序裁决 | `round-14/15/16/17-verdict.md` |
| 整改提交 | `232fb71`、`8951620`、`a56e74c`、`a38230e`、`a0530ed` |
| 证据根 | `docs/tests/runs/20261029-teamexec-15/`（run-context、双 manifest、fixtures-provenance-r15、logs/、proof/、reproduction.md） |
| RED | `docs/dev-pipeline/receiver-ux-v2/red-logs/r17/` |
| 历史根 | root14/root13/root12… 全部只读 |

## 复跑命令（工具真实参数；`--run-id` 指定独立复验根，不改写本 run 证据）

```powershell
node --test tools/desktop-recv/tests/measure-ux.test.mjs tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/process-guard.test.mjs
node tools/desktop-recv/e2e/page-open-check.mjs --selftest
pwsh -NoProfile -File tools/desktop-recv/e2e/native-dialog.ps1 -Action dialog-selftest -SelftestFile tools/desktop-recv/e2e/native-dialog-selftest.json

node tools/desktop-recv/e2e/run-e2e.mjs --context docs/tests/runs/20261029-teamexec-15/run-context.json --case E2E-1 --launcher-engine ps51
node tools/desktop-recv/e2e/run-e2e.mjs --context docs/tests/runs/20261029-teamexec-15/run-context.json --case E2E-2 --launcher-engine ps51

node -e "const fs=require('fs');const a=JSON.parse(fs.readFileSync('docs/tests/runs/20261029-teamexec-15/product-manifest.json','utf8'));const b=JSON.parse(fs.readFileSync('docs/tests/runs/20261029-teamexec-14/product-manifest.json','utf8'));console.log('identical='+(JSON.stringify(a)===JSON.stringify(b)))"   # 期望 true

git diff 0ed2e5b..HEAD -- docs/plans/receiver-ux-v2/performance-method.json   # 期望为空
```

## 诚实性边界

1. **E2E-1 开页证据来自连接通道**：本机 Windows 前台锁使 launcher 的页签在后台打开，两轮地址栏快照均为空；msedge socket ESTABLISHED 到运行期新端口是 URL 承载证据（端口启动前 TCP 空闲且未在任何地址栏出现 ⇒ 连接只能来自本次打开的页面）。证据中原样记录空地址栏。
2. **首跑失败原件保留**：`…d28bb1`（地址栏仅判定，后台页签无 URL）原件在 `proof/E2E-1/fail-attempt-d28bb1/` 与 `logs/E2E-1-fail-attempt.log`；同文件另含工具测试首跑失败（新模块 CLI 未加主模块守卫），修复提交 `a56e74c`。
3. **真实 utility 对话框正例未在实跑中出现**：E2E-2 两对话框均为 target-owned（pass1）；跨进程正例由 selftest `p1-target-utility-child-accepted`（链 333→111）驱动同一生产规则覆盖，不冒充实跑。
4. **矩阵 12/12 未重跑**：round-17 已用当前工具字节实跑并关闭；本轮未改矩阵工具。unit 222 未重跑（产品/核心测试未变），受影响工具测试 69 与两 selftest 已跑。
5. **工具模块主模块守卫**：`page-open-check.mjs` 被 run-e2e import 时不得执行 CLI（`a56e74c`），有失败首跑与通过复跑记录。
6. root13/root14 只读；产品字节未变（manifest `7a5e5f1a…`），历史证据按字节身份有效。
7. E2E-35/37、现场 7 项维持 NOT_RUN（用户既有决定）。
8. 工具身份：`logs/tools-identity.json` 记录 8 个工具内容 SHA 与 harnessRevision `a38230e`；含 `page-open-check.mjs`、`native-dialog.ps1` 与 selftest 数据。

## 与前轮的关系

- round-14/15/16 结论不变；round-17 的两项阻断按关闭条件整改并附证据。
- 本轮通过后：从 root15 staging 组装 **libcimbar-desktop-receiver 1.2.0** 正式包（目录+zip+RELEASE-NOTES/CHANGELOG/DELIVERY-MANIFEST）并合并 `ps51-preview` 至 master。

# 外审交付包 — Round 17（1.2.0 转正：round-16 两项阻断的整改复验）

> 按 dev-pipeline 阶段 6 生成。外部审查者请只读本清单内材料；结论按
> `round-17-template.md` 的固定章节输出。编号公式：ext_rounds=16，verdict 文件 = `round-17-verdict.md`。
>
> 本包审查对象是 **round-16 两项阻断主题的整改**（1.2.0 转正）。round-14（1.1.0 核心）
> 与 round-15（PS5.1 预览补丁）结论保持不变；本包不重开已通过范围。E2E-35/37、现场
> 7 项维持用户既有决定（NOT_RUN）。

## 审查对象

| 项 | 值 |
|---|---|
| 仓库/分支 | libcimbar · `ps51-preview`（基线 = master `7b91057`，1.1.0 已交付状态） |
| 整改提交链 | `ece38ff`（round-16 裁决消费/状态索引）→ `7489ac4`（矩阵清理安全）→ `ae6f1ae`（PS5.1 引擎模式）→ `11b449b`（share 选择器归属修复）→ `58dd622`（开页证据绑定本次启动） |
| 整改候选根 | `docs/tests/runs/20261029-teamexec-14`；attempt `candidate-20261029-01`；harness `58dd622`；product manifest **`7a5e5f1a…`**（27 文件，与 root13 逐字节相同——整改未触碰产品字节）；input manifest `a71a787f…` |
| 承载 | staging = root13 候选的字节级复制（27/27 重哈希）；fixtures 三树字节级复制（每个 files[] SHA 对 root14 磁盘重验） |
| 前序裁决 | round-14（1.1.0 通过）、round-15（预览补丁通过，S15-01 已修）、round-16（不通过：A16-01/A16-02+B-R16-1） |

## 整改对照（裁决关闭条件 → 落实 → 证据）

### A16-01｜PS5.1 下完整 E2E-1/2

| 关闭条件 | 落实 | 证据 |
|---|---|---|
| 隐藏 pwsh、记录真实 5.1 引擎与子进程环境 | `--launcher-engine ps51`：子进程 PATH 去 pwsh；`where pwsh` exit1；记录 powershell.exe 路径与 PSVersion **5.1.22621.6133**、完整 PATH | `proof/E2E-1/engine-env.txt`、`proof/E2E-2/engine-env.txt` |
| CJK+空格目录 CMD 启动 → 实时接收/保存 + 录像导入/保存 | E2E-1 首启 = README 形式 `launch.cmd`（5.1 回退），live 与 V-GOOD-C 录像两条保存腿，原/收 SHA 相等 | attempt `E2E-1-2026-10-29T07-49-08-344Z-363db1`（PASS） |
| 首次启动含用户默认方式开页验证 | 首启不带 `-NoBrowser`；launcher stdout `open http://127.0.0.1:8767/`；启动前后窗口差集证明新页打开；launcher 的 powershell.exe 进程被 CIM 观察器捕获 | `engine-env.txt`（launcher process evidence、pre/post windows） |
| 端口占用→可读失败→释放→干净恢复→实时接收/保存 | E2E-2 两段均经 `launch.cmd` 5.1 回退：exit3 可读 → 释放 → exit0 → live 保存相等 | attempt `E2E-2-2026-10-29T07-51-42-280Z-5d7e6e`（PASS） |
| 绑定新 attempt/构建/输入身份/原收文件/外部 SHA | run-context（attempt/manifests）；staging 27/27 重哈希；certutil 外部 SHA | `run-context.json`、`proof/E2E-{1,2}/external-sha.txt` |
| 保留 PS7 证据与失败原件 | root13 只读（launch 文件字节不变 → PS7 证据继续有效）；本次首败 attempt 原件保留 | `proof/E2E-1/fail-attempt-766581/`、root13 |

### A16-02 / B-R16-1｜启动矩阵清理安全

| 关闭条件 | 落实 | 证据 |
|---|---|---|
| 只清理能证明属于本次启动的进程 | `stopVerifiedServer`：CIM 身份核验（精确规范化 `server.py`/`--directory`、可执行=解析 python、创建于本次启动）；不符即拒绝 | `7489ac4`；矩阵 JSON 每案 `cleanup.facts` |
| 不得按端口占用者杀进程；端口空闲不作权限 | 删除 netstat 按端口兜底；端口只作症状；停止后仍忙→FAIL+诊断，不再追加 kill | `ps51-launch-check.mjs`（提交字节） |
| 端口预占用 FAIL/中止并保留外部监听器 | 启动前端口预检；占用即中止并记录 `port-preoccupied`，不触碰占用者 | 矩阵 JSON `cleanup.refused` |
| 反例（自有监听器/无 PID/身份变化）+ 正例 | 守卫案 h1/h2/h3（拒绝且对象存活）与 h4/a/b/c（校验后清理）；矩阵 **12/12 PASS** | `logs/ps51-launch-check.json`（toolSha256 `509c6710…`） |
| RED 先于修复（真实入口） | 旧字节（da40f55 提取件 sha256 `048c4f29…`）对 launcher 从未创建的独占 .NET 监听器执行 netstat 兜底 Stop-Process：监听器真实死亡（exit -1）、函数报告端口空闲 | `red-logs/r16/a16-02-red.log`、`ps51-launch-check-old-da40f55.mjs` |

## 验证证据（全部可复核）

| 证据 | 位置/命令 | 结果 |
|---|---|---|
| 启动矩阵（12 案） | `node tools/desktop-recv/e2e/ps51-launch-check.mjs --staging build-desktop-recv/runs/20261029-teamexec-14/receiver --run-id 20261029-teamexec-14` | PASS（12/12）；a/b/c/h4 校验后清理；d/e/f/g/h1/h2 无 PID 拒绝；h3 身份不符拒绝且 decoy 存活 |
| E2E-1（5.1 完整旅程） | root14 `proof/E2E-1/`（attempt `…363db1`） | PASS：引擎 5.1；默认开页；live+recorded SHA `2f5a22f9…` 相等；external certutil 三份相等 |
| E2E-2（5.1 失败恢复） | root14 `proof/E2E-2/`（attempt `…5d7e6e`） | PASS：exit3 可读 → exit0 → live SHA 相等；external certutil 相等 |
| 非桌面全量 | root14 `logs/green-sweep.log` | run-unit 12 套 **222**；tools **69**；ux-selftest **77**；verify-evidence **14**；video-prefix **3**；check-contracts PASS |
| 字节身份 | product manifest vs root13 | **`7a5e5f1a…` 相同**（27/27 重哈希）；相对 root12 的 23 同/4 变格局未变（整改未改产品） |
| 工具身份（S16-02） | root14 `logs/tools-identity.json`；矩阵 JSON `toolSha256` | 6 个 harness 工具内容 SHA + harnessRevision `58dd622`；矩阵自载 SHA `509c6710…` |
| 冻结件 | `git diff 0ed2e5b..HEAD -- docs/plans/receiver-ux-v2/performance-method.json` | 空；v1 契约 SHA 不变 |

## 材料清单

| 类别 | 路径 |
|---|---|
| 台账 | `docs/dev-pipeline/receiver-ux-v2/r16-remediation.md` |
| 计划 | `docs/dev-pipeline/receiver-ux-v2/release-1.2.0-plan.md` |
| 前序裁决 | `round-14-verdict.md`、`round-15-verdict.md`、`round-16-verdict.md` |
| 整改提交 | `ece38ff`、`7489ac4`、`ae6f1ae`、`11b449b`、`58dd622` |
| 证据根 | `docs/tests/runs/20261029-teamexec-14/`（run-context、双 manifest、fixtures-provenance-r14、logs/、proof/、reproduction.md） |
| RED 原件 | `docs/dev-pipeline/receiver-ux-v2/red-logs/r16/`（含旧工具字节与全部尝试记录） |
| 历史根 | root13（1.2.0 前候选，只读）、root12（1.1.0 候选）、root11/10/09b——全部只读 |

## 复跑命令（S16-03：工具真实参数；`--run-id` 指定独立复验根）

```powershell
# 矩阵：独立复验根 <review-root> 只影响日志落点，不改写本 run 的证据
node tools/desktop-recv/e2e/ps51-launch-check.mjs --staging build-desktop-recv/runs/20261029-teamexec-14/receiver --run-id <review-root>

# E2E-1 / E2E-2（真实 5.1 引擎；会打开默认浏览器窗口，属被测行为）
node tools/desktop-recv/e2e/run-e2e.mjs --context docs/tests/runs/20261029-teamexec-14/run-context.json --case E2E-1 --launcher-engine ps51
node tools/desktop-recv/e2e/run-e2e.mjs --context docs/tests/runs/20261029-teamexec-14/run-context.json --case E2E-2 --launcher-engine ps51

# 非桌面全量
node tools/desktop-recv/run-unit.mjs --all
node --test tools/desktop-recv/tests/measure-ux.test.mjs tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/process-guard.test.mjs
python tools/desktop-recv/tests/ux-evidence-selftest.py
python tools/desktop-recv/verify-evidence-selftest.py
python tools/desktop-recv/e2e/video-prefix-check.py --selftest
python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py

# 字节身份
node -e "const fs=require('fs');const a=JSON.parse(fs.readFileSync('docs/tests/runs/20261029-teamexec-14/product-manifest.json','utf8'));const b=JSON.parse(fs.readFileSync('docs/tests/runs/20261028-teamexec-13/product-manifest.json','utf8'));console.log('identical='+(JSON.stringify(a)===JSON.stringify(b)))"   # 期望 identical=true

git diff 0ed2e5b..HEAD -- docs/plans/receiver-ux-v2/performance-method.json   # 期望为空
```

## 诚实性边界

1. **E2E-1 首跑失败已披露并保留原件**：原生选择器把用户 Chrome 窗口（标题含
   "a-share-mcp"）误当共享对话框；`11b449b` 修复后 `58dd622` 下重跑 PASS。首败
   原件在 `proof/E2E-1/fail-attempt-766581/`，未改写。
2. **引擎进程观察器**：E2E-1 捕获到 launcher 的 powershell.exe 进程；E2E-2 的
   启动更快，观察器记录为空（`watcher=[]`）——E2E-2 的 5.1 身份由"launch.cmd 回退
   分支 + 去 pwsh PATH 断言 + 版本探针"证明，并在 engine-env.txt 中如实记录，不冒充
   进程捕获。
3. **开页证据**：E2E-1 记录 launcher stdout 的 `open` 行、launcher 进程证据与启动
   前后窗口差集（默认 Edge 窗口新增一个页签）；浏览器进程转发过快未被进程快扫捕获，
   因此窗口差集是该腿的开页证明；浏览器保持打开、从不按名杀进程。
4. **矩阵 RED 的真实性**：完整 8 案跑批两次未触发旧 netstat 分支（attempt1/3/4 记录
   在案），函数级 RED 用 da40f55 的逐字函数 + 真实独占监听器触发并造成真实死亡；这
   是真实进程反证，比 round-16 的记录器反证更强，但不等同于完整矩阵复现。
5. root13（PS7 E2E）只读保留；PS7 证据按字节身份（产品未变）继续有效。
6. E2E-35/37、现场 7 项维持既有用户决定（NOT_RUN）；本包不代用户执行现场旅程。
7. tools-identity.json 绑定 6 个工具的内容 SHA；run-context 的 harnessRevision 为
   `58dd622`。E2E-1/E2E-2 证据生成于该提交（绿扫生成于 `ae6f1ae`；其后两提交仅改
   E2E harness 文件，由两条 E2E 实跑覆盖）。
8. round-16 S16-01：pipeline-state 已更新 ext_rounds=16、verdict/materials 索引；
   本包含 round-17 新材料。

## 与前轮的关系

- round-14/15 结论不变；round-16 的两项阻断按关闭条件整改并附证据。
- 本轮通过后：从 root14 staging 组装 **libcimbar-desktop-receiver 1.2.0** 正式包
  （目录+zip+RELEASE-NOTES/CHANGELOG/DELIVERY-MANIFEST）并合并 `ps51-preview` 至 master。

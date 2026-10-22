# 外审交付包 — Round 2

> 按 dev-pipeline 阶段 6 生成。外部审查者请只读本清单内材料；结论按
> `round-2-template.md` 的固定章节输出到 `round-2-verdict.md`。

## 审查对象

| 项 | 值 |
|---|---|
| 仓库/分支 | libcimbar · `screen-capture-recv` |
| 基线 | `master`（上游 `bfb0c8e`） |
| 范围 | `master..HEAD`（提交本包后的 HEAD）；固定基线 `ce4051c` = **57 个提交**，416 文件，+30,437 / −9。本包提交只追加 `docs/dev-pipeline/ext-review/round-2-*.md` 与状态文件，不含产品代码 |
| 上一轮外审 | Round 1 **不通过**（`round-1-verdict.md`，7 个独立 Blocking 主题，其中 3 项双轴重叠） |
| 本轮前内部审查 | Round 7 **FAIL（3 Blocking）** → 整改 `ce4051c` → Round 8 **PASS（0 Blocking）** |
| 交付物 | 桌面接收端（浏览器内、双输入、单会话、严格 EOF）+ 证据工具链 + 现场手册 |

## 材料清单

| 类别 | 路径 | 用途 |
|---|---|---|
| 变更集 | `git diff master..HEAD`、`git log --oneline master..HEAD` | 审查主体 |
| 需求与验收 | `docs/requirements/requirements-spec.md`、`docs/requirements/decision-log.md` | AC-001..014 |
| 设计契约 | `docs/design-catalog/` 全目录（重点 `contracts/receiver-v1.schema.json`、`contracts/error-codes.json`、`module-contract-error-matrix.md`） | 冻结契约 |
| 实施计划 | `docs/plans/2026-10-18-desktop-receiver-implementation.md` | 计划符合性 |
| 测试方案 | `docs/tests/test-plan.md`、`test-cases.md`、`acceptance-tests.md`、`e2e-user-journey-plan.md`、`planning-cases.json` | 测试纪律、26 条旅程与计划 caseType |
| 内部审查报告 | `docs/dev-pipeline/review-round-1.md` .. `review-round-8.md` | 全部已知问题与关闭证据（含 round-7 FAIL 与 round-8 PASS） |
| 上一轮外审 | `docs/dev-pipeline/ext-review/round-1-package.md`、`round-1-template.md`、`round-1-verdict.md` | 整改依据 |
| 整改总结 | `docs/dev-pipeline/stage5-dev-summary.md`、`docs/dev-pipeline/autonomous-decisions.md` | 任务/提交/证据逐项索引与决策记录 |
| 技债登记 | `docs/dev-pipeline/tech-debt.md`（TD-01..17） | 显式延期项与硬性关闭点；TD-01/TD-12 已关闭，TD-15/16/17 保持登记 |
| 本地运行证据（run-01） | `docs/tests/runs/20261018-teamexec-01/` | 单元/集成基线、measurements、support-matrix |
| 本地运行证据（run-02，本轮关键） | `docs/tests/runs/20261019-teamexec-02/`：`results.json`、`batch-l-status.md`、`proof/` | 20 条真实旅程、逐案产物与外部哈希 |
| 现场套件 | `docs/tests/field-guide.md`、`docs/tests/field-receipt.json` | 现场阶段（未执行） |
| 候选包 | `build-desktop-recv/staging/receiver/`（被 `build*/` 忽略，不随 git 交付）+ `DELIVERY-MANIFEST.txt` | 24 文件含摘要 |

> 注意：`build-desktop-recv/` 不在提交内（`build*/` 忽略）。外审若需核对候选包，请运行
> `pwsh -NoProfile -File tools/desktop-recv/stage.ps1 -RunId <id> -Mode development` 后
> `-Mode candidate` 重新装配（需要 WSL2 构建目录；见 `baseline.md`）。

## Round-1 Blocking 整改索引

| Round-1 主题 | 修复 / 提交 | 证据 |
|---|---|---|
| A-01 本地必测未完成却登记 passed | 批次 L：实施方完成 E2E-1..20 真实旅程；批次 M：`stage5-dev-summary.md` + `autonomous-decisions.md`；TD-12 关闭 | `docs/tests/runs/20261019-teamexec-02/results.json`（20/20 PASS，scope/executor/caseType 合计划）+ `proof/` 逐案字节产物；门禁从盘上文件重算全部 SHA-256；`batch-l-status.md` |
| A-02 / A-03 / C-02 Incomplete 死路 / init 与帧不结算 / 取消不释放 Worker | `558dee9` | session/client/worker 套件（含 UT-055..072 系列）；E2E-4/5/15/16/17 真实恢复；`review-round-7.md` 独立复核 |
| B-S04 录像 seek 可永久挂起、EOF 漏最终帧 | `b16004a` + `eb80706`（TD-15 逐帧导入） | video 套件；E2E-16 真实 V-SHORT / V-LAST-without / V-LAST-with 对照；TD-15 登记与 4 MiB 回归边界 |
| A-04 / B-S01 门禁把 FAIL/NOT_RUN/mock/错 scope 判成 PASS | `95c54b6` + `ce4051c`（计划 caseType 强制） | `verify-evidence.py` / `src/evidence.js` 双端一致：必需 PASS、scope/executor/caseType 对照计划、计划缺类型 fail-closed、工件校验按**计划**类型键控；`verify-evidence-selftest.py` 14 例；UT-043..048/083/084；round-7 B-1 攻击重放（round-8 独立复现两端拒绝） |
| C-01 含空格/中文目录启动器假成功 | `aa31eed` + E2E-1 最终状态（`247b68c`） | 启动器逐参数保真 + 回环监听确认（exit 5 失败路径）；E2E-1 从码点构造的 CJK+空格目录经 `launch.cmd` 与绝对 `pwsh -File` 启动、双输入哈希相等；首跑的 pwsh 归因已撤回（见下） |

Round 7 自身新发现的 B-1/B-2/B-3 也在 `ce4051c` 内整改并重跑：门禁 caseType 交叉校验（B-1）、E2E-16 缺末帧负向腿纳入 PASS 判定（B-2）、E2E-5 观察窗后重读断言与 E2E-19 真实关页重开（B-3）。round-8 独立复核 0 Blocking。

## 关键主张与对应证据

| 主张 | 证据 |
|---|---|
| 严格 EOF：截断与完成可区分 | `src/lib/compression/zstd_decompressor.h`、UT-049..054、`cmd-02-gate.log` |
| 20 条本地真实旅程全部完成 | run-02 `results.json` + `proof/`；`GATE local: PASS (20 required cases)`；外部 `Get-FileHash` 逐条重算 |
| 真实录像往返与最终帧策略 | E2E-14 真实发送窗口录像 V-GOOD-C/N（6 轮）；E2E-16 V-LAST 对照；TD-15 逐帧导入（`eb80706`） |
| 保存语义 / 系统对话框 / 重名确认 | E2E-11/12/13；`native-dialog.ps1`；`save-controller.js`；UT-025..030 |
| 证据纪律 | `evidence.js` + 双端门禁 + selftest 14 + UT-043..048/083/084；field 门禁诚实 FAIL |
| 启动器路径与失败语义 | `launch.ps1` / `launch.cmd`；E2E-1/2；TD-17（Node `fs.cpSync` 非 ASCII 乱码孪生，测试链问题） |
| 可恢复性（Incomplete/取消/停止） | A-02/A-03/C-02 修复；E2E-4/5/6/7/15/17/19 |

## 复跑命令

```powershell
node tools\desktop-recv\run-unit.mjs --all                 # 9 套件 90 例
node tools\desktop-recv\verify-assets.mjs --root build-desktop-recv\staging\receiver
python tools\desktop-recv\verify-evidence-selftest.py      # 14 例负/正矩阵
python tools\desktop-recv\verify-evidence.py --run docs\tests\runs\20261019-teamexec-02 --gate local
#   预期 PASS (20 required cases)，exit 0
python tools\desktop-recv\verify-evidence.py --run docs\tests\runs\20261019-teamexec-02 --gate field
#   预期 FAIL (6 violations：E2E-21..26 NOT_RUN)，exit 1——设计如此
```

native：`ctest --test-dir /home/luctery/t12a-src/build-native --output-on-failure` 为外审 round 1 实跑的 9/9；本轮整改未触碰 C++ 源、未重建 WASM，不据此声称新构建产物已验收。

## 明确的未完成 / 未验证（勿按已完成审查）

- **现场旅程 E2E-21..26**：`NOT_RUN`（用户侧）；field 门禁按设计 FAIL，不得由本地记录代填。E2E-26 计划为 measurement，现场 PASS 需先冻结阈值。
- **S-1 残留**：E2E-3/4/7/11/14/18/20 尚无旅程级 honest-FAIL try/catch；旅程崩溃时 runner 以 exit 1 诚实结束，但 `results.json` 会保留上一条 PASS。缓解：每条旅程的 `proof/<case>/` 逐案 observation/log 与重跑时间戳；门禁只读记录与盘上工件，不能识别陈旧记录。已在 round-7/8 登记，未在本轮修复。
- **S-2 录像输入不可从干净克隆复跑**：`docs/tests/runs/*/fixtures-media/` 自批次 L 起按设计 gitignore，录像与再生成载荷只在工作树。外审可复核的是**已提交的 `proof/` 字节工件**（`proof/<case>/original.bin` 与 `received.bin`），门禁与 round-8 审查均已从这些文件重算哈希并核对相等；无法直接重放录像输入旅程。
- **性能阈值**：未冻结，`NOT_EVALUATED`。
- **MP4/H.264、其他 DPI/缩放组合**：未验证（support-matrix 明确列出）。
- **TD-15/16/17 保持登记**：4 MiB 录像回归边界、发送端页面内模式切换恢复、Node `fs.cpSync` 非 ASCII 目标坑（均为已披露的边界，不冒充已关闭）。

## 证据诚实性说明（E2E-1 归因撤回）

Round-1 C-01 的启动器修复是真实的（`aa31eed`）。E2E-1 首跑曾把失败归因为"pwsh 无法从 CJK+空格目录加载脚本"，该归因**已撤回**：真因是测试链中 Node 22.23.1 `fs.cpSync` 把非 ASCII 目标复制成 GBK 乱码孪生目录而目标目录留空（不报错），pwsh 的 exit 64 是真实的文件缺失诊断。用户在同机以 32 种调用组合反证；重跑以码点构造路径、调用前用 node fs 校验精确目录名、逐边界记录码点/UTF-8 十六进制/原始字节，最终 `launch.cmd` 与绝对 `pwsh -File` 均 exit 0。首跑证据按字节保留在 `proof/E2E-1/first-run-fail/`（与 8c59864 blob 一致），隔离复现在 `proof/E2E-1/encoding-repro/`，登记为 TD-17。历史提交 8c59864 及其错误归因保留在 git 历史中。

## 建议外审工具（中立，供自选）

`production-code-audit`（全库生产级审计）、`security-review`（OWASP 清单）、`agnix`（agent 配置 lint）。

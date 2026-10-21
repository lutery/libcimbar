# 阶段5（team-exec）开发总结 — 桌面接收端

记录日期：2026-10-21；基线：分支 `screen-capture-recv`，HEAD `247b68c`。
本文与 `autonomous-decisions.md` 回应外部审查 Round 1（`docs/dev-pipeline/ext-review/round-1-verdict.md`）A-01 期望中"补充本轮缺失的 `stage5-dev-summary.md` 和 `autonomous-decisions.md`"的要求；文中提交哈希、文件路径与数字均可在本仓库核验。

## 1 概述

阶段5（团队实施与验证）交付 `web/desktop-recv` 独立回环浏览器接收端：双输入（实时抓屏 + 录像导入）、每会话新建 classic Worker/WASM、单在途帧调度、EOF 排空、显式保存与重试；复用原 C++ 解码核心，正常 ABI/发送协议不改。实施按批次 A→G（20 项基础任务 T1.1.a..T5.2.a）推进，经 6 轮内部审查后于 `0c0f27a` 收官。

外审 round 1（固定范围 `bfb0c8e..d61fa74`，35 提交/157 文件，reviewer `codex-gpt-6`）判 FAIL：规格轴 4 项 Blocking（A-01..A-04）、标准轴 B-S04 及三项重叠、主审独立实证 C-01/C-02，共 7 个独立主题。流水线回归 team-exec 整改：批次 H/I/J/K/L（`d61fa74..247b68c`，20 提交）修复全部 7 主题并补跑真实本地 E2E；批次 M（本批）写本文档并更新状态文件。

当前状态（截至 2026-10-21，HEAD `247b68c`）：

- 阶段5实施：内审 6 轮后于 `0c0f27a` 收官（round 6 APPROVE）。
- 外审 round 1：FAIL（7 个独立 Blocking 主题，见上）。
- 整改：批次 H/I/J/K/L 已交付；批次 M（本文档 + `autonomous-decisions.md` + `tech-debt.md` 的 TD-01/TD-12 关闭 + `pipeline-state.json` 更新）待内审 round 7 复核后提交外审 round 2。
- 真实本地 E2E：run `20261019-teamexec-02` 的 20 条本地旅程（E2E-1..20）全部 PASS，每条 PASS 均有盘上产物与外部 SHA-256 相等（门禁从文件重算）。
- 门禁：单元、资产、本地证据门禁 PASS；field 门禁按设计 FAIL（E2E-21..26 用户现场 NOT_RUN）。

## 2 实施范围与提交索引

### 2.1 批次与提交

| 批次 | 范围 | 提交 | 主题 |
|---|---|---|---|
| A | T1.1.a..T1.2.c | `26f710a`、`598a34f`、`513526f`、`a468e52`、`117a9af` | 环境盘点、配对发送端、严格 EOF 适配、资产装配、隔离 Worker |
| A 整改 | 内审 round 1-2 | `971c0c2`、`edd4d0f` | 资产摘要校验（B1）、时间戳来源（B2）、W1/W2/W4/W6/W7/W8 与 S2/S3/S4/S5（见 `review-round-1.md`） |
| B | T2.1.a..T2.1.c | `1ad18b3`、`89468d8`、`5d4c5a1` | 独立入口、实时帧单会话、显式保存往返 |
| B 整改 | 内审 round 3-4 | `80ecb9f`、`cedd603`、`d27422d` | B-1 诚实登记（TD-12）、TD-13 映射层接线 |
| C–G | T2.2.a..T5.2.a | `1aecee3`、`f22b0d2`、`aa065eb`、`12e78fd`、`d86611a`、`a515922`、`5233062` | 停止/晚授权/恢复、录像与有限 EOF、保存重试与停止结算、证据工具与首轮记录、测量与支持矩阵、候选包与现场手册 |
| 收官整改 | 内审 round 5-6 | `7a05665`、`9a5e697`、`4ff7823`、`0d04c80`、`0c0f27a` | 证据词汇冻结对齐、技债登记修订、round 6 APPROVE |
| 外审 round 1 | 阶段6 | `d61fa74`、`3d66cc2` | 外审包生成；verdict（FAIL）归档并回归 team-exec |
| H | 外审 A-02/A-03/C-02 | `558dee9` | Incomplete 可重启收敛、worker 故障全出口结算、主线程 init/frame 看门狗（TD-01）、取消释放客户端（C-02） |
| I | 外审 B-S04 | `b16004a` | 录像 seek 有界收敛 + 最终尾帧补采 |
| J | 外审 A-04 | `95c54b6` | 证据门禁改为验证工作而非记录形状（Python/JS 双端 + 负例自测） |
| K | 外审 C-01 | `aa31eed` | 启动器参数保真 + 服务监听确认 |
| L | 真实 E2E（A-01 旅程） | `16e2fa6`、`128a175`、`eb80706`、`648dacb`、`16c367d`、`468428c`、`543e59e`、`435d517`、`08c49e9`、`073feae`、`16d7b5b`、`bb878ab`、`8c59864`、`b576d48`、`247b68c` | 真实桌面 E2E harness、20 条本地旅程证据、产品缺陷修复（见 2.2）、TD-15 修复、E2E-1 复验与归因撤回 |
| M | 外审 A-01 文档项 | （本批，未提交） | `stage5-dev-summary.md`、`autonomous-decisions.md`、`tech-debt.md`（TD-01/TD-12 关闭）、`pipeline-state.json` |

### 2.2 真实 E2E 发现的产品缺陷（单元测试不可见）

| 提交 | 缺陷 | 症状 |
|---|---|---|
| `468428c` | SaveController 保存了未绑定的全局 `setTimeout`（"Illegal invocation"） | 每次真实保存都失败并报 16003 |
| `648dacb` | 录像导入期间预览元素被隐藏，逐帧回调不触发 | 录像导入停滞 |
| `16c367d` | 实时轮次后导入录像仍保留旧 `MediaStream`（`srcObject` 未替换） | 假 13005 失败 |

另：`eb80706` 将录像导入由 1/15 s 时间步进改为 `requestVideoFrameCallback` 逐帧解码（TD-15），详见 `autonomous-decisions.md` D-07/D-08。

### 2.3 范围统计

- 外审固定范围：`bfb0c8e..d61fa74`，35 提交、157 文件、+22,801/-9（verdict 实测）。
- 整改增量：`d61fa74..247b68c`，20 提交（批次 H/I/J/K/L 与 verdict 归档）。
- 阶段5起点基线 `84e7a1a`；`master..HEAD` 共 55 提交（含可行性分析与规划阶段提交）。

## 3 20 项基础任务对照表

| 任务 | 提交 | 验证方式（可核验） |
|---|---|---|
| T1.1.a 环境与证据盘点 | `26f710a` | CMD-01 生成真实 `environment.json`；未运行能力保持 NOT_RUN/null |
| T1.1.b 配对候选与原发送窗口 | `598a34f` | 干净构建副本 CMD-03 构建 + 原发送 B=68 烟测；`baseline.md` 记录命令与产物 |
| T1.2.a 严格 EOF 最小适配 | `513526f` | CMD-02 native ctest（compression/cimbar_js 严格 EOF 用例，UT-049..054）；外审 round 1 复跑 9/9 |
| T1.2.b 最终 WASM 资产与旧发送兼容 | `a468e52` | CMD-04 stage + `verify-assets.mjs` PASS（摘要/路径/严格 EOF 证据绑定，见 §6） |
| T1.2.c 新会话 Worker 与真实字节 | `117a9af` | CMD-05 worker/contracts 套件 + 浏览器 IAT-01/02 真 WASM 字节往返（VM 结果仅算 unit_integration） |
| T2.1.a 独立入口、回环启动与能力 | `1ad18b3` | ui 套件 + E2E-1/2 真实启动（占用端口 exit 3、中文/空格目录启动） |
| T2.1.b 实时帧与单会话垂直流程 | `89468d8` | session/scheduler 套件 + E2E-3 实时往返（2 类 × 3 轮，外部 SHA-256 相等） |
| T2.1.c 首条真实保存往返 | `5d4c5a1` | save 套件 + E2E-3/11/12/13 真实系统保存对话框与外部哈希 |
| T2.2.a 停止、去重、晚授权清理 | `f22b0d2` | session 套件 + E2E-4/6/7/17/19 停止/晚回调真实旅程 |
| T2.2.b 失败可恢复与无数据提示 | `aa065eb` | ui/contracts 套件 + E2E-5/8/15 恢复旅程 |
| T3.1.a 真实录像选择与受控处理 | `12e78fd` | video 套件 + E2E-14 真实发送窗口录像 6 轮、E2E-15 坏输入有限失败 |
| T3.1.b 最终帧与有限 EOF 屏障 | `12e78fd`（B-S04 整改 `b16004a`） | video/scheduler 套件 + E2E-16 V-SHORT/V-LAST 对照（128 KiB 难压缩载荷） |
| T3.2.a 保存取消与失败重试 | `d86611a` | save 套件 + E2E-11 取消后同产物重试 |
| T3.2.b pending 写入及停止结算 | `d86611a` | save/lifecycle 套件 + E2E-13 模态与停止结算 |
| T4.1.a 样本与证据记录工具 | `a515922`（加固 `95c54b6`） | evidence 套件 + `create-fixtures.py` + CMD-09 门禁负例自测（`verify-evidence-selftest.py`） |
| T4.1.b 实际本地完整 E2E | `a515922`（首轮记录）；批次 L `16e2fa6..247b68c`（重跑） | run `20261019-teamexec-02` 的 E2E-1..20 全 PASS（见 §5） |
| T4.2.a 容量性能量测和 profile 校准 | `a515922` | run `20261018-teamexec-01` 的 `measurements.json` + CMD-10 汇总；E2E-16/18 规模往返 |
| T4.2.b 发布支持矩阵 | `a515922` | `support-matrix.md` 逐组合标注已通过范围/NOT_RUN；E2E-8/9/14 对应组合 |
| T5.1.a 候选包和正常操作说明 | `5233062` | staging candidate 装配（CMD-04）+ E2E-1 中文/空格目录真实启动往返 |
| T5.2.a 用户现场步骤与空回执 | `5233062` | `field-guide.md` + `field-receipt.json` 空回执；field 门禁对空回执 FAIL（§6） |

24 任务中的其余 4 项：T5.1.b（内审部分完成，外审 round 2 待提交）、T5.1.c（阶段8 最终交付包）、T5.2.b（用户云桌面现场，NOT_RUN）、T5.2.c（条件激活，未触发）。后四项按计划不纳入阶段5编码完成条件（实施计划"24个原Task编号不变"节）。

## 4 内审 6 轮与整改进程

| 轮次 | 范围 | 裁决 | 处置 |
|---|---|---|---|
| Round 1 | `26f710a..117a9af`（批次 A） | REQUEST CHANGES（2 Blocking） | B1 资产运行时摘要校验、B2 时间戳预填 → `971c0c2`、`edd4d0f` |
| Round 2 | 整改提交 | APPROVE（0 Blocking） | B1/B2 关闭；残留 W/S 登记 TD-01..TD-11 |
| Round 3 | `1ad18b3..de78871` + `cedd603`（批次 B） | REQUEST CHANGES（1 Blocking） | B-1：批次 B 记为 complete 但定义性真实验证缺席 → 状态改"代码完成、UAT 推迟"，登记 TD-12（硬性窗口=批次 F T4.1.b 前） |
| Round 4 | `80ecb9f` | APPROVE（0 Blocking，以 TD-12 为条件） | B-1 关闭；残留并入 round 5 |
| Round 5 | `1aecee3..5233062`（批次 C–G） | REQUEST CHANGES（1 Blocking） | B-1：技债登记失真（TD-01/02/06 关闭条件指向已完成任务）→ `7a05665` 诚实修订 |
| Round 6 | `7a05665` 等整改 | APPROVE（0 Blocking） | 阶段5实施完成成立；明示三项交付前硬门禁：TD-01 关闭、TD-12 补跑、E2E-21..26 现场与外审按计划 |

归档文件：`docs/dev-pipeline/review-round-1.md` … `review-round-6.md`。

### 4.1 外审 round 1 与整改映射

外审（2026-10-19，reviewer `codex-gpt-6`，规格轴 + 标准轴 + 主审实证）判 FAIL，7 个独立 Blocking 主题及整改：

| 主题 | 内容 | 整改提交 | 复验证据 |
|---|---|---|---|
| A-01 | 18 条本地旅程未执行却登记完成；缺开发总结与决策索引 | 批次 L（真实 E2E）+ 批次 M（本文档） | §5、§6；`autonomous-decisions.md` |
| A-02 / B-S02 | Incomplete 后按钮可点但协调器永久拒绝新会话 | `558dee9` | session 套件扩展；E2E-4/5/7/19 |
| A-03 / B-S03 | Worker 故障不结算初始化；无有效帧看门狗（TD-01） | `558dee9` | `client.test.mjs` 8 例；TD-01 关闭 |
| A-04 / B-S01 | 证据门禁把 FAIL/NOT_RUN/mock 判成 PASS | `95c54b6` | `verify-evidence-selftest.py` 负例；§6 实跑 |
| B-S04 | 录像 seek 可永久挂起；EOF 漏最终关键帧 | `b16004a` | video 套件扩展；E2E-16 真实对照 |
| C-01 | 含空格/中文目录启动器返回成功但未监听 | `aa31eed` | `proof/E2E-1/launch-log.txt` |
| C-02 | 取消选源后并行初始化的 Worker 未释放 | `558dee9` | session 套件；E2E-4 |

## 5 E2E 执行汇总

运行目录：`docs/tests/runs/20261019-teamexec-02/`。`results.json` 共 20 条记录（E2E-1..20），全部 `PASS`、`executedBy=executor`、`scope=local_simulated`、`caseType=file_roundtrip`；每条 PASS 的 `proof/<case>/` 下有真实盘上产物，门禁从盘上文件重算 SHA-256 并要求与记录相等。逐条摘要（详见 `batch-l-status.md` 与 `results.json` notes）：

| 旅程 | 执行内容 |
|---|---|
| E2E-1 | 打包候选从码点构造的 CJK+空格目录首启动：手册口径 `launch.cmd` + `pwsh -File` 绝对预检均 exit 0；实时与 V-GOOD-C 录像导入均哈希相等（首跑错误归因已撤回，见 D-13/TD-17） |
| E2E-2 | 占用端口启动 exit 3 且报因可读；清洁重启 + 实时往返哈希相等 |
| E2E-3 | 实时往返：可压缩 + 难压缩各 3 轮（6 轮全等） |
| E2E-4 | 真实选源取消 → 可重启 → 往返哈希相等 |
| E2E-5 | 空白窗口：7 秒观察期结束后重读页面状态复核（saveDisabled=true、无产物）；停止重选恢复 |
| E2E-6 | 同名同大小 A/B：外部结束（标签页/窗口关闭）收敛 Incomplete、无幻影产物；新会话保存 B 哈希正确 |
| E2E-7 | 停止连点收敛一次；新会话干净 |
| E2E-8 | 4C 发送端无假 Ready；页面内翻回 B 无法恢复可解码流（产品发现 TD-16）；重载发送端恢复、哈希相等 |
| E2E-9 | 默认 / 窗口缩放 / 接收端渲染缩放 1.5 三腿哈希相等；OS 显示缩放未覆盖（矩阵无此组合声明） |
| E2E-10 | 接收端在前往返；发送端最小化 15 s 无假 Ready；还原后保存哈希相等 |
| E2E-11 | 保存取消后同一产物重试保存成功 |
| E2E-12 | CJK/空格名：取消哨兵完好；覆盖拒绝 + 改名保存（同一对话框会话） |
| E2E-13 | picker 打开时保存按钮禁用防御；单次真实保存 |
| E2E-14 | 真实发送窗口录像（V-GOOD-C/N）6 轮全等 |
| E2E-15 | 空/非视频/损坏容器有限失败；恢复后真实录像保存 |
| E2E-16 | 128 KiB 难压缩载荷：V-SHORT 不 Ready；V-LAST-without 结束 Incomplete（该负向腿已纳入 PASS 判定）；完整录像保存哈希相等（TD-15 载荷口径见 D-08） |
| E2E-17 | 双输入停止切换两腿：录像 A 中停→实时 B；实时 A 中停→录像 B |
| E2E-18 | 1 MiB 难压缩实时往返哈希相等 |
| E2E-19 | 刷新 / 真实关页重开（旧页 close 后新开页加载接收页）/ 接收服务重启，四轮往返全等 |
| E2E-20 | 10 轮交替双输入，每次输出哈希相等；最终包部分留阶段8 |
| E2E-21..26 | 用户云桌面现场旅程：NOT_RUN（用户执行；field 门禁按设计 FAIL） |

## 6 门禁命令与当前结果

以下结果于 2026-10-21 在 HEAD `247b68c` 的工作树上实跑（除非另注）：

| 门禁 | 命令 | 当前结果 |
|---|---|---|
| 单元 | `node tools/desktop-recv/run-unit.mjs --all` | PASS——9 套件 90 测试，0 fail/todo/skip（round-7 B-1 后含 evidence UT-083/084） |
| 资产 | `node tools/desktop-recv/verify-assets.mjs --root build-desktop-recv/staging/receiver` | PASS——assetSetId `desktop-recv-v1`，revision `a515922`（staging 资产仍绑定 `a515922` 构建树，非当前 HEAD） |
| native | `ctest --test-dir /home/luctery/t12a-src/build-native --output-on-failure`（WSL） | 9/9 PASS——外审 round 1 实跑；整改未触碰 C++ 源，本轮未重新构建 WASM，不据此声称新构建产物 |
| 本地证据 | `python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261019-teamexec-02 --gate local` | PASS（20 required cases），exit 0 |
| 现场证据 | 同上 `--gate field` | FAIL（6 violations：E2E-21..26 记录缺失），exit 1——设计如此：现场旅程未执行必须失败 |

## 7 遗留项

- **用户侧现场旅程 E2E-21..26**（T5.2.b）：NOT_RUN；field 门禁按设计 FAIL；不得由本地记录代填。对应 TD-12 型现场操作，属于用户侧遗留。
- **E2E-6 字面偏差**：计划步骤要求点击 Edge 共享指示条，本机 Edge 的 sharing chip 未暴露给 UIA，自动化不可达；实际验证外部结束（标签页/窗口关闭）路径，偏差如实记录于 `results.json` notes 与 D-11。
- **TD-15 剩余**：逐帧解码已落地（`eb80706`），但 4 MiB 载荷的完整往返回归受录制装置投递上限限制未复跑；E2E-16 以 128 KiB 难压缩载荷完成。TD-15 保持登记。
- **TD-16**（E2E-8 产品发现）：发送端页面内模式翻转离开 B 后无法恢复可解码流，恢复方式为重载发送端页面；判定协议范围外，写入 README Notes 与 `tech-debt.md`。
- **TD-17**（测试链）：Node 22.23.1 `fs.cpSync` 在 ACP/OEM 936 主机产生 GBK 乱码孪生目录；`run-e2e.mjs` 已改为逐项复制规避，TD-17 保持登记。
- **E2E-20 最终包部分**留阶段8（T5.1.c）。
- **外审 round 2 未提交**：`pipeline-state.json` 的 `external-review.status` 保持 `failed`；待内审 round 7 复核本批文档与状态后再提交。

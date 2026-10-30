# Round 19 — PS5.1正式化整改独立复审

## Verdict

不通过

**上轮A18-01/B18-01均已关闭；本轮有1个新增Blocking：遗留浏览器回收的停止授权仅凭命令行子串。** 规格轴A19-01与标准轴B19-01是同一主题，去重计1项。两轴分别不通过。

固定HEAD `69bd4f46057bbe99bf70200b35cc72d665a8572f`，分支 `ps51-preview`，本轮整改基线 `42051b0b4056c787e987f1061e7f6a9b25d022cd`。PS5.1默认开页、实时/录像接收保存和失败恢复证据已经核实，产品仍27文件同字节；不因新工具问题重开这些已通过范围。

本裁决只新增此文件，不修产品、不改状态、不打包或合并。原A16-02矩阵清理、核心UX、S15/S16已关闭项及E2E-35/37、现场七项边界保持不变。

## Blocking issues

### 规格轴 A — 不通过

#### A19-01｜新回收函数把命令行中任意标记子串当作停止进程的授权

- **位置：**`tools/desktop-recv/e2e/run-e2e.mjs:220–237`；接收器/录像器启动前调用`:478`、`:1290`附近。
- **与声明的差异：**送审包“诚实性边界”第3条称，仅回收profile身份验证的自动化浏览器，非harness占用者拒绝。实际逻辑取得CDP端口owner PID后，只读取CommandLine，再以 `/cimbar-e2e-/i`匹配整串，命中即 `Stop-Process -Id <owner> -Force`。没有验证进程实际是浏览器，没有解析真实 `--user-data-dir` 参数，更没有把该参数绑定到已知自动化profile。脚本名、日志目录或其他普通参数含标记即可通过。
- **A独立反证：**抽取当前真实reclaimStaleAutomationBrowser，端口9445由外来PID424242占用，CIM命令行为 `python.exe C:\work\cimbar-e2e-demo\unrelated-server.py --port 9445`。仅用记录器替代OS接口，真实函数仍请求强制停止424242并报告profile marker verified。探针exit0，真实OS动作0。
- **主审独立复验：**同一真实函数体，外来命令行为 `"C:\Python\python.exe" "C:\work\cimbar-e2e-diagnostics\serve.py" --port 9445`；不是浏览器、无profile参数，仍实际走到停止请求并返回 `{pid:424242, port:9445}`。没有真实终止任何该反例进程。
- **影响边界：**这是本轮新增的CDP回收函数，不是重开已修复的ps51-launch-check矩阵。当前实跑日志中的79176可能确为旧自动化Edge，本项不宣称该次已经误杀；但“非harness必拒绝”的一般性安全声明被真实调用链反例否定。
- **关闭条件（可最小修复）：**可以删除自动终止分支，遇端口占用直接报错并拒绝启动，保留占用者；这已足以消除本项，不要求增加复杂回收系统。若保留自动回收，则停止前必须核验实际浏览器映像、规范化且精确的 `--user-data-dir` 参数及可证明的自动化归属；普通参数/路径含标记不能授权。
- **针对性验证：**无论选哪种修复，都要通过真实生产入口验证“非浏览器脚本名含标记”“外部浏览器普通参数含标记/错误profile”均不发停止请求，且正常空闲启动不受影响。保留自动回收时再补已知旧自动化profile的合法回收正例。验证回收/拒绝腿即可；无需重跑未变的产品核心和本轮已有效的默认开页/接收保存矩阵。同步纠正“profile marker verified”与实际检查不符的文案。

### 标准轴 B — 不通过

#### B19-01｜CDP回收以命令行子串代替进程/profile归属

与A19-01同一Blocking主题，保留本轴独立报告归属，不另计第二项。

B独立抽取当前真实函数，以外来PID424242及普通 `python.exe "%TEMP%\cimbar-e2e-report.py" --port 9445`驱动生产控制流；函数仅因脚本名含标记就请求Stop-Process并报告回收成功。探针exit0，实际OS动作0。检查位置同`:220–237`；关闭条件同A19-01，不能只新增一个更窄的任意子串而继续跳过进程/profile身份。

B另外在StrictMode3下独立执行真实AST函数链Find-Dialog→Find-ByName：合法utility返回Count1、非String UI对象，成功找到Share按钮，旧B18-01可关闭。四份变更工具文本限定凭据形态扫描0命中，未发现另需独立阻断的产品静态破坏。

### 已关闭与保留证据

| 项 | 裁决 |
|---|---|
| A18-01：SNAP解析、URL-only及启动关联 | **CLOSED**。五列解析与标题含竖线正例通过；错path/query、TCP-only、pre-existing拒绝；本次pre8767/post8768有精确URL |
| B18-01：utility返回值污染 | **CLOSED**。诊断脱离返回流；真包装层正例Count1、下游Find-ByName成功 |
| B17-01：无归属对话框及合法utility路径 | 原拒绝与成功路径均补齐；10项自测及真实旅程证据有效 |
| round-18要求的书面更正 | 已完成。送审包专节、r18台账、exec-log和总结§8.6明确撤回旧TCP/前台锁解释 |
| A16-02/B-R16-1及S15/S16旧项 | 保持关闭；本轮新增回收风险单独编号，不推翻旧矩阵12/12 |
| 产品/现场范围 | 产品未改；E2E-35/37及现场七项按用户决定继续保留，不新增阻断 |

## Suggestions

None。本轮仅需处理上述新增回收主题；允许采用“占用即拒绝、不自动终止”的最小改法，不要求扩展产品功能或全面重测。

## Reviewer

主审：`codex-gpt-6`（独立于实施方Claude），2026-10-29，Asia/Shanghai。全新规格轴 `/root/r19_spec`、全新标准轴 `/root/r19_standards`并行只读，均返回FAIL；主审独立复验生产回收反例、自测、工具测试及当前实物。

采用dev-pipeline阶段6、code-review双轴、thermos、santa-method、verification-before-completion、testing-protocol和code-review-excellence。未检出仓库新增AGENTS等规则文件；遵守用户Context7的code review例外，不请求外部库文档。只裁决不修复，不推进Claude管理的状态。

### 材料、范围和身份

已核对根stage5索引、本轮总结§8.6、round-18裁决、round-19包/模板、更正专节、r18-remediation、相关RED/recheck、root16原始开页/引擎/原收/外部SHA和两旅程console，以及当前diff。沿用已确认需求/设计/测试基线，按上轮关闭条件和本轮新增函数审查，不重审未变核心矩阵。

主要链为 `afbf16a`→`f5874d1`→`08adf50`→`82d2fac`→`2791cf7`→`cd53a20`→`35a4d78`→`4d2a9eb`→`69bd4f4`。

- 根 `docs/tests/runs/20261029-teamexec-16`，attempt `candidate-20261029-03`，harness `cd53a207f27d56565153520ed31e053d9f27ccb8`。
- product-manifest原字节SHA `7a5e5f1a4ac19825c7055ca6ea199d9f6e0914b24ba6b277243c38ff57fb0abf`，与root15完整清单逐字相同；staging27文件逐个重哈希匹配。
- input-manifest原字节SHA `6fe9ce55e0ee1e0621013655c94563bac44d68684cf7755fb1c7eaa03df95197`，与context一致；42项输入大小/SHA全部匹配。
- tools-identity8项内容SHA全部匹配当前文件。本轮矩阵工具和冻结方法无变化。
- E2E-1 attempt `E2E-1-2026-10-29T12-11-32-658Z-2f9999`；E2E-2 attempt `E2E-2-2026-10-29T12-14-50-698Z-5cc6c5`。E2E-1主/实时/录像及E2E-2主/实时共5份接收文件实际等于对应原件，SHA均为 `2f5a22f95c019d18cfbdd4f64da9c2e1d9ff3b0d83a7e0bc52c6d46b202f046e`，存量certutil记录一致。
- 四个失败attempt目录cc0973、ownership-refused、stale-cdp、strictmode及控制台记录已保留，未改写为成功。

### 主审本次新执行

| 检查 | 实际结果 |
|---|---|
| 三套工具node --test | 最终exit0，69/69，0 fail/skipped/todo |
| page-open --selftest | 原字节OS临时复制件，exit0，8/8；原始行→真实parser→judge |
| native-dialog dialog-selftest | 原脚本/数据OS临时复制件，exit0，10/10；含p3完整wrapper Count1与Find-ByName成功 |
| 当前page-open.json真实复算 | PASS；target `http://127.0.0.1:8768/`，pre仅 `127.0.0.1:8767`、post精确8768；实际URL命中，非TCP替代 |
| 旧解析/判定反例复验 | 正常五列读出URL；不同path/query、TCP-only SYN_SENT、pre-existing均拒绝 |
| 新回收函数反例 | 普通Python命令行含标记即可触发停止请求，实际OS动作0 |
| JS语法与diff | run-e2e/page-open-check的node --check通过；变更工具git diff --check通过 |
| root16资产 | ASSET VERIFICATION PASS；WASM SHA仍d1080cdc600ca842a337b8ea6157bc5cc2c545aaa75fce7b14e8585e9eb4685b |
| 构建/输入/工具及原收 | 27/42/8全部匹配；5份原收实际相等 |

自测会向脚本所在目录写JSON，因此主审仅在专属OS临时根运行原字节复制件；执行后经绝对路径、父目录和前缀检查移除。未改真实工具或原始证据。回收反例以记录器替换OS边界，未终止任何已有浏览器/服务，也未操作用户窗口。

规格轴另确认E2E-1的RECV_PORT绑定本次OPEN_PORT，真实共享日志指向8768；实时/录像两腿复用该接收器。tabActivation=null如实表示本次未触发后台激活分支，不冒充该分支已实跑。此事实不影响本次实际地址栏URL证据的有效性。

本轮未新执行完整桌面E2E或最终包安装；原收、engine-env和console是复读研发原始实物，不冒充主审新保存。矩阵12/12和unit222等未变证据沿用原审查，不写成新运行。尚未批准从root16打包/合并。

### 固定17项与Todo

| 项 | 本轮判断 |
|---|---|
| 1 问题匹配/遗漏 | 旧两主题闭环，新增回收授权缺口 |
| 2 代码/设计 | URL-only/单UI对象符合要求；回收归属不符声明 |
| 3 文档当前性 | 书面更正成立；profile verified主张超出实际检查 |
| 4 范围 | 产品未改，新风险限本轮工具 |
| 5 过度设计 | 自动回收非产品支持必需，可最小取消危险分支 |
| 6 旧反馈 | A18-01/B18-01关闭 |
| 7 正常功能 | 新回收可能停止无关进程 |
| 8 死码/效率 | 无独立Blocking |
| 9 回归波及 | 新CDP回收越过已有进程保护边界 |
| 10 敏感信息 | B限定4份变更工具凭据形态扫描0命中 |
| 11 桩/MOCK假绿 | 产品无新增；记录器反例不冒充E2E |
| 12 测试真实性 | 原始URL/包装层已覆盖，新增回收缺拒绝反例 |
| 13 决策依据 | 处理stale browser有缘由，但子串不构成归属 |
| 14 前verdict闭环 | 两旧Blocking关闭，新主题单独编号 |
| 15 证据铁律 | 新实跑、复读实物、未执行分别列示 |
| 16 发现格式 | 唯一主题有位置/证据/关闭条件，双轴去重 |
| 17 总结逐项核对 | URL/传输/更正成立；回收安全声明不足 |

- [x] 固定HEAD、基线、状态和本次候选身份。
- [x] 新A/B双轴独立只读，分别报告并合成。
- [x] 新执行69工具、8/10自测及生产反例。
- [x] 核对27产品、42输入、8工具与5份原收。
- [x] 关闭旧主题，限定唯一新增主题及最小修复路径。
- [x] 只新增本裁决，保护产品、原始证据、索引与状态。

状态保持external-review / waiting_external、ext_rounds=18；原字节SHA256保持 `ec24a2a6d7b8061ae107d70d05fbdeb611b46ebf555d4891d2a630b9480a677f`。Claude阶段6可消费此文件，只提取本轮唯一回收主题返回阶段5；修复受影响清理/拒绝路径后再送审。无需重新开启已通过的PS5.1产品验收或代用户执行现场项。

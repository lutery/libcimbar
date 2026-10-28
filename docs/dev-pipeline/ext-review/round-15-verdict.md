# Round 15 — PowerShell 5.1 临时兼容预览独立审查

## Verdict

通过

**本结论限于用户授权的 PS5.1 临时兼容预览补丁，0 Blocking。** 本机真实 Windows PowerShell 5.1 能从中文与空格目录启动该预览包；CMD 在找不到 pwsh 时实际回退成功，pwsh 优先路径仍正常。页面及 WASM 的 HTTP 响应与磁盘字节一致，失败出口没有被误判成功。

固定分支 `ps51-preview`，HEAD `a2c05e1a3a58ff86c9fac553f0b5f72996f9c8a2`，审查基线 `7b91057be04a881d25fce75c816f8c3185450543`。实施提交为 `ff21be5`、`a2c05e1`。源码变化仅 `web/desktop-recv/launch.ps1`、`launch.cmd`、`README.md`，合计 +23/-3；接收器 JS、WASM、发送端和协议未改。

原流水线已完成至 release-packaging，ext_rounds=14。本次按用户指令作补充阶段6审查，以 ext_rounds+1 命名本文件；保留原 round-14 结论，不重置流水线或替实施方推进状态。**此裁决不把预览件升级为正式 1.2.0，不表示 PS5.1 下完整 E2E-1/E2E-2、浏览器自动打开或用户云桌面现场验收已经执行。** 原 E2E-35/37、现场七项的边界继续独立保留。

## Blocking issues

### 规格轴 A — 通过

None。全新只读审查者 `/root/ps51_spec` 独立检查：

- `launch.ps1:1` 下调 Requires 到5.1，新增 UTF-8 输出初始化和双引擎帮助；`launch.cmd:13–17` 保留 pwsh 优先，仅无 pwsh 时用 Windows PowerShell。符合临时兼容的最小范围。
- 真实 Windows PowerShell 5.1.22621.6133 解析成功、执行 `-Help` exit0；没有用解析和帮助通过替代实际启动。
- 三个源码文件与预览包对应文件字节一致；51项交付清单逐个大小/SHA匹配，ZIP52文件与目录一致。对比原正式包，47文件不变，仅启动三文件及预览发布说明、清单不同。
- RELEASE-NOTES 明确预览身份、历史测试及尚未复验的完整 E2E 边界；没有用临时启动改动补填原 UX/现场验收。原 round-14 已闭环的核心问题不重新扩大审查。

本轴没有独立启动 HTTP 服务、CMD fallback、浏览器或文件传输；这些启动面由主审下面的新执行补齐。A建议把主审命令、版本及结果写入本裁决，已落实。

### 标准轴 B — 通过

None。全新只读审查者 `/root/ps51_standards` 独立检查：

- 真实 PS5.1 `-Help` exit0，PS7 AST解析错误0；参数传递、PSScriptRoot 定位和失败出口未发现本次新增静态破坏。
- 独立重哈希51项清单并对比完整ZIP/目录，源码与交付包一致；核心负载字节未变，启动入口仍需主审新执行证明。
- 已提交变更文本的定向凭证形态扫描无匹配；未发现新增桩代码、MOCK假绿、无关模块扩改或需要阻断的结构/效率问题。不把定向扫描当全面安全认证。
- 预览声明和未重跑边界与实物一致。本轴未运行服务、桌面或抓屏/录像流程，不宣称完整 E2E 通过。

两轴均独立返回 PASS。主审动态实测发现的诊断文案问题单列于 Suggestions，不将两轴报告合并重排。

## Suggestions

### S15-01｜PS5.1 下快速退出服务的子进程退出码诊断为空（非阻断）

- **位置：**`web/desktop-recv/launch.ps1:131–132`，交付包同位置。
- **实际证据：**只在 OS 临时副本内，把 `server.py` 换成输出 `review-controlled-start-failure` 到 stderr 后 `SystemExit(23)` 的受控程序。真实 PS5.1 启动器 exit5，stderr保留真实marker和诊断日志路径，但出现 `server process exited with code `，没有显示23。
- **建议与验证目标：**取得可靠的子进程退出码后再输出；若当前环境不能取得，应明确提示未知。用快速 exit23 和正常启动各复验一次，要求失败仍返回5、错误内容和日志路径保留，诊断数字准确或明确未知。尚未证明空值的具体根因，不指定未经验证的修复方式。
- **非阻断理由：**启动失败没有误报成功，调用方仍收到5，实际错误和日志仍可定位问题；不影响本次临时兼容的正常启动。此项只降低诊断完整性。

## Reviewer

主审：`codex-gpt-6`（独立于实施方 Claude），2026-10-28，Asia/Shanghai。新规格轴 `/root/ps51_spec` 与新标准轴 `/root/ps51_standards` 并行只读，分别给出PASS；主审独立运行启动矩阵及包一致性验证。

方法：dev-pipeline 阶段6、code-review 双轴、thermos、santa-method、verification-before-completion、testing-protocol、code-review-excellence。遵守用户 Context7 规则中的 code review 例外，本轮没有请求外部库文档。未检出仓库内额外 AGENTS/CONTRIBUTING/CODING_STANDARDS/GLOSSARY 规则文件。

### 材料与交付身份

读取流水线状态、根 stage5-dev-summary 索引、active_requirements / active_design / active_plan / active_implementation_plan / active_test_plan / active_e2e_plan 所指文档、autonomous-decisions、上一轮 verdict，并核对本次两个提交及预览说明。原 stage5/round-14 是已有核心验收的历史依据，不冒充新增 PS5.1 验证报告。本轮新增兼容声明以三个源码文件、预览 RELEASE-NOTES 和下面真实执行为准。

- 预览目录：`product/libcimbar-desktop-receiver-1.1.0-ps51-preview-20261028-1447/`。
- ZIP：同名 `.zip`；主审重算SHA256为 `ceec82808de56bda21bbb93da3c5ff272acae4b30a07c47c6fe633880c87e418`。
- 对照原包：`product/libcimbar-desktop-receiver-1.1.0-20261027-0942/`。
- 主审逐个验证：manifest51条全部大小/SHA正确，覆盖除清单本身外的完整文件集；目录52文件与ZIP52文件名、内容完全一致；47文件与原包字节相同。不同的5文件恰为 `launch.ps1`、`launch.cmd`、`README.md`、`RELEASE-NOTES.md`、`DELIVERY-MANIFEST.txt`。

### 主审本次实际执行

从交付目录完整复制到 OS 临时目录下的 `中文 空格 临时预览`，另设无关工作目录启动；原包、源码和真实验收证据均未改。引擎实际版本为 Windows PowerShell **5.1.22621.6133**、pwsh **7.6.9**，不把研发历史记录的pwsh7.5当本轮版本。

正例命令模板：

```text
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<中文 空格 临时预览>\launch.ps1" -Port <空闲端口> -NoBrowser
pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "<中文 空格 临时预览>\launch.ps1" -Port <空闲端口> -NoBrowser
cmd.exe /d /c call "<中文 空格 临时预览>\launch.cmd" -Port <空闲端口> -NoBrowser
```

最后一条分别在正常 PATH 和仅该子进程隐藏 pwsh 的 PATH 执行。回退环境只保留 Python目录、System32、WindowsPowerShell v1.0目录；执行前断言 pwsh 不可发现、python可发现、powershell解析为实际5.1可执行文件。没有修改机器PATH、注册表、系统执行策略或 UTF-8 Beta设置；Bypass仅作为该进程参数。

| 本次检查 | 实际结果 |
|---|---|
| PS5.1 直接启动 | exit0，3.16s；打印的中文空格路径完整 |
| PS7 直接启动 | exit0，1.55s；打印路径完整 |
| CMD正常优先路径 | exit0，1.72s；打印路径完整 |
| CMD无pwsh真实回退 | exit0，3.30s；打印路径完整 |
| 四个正例的服务验证 | 每次分别请求 `index.html` 与 `vendor/cimbar_js.wasm`，均HTTP200；1915及1939173字节，SHA256逐个等于该临时包文件 |
| PS5.1帮助 | `-Help` exit0，包含powershell用法 |
| PS5.1端口占用 | 由测试进程实际占用端口，启动器exit3并提示端口冲突 |
| CMD回退时端口占用 | 同样实际占用，CMD最终exit3，验证退出码传播 |
| PS5.1缺文件 | 临时fixture缺 `server.py`，exit4，输出对应路径 |
| PS5.1无Python | 仅该子进程PATH隐藏python及py，先断言均不可发现；exit2 |
| PS5.1服务异常快退 | 临时server输出marker并exit23；启动器exit5、真实stderr及日志路径保留；子进程数字为空，见S15-01 |
| 资产校验 | `node tools/desktop-recv/verify-assets.mjs --root product/libcimbar-desktop-receiver-1.1.0-ps51-preview-20261028-1447` exit0，ASSET VERIFICATION PASS |
| 源码差异检查 | `git diff --check 7b91057be04a881d25fce75c816f8c3185450543..HEAD -- web/desktop-recv` exit0 |

资产校验复用既有 strict EOF 证据，不等于本轮新构建WASM。实际资产revision为 `00e04628b4447a3888019a285b478709384595a9`，WASM SHA256为 `d1080cdc600ca842a337b8ea6157bc5cc2c545aaa75fce7b14e8585e9eb4685b`。

测试装置也保留失败事实：首次用Python PIPE捕获输出，PS5.1服务已经HTTP200，但测试等待输出EOF超时；停止已核实属于本次临时目录的服务后收敛。改为文件捕获输出后取得上述完整退出结果。另一次CMD调用被Python列表参数转义成反斜杠引号而未进入脚本；改为CMD完整命令行后重跑四正例及全部异常分支，最终测试进程exit0。两次装置失败不计产品通过，也未靠放宽产品断言消除。

所有测试服务均先核对PID及命令行中的本次临时目录和server.py，再定向停止；临时副本已移除，最终未发现残留的本次测试服务。没有按进程名或端口杀其他服务。

### 固定17项与Todo复核

| 项 | 本轮判断 |
|---|---|
| 1 问题匹配/遗漏 | 临时支持5.1，正常启动与实际CMD回退已有新证据 |
| 2 代码/设计对齐 | 仅启动兼容，未改接收器或协议契约 |
| 3 文档当前性 | 预览说明与实物一致；历史版本和未执行边界明确 |
| 4 范围/其他模块 | 三源码文件及独立预览包，无关核心不变 |
| 5 过度设计 | 未见新增无必要抽象/兜底 |
| 6 原反馈遗漏 | 原round-14不重开，不声称其覆盖新增5.1支持 |
| 7 正常功能 | PS5/PS7及CMD双路径真实HTTP、资源字节通过 |
| 8 死码/效率 | 未见本补丁需阻断的问题 |
| 9 回归波及 | 原47文件不变；受影响启动面重新执行 |
| 10 敏感信息 | B轴限定已提交变更文本扫描无命中 |
| 11 桩/MOCK假绿 | 产品未新增；受控失败仅改OS临时副本，不算传输验收 |
| 12 测试设计/真实性 | 引擎、路径、PATH回退、HTTP字节与失败出口均实测；完整E2E未冒充 |
| 13 决策依据 | 用户临时支持授权；保持preview且不代填正式转正门禁 |
| 14 前verdict闭环 | 原核心审查已通过；补丁不更改其关闭证据 |
| 15 验证铁律 | 读取最终退出结果；初始装置失败与最终实测分开记录 |
| 16 问题证据/期望 | 无Blocking；S15-01含具体位置、实测及验证目标 |
| 17 总结逐条核对 | 新增声明通过diff、实物与新命令核对；旧stage5未作为新5.1报告 |

- [x] 固定补丁基线和HEAD，核对需求、原验收与preview边界。
- [x] 两个全新审查者并行只读，两轴均PASS并分开呈现。
- [x] 真实PS5.1/PS7、CMD优先/回退、HTTP字节和失败出口验证。
- [x] 清单、ZIP、源码/交付一致性及原核心不变核验。
- [x] 明确完整E2E、浏览器自动打开、云桌面现场及正式转正仍非本次执行结果。
- [x] 只新增本裁决；保留产品、证据、索引、HEAD与流水线状态。

流水线文件审前SHA256为 `40c4148c7b937f02852aee177d08c8b9cff98da6ebffbb731c26cef88c0eb630`，审后须保持相同。Claude可在阶段6消费本文件作为临时兼容补丁的审查结论；正式转正仍按预览说明执行受影响的完整E2E及打包流程。

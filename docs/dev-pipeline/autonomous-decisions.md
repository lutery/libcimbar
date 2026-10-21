# 自主决策索引（autonomous decisions）

记录日期：2026-10-21；基线：HEAD `247b68c`。本文件回应外部审查 Round 1（`docs/dev-pipeline/ext-review/round-1-verdict.md`）A-01 关于"缺失自主决策汇总/可核验决策索引"的要求，逐条列出阶段5实施与整改中的自主决策及其依据、影响范围与可核验提交/证据。编号前缀 D- 与外审 Blocking 编号（A-xx / B-Sxx / C-xx）无对应关系。

| 编号 | 决策 | 依据 | 影响范围 | 关联提交或证据 |
|---|---|---|---|---|
| D-01 | Incomplete 终态统一为可重启：UI 控件表与协调器 IDLE_STATES 收敛，Incomplete 后 startLive/startVideo 均创建全新会话，无旧进度/产物 | 外审 A-02/B-S02（AC-006/007/008、IF-007）；受控 Node 复现"busy 死路" | `session.js`、`ui.js` | `558dee9`；`tests/unit/session.test.mjs` 扩展；E2E-4/5/7/19 真实旅程 |
| D-02 | Worker 初始化/帧故障的所有出口恰好结算一次（error/messageerror/close/postMessage 失败/超时）；主线程看门狗，不依赖卡死 Worker 自身通知 | 外审 A-03/B-S03（IF-004/005/006、C-03/06/09）；Worker 内 timer 无法解救卡死的 Worker 线程 | `decoder-client.js`、`contracts.js`（`initTimeoutMs`/`frameTimeoutMs`） | `558dee9`；`tests/unit/client.test.mjs`（8 例）；TD-01 已关闭 |
| D-03 | 取消/拒绝时关闭已 ready 客户端；清理收敛前不覆盖资源引用；晚返回客户端由旧 cleanup token 终止 | 外审 C-02（M02/M03/M06、AC-006/007、UAT-L04） | `session.js` | `558dee9`；E2E-4 真实取消/重启旅程 |
| D-04 | 录像 seek 提供错误/超时出口的有界收敛；EOF 判定前有限补采最终可用帧（至多一次），Ready 优先 | 外审 B-S04（AC-008/014、IF-007、T3.1.b/E2E-16） | `video-source.js`、`app.js` | `b16004a`；`tests/unit/video.test.mjs`；E2E-16 真实 V-SHORT/V-LAST 对照 |
| D-05 | 证据门禁改为验证工作而非记录形状：每个必需场景须真 PASS、scope/executor 交叉校验、从盘上文件重算哈希、measurement 须冻结阈值；FAIL/NOT_RUN/错 scope/mock 一律非零 | 外审 A-04/B-S01（AC-004/005/010/011/012、C-12） | `verify-evidence.py`、`evidence.js`、`evidence.test.mjs` | `95c54b6`；`verify-evidence-selftest.py` 负例自测；2026-10-21 实跑 local PASS / field FAIL |
| D-06 | 启动器逐参数保真（`ArgumentList` 数组不再被连接成未引用命令行）并确认子进程真实监听，失败返回非零、报因可读 | 外审 C-01（T5.1.a、AC-003/010/013、UAT-L01/E2E-1）；隔离复现路径截断、launcher exit 0 而无监听 | `launch.ps1` | `aa31eed`；`proof/E2E-1/launch-log.txt`；E2E-2 占用端口 exit 3 |
| D-07 | 录像导入由 1/15 s 时间步进改为 `requestVideoFrameCallback` 逐帧解码（TD-15） | 批次 L 实测：512 KiB 随机载荷 30 s 真实录像在 480 s 导入窗口内仍 Incomplete（MediaRecorder 长 GOP 使多数采样帧无法像素级解码） | `video-source.js`、录像导入容量 | `eb80706`；`tests/unit/video.test.mjs`；TD-15 行 |
| D-08 | E2E-16 载荷口径再录制：发现原"512k"夹具标签失实（实为 4 MiB），超出录制装置投递上限；以 128 KiB 难压缩载荷重录 V-SHORT/V-LAST 对照对完成 E2E-16，并在记录中如实注明 | 批次 L 录制装置实测；results.json E2E-16 notes | E2E-16 证据口径；TD-15 大载荷回归项保持登记 | `bb878ab`；`results.json` E2E-16；`proof/E2E-16/` |
| D-09 | E2E-12 采用"拒绝-改名"保存测试设计，并发现保存覆盖确认框为 DirectUI 任务对话框：是/否按钮为 Button 类子控件（控件 id 0、CtrlNotifySink 宿主），对 `GetDlgItem` 与 UIA 不可见；助手按窗口文本定位并 `BM_CLICK`，Alt+Y/N 助记为键盘兜底 | 批次 L 实测；此前 E2E-12"卡在 Saving…"的真实原因 | `run-e2e.mjs` 对话框助手 | `543e59e`、`073feae`；`batch-l-status.md` 环境注记；`results.json` E2E-12 |
| D-10 | E2E-13 采用不抛异常的诚实判定：断言 picker 打开时保存按钮禁用（防重复保存）+ 单次真实保存成功，任一不满足如实记 FAIL | UAT-L13/E2E-13（AC-003/007/009） | `run-e2e.mjs` | `073feae`、`435d517`；`results.json` E2E-13 |
| D-11 | E2E-6 偏差如实登记：本机 Edge 的共享指示条（sharing chip）未暴露给 UIA，"点击共享指示条"不可自动化；改为验证外部结束（标签页/窗口关闭）→ Incomplete 收敛、无幻影产物、新会话 B 哈希正确 | E2E-6 字面步骤在本机不可自动化（主机实测） | 证据口径 | `results.json` E2E-6 notes；`proof/E2E-6/` |
| D-12 | E2E-8 产品发现处置：4C 发送端无假 Ready 属正确行为；页面内翻回 B 后 180 s 帧饥饿（两次独立运行）无法恢复可解码流，恢复方式=重载发送端页面；判定协议范围外，登记 TD-16，不改支持矩阵声明 | E2E-8 实测（两次独立复现） | `README.md` Notes、TD-16 | `8c59864`；`proof/E2E-8/`；TD-16 行 |
| D-13 | E2E-1 首跑归因撤回：真实根因是测试链上 Node 22.23.1 `fs.cpSync`（无 `filter` 时走 C++ 快路径）在 ACP/OEM 936 主机把非 ASCII 目标写成 GBK 乱码孪生目录、意图目录为空且不报错，而非"pwsh 7 CJK+空格平台缺陷"；`8c59864` 历史提交保留不改写，更正落 `batch-l-status.md`、README、`launch.cmd` 注释与 TD-17 | 用户以 32 种调用方式 + 真实包从 CJK+空格目录成功启动的反例推翻原归因；隔离复现 | `run-e2e.mjs`（逐项 `mkdirSync`+`copyFileSync`）、TD-17 | `247b68c`；`proof/E2E-1/`（first-run-fail、encoding-repro、launch-log） |
| D-14 | 新增 `launch.cmd` 启动入口（cd 到包目录后转发 `launch.ps1`），使 cmd/双击场景与手册口径一致；E2E-1 采用"README 文档化 `launch.cmd` + `pwsh -File` 绝对路径预检"双口径验证 | E2E-1/UAT-L01 要求照手册从任意 cwd 启动 | `web/desktop-recv/launch.cmd` | `8c59864`；`proof/E2E-1/launch-log.txt` |
| D-15 | TD-01 关闭：实现主线程 init/frame 双看门狗（`contracts.js` 提供 `initTimeoutMs`/`frameTimeoutMs` 预算，`decoder-client.js` 在主线程计时），即使 Worker 线程完全失去响应也能结算并进入可恢复终态 | 内审 W3 登记 + 外审 A-03；录像功能当前即依赖 `submitAndWait`，非"仅未来现场"问题 | `contracts.js`、`decoder-client.js` | `558dee9`；TD-01 行（2026-10-21 关闭）；`client.test.mjs` 8 例 |
| D-16 | TD-12 关闭口径：批次 L 由执行方（executor）完成真实往返——真实发送窗口、真实系统保存对话框、外部 `Get-FileHash` 相等且门禁从盘上文件重算；用户现场旅程 E2E-21..26 保持独立 NOT_RUN，不因本地补跑而变绿 | 内审 round 3 B-1 登记 + round 6 硬门禁；外审 A-01 要求实施方完成适用本地旅程 | 证据口径与阶段状态 | 批次 L（`16e2fa6..247b68c`）；`results.json`；`batch-l-status.md`；本地门禁 PASS |
| D-17 | E2E harness 决策：接收端须为正常启动并经 CDP 附加的 Edge（Playwright 启动的 Edge 在本机无法发起跨窗口抓屏，NotReadableError）；每次原生对话框前唤醒窗口（AttachThreadInput + 一次真实点击）；对话框以 Win32/UIA 驱动，写盘真实 | 批次 L 环境实测 | `run-e2e.mjs` | `batch-l-status.md` 环境注记；`proof/*` 逐旅程日志与截图 |
| D-18 | 状态语义：`test_status=passed` 仅指本地范围（20/20 本地旅程 + 本地门禁），field 保持 FAIL/NOT_RUN；`external-review.status` 保持 `failed` 直到 round 2 实际提交 | E2E 计划"本地/现场分列、不得代填"门禁定义 | `pipeline-state.json` | 本批次 M 更新 |

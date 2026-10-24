# 接收器体验 v2 — 真实操作验收运行手册

2026-10-24 · 阶段4.7规划，执行归Claude阶段5及用户FIELD。当前没有本轮产品运行记录。

## 执行次序与入口

1. 读[实施计划](../../plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md)的36任务/35 Waves，先T1～T5实现隔离上下文和新旧证据双门禁，再T6锁定基线/真实输入。不能直接运行带旧run-03默认值的现有runner。
2. T13执行E2E-27的切片，T19执行8组IAT及指标检查，T25执行E2E-30～34，T31执行E2E-35～38。切片是阶段性验证，不代表最终候选全通过。
3. T34冻结最终候选产品manifest，T35在新final上下文逐条执行E2E-1～20及27～38；T36核对32项本地门禁、UT/IAT及证据。产品字节变化后重跑受影响项；跨构建不得直接复制PASS。
4. FIELD由用户在真实云桌面执行E2E-21～26及39，用户回传实际操作和文件证据后才能记录。阶段8从最终交付包另建目录复核入口/双输入双类/保存重试/中文键盘和焦点；不让阶段5等阶段8先执行。

## 装置与运行隔离

- 正常启动Edge再CDP附加，使用实际屏幕选择、文件选择和保存窗口；Windows桌面、端口、剪贴板、对话框独占串行。自动化无法操纵时人工继续并记真实执行者，不能跳过动作后标PASS。
- 基线与候选分别独立stagingRoot/runRoot/fixtureRoot/端口；仅允许当前run根内证据相对路径。禁止写旧run-03、旧staging或旧结果；历史材料只读，输入副本也要登记原SHA和本轮SHA。
- RunContext沿用实施计划配方A的全部字段；`planningFile`指向本轮[planning-cases.json](planning-cases.json)，`methodFile`指向[冻结性能方法](../../plans/receiver-ux-v2/performance-method.json)。逐次保留runId、attemptId、sourceRevision、harnessRevision、产品及输入manifest摘要。
- 保存原始环境：Windows/Edge/辅助技术版本、语言、显示器分辨率/DPR、OS DPI、浏览器zoom、CSS viewport、窗口位置/遮挡、录制/导入上界。CSS缩放不是OS DPI；源窗口关闭不是系统“停止共享”，各分支分别留证。
- 操作前记录产物/代码摘要及原文件SHA，操作后重新读取磁盘输出并外部SHA-256。失败attempt不可覆盖，重跑新attempt；每腿executedInAttempt可追溯。最终候选引用同构建先前实测时须保留原attempt/source/环境/input证明并由验证器核准；默认T35全量新跑，不能摘取旧run的PASS。

## T6样本和场景校准

| 样本 | 目的 | 必须锁定的实际材料 |
|---|---|---|
| A/B不同原文件 | 停止/切换防串、双入口往返 | 原文件/编码配置/自然码尺寸/外部SHA，A≠B |
| 真实128KiB难压缩主录像 | 性能5对A/B、普通反馈 | 现有seed 20261018生成1MiB随机输入前128KiB；实际输入/媒体SHA，≥30个结算帧 |
| 长难压缩实时输入 | 15秒正常推进、5对30秒Receiving | T6在基线校准1/4MiB等足够长样本；A/B实测锁同SHA/参数。与主录像分开，不替换冻结method |
| V-GOOD | 正常录像导入/无后台抓屏 | 原发送端真实录制、media SHA/参数/时长、原payload SHA |
| V-EOF不足/完整尾段对 | 严格EOF、末帧且可恢复 | 同一次getDisplayMedia流的双MediaRecorder/前缀一致性、最后关键帧真实画面，分别媒体SHA |
| 异常录像各类 | 每类独立拒绝和恢复 | 原定义E2E-15清单逐类，不以一个坏文件代全类 |
| 大样本矩阵 | 原E2E-18容量/预算/恢复 | [十腿矩阵](cases/e2e18-matrix.json)，9条实测PASS+1条唯一合法例外依据 |
| 长中文文件名 | 布局/可读/保存 | ≥80字符的真实产物名称、当前OS可用完整路径及SHA；不能只改DOM |

校准只用于确保能观察目标状态：若小样本瞬间Ready，改用预登记更长样本并记录；不能暂停接收器内部处理来“造”中间状态。阶段5执行时填写真实SHA和边界，当前未生成新输入/媒体。录像腿超预登记上界，保留最后状态和时序再判FAIL/NOT_RUN原因；不据此擅自缩减必测范围。

### SRC-01：等待/重复有效码/恢复的真实视觉装置

当前原发送端`web/send.js`的暂停是短暂冷却（`_pause=15`），不能稳定保持8秒。因此阶段5可在**原发送端独立源窗口**增加测试用视觉控制层；不修改发送端编码算法，不增加面向用户的产品按钮，不作为产品交付依赖。

1. 用原发送端Mode B加载锁定真实输入，在自然尺寸/DPR截取一张真实有效码PNG，记录payload/PNG SHA、窗口位置/码尺寸/profile及抓取时间。该输入应不能一帧即完成。
2. 在同一源窗口用不透明测试层显示这张原码；接收器通过真实getDisplayMedia抓实际像素。先校准确实产生data且尚未Ready，再保持≥10秒观察重复有效数据、速率及8秒无进展提示。若实际只有no_data，不能算重复data场景通过。
3. 在同一源窗口用完全覆盖码区域的空白层形成真实无有效码，至少6秒；以最后真实data时点为锚核对速率≤3秒归零和5秒提示（前台取证各允许1秒采样误差）。最小化可能冻结有效码，不能当空白。
4. 移除视觉层恢复原发送端实际码流，在同一接收会话完成重建、真实系统保存及外部SHA；清理测试层/窗口/截图引用。静止码导致8秒no_progress与15秒“正常推进数字更新”使用不同段落，不混用。

未来可实现`tools/desktop-recv/e2e/source-scene.mjs`控制此装置（T13/T35的验收脚本责任）。必须只操纵源窗口视觉内容；禁止注入接收帧、ArrayBuffer、Worker消息、report或模拟产物。此模块当前尚不存在，规划通过不代表装置实测成功；若无法校准，场景保持NOT_RUN并修复装置后再验。

## 逐步取证和状态判断

以[39条逐步计划](e2e-user-journey-plan.md)为准。实际结果每个`E2E-n-Sxx`写expected、observed、result、proofRef，proof落`proof/<caseId>/<attemptId>/`；各分支也分独立断言。截图须能定位操作前后/状态时间，不能只一张最终成功图。

- 已取图/扫描中不等于收到有效数据。近期KiB/s是含冗余的编码数据识别速率；重复码可有速率却无重建推进。无可信report时诚实不可用；多流/回退等无法自然触发的分支由UT/IAT验证，不把mock界面算E2E。
- 前台用时独立前进，即使业务revision不变；正常短帧不闪“处理中”，真实pending≥1500ms才可提示。后台限频单列，返回按当前时点纠正。250ms共享写入节流约束仅针对遥测投影，业务按钮/终态立即响应，不能用平均4Hz掩盖突发或多个tick。
- 录像位置/时长与重建估计分别可见；100%媒体位置不等于文件完成。活动preview保持实际呈现、真实媒体帧推进，不能hidden/display:none后宣称录像体验通过。
- Ready须有真实严格重建产物，仅表示可保存。点击保存立即进入选择路径状态，系统picker保持≥3秒验证真实等待；取消后产物仍在，可重试。Saved只能来自实际write+close成功，接收用时从Ready冻结，不能计入选择/写盘时间。
- 所有实际保存分别取保存后的同attempt四时点：saveRequestAt、createWritableAccessedAt、writableAt、writeCloseAt。有限且有序；writeCloseAt前不能读“最终保存耗时”。未保存/取消或未获writable时，相应字段null/不适用，不填假0。
- E2E-34只操作本轮专用目标：创建哨兵文件并由辅助进程用FileShare.None持锁，真实picker选它，记录系统拒绝/取消或实际写入错误。不得改用户ACL/全盘权限或碰已有文件。系统若阻止选择，只证明系统受阻及取消恢复，不能宣称App捕获了write/close异常；这些异常必须UX-IAT-06补验。清理自己的锁后重新保存/核SHA。没构造成功则不能用mock补PASS。
- E2E-15坏文件真实原生选择器逐类至少操作一次（可选“所有文件”或输入完整路径），证明该输入实际被应用处理，再逐类正常恢复/保存/hash；DataTransfer只是IMPORT-PATH-ONLY。正常自动导入允许浏览器级setInputFiles作为等价文件选择，另有真实OS窗口路径证明。
- 严格EOF/最后有效帧：不足和完整尾段对必须真实媒体/前缀/关键帧可追踪；T*=lastUs/1e6，不虚构frameId；裁掉元数据造成打不开不是EOF重建不足。

## 中文、键盘、辅助技术和性能

E2E-36逐一核1280×800、768×700、380×720（100%）及1280×800（200%浏览器zoom），记录实际CSS viewport/DPR，不拿外窗尺寸代替。长中文文件名、两个输入按钮、主状态/下一步/单位均可读；按44 CSS px目标检查点击区，主要操作可见/滚动可达、无横向页面滚动，实际预览继续取帧。

E2E-37使用Windows Narrator或真实可用屏幕阅读器，记录工具版本/语音/按键和实际播报。正常Receiving且report推进≥15秒核数字变化不抢播，主状态切换能播报，系统选择器/保存取消后焦点回可操作项。缺辅助技术环境NOT_RUN，axe/ARIA属性/原型不是替代。

E2E-38严格遵守[冻结方法](../../plans/receiver-ux-v2/performance-method.json)：每构建各1次warmup、5对AB/BA/AB/BA/AB，每次新页面/Worker，同机器/输入/媒体/WASM/observer，≥30结算帧。三项指标重新计算：Ready中位C≤B×1.10+250ms；frame RTT p50中位C≤max(B×1.10,B+2ms)，p95≤max(B×1.15,B+5ms)。RTT含端到端调度，不声称纯WASM CPU。

另做5对实时抓屏，T6锁定长样本，双方同输入SHA且每侧同一Receiving≥30秒。A为旧UI，只核旧业务single-flight/结算/输入；B另外核中文状态、独立timer、共享4Hz及反馈。128KiB主录像不替代30秒长样本。longtask不支持记NOT_MEASURED，不写0；实际业务失败为FAIL，不归噪声。仅事先定义的无效对可整对替换≤2次，保留全部原始值；禁止挑最好结果。

## 未来命令和结果双出口

以下是**阶段5先实现、校验help/拒绝路径后才能运行的命令契约**，当前工具不保证已支持，不能本阶段复制执行产品验收。变量均取已校验context，不给旧run默认值。

```powershell
node tools/desktop-recv/e2e/run-e2e.mjs --context $candidateContext --case E2E-27
node tools/desktop-recv/e2e/run-e2e.mjs --context $candidateContext --case UX-ALL
node tools/desktop-recv/e2e/measure-ux.mjs --context $candidateContext --baseline-context $baselineContext --method docs/plans/receiver-ux-v2/performance-method.json
python tools/desktop-recv/verify-ux-evidence.py --context $candidateContext --gate local
python tools/desktop-recv/verify-ux-evidence.py --context $fieldContext --gate field
```

分组UX-SLICE/UX-MEDIA-SAVE/UX-UI/UX-ALL必须展开机器计划具体ID；UX-IAT为8组集成，不写成E2E记录。未知ID/未实现handler应非0，禁止空handler记PASS。当前仅规划的[e2e-skeletons/real-journeys.mjs](e2e-skeletons/real-journeys.mjs)误运行将主动失败。

原`results.json`保持Evidence v1的E2E-1～26/AC-001～014。新增`ux-results.json`字段沿用实施计划配方A，不塞进旧schema：version、iterationId、runId、productManifestSha256、records；每条含caseId、attemptId、scope、caseType、result、executedBy、acceptanceIds、同产品摘要、起止时点、proofRefs、assertions、原/收SHA、notes。新file_roundtrip的前两proofRefs须为实际原/收文件，其他有保存动作的场景同样附实物哈希及保存后时点。

汇总器读取本轮计划显式local/field必测清单，同时运行旧verify-evidence；不能只靠旧数字范围1～20而遗漏新27～38。重复/多余ID、漏项、错范围/执行者、缺断言/媒体/文件、时间非有限或逆序、manifest不符均拒绝。NOT_RUN无伪造执行人/时点/SHA，说明原因；实际执行后违反预期为FAIL。E2E-18每腿原始证明分别核对，唯一例外按D-19重核代码依据。

## FIELD、发布包与最终裁决

用户在真实云桌面按E2E-21～26及39执行，保留本轮云桌面/宿主机/远程软件配置、双路径动作、状态时序和真实原/收文件外部SHA。本地不能代表云桌面；历史“用户已传成功”仅背景，不能替代新版本体验现场验收。E2E-26沿原现场性能阈值决策：未确认阈值则未评定；新冻结UX开销方法不能替旧现场阈值签字。

阶段8对最终包另立attempt，按机器计划finalPackageRecheck核中文空格目录/非仓库cwd/说明、双输入×两类数据、保存取消重试、中文键盘和焦点。对照产品资产摘要：仅包装变动重验受影响入口；产品代码/WASM资产变动重新评估并重跑受影响验收。候选通过、包可启动、用户现场通过分别报告，全部证明满足后才给对应结论。

执行故障处理顺序：保留失败原证→判产品/装置/环境并给当前代码及操作依据→整改→新attempt复验→重算双门禁。禁止先改预期/削减范围来消红灯；确有范围调整须正式决策后更新计划。现场材料仅用户授权后采集，不上传文件给无关服务。

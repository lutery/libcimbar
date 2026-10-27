# 接收器体验 v2 — 集成与真实验收定义

8组集成、10组验收义务均为NOT_RUN。本文件是阶段4.5输入定义，不是4.7逐步骤E2E计划，也不是已执行证据。

机器源：[集成](cases/integration.json)、[验收义务](cases/acceptance.json)。所有执行者初值null；local/field/注入分列。由[catalog.py](catalog.py)生成。

## 集成定义

### UX-IAT-01 — 真实WASM帧结果与可选报告旁路

Trace: T8, T16, T19, T34；AC-015, AC-016, AC-023；R-03, R-05, R-06。

执行模式：`real_wasm_with_explicit_fault_adapter`；scope=`unit_integration`，初始NOT_RUN。

前置：

- 最终候选实际vendor及strict-EOF资产校验成功
- 原生帧fixture可实际解码；报告缺失/坏长度用局部适配器明确注入

组合操作：

1. 经实际DecoderClient/Worker提交原生cimbar图像帧，记录原outcome/bytes/artifact
2. 对同一输入分别有有效report、缺导出、读取抛错/截断/坏文本；还原注入
3. 核对报告在fountain后artifact构造前，原错误/产物/预算结果不被UX改写

判据：

- 真实正例收到合法可选观测
- 注入只改变UX诊断/百分比可用性，原frame结论相同
- no_data/error不读共享report缓冲，close释放新缓冲

必要证据：资产摘要、真实输入SHA、实际响应和诊断时序；注入位置/恢复记录、命令退出码

### UX-IAT-02 — Client/Session/Scheduler的所有权与生命周期组合

Trace: T8, T10, T16, T22, T34；AC-015, AC-018, AC-021, AC-023；R-01, R-02, R-07, R-08。

执行模式：`actual_modules_fake_sources_and_clock`；scope=`unit_integration`，初始NOT_RUN。

前置：

- 实际Client/Session/Scheduler模块，注入受控Worker/source与主单调时钟
- 原初始化/帧看门狗及Promise真实结算路径启用

组合操作：

1. 进入Receiving，提交一帧并检查post前原pending元数据
2. 人工重复同一frame、旧seq、关闭/超时后迟到响应，再新seq启动
3. 从实际pending上下文投影短/慢inFlight并使旧ticker迟到

判据：

- 同帧仅一次观测；旧结果不抬字节/revision/时点
- 原Scheduler保证single-flight，Client Map不被额外强制改为不同并发API
- finish/close/timeout清理元数据与UX显示所有权，原业务错误继续

必要证据：实际模块事件链/状态/待处理数断言；R-01/02/07/08对应测试ID与输出

### UX-IAT-03 — 数据→窗口/报告→视图的精确组合

Trace: T15, T16, T19, T34；AC-015, AC-016, AC-017, AC-018；R-03, R-04, R-05, R-06, R-08, R-10。

执行模式：`actual_models_deterministic_clock`；scope=`unit_integration`，初始NOT_RUN。

前置：

- 真实ReceiverTelemetry/readView模块
- 独立预期常量而非实现函数生成expected

组合操作：

1. 按0/249.9/250/2999.9/3000/3250ms输入有效字节与重复/增长比例
2. 组合无data、坏报告、多流后回single、溢出重新预热和同revision时间前进
3. 保持原artifact不存在直到真实业务提供，查询不同Context

判据：

- 实际跨度分母/桶淘汰独立算例符合契约
- 重复不虚增、多流/回退锁定、坏report仍可识别速率
- >=1或媒体结束不造Ready；时长前进而业务revision和播报key稳定

必要证据：输入时序、独立数学期望、实际ViewSnapshot及原业务快照前后对比

### UX-IAT-04 — 显示调度接线、真实DOM与退化保护

Trace: T9, T10, T19, T27, T34；AC-018, AC-021, AC-022, AC-023；R-02, R-08, R-10, R-11。

执行模式：`browser_component_harness_explicit_injection`；scope=`unit_integration`，初始NOT_RUN。

前置：

- 正常浏览器加载最终实际模块/DOM
- 源/报告只在组件IAT中可受控，不能当真实捕获E2E

组合操作：

1. 高频原snapshot事件与250ms显示tick交错；无事件继续计时
2. 业务Ready/Stop/controls即时变化，数字按共同节流更新
3. 强制UX paint一次抛错、隐藏/恢复页面、旧seq tick和pagehide

判据：

- tick不调用app旧render/发帧/选择器/EOF操作
- 数值刷新批次≤4Hz，按钮/真实终态即时；无重复数字播报
- 绘制失败只回退UX，停止/销毁无多余显示timer，新seq拒旧tick
- 观测/投影/显示操作不产生新增远程fetch/XHR/beacon/socket；原同源资源加载单列允许，不误判为遥测上传。

必要证据：浏览器实际DOM变化与paint调用/时间；原业务副作用计数、timer/owner释放断言；注入标签

### UX-IAT-05 — 原VideoSource/Worker与独立媒体位置

Trace: T21, T22, T25, T34；AC-019, AC-021, AC-024；R-02, R-06, R-08。

执行模式：`real_recording_browser_integration`；scope=`unit_integration`，初始NOT_RUN。

前置：

- 原发送端录制的有效/不足录像及payload SHA，当前已批准前缀/最后帧配方
- 实际VideoSource、rVFC、Session/Worker与可呈现preview

组合操作：

1. 顺序导入正常/不足/完整末帧录像并观察实际媒体时点
2. 验证active preview的布局/呈现而非只查元素存在
3. 执行停止/切换；元数据坏值分支明确用IAT适配器

判据：

- 媒体位置与文件估计不混用；未知duration不阻断处理
- EOF无artifact按原屏障Incomplete；真实最后采样/严格EOF不放松
- 活动录像持续前进，终结/切换清理URL/source/观测

必要证据：输入/媒体/payload SHA与实际读取/EOF/产物时序；前缀/末帧检查材料，注入分支单列

### UX-IAT-06 — 实际SaveController事件到UX保存阶段

Trace: T21, T22, T25, T34；AC-020, AC-021, AC-022；R-06, R-09, R-10。

执行模式：`actual_controller_injected_picker_writable`；scope=`unit_integration`，初始NOT_RUN。

前置：

- 真实不可变artifact与真实SaveController/Session/UX模块
- 可控picker/write/close Promise与真实attempt事件；这是IAT注入不是OS证明

组合操作：

1. 点击路径同步调用start，首个selecting绑定点击owner与真实attempt
2. 注入取消、write失败、close失败、pending、busy提示与迟到旧attempt
3. 再次真实start新attempt，并让write和close依序完成

判据：

- 16002取消/16008仍写入/pending等待映射正确，文件保留可重试
- 回调不读取当前owner冒领旧保存，终结attempt不倒退
- 仅真实write+close成功进入Saved；Receiving用时不计保存等待

必要证据：原事件/attempt/owner与View/业务状态对应表；注入位置、每步结算和残留资源检查

### UX-IAT-07 — 旧v1门禁与新增UX汇总CLI的真实磁盘链路

Trace: T1, T2, T3, T5, T36；AC-020, AC-021, AC-023, AC-024；R-12。

执行模式：`actual_cli_temp_disk_fixtures`；scope=`unit_integration`，初始NOT_RUN。

前置：

- 临时隔离根内创建实际小原/收文件与合成记录，明确仅门禁测试数据
- 本轮冻结清单与manifest样本；旧v1 schema原字节

组合操作：

1. 运行完整正例及缺UX/错scope/错构建/假哈希/路径逃逸/缺assertion等反例
2. 让旧20项为绿而删除每一新必测，确认汇总失败
3. 检查局部阶段/UX方法不能当final/旧field26，删除临时自有数据前只核临时根

判据：

- 正例0且每个指定反例非0，旧验证器真实被调用
- 磁盘SHA、caseType/执行者/原件/manifest均核对，原run未写
- 合成正例即使门禁0也只记unit_integration，不能装入真实results

必要证据：完整CLI stdout/stderr/exit、临时目录结构与摘要；每个反例命中实际拒绝原因

### UX-IAT-08 — 同一开发观测器与实际浏览器模块的测量链路

Trace: T28, T30, T31, T34；AC-023, AC-024；R-07, R-10, R-11。

执行模式：`actual_observer_browser_pipeline`；scope=`unit_integration`，初始NOT_RUN。

前置：

- 开发观测器已实现，真实baseline/candidate或受控浏览器模块用于接线检查
- 冻结method摘要、原Promise包装与restore路径

组合操作：

1. 真实执行一轮观测预检，核对提交/结算标记、原Promise身份与DOM统计域
2. 对已知原始时序端到端计算分位数/配对/阈值输出
3. 中断/结束后确认包装器恢复、工具不进入用户包

判据：

- 观测工具不改IO/并发/业务结果，输出可复算原始样本
- 预检不足5对不能宣称正式A/B通过
- 数值主判据录像/实时行为/可选longtask分列

必要证据：观测器SHA与实际调用时序/restore证明；独立算例的raw/comparison输出，正式A/B留UX-AT-08

## 真实操作与交付验收义务

以下UX-AT编号只表示验收分组；e2eCaseIds=null，4.7再冻结具体E2E编号/步骤和机器计划。旧E2E-1～20全量本地及21～26现场保持，新增UX编号从27起。

### UX-AT-01 — 实时等待到数据识别再到实际保存

Trace: T13, T35, T36；AC-015, AC-018, AC-020, AC-022, AC-024；R-12。

计划scope=`local_simulated`，caseType=`file_roundtrip`，执行角色=`executor`；尚未实际执行。

必要条件：

- 原发送端、正常浏览器、真实getDisplayMedia和系统保存
- 足够长样本以看到等待/数据/用时，原/收实物外部SHA一致

成功应有的实际事实：

- 有图无有效码明确等待；开始data才表示接收
- Ready只随真实artifact，Saved只在write+close后
- 闭环的UI时序和实存文件均能定位

边界：小文件瞬时完成不能证明中间态；具体E2E编号/操作步骤由4.7冻结

### UX-AT-02 — 重复有效数据、无有效数据暂停及恢复

Trace: T19, T31, T35；AC-015, AC-016, AC-017, AC-018, AC-024；R-03, R-04, R-07, R-10, R-12。

计划scope=`local_simulated`，caseType=`file_roundtrip`，执行角色=`executor`；尚未实际执行。

必要条件：

- 真实有效静止码与明确无有效码两段，来源可控
- 同一真实会话恢复发送并最终实际保存

成功应有的实际事实：

- 重复data可能有识别速率但估计不虚增
- 无新data速率按窗口归零/5秒提示/恢复，时长继续
- 提示不自动停止重启，完整文件外部SHA相等

边界：最小化可能冻结重复码，不未经data观察认定无数据；不能虚构慢帧源

### UX-AT-03 — 录像位置与文件重建独立

Trace: T25, T35；AC-016, AC-017, AC-019, AC-020, AC-022, AC-024；R-06, R-12。

计划scope=`local_simulated`，caseType=`file_roundtrip`，执行角色=`executor`；尚未实际执行。

必要条件：

- 原发送端真实录制、原文件/媒体SHA
- 实际file input，至少一次真实OS选文件操作

成功应有的实际事实：

- 媒体读取位置和重建估计分开标注
- preview实际呈现并持续读取，真实产物Ready后再保存
- 录像可能提前完成但不能仅位置100%假报；实存SHA一致

边界：setInputFiles作为浏览器级选择自动化可以用；DataTransfer假change不是用户入口

### UX-AT-04 — 录像不足、末帧与原严格EOF

Trace: T25, T35；AC-019, AC-020, AC-021, AC-024；R-06, R-12。

计划scope=`local_simulated`，caseType=`negative_or_lifecycle`，执行角色=`executor`；尚未实际执行。

必要条件：

- 当前已批准V-LAST pair/不足录像构造和前缀证据
- 原E2E-16/18体量/末帧及合法例外义务保持

成功应有的实际事实：

- 到尾无artifact显示Incomplete且保存不可用
- 有末尾有效数据仍按真实EOF屏障和最后采样重建
- 不因新UI隐藏preview使rVFC停转

边界：不得删除原必测腿或以历史对话选项替代当前批准矩阵

### UX-AT-05 — 真实保存取消、可构造失败与重试

Trace: T25, T31, T35；AC-020, AC-021, AC-022, AC-024；R-09, R-12。

计划scope=`local_simulated`，caseType=`file_roundtrip`，执行角色=`executor`；尚未实际执行。

必要条件：

- 真实Ready及系统保存对话框，实际取消/重新点击
- 真实可构造的系统失败与注入IO明确分列

成功应有的实际事实：

- 取消保留artifact且主界面指明可重试
- 真实写盘/close完成前不Saved，重试无需重接收
- 系统返回焦点可继续操作，最终外部SHA相等

边界：write/close失败仅能安全注入时由IAT-06证明该分支，不能冒称OS分支通过

### UX-AT-06 — 停止、重开和双入口切换

Trace: T13, T25, T35；AC-018, AC-021, AC-022, AC-024；R-01, R-02, R-09, R-10, R-12。

计划scope=`local_simulated`，caseType=`negative_or_lifecycle`，执行角色=`executor`；尚未实际执行。

必要条件：

- 接收中真实停止；清理后从另一输入入口重开
- 实际源/Worker/URL/timer清理观察

成功应有的实际事实：

- 新seq的时间/速率/进度不继承旧数值
- 互锁与原cleanup门保持，不忙时重开/丢旧回调
- 无新接收timer残留、正常下一次可接收

边界：晚消息/坏owner极端情况用IAT-02/06补，真实切换仍执行

### UX-AT-07 — 中文主路径、窗口、键盘与辅助技术

Trace: T31, T35；AC-018, AC-019, AC-020, AC-022, AC-024；R-10, R-11, R-12。

计划scope=`local_simulated`，caseType=`negative_or_lifecycle`，执行角色=`executor`；尚未实际执行。

必要条件：

- 真实页面、380/768/1280视口及200%缩放、长中文名
- 真实Tab/Enter/焦点和Narrator或可用屏幕阅读器

成功应有的实际事实：

- 两个入口保留，主状态/下一步无需英文日志可理解
- 主要按钮不遮挡/键盘可达，取消对话框后焦点合理
- 数字持续变不重复主语义朗读，active preview可呈现

边界：原型/jsdom/DOM存在性不能代替本组真实操作；环境缺失NOT_RUN

### UX-AT-08 — 预注册同输入A/B与实时体验约束

Trace: T6, T28, T31, T35, T36；AC-023, AC-024；R-07, R-08, R-10, R-11, R-12。

计划scope=`local_simulated`，caseType=`measurement`，执行角色=`executor`；尚未实际执行。

必要条件：

- 冻结performance-method与T6输入/录像SHA
- 两构建各预热1轮后5对同录像、5对30秒实时行为

成功应有的实际事实：

- Ready/RTT按固定阈值复算通过，所有原始样本/失败保留
- single-flight/数字节流/有界资源/终结UX timer等不变式成立
- 真实实时采样与录像主数值、可选longtask明确分列

边界：method.frozen只表示方法；少配对/少样本不能PASS，不能用它代旧field26阈值

### UX-AT-09 — 最终新构建旧全矩阵及新UX总出口

Trace: T34, T35, T36；AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-024；R-12。

计划scope=`local_simulated`，caseType=`negative_or_lifecycle`，执行角色=`executor`；尚未实际执行。

必要条件：

- 同一最终产品清单，旧E2E-1～20全量和全部新UX必测
- 完整caseType/scope/执行者/实物/哈希/attempt与断言

成功应有的实际事实：

- 旧门禁及新汇总均实际通过，遗漏UX例不能绿
- 改产品后受影响项重跑且绑定最终manifest
- 真实录像/大样本/预算/启动/中文空格路径义务无静默删减

边界：后续外审/包验/用户现场分开；包装仅字节不变时复用相应证据并补表面检查

### UX-AT-10 — 用户真实云桌面体验及原现场矩阵

Trace: T36；AC-015, AC-016, AC-017, AC-018, AC-019, AC-020, AC-022, AC-024；R-12。

计划scope=`real_cloud`，caseType=`file_roundtrip`，执行角色=`user`；尚未实际执行。

必要条件：

- 阶段8最终包可用，用户实际云桌面→宿主机
- 适用原E2E-21～26和新增体验场景由4.7冻结

成功应有的实际事实：

- 用户能判断等待/接收/停顿恢复/完成与保存
- 实际原/收文件SHA和现场步骤/环境记录
- 未执行就NOT_RUN，不用既有成功口述代填全部

边界：这是路线图T4.2.d后续用户职责；T36只准备材料和核验真实状态，不执行/代填现场

## 共同门禁

旧v1结果只装旧AC；UX结果分开且新汇总必须覆盖全部必测。实际产品清单/输入/attempt与证明对应，文件外部SHA实算。缺测/错scope/假哈希/部分阶段不能PASS；用户现场尚未执行时独立NOT_RUN，不伪造整体绿灯。最终包入口由阶段8补验。

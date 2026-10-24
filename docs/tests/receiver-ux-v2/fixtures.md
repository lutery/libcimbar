# 测试数据与独立时钟配方

规划数据只用于单元/集成设计，不是实际捕获、产物或运行证据。各case.fixtures可直接写配方文字，以下FX编号供工具用例共用。

## 观测/保存/DOM夹具

- 合法字段从[阶段2.5样例](../../design-catalog/receiver-ux-v2/contracts/examples.json)取对应definition再显式填owner/clock；不能把Blob/Module/DOM塞入JSON。不同seq/id/attempt必须实际不同，未知字段按契约拒绝。
- clock为同一主线程可手动推进的有限非负时钟；timer精确触发并可计活动/释放数量，独立记录回调捕获seq。no_data/error有实际outcome但0字节；data/artifact必须是合法正编码字节，不是RGBA长度。
- Report数组样本包括[]、[0]、[0.2]、重复/增长/回退、多流及>=1；长度1023/1024边界、负/小数/NaN返回、非法UTF8/JSON、超过8项必须明确映射。原真实解码错误不被report样本覆盖。
- 真实pending提交元数据源于post之前；Scheduler和Client职责分开。Client Map不是原单在途策略所有者，不能用测试要求改写其API。原init/frame watchdog不变。
- DOM/paint spy能分开统计业务即时写、数字刷新批次、实际节点写入数和语义区写；同文本不写，持续变化轨迹防止空测。伪DOM/假video/注入picker只证明单元/集成，不能证明像素、实际rVFC、Narrator或OS焦点。
- 保存fixture必须让真实SaveController.start在返回前同步selecting产生真实attempt；write/close Promise可分别控制，取消/失败后检查同一个artifact是否保留。owner在点击时捕获，不在迟到callback读取当前值。

## 工具夹具

| ID | 可重建数据/边界 |
|---|---|
| FX-RUN-TEMP | OS临时新根下baseline/candidate/旧根，每文件实际小字节及SHA；中文+空格、规范化/包含关系/历史输出反例；只清自有临时根 |
| FX-OLD-MANIFEST | 历史目录只读文件清单/摘要；测试写入在临时副本，真实旧run原件从不改写 |
| FX-PRODUCT-MANIFEST | 排序相对路径+实际SHA构成产品manifest，工具提交/产品字节分开；缺模块、错摘要、改一字节的反例 |
| FX-RUNNER-TEMP | 正式runner临时副本，真实最小通过/失败/0test/skip/todo/缺套件；不能调用实际共享目录写测试桩 |
| FX-GATE-DISK | 实际原/收小文件、两份独立结果和逐项证明，所有正/反fixture标unit_integration；元数据假等、越根、缺文件/断言等反例 |
| FX-FROZEN-PLAN | 对应临时fixture的必测旧/新清单和caseType/scope/执行者；不是4.7真实机器计划，不能在真实run复用 |
| FX-PERF-METHOD | 只读[冻结方法](../../plans/receiver-ux-v2/performance-method.json)及SHA；负例复制到临时目录变更，不能就地改判据 |
| FX-PERF-RAW | 已知RTT 1..100、5轮中位数10/20/30/40/50、30帧最小样本与5配对，原始数组不可因快慢筛选；缺/错环境与失败替换反例 |
| FX-DOM-CLOCK | 手动clock/可控timer，A持续Receiving到1000ms测量频率，B独立重置125ms真实终态/保存，分别核对计数 |

## 真实输入与性能配方

旧[run-03复现说明](../runs/20261021-teamexec-03/reproduction.md)是输入构造依据；媒体可能受gitignore排除，干净检出先在本轮新根重建/核验，不能宣称历史录像存在就直接可跑。原E2E-18各腿/体量/压缩性及合法例外继续遵循当前批准矩阵，不能擅自缩减。

T6基线先锁实际输入SHA。性能主样本取新根内seed=20261018生成1MiB难压缩文件的前131072字节另存，经原发送端真实录像并完整可重建、至少30帧，媒体/原文件SHA固定。不能每轮randomBytes重新取不同输入；性能录像独立UX-PERF目录不覆盖原末帧pair。baseline/candidate相同WASM、浏览器/视口/电源/观测器，5对AB/BA/AB/BA/AB；每轮新页/Worker，重置原journey首会话时点。

实际本地数据需足够长观察等待/重复/停顿恢复，瞬间完成小文件不替代中间态证明。无有效数据由实际空白/无有效码构造并观察outcome；最小化可能只冻结有效码，不能等同无data。最终保存原/收文件必须实存并在应用外SHA-256核对。

## 状态与清理

本阶段不生成大样本、不录视频、不创建真实run。不导入生产模块执行任何用例。阶段5工具自测临时目录先核对解析绝对路径在自有临时根，再用单一PowerShell/Python机制清理，不拼接跨shell删除。实际桌面进程只清本轮PID/实例；用户窗口和旧结果不可作为清理对象。

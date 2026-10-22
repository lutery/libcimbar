# TDD测试用例登记

全部为计划，运行状态NOT RUN；54个单元用例、6集成组、26真实操作E2E，共86项/组。测试骨架不等于实际测试实现。

| ID / 目标套件 | Given | When | Then / 失败判据 | AC / Task |
|---|---|---|---|---|
| UT-001 / contracts | 伪装ArrayBuffer的普通对象 | 提交decoder.frame | 返回类型错误且不调用WASM；不满足即FAIL | AC-002, AC-007；T1.2.c |
| UT-002 / contracts | 2×3帧配23/24/25字节 | 校验并提交 | 仅24字节通过；不截断或补零；不满足即FAIL | AC-002, AC-012；T1.2.c |
| UT-003 / contracts | 上限和上限加一/整数乘积溢出 | 分配前校验 | 越界拒绝且不分配；边界内精确匹配；不满足即FAIL | AC-006, AC-012；T1.2.c |
| UT-004 / contracts | 同requestId同内容但不同File对象 | 重复session.start | 相同对象幂等，不同对象返回冲突；不满足即FAIL | AC-007；T1.2.c |
| UT-005 / contracts | Blob长度和artifact.byteLength不同 | 接收产物 | 拒绝错配，不进入Ready；不满足即FAIL | AC-002, AC-004；T1.2.c |
| UT-006 / contracts | 53登记码及未知原生错误 | 生成错误包 | 外层code/name/retryAction一致；未知原因不编造；不满足即FAIL | AC-005, AC-006；T1.2.c |
| UT-007 / session | fake同步调用顺序记录器 | 点击startLiveFromClick | picker调用前没有await Worker；仅一个会话；不满足即FAIL | AC-001, AC-007；T2.2.a |
| UT-008 / session | 相同requestId和参数 | 快速调用两次start | 只有一次picker和Worker；返回同操作；不满足即FAIL | AC-007；T2.2.a |
| UT-009 / session | 停止A后新B及A晚回复 | 派发消息 | B进度/产物不变，A只清理；不满足即FAIL | AC-007；T2.2.a |
| UT-010 / session | A选择器未决时内部stop | 让旧授权返回stream | track立即stop，未收敛前不新开始；不满足即FAIL | AC-006, AC-007；T2.2.a |
| UT-011 / session | 活动picker或写入尚未返回 | stop/read/重复stop | Stopping且cleanupComplete=false，重复停止无副作用；不满足即FAIL | AC-007, AC-009；T2.2.a |
| UT-012 / session | 同名同大小内容不同A/B | 停止后启动B | 计数从零；无A Blob/File引用；eventSeq/身份一致；不满足即FAIL | AC-007；T2.2.a |
| UT-013 / scheduler | 一帧在途，新实时帧 | submit | 不排队/不重发；drop计数+1；不满足即FAIL | AC-001, AC-007；T2.1.b |
| UT-014 / scheduler | 一帧在途，新录像呈现帧 | 等待后续提交 | 媒体暂停/恢复配对，单槽不超过1；不满足即FAIL | AC-008, AC-014；T2.1.b |
| UT-015 / scheduler | 同一frameId超时/停止/回复 | 以所有顺序结算 | 槽位仅释放一次，不变负数；不满足即FAIL | AC-007；T2.1.b |
| UT-016 / scheduler | transfer列表中的真实ArrayBuffer | postMessage后访问策略 | 主线程不再消费原缓冲；Worker返回字节独立；不满足即FAIL | AC-002, AC-007；T2.1.b |
| UT-017 / scheduler | 自然尺寸与CSS显示尺寸不同 | 提取RGBA | 使用自然宽高；预算不够拒绝而非静默缩图；不满足即FAIL | AC-001, AC-012；T2.1.b |
| UT-018 / scheduler | EOF与最终帧回复竞争 | 锁存并排空 | 回复前不判不足；最多一次最终补采，无无限等待；不满足即FAIL | AC-008, AC-014；T2.1.b |
| UT-019 / worker | fake Module重复ready/abort | 初始化 | 仅一个终态响应，失败不继续处理；不满足即FAIL | AC-002, AC-007；T1.2.c |
| UT-020 / worker | 0n/负值/大于32位正ID | 处理fountain返回 | 不混Number/BigInt；正ID截uint32格式化不丢符号；不满足即FAIL | AC-002, AC-013；T1.2.c |
| UT-021 / worker | fake堆在free后被改写 | 取得输出并free | Blob保持原字节；不引用已释放HEAP；不满足即FAIL | AC-002, AC-004；T1.2.c |
| UT-022 / worker | 正输出后负错误或不完整 | 读取解压结果 | 不交付半文件，不用连续两个0自证完整；不满足即FAIL | AC-002, AC-008；T1.2.c |
| UT-023 / worker | 累计产物上限及上限加一 | 追加新块 | 边界可接受；超限拒绝且无截断成功；不满足即FAIL | AC-006, AC-012；T1.2.c |
| UT-024 / worker | 错配资产/缺导出/初始化超时 | init和恢复 | 拒绝坏组合并终止实例，新会话才重试；不满足即FAIL | AC-005, AC-013；T1.2.c |
| UT-025 / save | 已重建Blob及fake调用序列 | saveFromClick | 立即picker；不从Worker回调自动弹窗；不满足即FAIL | AC-003, AC-009；T3.2.b |
| UT-026 / save | 分别延迟write/close | 保存 | 两者都成功才saved；拒绝时可重试；不满足即FAIL | AC-003, AC-009；T3.2.b |
| UT-027 / save | 第一次AbortError，第二次成功 | 两次独立点击 | 同一artifact，不再解压/接收，输出字节不变；不满足即FAIL | AC-004, AC-009；T3.2.b |
| UT-028 / save | 延迟IO超过notice期限 | 等提示并重复保存 | 仍pending，只有一次写；不假成功或自动重试；不满足即FAIL | AC-003, AC-007, AC-009；T3.2.b |
| UT-029 / save | picker未返回时内部停止 | 返回handle | 不调用createWritable；旧清理收敛后可新会话；不满足即FAIL | AC-007, AC-009；T3.2.b |
| UT-030 / save | 写已启动后stop，close晚成功 | 结算旧attempt | 如实saveStatus=saved，文件不删除；新会话不被覆盖；不满足即FAIL | AC-003, AC-007, AC-009；T3.2.b |
| UT-031 / video | 无File/取消事件 | 选择后取消 | 可重新导入，不创建空URL或假成功；不满足即FAIL | AC-006, AC-008；T3.1.b |
| UT-032 / video | 实际失败的metadata/媒体错误 | open | 有限失败，URL回收，可导入正常文件；不满足即FAIL | AC-008；T3.1.b |
| UT-033 / video | 同一呈现媒体时间重复回调 | 采样 | 不提交重复frameId，不保证源每帧必达；不满足即FAIL | AC-007, AC-014；T3.1.b |
| UT-034 / video | ended先于最终Worker artifact | 锁存EOF后返回完整产物 | 成功优先；不先报不足，不等待永不到的rVFC；不满足即FAIL | AC-002, AC-008, AC-014；T3.1.b |
| UT-035 / video | 合法视频EOF但数据不足 | 有限补采/排空 | 未完成而非Ready；无自动循环重播；不满足即FAIL | AC-008；T3.1.b |
| UT-036 / video | 活动video/URL/回调 | stop后晚事件 | 暂停并解绑、取消回调/撤URL一次，旧数据无影响；不满足即FAIL | AC-007, AC-008；T3.1.b |
| UT-037 / ui | 缺抓屏/保存/安全上下文 | inspect | 仅报告实际能力，不弹系统授权；不满足即FAIL | AC-001, AC-003；T2.2.b |
| UT-038 / ui | 已捕获但长时间无有效帧 | 等待notice | 显示检查来源/模式，不报完成/错误风暴/确定原因；不满足即FAIL | AC-006；T2.2.b |
| UT-039 / ui | Preparing/Receiving/Ready/Saving/Stopping | 应用snapshot | 状态可见，未收敛禁新开始，保存仅可用产物；不满足即FAIL | AC-003, AC-007；T2.2.b |
| UT-040 / ui | 输入授权取消/拒绝 | 错误后新点击 | 可理解提示和恢复，不自动再弹授权；不满足即FAIL | AC-006；T2.2.b |
| UT-041 / ui | 旧session/revision/eventSeq | 更新snapshot | 拒绝旧事件，当前进度不回退；不满足即FAIL | AC-007；T2.2.b |
| UT-042 / ui | 中文空格/路径分隔/缺名 | 准备picker选项 | 只给安全basename/回退名，不静默覆盖；系统确认另做E2E；不满足即FAIL | AC-003, AC-009；T2.2.b |
| UT-043 / evidence | 声明PASS但两侧摘要不同 | verify-evidence | 非零失败，不能只改hash文本放行；不满足即FAIL | AC-004, AC-005；T4.1.a |
| UT-044 / evidence | 不存在路径或空proofRefs | local gate | 非零，截图不能替代最终文件hash；不满足即FAIL | AC-004, AC-005；T4.1.a |
| UT-045 / evidence | mock声称local/field或历史当当前 | 记录/验证 | 拒绝跨范围PASS；不改变现场NOT_RUN；不满足即FAIL | AC-005, AC-010, AC-011；T4.1.a |
| UT-046 / evidence | NOT_RUN却填executor/user | 校验记录 | 拒绝；空现场模板保持未执行；不满足即FAIL | AC-005, AC-011；T4.1.a |
| UT-047 / evidence | runner得到0测试或todo/skip | unit gate | 非零，不因Node退出0记全绿；不满足即FAIL | AC-005, AC-010；T4.1.a |
| UT-048 / evidence | 有measurement但无确认阈值 | 汇总报告 | 功能/测量/性能目标/现场分列，目标未评定；不满足即FAIL | AC-005, AC-012；T4.1.a |
| UT-049 / cpp | 已知原字节与真实压缩流 | 逐块读取至严格EOF | 字节逐个一致且只有完整消费/刷新后0；不满足即FAIL | AC-002, AC-013；T1.2.a |
| UT-050 / cpp | 被破坏的真实压缩流 | write_once及C read | 返回错误，不把失败变0/Ready；不满足即FAIL | AC-002, AC-008；T1.2.a |
| UT-051 / cpp | 压缩头/块/尾部多处合法截断 | 读取至无输入无进展 | 负不完整；已有部分输出不得当成功；不满足即FAIL | AC-002, AC-008；T1.2.a |
| UT-052 / cpp | 需要输出刷新的真实压缩流 | 耗尽输入后继续读取 | 排空所有字节，有限结束且完整状态正确；不满足即FAIL | AC-002, AC-008；T1.2.a |
| UT-053 / cpp | 完整流与比输出块小的调用方buffer | 多次read/完成后再read | 无丢字节；完成后稳定0；不无限循环；不满足即FAIL | AC-002, AC-013；T1.2.a |
| UT-054 / cpp | 原有流式write/decompress多块输入 | 逐块write而非一次性整个输入 | 分块末尾不误报整个流截断；已有测试与原发送兼容；不满足即FAIL | AC-002, AC-013；T1.2.a |

目标源/测试文件及命令在[实施计划](../plans/2026-10-18-desktop-receiver-implementation.md)各Task和[机器清单](planning-cases.json)中。UT-019～024用VM fake Module只证策略，严格解压字节由UT-049～054和IAT-01证明。实际浏览器载荷由IAT-02证明。

## 集成与E2E

- IAT-01～06的全部子分支见[集成定义](acceptance-tests.md)，不将每组概述当单一成功即可闭合。
- E2E-1～26的前置/操作/反馈/AC/执行方式见[真实旅程](e2e-user-journey-plan.md)。前20项本地，后6项用户现场。
- 生命周期/预期拒绝测试无文件时hash可null；完整文件往返必须真实落盘外部hash一致。
- 所有测试初始NOT_RUN；机读清单是规划格式，不冒充IF-010真实Evidence包。

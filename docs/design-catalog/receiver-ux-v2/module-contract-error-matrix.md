# 模块设计

## 定位与范围

接收器体验v2的内部观测与中文反馈层。输入为既有单在途解码结果、会话状态、VideoSource位置和SaveController事件；输出为只读UX视图。依据[已确认需求](../../requirements/receiver-ux-v2/requirements-spec.md)、[架构](architecture.md)与用户“确认进入阶段2.5”。基线`9e4fbc46965de42b9b0097ad80c607d71c7303f0`。

负责：真实观测采集、有界窗口、码流估计与质量、时间/保存阶段投影、中文提示和诊断退化。不负责：新传输协议、多文件队列、纠错/重建算法、调整抓帧或解码节奏、放松EOF/预算、自动操作系统选择器、替代旧业务成功/失败判据、修改旧现场记录。

本文件冻结接口语义及初始设计参数；没有实现产品代码。阶段4.x/5仍需按真实操作验证开销、文案与完整文件正确性。

## 子模块与唯一所有者

| 编号/能力 | 负责什么 | 不负责什么 | 输入→输出/依赖 |
|---|---|---|---|
| UX-M1 Worker报告适配 | 本帧fountain解码后的可选report读取/解析/长度检查 | 不以report决定artifact、错误或重试；不把报告加入REQUIRED_EXPORTS | 当前Module及frameId→WorkerObservation；依赖原WASM |
| UX-M2 会话观测 | begin/accept/finish、seq/frame幂等、时间桶、歧义锁、revision | 不改原业务状态机，不访问DOM/选择器 | 当前会话结果→内部观测；依赖SessionCoordinator所有权 |
| UX-M3 视图投影 | 业务优先级、速率/时长/进度/录像位置、中文信息 | 不推测文件总量/流身份、不驱动原render副作用 | 内部观测+只读业务Context+now→ViewSnapshot |
| UX-M4 显示生命周期 | 最多一个当前seq的低频刷新器、语义播报/DOM更新、清理 | 不启动抓帧/视频/保存，不从DOM反推状态 | ViewSnapshot→中文显示；依赖原controls及文案 |
| UX-M5 保存显示适配 | 绑定会话/产物/attempt，归一取消、写入、pending、成功 | 不写文件，不把仅选路径当已保存 | 原SaveController事件→SaveView；依赖原保存规则 |
| 原Client/Scheduler/Source | 继续原相关性、看门狗、单在途、背压、EOF | 不新增遥测轮询请求或UI触发的解码 | 原frame/帧结果保持，新增可选观测随同返回 |
| 原v1适配 | toContractSnapshot继续产出严格receiver-v1对象 | 不向v1 stats/Snapshot/Error添加UX属性或190xx | 原Snapshot、错误登记保持不变 |

Worker只提供无主线程绝对时间的观测；M2在收到结果时盖主线程单调时间。UI只读，不拥有完成裁决。六个动作是局部函数边界，不需要通用RPC路由/HTTP服务/鉴权服务器。

## 不变式

1. 业务状态、captured/processed等旧stats、frame-result.type/frameId/outcome/bytesDecoded/artifact/errorCode保持原含义。新增`uxObservation`只是内部Worker帧结果的可选旁路。
2. receiver-v1公开schema、Error枚举与错误登记保持原字节；UX数据使用本目录独立schema。不得把完整内部对象直接序列化为v1响应。
3. 对UX读取/解析异常的catch必须在旁路内完成；不能冒泡到Worker原frame_error。真正的解码/重建/预算/通道错误仍走旧路径。
4. 每个当前seq至多12个速率桶、1个1024字节报告缓冲、最多8个报告比例、1个显示刷新器；诊断按每seq/码去重，诊断集合最多15项。无新并发/积帧。
5. 任何frameId≤lastAcceptedFrameId为重复/旧消息；不增加字节、时点或revision。不同seq的结果、tick与保存回调不影响新会话。
6. 控制按钮权限等于原deriveControls与能力检查的结果；M3不因百分比、用时或提示改变权限。

# 接口契约

## 通用约定与机器文件

- [UX schema](contracts/ux-telemetry.schema.json)：JSON Schema 2020-12，仅内部可序列化元数据。Blob、ArrayBuffer、Module及计时函数不进入JSON。
- [显示配置](contracts/ux-display-config.json)：本阶段固定值；[样例](contracts/examples.json)与[正负向量](contracts/validation-vectors.json)按definition定位。
- 所有局部动作成功统一返回`{ok:true,code:0,data:...}`；无效请求或过期事件返回`{ok:false,code:190xx,data:null}`。这只描述UX动作是否应用，不是文件收发结果。诊断`ok:false`不得传播成业务失败。
- 可用报告读取成功但能力缺失时仍返回ok=true，data是`report.state=unavailable`和原因码。完整原frame结果独立交付。
- 所有对象未知字段拒绝；version=1；有限数值要求0～MAX_SAFE_INTEGER，禁止NaN/Infinity；单位Ms是同一主线程performance时钟，媒体位置单位秒。JSON schema不替代这些运行时约束。
- 无网络地址、认证令牌、分页、排序或数据库事务；调用权限为同页面既有所有者绑定。sessionId/seq不能替代原Worker对象身份关联。
- 不新增后台重试。正常逐帧流自然重读report；用户选择器的重试仍要求点击；原30秒init/frame看门狗保持原配置。

## UX-01：读取本帧报告

| 项 | 契约 |
|---|---|
| 路径/方法 | Worker内readReport；同步调用，不新增postMessage类型 |
| 调用方→被调用方 | decoder-worker本帧处理→可选Module._cimbard_get_report |
| 请求 | `ReportReadRequest`：version=1，frameId正安全整数；Module及堆属于闭包，不在JSON传输 |
| 响应 | `UxSuccess` data=`Report`；字段见下表；封装为`WorkerObservation`后附于原frame-result.uxObservation |
| 触发时点 | 原fountainResult=0n或正值后立即读取；artifact帧也须在build_artifact/recover可能删除stream前取样；真正完成仍优先artifact |
| 权限/幂等 | 仅当前Worker本帧；get_report读取不推进解码；同帧重复读取不得产生新的业务事件 |
| 超时/重试 | 不另设轮询或定时器；同步WASM若卡住仍由原帧看门狗收敛。缺导出可缓存能力缺失；临时格式失败可在下一真实数据帧再试 |
| 关联码 | 0、19001～19004、19005；协议/版本校验19008/19013 |

### 读取规则

仅data/artifact分支尝试读取；no_data/error返回`not_sampled`或省略uxObservation，不能读取刚被scan覆盖的调试文本。1024字节缓冲按Worker生命周期复用，读取当前HEAP视图并按返回长度复制；不依赖零结尾。返回长度0→empty；长度≥1024→unavailable/19003；非法长度、分配/读取抛错→unavailable/19002。文本必须为完整JSON有限非负数字数组，最多8项；不部分采信，格式错误→19004。

| Report字段 | 类型/必填 | 约束 |
|---|---|---|
| state | enum，必填 | single / multiple / empty / unavailable / not_sampled |
| ratios | number[]，必填 | ≤8，有限非负；single恰1，multiple为2～8，其余为空；比例允许≥1 |
| diagnosticCode | integer，必填 | single/empty/not_sampled=0；multiple=19005；unavailable见schema允许码 |
| WorkerObservation.version | integer，必填 | 1，与原v1元数据协议分离的局部版本 |
| WorkerObservation.report | Report，必填 | 没有跨Worker时钟或虚构streamId |

旧Worker无uxObservation，主线程归一为unavailable/19015；不能声称已证明WASM导出不存在。已存在但版本不支持→19013；不合法旁路→19008；均保留原可用frame数据。

## UX-02：开始本次接收观测

| 项 | 契约 |
|---|---|
| 路径/方法 | M2.begin；同步局部调用 |
| 调用方→被调用方 | 当前SessionCoordinator进入Receiving→会话观测模型 |
| 请求 | `BeginRequest`：version、sessionId、sessionSeq、inputKind、nowMs；全部必填 |
| 字段约束 | sessionId非空≤64且与原当前会话相同；seq正安全整数；inputKind=live/video；nowMs有限非负主线程单调时间 |
| 响应 | `Ack`：sessionSeq、applied、observationRevision；首次applied=true、revision=1 |
| 幂等/并发 | 同seq+同id+同inputKind的重复begin不清零，applied=false；更旧seq→19007；同seq冲突id/kind→19008；新seq按原清理门允许后替换所有UX状态 |
| 计时 | nowMs就是Receiving起点；Preparing不计接收用时；初始化失败未进入Receiving则没有接收时长 |
| 权限/超时/重试 | 仅原状态转换所有者调用；同步，无额外超时；重入幂等，无UI自动重启 |
| 关联码 | 0、19007、19008、19009、19013 |

## UX-03：接纳帧观测

| 字段 | 类型/必填 | 约束 |
|---|---|---|
| version | 1，必填 | 局部契约版本 |
| sessionId/sessionSeq | string/int，必填 | 必须匹配当前所有者，未停止/终结 |
| frameId | 正安全整数，必填 | 必须大于lastAcceptedFrameId |
| receivedAtMs | 有限非负number，必填 | 在主线程处理该原响应时取时；不得使用Worker绝对时钟 |
| outcome | enum，必填 | no_data/data/artifact/error；与原结果相同 |
| bytesDecoded | 安全整数，必填 | no_data/error为0；data/artifact为正值；来自原解码结果，不是RGBA大小 |
| report | Report，必填 | 经过UX-01/兼容归一，no_data/error固定not_sampled |

调用：原Client/Scheduler已完成相关性处理后，由当前SessionCoordinator调用M2.acceptFrame；同步返回Ack。相同/更小frameId、旧seq、Stopping或冻结后观测→19007，不计数也不抬revision。原真实frame错误仍由旧处理者处理，M2不吞掉或替换它。

提交侧补充元数据`FrameSubmissionMeta`：sessionId、sessionSeq、frameId、submittedAtMs（均必填，时点为主线程在原postMessage前取得）。它只在原Client当前pending项旁保留一份，完成/失败/关闭即清理，不增加消息或新提交。M3的inFlightSinceMs必须来自这一真实提交时点，不能用UI第一次看到inFlight=true的时间冒充；无pending时为null。该辅助元数据不进入旧stats或v1。

每次实际接受新的当前帧将observationRevision加1；data/artifact更新data字节和lastDataAt，no_data/error只更新最后结果时点。report.single的比例严格增加才更新lastAdvanceAt；第一次single建立增长基准。multiple或有效比例回退立即锁定ambiguity；即使后续变single，当前会话也不解除。临时unavailable/empty不清除最后可信比例，但当次展示不冒认仍可判定。

**修订（2026-10-27，round-13 A13-02）**：观察 progress 新增 `lastReportState`——最近一次被接受的 data/artifact 帧的 `report.state`（single/multiple/empty/unavailable；首帧前为 null）；ambiguity 锁定期间仍照常更新（与降级码同属可观测事实）。当次展示以该事件状态区分当前报告质量与历史可信基线：**相同 receivedAtMs 的不同帧（frameId 不同）为 empty/unavailable 时必须隐藏当次百分比**；不依赖 receivedAtMs 的严格大小，也不因此收紧接收时间校验（仍只禁止早于）。历史可信基线语义不变：后续更高 single 仍恢复展示（如 .7 恢复），回退 single 仍锁定 ambiguity（如 .5 回退锁 19006）。

### 速率窗口精确定义

固定12桶，每桶250ms；速率域有自己的rateEpochMs，初始化等于receivingAtMs。时刻t的桶号为floor((t-rateEpochMs)/250)。每次只清理/覆盖固定12槽，不因大时间跳跃循环创建任意数量桶。仅在计数溢出后的重新采样更新rateEpochMs，接收时长起点receivingAtMs保持不变。

查询当前桶号q，保留[q-11,q]；有效窗口起点=rateEpochMs+max(0,q-11)×250；windowMs=t-起点。样本按主线程收到的data/artifact时间归桶。实际覆盖期在稳定阶段为2750～不足3000ms，用户文字为“近期”；不承诺逐毫秒精确滑窗。

距rateEpochMs不足1000ms→warming、数值null；之后bytesPerSecond=保留桶字节总量×1000/windowMs。无数据也允许active值0；字节停止后不超过3000ms归零。单位显示KiB/s（除1024，一位小数），值为正却四舍五入到0时显示“<0.1”。计数溢出→19010，丢弃本条不可安全累加的速率样本、清空窗口、rateEpochMs设为当前有效receivedAtMs并重新预热；data/进度事实与原解码继续。

receivedAtMs早于receivingAt或上次已接受结果→19009，本条UX不应用；不倒拨计时或改业务结果。未来正常时钟恢复后窗口按当前桶自然淘汰。数字溢出/异常时间不能以夹值伪装真实速率。

## UX-04：读取UX视图

| 项 | 契约 |
|---|---|
| 路径/方法 | M3.readView；同步只读投影 |
| 请求 | `ViewRequest`：version、sessionId（Idle可null）、sessionSeq（Idle为0）、nowMs、context |
| Context | 原state/revision/inputKind/cleanupComplete、原controls四布尔、当前artifactId、当前inFlight及主线程提交时点、规范化媒体位置 |
| 响应 | `ViewSnapshot`；完整字段见下表；不是receiver-v1 Snapshot |
| 权限/幂等 | 只读当前所有者；同观测+相同context+now得到同一结果，不提升observationRevision；相同业务revision仍可按now刷新用时 |
| 超时/重试 | 最快250ms一次；事件驱动的业务状态与可用按钮立即更新；无旧选择器副作用 |
| 不合法调用 | 旧seq→19007；无效字段/不一致Context→19008；now早于接收/最后观测时点→19009；失败时保留原业务UI并使UX数值暂不可用，不显示伪造结果 |

Context由原主线程快照/能力与当前元数据构建，schema固定全部字段：state、businessRevision、inputKind、cleanupComplete、artifactId、controls、inFlight、inFlightSinceMs、mediaPosition、mediaDiagnosticCode。已声称Ready/Saving/Saved/Retryable却无可归属的真实artifact/owner，属于19014；不能用估计比例补齐产物。业务Context的源字段无效/相互矛盾则19008，不能改原业务状态迁就UX。

### ViewSnapshot字段

| 字段 | 类型/必填 | 含义与约束 |
|---|---|---|
| version | 1，必填 | 内部UX版本 |
| sessionId/sessionSeq | string或null / int，必填 | Idle为null/0，其他须匹配会话 |
| observationRevision/businessRevision | int，必填 | 分别观测与原业务版本，不混用 |
| viewAtMs | number，必填 | 本次投影主线程单调时间；只能渲染当前seq、不早于已渲染viewAt |
| state/statusKey | enum，必填 | 原业务状态/稳定的中文状态键；精确值见schema |
| primary/secondary/nextAction | string，必填 | 纯文本，非HTML；界面不显示190xx作为恢复指令 |
| elapsedMs | integer或null，必填 | Receiving起点到终点或now；无起点为null，整数向下取整 |
| rate | object，必填 | phase=idle/warming/active/frozen/unavailable；数值只在active非null；windowMs≤3000；includesRedundancy=true |
| progress | object，必填 | kind=none/estimate/enough_data/unavailable/ambiguous/complete；ratio/asOfMs/stale/diagnosticCode规则见schema及下文 |
| mediaPosition | object或null，必填 | positionSeconds、durationSeconds或null、fraction或null；仅video，分开显示 |
| save | object，必填 | phase、attemptId、artifactId、errorCode；归一后的本次保存显示 |
| controls | 四布尔，必填 | canStartLive/canImportVideo/canStop/canSave；等于现有策略和能力，不因UX规则新增启用 |
| announcementKey | string，必填 | 主语义状态键+本次产物/保存attempt身份；不含时间、速度或百分比 |
| diagnosticCodes | 去重int[]，必填 | ≤15，按数值排序，仅UX诊断；不混入v1 Error |

进度ratio只有estimate/complete有数：estimate为0≤p<1、asOf是最近可信样本，stale表示5秒无新data；complete为1且必须存在真实当前artifact。enough_data为p≥1但文件未完成，ratio=null、不确定指示；ambiguous/unavailable不展示旧百分比。只保留单流的观测估计，不虚构文件名/总字节。

当前报告质量是否可判定，以观察 progress.lastReportState 的事件状态为准（empty/unavailable→当次不展示百分比），不以 lastDataAtMs 与 trustedAtMs 的时间大小推断；相同 receivedAtMs 的降级帧同样生效，详见 UX-03 段 2026-10-27 修订注记。

录像位置由原snapshot归一：position有限非负；duration非有限/非正→null，fraction=null；有效duration时fraction=min(1,position/duration)，仅用于媒体位置。position无效→整个mediaPosition=null、19011。读到录像结尾不会直接改文件状态。

### 中文状态优先级（冻结）

1. 原终态、保存态、Stopping/收尾态、Preparing先于Receiving细分。Saved只由原write+close成功，Ready只由原完整artifact。
2. Receiving的普通inFlight不覆盖正常接收提示，防单在途每帧造成闪烁。仅当前帧已处理≥1500ms时可显示processing，仍不改变原看门狗。
3. 尚无data→waiting_data，满5000ms给检查源建议。曾有data但5000ms无新data→no_new_data；忙帧提示优先，不能从未回复推断无输入。
4. 有近期data时，ambiguity→progress_unknown；unavailable/empty→progress_unavailable；single≥1→collecting_more。
5. 有近期data且单流可估计，距lastAdvance≥8000ms→no_progress，否则receiving。无可信比例时不谎称“没有新块”。
6. 状态建议只是建议，不能自动停止、重启或再次打开选择器。未知/无效业务state按19008拒绝UX投影，原业务UI继续。

## UX-05：结束观测与显示生命周期

请求`FinishRequest`：version、sessionId、sessionSeq、nowMs、reason、artifactId，均必填；reason=artifact/incomplete/stopped/error/disposed。artifact要求真实当前artifactId，其他为null。只能由原业务结算/页面销毁路径发起，不能由进度/时长触发。

同步返回Ack。首次结束冻结endedAt/elapsed，rate.phase=frozen、数值null；重复相同结束幂等，不移动终点。已经因真实artifact冻结后再停止/销毁只清理刷新器，不抹掉原接收用时。Preparing阶段从未begin则保留elapsed=null，清理为幂等空操作。

M4显示生命周期：每seq最多一个刷新器；替换/终结/销毁释放；隐藏页可停止刷新，恢复时按当前时钟重新投影，不累计tick次数。回调验证seq与viewAt，不能调用原带副作用的整页render。Preparing/Saving可由业务事件即时更新；无接收时不保留接收tick。render抛错→19012，保留既有业务按钮和文字回退，不触发传输重试。

关联码0、19007、19008、19009。无新的事务、网络重试或磁盘副作用。

## UX-06：保存显示观测

请求`SaveRequest`：version、sessionId、sessionSeq、artifactId、attemptId、rawStatus、errorCode，均必填。rawStatus为selecting/writing/pending/saved/cancelled/failed/aborted；errorCode为null或既有登记码。同步返回Ack。

调用方为App/Session现有保存桥接；owner=(sessionId,sessionSeq,artifactId)在用户点击保存前捕获，attemptId取实际SaveController事件并转为非空字符串，不能在迟到回调中用当前会话冒充来源。UI保存身份以owner+attemptId为边界。

同owner/attempt的完全相同事件不提升revision。终结attempt不倒退到writing；旧owner/attempt→19007，新attempt由新的真实点击建立。事件不合法→19008，仅丢UX观测，原SaveController结算继续。

归一规则：errorCode=16002且rawStatus=failed/cancelled时均为cancelled（当前同步AbortError也可能上报failed+16002）；rawStatus=writing且lastError=16008仍为writing，不把防重入提示冒充写入失败；pending显示尚未结算；saved必须来自原成功事件且errorCode=null。aborted/11005不污染新会话。所有保存成功/取消/失败与错误修复动作保留既有语义，不解析英文日志推断结果。

## 样例、并发与退化总则

[examples.json](contracts/examples.json)按UX-01～06给出字段级请求/响应/视图样例。[validation-vectors.json](contracts/validation-vectors.json)包含拒绝未知字段、缺省/错误版本、非法数据量、多流长度/码不一致、假完成比例等形状反例；时序、身份、业务完成、DOM/IO与窗口数学必须由阶段4.5/4.7另行定义测试，不能仅靠schema判通过。

所有重试/取消/开始入口仍是原UI操作；本层没有自动恢复发送、跨会话复用数据、自动调低预算等行为。

# 异常码矩阵

## 编号与作用域

沿用既有“0成功、状态提示不滥用故障码”约定。新增19001～19015仅为`receiver-ux-v2-internal`的诊断段，机器登记在[ux-diagnostics.json](contracts/ux-diagnostics.json)，不写入旧error-codes.json，不作为原Worker frame_error或v1 Error.code。等待/采样/重复/暂停/够理论数据/准备保存均为正常状态，不分配业务错误码。

| 所属/类别 | 码 / 名称 | 精确触发 | 用户文案方向 | 重试/调用方处理 | 日志/告警 |
|---|---|---|---|---|---|
| M1 依赖 | 19001 REPORT_EXPORT_MISSING | 当前Module无可调用get_report | 进度暂不可用 | 无自动重建；原接收继续，能力缺失本会话缓存 | info每seq一次；装配检查记录 |
| M1 依赖 | 19002 REPORT_READ_FAILED | 缓冲分配/读取抛错或长度返回不合法 | 进度暂不可用 | 释放/复用有界缓冲，下一真实数据帧可重试 | warn去重；持续复现向开发报告 |
| M1 参数/数据 | 19003 REPORT_TRUNCATED | 返回长度达到/超过1024上限 | 进度暂不可用 | 不增大缓冲、不采信前半数组；下一帧再读 | warn去重；测试/开发定位 |
| M1 参数/数据 | 19004 REPORT_FORMAT_INVALID | 非完整有限非负数组、>8项或非法文本 | 进度暂不可用 | 不部分采信；保留正常解码结果 | warn去重；持续复现报告 |
| M2 业务观测 | 19005 REPORT_MULTIPLE_STREAMS | 有效报告含2～8比例，无稳定ID | 无法确定当前文件进度 | 本seq锁歧义，建议单文件；新会话才重置 | info去重；无需告警 |
| M2 数据一致性 | 19006 REPORT_RATIO_REGRESSED | 未锁歧义且有效single低于最近可信single | 无法确定当前文件进度 | 不夹最高值；锁至新会话 | info去重；测试核查 |
| M2/M4/M5 状态/幂等 | 19007 UX_STALE_EVENT | 旧seq/frame/attempt、冻结后结果或迟到tick | 不覆盖当前提示 | 丢弃，无自动重试，原业务过滤继续 | debug去重；无需告警 |
| 内部边界 参数/身份 | 19008 UX_INPUT_INVALID | 无效字段、当前身份冲突、非法保存逆序或Context不一致 | 指标暂不可用，保留原业务反馈 | 拒绝UX动作，不改变传输；开发修正调用 | warn去重；集成期阻断该测试 |
| M2/M3 时间 | 19009 UX_CLOCK_INVALID | 非法/倒退主线程时间不满足单调约束 | 指标暂不可用 | 不应用错误观测/查询；不回拨/虚造时长 | warn去重；开发定位 |
| M2 内部数据 | 19010 RATE_COUNTER_OVERFLOW | 桶内/窗口字节累加不再是安全整数 | 速率重新采样 | 只清速率窗口，1秒预热；进度与解码继续 | warn去重；开发定位 |
| 媒体边界 外部数据 | 19011 MEDIA_POSITION_INVALID | 当前位置非有限或负数 | 录像位置暂不可用 | 隐藏位置，视频处理和文件判据保持；未知总时长单独允许 | info去重；持续复现报告 |
| M4 内部 | 19012 UX_RENDER_FAILED | 新遥测绘制抛错 | 保留原业务状态与按钮 | 本次UI回退，不触发重新接收 | error去重；开发报告 |
| 内部边界 版本 | 19013 UX_VERSION_UNSUPPORTED | 可选观测/局部动作version不是1 | 进度暂不可用 | 仅UX降级，旧frame与v1公开接口继续 | warn去重；装配检查报告 |
| M3 数据缺失 | 19014 UX_CONTEXT_INCOMPLETE | 原状态已需保存/完成显示但所需产物或owner信息缺失 | 等待真实状态或保留原提示 | 不从百分比补造artifact；保留原controls | warn去重；集成期复核 |
| M1/M2 兼容 | 19015 UX_TELEMETRY_ABSENT | 原帧可用但旧Worker未附uxObservation | 进度暂不可用 | 不冒称导出缺失；字节速率仍可计算 | info去重；版本装配记录 |

以上诊断不要求线上告警服务；“报告”是后续研发/验收记录。每seq同码去重，不把每一帧写成日志。

## 既有业务码沿用

| 原码 | 原来源与处理 | UX映射规则 |
|---|---|---|
| 10004 | 用户激活缺失 | 提示点击，不自动重开选择器 |
| 11003/11005 | 原状态/会话变化 | 原处理不变；UX不复活旧会话 |
| 12001～12006 | 抓屏能力/取消拒绝/不可读/结束/上下文 | 使用已有code和retryAction；中文按实际code表达，不虚构特定权限原因 |
| 13001～13005 | 录像能力/解码/等待/不完整/元数据 | 保持原有限失败与恢复，不把录像100%当重建成功 |
| 14003/15003/15008/15010/15011等 | 真正帧超时、WASM/预算/通道/初始化故障 | 原错误结算继续；不能用“进度不可用”掩盖真正错误 |
| 16002 | 保存取消，包括failed+16002形状 | 用户显示取消，可再保存 |
| 16003～16006 | 权限/锁/写入/close失败 | 原重试动作，文件仍在时明确可再保存 |
| 16008/16009 | 保存忙/结算等待 | 不重复打开保存窗口，不判Saved，不显示虚构百分比 |
| 18001～18003 | 真资产加载/摘要/配对失败 | 保持原初始化失败，与仅缺可选report不同 |
| 90001 | 原未知内部业务错误 | 不新增猜测名称；沿原恢复策略 |

## AC闭环与后续验证

| AC | 本阶段固定内容 | 下一阶段所需测试证据 |
|---|---|---|
| AC-015 | UX-03 outcome区分/UX-04 waiting_data | 实时有图无数据、首个有效码、普通inFlight不闪烁 |
| AC-016 | UX-01有效报告、single/多流/回退/≥1规则 | 实际WASM+坏report/多流/回退；不能只跑schema |
| AC-017 | 12桶/250ms/预热/含冗余单位 | 边界时间与字节、无数据归零、真实识别流对照 |
| AC-018 | 独立readView tick、1500/5000/8000ms提示 | 无新snapshot、慢帧、后台返回与时钟负例 |
| AC-019 | media归一与文件状态分离 | 录像耗尽无产物/未知时长/正常提前重建 |
| AC-020 | UX-05 genuine finish、UX-06真实save事件 | 未完成/可保存/取消/写入失败/close失败/成功 |
| AC-021 | seq/frame/owner幂等与冻结/清理 | 停止/迟到回调/重开/双输入切换 |
| AC-022 | primary/secondary/nextAction、announcementKey | 中文主路径/键盘/实际浏览器与辅助技术 |
| AC-023 | 报告/桶/计时器边界、非致命诊断 | 同输入A/B开销及旧单在途/真实预算回归 |
| AC-024 | v1隔离、原选择器/保存/EOF不变 | 本地真实抓屏与录像+外部SHA，用户现场分列 |

# Assumptions And Open Questions

无新增待用户回答的需求问题。时间桶近似、1500ms慢帧提示及内部190xx诊断段是本阶段明确的技术选择，不是新传输能力；均不改变用户已确认范围。1500ms用于避免普通inFlight闪烁，细化了阶段2“忙帧优先”的触发条件；同期同步架构文档。

H-01/H-02已形成可实施契约与退化规则；H-03性能和H-04实际窗口/可访问性仍要在4.x/5按冻结方法执行。本轮没有生产/E2E或新浏览器视觉验收，不能从文档形状QA推断产品已通过。

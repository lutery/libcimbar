# 模块设计

阶段 2.5，契约版本 v1，2026-10-18；基线 `84e7a1a`。输入为 [确认需求](../requirements/requirements-spec.md)、[系统架构](architecture.md)及 [原始用户回答](../requirements/open-questions.md)。本文件冻结详细设计，不提供产品实现。

## 定位、范围与现有约定

新增宿主机浏览器接收端，双输入汇入原 cimbar 解码/重建能力；协议和发送端保持兼容。已有 C 函数使用负返回值、CLI 使用退出码、旧页面使用字符串提示，未发现统一的新接收端业务码体系。本期建立独立错误号段，不重编号原 C 返回值或 CLI 退出码。

负责：选择输入、单会话、受限取帧、解码适配、正常 EOF 与错误区分、完整产物、显式保存和会话内保存重试。不负责：新增 HTTP 业务服务、账号/数据库、发送端重写、协议扩容、并行多文件、跨会话续传、所有录像格式或所有原生兜底方案。

## 子模块与资源所有权

| ID / 模块 | 负责什么 / 输入输出 | 不负责什么 | 所有权、上游与下游 |
|---|---|---|---|
| M01 界面与能力检查 | 用户点击、File 对象、模式 → 能力结果和显式命令 | 不解码、不伪造已保存、不在异步回调自动授权 | 用户动作由 UI 保持；调用 M02、M07；显示 M02 快照 |
| M02 会话协调 | 唯一 sessionId、合法状态、命令去重、EOF 屏障、清理 → 快照/事件 | 不读 WASM 内存、不拥有磁盘数据 | 唯一状态写入者；管理 M03～M07；旧会话只能清理不能写新状态 |
| M03 实时输入 | 用户动作中的捕获选择 → 媒体源/自然尺寸帧/源结束 | 不自动预选窗口、不录制、不排队解码 | 拥有 tracks、媒体绑定和捕获回调；M02 负责使身份失效；迟到流由 M03 关闭 |
| M04 录像输入 | File → Object URL、媒体元数据、受控帧、EOF/媒体错误 | 不转码、不证明每帧必达、不无限循环 | 拥有 File/URL/视频回调；M05 决定处理背压，M04 暂停/继续 |
| M05 帧调度 | 自然尺寸帧 → packed RGBA 与单在途请求；结束排空 | 不改原始分辨率、不无限缓冲 | 拥有未发送帧；发送后 ArrayBuffer 归 M06，槽位在回复/失败/终止时释放 |
| M06 解码适配/Worker | 固定模式、新 WASM → 数据状态或严格结束后的 Blob | 不持久化、不跨会话复用、不自动探测轮换模式 | 唯一拥有本会话 WASM、堆视图和解压器；交付 Blob 后由 M02 确认并终止 Worker |
| M07 产物与保存 | 不可变 Blob + 用户动作 → 保存尝试及最终结果 | 不重新读已消耗解压器、不把下载触发等同磁盘完成 | M02 拥有 Blob 生命周期；M07 独占 picker/写入流，失败后保留同一 Blob |
| M08 验证记录 | 测试运行/外部哈希 → 按 AC 分层证据 | 不成为产品服务、不把 mock 记为本地/现场 E2E | 实施测试方本地记录，真实云桌面由用户执行；不上传原文件 |

边界冲突的固定归属：状态与清理由 M02 编排；输入组件释放自己资源；帧在途计数由 M05 管理；M06 只报告处理结果；M07 只报告保存尝试结果。两个模块不能各自修改 session.state。

## 会话、产物与竞态规则

1. 每次新会话使用全新 Worker/WASM。模式固定，主基线为 B；其他模式只在已验证支持列表中发布。同模式配置调用不当作 reset。
2. M02 在调用捕获选择前同步生成会话身份；直接在用户动作栈发起捕获，不能先 await Worker。选择与初始化异步完成后再取帧。
3. 所有数据回调先检查本地 Worker 对象身份和 sessionId，再检查当前状态。旧帧/解码结果无副作用丢弃；旧授权流如已产生必须关闭。资源拥有者仍通过原会话的清理令牌处理迟到选择器/IO 的收敛结果，只能完成该旧会话清理，不能重启输入或写入新会话状态。旧命令显式返回 11005。
4. 仅一个像素帧在途。实时忙碌时跳过新采样；录像暂停/降低播放速率等待回复。帧请求不自动重发，重复或非递增 frameId 为 14005。
5. 录像 EOF 先锁存，必要时有限补采最终呈现帧，再等待所有已提交工作完成；完整产物优先于不完整结果。禁止在最后一帧回复前判 EOF 失败，禁止 ended 后等待永不会到来的帧回调。
6. 只有完整重建、严格解压正常结束、输出预算检查及原生载荷验证均成功，才转 Ready。无有效帧是正常 no_data 状态，不生成连续故障日志，也不能诊断为确定的“模式不匹配”。
7. 保存失败/取消保留当前 Blob。再次保存须新用户点击、新 requestId，不重新调用解压器。保存完成须 write 和 close 均成功；外部 SHA-256 才证明内容一致。
8. 停止先禁用新提交并使当前会话失效，再关闭输入/回调、终止 Worker、清理产物。重复停止幂等。活动写入或不可关闭选择器未收敛时保留 Stopping，不假称 cleanupComplete。
9. 浏览器选择器无程序强制关闭承诺。抓屏选择晚返回时立即清理；保存选择器/IO 晚返回时由原尝试收敛。停止后才选定的保存目标不再发起写入；已在途且最终提交的写入通过 saveStatus=saved 如实保留结果，不删除已有文件。尚不确定时不自动再次写入。

## 严格解压适配门槛与最小必要变更

当前 `cimbar_recv_js.cpp` 在调用 `_dec->write_once()` 时不使用其 bool 返回；`zstd_decompressor.h` 没有保存“最后压缩帧完整结束”状态。因此，仅依据当前函数返回 0 不能从静态源码证明严格正常结束；多次读取 0 也不能证明截断输入完整。

冻结的适配要求：C ABI 函数名和成功数据形式保持兼容；正值表示已复制有效输出，0 仅表示压缩输入全部消费、压缩帧完整且输出排空，负值表示恢复/解压/截断错误。输入已耗尽而仍需输出刷新时继续刷新；零进展且仍需输入时返回不完整，不能无限循环。[Zstd 官方语义](https://facebook.github.io/zstd/zstd_manual.html)

装配产物必须用正确、损坏、截断、输出刷新、多次读取以及预算越界样本证明该行为。现成 WASM 若不能满足，允许在 `cimbard_decompress_read` 与现有解压包装的错误/完成状态上作最小修正并重建；不改发送协议、不更换压缩格式、不扩展为全仓修复。保留源 ABI 的负值作为诊断，再映射本表 15007/15012。源码不支持可靠细分时优先报 15007，不能编造具体原因。

这是满足已确认“错误不得假成功”的必要集成条件，不承诺零 C++ 变更或原发布包直接可用。真实文件一致性仍须外部 SHA-256。当前仅做设计，未实施修正、构建或验证。

# 接口契约

## 传输范围、统一包与版本

机器可读定义：[receiver-v1.schema.json](contracts/receiver-v1.schema.json)；逐项样例：[examples.json](contracts/examples.json)。采用 JSON Schema Draft 2020-12，仅约束可序列化元数据。全部路径为本地逻辑调用路径，方法为 QUERY/COMMAND/EVENT/WORKER_REQUEST/RECORD，不是 HTTP 路由。静态资源服务没有业务 API、认证令牌或网络回调端点。

原生外层载荷固定为 `meta`（符合 schema 的对象）及 `payload`（null、File、ArrayBuffer 或 Blob）。文中 JSON 和样例文件只表示 meta；`nativePayload` 是测试类型描述，不可当真实 File/Blob/字节内容发送。

| 公共字段 | 请求 | 响应 / 事件 | 约束 |
|---|---|---|---|
| version | 1 | 1 | 版本不兼容拒绝，不静默迁移 |
| kind / op | request + 冻结动作 | response 或 event + 原动作/事件名 | 未知动作以 failure-only `protocol.reject` 返回，不回显不合法 op |
| requestId | 1～64 位字母/数字/下划线/短横线 | 响应关联原请求；自然事件可 null | 不记录用户文件路径；不合法请求生成安全的诊断 ID |
| sessionId | 新建、能力和证据录入为 null；读取允许 null；其他动作必填 | 相关会话或 null | 与本地对象身份一起验证，不充当鉴权凭证 |
| eventSeq | 不适用 | 事件必填，正安全整数 | 每个 emitter 在本会话内递增；来源事件和协调器事件分别计数 |
| ok / code | 不适用 | 成功 true/0，失败 false/登记码 | 事件表达事实成功传达；业务故障保存在 Snapshot.lastError，不把顶层事件改成“失败送达” |
| data / error | 请求 data 必填 | 成功 data 按动作类型、error=null；失败 data=null、error 必填 | 外层 code、error.code、name、retryAction 必须匹配登记表；未知字段拒绝 |

Failure 的 error 固定为 `code,name,message,retryAction,details`。details 只允许 nativeName/nativeSymbol/nativeCode/phase；原 C 码按调用符号解释，不靠单一负数全局推断。用户提示使用简明 message，内部代码/堆栈不得直接代替产品提示。

异步动作一经接受只回复一次 accepted；最终状态通过 IF-009 和 IF-003 读取，不再次对同一动作发送第二个终态响应。相同请求去重命中终态时可直接返回 completed。Worker 请求不同：只在本次工作完成或失败后返回一次，调用侧此时仍占在途槽。

## 字段模型与安全配置

| 模型 | 字段与约束 |
|---|---|
| Input | live 只有 kind；video 必填 kind/name/size/mime/lastModified，size 为正安全整数，mime 可空；File 原生对象须逐字段匹配 |
| AssetSet | assetSetId、7～40 位源码 revision、同源相对 jsPath/wasmPath、两侧 SHA-256、strictEofEvidenceRef；路径禁止绝对 URL、上跳 `..` 和盘符 |
| Artifact | artifactId、8 位十六进制 fountainFileId、非空建议 basename、byteCount、compressedBytes、固定 octet-stream MIME；只传文件元数据，Blob 通过原生 payload 克隆 |
| Frame | frameId、width/height、固定 RGBA、byteLength、mediaTimeUs、finalSample；均为安全整数，长度必须等于 width×height×4 并符合预算 |
| Snapshot | sessionId、inputKind、mode、state、revision、inputEnded、cleanupComplete、pendingExternal、artifact、saveAttemptId、saveStatus、lastError、stats |
| Stats | capturedFrames/submittedFrames/processedFrames/droppedFrames 为非负安全整数，inflight 为 0 或 1，elapsedMs 可 null；processed≤submitted≤captured，drop≤captured |
| pendingExternal | capture_picker/save_picker/save_io 的无重复集合；没有活动外部操作时为空 |
| saveStatus | none/selecting/writing/pending/saved/cancelled/failed/aborted；与会话状态分别记录，使停止后已提交保存仍可如实报告，无需保留文件 Blob |
| state | Preparing/Receiving/Draining/Reconstructing/Ready/Saving/Saved/Retryable/Stopping/Stopped/Incomplete，与阶段 2 状态机对应；无会话由 snapshot=null 表示 |

初始安全配置见 [profile-initial.json](contracts/profile-initial.json)：最大自然帧像素 4,194,304；最大解压产物 16,777,216 字节；仅一帧在途；初始化和单帧看门狗 30 秒；视频就绪 15 秒；保存 IO 提示 30 秒；清理提示 5 秒；无有效数据提示 5 秒。以上为 **Assumption：可调整的初始资源/诊断预算**，不是最大支持规模、性能 SLA 或实测能力承诺。V-001～V-003 测量后校准配置，并在运行记录中保留 profileId。

源选择和保存选择器不设自动超时重试；保存 IO 和清理超过提示时限只产生 pending 状态，不假称取消或可再次写入。无有效码提示也不是终止会话的超时故障。

## IF-001：读取能力

- 路径/方法：`Receiver/capabilities.inspect`，QUERY。M01 → 本地能力/装配检查。
- 请求：data 为 `{}`，sessionId=null，payload=null。
- 响应：secureContext/capture/savePicker/frameCallbacks/worker/wasm 六个 boolean；已验证 modes 列表；待验证 videoCandidates 列表；assetSetId/profileId。候选不等于支持声明。
- 权限/并发：不触发任何系统选择器，可随时只读查询；不能用能力存在替代实际运行验证。
- 幂等/超时/重试：无副作用，每次读当前结果；资源文件检查按 initTimeoutMs 收敛，可修复装配后重查。
- 码：0、10001、10002、10003、18001～18003；具体抓屏和保存不支持通过 boolean 返回，由实际开始/保存操作给 12001/16001。
- 示例：examples.json 中 `capabilities.inspect-request` / `capabilities.inspect-success`。

## IF-002：开始单文件接收

- 路径/方法：`Receiver/session.start`，COMMAND。M01 → M02 → M03/M04、M06。
- 请求：sessionId=null；data.input 按 Input；data.mode 在已发布支持列表中；live payload=null，video payload=同一选择得到的 File。
- 响应：outcome=accepted、snapshot 为 Preparing。M02 生成新 sessionId；前置验证失败则 failure，无新会话副作用。
- 权限：live 必须同步保留用户激活并直接调用系统选择器，不得先 await 初始化或通过定时任务调用；video 不需要系统抓屏权限。已有活动/未收敛会话不允许第二次开始。
- 幂等：当前会话及最近一次已完成会话的相同 requestId/数据/原生对象身份返回原操作结果，不重复弹窗；同 ID 不同参数为 11004。超出去重窗口不保证重放，UI 必须为新用户动作生成新 ID。
- 超时/重试：Worker init 和视频就绪分别使用配置看门狗；抓屏选择本身不自动超时。失败后由新点击和新会话重试，不自动反复授权。
- 完成/查询：IF-009 接收 Preparing→Receiving 或失败清理；IF-003 查询。旧授权返回的流也必须清理。
- 码：0、10001～10004、11002/11004、12001～12004/12006、13001～13003/13005、14002、15001/15002/15009/15011、18001～18003。部分故障在接受后以 lastError 报告。
- 示例：`session.start-request` / `session.start-video-request` / `session.start-success`。

## IF-003：查询会话

- 路径/方法：`Receiver/session.read`，QUERY。M01 / 测试观察器 → M02。
- 请求：data={}，sessionId 可 null（读当前）或已知会话 ID，payload=null。
- 响应：snapshot 为 Snapshot 或 null；无当前会话且请求 ID 为 null 返回 null，指定未知 ID 为 11001；已知旧会话不能冒充当前会话。
- 权限/幂等：同一页面上下文只读，无系统权限/分页/排序；每次返回最新快照，不缓存旧进度。
- 超时/重试：本地同步读，不依赖 Worker 回复；UI 首选事件订阅，恢复显示时可重查，不引入网络轮询服务。
- 码：0、10001/10002/10003、11001/11005。
- 示例：`session.read-request` / `session.read-success`。

## IF-004：停止与清理

- 路径/方法：`Receiver/session.stop`，COMMAND。M01 / 生命周期控制 → M02。
- 请求：指定 sessionId；data.reason=user/restart/page_exit/fatal，payload=null。
- 响应：outcome=accepted 或 completed，加 snapshot。已停止会话重试返回 completed；未收敛外部操作为 Stopping/cleanupComplete=false。
- 权限/幂等：仅当前或最近终态会话可作用；旧会话不影响新会话。重复停止不重复写入/销毁其他会话，不删除已保存文件。
- 超时/重试：先同步禁用输入并使身份失效；Worker 直接终止，输入组件清理自己的资源。选择器/写入未返回时超过 cleanupNoticeMs 只提示仍在清理；没有可证实收敛前不得启动新会话。
- 完成/查询：通过 IF-009 或 IF-003 观察 Stopped/cleanupComplete=true；清理过程和完成记录都归同一旧 sessionId。
- 码：0、10001/10002/10003、11001/11005；保存尚未收敛的诊断可为 16009，不将其伪装成已取消。
- 示例：`session.stop-request` / `session.stop-success`。

## IF-005：初始化独立解码实例

- 路径/方法：`Worker/decoder.init`，WORKER_REQUEST。M02 → 新 M06 Worker。
- 请求：sessionId 必填，data={mode,assets:AssetSet,limits:Limits}，payload=null。资源必须同源且匹配，加载器二级 WASM 路径使用同一清单基地址。
- 响应：outcome=ready、mode、assetSetId、strictEofVerified=true；该标记表示匹配的装配产物有严格 EOF 证据，不表示当前文件已经解码。
- 权限/幂等：Worker 对象绑定唯一会话；每实例只初始化一次，相同 requestId/清单返回原结果；不同配置不得重置一个正在使用的实例。
- 超时/重试：initTimeoutMs 后终止实例；修复/新建后再试。不能由失败实例继续处理。
- 业务约束：必要导出、HEAPU8、BigInt ABI 和严格结束装配证据齐全；没有证据的清单不得仅靠一个布尔字段放行。
- 码：0、10001/10002/10003、11003/11004、15001/15002/15004/15009/15010/15011、18001～18003。
- 示例：`decoder.init-request` / `decoder.init-success`。

## IF-006：提交与处理一帧

- 路径/方法：`Worker/decoder.frame`，WORKER_REQUEST。M05 → 已就绪 M06。
- 请求：Frame 元数据及 payload=ArrayBuffer；尺寸为自然尺寸的 packed RGBA，传输列表只转移该 ArrayBuffer。发送后主线程不可继续访问已 detach 的缓冲。
- 响应：frameId、outcome=no_data/data/artifact、bytesDecoded、artifact；no_data 为正常成功且 bytesDecoded=0。只有 artifact 时附 Artifact 元数据及 payload=Blob，其他回复 payload=null。
- 权限/并发：只有当前 Worker 可处理；frameId 正递增，最多一个请求在途。JSON Schema 不验证真实像素乘积/对象类型，运行时必须检查。
- 幂等/重试：不自动重发；重复帧请求为 14005，处理前拒绝。喷泉层自行处理不同呈现帧中重复块，不应把它转换成传输故障。
- 超时：frameTimeoutMs 覆盖本次 scan/fountain/严格解压工作；超时终止整个旧实例，不在同一实例盲目重试。成功/失败/复制异常/Worker 退出都恰好释放一次在途槽。
- 业务约束：临时堆视图在分配后重新绑定；WASM 像素缓冲尺寸、fountain 块长度按配置核对；所有输出从堆复制后构建 Blob，按总输出字节执行预算，不输出半文件。
- 码：0、10001/10002/10003、11003/11005、14001～14005、15003～15008/15009/15010/15012。
- 示例：`decoder.frame-request` / `decoder.frame-success`；示例字节是 2×2 RGBA 的类型/长度说明，不是有效 cimbar 图像。

## IF-007：输入结束事件

- 路径/方法：`Source/source.ended`，EVENT。M03/M04 → M02/M05。
- 元数据：sessionId、正递增 eventSeq；data.reason=eof/capture_ended/media_error、lastSubmittedFrameId、finalSampleSubmitted、error。media_error 必须有 Error，其他两项 error=null。
- 响应：事件不请求应答；M02 通过 IF-009 给出新的快照。顶层 ok=true/code=0 表示有效事件；捕获未完成就结束时，后续快照带 12005。
- 幂等：每源生命周期一次有效结束；重复 eventSeq/旧身份丢弃。程序自己停止轨道不再视为外部故障。
- 超时/重试：EOF 不自动重放。若最终呈现帧尚未提交，有限补采并等待在途工作；有产物即 Ready，否则 Incomplete+13004。媒体错误映射 13002，清理后允许新导入。
- 业务约束：lastSubmittedFrameId 不得大于 M05 已知提交值；EOF 标记不是处理完成或失败凭证。
- 码：正常事件 0；后续快照可携 12005、13002、13004、14003、150xx。
- 示例：`source.ended-eof`。

## IF-008：保存与会话内重试

- 路径/方法：`Receiver/artifact.save`，COMMAND。M01 → M02/M07。
- 请求：当前 sessionId 与 data.artifactId；payload=null，实际 Blob 从该会话产物缓存取得。
- 响应：outcome=accepted、attemptId、artifactId；去重命中已完成尝试可为 completed。只有 preflight 失败才直接 failure；系统对话框/IO 的后续结果通过快照报告，不发送第二个动作响应。
- 权限：新的保存尝试必须来自当前用户点击，前置检查同步完成后立即打开选择器，不能 await 异步查询后再弹窗。
- 幂等/并发：相同 ID/同产物返回同一次尝试，不重复选择器；相同 ID 改产物为 11004；新 ID 遇活动尝试为 16008；失败已收敛后由新点击/ID 重试，Blob 不变。
- 超时/重试：无选择器自动超时；IO 超过 saveIoNoticeMs 报 16009 且仍为 Saving/Stopping，禁止自动重写。等待实际完成/失败或停止清理收敛，之后才能允许新尝试。
- 业务约束：原名只作为安全 basename 建议，缺失名用明确回退名；重名覆盖交系统选择器确认。write/close 成功后 Saved；取消/可重试错误后 Retryable。清理不删除已提交文件，不保证回滚或跨会话保留。
- 码：0、10001～10004、11001/11003/11004/11005、16001～16009。
- 示例：`artifact.save-request` / `artifact.save-success`，以及 `error-16002` / `error-16009` 的状态事件。

## IF-009：状态通知

- 路径/方法：`Receiver/session.changed`，EVENT。唯一写入者 M02 → M01/测试观察器。
- 元数据：完整 Snapshot、sessionId 和递增 eventSeq；关联动作 requestId 或自然事件 null；顶层成功包。
- 权限：仅当前本地协调器发送；不是网络订阅。UI 收到旧 sessionId、旧 revision 或非递增序号直接丢弃，不能覆盖新界面。
- 幂等/查询：重复事件无副作用；丢失通知通过 IF-003 读取恢复。通知不含 File、像素或 Blob，产物仍由会话缓存拥有。
- 超时/错误：无应答/重试风暴；lastError 携带最近故障或 pending 状态，清理结果独立表达，不能因为显示错误就提前设 cleanupComplete。
- 示例：`session.changed-ready` 及所有 `error-12xxx`、`error-13xxx`、`error-16xxx`。

## IF-010：记录验证证据（测试侧）

- 路径/方法：`Validation/evidence.record`，RECORD。实施测试方/用户测试记录 → 本地报告文件；不新增产品 HTTP 接口或强制 UI 导出功能。
- 请求：sessionId=null，Evidence 全字段；runId/caseId、scope、caseType、executedBy、acceptanceIds、result、inputKind/sourceKind、两侧哈希、原始/编码压缩尺寸、分辨率、源/处理帧率、耗时、装配/源码版本、环境、proofRefs、notes。未知或未执行的测量字段为 null，不能填写推测值。
- 响应：runId、caseId、stored=true；仅表示记录已保存，不代表测试本身通过。
- 权限/幂等：真实云桌面已执行结果只能记录用户实际执行；NOT_RUN 的 executedBy=null，不暗示任何人已运行。mock 只属于 unit_integration；runId+caseId 标识同一次执行，不覆盖旧证据，修订用新 caseId/运行 ID。
- 完整性：file_roundtrip 声称 PASS 必须有两侧相等 SHA-256、样本字节数、耗时及实际证据；negative_or_lifecycle 用例按预期失败行为可 PASS，无文件时哈希为 null。性能没有阈值只报告 measurement，不宣称性能目标 PASS。
- 超时/重试：本地写证据失败不得自动将用例记通过；修复位置后可保存同一记录。数据不一致需重新运行，不能只改哈希字段。
- 码：0、10001/10002/10003、11004、17001～17003、90001。
- 示例：`evidence.record-request` / `evidence.record-success`；所有示例 PASS 和证明路径均为语法占位，不是运行证据。

## JSON Schema 之外的强制检查

| 编号 | 运行时或交付检查 | 责任 |
|---|---|---|
| C-01 | 原生 File、ArrayBuffer、Blob 类型、长度/metadata 一致；视频请求必有对应 File；其他操作不得附多余 payload | M01/M05/M06 |
| C-02 | width×height×4 为安全整数且精确匹配真实缓冲；像素与产物总量不超 profile | M05/M06 |
| C-03 | 会话/Worker 对象身份、递增帧序号和一帧在途；无论退出路径均只结算一次槽位 | M02/M05 |
| C-04 | 真实用户激活栈和选择器调用顺序；点击后不可先 await | M01/M02/M07 |
| C-05 | 请求去重参数包括原生 File 对象身份；active 和最近终态去重记录不持有已释放文件/像素 | M02 |
| C-06 | 终态前资源归属与清理，迟到流关闭；IO 未收敛不能宣称 Stopped | M02/M03/M04/M07 |
| C-07 | 资源同源、无路径上跳、摘要匹配和严格 EOF 报告对应相同二进制；报告引用不能只是自述布尔值 | 装配/M06 |
| C-08 | C 返回值按符号解释，BigInt 截取 uint32 后转十六进制，堆复制后再释放 | M06 |
| C-09 | 严格正常结束与错误/截断区分；EOF 排空不能抢在最终帧结果前；保存重试不复用已耗解压器 | M02/M06/M07 |
| C-10 | Snapshot 内身份/计数/在途/状态一致；source.ended 来源类型与 reason 匹配 | M02/M05 |
| C-11 | 外层 code、error.code/name/retryAction 与登记表对应；未知原生原因不伪装具体错误 | 所有适配层 |
| C-12 | SHA-256 跨字段相等、证据路径真实存在且运行范围匹配；mock/本地/现场分层 | M08 |

JSON Schema 校验通过只证明元数据结构；不能证明用户授权、真实字节、消息时序、磁盘 IO 或产品功能通过。接口没有分页、乐观数据库锁或后台重试队列需求，不添加这些能力。

## AC 与模块/接口追踪

| AC | 模块 / 接口 | 关键判据 |
|---|---|---|
| AC-001 | M01/M03/M05；IF-001/IF-002/IF-006 | 用户实际选择窗口并取得有效帧 |
| AC-002 | M06；IF-005/IF-006 | 足量数据、严格解压结束后才交付完整产物 |
| AC-003 | M07；IF-008/IF-009 | 写入与 close 成功及明确原名/重名行为 |
| AC-004 | M08；IF-010 | 最终保存文件与原文外部 SHA-256 相等 |
| AC-005 | M08；IF-010 | 静态、mock、模拟和现场范围独立，NOT_RUN 不改 PASS |
| AC-006 | M02/M03/M04；IF-002/IF-007/IF-009 | 取消、无数据、源中断不假成功 |
| AC-007 | M02/M05/M06；IF-004/IF-009 | 全新实例、旧身份隔离、资源清理完成后才重启 |
| AC-008 | M04/M05/M06；IF-006/IF-007 | 媒体失败与 EOF 排空；15012 不完整压缩输入不能当结束 |
| AC-009 | M07；IF-008/IF-009 | 同一 Blob、新点击重试；pending 不盲目重复写入 |
| AC-010 | M08；IF-010 | 本地原发送端与新接收端真实双输入全功能模拟 |
| AC-011 | M08；IF-010 | 用户真实云桌面结果独立记录，无模拟替代 |
| AC-012 | M05/M06/M08；IF-005/IF-010 | profile 与原始/压缩尺寸、帧率、耗时记录；阈值后测 |
| AC-013 | 装配/M06；IF-001/IF-005 | 最小变更、旧发送兼容、严格 EOF 装配及必要修正说明 |
| AC-014 | M04/M06；IF-002/IF-006/IF-007 | 支持录像成功解码并保存，逐格式做哈希 E2E |

# 异常码矩阵

登记源：[error-codes.json](contracts/error-codes.json)。仅用于新接收端及其测试交接；既有 C 负值保留在 details。0=正常请求/事件，no_data、忙碌丢采样、旧消息丢弃、性能阈值未冻结不新增故障码。

号段：10000～10999 共用参数/协议；11000～11999 会话；12000～12999 抓屏；13000～13999 录像；14000～14999 帧；15000～15999 解码；16000～16999 保存；17000～17999 测试证据；18000～18999 资源装配；90000～90999 未分类内部异常。53 项登记包含正常取消和非终态提示，不把所有条目视作致命异常。新增统一编号方式为本期设计假设，不改变已有组件编号。

16009 是 pending 提示，不能把 still-saving 变成终态 failure，不能据此自动重写。12002 不能可靠细分为“取消”或“明确拒绝”，提示如实保留两种可能。原生 scan 返回 -3 是未提取到码的正常 no_data，不能映射成 RECOVERY_FAILED；0 同理。fountain 返回 -5 对应 15005。get_filename/recover 负值对应 15006；decompress 负值/已知 zstd 错误对应 15007，明确截断对应 15012。

日志只记录会话/请求标识、阶段、状态、预算、尺寸和原生异常名/码，不写文件内容、整帧像素或原始解码字节。告警建议指开发/测试报告和可复现问题收集，不新增在线告警服务。

| 所属模块 | 错误码 | 错误名称 | 分类/触发场景 | 用户提示 | 重试 | 调用方处理 | 日志级别 | 告警建议 |
|---|---|---|---|---|---|---|---|---|
| common | 10001 | INVALID_REQUEST | parameter：字段缺失、类型错误、越界或未知字段 | 输入参数无效 | 修正输入 / fix_input | 拒绝且不改变会话 | warn | 仅反复复现时报告 |
| common | 10002 | CONTRACT_VERSION_UNSUPPORTED | parameter：元数据 version 不是 1 | 接收组件版本不兼容 | 更新组件 / fix_input | 拒绝混合版本 | error | 装配检查失败 |
| common | 10003 | UNSUPPORTED_OPERATION | parameter：op 不在冻结动作集合 | 不支持该操作 | 修正调用 / fix_input | 拒绝未知动作 | warn | 集成时报告 |
| common | 10004 | USER_ACTIVATION_REQUIRED | permission：抓屏或保存请求缺少有效用户动作 | 请点击按钮后重试 | 新点击 / new_click | 不在异步后台自动重试 | info | 无需告警 |
| session | 11001 | SESSION_NOT_FOUND | state：目标会话未创建且没有可返回的终态记录 | 接收会话不存在 | 新建会话 / fix_input | 不得作用于另一个活动会话 | info | 无需告警 |
| session | 11002 | SESSION_BUSY | business：新开始请求到来时已有活动或未收敛会话 | 请先结束当前接收 | 停止后新建 / fix_input | 不弹出第二个抓屏选择器 | info | 无需告警 |
| session | 11003 | ILLEGAL_STATE | state：已知操作在当前状态不合法 | 当前状态不能执行此操作 | 等待合法状态 / fix_input | 返回当前状态供查询 | warn | 重复复现时报告 |
| session | 11004 | REQUEST_ID_CONFLICT | consistency：去重窗口内同一 requestId 对应不同元数据或对象身份 | 操作标识冲突 | 使用新标识 / fix_input | 拒绝且不重放副作用 | error | 集成检查失败 |
| session | 11005 | SESSION_CHANGED | state：用户命令指向已被替换的旧会话 | 接收会话已改变 | 重新查看会话 / fix_input | 不影响新会话；迟到内部事件直接丢弃不报此错 | info | 无需告警 |
| live | 12001 | CAPTURE_UNSUPPORTED | dependency：安全上下文或屏幕捕获能力不可用 | 当前环境不支持抓屏 | 更换已验证环境 / new_session | 禁止开始实时输入 | warn | 能力矩阵记录 |
| live | 12002 | CAPTURE_NOT_ALLOWED | permission：捕获 API 返回 NotAllowedError，可能是取消或拒绝 | 未获得抓屏权限 | 新点击 / new_click | 清理初始化资源；不假定用户明确拒绝 | info | 无需告警 |
| live | 12003 | CAPTURE_UNREADABLE | dependency：捕获 API 返回 NotReadableError 或 AbortError | 无法读取所选画面 | 重新选择 / new_session | 终止当前初始化并释放所得资源 | warn | 复现后附环境记录 |
| live | 12004 | CAPTURE_SOURCE_NOT_FOUND | dependency：捕获 API 返回 NotFoundError | 没有可用捕获来源 | 准备窗口后重试 / new_session | 保留重新开始入口 | info | 无需告警 |
| live | 12005 | CAPTURE_SOURCE_ENDED | business：接收未完成时系统捕获轨道自然 ended | 画面共享已结束 | 新建会话 / new_session | 清理；不能转成接收成功 | info | 记录现场来源状态 |
| live | 12006 | CAPTURE_CONTEXT_INVALID | state：已确认有用户动作但捕获 API 返回 InvalidStateError | 抓屏窗口状态不可用 | 聚焦后新点击 / new_click | 清理当前初始化；不误报解码错误 | info | 重复时记录浏览器版本 |
| video | 13001 | VIDEO_UNSUPPORTED | parameter：实际容器或编码不在支持矩阵且无法解码 | 该录像格式暂不支持 | 选择支持录像 / fix_input | 拒绝并释放媒体对象 | info | 兼容矩阵记录 |
| video | 13002 | VIDEO_DECODE_FAILED | dependency：已打开的视频在实际读取中出现媒体解码错误 | 录像读取失败 | 更换或重新录制 / new_session | 停止并清理当前输入 | warn | 保存媒体错误名与参数 |
| video | 13003 | VIDEO_READY_TIMEOUT | dependency：元数据或首帧未在 videoReadyTimeoutMs 内就绪 | 录像加载超时 | 重新导入 / new_session | 不进入无限等待 | warn | 重复时检查文件与环境 |
| video | 13004 | VIDEO_INCOMPLETE | business：EOF 最终补采与工作排空后没有完整文件 | 录像结束但文件未收全 | 提供更完整录像 / new_session | 标记未完成；不自动循环重放 | info | 记录帧数和媒体时长 |
| video | 13005 | VIDEO_METADATA_INVALID | parameter：视频宽高无效或时长不是可处理的有限值 | 录像信息无效 | 更换录像 / fix_input | 拒绝输入并清理 | info | 记录输入元数据 |
| frame | 14001 | FRAME_LAYOUT_INVALID | parameter：像素格式非 RGBA 或长度不等于宽乘高乘4 | 画面帧格式无效 | 修正适配器 / fix_input | 不调用 WASM | error | 集成检查失败 |
| frame | 14002 | FRAME_BUDGET_EXCEEDED | business：自然像素数超过当前安全预算 | 画面尺寸超过当前接收范围 | 选择较小窗口 / fix_input | 不静默缩放；保持尺寸证据 | info | 测量后校准预算 |
| frame | 14003 | FRAME_PROCESS_TIMEOUT | dependency：单帧操作超过 frameTimeoutMs | 画面处理超时 | 新建会话 / new_session | 终止旧 Worker；不重发同一帧 | warn | 记录耗时与环境 |
| frame | 14004 | FRAME_COPY_FAILED | internal：Canvas 读取或原生载荷复制失败 | 无法读取画面像素 | 新建会话 / new_session | 不提交不完整缓冲 | warn | 保留异常名和尺寸 |
| frame | 14005 | FRAME_ORDER_VIOLATION | consistency：当前有效 Worker 收到非递增 frameId 或并发第二帧 | 帧处理顺序异常 | 修正调度器 / fix_input | 拒绝副作用并终止故障会话 | error | 集成检查失败 |
| decoder | 15001 | WASM_INIT_FAILED | dependency：JS/WASM 加载或实例化失败但不是资源缺失或 ABI 错误 | 解码器初始化失败 | 修复装配后重试 / fix_assets | 清理捕获和 Worker | error | 装配验证失败 |
| decoder | 15002 | WASM_EXPORT_MISSING | dependency：已加载模块缺少冻结接收导出 | 解码器组件不完整 | 换成匹配产物 / fix_assets | 禁止接收，不回落 asm.js 编码包 | error | 装配检查失败 |
| decoder | 15003 | WASM_RUNTIME_FAILED | internal：处理期间发生 WASM trap 或非分配类 runtime abort | 解码器运行失败 | 新建会话 / new_session | 终止实例并丢弃未完整产物 | error | 重复时收集可复现样本 |
| decoder | 15004 | WASM_ALLOCATION_FAILED | internal：malloc 返回空或 WASM 堆分配失败 | 接收内存不足 | 降低画面或文件规模 / new_session | 终止实例且不输出半文件 | error | 记录预算和样本尺寸 |
| decoder | 15005 | FOUNTAIN_CHUNK_INVALID | consistency：有效 scan 长度不符合当前块边界或 fountain 返回 -5 | 编码块不符合接收参数 | 检查模式后新建 / fix_input | 不继续累积该会话 | error | 集成与模式检查 |
| decoder | 15006 | RECOVERY_FAILED | consistency：完成标识后文件恢复或取名中的恢复步骤返回负值 | 文件重建失败 | 新建会话 / new_session | 不创建可保存产物 | warn | 附 C API 符号和原码 |
| decoder | 15007 | DECOMPRESS_FAILED | consistency：底层 zstd 报错或导出报告解压错误 | 文件解压失败 | 新建会话 / new_session | 拒绝发布 Blob；不能把错误当 EOF | warn | 负向装配测试必验 |
| decoder | 15008 | ARTIFACT_BUDGET_EXCEEDED | business：累计解压输出超过 maxArtifactBytes | 文件超过当前接收容量 | 较小文件或测量后调整预算 / fix_input | 中止并丢弃部分输出 | info | 容量测量记录 |
| decoder | 15009 | WASM_ABI_MISMATCH | dependency：int64 结果不是 BigInt 或必要堆/接口 ABI 不匹配 | 解码器版本不匹配 | 修复装配 / fix_assets | 禁止把结果强转 Number 继续使用 | error | 装配检查失败 |
| decoder | 15010 | WORKER_CHANNEL_FAILED | dependency：Worker error 或 messageerror 导致当前协议无法继续 | 解码通信中断 | 新建会话 / new_session | 释放当前在途槽并终止实例 | error | 重复时记录浏览器版本 |
| decoder | 15011 | WASM_INIT_TIMEOUT | dependency：解码实例在 initTimeoutMs 内未就绪 | 解码器加载超时 | 检查组件后新建 / fix_assets | 清理迟到结果和捕获轨道 | warn | 初始化耗时记录 |
| decoder | 15012 | DECOMPRESS_INCOMPLETE | consistency：压缩输入耗尽但尚未确认 zstd 完整帧和输出排空 | 压缩数据不完整 | 新建会话 / new_session | 不能把零输出视为正常完成 | warn | 截断输入负向测试必验 |
| save | 16001 | SAVE_UNSUPPORTED | dependency：缺少当前基线所需保存选择器能力 | 当前浏览器不支持此保存方式 | 更换已验证环境 / new_session | 不回落为无法确认完成的隐式下载 | warn | 能力矩阵记录 |
| save | 16002 | SAVE_CANCELLED | permission：保存选择器返回 AbortError 且尚未写入 | 保存已取消，可再次保存 | 新点击 / retry_save | 保留当前 Blob，不重新解码 | info | 无需告警 |
| save | 16003 | SAVE_PERMISSION_DENIED | permission：保存选择或写入返回明确权限拒绝 | 没有所选位置的写入权限 | 新位置或新授权 / retry_save | 保留 Blob，未关闭成功不标保存完成 | info | 无需告警 |
| save | 16004 | SAVE_FILE_LOCKED | dependency：创建写入流返回明确锁定异常 | 文件正被占用 | 稍后或新位置 / retry_save | 保留 Blob 并允许新尝试 | info | 无需告警 |
| save | 16005 | SAVE_WRITE_FAILED | dependency：创建写入流或写入数据失败，且不属于权限或锁定 | 文件写入失败 | 新位置重试 / retry_save | 清理写入尝试并保留 Blob | warn | 记录失败阶段 |
| save | 16006 | SAVE_CLOSE_FAILED | dependency：数据写入后 close 失败 | 保存尚未完成 | 写入收敛后新尝试 / retry_save | 不能标记已保存；保留 Blob | warn | 记录失败阶段 |
| save | 16007 | ARTIFACT_NOT_READY | state：当前会话没有可用完整 Blob | 尚无可保存的完整文件 | 等待重建或新建 / wait | 不打开保存选择器 | info | 无需告警 |
| save | 16008 | SAVE_BUSY | state：一个写入或保存选择器尚未收敛又请求保存 | 当前保存仍在进行 | 等待当前尝试结束 / wait | 不创建第二个保存副作用 | info | 无需告警 |
| save | 16009 | SAVE_OUTCOME_PENDING | dependency：写入或关闭超过提示期限但底层尚未返回 | 保存结果尚未确认，请等待 | 只等待或请求停止 / wait | 不是终态失败；禁止自动重复写入，等待实际收敛 | warn | 记录 pending 时长 |
| evidence | 17001 | HASH_MISMATCH | consistency：外部核验原文与最终保存文件 SHA-256 不同 | 文件一致性验证失败 | 重新接收并复验 / revalidate | 将该正确性用例记 FAIL | error | 阻止该用例通过 |
| evidence | 17002 | EVIDENCE_MISSING | consistency：声称通过所需的环境、运行或哈希证据缺失 | 验证证据不完整 | 补实际证据 / revalidate | 不接受无证据 PASS | warn | 阻止报告通过 |
| evidence | 17003 | VALIDATION_SCOPE_CONFLICT | consistency：将模拟或 mock 结果声明为真实云桌面或本地全功能实测 | 验证范围与证据不符 | 修正报告 / revalidate | 拒绝错误范围声明 | error | 交付检查失败 |
| assets | 18001 | ASSET_MISSING | dependency：清单所需 JS/WASM 文件缺失或本地读取404 | 缺少接收组件 | 重新装配 / fix_assets | 禁止初始化 | error | 装配检查失败 |
| assets | 18002 | ASSET_DIGEST_MISMATCH | consistency：文件校验值与已固定装配清单不同 | 接收组件校验不一致 | 重新装配 / fix_assets | 拒绝混用来源 | error | 装配检查失败 |
| assets | 18003 | ASSET_PAIR_INCOMPATIBLE | consistency：JS/WASM 非同一套或严格 EOF 验证证据不满足 | 接收组件不兼容 | 匹配源码构建并验证 / fix_assets | 不声称现成 WASM 直接可用 | error | 装配检查失败 |
| common | 90001 | UNEXPECTED_INTERNAL | internal：未归类异常且不能安全继续当前动作 | 操作未完成，请重新开始 | 按现场状态决定 / new_session | 保留内部诊断，不伪造业务原因 | error | 可复现时报告 |


# Assumptions And Open Questions

无新增待用户回答的需求 P0。两项工程假设须在交接时显式保留：新接收端独立号段/内部协议版本；可调整的初始安全预算与看门狗。严格 EOF 是满足已确认正确性要求的必要兼容条件，可能引起小范围解压适配修正和 WASM 重建，不能承诺原发布二进制直接复用。

已批准后测项 V-001～V-004 继续有效。当前产品实现、WASM 装配、正常/损坏/截断运行验证、本地全功能模拟、真实云桌面与容量性能测量均 NOT RUN。

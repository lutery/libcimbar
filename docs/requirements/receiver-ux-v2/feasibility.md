# 代码与可行性核验

日期：2026-10-23；基线`9e4fbc46965de42b9b0097ad80c607d71c7303f0`。结论：**可优先复用现有接口增强反馈；精确文件完成百分比与有效文件字节速度不应直接由现有指标推导。** 本文件是阶段1取证，不是系统设计或产品测试通过记录。

## 现状与原因

| 证据 | 当前行为与体验影响 |
|---|---|
| `web/desktop-recv/index.html` | 英文按钮、单行status、产物信息与日志，没有独立接收反馈/速度/进度区域 |
| `web/desktop-recv/src/ui.js`的status_text | Receiving统一显示Receiving frames，未区分有图像、识别到码、收到重复数据、收集新块等事实 |
| `web/desktop-recv/worker/decoder-worker.js:309,329,340` | 每帧已有no_data/data/artifact及bytesDecoded，但桌面worker未调用现有get_report |
| `web/desktop-recv/src/session.js:324`的_onFrameResult | data/no_data分支未更新接收指标，也没有为它们发出新的snapshot；仅在artifact或错误时处理 |
| `web/desktop-recv/src/app.js`的render/noDataHint | 5秒提示依赖render再次发生；目前非artifact数据不持续触发render。计时基于Receiving起点且没有按真正新数据重置，不能直接作为“最近无新增”的判断 |
| `web/desktop-recv/src/frame-scheduler.js` | submitted/completed/dropped/failed是帧调度统计；completed不等于成功识别码或收到新数据 |
| `web/desktop-recv/src/video-source.js:30`的snapshot | 已有视频位置和总时长，可显示录像处理位置，但不是文件重建进度；逐帧提交结果可携带更新 |

## 可以复用的进度通道

- `src/lib/cimbar_js/cimbar_recv_js.h:10`声明`cimbard_get_report`；CMakeLists.txt:74已有WASM导出。
- `cimbar_recv_js.cpp:127`按实际长度复制report，没有承诺零结尾；读取必须使用返回长度。
- 同文件:214在fountain_decode后写入`[ ... ]`比例报告。图像扫描也写同一report缓冲，因此应在fountain_decode之后按正确阶段读取，不能把任意时刻的调试文本当JSON进度。
- `src/lib/fountain/fountain_decoder_sink.h:116`返回每个活动stream的`progress / blocks_required`；容器是unordered_map，报告没有stream ID。
- `FountainDecoder.h`以_seenBlocks集合去重，progress是不同块ID的计数，不是已确认恢复的原始文件字节数；`fountain_decoder_stream.h`的blocks_required是内部基准，不是完成承诺。
- 现有`web/recv.js`已读取report并画比例条；它是复用路径的代码证据，其旧展示语义不直接作为本轮正确性标准。

## 本轮实际执行

执行：`node docs/requirements/receiver-ux-v2/probes/report-capability.cjs`，exit0。

使用交付包`product/libcimbar-desktop-receiver-1.0.0-20261022-2252/vendor`的真实JS/WASM，Mode B，直接注入带FountainMetadata的合成数据包。未改文件、未加载新界面、未启动抓屏。

| 输入 | 真实report |
|---|---|
| 初始化 | 空字符串，长度0 |
| 流3首个数据块 | `[0.030303]` |
| 重复同一数据块 | `[0.030303]`，不前进 |
| 同流下一个块 | `[0.0606061]`，前进 |
| 再引入流4 | `[0.030303,0.0606061]`，无ID且顺序不应被当作稳定身份 |

真实导出可调用，Mode B chunkSize=625；重复不前进、新块前进、多流无身份均已核验。结果保存于[实际输出](probes/report-capability-result.json)。这证明指标通道具备复用可行性，不证明图像识别场景、完整重建、最终展示或现场体验已验收。

## 建议指标与边界（待范围确认）

| 用户要知道 | 可支持的反馈 | 必须满足的含义 |
|---|---|---|
| 是否在接收 | 等待有效数据、已识别到数据、近期有新增、近期无新增等分层状态 | 有视频帧不等于有可解码数据；有重复数据不等于取得新进展 |
| 速度 | 基于近期`bytesDecoded`和单调时钟计算“数据识别速率”，清楚说明含协议/冗余数据 | 不能叫原文件有效字节速度；停止到帧时也要能衰减到0或暂无样本，不能永久保留最后高值 |
| 进度 | 唯一可判定活动流时显示“重建进度估计” | 未完成重建/严格EOF之前，不得显示文件已完成；比例达到/超过1时仍可能需要数据，不伪造线性进度或倒计时 |
| 报告缺失或多流 | 活动/已用时仍可展示，进度显示暂不可判定 | 不按max/sum或数组首项冒认当前文件，不沿用其他流的百分比；不得因遥测不可用阻断正常接收 |
| 录像处理 | 独立的媒体位置/时长或“正在处理录像” | 播放/处理到尾部不是文件成功；EOF未重建必须如实未完成 |
| 下一步操作 | 明确可保存、保存中、已保存、取消/失败可重试 | 产物完成与磁盘保存完成分开，成功只来自原完成条件 |

## 最小影响判断

建议首轮只接通现有report和逐帧结果、增加会话遥测及展示；原发送端、码制、纠错/重建算法、严格EOF、单在途调度和系统保存流程保持现有契约。默认不需要新增C++导出或重建WASM；实施时仍须验证所用资产是否含可用report导出，缺失时降级显示。准确的去重有效字节吞吐/带身份的多流快照若将来确有需求，再单独评估结构化核心接口。

当前尚未冻结UI布局、刷新节流与无新增提示阈值；这些属于阶段2设计及后续实测。单调时钟/低频重绘只用于遥测，不借此重写接收状态机或重触发媒体选择器。

## 本轮后续必须验证的真实场景

实际抓屏等待→开始发送→重复/静止画面→继续有效码流；短时遮挡/最小化→恢复；真实停止/切换会话→新数据；录像正常/截断/多流输入；文件可保存→取消后重试→外部哈希相等。保留原大样本与含保存量测基线；先本地真实操作，再用户云桌面体验。具体步骤和阈值在阶段4.x冻结，不用本探针替代这些验收。

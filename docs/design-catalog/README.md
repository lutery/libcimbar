# 云桌面宿主机接收端设计目录

阶段 2 系统设计，2026-10-18。需求问题已解决；本阶段采用独立本地浏览器接收应用，支持实时抓屏和录像导入，复用现有 WASM 与原发送端/协议。接收应用运行在云桌面客户端所在的宿主机。

核心边界：一次一个文件；全新解码实例隔离会话；停止清理并防止旧消息串入；完整产物与保存尝试分离，保存失败可重试；先本地同机全功能模拟，再由用户真实云桌面验收。浏览器选择是本阶段设计决定，不将 EXE 安装包或多套兜底加入范围。

当前源码和文档检查不等于产品验证：WASM 装配、本地全功能模拟、真实云桌面、性能容量均 NOT RUN。版本/规模/性能按用户批准策略先测再确认。

## 阅读导航

| 文档 | 内容 |
|---|---|
| [需求与热点](requirements.md) | 目标、用户约束、FR/NFR/AC 与 H-CAP/H-VIDEO/H-MEM/H-ASSET/H-PERF/H-SAVE |
| [架构与决策](architecture.md) | 模块边界、双输入、状态隔离、内存/保存、独立装配、14 AC 验证落点 |
| [证据索引](sources.md) | 当前源码、Context7 / MDN 文档、未验证边界 |
| [设计 Todo](todo.md) | 五阶段进度与 QA |
| [设计 QA](qa.md) | 11 图语法、嵌入、链接、AC 追踪及未运行项目 |
| [模块契约与错误矩阵](module-contract-error-matrix.md) | 阶段 2.5：8 个模块、10 个接口、53 项码及严格解压适配门槛 |
| [机器可读契约](contracts/README.md) | 元数据 schema、73 个合成样例、初始安全配置、错误登记与契约 QA |
| [契约检查](contracts-qa.md) | schema、33 个结构负向样例、53 项码、10 接口和 14 AC 的检查证据 |
| [交付路线图](../plans/roadmap.md) | 阶段3：5 Epic、10 Story、24 Task及本地先于现场的验收与交付计划 |
| [已确认需求](../requirements/requirements-spec.md) | 6 FR、8 NFR、14 AC、4 个后测验证项 |
| [流水线状态](../dev-pipeline/pipeline-state.json) | 阶段 2 与后续阶段确认门 |

下方全文嵌入全部 11 张 Mermaid 图，同时保留独立源文件。ERD 为概念对象关系，不表示新增数据库。

## 全局事件时间线

[Mermaid 源文件](big-picture.mmd)

```mermaid
flowchart LR
  classDef event fill:#ff9800,stroke:#e65100,color:#000
  classDef command fill:#2196f3,stroke:#0d47a1,color:#fff
  classDef actor fill:#ffeb3b,stroke:#f57f17,color:#000
  classDef system fill:#9c27b0,stroke:#4a148c,color:#fff
  classDef aggregate fill:#4caf50,stroke:#1b5e20,color:#fff
  classDef policy fill:#00bcd4,stroke:#006064,color:#fff
  classDef hotspot fill:#f44336,stroke:#b71c1c,color:#fff
  Sender["发送操作者"]:::actor --> Send["运行原项目发送端"]:::command
  Send --> Displayed["cimbar 动画已显示"]:::event
  Displayed --> Source["云桌面客户端窗口或已录录像"]:::system
  User["宿主机接收操作者"]:::actor --> Start["开始实时抓屏或导入录像"]:::command
  Start --> Session["单文件接收会话"]:::aggregate
  Source --> Selected["输入源已选定"]:::event
  Session --> Selected
  Selected --> Frames["画面帧已获取"]:::event
  Frames --> Decode["使用原 WASM 解码与重建"]:::policy
  Decode --> Ready["完整文件已重建"]:::event
  Ready --> Artifact["会话内不可变文件产物"]:::aggregate
  Artifact --> Save["点击保存文件"]:::command
  Save --> Saved["写入已关闭并完成"]:::event
  Saved --> Check["外部核对 SHA-256"]:::command
  Check --> Matched["原文与接收文件一致已验证"]:::event
  Validator["实施执行方随后交付用户现场验收"]:::actor --> Check
  Selected -.-> H1["? H-CAP / H-VIDEO 实际画面与格式"]:::hotspot
  Decode -.-> H2["? H-ASSET / H-MEM / H-PERF 装配与测量"]:::hotspot
  Save -.-> H3["? H-SAVE 保存能力与权限"]:::hotspot
```

## 关键流程：实时抓屏

[Mermaid 源文件](processes/process-live.mmd)

```mermaid
flowchart TD
  classDef event fill:#ff9800,stroke:#e65100,color:#000
  classDef command fill:#2196f3,stroke:#0d47a1,color:#fff
  classDef actor fill:#ffeb3b,stroke:#f57f17,color:#000
  classDef system fill:#9c27b0,stroke:#4a148c,color:#fff
  classDef aggregate fill:#4caf50,stroke:#1b5e20,color:#fff
  classDef hotspot fill:#f44336,stroke:#b71c1c,color:#fff
  U["接收操作者"]:::actor --> C["点击开始实时接收"]:::command
  C --> S["创建新会话并直接发起系统源选择"]:::aggregate
  S --> P["浏览器显示选择与授权"]:::system
  S --> W["新建独立 Worker / WASM"]:::system
  P --> A{"源选择成功且会话仍有效？"}
  A -->|否| Cleanup["关闭迟到流及初始化资源"]
  Cleanup --> Cancel["已取消或初始化失败"]:::event
  A -->|是| Both{"输入与解码器均就绪？"}
  W --> Both
  Both -->|初始化失败| Cleanup
  Both -->|是| F["按自然尺寸采样 RGBA"]
  F --> Busy{"已有在途帧？"}
  Busy -->|是| Drop["跳过本次采样并计数"]
  Drop --> F
  Busy -->|否| D["提交一帧并等待处理结果"]
  D --> Done{"完整产物已就绪？"}
  Done -->|否且输入可用| F
  Done -->|是| Ready["停止输入并保留文件待保存"]:::event
  D -->|用户停止或源中断| Stop["使会话失效并清理资源"]
  Stop --> End["已停止或输入已中断"]:::event
  F -.-> H["? H-CAP 黑屏与压缩信号需实测"]:::hotspot
```

## 关键流程：录像与 EOF

[Mermaid 源文件](processes/process-video.mmd)

```mermaid
flowchart TD
  classDef event fill:#ff9800,stroke:#e65100,color:#000
  classDef command fill:#2196f3,stroke:#0d47a1,color:#fff
  classDef actor fill:#ffeb3b,stroke:#f57f17,color:#000
  classDef system fill:#9c27b0,stroke:#4a148c,color:#fff
  classDef aggregate fill:#4caf50,stroke:#1b5e20,color:#fff
  classDef hotspot fill:#f44336,stroke:#b71c1c,color:#fff
  U["接收操作者"]:::actor --> C["导入本地录像"]:::command
  C --> S["新建单文件会话与独立解码实例"]:::aggregate
  S --> Open["媒体元数据与实际解码预检"]:::system
  Open --> Valid{"输入可读取？"}
  Valid -->|否| Error["取消或不支持或损坏状态已显示"]:::event
  Valid -->|是| Play["受控播放并获取呈现帧"]
  Play --> Frame["按媒体时间去重并暂停等待解码"]
  Frame --> D["同一 Worker 解码与重建"]:::system
  D --> Complete{"完整产物已就绪？"}
  Complete -->|是| Ready["停止媒体并保留产物待保存"]:::event
  Complete -->|否且未到 EOF| Play
  Play -->|媒体 ended| EOF["输入结束已记录"]:::event
  EOF --> Drain["不再取新帧并等待在途工作排空"]
  Drain --> Final{"最后处理结果完整？"}
  Final -->|是| Ready
  Final -->|否| Incomplete["录像已结束但文件未完整"]:::event
  Error --> Clean["释放媒体 URL 和 Worker 后可重试"]
  Incomplete --> Clean
  Frame -->|停止或媒体错误| Clean
  Play -.-> H["? H-VIDEO 回调遗漏与格式需验证"]:::hotspot
```

## 关键流程：保存与哈希

[Mermaid 源文件](processes/process-save.mmd)

```mermaid
flowchart TD
  classDef event fill:#ff9800,stroke:#e65100,color:#000
  classDef command fill:#2196f3,stroke:#0d47a1,color:#fff
  classDef actor fill:#ffeb3b,stroke:#f57f17,color:#000
  classDef system fill:#9c27b0,stroke:#4a148c,color:#fff
  classDef aggregate fill:#4caf50,stroke:#1b5e20,color:#fff
  classDef hotspot fill:#f44336,stroke:#b71c1c,color:#fff
  Ready["文件已重建且正常解压结束"]:::event --> Blob["当前会话不可变 Blob"]:::aggregate
  Blob --> U["接收操作者"]:::actor
  U --> C["点击保存或重试保存"]:::command
  C --> Picker["系统保存选择器与重名确认"]:::system
  Picker --> Selected{"选择成功？"}
  Selected -->|取消或拒绝| Retry["产物保留且可重试"]:::event
  Selected -->|是| Write["创建写入流并写入产物"]
  Write --> Close["关闭写入并等待结果"]
  Close --> OK{"写入和关闭均成功？"}
  OK -->|否| Retry
  Retry --> C
  OK -->|是| Saved["保存完成已确认"]:::event
  Saved --> Hash["外部核对 SHA-256"]:::command
  Hash --> Match{"两侧哈希一致？"}
  Match -->|是| Pass["文件正确性已验证"]:::event
  Match -->|否或证据缺失| Fail["失败或验收未完成"]:::event
  Blob -->|停止或重置| Clear["产物已释放且无跨会话续传"]:::event
  Write -->|停止请求| Settle["取消或等待写入收敛后清理"]
  Settle --> Clear
  Picker -.-> H["? H-SAVE 运行时能力与 IO 失败"]:::hotspot
```

## 关键流程：本地模拟与现场交接

[Mermaid 源文件](processes/process-acceptance.mmd)

```mermaid
flowchart TD
  classDef event fill:#ff9800,stroke:#e65100,color:#000
  classDef command fill:#2196f3,stroke:#0d47a1,color:#fff
  classDef actor fill:#ffeb3b,stroke:#f57f17,color:#000
  classDef system fill:#9c27b0,stroke:#4a148c,color:#fff
  classDef aggregate fill:#4caf50,stroke:#1b5e20,color:#fff
  classDef hotspot fill:#f44336,stroke:#b71c1c,color:#fff
  I["实施执行方"]:::actor --> Run["本地同机启动原发送端和新接收端"]:::command
  Run --> Sim["本地实际窗口与其录像"]:::system
  Sim --> Cases["双输入成功和异常及停止重启与保存重试"]
  Cases --> Evidence["两类数据哈希与测量证据已记录"]:::event
  Evidence --> Local{"本地适用功能用例通过？"}
  Local -->|否| Fix["接收端内整改与复验"]
  Fix --> Cases
  Local -->|是| Report["本地模拟结果已交付"]:::event
  Report --> User["用户现场验收人"]:::actor
  User --> Field["真实云桌面执行双输入与哈希测试"]:::command
  Field --> FieldResult["现场结果已单独记录"]:::event
  Evidence --> Perf["容量性能先报告测量值再确认范围"]
  Perf -.-> H["? H-PERF 阈值未冻结不得判性能 PASS"]:::hotspot
  Report --> Pending["现场未执行时保持 NOT RUN"]:::event
```

## 概念数据关系

[Mermaid 源文件](data/erd.mmd)

```mermaid
erDiagram
  RECEIVE_SESSION ||--o| INPUT_SOURCE : owns
  RECEIVE_SESSION ||--o| FILE_ARTIFACT : reconstructs
  FILE_ARTIFACT ||--o{ SAVE_ATTEMPT : allows
  VALIDATION_RUN ||--o{ CASE_EVIDENCE : records
  RECEIVE_SESSION ||--o{ CASE_EVIDENCE : observed_by
  RECEIVE_SESSION {
    string session_identity
    string input_kind
    string fixed_mode
    string lifecycle_state
  }
  INPUT_SOURCE {
    string source_kind
    string dimensions_and_timing
    string input_lifecycle
  }
  FILE_ARTIFACT {
    string suggested_basename
    string immutable_bytes
    string output_size
    string artifact_state
  }
  SAVE_ATTEMPT {
    string attempt_identity
    string outcome
    string write_close_result
  }
  VALIDATION_RUN {
    string environment_versions
    string local_or_real_cloud
    string timestamps_and_scope
  }
  CASE_EVIDENCE {
    string acceptance_id
    string status
    string sizes_and_frame_metrics
    string source_and_saved_sha256
  }
```

## 状态：接收会话

[Mermaid 源文件](data/state-session.mmd)

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Preparing: 开始并创建新会话
  Preparing --> Receiving: 输入与全新解码实例就绪
  Preparing --> Stopping: 取消或初始化失败或停止
  Receiving --> Receiving: 有效或无效帧与进度状态
  Receiving --> Draining: 录像输入已结束
  Receiving --> Reconstructing: 重建完成标识已返回
  Receiving --> Stopping: 源中断或用户停止或致命错误
  Draining --> Reconstructing: 排空后已满足重建
  Draining --> Incomplete: 排空且无完整文件
  Incomplete --> Stopping: 报告未完成并清理
  Reconstructing --> Ready: 正常解压结束且产物转交成功
  Reconstructing --> Stopping: 解压失败或用户停止
  Ready --> Saving: 显式点击保存
  Saving --> Saved: 写入及关闭成功
  Saving --> Retryable: 取消或保存失败
  Retryable --> Saving: 同会话重试保存
  Ready --> Stopping: 停止或重置
  Retryable --> Stopping: 停止或重置
  Saved --> Stopping: 结束或准备新会话
  Saving --> Stopping: 停止请求并等待写入收敛
  Stopping --> Stopped: 身份失效且所有资源已释放
  Stopped --> Preparing: 再次开始且不继承旧状态
  Stopped --> [*]: 页面关闭
```

## 状态：文件产物

[Mermaid 源文件](data/state-artifact.mmd)

```mermaid
stateDiagram-v2
  [*] --> Absent
  Absent --> Assembling: 获得完整重建标识
  Assembling --> ReadyBlob: 解压正常结束且 Blob 已移交页面
  Assembling --> Discarded: 解压错误或停止
  ReadyBlob --> Writing: 用户显式保存
  Writing --> SavedBlob: 写入和关闭均成功
  Writing --> RetryableBlob: 选择取消或 IO 失败
  RetryableBlob --> Writing: 使用同一 Blob 重试
  ReadyBlob --> Discarded: 停止或重置或退出
  RetryableBlob --> Discarded: 停止或重置或退出
  SavedBlob --> Discarded: 结束当前会话
  Writing --> Settling: 停止或退出请求
  Settling --> Discarded: 写入已取消或已收敛
  Discarded --> [*]
  note right of SavedBlob
    保存完成不等于 SHA-256 已核对
    已保存文件不会因清理而被删除
  end note
```

## 交互：实时启动与停止

[Mermaid 源文件](flows/sequence-live.mmd)

```mermaid
sequenceDiagram
  actor U as 接收操作者
  participant UI as 新接收页面
  participant S as 会话协调器
  participant B as 浏览器捕获与媒体
  participant W as 本会话解码 Worker
  U->>UI: 点击开始实时接收
  UI->>S: 建立新身份与固定模式
  UI->>B: 同一用户动作直接发起捕获选择
  S->>W: 创建全新 WASM 实例
  alt 用户选择成功且当前会话有效
    B-->>S: 捕获流
    W-->>S: 初始化完成
    S->>B: 绑定媒体并开始帧回调
    loop 直到完成或停止且每次至多一帧在途
      B-->>S: 自然尺寸呈现帧
      S->>W: 带会话身份的 RGBA 帧
      W-->>S: 进度或完整产物或错误
      S-->>UI: 更新当前会话状态
    end
  else 取消授权或初始化失败或身份已过期
    B-->>S: 失败或迟到的捕获流
    S->>B: 停止已取得 tracks 并断开媒体
    S->>W: 终止无效实例
    S-->>UI: 显示取消或错误
  end
  opt 用户停止或捕获源中断
    U->>UI: 停止
    UI->>S: 先使身份失效
    S->>B: 取消回调并停止流
    S->>W: 终止实例
    W-->>S: 迟到结果
    Note over S: 旧身份结果只丢弃不改变新会话
    S-->>UI: 已停止且可重新开始
  end
```

## 交互：录像排空与失败

[Mermaid 源文件](flows/sequence-video.mmd)

```mermaid
sequenceDiagram
  actor U as 接收操作者
  participant S as 会话与帧调度
  participant V as 本地视频媒体
  participant W as 全新解码 Worker
  U->>S: 选择录像并开始
  S->>V: 创建媒体 URL 并读取元数据
  S->>W: 创建独立 WASM 与固定模式
  alt 媒体与解码器可用
    loop 受控播放且每次等待一帧处理
      V-->>S: 呈现帧与媒体时间
      S->>V: 暂停以形成背压
      S->>W: 提交去重后的帧
      W-->>S: 当前帧结果
      S->>V: 未完成时继续处理后续帧
    end
    V-->>S: 输入 ended
    S->>V: 最终呈现帧尚未提交时有限补采一次
    S->>S: 停止新增提交并等待在途结果
    W-->>S: 最后一帧及解压结果
    alt 文件完整且正常解压结束
      S-->>U: 文件待保存
    else 工作排空仍无完整产物
      S-->>U: 录像结束但接收未完整
    end
  else 不支持或损坏或媒体处理失败
    V-->>S: 失败原因
    S-->>U: 当前录像无法处理且可重试
  end
  S->>V: 取消回调并释放媒体 URL
  S->>W: 产物移交或失败后终止实例
```

## 交互：保存与重试

[Mermaid 源文件](flows/sequence-save.mmd)

```mermaid
sequenceDiagram
  actor U as 接收操作者
  participant W as 解码 Worker
  participant S as 会话与产物管理
  participant B as 浏览器保存能力
  participant F as 本地文件
  participant H as 外部 SHA-256 验证
  W->>S: 正常解压完成并交付不可变产物
  S-->>W: 产物已接收
  S->>W: 释放实例
  S-->>U: 文件已重建且可保存
  U->>S: 点击保存文件
  S->>B: 在用户动作中打开保存选择器
  alt 用户选择且写入与关闭成功
    B->>F: 写入 Blob 并关闭
    F-->>B: 写入关闭成功
    B-->>S: 保存已完成
    S-->>U: 保存完成
    U->>H: 原文与已保存文件
    H-->>U: 哈希一致或不一致
  else 取消或权限拒绝或 IO 失败
    B-->>S: 保存未完成
    Note over S: 当前会话继续保有原 Blob
    S-->>U: 可重新保存而无需重新接收
    U->>S: 再次点击保存
    S->>B: 发起新的保存尝试
  end
  opt 写入期间请求停止
    U->>S: 停止
    S->>B: 尝试取消并等待写入结果收敛
    Note over S,F: 已提交文件不删除且结果如实记录
    S->>S: 清理会话产物并恢复可开始状态
  end
```

## 设计 QA 与下一步

设计覆盖 AC-001～AC-014；本地与现场结果分开。11 张图经 Mermaid 12.2.0 语法解析通过，独立源与本页嵌入一致，链接/编码/AC 追踪检查通过。语法检查不代表视觉渲染或产品运行验证，详见 [设计 QA](qa.md)。热点由已批准后测策略跟踪，不冒充通过。

本节点生效附加指令：新增宿主机双输入接收端；原发送端和协议复用，其余尽量不改；单文件、停止释放和保存重试；本地同机全功能测试先于用户现场；外部 SHA-256 和两类数据测量；容量性能先测后确认。

系统设计、阶段2.5契约和阶段3任务规划均已完成；具体任务与Claude续接见上述路线图。当前仅产出前段文档，未编写产品实现；writing-plans及以后由Claude管理，尚未启动。

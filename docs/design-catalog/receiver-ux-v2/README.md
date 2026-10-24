# 接收器体验 v2 — 系统设计目录

阶段2与2.5设计、阶段3路线图、阶段4实施计划及4.5 TDD规划已完成，待确认4.7真实E2E计划。基线：`9e4fbc46965de42b9b0097ad80c607d71c7303f0`。保留实时抓屏与录像导入两个独立入口，新增中文状态/时长/近期识别速率/重建估计。未修改产品代码。

## 从这里阅读

- [阶段2.5模块/接口/异常矩阵](module-contract-error-matrix.md)：六个内部动作、15项非致命诊断、时间窗口与所有权规则。
- [机器可读契约与样例](contracts/README.md) / [契约检查](contracts-qa.md) / [阶段2.5 Todo](contracts-todo.md)。
- [交互原型](prototype/index.html)：可直接打开，18种可切换演示状态；不采集屏幕、不读录像、不保存文件。
- [界面与状态说明](ui-spec.md)：沿用原深色/青色UI，双入口、录像位置、保存恢复及自适应安排。
- [架构与指标语义](architecture.md)：接线边界、速率/进度/时长口径、退化策略、生命周期及10条AC追踪。
- [设计输入与验证项](requirements.md)：已确认范围，H-01～04是后续技术验证项，无待用户回答的需求问题。
- [来源索引](sources.md) / [检查结果](qa.md) / [Todo](todo.md)。
- [已确认需求](../../requirements/receiver-ux-v2/requirements-spec.md) / [当前流水线](../../dev-pipeline/pipeline-state.json)。

## 设计摘要

既有会话仍决定何时接收、何时完成及保存；遥测只观察。进度来自可选WASM report，速度来自近期编码数据，录像位置独立。多流身份不明时不猜百分比，已有数据停止到达时速率自然归零。接收用时与保存耗时分开。

独立显示时钟不能触发抓屏/解码或系统选择器；新会话清零，旧结果与tick不能串入。活动预览保持可呈现以保护原录像逐帧回调。

## 图集合

以下9个Mermaid块与对应源文件全文一致；它们描述增量设计与既有行为的相关投影，不是新的实现或验收证明。

### 全局事件图

[独立源文件](big-picture.mmd)

```mermaid
flowchart LR
  A[宿主机使用者]:::actor --> C[选择实时抓屏或录像导入]:::command
  C --> B[浏览器源选择器]:::system --> E1[输入与解码器已就绪]:::event
  E1 --> S[接收会话]:::aggregate --> E2[帧结果已返回]:::event
  E2 --> T[会话遥测]:::aggregate --> P[投影中文状态与观测]:::policy
  P --> E3[反馈已更新]:::event
  E2 --> E4[完整产物已构造]:::event --> C2[点击保存文件]:::command
  C2 --> FS[系统文件选择与写入]:::system --> E5[文件已写入并关闭]:::event
  T -.-> H1[H-01 可选报告能力与解析]:::hotspot
  T -.-> H2[H-02 多流缺乏稳定身份]:::hotspot
  P -.-> H3[H-03 刷新开销待实测]:::hotspot
  P -.-> H4[H-04 窗口与可读性核验]:::hotspot
  classDef event fill:#ff9800,stroke:#e65100,color:#000
  classDef command fill:#2196f3,stroke:#0d47a1,color:#fff
  classDef actor fill:#ffeb3b,stroke:#f57f17,color:#000
  classDef system fill:#9c27b0,stroke:#4a148c,color:#fff
  classDef aggregate fill:#4caf50,stroke:#1b5e20,color:#000
  classDef policy fill:#00bcd4,stroke:#006064,color:#000
  classDef hotspot fill:#f44336,stroke:#b71c1c,color:#fff
```

### 接收反馈流程

[独立源文件](processes/process-receive.mmd)

```mermaid
flowchart TD
  A[Receiving会话已开始] --> B[当前seq的帧结果已返回]
  B --> C{真实artifact已构造?}
  C -->|是| R[沿原路径进入Ready]
  C -->|否| D{data且bytes有效?}
  D -->|否| W[记录帧活动 不增加识别字节]
  D -->|是| E[更新近期字节及最后data时点]
  E --> F{报告质量}
  F -->|唯一有效比例| G{已有歧义锁或比例回退?}
  G -->|否| K[记录观测比例及增长时点]
  G -->|是| H[本会话百分比不可判定]
  F -->|多流| H
  F -->|缺失或不可解析| U[本次百分比不可用]
  W --> T[独立低频显示时钟]
  K --> T
  H --> T
  U --> T
  T --> V[按业务优先级显示状态 用时 速率与估计]
  V --> N{停止或终结?}
  N -->|否| B
  N -->|是| Z[冻结接收用时并释放刷新器]
  H -.-> HS[H-02 不推测流身份]
  T -.-> HP[H-03 不触发额外抓帧]
```

### 录像位置与文件完成

[独立源文件](processes/process-video.mmd)

```mermaid
flowchart TD
  U[用户点击录像导入] --> O[真实文件选择与元数据检查]
  O -->|取消或无效| E[沿原规则提示与清理]
  O -->|就绪| R[Receiving与逐帧背压处理]
  R --> P[录像位置已更新]
  P --> I[独立显示媒体位置与码流重建估计]
  I --> A{真实artifact已构造?}
  A -->|是| S[Ready 提示保存 停止读取]
  A -->|否| F{媒体已结束?}
  F -->|否| R
  F -->|是| D[沿原EOF屏障排空及最后采样]
  D --> C{得到完整artifact?}
  C -->|是| S
  C -->|否| X[Incomplete 明确未完成]
  I -.-> H[H-01 遥测不可用时继续原接收]
```

### 保存与恢复

[独立源文件](processes/process-save.mmd)

```mermaid
flowchart TD
  A[真实文件已接收完成] --> R[Ready 显示文件信息及保存按钮]
  R --> C[用户点击保存文件]
  C --> P[真实系统选择器已打开]
  P -->|取消| K[文件保留 可再次保存]
  P -->|选择路径| W[写入并等待close]
  W -->|两步成功| S[Saved 文件已保存]
  W -->|失败| E[Retryable 显示恢复动作]
  W -->|等待较久| Q[保存尚未结束 不假报成功]
  Q --> W
  K --> C
  E --> C
  S --> N[可开始下一次接收]
  R -->|点击停止| T[沿原清理规则停止]
```

### 概念数据关系

[独立源文件](data/erd.mmd)

```mermaid
erDiagram
  RECEIVE_SESSION ||--|| RECEIVE_OBSERVATION : owns
  RECEIVE_OBSERVATION ||--o{ RATE_BUCKET : bounds
  RECEIVE_SESSION ||--o| MEDIA_POSITION : observes
  RECEIVE_SESSION ||--o| ARTIFACT : produces
  ARTIFACT ||--o{ SAVE_ATTEMPT : saves
  RECEIVE_SESSION ||--o| VIEW_PROJECTION : projects
  RECEIVE_SESSION {
    string sessionId
    int sessionSeq
    string inputKind
    string businessState
  }
  RECEIVE_OBSERVATION {
    int sessionSeq
    int observationRevision
    number receivingAt
    number lastDataAt
    number lastAdvanceAt
    number lastRatio
    string progressQuality
    boolean ambiguityLatched
    number endedAt
  }
  RATE_BUCKET {
    number timeInterval
    number recognizedBytes
  }
  MEDIA_POSITION {
    number positionSeconds
    number durationSeconds
  }
  ARTIFACT {
    string artifactId
    string suggestedName
    number byteCount
  }
  SAVE_ATTEMPT {
    string attemptId
    string saveStatus
    number lastError
  }
  VIEW_PROJECTION {
    string primaryText
    string secondaryText
    string progressPresentation
    string formattedRate
    string elapsedText
  }
```

### 只读观测状态

[独立源文件](data/state-observation.mmd)

```mermaid
stateDiagram-v2
  [*] --> Waiting: 进入Receiving
  Waiting --> Active: 首个data结果
  Active --> NoRecentData: 5秒无data且未在处理本帧
  NoRecentData --> Active: 新data且无歧义锁
  NoRecentData --> Unknown: 新data但进度不可判定
  Active --> NoAdvance: 有data但可信比例8秒未增长
  NoAdvance --> Active: 可信比例增长
  NoAdvance --> NoRecentData: 5秒无data且未在处理本帧
  Active --> Unknown: 无可用报告或流身份不明确
  NoAdvance --> Unknown: 报告不可判定
  Unknown --> Active: 有效单流恢复且无歧义锁
  Unknown --> NoRecentData: 5秒无data且未在处理本帧
  Unknown --> Unknown: 多流或回退锁定至本会话结束
  Waiting --> Frozen: 原业务状态已终结
  Active --> Frozen: 原业务状态已终结
  NoRecentData --> Frozen: 原业务状态已终结
  NoAdvance --> Frozen: 原业务状态已终结
  Unknown --> Frozen: 原业务状态已终结
  Frozen --> [*]
  note right of Unknown
    这是只读观察状态
    不修改业务Receiving或完成判据
  end note
```

### 既有完成与保存状态的相关投影

[独立源文件](data/state-completion.mmd)

```mermaid
stateDiagram-v2
  [*] --> Receiving
  Receiving --> Draining: 输入EOF
  Receiving --> Ready: 完整artifact
  Draining --> Ready: 完整artifact
  Draining --> Incomplete: 原屏障结束仍无artifact
  Ready --> Saving: 用户点击保存
  Saving --> Saved: write及close成功
  Saving --> Retryable: 取消或失败
  Retryable --> Saving: 用户再次点击保存
  Receiving --> Stopping: 用户停止或原错误收敛
  Draining --> Stopping: 用户停止
  Ready --> Stopping: 用户停止
  Stopping --> Stopped: 原清理完成
  Saved --> [*]
  Incomplete --> [*]
  Stopped --> [*]
  note right of Receiving
    展示原状态机的相关投影
    省略Preparing等无变更路径
    估计比例不会触发Ready
  end note
```

### 反馈交互与退化

[独立源文件](flows/sequence-feedback.mmd)

```mermaid
sequenceDiagram
  actor U as 使用者
  participant A as App与视图
  participant S as 会话与遥测
  participant W as 原Worker与WASM
  U->>A: 点击实时抓屏或录像导入
  A->>S: 原启动操作
  S->>S: 建立新seq及空遥测
  A->>A: 开始绑定seq的显示时钟
  loop 原单在途帧节奏
    S->>W: 提交当前帧
    W->>W: 原解码及可选report读取
    alt 正常data且单流报告有效
      W-->>S: 帧结果与观测
      S->>S: 更新有界窗口与比例
    else no_data或report缺失无效
      W-->>S: 原结果与不可用原因
      S->>S: 保留原业务结果 遥测降级
    end
    A->>S: 读取当前seq快照
    S-->>A: 业务状态与内部遥测
    A->>A: 按当前单调时间重绘反馈
  end
  alt 真实artifact完成
    S-->>A: Ready及真实产物
    A->>A: 冻结用时 释放显示时钟
    A-->>U: 文件已接收完成 请保存
  else 原EOF结算无产物或用户停止
    S-->>A: Incomplete或Stopped
    A->>A: 冻结用时 释放显示时钟
    A-->>U: 未完成或已停止及下一步
  end
```

### 会话隔离与保存恢复

[独立源文件](flows/sequence-isolation.mmd)

```mermaid
sequenceDiagram
  actor U as 使用者
  participant A as App与显示时钟
  participant S as SessionCoordinator
  participant W as 旧Worker
  participant V as SaveController与系统
  U->>A: 停止会话A
  A->>S: 原stop请求
  A->>A: 解除A的显示时钟
  S->>W: 原关闭及清理
  W-->>S: 迟到帧结果A
  S->>S: 按原seq规则拒绝旧观测
  S-->>A: cleanupComplete
  U->>A: 通过任一入口开始B
  A->>S: 原start请求
  S->>S: 创建新seq与零遥测
  A->>A: 创建B的显示时钟
  A->>A: 任何迟到A tick直接丢弃
  S-->>A: B的真实artifact完成
  A-->>U: 可保存
  U->>A: 点击保存文件
  A->>V: 原保存操作与用户激活
  alt 用户取消或写入失败
    V-->>S: cancelled或failed
    S-->>A: Retryable且保留artifact
    A-->>U: 明确可再次保存
  else write和close成功
    V-->>S: saved
    S-->>A: Saved
    A-->>U: 文件已保存
  end
```

## 下一阶段

[阶段3交付路线图](../../plans/receiver-ux-v2/roadmap.md)、[阶段4实施计划](../../plans/receiver-ux-v2/2026-10-24-receiver-ux-implementation.md)及[4.5测试规划](../../tests/receiver-ux-v2/README.md)已纳入10条AC、12类运行验证及H-03/04。[4.7真实操作计划](../../tests/receiver-ux-v2/e2e-user-journey-plan.md)已细化39旅程，本地32/用户现场7；[交接清单](../../tests/receiver-ux-v2/handoff.md)已确认通道A，Claude从阶段5实施。

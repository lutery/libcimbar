# 模块契约交付检查

日期：2026-10-18T10:35:04+08:00；基线 `84e7a1a`。只评价详细设计和元数据，不是产品运行通过。

| 检查 | 结果 | 当前证据 |
|---|---|---|
| Draft 2020-12 schema 自校验 | PASS | jsonschema 4.23.0，引用均在同一文件 |
| 合成元数据样例 | PASS | 73 项逐项通过；8 请求/响应动作与2事件、两种输入、53 项码及现场 NOT_RUN |
| 初始安全配置 | PASS | profile-initial.json 符合 Limits；预算/超时仍是待测初值，不是容量性能承诺 |
| 结构负向样例 | PASS | 33 项非法元数据被拒绝，包含未知字段/版本/操作、模式、码对应、EOF 标记、保存状态和无证据 PASS |
| 原生载荷描述 | PASS | 合成 File 字段与视频输入一致，RGBA 数学长度与 Blob 长度描述一致；未构造或传输真实媒体对象 |
| 错误登记 | PASS | 53 个唯一数字码/名称，覆盖7类错误，schema 与样例 code/name/retryAction 一致 |
| 模块/接口/验收追踪 | PASS | 8 模块、10接口、AC-001～AC-014 全覆盖，12项运行时检查显式列出 |
| schema 能力边界 | 已确认 | 跨字段哈希相等和像素数学长度不能仅靠本 schema 保证，要求实现 C-01/C-02/C-12；没有将其伪称已验证 |
| 状态和变更范围 | PASS | 当前只推进阶段2.5，阶段3及以后未启动；原已跟踪业务文件与原报告无修改 |

结构负向检查涉及：unknown envelope field; wrong version; unknown operation; missing request id; unknown mode; start old session; video missing size; non RGBA; negative frame; unsafe integer; frame session null; fake pixel metadata; success error code; missing error details; outer inner code mismatch; error name mismatch; retry policy mismatch; error has success data; artifact missing; artifact zero decoded bytes; invalid source reason; media failure no error; zero event sequence; strict EOF not verified; fake field executor; mock local full E2E; PASS missing hash; PASS missing proof ref; PASS no executor; NOT_RUN claims executor; NOT_RUN claims received hash; NOT_RUN claims elapsed; saved state no saved outcome。

停止期间的资源收敛由原会话清理令牌完成，迟到数据不写新会话；saveStatus 与会话状态分离，已提交文件不删除，pending 不自动重写。严格解压结束的必要适配门槛已记录，不把现成 WASM 的可复用性当已证实事实。

未执行：产品实现、Worker原生字节传输、浏览器真实授权/保存、WASM装配/构建、正确/损坏/截断解压运行测试、本地全功能模拟、真实云桌面测试、容量性能测量，均 NOT RUN。

检查结论：详细契约可作为任务规划输入。后续必须实现并验证12项跨对象/时序/IO/证据检查；schema 与合成样例通过不代表这些产品检查已经通过。

# CHANGELOG — libcimbar-desktop-receiver

## 1.0.0 (2026-10-22)
- 首个外审通过版本：本地宿主机接收端（浏览器应用），复用 libcimbar WASM 与发送端协议
- 双输入：真实窗口/屏幕抓屏实时接收；录像文件导入（逐帧解码，支持到 4MiB 难压缩数据实测）
- 会话与恢复：Incomplete/Error 可重启、取消清理收敛门、Worker 生命周期 fail-closed
- 保存：真实系统保存对话框；取消可重试；同名覆盖拒绝（DirectUI 任务对话框驱动）；保存量测四时点分解
- 证据体系：20/20 本地真实用户旅程（E2E-1..20）；证据门禁 local PASS(20)、field 按设计拒绝；120 项单元测试
- 发布历史：外审 5 轮（round-1/3/5/7/9/11）逐轮整改收敛，round-11 通过

# RELEASE-NOTES — cimbar-sender 1.0.0

- 用途：libcimbar 发送端（把文件编码为动画 cimbar 码），与本地宿主机的
  libcimbar-desktop-receiver 1.0.0 配对使用。
- 内容：原项目 web/ 发送页（index.html / main.js / send.js / send-worker.js 等）
  与 Wasm 构建产物；cimbar_js.wasm SHA-256：
  d1080cdc600ca842a337b8ea6157bc5cc2c545aaa75fce7b14e8585e9eb4685b
  本包为完整可服务目录；交付哈希清单见 DELIVERY-MANIFEST.txt。
- 使用（云桌面侧）：
  1. 把本目录放到云桌面可访问的位置（任意路径均可）。
  2. 在该目录运行：python -m http.server 8811
     （或任何静态文件服务器；页面必须经 http:// 访问，不能 file:// 直开）。
  3. 浏览器打开 http://127.0.0.1:8811/（Cimbar Encoder）。
  4. 选择/拖入要发送的文件；模式保持默认 B。
  5. 让发送动画窗口完整可见、不要最小化；远程桌面客户端不要缩放窗口。
  6. 宿主机接收端点 Share a window or screen，选择本发送窗口即可。
- 注意：浏览器翻译弹窗会遮挡码面，出现时点"关闭翻译"。
- 已知约束：接收端支持模式 B；发送端页面内切换模式后，需刷新发送页才能
  恢复可用流（刷新后默认即 B）。其他模式的画面接收端不解码。
- 传输可能耗时：完成所需时长取决于文件大小与屏幕刷新；动画循环播放，接收
  端会自动累积直到重建完成（或数据不足时报"数据不足"）。大文件建议先用
  小样例验证链路。

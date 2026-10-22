## 6. 执行计划

三步，每步都有明确的决策门。

### 6.1 阶段 1：5 分钟判定性实验（零构建）

**目的**：单独验证"录屏这一代是否保住了信号"，把变量一次只动一个。

用**已经能跑通的那套**（云桌面里那个能扫出文件的动画，原封不动）：

1. 云桌面播放动画。
2. 本地用 **OBS** 抓 Citrix 窗口录一段 —— 用「显示器采集 / Display Capture」，**不要用 gdigrab**；码率拉满或选无损；分辨率设 1:1 不要缩放。
3. 停止播放，**本地回放这段录像**，手机对着本地屏幕扫。

**判据**：

| 结果 | 含义 | 下一步 |
|---|---|---|
| ✅ 手机扫录像成功 | 录屏这一代证明了无损保信号 | 直接进入阶段 2 |
| ❌ 失败 | 录制环节有问题，多半是缩放或码率 | 调 1:1 + 无损重试 |
| ❌ 再失败 | Citrix 客户端窗口没被正确抓到（黑屏 / DWM 合成问题） | 换 Win+Alt+R 重试 |

这一步顺带回答了"当初测的是 cimbar 还是普通 QR" —— 因为用的就是原来那套编码，一致性自动成立。

### 6.2 阶段 2：搭路径 A（约 30 分钟，零编译）

**判据**：解出的文件与原文 `Get-FileHash` 一致。

### 6.3 阶段 3：兜底（仅在阶段 2 失败时）

回落到路径 B 或 C。路径 C 尤其值得考虑 —— 它走的是已被实测验证的相机路径，只是把手机换成了软件。

---

## 7. 阶段 2 操作手册

### 7.1 取现成的解码器

```powershell
mkdir cimbar-recv
Invoke-WebRequest -Uri https://github.com/sz3/libcimbar/releases/download/v0.6.8/cimbar.wasm.tar.gz -OutFile cimbar.wasm.tar.gz
tar -xzf cimbar.wasm.tar.gz -C cimbar-recv
cd cimbar-recv
```

包内文件带版本号后缀（`wasmgz.sh:22` 做的缓存击穿重命名），形如 `recv.2026-08-21T1234.js`。

### 7.2 改一处：把摄像头换成屏幕捕获

先确认 `recv.html` 引用的到底是哪个文件名：

```powershell
Select-String -Path recv.html -Pattern 'recv.*\.js'
```

然后编辑那个文件里的 `init_video` 函数（源码位置 `web/recv.js:223-261`），三处改动：

**改动 ①** —— `web/recv.js:227-238` 的 constraints，删掉摄像头专属的三个字段：

```js
// 改后
      var constraints = {
        audio: false,
        video: {
          width: { min: 720, ideal: 1920 },
          height: { min: 720, ideal: 1080 },
          frameRate: { ideal: 30 },   // 原为 15，注释说是怕把手机烧了；屏幕捕获无此顾虑
        }
      };
// 删掉 facingMode / exposureMode / focusMode —— getDisplayMedia 收到这三个会直接报错
// 删掉 aspectRatio —— 那个 matchMedia 判断是给手机竖屏用的，桌面窗口无意义
```

**改动 ②** —— `web/recv.js:240` 的能力检测：

```js
// 改后
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        return Recv.set_error('getDisplayMedia not supported? :(');
      }
```

**改动 ③** —— `web/recv.js:244` 的调用本身：

```js
// 改后
      navigator.mediaDevices.getDisplayMedia(constraints)
```

后面的 `.then(...)` **一行都不用动** —— `video.srcObject` 赋值（`recv.js:248-252`）和 `requestVideoFrameCallback`（`recv.js:254`）对 MediaStream 是通用的。`recv.js:197-205` 还有 `_framesInFlight` 背压计数，所以 30fps 也不会撑爆 worker。

顺带排除一个疑虑：`recv.js:263-276` 的 `watch_for_camera_pause` 是 iOS 摄像头保活逻辑，桌面浏览器上 `isIOS()`（`recv.js:123-127`）返回 false 直接 return，换成屏幕捕获后不影响。

**不需要重新编译任何东西** —— 你碰的是手写 JS，不是 emscripten 产物。

### 7.3 起本地服务

```powershell
python -m http.server 8000
```

**必须在这个解压目录的根部起** —— `web/recv-sw.js:7,13` 用的是绝对路径 `/cimbar_js.wasm`、`/recv-worker.js`，放到子目录会 404。

### 7.4 使用

浏览器打开 `http://localhost:8000/recv.html`（`localhost` 算安全上下文，wasm 与 Service Worker 才能加载），点开始 → 弹窗里选 **Citrix 客户端窗口** → 实时解码落盘。

模式用默认的 **Auto** 即可（`web/recv.js` 有 Auto/4C/8C/Bu/Bm/B 模式轮转探测；码图本身不自描述，靠猜）。

### 7.5 已知小坑

- **Service Worker 会缓存**：改完 JS 第一次打开记得硬刷新（Ctrl+Shift+R），或在 DevTools 里 Unregister SW，否则跑的还是旧代码。
- **选窗口而不是选整个屏幕**，且别让浏览器对捕获画面再做缩放。
- `getDisplayMedia` 必须在用户点击里调用 —— `recv.html` 的开始按钮本身就是点击，符合要求。

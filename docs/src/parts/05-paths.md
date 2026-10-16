## 5. 落地路径

项目里**没有**任何"录屏 → 收文件"的一体化功能。下面三条都是把现成零件拼起来，区别只在拼的时候要不要动代码、要不要碰 C++ 工具链。

### 路径 A：浏览器解码器 + 屏幕捕获（推荐）

**零编译。** 用 release 里现成的 wasm 解码器，把它的帧源从摄像头换成屏幕捕获。

为什么不用编译 —— 已核实：

- release **v0.6.8 确实挂了 `cimbar.wasm.tar.gz`**（用 GitHub API 核对过 assets 清单：`cimbar.asmjs.zip`、`cimbar.wasm.tar.gz`、`cimbar_js.html`）。
- 该 tar 里包含完整解码器：`recv.html`、`recv.<版本>.js`、`recv-worker.<版本>.js`、`cimbar_js.js`、`cimbar_js.wasm`（`web/wasmgz.sh:6-7` 的打包清单）。
- **要改的 `recv.js` 是手写的普通 JS，不是 emscripten 编译产物**（`cimbar_js.js` / `cimbar_js.wasm` 才是）。`wasmgz.sh:6` 就是把它当普通文件拷进包的。

优点：实时解码、无中间文件、无 ffmpeg、**绕开 GDI 抓 D3D 窗口黑屏的坑**（`getDisplayMedia` 走 OS 合成器）。

### 路径 B：录屏成文件 → 抽帧 → `cimbar` CLI

**不动代码，但要编译 C++。**

- 解码那一步（`cimbar` CLI 吃图片序列/stdin）**已具备且被 CI 测试覆盖**。
- 录屏和抽帧**项目里完全没有** —— 全库 grep `gdigrab`/`captureStream`/`getDisplayMedia`/`desktopCapture` 零命中，必须用外部工具（OBS 或 Win+Alt+R 录屏，ffmpeg 抽帧）。

优点：最可控，可以反复重跑不同参数做对比。

### 路径 C：OBS 虚拟摄像头 + `cimbar_recv`（兜底）

**零代码改动。** OBS 用"显示器采集"（Desktop Duplication）抓 Citrix 窗口 → 启动 OBS 虚拟摄像头 → `cimbar_recv -i <虚拟摄像头索引> -o out`。

本质是**用软件替换手机** —— 走的还是项目原生、且已被实测证明可行的相机路径。代价是需要编译 `cimbar_recv`。

### 代价对比

| | 要改代码 | 要编译 | 要装外部工具 | 可实时 |
|---|---|---|---|---|
| **A 浏览器** | 约 10 行 JS | **不用** | 本地 http server | 是 |
| **B CLI** | 不用 | **要**（vcpkg + OpenCV/GLFW/ANGLE） | ffmpeg | 否 |
| **C 虚拟摄像头** | 不用 | **要** | OBS | 是 |

**推荐 A**：不用碰 C++ 工具链，改的是发布包里现成的 JS 文件。

注意：MSVC 下即使只想要 headless 的 `cimbar` CLI，`CMakeLists.txt:50-52,129-132` 也会无条件 `find_package(glfw3)` 与 `unofficial-angle`，所以纯解码用途也要先装 GL 依赖 —— 这是路径 B/C 的隐性门槛。

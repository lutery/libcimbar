# libcimbar 项目完整性审计与「云桌面录屏 → 本地接收文件」可行性分析

| 项目 | 内容 |
|---|---|
| 分析对象 | libcimbar（本地路径 `E:\Project\OpenSource\c++\libcimbar`，最新 tag **v0.6.8**） |
| 分析日期 | 2026-10-16 |
| 分析方法 | 编排式多 agent 审计：10 个维度并行取证 → 每个维度由独立 agent 读码尝试**证伪** → 两份综合判定 → 1 个批判者复核缺漏。共 23 个 agent，0 失败 |
| 证据性质 | **全程只读**。未 configure、未 build、未运行任何二进制或单测 |
| 完整性定级 | 可用于实验与自用，带保留 |
| 可行性定级 | 可行，条件明确（详见第 4 章） |

> **阅读提示**：本文所有结论按证据强度分三级标注 ——【仓库实证】有 `file:line` 可核；【外部知识】来自通用技术常识而非本仓库；【推测】由前两者推断、未验证。凡涉及"能不能跑通"的判断，都受第 2 章的证据质量声明约束。

## 1. 执行摘要

### 1.1 问题一：本项目是否完整？

**是。功能上完整，但它是一个"实验性条码格式"的 proof-of-concept 收尾，不是能长期依赖的生产级组件。**

编码器、解码器、CLI、Web/WASM、三平台 CI 与发布链都在；端到端 `encode → decode` 有真实单测覆盖（`test/py/test_cimbar_cli.py` 的往返用例、`src/lib/cimbar_js/test/cimbar_recv_jsTest.cpp:97-139` 用真实样图走完整链路并断言 7500/7347/7538 字节）；近一年仍在活跃维护（1049 次提交，v0.6.8 发布于 2026-08-21）。

但它自己就不声称是生产级的：`README.md:6` 自述 experimental，`TODO.md:6` 自述只做到了 proof-of-concept 里"proof"的那部分。粗糙边角真实存在，集中在四处：**接收端无 headless 通路、大文件边界会静默失败、`samples` 子模块未初始化导致开箱跑不了测试、发布产物本身有缺陷**。

### 1.2 问题二：通过录屏从云桌面接收文件到本地，是否可行？

**可行。** 而且置信度比纯静态分析所能给出的高得多 —— 依据是使用者的**实测**：

> 现有能跑通的链路是「云桌面渲染 → Citrix 编码传输 → 本地客户端渲染到显示器 → **手机摄像头**拍摄 → 解码成功」。

而录屏方案是把其中"手机摄像头"换成"本地数字抓屏"：

> 「云桌面渲染 → Citrix 编码传输 → 本地客户端渲染 → **本地数字抓屏** → 解码」

**相机是一个比数字抓屏严格更差的信道** —— 镜头模糊、传感器噪声、摩尔纹、卷帘快门、自动曝光/对焦抖动、透视畸变、环境光，这些数字抓屏一个都没有。既然信号已经扛住了相机，就没有理由扛不住一个像素级的拷贝。

这不是"理论上应该行"。同一份 Citrix 损伤已经被实测验证过一次，数字路径只是在此基础上**再减掉一代损伤**。

### 1.3 但没有任何一条是"开箱即用"

项目里**不存在**"录屏 → 收文件"的一体化功能。两条候选路径都是把现成零件拼起来，区别只在拼的时候要不要动代码：

| | 要改代码 | 要编译 | 要装外部工具 | 可实时 |
|---|---|---|---|---|
| 路径 A：浏览器解码器 + 屏幕捕获 | 约 10 行 JS | **不用** | 本地 http server | 是 |
| 路径 B：录屏成文件 → 抽帧 → `cimbar` CLI | 不用 | **要**（vcpkg + OpenCV/GLFW/ANGLE） | ffmpeg | 否 |

**推荐路径 A**，因为不用碰 C++ 工具链，改的是发布包里现成的 JS 文件。

### 1.4 下一步

先做一个 **5 分钟、零构建**的判定性实验（第 6.1 节），用已经能跑通的手机当测量仪器，单独验证"录屏这一代是否保住了信号"。这一步能排掉唯一剩余的工程不确定性。

## 2. 方法、证据质量与免责声明

### 2.1 怎么得出这些结论的

23 个 agent，分五个阶段：

1. **完整性审计**（5 个维度并行）：构建与依赖、编码链路、解码链路、应用与前端/发布、测试/CI/文档/维护活跃度。
2. **可行性取证**（5 个维度并行）：解码输入路径、信号鲁棒性、云桌面链路损伤、现场可测性、端到端流程与吞吐。
3. **对抗验证**：每个维度的取证结论交给一个**独立的** agent，要求它自己打开代码核对、**尝试证伪**，并明确区分"我复核过"与"我无法核实"。这一步推翻了若干条看起来很合理的结论。
4. **综合判定**：两个独立综合器分别产出完整性判定与可行性判定。
5. **缺漏复核**：一个批判者专门找"该查没查、被当成事实但没有证据、结论超出证据"的部分。

### 2.2 证据强度声明

**本文全部结论来自静态结构核验，不是运行观察。** 具体做了和没做：

**做了**：读文件、解析 include 引用关系、复算公式与常量、核对测试源码里的断言、用 git 查提交与 tag 分布、用 GitHub API 核对 release 资产清单。

**没做**：没有 `cmake configure`、没有编译、没有运行任何二进制或单测、没有做任何端到端实验。

因此本文**不能**用于证明"编译能过"或"测试是绿的"。尤其注意：

- CI 当前是否全绿、Windows/MSVC 路径是否长期失败，**无法离线确认**。
- "代码里有实现且有测试源码"**不等于**"该功能实测可用"。
- 涉及具体 VDI 产品（Citrix/RDP/VMware Blast/SPICE）的调优方向，均为【外部知识】，**具体开关名需按现场版本核实**。
- 本方案推荐的"录屏 → 解码"端到端链路，**从未被任何人跑通**，包括推荐路径本身。

### 2.3 关于使用场景

这类方案的本质是绕过既有数据通道。对云桌面会话录屏并以光学方式把数据带出，可能触及所在单位的终端与数据安全策略；受管终端也可能直接禁止安装/运行编码器。落地前请先取得运维或安全负责人许可。本句为客观陈述，不构成劝阻。

## 3. 问题一：项目完整性审计

### 3.1 六维评定

| 维度 | 等级 | 一句话依据 |
|---|---|---|
| 构建系统与依赖 | 基本完整（有保留） | 44 个 CMakeLists 全在构建链上、源码/头文件/11 个 vendored 依赖逐个可解析，linux/MSVC/wasm 三条路径齐备且 CI 覆盖；扣分项是 `samples` 子模块未初始化、`opencv4/` 需外部补位、wasm 的 `OPENCV_LIBS` 隐式耦合脆弱 |
| 编码链路 | 基本完整（有保留） | mode 参数表、capacity/chunk 公式、25-bit 尺寸上限、RS/交织/角点剔除全部可核且与测试一致（`GridConf.h:121-142`、`FountainMetadataTest.cpp:59-68`）；缺口是大文件边界与约 1.5 倍过度生成 |
| 解码链路 | 基本完整（有保留） | 七段链路（帧 → Extractor → image_hash → Decoder/RS → fountain → zstd → 落盘）齐备、接口自洽，有走完整链路的单测（`cimbar_recv_jsTest.cpp:97-139` 断言 7500/7347/7538）；缺口在 exe 层——recv/recv2 强制 GLFW 窗口、无 headless、无测试 |
| 应用层与前端/发布 | **存在明确缺口** | 6 个 exe + wasm 编解码器 + PWA 都在，headless 的 `cimbar` CLI 可用；但发布产物有缺陷，文档又落后于代码 |
| 测试与 CI | 基本完整（有保留） | 9 个 ctest 目标 + 5 平台矩阵 + python CLI 往返 + wasm 浏览器 QUnit，CI 确实跑单测；扣分项是 5/9 单测依赖未初始化的 `samples`、release.yml 不跑测试、exe 层零测试 |
| 文档与维护活跃度 | 基本完整（有保留） | MPL-2.0、11 个第三方库均带许可证、提交与 tag 节奏活跃；问题是文档与代码漂移 |

### 3.2 缺口清单（按"会不会影响你拿它干活"排序）

**① 接收端没有 headless 通路** —— 影响最大

`cimbar_recv`（`src/exe/cimbar_recv/recv.cpp:105-111`）与 `cimbar_recv2`（`src/exe/cimbar_recv2/recv2.cpp:100-105`）都强制创建 GLFW 窗口，窗口创建失败直接 `return 70`；且读到 EOF 时只是 `continue`（`recv.cpp:132-136`），会一直空转不退出。

**后果**：无法把录屏文件喂给一个受支持的接收程序做无人值守处理。唯一 headless 的只有 `cimbar` CLI（`src/exe/cimbar/cimbar.cpp:132`，逐张 `cv::imread`）。

**② 大文件边界会静默失败**

- 编码后超过 33,554,431 字节（25-bit size 字段上限）时**无任何报错**，size 被静默截断（`src/lib/fountain/FountainMetadata.h:20-23,76-84`）。
- Bm 模式压缩后约 27.7MB 就越过 65,536 块，而 block id 是 `uint16_t`，回绕后重复 id 被解码端直接丢弃，**永远收不全**（`src/lib/fountain/FountainDecoder.h:74-79`）。

**后果**：传较大文件可能得到静默损坏或永不完成的传输，而不是一个干净的报错。

**③ `samples` 子模块未初始化，5/9 个 C++ 单测依赖它**

`loadSample` 无守卫（`src/lib/cimbar_js/test/cimbar_recv_jsTest.cpp:102`、`test/TestHelpers.h:8-18`），缺样即抛异常而非跳过。`samples/` 实测 0 条目。

**后果**：全新 clone 后"跑一遍测试确认解码可用"这一步会失败，必须先 `git submodule update --init`。

**④ 发布产物本身有缺陷**

- `package-wasm.sh:35` 打包 `cimbar.asmjs.zip` 时只 zip 了 `cimbar_js.js`、`index.html`、`main.js`，而 `web/index.html:408` 需要 `send.js`。
- `web/wasmgz.sh:6-18` 的文件白名单不含任何图标，导致 `cimbar.wasm.tar.gz` 里 Service Worker 预缓存清单的图标一个都没有。

**后果**：下载官方 release 想"保存即用"会踩坑。

**⑤ 编码端约 1.5 倍过度生成**

`src/lib/encoder/EncoderPlus.h:56` 用 `fountain_chunks_per_frame(_bitsPerSymbol)` 而非 `bits_per_cell` 计算每帧 chunk 数，导致 B/Bu/Bm 模式产出比必要多约 50% 的帧（4C/8C 不受影响）。

**后果**：对录屏场景是直接的时长与磁盘占用膨胀，非正确性错误。

**⑥ 文档与代码漂移**

`README.md:32` 仍写 wasm 是 "encoder only"，但解码器早已实现并被 CI 端到端覆盖；`WASM.md` 的 emsdk 版本与脚本不符；`vcpkg.json` 版本号落后于 tag。

**⑦ 接收端必须显式指定 mode**

码图本身不自描述 ecc/颜色数/符号数（`TODO.md:10-13` 自述该功能未实现），必须传对 `-m B`/`Bm`/`Bu`/`4C`，否则分块尺寸与 ECC 都不匹配。

### 3.3 值得肯定的部分

- **端到端 encode→decode 是真实且被测试的**：`EncoderRoundTripTest` 硬断言单帧还原 7500 字节；`cimbar_recv_jsTest.cpp:97-139` 用真实样图走完整 scan→extract→decode→fountain→zstd 链路；另有 python CLI 往返与 wasm 浏览器 QUnit 端到端。
- **协议设计本身健壮**：wirehair 喷泉码 + Reed-Solomon + zstd，天然容忍乱序、丢帧与损坏（`README.md:28`）。这也是录屏丢帧场景下仍可能成功的基础。
- **构建自洽度高**：44 个 CMakeLists 全在顶层 `PROJECTS → add_subdirectory` 链上，引用的 `.c/.cpp/.h` 无一缺失。
- **多平台覆盖真实**：linux(gcc/clang) + windows(msvc) + emscripten 三条路径都在 CI 里 configure/build/ctest。
- **维护活跃**：1049 次提交（2020-04 至 2026-08），近一年 116 次，tag 序列连续。

## 4. 问题二：可行性分层判定

结论是**可行**，但要分三层说清楚：代码层面能不能喂进去、信号层面能不能活下来、端到端要多久。

### 4.1 第一层：解码端能接受哪些输入形态？

| 输入形态 | 支持 | 证据 | headless |
|---|---|---|---|
| 摄像头 | 设计目标 | `src/exe/cimbar_recv/recv.cpp:86` | 否（强制窗口） |
| 视频文件（.mp4 等） | `cv::VideoCapture` 能打开，但**不可无人值守** | `recv.cpp:86` + `recv.cpp:105-111,132-136` | 否 |
| **PNG 图片序列** | **支持** | `src/exe/cimbar/cimbar.cpp:132`（逐张 `cv::imread`） | **是** |
| **stdin 逐行喂路径** | **支持** | `src/exe/cimbar/cimbar.cpp:283-296` | **是** |
| 浏览器屏幕捕获 | **不支持** | `web/recv.js:244` 只调 `getUserMedia`，全库零 `getDisplayMedia` | — |
| 浏览器摄像头 | 支持 | `web/recv.js:227-260` + `web/recv-worker.js:121` | — |

关键区分：`cimbar_recv -i xxx.mp4` **看起来**能直接吃录屏文件（`recv.cpp:86` 把参数直接交给 `cv::VideoCapture`），但它在 `recv.cpp:105-111` 强制创建 GLFW 窗口，且 EOF 时只是 `continue`。所以它不能无人值守，"抽帧"这一步绕不过去，除非改代码。

**"cimbar CLI 吃图片序列"是项目原生且被 CI 测试覆盖的用法**：`test/py/test_cimbar_cli.py` 的 `test_roundtrip_oneshot` 就是 `--encode -i LICENSE -o img` → `-i img_0.png -o dir` → 断言文件内容完全一致；另有 `test_roundtrip_stdin` 走 stdin 那条。

### 4.2 第二层：信号能不能扛住远程桌面有损编码？

**一条反直觉但证据扎实的发现：色度 4:2:0 子采样不是杀手。**

- 仓库自己的接收端就把 4:2:0 当一等输入，显式处理 NV12/I420（`src/lib/cimbar_js/cimbar_recv_js.cpp:99-110`、`web/recv-worker.js:37-43`）。
- 颜色解码取 tile 中心 6×6 均值（`src/lib/cimb_translator/CimbDecoder.cpp:204-219`），2×2 色度平均基本保留该均值。
- `PERFORMANCE.md` 里 852 kbps 的基准成绩本身就是手机相机链路（大概率 4:2:0）。

**真正的杀手是亮度量化与模糊。** 符号解码是在整幅去斜灰度图上做一次 `adaptiveThreshold`（`src/lib/cimb_translator/CimbReader.cpp:29-46,148`），然后逐格取 10×10 原始比特窗，与 16 个参考掩码的 64 位平均哈希比 Hamming 取最近邻（`src/lib/cimb_translator/CimbDecoder.cpp:87-99,144-149`）。**最弱符号对的距离只有约 18 bit，tile 的最小空间特征实测只有 1px。** H.264/HEVC 在典型 VDI 码率下的亮度量化、模糊、块效应会翻转这些比特。

**更糟的是误差被放大 5 倍**：一个 625 B chunk = 5 个 125 B RS 块（`src/lib/encoder/ReedSolomon.h:22-27`），任一 RS 块坏就丢弃整个 625 B chunk。所以 `chunk 可用率 ≈ (单块可用率)^5`。

**喷泉层的容忍度**：发送端每帧产出 12 个 625 B chunk（色度全毁则只剩符号通道 8 个），解码只需 `floor(S/619)+1` 个**不同**块。丢帧只降速、不影响可解性 —— 但重播同一批帧无用，因为 `FountainDecoder` 按 `block_num` 去重，重复块直接丢弃（`src/lib/fountain/FountainDecoder.h:74-86`）。按此推算的丢帧容忍上限约 44.4%（最坏约 16.7%）。

### 4.3 第三层：吞吐与耗时

必须纠正一个数字：**106 KB/s 不是本管线的吞吐上界。** 它是 `PERFORMANCE.md:17,34` 里安卓手机（cfc app，4 线程 Snapdragon 625）**相机链路**的成绩，跨链路外推没有依据。

真正上界应从发送端推：`cimbar_send` 默认 **15fps**（`src/exe/cimbar_send/send.cpp:38`）× 12 chunk/帧 × 619 B ≈ **111 KB/s 理论**，实际远低于此。

以几 MB 文件为例（cimbar 会先做 zstd 压缩，33MB 上限是**压缩后**的）：

- 几 MB 的文本/Office/源码 → 压缩后可能只有几百 KB → 几十秒
- 几 MB 的已压缩数据（jpg/zip/mp4）→ 无压缩收益 → 3MB ÷ 实测 30~80 KB/s ≈ **40~100 秒**

### 4.4 决定性论证：为什么"相机能扫通"几乎等于"录屏能扫通"

这是全文最关键的一步推理，请仔细看。

**已实测跑通的链路**：

```
云桌面渲染 cimbar 动画
  → Citrix 编码传输            ← 第 1 代有损
  → 本地客户端解码渲染到显示器
  → 手机摄像头拍摄显示器        ← 第 2 代有损（远比数字拷贝糟糕）
  → cfc 解码 → 文件 ✅
```

**拟采用的录屏链路**：

```
云桌面渲染 cimbar 动画
  → Citrix 编码传输            ← 第 1 代有损（完全相同）
  → 本地客户端解码渲染
  → 本地数字抓屏                ← 无损，可控
  → 解码 → 文件
```

两条链路的**第 1 代损伤完全相同**，区别只在第 2 代：

| 损伤来源 | 相机 | 数字抓屏 |
|---|---|---|
| 镜头光学模糊 / MTF 衰减 | 有 | 无 |
| 传感器噪声 | 有 | 无 |
| 摩尔纹 / 拜耳插值 | 有 | 无 |
| 卷帘快门 / 运动模糊 | 有 | 无 |
| 自动曝光、自动对焦抖动 | 有 | 无 |
| 透视畸变 / 环境光 | 有 | 无 |
| 二次有损压缩 | 有（JPEG/HEVC 录像） | 可控为无损 |

**相机是一个严格更差的信道。** 既然信号扛住了相机，就没有理由扛不住一个像素级的拷贝。数字路径是在已验证的基础上**再减掉一整代更严重的损伤**。

**这个论证有一个前提需要确认**：使用者当初用手机扫的到底是 **cimbar 码（cfc app）**还是**普通 QR 码**。

- 若是 **cimbar** → 上述推理成立，结论直接可用。
- 若是**普通 QR** → 证据要打折。普通 QR 是黑白、模块大、ECC 冗余约 30%；而 cimbar 是彩色、8×8 tile、最小空间特征只有 1px。普通 QR 能过只证明 **Citrix 没有做硬性降分辨率**（这点很有价值），但不等于 cimbar 能过——信息密度差了大约一个数量级。

不过这个疑问**不影响行动计划**：第 6.1 节的判定性实验用的就是使用者原来那套编码，一致性自动成立。

### 4.5 剩余不确定性（必须实测才能回答）

1. **抓屏工具本身会不会掉链子** —— D3D/硬件加速渲染的窗口用 GDI 抓屏可能录到黑屏；抓屏工具可能偷偷缩放。这是工程问题，不是物理问题。
2. **Windows/vcpkg 构建出的 OpenCV 是否带可解 mp4 的 videoio 后端**（MSMF 还是 FFMPEG）—— 但路径 B 不依赖它，走 ffmpeg 抽帧即可绕开。
3. **云桌面是否提供可用 GL 上下文**（`cimbar_send` 能否起窗口，`send.cpp:89-93` 失败即 `return 70`）。
4. **本机解码的单帧耗时**（决定能否实时，还是只能离线录完再解）。
5. **`cimbar` CLI 目标在 MSVC 下能否真的编译出来** —— `README.md:78` 的 Windows 构建行**不含** `cimbar`，必须显式加 `--target cimbar`。

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

## 8. 会静默失败的陷阱（务必记住）

这些坑的共同特征是**不报错**，表现为"0 帧、什么都没发生"，极难排查。

| # | 陷阱 | 表现 | 证据 |
|---|---|---|---|
| 1 | `cimbar` CLI 加 `-z 0` | stdin 分支只挂在 `compressionLevel > 0` 与 `--no-fountain` 两处；`-z 0` + stdin 时走的是 `infiles`（空 vector），**0 帧、无报错** | `src/exe/cimbar/cimbar.cpp:209,274,283-296` |
| 2 | 输出目录不存在 | `cv::imwrite` 不会自动建目录，失败同样表现为 **0 帧无报错** | 同上 |
| 3 | 编码后超过 33,554,431 B | 25-bit size 字段被**静默截断** | `src/lib/fountain/FountainMetadata.h:20-23,76-84` |
| 4 | Bm 模式超过 65,536 块 | block id 是 `uint16_t`，回绕后重复 id 被丢弃，**永远收不全** | `src/lib/fountain/FountainDecoder.h:74-79` |
| 5 | 用 gdigrab 抓 D3D 渲染的窗口 | **录到黑屏**，且不会报错 | 【外部知识】 |
| 6 | 重播同一批帧想补进度 | `FountainDecoder` 按 `block_num` 去重，重复块直接丢弃，**毫无作用** | `src/lib/fountain/FountainDecoder.h:74-86` |
| 7 | 忘了传对 `-m` 模式 | 码图不自描述，分块尺寸与 ECC 不匹配，解不出 | `src/lib/cimb_translator/Config.h:19-49`；`TODO.md:10-13` |

正确姿势速查：

- 解码命令行**不要加 `-z 0`**（默认压缩级别是 16，见 `src/lib/cimb_translator/Config.h:177-180`）。
- `-o` 输出目录**先手动建好**。
- 录屏用 **OBS 显示器采集**或 **Win+Alt+R**，不要用 gdigrab。
- 解码命令显式带 `-m B`（或与发送端一致的模式）。

---

## 9. 尚未验证、需实测回答的问题

1. 抓屏工具能否稳定抓到 Citrix 客户端窗口（D3D 黑屏问题）。
2. 本机解码的单帧耗时 —— 决定能否实时，还是只能离线录完再解。
3. `cimbar` CLI 目标在 MSVC 下能否真的编译出来（`README.md:78` 的 Windows 构建行不含它）。
4. 云桌面是否提供可用 GL 上下文（`cimbar_send` 能否起窗口，`src/exe/cimbar_send/send.cpp:89-93` 失败即 `return 70`）。
5. Windows/vcpkg 构建出的 OpenCV 是否带可解 mp4 的 videoio 后端（MSMF 还是 FFMPEG）—— 路径 B 不依赖它。
6. `samples` 子模块 pin 的 commit 与 v0.6.8 代码的测试期望是否匹配（"`git submodule update --init` 后单测即全绿"是未验证的乐观估计）。
7. CI 当前是否全绿、Windows/MSVC 路径是否长期红。
8. 使用者当初手机扫的到底是 cimbar 码还是普通 QR 码（影响 4.4 节论证的强度，但不影响行动计划）。

---

## 10. 关键参数速查

| 参数 | 值 | 来源 |
|---|---|---|
| mode B 图幅 | 1024×1024（tile 网格 1008×1008，112×112 cells） | `src/lib/cimb_translator/GridConf.h` |
| tile 尺寸 | 8×8 符号 / 9×9 pitch | 同上 |
| 单帧容量 | 约 9300 B（12400 cells） | 同上 |
| fountain chunk | 625 B = 5 × 125 B RS 块 | `src/lib/encoder/ReedSolomon.h:22-27` |
| 压缩级别默认 | 16 | `src/lib/cimb_translator/Config.h:177-180` |
| `cimbar_send` 默认帧率 | **15 fps** | `src/exe/cimbar_send/send.cpp:38` |
| `cimbar_send` 默认 padding | 32 px（会留黑边，且 `auto_scale_window` 会改窗口尺寸） | `send.cpp:39,94` |
| `cimbar_recv` 默认 fps | 30 | `src/exe/cimbar_recv/recv.cpp:41` |
| 压缩后大小上限 | 33,554,431 B（25-bit） | `src/lib/fountain/FountainMetadata.h:20-23` |
| 丢帧容忍 | 约 44.4%（最坏约 16.7%） | 由 chunk 数与帧产出推算 |
| 许可 | MPL-2.0 | `LICENSE` |

---

## 11. 证据索引

本文引用的关键文件（相对仓库根 `E:\Project\OpenSource\c++\libcimbar`）：

**解码与输入路径**
- `src/exe/cimbar/cimbar.cpp` —— headless CLI 解码器；`:132` imread；`:209,274,283-296` stdin 分支
- `src/exe/cimbar_recv/recv.cpp` —— `:41` fps；`:86` VideoCapture；`:105-111` 强制窗口；`:132-136` EOF 死循环
- `src/exe/cimbar_recv2/recv2.cpp` —— `:81,100-105` 同形态
- `test/py/test_cimbar_cli.py` —— `test_roundtrip_oneshot` / `test_roundtrip_stdin`

**信号与纠错**
- `src/lib/cimb_translator/CimbReader.cpp:29-46,148` —— adaptiveThreshold + 比特窗
- `src/lib/cimb_translator/CimbDecoder.cpp:87-99,144-149` —— Hamming 最近邻；`:204-219` 中心 6×6 均值
- `src/lib/cimb_translator/GridConf.h` —— 网格/容量/chunk 参数
- `src/lib/cimb_translator/Config.h:19-49,177-180` —— mode 表与压缩级别
- `src/lib/encoder/ReedSolomon.h:22-27` —— RS 块
- `src/lib/fountain/FountainMetadata.h:20-23,76-84` —— 25-bit size、uint16 block id
- `src/lib/fountain/FountainDecoder.h:74-86` —— block_num 去重与完成判据

**浏览器解码器**
- `web/recv.html:379` —— `<video>` 元素
- `web/recv.js:123-127,197-205,223-261,263-276` —— isIOS、背压、init_video、iOS 保活
- `web/recv-worker.js:37-43,121` —— NV12/I420 处理、`importScripts('cimbar_js.js')`
- `web/recv-sw.js:7,13` —— 绝对路径预缓存
- `web/wasmgz.sh:6-7,22` —— 打包清单与重命名

**构建与发布**
- `CMakeLists.txt:50-52,129-132` —— MSVC 下无条件 GLFW/ANGLE
- `package-wasm.sh:35` —— asmjs zip 缺 send.js
- `.github/workflows/release.yml:37-40` —— release 资产
- `README.md:6,28,32,72-84` —— 自述 experimental、33MB、wasm "encoder only"、Windows 构建
- `TODO.md:6,10-13,44-48` —— 自我定位与未实现项

**性能基准**
- `PERFORMANCE.md:7,14-18,34,48` —— 106 KB/s 与 852 kbps 的真实归属（手机相机链路）

---

*本文档由编排式多 agent 只读审计生成于 2026-10-16。所有结论均未经过编译或运行验证，见第 2 章证据质量声明。*

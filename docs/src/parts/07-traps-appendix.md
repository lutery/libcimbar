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

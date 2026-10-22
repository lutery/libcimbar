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

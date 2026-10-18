# 基线：配对发送端与 WASM 候选（T1.1.b）

| 项 | 值 |
|---|---|
| runId | `20261018-teamexec-01` |
| 生成时间 | 2026-10-18T14:0x+08:00 |
| 基线 commit | `26f710a`（干净副本由 `git archive HEAD` 导出，不含未提交改动） |
| 目标 | 证明存在可运行的原发送端，并固定候选 WASM 工具链与产物摘要 |

## 1. 工具链溯源（与 CI 固定版本一致）

| 组件 | 版本 / commit | 来源 |
|---|---|---|
| Emscripten | 5.0.0 (`a7c5deabd7c88ba1c38ebe988112256775f944c6`) | 镜像 `emscripten/emsdk:5.0.0` |
| OpenCV | 4.12.0，commit `49486f61fb25722cbcf586b7f4320921d46fb38e` | `.github/workflows/wasm.yml:34` 同款 |
| cimbar-samples | `9bbafc5ea0ad27e2a43ec9eee387dd60714a6c7f` | 与 `.gitmodules` 指向的 pin **完全一致** |
| 构建配方 | `SKIP_JS=1 bash package-wasm.sh` | 同 CI；asm.js 阶段按 CI 跳过 |

> 大文件下载走 `127.0.0.1:10802` 代理（11.4 MB/s）；直连 GitHub 实测仅 42 KB/s。

## 2. 完整命令（可复现）

```bash
# 干净副本（不含 .git）
cd /mnt/e/Project/OpenSource/c++/libcimbar && git archive HEAD | tar -x -C ~/libcimbar-wasm/src

# OpenCV 4.12.0（含子模块）
cd ~/libcimbar-wasm/src && git -c http.proxy=http://127.0.0.1:10802 clone \
  --recurse-submodules --depth 1 --branch 4.12.0 https://github.com/opencv/opencv.git opencv4

# 测试样本（cimbar_js_test 的 loadSample 需要）
git -c http.proxy=http://127.0.0.1:10802 clone --depth 1 https://github.com/sz3/cimbar-samples samples

# WASM 候选（CI 同配方）
docker run --rm -v ~/libcimbar-wasm/src:/usr/src/app emscripten/emsdk:5.0.0 \
  bash -c 'SKIP_JS=1 bash /usr/src/app/package-wasm.sh'
```

## 3. 候选产物与摘要

| 文件 | 字节 | SHA-256 |
|---|---|---|
| `cimbar_js.js` | 85,309 | `1f36bd07872ea51d5e60ae94fdf545c9bf970534f3d8cd022c8de5582ec5d7ff` |
| `cimbar_js.wasm` | 1,938,503 | `b67c04d49f714ce50ede51c3510344553d0df193d5c40aa237201d6d2ef4f9cb` |

- 版本戳目录：`web/2026-10-18T0554`（`wasmgz.sh` 生成）
- `cimbar.wasm.tar.gz`：648,021 B
- 安装落点：`make install` 直接把两件资产写入构建副本的 `web/`（`src/lib/cimbar_js/CMakeLists.txt:103-112`）
- 已复制到 `build-desktop-recv/staging/sender/`（该目录被 `build*/` 忽略，不入库）

## 4. 原生构建门禁（CMD-02 的 Linux 等价路线）

Windows/MSVC 路线本机不可用（vcpkg/GLFW/ANGLE 缺），按实施计划允许的等价路线在 WSL2 Ubuntu-22.04 执行：

```bash
cd ~/libcimbar-wasm/src
cmake -S . -B build-native -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build build-native --target compression_test cimbar_js_test -j4
ctest --test-dir build-native -R '^(compression_test|cimbar_js_test)$' --output-on-failure
```

**结果：2/2 通过（0 失败，0.81s）**。与 Windows CI 的差异：工具链为 GCC（Linux）而非 MSVC；ctest 目标发现与运行方式相同。CMD-02 的"目标必须被发现并运行、0 失败、不得空跑"判据满足。

## 5. 原发送烟测（真实浏览器，非 mock）

- 独立 sender 根：`build-desktop-recv/staging/sender/`（原 `web/` 的完整副本，**未修改任何原文件**）
- 回环服务：`python -m http.server 8801 --bind 127.0.0.1 --directory build-desktop-recv\staging\sender`
- 浏览器：本机 Edge（`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`，版本见 `environment.json`）
- 操作：打开 `http://127.0.0.1:8801/index.html` → 选择已知文件 `LICENSE` → 页面标题变为 `Cimbar: LICENSE`
- 画面：真实 B=68 动画（四角锚点 + 112×112 彩色 tile 网格 + 侧导引条），持续刷新
- 证据：`proof/sender-smoke-license.png`（SHA-256 `EE369E2B34A04DB6B1828F00EE90195840425FC472FE377FBF7AF134ED08455B`）

## 6. 已有发送回归

`http://127.0.0.1:8801/test_send.html`（原 qunit 发送测试页）：

```
1 tests completed in 552 milliseconds, with 0 failed, 0 skipped, and 0 todo.
3 assertions of 3 passed, 0 failed.
```

## 7. 明确不能证明的事项

- **构建成功 ≠ 严格 EOF 适配通过。** 本候选来自**未修改**的基线源码；`cimbard_decompress_read` 目前仍把"截断"与"完成"都返回 0（`src/lib/cimbar_js/cimbar_recv_js.cpp:259-264` 丢弃 `write_once()` 返回值）。该缺陷由 T1.2.a 修复并重新构建。
- **发送画面出现 ≠ 接收端可解。** 本任务只证明发送端可运行；接收端尚不存在（T2.1.a 起）。
- 未执行任何接收、抓屏或保存操作；这些能力在 `environment.json` 中保持 `NOT_RUN`。
- `samples` 使用上游 HEAD（恰等于 pin `9bbafc5`），但未验证其与 v0.6.8 测试期望的完整匹配度。

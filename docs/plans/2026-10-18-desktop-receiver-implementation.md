# Desktop Receiver Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在宿主机新增可独立启动的接收端，实际抓取原cimbar发送窗口或导入其录像，完整重建并保存与原文件SHA-256相同的文件。

**Architecture:** 独立回环origin上的原生浏览器应用；实时和录像统一汇入单在途RGBA帧调度，每次会话新建classic Worker/WASM。协调器唯一管理状态、EOF排空和清理；不可变Blob与保存尝试分离。先验证严格解压结束及旧发送兼容，再做真实双输入E2E，用户云桌面现场单独验收。

**Tech Stack:** 现有C++17/CMake/OpenCV/Zstd/Emscripten；浏览器原生ES modules、classic Worker、Canvas、MediaDevices和File System Access；开发测试使用Node 22内置node:test，启动静态服务使用Python 3.11+标准库和PowerShell。无需React、数据库、业务HTTP API或第三方前端测试框架。

---

## 输入、当前边界与执行规则

- 权威输入：[需求](../requirements/requirements-spec.md)、[架构](../design-catalog/architecture.md)、[模块契约](../design-catalog/module-contract-error-matrix.md)、[机器契约](../design-catalog/contracts/README.md)、[24任务路线图](roadmap.md)、[真实操作验收基线](test-acceptance-plan.md)。后续TDD和E2E产物经本端阶段4.x完成后由阶段5执行方消费。
- 2026-10-18基线为`84e7a1a`，当前已有分支`screen-capture-recv`。本计划只新增文档，未构建、未实现新应用。后续实施在隔离实现分支/worktree进行，先保留当前未跟踪docs；不得用reset/clean丢弃`.claude/`或用户文档。正式合并仍留阶段7。
- 下文所有Create/Modify/Test路径均为**待实施目标**，命令为后续执行契约，不能把本文件中的示例输出当运行结果。计划代码块是关键实现约束；须与实际源文件/测试组成完整实现后才能验收。
- 24个原Task编号不变；20项基础任务在阶段5完成；T5.1.b跨阶段5/6，T5.1.c属于阶段8，T5.2.b由用户现场执行，T5.2.c条件激活。不能把后四项塞进阶段5编码完成前置造成死锁。
- 当前记录Node `v22.23.1`、Python `3.11.7`可启动；不是WASM/浏览器/保存可用性证明。构建链和媒体能力在T1.1.a实际盘点。
- 开发遵循 @writing-plans、@testing-protocol；必要C++/契约变更遵循 @code-review-excellence。计划要求的TDD是先写有行为断言的失败测试、验证失败原因、最小实现、回归；不能把模块找不到或TODO/skip当作红绿证据。文档/盘点任务直接核查产物，无镜像单测。
- 每个下面的编号步骤是一个检查点；实现步骤进一步拆为单函数/单分支的2～5分钟动作，不把整模块当一个动作。通过适用检查后，仅暂存该Task确切文件并提交；不得`git add .`混入用户文件。提交不等于合并/发布。本轮不实际提交。

工作量沿用24任务的11 S/13 M档位。供实施方校准的20基础任务初步预算约90～150人时（环境12～20、严格EOF/Worker20～36、实时与会话16～26、录像与保存18～30、真实测试/测量/候选装配24～38，合计范围90～150）；是独立探索性估计，不从T-shirt机械换算，也不是AI运行时长/日历交期承诺。工具链重建、外审等待和现场窗口可能另增，先盘点再排期。

## 文件布局与内部职责

```text
web/desktop-recv/
  index.html, styles.css, launch.ps1, server.py, README.md, package.json
  src/app.js, capabilities.js, contracts.js, session.js
  src/live-source.js, video-source.js, frame-scheduler.js
  src/decoder-client.js, save-controller.js, ui.js
  config/profile.json, errors.json
  worker/decoder-worker.js
  tests/unit/{contracts,session,scheduler,worker,save,video,ui,evidence}.test.mjs
  tests/helpers/worker-vm.mjs
  tests/browser/{index.html,native-payload.mjs,wasm-roundtrip.mjs,lifecycle.mjs}
tools/desktop-recv/
  inventory.ps1, stage.ps1, verify-assets.mjs, run-unit.mjs
  create-fixtures.py, verify-evidence.py, summarize.py
docs/tests/
  test-plan.md, test-cases.md, acceptance-tests.md, e2e-user-journey-plan.md
  unit-test-skeletons/, field-guide.md, field-receipt.json
  runs/<runId>/environment.json, results.json, measurements.json, proof/
build-desktop-recv/staging/
  receiver/ ... source copy, config/asset-set.json, vendor/cimbar_js.{js,wasm}
  sender/ ... unmodified original sender page and matching encoder assets
```

`build-desktop-recv/`已被现有`build*/`忽略。原始样本、运行文件和录像放独立本轮目录，索引说明是否入库，不能把巨量临时媒体混入提交。`config/profile.json`与`errors.json`从冻结契约来源生成/复制并逐字校验，禁止维护两份独立标准。资产清单由staging生成，真实摘要/证据路径写入后才能放行，不预填虚假严格EOF结果。

新Worker保持classic以加载当前非MODULARIZE的Emscripten脚本；不将其改成module Worker后再调用importScripts。页面ES modules使用`new Worker(new URL('../worker/decoder-worker.js', import.meta.url))`创建新实例。Worker内部初始化/解码代码集中在该文件，通过Node VM的假Module测纯策略，通过浏览器真WASM测试实际字节；VM结果只算unit_integration。无需为了Node测试重构原发送Worker。

## 统一验证命令（目标工具尚待实现）

以下均从仓库根执行。先用真实值设置`$runId`（例如当日唯一运行编号），设置`$nativeBuild`、`$vcpkgToolchain`为盘点确认的绝对路径。命令不能包含未替换的占位值。所有新脚本必须提供`--help`/参数错误非零退出，并明确层级；没有执行真实浏览器时不得返回“E2E PASS”。

| 命令ID | 后续执行命令 | 预期与不能证明的事项 |
|---|---|---|
| CMD-01 | `pwsh -NoProfile -File tools/desktop-recv/inventory.ps1 -RunId $runId` | 创建真实environment.json；未执行的能力null/NOT_RUN，不推测授权或工具可用 |
| CMD-02 | `cmake -S . -B $nativeBuild -A x64 "-DCMAKE_TOOLCHAIN_FILE=$vcpkgToolchain"`；`cmake --build $nativeBuild --config Release --target compression_test cimbar_js_test`；`ctest --test-dir $nativeBuild -C Release -R '^(compression_test|cimbar_js_test)$' --output-on-failure` | 依据现有Windows CI；目标确实被发现且运行，0失败；没有测试/目标即失败，不能因ctest空跑退出0算通过 |
| CMD-03 | 在已有SDK shell：`emcmake cmake -S . -B build-wasm -DUSE_WASM=1 -DOPENCV_DIR=<实际OpenCV源码目录>`；`cmake --build build-wasm --target cimbar_js` | 源码配对产出JS/WASM；不得用USE_WASM=2无解码的asm.js替代；先按原工作流构建匹配OpenCV静态库 |
| CMD-04 | `pwsh -NoProfile -File tools/desktop-recv/stage.ps1 -RunId $runId -Mode assets -WasmBuildDir '<实际构建目录>'`；`node tools/desktop-recv/verify-assets.mjs --root build-desktop-recv/staging/receiver` | 两级路径、同源、摘要、导出/ABI和严格EOF真实证据一致；缺证据/错配非零，不能自动生成PASS。Mode development复制当前已有接收源码/测试以开发；Mode candidate要求完整用户入口与交付清单，不允许缺文件 |
| CMD-05 | `node tools/desktop-recv/run-unit.mjs --all` | 显式枚举8个test.mjs，调用node --test；无失败且无未实现TODO/skip；目标不存在、0测试或未实现均非零。单项可用`--suite session`等 |
| CMD-06 | `pwsh -NoProfile -File build-desktop-recv/staging/receiver/launch.ps1 -Port 8766` | 从脚本所在目录解析根，Python服务只监听127.0.0.1；正常页面/测试页可访问；占用/缺运行时提示，不终止无关服务 |
| CMD-07 | 普通Edge打开`http://127.0.0.1:8766/tests/browser/index.html`，点“运行集成测试”，保存真实运行结果；再打开接收页按E2E逐步操作 | IAT真实Worker/WASM与实际UAT分别留证；浏览器页绿色不覆盖系统对话框/磁盘哈希，必须实际执行后者 |
| CMD-08 | `python tools/desktop-recv/create-fixtures.py --root "docs/tests/runs/$runId/fixtures" --seed 20261018` | 生成可压缩/难压缩、同名同大小不同内容夹具与manifest；输出原始摘要，不伪造编码压缩尺寸或录像 |
| CMD-09 | `python tools/desktop-recv/verify-evidence.py --run "docs/tests/runs/$runId" --gate local` | 检查记录和真实文件/摘要/范围、必测清单；缺真实记录、TODO/NOT_RUN/不等哈希非零；field状态单列 |
| CMD-10 | `python tools/desktop-recv/summarize.py --run "docs/tests/runs/$runId"` | 由真实记录生成支持矩阵/测量汇总，性能阈值未确认为未评定，不把缺项改绿 |

T1.2.c先实现CMD-05的单套件运行能力，此时只迁移当前Task相关骨架到实际测试文件；尚未进入的行为保留在docs骨架，不把它们作为空测试或skip塞进正在验收的套件。单项红绿只证明该Task已实现行为；完整8套件门禁到T4.1.a完善，并核对48个JS用例ID全部已迁移和实际执行，C++另核对6项，不能永久遗漏后续骨架。T2.1.a用户启动器尚未实现时，CMD-07开发集成可先用`python -m http.server 8766 --bind 127.0.0.1 --directory build-desktop-recv/staging/receiver`承载Mode development副本；这不算UAT-L01启动验收。Python开发服务器的默认能力须在本机确认；交付server.py仍按CMD-06明确处理资源类型和退出。

CMD-03优先沿用`.github/workflows/wasm.yml`固定的Emscripten5.0.0/OpenCV4.12.0来源并记录实际工具摘要。`package-wasm.sh`使用mkdir且默认安装回原web目录，不直接在污染当前源树的环境盲目重跑；用干净构建副本/容器执行并从目标输出复制到staging。Docker/SDK不可用先解决构建环境，不能下载不匹配旧二进制冒充修正后产物。CMD-02支持已验证的其他原生平台时按其已存在CI路线配置，记录差别。

## 关键代码与时序约束

下列片段是实施起点，省略的日志/错误包/资源结算必须按契约补全，不能原样粘贴后宣称完整功能。公开消息仍用`{meta,payload}`且meta符合原schema，不新增业务HTTP API。

```javascript
// frame-scheduler.js：分配前和Worker入口都检查；边界检查不是schema替代。
function rgbaBytes(width, height, maxPixels) {
  const pixels = width * height;
  const bytes = pixels * 4;
  if (!Number.isSafeInteger(width) || width <= 0 ||
      !Number.isSafeInteger(height) || height <= 0 ||
      !Number.isSafeInteger(pixels) || pixels > maxPixels ||
      !Number.isSafeInteger(bytes)) throw new RangeError('invalid frame');
  return bytes;
}
// 实际发送前再断言buffer instanceof ArrayBuffer && buffer.byteLength === bytes。
// 最多一个在途槽；发送后不得读取已detach的原buffer；回复/故障/停止只释放一次。
```

```javascript
// UI点击 -> 同步reserve -> 原生选择器；不能先await Worker/摘要读取。
function startLiveFromClick() {
  const token = coordinator.reserveLive(); // 同步校验/身份/去重
  let selection;
  try { selection = navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); }
  catch (error) { coordinator.captureRejected(token, error); return; }
  // 立即安装成功/失败处理，迟到流也按旧cleanupToken关闭。
  coordinator.attachCapture(token, selection);
  coordinator.initializeDecoder(token);
}
// attachCapture和initializeDecoder内部处理自己的拒绝，不能制造未处理Promise。
// 两者都ready后才取帧；若初始化失败，已返回或晚返回的流都关闭。
```

```javascript
// classic decoder-worker.js，在importScripts之前设置var Module。
var Module = {
  locateFile(path) {
    // assets是已核验的本会话AssetSet；这里只返回本清单内的WASM。
    if (!path.endsWith('.wasm')) throw new Error('unexpected loader resource');
    return new URL(assets.wasmPath, receiverRoot).href;
  },
  onRuntimeInitialized() { settleInitReadyOnce(); },
  onAbort(reason) { settleInitFailureOnce(reason); }
};
// 仅在init请求验证assets路径、同源、摘要后importScripts(jsURL)。
// wasm返回int64必须按BigInt正负比较；文件ID用BigInt.asUintN(32, result)截取后格式化。
```

```text
严格C适配（T1.2.a先测试再实现）：
  init时检查ZSTD流对象及init返回；保存最近ZSTD_decompressStream结果、输入消费和输出位置。
  write_once消费输入，必要时用空输入刷新输出；遇ZSTD错误立即返回失败。
  正输出必须完整复制或保留未读余量，不能因为调用方buffer偏小丢字节。
  输入耗尽且lastResult=0、无待输出 -> read返回0。
  输入耗尽且lastResult>0、无输出且无进展 -> 不完整负返回，不无限循环。
  read先保留原负码；_dec->write_once失败不得返回0。
  共享write/decompress分块路径保留兼容；不把每次分块末尾都当整个压缩流EOF。
```

```text
视频：ended锁存 -> 不再等rVFC -> 单槽空闲时至多补采最终可用帧一次
      -> 等最后提交帧结果 -> Ready优先，否则不足数据 -> 有限清理。
保存：点击同步检查Blob/活动尝试 -> 立即showSaveFilePicker -> 得到handle
      -> 若旧cleanupToken已停止，不启动写入 -> 否则createWritable/write/close
      -> 只有close成功为saved；取消/失败保留同一Blob；pending只提示不自动重写。
停止：先失效数据身份 -> 关源/回调/Worker -> 旧picker/IO用cleanupToken继续结算
      -> 全部可证明收敛才cleanupComplete；旧晚提交记录saveStatus，不删文件。
```

用户激活语义、加载器与测试语法已通过Context7核对：[MDN抓屏](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)、[MDN保存](https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker)、[Emscripten Module](https://emscripten.org/docs/api_reference/module.html)、[Node22 test](https://nodejs.org/docs/latest-v22.x/api/test.html)。环境能力仍须实测，这些文档不证明本项目运行通过。

## 逐任务实施步骤

### Task T1.1.a：环境与证据盘点

**Files:** Create `tools/desktop-recv/inventory.ps1`、`docs/tests/runs/<runId>/environment.json`；Read `.github/workflows/ci.yml`、`.github/workflows/wasm.yml`、`vcpkg.json`。无生产Modify。

**AC:** AC-005、AC-012、AC-013。依赖NONE；S。

1. 读取现有工具版本与构建入口；记录实际可执行文件路径、平台/DPI/浏览器和原发送入口。
2. 编写只读盘点脚本和空结果模板；不触发授权，不把安装版本当能力PASS。
3. 执行CMD-01并核对输出文件。预期未运行条目仍NOT_RUN；缺工具列出可执行恢复步骤。
4. 保留原始输出及工作树基线，提交本Task文档/工具；不提交本机敏感路径或无关文件。提交建议`docs: record desktop receiver execution baseline`。

### Task T1.1.b：配对候选与实际原发送窗口

**Files:** Create `docs/tests/runs/<runId>/baseline.md`、`build-desktop-recv/staging/sender/`候选；Read `package-wasm.sh`、`web/index.html`、`web/main.js`、`src/lib/cimbar_js/CMakeLists.txt`。Test原`web/test_send.html`适用项。

**AC:** AC-010、AC-013。依赖T1.1.a；M。

1. 在干净构建副本按原CI固定工具链构建候选，CMD-03；记录完整命令与产物位置，不把构建成功当严格EOF通过。
2. 将原发送页面及其依赖按原相对布局复制到独立sender根，不修改原文件；通过另一回环端口运行。
3. 在普通浏览器独立窗口实际加载原发送B=68，发送已知文件并显示动画；保留版本/画面/来源摘要。
4. 原发送烟测和已有发送回归都通过才完成；没有可运行发送端即阻塞后续真E2E。提交建议`build: document paired sender and wasm baseline`。

### Task T1.2.a：严格EOF最小适配

**Files:** Test/Modify `src/lib/compression/test/zstd_decompressorTest.cpp`、`src/lib/cimbar_js/test/cimbar_recv_jsTest.cpp`；必要Modify `src/lib/compression/zstd_decompressor.h`、`src/lib/cimbar_js/cimbar_recv_js.cpp`。正常ABI/发送协议不改，通常不新增导出。

**AC:** AC-002、AC-008、AC-013。依赖T1.1.b；M。

1. 按UT-049～054和IAT-01加入真实正确/损坏/截断/尾部刷新/重复读取/小输出缓冲测试；沿用现有TEST_CASE/unittest.h。
2. CMD-02确认新增测试实际运行，并记录旧实现的具体行为断言失败；不能仅记录编译/依赖错误。
3. 按上方严格C适配伪代码逐分支修正错误传播和完整状态；先修一个失败，再继续下一分支。保留分块decompress与现有原生接收使用路径。
4. 重跑CMD-02及共享压缩回归，再用CMD-03构建真实WASM执行相同对照。若无需修改也须交付真实证据。提交建议`fix: distinguish decoder completion from truncated input`。

### Task T1.2.b：最终WASM资产及旧发送兼容

**Files:** Create `tools/desktop-recv/stage.ps1`、`tools/desktop-recv/verify-assets.mjs`、staging的`receiver/config/asset-set.json`及`vendor/cimbar_js.js`/`cimbar_js.wasm`；Read原`src/lib/cimbar_js/CMakeLists.txt`。仅ABI/工具链确需时Modify该CMake，留影响说明。

**AC:** AC-002、AC-005、AC-013。依赖T1.2.a；M。

1. 为路径上跳、跨源、摘要/版本不配对、缺EOF证据编写资产检查失败用例；人工换错副本应非零退出。
2. 实现资产复制和真实hash生成，严格EOF报告绑定同一WASM摘要，既验证C导出也验证WASM_BIGINT运行值和HEAPU8。
3. CMD-04，再经真实Worker加载两级路径；证据文件和声明必须一致，不接受只有strictEofVerified=true。
4. 用同一构建回归原发送实际输出和IAT-01，保留源/资产整套关系。提交建议`build: stage verified desktop decoder asset set`。

### Task T1.2.c：新会话Worker与真实字节

**Files:** Create `tools/desktop-recv/run-unit.mjs`，以及新应用根下`package.json`（private/type=module，无第三方依赖）、`worker/decoder-worker.js`、`src/decoder-client.js`、`src/contracts.js`；Test `tests/unit/worker.test.mjs`、`tests/unit/contracts.test.mjs`、`tests/helpers/worker-vm.mjs`、`tests/browser/native-payload.mjs`、`tests/browser/wasm-roundtrip.mjs`、`tests/browser/index.html`（测试路径相对新应用根）。

**AC:** AC-002、AC-007、AC-008、AC-012、AC-013。依赖T1.2.b；M。接口IF-005/006。

1. 先建立isolated package.json和CMD-05明确单套件运行入口；将相关TODO骨架转为实际assert：错误载荷/大小、单在途、原生负值、BigInt、堆复制与解压预算；CMD-05单项记录RED。
2. 实现classic Worker初始化一次、匹配资产加载、bufsize检查、RGBA malloc/复制、scan→fountain→filename→严格decompress；用try/finally处理堆资源。
3. scan无有效数据正常返回no_data，fountain完成ID按BigInt比较，不自动重发帧；每块复制出HEAP再释放；完整Blob放payload而非JSON。
4. 将stage.ps1扩为Mode development并刷新当前源码/测试副本，以开发服务器执行CMD-05及CMD-07真Worker原生ArrayBuffer/Blob和最终WASM；VM fake仅证明策略。保存IAT-01/02/04的真实字节结果后提交`feat: add isolated desktop decoder worker`。

### Task T2.1.a：独立入口、回环启动与能力

**Files:** Create `web/desktop-recv/index.html`、`styles.css`、`src/app.js`、`src/ui.js`、`src/capabilities.js`、`launch.ps1`、`server.py`、`README.md`、`config/profile.json`、`config/errors.json`；Test `tests/unit/ui.test.mjs`。

**AC:** AC-001、AC-003、AC-013。依赖T1.1.a；S。IF-001。

1. 为缺安全上下文/抓屏/保存能力和按钮状态写失败用例；能力探测不应弹授权。
2. 实现双输入、B基线、开始/停止/保存及状态可见；其他模式只显示已验证项。复制配置并在装配时与契约来源校验。
3. 启动脚本以PSScriptRoot定位服务/资源，Python显式绑定回环、正确WASM MIME、无SW，缺运行时/占用端口可恢复。
4. CMD-05/ui及CMD-06；执行UAT-L01/02的实际启动与提示路径。产品帮助不暴露schema/Worker等无关实现细节。提交建议`feat: add independent local receiver entry`。

### Task T2.1.b：实时帧与单会话垂直流程

**Files:** Create `src/session.js`、`src/live-source.js`、`src/frame-scheduler.js`；Modify `src/app.js`、`src/ui.js`；Test `tests/unit/session.test.mjs`、`tests/unit/scheduler.test.mjs`（相对新应用根）。

**AC:** AC-001、AC-002、AC-007。依赖T2.1.a/T1.2.c；M。IF-002/003/006/009。

1. 写一帧在途、忙时丢采样、错误尺寸拒绝、事件递增/读快照测试；用CMD-05取得RED。
2. 按上方点击时序同步reserve和getDisplayMedia；所有Promise即时安装拒绝处理，初始化与选择均ready后取帧。
3. Canvas按videoWidth/videoHeight自然尺寸复制packed RGBA；一帧完成再释放槽，实时忙时不建队列；保留采样/丢弃计数。
4. CMD-05对应套件、CMD-07；普通桌面实际选独立发送窗口取得进度/Ready，保存通路下一Task补齐。提交建议`feat: connect live capture to single-session decoding`。

### Task T2.1.c：首条真实保存往返

**Files:** Create `src/save-controller.js`；Modify `src/app.js`、`src/session.js`、`src/ui.js`；Test `tests/unit/save.test.mjs`；Evidence `docs/tests/runs/<runId>/proof/roundtrip/`。

**AC:** AC-003、AC-004、AC-010。依赖T2.1.b；S。IF-008/009。

1. 写write/close未完成不Saved和显式点击才选目标的失败测试；CMD-05/save确认RED。
2. 实现保存前同步校验，再立即showSaveFilePicker；await只能发生在选择器已调用之后，write+close完成才通知saved。
3. UAT-L03实际选择窗口、接收、点击系统保存；分别对原文件和最终磁盘文件执行Get-FileHash，记录相等SHA-256。
4. 保留对话框/路径/计时及原始hash输出，应用Ready与Saved分开。提交建议`feat: save reconstructed bytes with explicit confirmation`。

### Task T2.2.a：停止、去重、晚授权清理

**Files:** Modify `src/session.js`、`src/live-source.js`、`src/decoder-client.js`、`src/frame-scheduler.js`；Test `tests/unit/session.test.mjs`、`tests/browser/lifecycle.mjs`。

**AC:** AC-006、AC-007。依赖T2.1.b；M。IF-004；C-03/04/05/06/10。

1. 写相同requestId/不同File对象、重复停止、迟到授权/旧Worker/新会话隔离失败测试，CMD-05/session。
2. 创建每会话data token和cleanup token；停止先禁新数据，输入组件关闭自己的资源；active/最近终态去重不长期持有大对象。
3. 重复stop幂等，旧事件只能完成旧清理；未收敛selector/IO保持Stopping并禁止新开始。
4. CMD-07/IAT-03，加UAT-L04/06/07/17/19实际点击与A/B不同hash，资源计数核实。提交建议`fix: isolate stop cleanup and late session callbacks`。

### Task T2.2.b：失败可恢复与无数据提示

**Files:** Modify `src/ui.js`、`src/capabilities.js`、`src/live-source.js`、`src/session.js`、`src/decoder-client.js`；Test `tests/unit/ui.test.mjs`、`contracts.test.mjs`。

**AC:** AC-005、AC-006、AC-007、AC-012。依赖T2.2.a/T2.1.c；S。

1. 写取消/拒绝、track结束、no_data、wrong mode、OOM/trap/超时和预算拒绝的状态断言。
2. 按登记表映射码和恢复动作；普通no_data不刷报错，不把黑画面必然归因权限/模式。
3. CMD-05/ui/contracts；IAT-02/04故障分层记录，UAT-L04/05/06/08/09/10实际交互恢复。
4. 修复后用真实正常窗口再次落盘hash，提交建议`feat: explain capture failures and recovery actions`。

### Task T3.1.a：真实录像选择与受控处理

**Files:** Create `src/video-source.js`；Modify `src/session.js`、`src/app.js`、`src/frame-scheduler.js`；Test `tests/unit/video.test.mjs`、`tests/browser/native-payload.mjs`。

**AC:** AC-008、AC-014。依赖T2.1.b；M。IF-002/007。

1. 写真实File身份/URL一次释放、metadata超时、不支持/损坏、背压媒体时间去重的失败测试。
2. 录像选择用原生file input；File与metadata分离，不把文件内容写入JSON。实际metadata/解码验证后处理，不只看扩展名/canPlayType。
3. 通过呈现帧回调暂停/等待Worker再恢复，记录遗漏，不保证rVFC每帧必达；与实时共用单在途规则。
4. CMD-05/video、CMD-07及UAT-L14/15：发送已关闭时导入真录像保存hash；分别登记两候选格式，至少一种通过。提交建议`feat: decode local recordings with bounded frame processing`。

### Task T3.1.b：最终帧与有限EOF屏障

**Files:** Modify `src/video-source.js`、`src/frame-scheduler.js`、`src/session.js`；Test `tests/unit/video.test.mjs`、`scheduler.test.mjs`、`tests/browser/lifecycle.mjs`。

**AC:** AC-006、AC-008、AC-014。依赖T3.1.a/T2.2.a；S。

1. 写ended先于最后Worker结果、末帧补采、无帧/无进展、媒体错误竞态；CMD-05验证旧逻辑失败。
2. 实现上方有限EOF算法；Ready优先，不等待ended后新的rVFC，不自动循环重放。
3. 冻结该构建排空观察界：至多一次最终补采，最多原在途+最终补采两次frameTimeoutMs，加实际调度容差；日志记录容差，超界失败，不无限等。
4. IAT-03可控时序及UAT-L16真实V-SHORT/V-LAST对照均执行，保存完整版本外部hash。提交建议`fix: drain the final video frame before EOF verdict`。

### Task T3.2.a：保存取消与失败重试

**Files:** Modify `src/save-controller.js`、`src/session.js`、`src/ui.js`；Test `tests/unit/save.test.mjs`。

**AC:** AC-003、AC-009。依赖T2.1.c/T2.2.a；S。

1. 写取消/拒绝/写/close失败后同一Blob重试、requestId去重与原名/安全basename用例，CMD-05/save取得RED。
2. artifactId/attemptId分开；失败收敛后新点击新ID重试，不再读解压器；重名交系统确认，不自动覆盖。
3. IAT-05注入失败分支，UAT-L11/12/13真实取消/重试/重名；停止发送后仍能保存，输出hash不变。
4. 保留实际系统选择器与mock分层证据，提交建议`feat: retry saves without retransferring the artifact`。

### Task T3.2.b：pending写入及停止结算

**Files:** Modify `src/save-controller.js`、`src/session.js`、`src/ui.js`；Test `tests/unit/save.test.mjs`、`tests/browser/lifecycle.mjs`。

**AC:** AC-003、AC-007、AC-009。依赖T3.2.a/T2.2.a；M。

1. 写长IO通知、保存选择晚返回、写中停止晚提交/失败测试，检查没有重复写/假Stopped，CMD-05/save。
2. 保存IO通知定时器只改pending提示；旧cleanup token检查发生在启动write前；已有write按实际结果结算，close成功保存事实不丢失。
3. IAT-05穷举时序；UAT-L13真实模态取消后停止与成功保存后停止，确认磁盘文件不删。
4. 清理全部可证明收敛才允许新会话；不能宣称程序能强制关闭系统模态。提交建议`fix: settle pending saves truthfully during stop`。

### Task T4.1.a：样本与证据记录工具

**Files:** Create `tools/desktop-recv/create-fixtures.py`、`verify-evidence.py`；Modify `tools/desktop-recv/run-unit.mjs`的完整门禁；Test `web/desktop-recv/tests/unit/evidence.test.mjs`；Create `docs/tests/runs/<runId>/fixtures/manifest.json`及本轮样本。

**AC:** AC-004、AC-005、AC-010、AC-012。依赖T1.1.b；S。IF-010/C-12。

1. 写不等hash、缺真实文件/证据、假scope/执行者、空跑/有TODO的门禁失败测试；证据测试可通过Node启动Python工具检查退出码。
2. 用固定种子生成D-C/D-N与同名同大小A/B，CMD-08；实际原发送编码后才记录编码压缩尺寸，未知为null。
3. 实现命令05和09：独立验证最终文件外部hash/路径与结果范围，不接受mock升级local/field，NOT_RUN执行者null。
4. 用空报告验证local gate必须非零，真实报告后再放行。提交建议`test: add reproducible fixtures and fail-closed evidence checks`。

### Task T4.1.b：实际本地完整E2E

**Files:** Create `docs/tests/runs/<runId>/results.json`、`proof/`、`local-report.md`；Read正式E2E计划与本验收基线。仅为问题必要时修改前述实现并关联原Task。

**AC:** AC-001、AC-002、AC-003、AC-004、AC-005、AC-006、AC-007、AC-008、AC-009、AC-010、AC-014。依赖T3.1.b/T3.2.b/T2.2.b/T4.1.a；M。

1. CMD-02/04/05实际绿，打开CMD-06/07，先运行IAT真字节/可控时序并分层记录。
2. 实施方执行UAT-L01～20：实际选窗口/真录像/系统保存；主基线双输入×两类样本各3轮，10轮混合生命周期。
3. 每次落盘外部hash，不用截图或Blob代替；原发送窗口录像必须真实录制，V-LAST有可复现对照。
4. CMD-09门禁必须覆盖所有适用子项；任何必测NOT_RUN/FAIL都不能宣称全功能通过，工具不足实施方补足。提交建议`test: record real local receiver acceptance evidence`。

### Task T4.2.a：容量性能量测和profile校准

**Files:** Create `tools/desktop-recv/summarize.py`、`docs/tests/runs/<runId>/measurements.json`、`measurement-report.md`；必要Modify `docs/design-catalog/contracts/profile-initial.json`及对应应用profile，变更说明留证。

**AC:** AC-005、AC-012。依赖T4.1.b；S。

1. 核对每个往返的原始/编码压缩字节、模式、尺寸/DPI/zoom、源/处理fps、丢采样和各时点/重试。
2. 分别给出初始化/传输重建/保存等待/写入耗时；吞吐公式和时段清楚，系统对话框等待不混成解码速度。
3. CMD-10汇总，按已核实边界扩展1/4 MiB样本；校准profile新ID，受影响边界/生命周期/真实往返重跑。
4. 阈值未确认只报测量，不填性能PASS，不把初值16MiB当实测容量。提交建议`docs: report measured receiver limits and timings`。

### Task T4.2.b：发布支持矩阵

**Files:** Create `docs/tests/support-matrix.md`；Modify `web/desktop-recv/README.md`、`src/capabilities.js`支持清单；Evidence对应浏览器/模式/格式运行索引。

**AC:** AC-010、AC-012、AC-013、AC-014。依赖T4.2.a；M。

1. 按实际Edge/B基线、Chrome和其他模式候选、MP4/H264与WebM/VP8建立组合表；每项单列NOT_RUN/FAIL/已通过范围。
2. 真正发布的每个组合做双类样本适用往返，核对自然尺寸、日常桌面切回接收端和保存可用；失败项不能悄悄留在UI支持清单。
3. CMD-09/10核对证据引用和配置；至少一种真录像组合通过；必要共享修正后再次检查原发送兼容。
4. 交付实测范围及限制，现场仍独立。提交建议`docs: freeze verified browser mode and video support`。

### Task T5.1.a：候选包和正常操作说明

**Files:** Modify `tools/desktop-recv/stage.ps1`、`web/desktop-recv/launch.ps1`、`README.md`；Create staging的`README.md`、`asset-manifest.json`、`LICENSES/`、`tests-index.md`。

**AC:** AC-003、AC-005、AC-010、AC-013。依赖T4.2.a/T4.2.b；S。

1. 清楚列依赖、启动/端口、真实选客户端窗口、录像、停止、保存/取消重试、支持布局和故障恢复；操作文档不用开发者控制台作为必经步骤。
2. stage.ps1使用Mode candidate按完整清单装配独立receiver/sender资产、profile、许可证和证据索引；只复制明确文件，不污染原发送入口；缺入口或文件不得用development模式绕过交付检查。
3. CMD-04及UAT-L01/02/20从全新中文/空格目录验证候选，双输入实际保存hash。
4. 当前仅staging候选，不预称最终product，提交建议`build: assemble a usable local acceptance candidate`。

### Task T5.1.b：内部与独立外审闭环（跨节点）

**Files:** Create `docs/dev-pipeline/ext-review/`独立审查材料、阻塞项/复验索引；Modify必要问题文件，均列影响。Test适用完整套件。

**AC:** AC-005、AC-010、AC-013。依赖T5.1.a/T5.2.a；M。阶段5只完成内审部分，阶段6闭合独立外审。

1. 阶段5核对0 Blocking且必要单元/集成/本地E2E全绿；测试证据对应当前字节，内循环最多10轮。
2. 阶段6由独立Reviewer读需求、实施/TDD/E2E计划和实际报告，检查真实用户路径与mock分界。
3. 外审未通过携Blocking回阶段5修复/复验，外层不限制次数；保留旧结果，不能只改报告结论。
4. 审查结束后准备合并，正式合并由阶段7处理，不在本Task伪称已合并。

### Task T5.1.c：最终测试交付包（阶段8）

**Files:** Create `product/<版本>/`包、用户级`CHANGELOG.md`、摘要/许可证/手册/现场空回执及测试索引。Modify打包清单仅限必要项。

**AC:** AC-003、AC-005、AC-010、AC-013。依赖T5.1.b/T5.2.a；S。

1. 确认阶段6批准且阶段7合并完成，冻结源码/整套资产/profile与被引证据。
2. 从冻结字节打包到product，不混用旧JS/WASM；校验所有摘要/资源和原发送兼容说明。
3. UAT-L20最终包路径再次执行L01/03/11/14，覆盖双输入双类样本，真实保存hash。完整未变套件可引用之前证据，装配变动必须专项复验。
4. 更新交付索引和CHANGELOG，明确这是本地验证的现场测试包；FAT未执行不得写云桌面验收/生产就绪。

### Task T5.2.a：用户现场步骤与空回执

**Files:** Create `docs/tests/field-guide.md`、`docs/tests/field-receipt.json`；在候选/最终包附同版本副本；Read正式E2E计划现场场景。

**AC:** AC-004、AC-005、AC-011、AC-012。依赖T5.1.a；S。

1. 按FAT-01～06写实际客户端窗口、原发送工具/B、双输入、外部hash、日常缩放/布局、取消/停止/重试和复现材料。
2. 回执初始结果NOT_RUN、执行人null、未知测量null，现场与local记录分开；不预填样例hash当真结果。
3. 用CMD-09的field结构检查验证空回执“不通过现场门禁”，再由实施方照说明演练本地操作步骤，仅记local。
4. 将现场操作所需样本/支持矩阵/回滚入口与测试包版本绑定。提交建议`docs: prepare real cloud acceptance instructions and empty receipt`。

### Task T5.2.b：用户真实云桌面执行（外部窗口）

**Files:** 用户实际填写后的新运行目录`docs/tests/runs/<fieldRunId>/`和独立回执；保留原空模板。无默认代码变更。

**AC:** AC-004、AC-005、AC-011、AC-012。依赖T5.1.c/T5.2.a；S。

1. 用户按现场手册运行云端原发送、宿主机客户端/新接收，执行FAT-01～06。
2. 双类样本、双输入分别保存核对云端原文件和宿主机落盘hash；记录环境/测量/限制。
3. 核对field gate；未执行/失败保留NOT_RUN/FAIL，本地报告不能代填。
4. 结论与源码版本/包摘要绑定；不把用户现场等待列为阶段5编码阻塞条件。

### Task T5.2.c：现场条件性整改

**Files:** Create `docs/tests/runs/<fieldRunId>/issue.md`和新复验目录；Modify归因确认的最小接收端文件及回归测试。无现场失败时不主动扩展。

**AC:** AC-004、AC-005、AC-007、AC-008、AC-009、AC-011、AC-013。依赖T5.2.b；M。

1. 仅真实现场失败且归因本接收端时激活；保存来源媒体/错误/参数和复现步骤，不能先重写发送端。
2. 添加能重现问题的失败测试，最小修正，重跑受影响IAT/本地真实E2E，保存新runId。
3. 重新审查/合并/打包受影响版本，再用户现场定向复验；不能覆写原失败证据。
4. 无现场问题时有据标不适用，不是运行PASS。性能目标仍按确认阈值单独评定。

## 提交顺序与交接判据

一种可行实施顺序：T1.1.a → T1.1.b → T1.2.a → T1.2.b → T1.2.c → T2.1.a → T2.1.b → T2.1.c → T2.2.a → T2.2.b → T3.1.a → T3.1.b → T3.2.a → T3.2.b → T4.1.a → T4.1.b → T4.2.a → T4.2.b → T5.1.a → T5.2.a。可在依赖允许时提前盘点/准备样本，不引入外审/现场反向依赖。

Task的AC逐项见上文，全集必须覆盖AC-001～AC-014。验收方案全部UAT-L01～20、IAT-01～06、FAT-01～06均进入正式测试计划；不能以“阶段4.7可选”免除真实操作。阶段5、6、7、8由Claude管理；Codex完成4.x后只把current_phase定位team-exec，不提前改其pending或声称测试已执行。

# B1 工具车道 T6 完成报告（dev-v2-tools）

日期：2026-10-24　基线 HEAD：d77cf229100039f3beaf11bb7fac719efa92f9da
本任务占用桌面车道执行真实 Edge 录像与真实导入；未执行 git 写命令；未改产品代码。

## RunId 与产物

- baseline：`docs/tests/runs/20261024-teamexec-04`（phase=baseline，attemptId=baseline-001；预检 attemptId=preflight-001）
- candidate：`docs/tests/runs/20261024-teamexec-05`（phase=final，attemptId=candidate-placeholder-001；**T6 仅为管线占位，产品后续会改，最终候选在 T34 另立新根**）
- staging（独立根）：
  - baseline `build-desktop-recv/runs/20261024-teamexec-04/{receiver,sender}`
  - candidate `build-desktop-recv/runs/20261024-teamexec-05/{receiver,sender}`
- 证据文件（均已落盘）：
  - `20261024-teamexec-04/{run-context.json, product-manifest.json, input-manifest.json, environment.json, baseline-observation.json, pids.json}`
  - `20261024-teamexec-04/proof/baseline-preflight/preflight-001/{imported.webm, observation.json}`
  - `20261024-teamexec-05/{run-context.json, product-manifest.json, input-manifest.json}`
  - `20261024-teamexec-04/fixtures/…`（基础 fixtures 只读副本 + primary-input-128k.bin + fixtures-media 实录）
  - `20261024-teamexec-04/fixtures-ext/…`（seed 20261018 确定性扩展样本）

## SHA 清单（实际计算）

- baseline 产品 manifest：24 个用户运行文件（index/styles/launch/server/package/config/src/worker/vendor），manifest 自身 SHA-256 = `b8c78a1851e05e8558a3a7b7582c5f67f5df82f3b5429cff3749e472367e6e0d`
- baseline WASM（交付包 `vendor/cimbar_js.wasm`）= `d1080cdc600ca842a337b8ea6157bc5cc2c545aaa75fce7b14e8585e9eb4685b`（= lead 指定的交付值）；JS = `1f36bd07872ea51d5e60ae94fdf545c9bf970534f3d8cd022c8de5582ec5d7ff`
- 交付包核验：`DELIVERY-MANIFEST.txt` 28 条文件条目逐项 SHA/字节比对 → bad=0（时间戳行按格式跳过）；`verify-assets.mjs --root …/receiver` exit 0（ASSET VERIFICATION PASS）
- 主性能输入：`fixtures/primary-input-128k.bin` = 1MiB 难压缩样本前 131072 字节
  - source：`fixtures-ext/incompressible/ext-random-1mib.bin` SHA=`3cd0bea6db019549ee81b1b151d75797485daba542b770126710846f43ff37f9`
  - 新文件 SHA=`8f89c58fc9a16feefa31ce6c8e6146d6003f1b749fcd88ffd5e97ca9fc61f146`，bytes=131072
- 真实录像（record-sender `--only last --payload-file <主输入>`，Mode B，同流双录制，声明 with=9500ms / cut=6500ms，mime video/webm;codecs=vp9，16 Mbps）：
  - `V-LAST-with.webm` SHA=`72a69af0589133d5e266a4f16265ff8ea2a4f288a42b5441e4b20356fac08916`，14,330,428 B，139 帧
  - `V-LAST-without.webm` SHA=`447307f091c57b95b71445722691d0d31efd717df712b7163e929ba8eb44fcc0`，9,807,013 B，94 帧
  - `fixtures-media/manifest.json` SHA=`873598ef1ca7a0e4da7180d218252ac6a924716ede28688dbe5d8170c84f56ed`（含 pair 声明、payloadSha256=主输入 SHA、逐段 sha/bytes、内嵌 prefixCheck）
  - `video-prefix-check` verdict=PASS：head bestOffset=0 / bestMeanAbsDiff=0（阈值 10）；tail 3/3 命中（cut-time-pts 映射）
  - `payloadReused=false`，`payloadSha256` 与锁定主输入一致（未每轮重造随机字节）
- 基础 fixtures 只读复制（run-01 → baseline fixtures）：8 个文件按 run-01 `manifest.json` 逐项 SHA/字节比对 → bad=0；扩展样本重跑幂等（5 个文件哈希与 run-03 reproduction.md 哨兵表逐行一致）
- 输入清单：`input-manifest.json` 锁定 21 个文件（基础 8 + 扩展 5 + 媒体 6 + primary 1 + manifest 若干），SHA=`3bc98c3057f6ea86fd2ece88affdab5f530f9d15d592c166331bdbc5539077fd`；candidate 输入清单引用同一批 SHA，SHA=`0cf50bc26f178bde9323f8c4fb43f6e45cc9b031624d22912cb3d2c954d5a90a`

## 基线预检（配方 F；不是候选性能 PASS）

工具：新增 `tools/desktop-recv/e2e/baseline-preflight.mjs`（T6 执行工具，非产品、非 run-unit 套件；正常启动 Edge + CDP 附加，真实 `<input type=file>` 浏览器级 setInputFiles 等价导入，读页面真实 `__journey/__statusTrail/__contractSnapshot`；仅操作 baseline staging 的 receiver；端口先检；pids.json 登记 receiver-edge/receiver-server；按专用 profile 前缀清理本轮 Edge）。

命令与结果（仓库根，真实桌面车道）：

    node tools/desktop-recv/e2e/baseline-preflight.mjs --context docs/tests/runs/20261024-teamexec-04/run-context.json --video …/V-LAST-with.webm --attempt preflight-001

exit 0；`baseline-observation.json` 摘要：
- observedState=**Ready**；result=READY_OBSERVED
- timing：initMs=118；**readyMs=15012**（journey.readyAt−receivingAt，同 Date 时钟）；wallMs=25194
- processedFrames=**101**（≥30 ✓）
- artifact：byteCount=**131072**（与锁定主输入等长，完整重建）；suggestedName=primary-input-128k.bin
- video sha=V-LAST-with SHA（见上）；productManifestSha256=b8c78a18…

说明：此预检只证明 baseline 可测量且录像可完整重建；不产生任何阈值判定（method `productAcceptance=NOT_RUN` 不变）。

## environment.json（要点）

Windows 10.0.22631（China Standard Time）；Edge 156.0.4314.42（正常启动+CDP，--lang=en-US，recorder/sender 窗 1180×900、预检窗 1280×900）；主屏 2048×1152（LogPixels 未设=默认 96 DPI/100%，CSS viewport/DPR 由页面时点实读）；zh-CN 系统/文化；Node v22.23.1 / Python 3.11.7 / OpenCV 4.11.0；端口 8771/8811/8790/9445/9452/9453；revisions：source=harness=d77cf229…（T6 时点）。

## 验证命令（实测）

| 命令 | exit | 关键输出 |
|---|---|---|
| `node tools/desktop-recv/verify-assets.mjs --root build-desktop-recv/runs/20261024-teamexec-04/receiver` | 0 | ASSET VERIFICATION PASS；wasm=d1080cdc… |
| `python tools/desktop-recv/create-fixtures.py --root docs/tests/runs/20261024-teamexec-04 --seed 20261018 --extended` | 0 | 5 文件哈希与哨兵表一致（幂等重跑二次确认） |
| `node tools/desktop-recv/e2e/run-context.mjs --validate <baseline ctx>` | 0 | identity+abs（见日志） |
| `node tools/desktop-recv/e2e/run-context.mjs --validate <candidate ctx>` | 0 | identity+abs |
| `node tools/desktop-recv/e2e/record-sender.mjs --context <baseline ctx> --only last --payload-file <primary>` | 0 | pair 录制 + prefix-check PASS + manifest |
| `node tools/desktop-recv/e2e/baseline-preflight.mjs …` | 0 | READY_OBSERVED（上节） |

日志归档：`red-logs/t6-verify.txt`、`t6-record2`（任务输出）、`t6-preflight.log`、`t6-record-attempt1-sendermanifest-red.log`。

## 旧目录与只读边界

- T6 前后指纹（T3 基线方法）：三个历史 run + `build-desktop-recv/staging` + `product/` + 旧 planning-cases.json 共 760 项 SHA-256 **UNCHANGED**（`t6-oldruns-after.sha`）。
- baseline receiver 从交付包只读复制（复制前后对包目录 treeDigest 不变）；产品字节零改动。
- 进程/端口：录制与预检后无 `cimbar-e2e-base-`/`cimbar-recorder-` Edge 残留；8771/8811/8790/9445/9452 全部释放；pids.json 留档（下次运行仅回收记录在案且命令行匹配的进程）。

## 实施中的工具修复（配方 R：断言先行）

T6 首次录像即真实 RED：冻结 cimbar-sender 交付包的 `DELIVERY-MANIFEST.txt` 含独立时间戳行（`# generated` 下一行裸 ISO 时间戳，历史生成器格式），T5 的 `readSenderManifest` 拒绝之（`E_SENDER_MANIFEST: unparsable …`，日志 `t6-record-attempt1-sendermanifest-red.log`）。
- 先补测试：`tools/desktop-recv/tests/run-context.test.mjs` 新增第 10 例「T6 sender manifest: frozen package shape accepted, junk refused」（真实包形态正例 + 非注释/非时间戳垃圾行负例）→ 实测 fail（RED=同一缺陷）。
- 最小修复：`run-context.mjs::readSenderManifest` 接受恰好三种非条目行（注释/空行/裸 ISO 时间戳），其余仍拒绝。
- 复跑：run-context 套件 **10/10** PASS。旧 manifest 格式说明也补进代码注释。

## 新增/修改文件

新增：
- `tools/desktop-recv/e2e/baseline-preflight.mjs`（T6 基线预检工具）
- `tools/desktop-recv/tests/run-context.test.mjs` 第 10 例（属修改，见上）
- 两个 run 根的全部证据/上下文/清单/媒体文件（见第一部分；未提交，git-index 由 lead 决定）

修改：
- `tools/desktop-recv/e2e/run-context.mjs`（sender manifest 冻结包格式修复，+4/-2 行）

## 偏差与注意（给 lead 的决策点）

1. **媒体/大文件的 git 边界**：`.gitignore` 只忽略 `docs/tests/runs/*/fixtures-media/`，本轮媒体在 `…/<run>/fixtures/fixtures-media/`（**未被忽略**，含 24MB 录像与 31MB 扩展样本）。建议 lead 提交前二选一：扩展 .gitignore（`docs/tests/runs/*/fixtures/fixtures-media/`）或明确只 add 清单/证明文本（input-manifest、manifest.json、prefix-check.json、observation、context/environment），媒体留工作区。录像哈希不可预知，入库价值仅在复现登记，故本报告不预设。
2. **candidate 产品 manifest 缺 vendor/**：development staging 未含 WASM/JS vendor（assets 模式才会生成）。T34 建最终候选根时必须 stage assets 并刷新 manifest；当前占位 context 已可校验（21 文件）。
3. **candidate phase=final 仅占位**：产品代码即将变更；T31/T34 的候选测量与最终门禁必须使用 T34 新根与本根解耦（报告与 input-manifest note 均已注明）。
4. **基线 strict-EOF 证据引用**：交付包 `config/asset-set.json` 指向 `docs/tests/runs/20261018-teamexec-01/strict-eof-evidence.json`（历史只读，SHA 核对通过）；未复制进 baseline 根，符合“历史只读”。
5. **pids.json** 留在 baseline 根（含 3 条已退出进程记录）：按 T5 守卫语义，下次运行只会尝试回收“命令行仍匹配”的记录进程，退出进程自然 skip。
6. 预检窗口 1280×900 为工具窗口尺寸；页面 CSS viewport/DPR 未在预检中单独取证（T31 环境配对时按 method matchedEnvironment 逐项实读）。此差异已记录，不影响 T6 DoD。
7. 旧 probe/smoke 入口未被运行；run-e2e/recorder 之外的新工具（baseline-preflight）不写任何历史根。

## DoD 对照

- 资产核验通过：verify-assets exit 0，交付包逐文件 SHA bad=0。
- 实际样本/录像与 SHA 存在：input-manifest 21 文件 + 媒体 pair + prefix PASS。
- 输入基线可重现：create-fixtures 幂等（两次运行哈希一致、与哨兵表一致）；主输入从 1MiB 样本切片另存并记录源/新 SHA；录像 payloadSha256=锁定主输入。
- 基线可测量：preflight READY_OBSERVED（readyMs=15012、101 帧、131072 字节完整重建）。
- 无硬凑：所有 exit code 原样记录；唯一中途失败（sender manifest）按配方 R 以测试先行方式修复后复跑通过。

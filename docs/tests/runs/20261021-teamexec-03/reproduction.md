# run-03 可复现清单（reproduction.md）

- 运行目录：`docs/tests/runs/20261021-teamexec-03/`（下称 run-03）
- 本清单对应：round-3 整改任务 TD1（S-3 可复核交付），任务书见 `docs/dev-pipeline/remediation/round-3-tasks.md`
- 生成日期：2026-10-21
- 适用代码：以 run-03 固定候选提交为准（见 run-03 `environment.json` 与 `docs/dev-pipeline/stage5-dev-summary.md` 的基线声明）

本清单只描述**输入与校验方式**，不重述任何 PASS/FAIL 结论；结论一律以 `results.json` 与 `proof/` 为准。

## 1. 目的与边界

### 1.1 fixtures-media 的 gitignore 边界

- `.gitignore` 第 32 行：`docs/tests/runs/*/fixtures-media/`。
- 因此 run-03 的 `fixtures-media/`（真实发送端窗口录像 `V-LAST-with.webm`、`V-LAST-without.webm`、随行 payload 等）**不入库**。
- 干净克隆**不能直接重放**任何录像导入类旅程（E2E-1 的 recorded 腿、E2E-14、E2E-15、E2E-16、E2E-18 的录像腿等）——必须先按第 3 节重建媒体，且重建需要真实 Windows 桌面会话。
- 媒体目录内的 `manifest.json`（录制清单，含各段 sha256）随目录一起不入库。对录像的哈希核对，第三方只能依赖：
  1. 本清单第 2 节的确定性 fixtures 哈希（可逐字节复现）；
  2. 已提交 `results.json` 各记录 notes 中引用的视频 sha256 前缀（如 E2E-14 的 `video sha256 …`）；
  3. 需要完整核对录像哈希时，向运行方索取 `fixtures-media/manifest.json` 内容，或要求其在非忽略路径（如 `proof/`）留档文本副本。
- 本清单不把任何二进制媒体复制进仓库。

### 1.2 其余目录的入库状态

- `docs/tests/runs/20261018-teamexec-01/fixtures/`（基础 fixtures）**已入库**（git 跟踪，含 manifest.json）。
- run-03 的 `proof/`、`results.json`、`fixtures-ext/` 均不在忽略规则内，属可提交证据。
- run-02（`20261019-teamexec-02`）原始证据保留未动；run-01 的 `support-matrix.md` 为历史快照（见第 6 节）。

## 2. 确定性输入：`create-fixtures.py --extended`

### 2.1 命令（仓库根执行）

```powershell
python tools\desktop-recv\create-fixtures.py --root docs\tests\runs\20261021-teamexec-03 --seed 20261018 --extended
```

- `--extended` 只生成扩展规模矩阵到 `<root>\fixtures-ext\`，不触碰基础 fixtures（name-collision 对使用真随机，禁止重写）。
- 种子 20261018 同时是脚本的默认值，此处显式给出以自文档化。
- `run-e2e.mjs` 在 E2E-18 之前会以 `--root <run-03>` 自动调用同一命令（`ensureExtendedFixtures`），正常车道无需手工执行；本节供独立复核者使用。

### 2.2 期望哈希（2026-10-21 于临时根实测捕获，种子 20261018）

| 文件 | 类 | 档位 | 字节数 | SHA-256 |
|---|---|---|---|---|
| compressible/ext-text-1mib.bin | compressible | 1MiB | 1048576 | 2f871833958aeaac4b34be41d81b4b27e9f9b1a3fda21b7d16095c71cf0d1af2 |
| compressible/ext-text-4mib.bin | compressible | 4MiB | 4194304 | aa9738959aaeb3f3c90e3c47ffb79980b14fd43671fa714f6a5d6a0aa7a3c752 |
| incompressible/ext-random-1mib.bin | incompressible | 1MiB | 1048576 | 3cd0bea6db019549ee81b1b151d75797485daba542b770126710846f43ff37f9 |
| incompressible/ext-random-4mib.bin | incompressible | 4MiB | 4194304 | 6181826a9f8660745fce4fd5da548e9df70402ab955fd5c0fb3c38215161f44c |
| over-budget/ext-text-20mib.bin | compressible | 20MiB-over-budget | 20971520 | e828774cbe25606a10b5adb48e4996f0e809b9df7d06b5ecc91df05b04c914a4 |

### 2.3 确定性原理与幂等性

- incompressible：SHA-256 计数器模式 PRF（`block_i = SHA256("<seed>:<i little-endian u64>")`），与 Python 版本的随机实现无关；
- compressible：固定 UTF-8 TEXT_UNIT 平铺到精确尺寸；
- 同种子重跑逐字节一致（幂等）；脚本运行即打印 `sha256  size  file` 自检清单，并写 `fixtures-ext/manifest.json`（含 seed、method 与每文件真实 sha256）。

### 2.4 复核命令

```powershell
$root = 'docs\tests\runs\20261021-teamexec-03\fixtures-ext'
Get-ChildItem -Recurse -File $root -Filter *.bin | ForEach-Object {
  $h = (Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLower()
  $rel = [IO.Path]::GetRelativePath($root, $_.FullName).Replace('\','/')
  '{0}  {1}  {2}' -f $h, $_.Length, $rel
}
```

输出应与 2.2 表逐行一致（相对路径用 `/` 分隔，与 `manifest.json` 的 `file` 字段一致）。

## 3. 非确定性输入：真实录像（record-sender）

### 3.1 命令行

```text
node tools\desktop-recv\e2e\record-sender.mjs --only last
```

参数（键值对形式，均可选）：

| 参数 | 默认 | 说明 |
|---|---|---|
| `--only` | full | `last` 只录 V-LAST 对；`full` 录全套（会重录 V-GOOD-C/N 与 V-SHORT，禁止在保留历史证据的目录使用） |
| `--payload-bytes` | 131072 | V-LAST 对的 payload 字节数（crypto 随机字节，写入 `fixtures-media/payload-<n>k-random.bin`） |
| `--with-seconds` | 40 | V-LAST-with 请求的录制秒数 |
| `--without-seconds` | 6 | V-LAST-without 请求的录制秒数（E2E-16 有效性判据不满足时调大重录） |

### 3.2 输出与 manifest

run-03 的 `fixtures-media/` 下产出 `V-LAST-with.webm`、`V-LAST-without.webm`、`payload-<n>k-random.bin` 与 `manifest.json`。manifest 记录：run 路径、生成时间、**完整命令行**、构造说明（两段同起点）、payload（bytes/sha256）、每个 clip 的 `requestedMs/wallMs/startedAt/stoppedAt/sha256/bytes`。

### 3.3 构造协议（equivalent-traceable 对）

每段 V-LAST 录制前**先 reload 发送端并重新加载同一 payload**：两段都从发送端第 0 帧开始，共享同一条编码轨迹前缀；两段的唯一差异是录制停止时刻。E2E-16 的配对判据依赖这一点（`T*` 以 with 腿完成时刻估计且要求 `T* > without` 时长；不成立时先调大 `--without-seconds` 重录，仍不成立则 E2E-16 如实 FAIL）。

### 3.4 诚实边界：录像哈希不是可预知常量

- 真实屏幕录制逐帧受窗口合成器与采样时刻影响，**不可字节级复现**；V-LAST payload 用 `crypto.randomBytes` 亦非确定。
- 因此对媒体而言"期望输出哈希"不是本清单能预先给出的固定值，而是**生成时刻 `manifest.json` 中的实测值**；重录得到的是新的一对（新哈希），须以新 manifest 为准并同步更新依赖该媒体的记录——不得宣称与原录像同哈希，也不得把旧哈希粘贴进新记录。
- 第三方核对方式：以 manifest 与实际文件做 Get-FileHash 比对（见 3.5）。

### 3.5 媒体哈希复核命令

```powershell
$media = 'docs\tests\runs\20261021-teamexec-03\fixtures-media'
Get-ChildItem -File $media | ForEach-Object {
  '{0}  {1}  {2}' -f (Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLower(), $_.Length, $_.Name
}
```

与 `fixtures-media/manifest.json` 的 payload 与 clips 条目逐项比对（文件、字节数、sha256）。

### 3.6 运行前置条件

- 已完成 staging（发送端静态站位于 `build-desktop-recv/staging/sender`）：
  `pwsh -NoProfile -File tools\desktop-recv\stage.ps1 -RunId 20261021-teamexec-03 -Mode development`
- 真实 Windows 桌面会话 + 正常启动的 Edge（`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`），且系统捕获选择器可被 `native-dialog.ps1` 驱动。
- 端口：8811（发送端 http）、8790（录制页 http）、9452（录制 Edge CDP）。
- 录制属强独占资源：同一时刻只允许一个录制会话。

### 3.7 其余媒体文件的来源

下列文件不由 record-sender 提供，而由 `run-e2e.mjs` 在旅程内自产（crypto 随机或旅程内实录），第三方无需单独重建、也无法预先确定哈希：

- `payload-1m-e2e10.bin`（E2E-10 内生成）
- `e2e6-a/`、`e2e6-b/`（E2E-6 内生成）
- `E2E18-V-C-4mib.webm`、`E2E18-V-N-1mib-probe.webm`、`E2E18-V-N-4mib.webm`（E2E-18 旅程内实录）

V-GOOD-C / V-GOOD-N / V-SHORT 在 `--only last` 模式下被明确跳过（源码输出 "must not change"）；run-03 如需这些输入，其就位方式（复制既有媒体或以 `--only full` 重录）以执行记录为准，本清单不预设。

## 4. 重建与验证步骤（第三方逐步可执行）

前提：Windows + Python 3 + Node.js + Edge；已克隆本仓库并检出到 run-03 对应的固定候选提交。

1. **确定性 fixtures**：执行 2.1 的命令（可先把 `--root` 指向任意临时目录演练），按 2.2 表核对哈希。
2. **staging 构建与资产校验**：

   ```powershell
   pwsh -NoProfile -File tools\desktop-recv\stage.ps1 -RunId 20261021-teamexec-03 -Mode development
   node tools\desktop-recv\verify-assets.mjs --root build-desktop-recv/staging/receiver
   ```

3. **媒体重建**（仅在需要重放录像类旅程时）：执行 3.1，再按 3.5 核对 manifest。此步需要真实桌面会话与系统选择器交互，无法在无头环境完成。
4. **旅程执行示例**（一次只允许一个浏览器会话；旅程运行期间禁跑本地门禁）：

   ```powershell
   node tools\desktop-recv\e2e\run-e2e.mjs --case E2E-16 --source window
   ```

5. **汇总与门禁**：

   ```powershell
   python tools\desktop-recv\summarize.py --run docs\tests\runs\20261021-teamexec-03
   python tools\desktop-recv\verify-evidence.py --run docs\tests\runs\20261021-teamexec-03 --gate local
   ```

6. **已提交证据复核（无需任何媒体）**：

   ```powershell
   Get-ChildItem -Recurse -File 'docs\tests\runs\20261021-teamexec-03\proof' |
     Where-Object { $_.Name -in 'received.bin', 'original.bin' } |
     ForEach-Object { '{0}  {1}' -f (Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLower(), $_.FullName }
   ```

   将输出与 `results.json` 中对应记录的 `referenceSha256` / `receivedSha256` 比对；每条记录的 `proofRefs` 指明所引文件。

重建步骤不复制任何二进制媒体进仓库。

## 5. 第三方可复核范围：已提交证据 vs 需要媒体

| 事项 | 仅凭已提交证据 | 需要媒体/装置 |
|---|---|---|
| 扩展 fixtures 的存在与字节 | 可：按第 2 节重建并比对哈希 | — |
| results.json 各往返的原始/接收哈希一致性 | 可：对 proof/ 文件复算（第 4 节第 6 步） | — |
| 各旅程 attemptId、逐腿状态、NOT_RUN 依据 | 可：读 results.json 与 proof/ | — |
| E2E-16 配对因果（T* 与 without 时长） | 可读时间线记录 | 重放需媒体 |
| 录像导入类旅程重放（E2E-1 recorded 腿、E2E-14/15/16/18 录像腿） | 不可 | 需按第 3 节重建媒体，且需真实桌面会话 |
| 录像文件及其 manifest 的字节核对 | 部分：results.json notes 有视频 sha256 前缀；完整核对需 media manifest 副本 | 需媒体文件 |
| 性能结论 | 不可得：性能保持 NOT_EVALUATED（阈值未冻结），无可复核的吞吐主张 | — |

补充说明：`fixtures-media/manifest.json` 若由运行方转存文本副本到非忽略路径（如 `proof/`），第三方即可在不持有媒体的前提下核对录像哈希；本清单不代为转存。

## 6. run-01 支持矩阵：历史快照声明

`docs/tests/runs/20261018-teamexec-01/support-matrix.md` 是 2026-10-18 时点的**历史快照**：它记录当时的装置与环境支持情况，不随后续轮次（run-02 / run-03）的装置变化而更新，也不用于替代 run-02 / run-03 的支持记录。引用其中"需真人操作"等表述时，只作为历史时点记录，不作为当前能力主张。正式声明文本由 TD2 落在该矩阵文件或 run-03 对应声明处。

## 7. 本清单哈希的捕获方式（可审计性）

- 第 2.2 节哈希于 2026-10-21 由以下命令在**临时根**捕获（未写入 run-03 目录，避免与在跑车道互扰）：

  ```text
  python tools\desktop-recv\create-fixtures.py --root <temp> --seed 20261018 --extended
  ```

- 捕获后以 Get-FileHash 独立复算，结果与脚本输出逐行一致。
- run-03 的 `fixtures-ext/manifest.json` 由车道生成后，其哈希应与 2.2 表逐行一致；若不一致，说明生成参数或代码发生变更，应停止引用并重新对账（本表同时充当回归哨兵）。
- 媒体（第 3 节）不存在可预知哈希；其哈希锚点以生成时刻的 `fixtures-media/manifest.json` 为准。

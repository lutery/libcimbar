# B8 工具车道 T33 报告（记录契约整改）

日期：2026-10-25　基线 HEAD：5964995（未执行任何 git 写命令；产品代码零改动）
运行根：docs/tests/runs/20261025-teamexec-09b（product manifest 9e2595e6…，本任务全部为 harness 变更，产品字节不变）

## Blocking 1 整改内容（仅 tools，不改校验器）

文件：`tools/desktop-recv/e2e/ui-journeys.mjs`（run-e2e 接线未改）

1. **proofRef 统一为 run 根相对且位于 `proof/<caseId>/<attemptId>/` 内**（照 E2E-27/30..34 写法）：
   - 记录级 `proofRefs[0]/[1]` = `proof/<caseId>/<attemptId>/original.bin`、`received.bin`。`makeRecorder.finish(result, notes, receivedAbs, referenceAbs, extraProofRefs)` 现在把 reference/received **实际复制进 attempt 目录**后从复制目标重新哈希（`sha256File(target)`），不再引用 fixtures 或外部保存路径。
   - 每个 assertion 的 `proofRef` 一律用 `proofRef(name)` 助手拼 run 根相对路径；E2E-35 的 S02-held（`screens/s35-foreground-blank-5s.png`）、S04-stop（新增实拍 `screens/s35-stop-frozen.png`）、E2E-36 的 S04-B（新增实拍 `screens/s36-s04-saved.png`）不再出现 `null` 或未拍摄文件。
   - 截图/保存产物若原本落在别处，一律在写入时落到 `proof/<caseId>/<attemptId>/` 下（screens/、saved-*.bin 现地可见）。
2. **E2E-38 测量产物纳入 proof**：comparison/summary/environment/input/manifest/run.json + `live/summary.json` + `live/rounds/pair-1..5-{A,B}.json` 全部复制到 `proof/E2E-38/<attemptId>/measurements/`（可复制引用，原测量目录保留）；记录级 proofRefs 指向 `.../measurements/summary.json`、`.../measurements/comparison.json`、`.../measurements/live/summary.json`；断言 R1/R2/L1 的 proofRef 分别指向 comparison/summary/live-summary，均在 canonical 目录内。
3. **NOT_RUN 记录（E2E-37）**：executedBy/startedAt/finishedAt = null，proofRefs/assertions = []，reference/received SHA = null（配方 A）。

## 执行链（同根、同构建、逐 attempt 保留原件）

| attempt | 结果 | 说明 |
|---|---|---|
| UX-UI-…05-54-25-779Z-5fc4af | CASE FAIL | 首跑：`proofRef is not defined`（助手误放 makeRecorder 作用域），E2E-35/36 立即 FAIL；原件保留 |
| UX-UI-…05-59-13-045Z-91e09a | CASE PASS，记录不合规 | 修助手后 35/36/38 PASS、37 NOT_RUN；门禁报 6 类 proofRef 格式违规（见下「修复前」） |
| UX-UI-…06-32-29-167Z-380c2a | 中止（无记录） | finish() 内 `sha256File(readFileSync(target))` 把 Buffer 当路径传 → ERR_INVALID_ARG_VALUE，E2E-35 保存后中止，upsert 未到达；部分产物目录保留 |
| UX-UI-…06-45-04-195Z-9170ae | **CASE UX-UI PASS（exit 0）** | 修正为 `sha256File(target)` 后全绿；本条 attempt 的记录即当前 ux-results.json 中 35/36/37/38 四条 |

## 最终门禁输出（实跑，exit 1 符合预期）

命令：`python tools/desktop-recv/verify-ux-evidence.py --context docs/tests/runs/20261025-teamexec-09b/run-context.json --gate local`

```
UX GATE local: FAIL (12 violation(s))
  - missing UX record for required case E2E-27
  - missing UX record for required case E2E-28
  - missing UX record for required case E2E-29
  - missing UX record for required case E2E-30
  - missing UX record for required case E2E-31
  - missing UX record for required case E2E-32
  - missing UX record for required case E2E-33
  - missing UX record for required case E2E-34
  - E2E-37: the local gate requires result PASS (got 'NOT_RUN')
  - E2E-37: executedBy must be executor per the plan (got None)
  - legacy gate failed (exit 2); results.json is still governed by verify-evidence.py
  - legacy: no results.json in E:\Project\OpenSource\c++\libcimbar\docs\tests\runs\20261025-teamexec-09b
```

### 两类失败的区分

**A. 真实缺口（保留，属 T35 范围）——12 条全部此类：**
- E2E-27/30..34 的记录现存于切片/媒体运行根（20261024-teamexec-06/07/08），09b 根尚无；完整矩阵合根是 T35 的职责；
- E2E-28/29 尚未实现（T35）；
- E2E-37 因 AT/语音不可程序化核验如实 NOT_RUN，local 门禁要求 PASS——真实缺口，T35 处理；
- 遗留 v1 results.json 缺失（E2E-1..26 旧口径）同样是 T35 的合根工作。

**B. 格式违规（本任务已全部清零）：**
修复前同命令在 91e09a 记录上共 19 条违规，其中格式类为：
- `E2E-35: proofRef not found on disk: …/original.bin`（记录级，未复制）
- `E2E-35: assertion[1] proofRef is not canonical inside the run root: None`（S02-held）
- `E2E-35: assertion[4] proofRef is not canonical inside the run root: None`（S04-stop）
- `E2E-36: proofRef not found on disk: …/original.bin`、`…/received.bin`
- `E2E-36: assertion[7] proofRef not found on disk: …/screens/s36-s04-saved.png`（引用未拍摄）
- E2E-38 记录级 proofRefs 指向测量目录而非 attempt 内 canonical 位置
现最终门禁输出中已无任何 proofRef / NOT_RUN 字段类违规（19 → 12，减少的 7 条全为格式类）。

## 合规记录抽查（9170ae，逐字段来自 ux-results.json）

- **E2E-35 PASS**：proofRefs = original.bin / received.bin（均 131072B，SHA=8f89c58f… 两侧相等）；5 条断言全 PASS，proofRef 均在 `proof/E2E-35/9170ae/screens/` 内且磁盘存在。
- **E2E-36 PASS**：proofRefs = original.bin / received.bin（均 1048576B，SHA=3cd0bea6… 相等）；8 条断言全 PASS，含新增 `s36-s04-saved.png`；另存 saved-longname.bin(1MiB)/saved-video.bin(128KiB) 于同目录。
- **E2E-37 NOT_RUN**：executedBy/startedAt/finishedAt 均为 null，proofRefs=[]。
- **E2E-38 PASS**：3 条断言 PASS；measurements/ 下 7 个 JSON + live/summary.json + 10 个 round JSON 共 18 文件齐备。

## 顺带 S1（收口节）

`docs/dev-pipeline/receiver-ux-v2/review-ui-perf.md` 末尾已追加：

```
## 收口（T33）

- B1/B2 CLOSED（T30 工具侧整改 + 45/45 复验）。
```

## 回归与边界（全部实跑）

| 命令 | exit | 结果 |
|---|---|---|
| `node tools/desktop-recv/run-unit.mjs --all` | 0 | UNIT SUITES PASS (12 suite(s)) |
| `python tools/desktop-recv/tests/ux-evidence-selftest.py` | 0 | SELFTEST PASS (55 cases) |
| `python tools/desktop-recv/verify-evidence-selftest.py` | 0 | SELFTEST PASS (14 cases) |
| `node --check tools/desktop-recv/e2e/ui-journeys.mjs` | 0 | OK |
| `git diff --check` | 0 | 仅 LF/CRLF 警告，无空白错误 |

- 旧证据指纹（01/02/03 旧运行 + build-desktop-recv/staging + product + docs/tests/planning-cases.json，760 项 SHA-256+size）与 t31c-oldruns-after.sha 逐行比对：**UNCHANGED**（留档 `red-logs/t33-oldruns-after.sha`）。
- 产品目录 `web/desktop-recv`、`worker` git 状态 0 行；本轮产品字节零改动。
- 运行后 recorded pids 全部不存活、8771-8776 端口无监听；中止的 380c2a 残留进程已由 process-guard 回收（0/12）。
- 工作树本轮变更：`tools/desktop-recv/e2e/ui-journeys.mjs`（唯一工具改动）、09b 根 pids.json/ux-results.json/新 attempt proof 目录、red-logs/t33-oldruns-after.sha、review-ui-perf.md 收口节。

## 备注

- E2E-35 可见性分支（真实最小化 9s 时 `visibilityState` 仍 visible，harness 旗标所致）自 91e09a 起不再作为断言计分，改为 `visibilityNote` 写入记录 NOTES；S02-held（前台空白源 heldMs≥6000）作为独立可复核断言保留。
- E2E-37 的 NOT_RUN 属真实缺口而非格式问题：门禁两条违规（要求 PASS、executedBy=executor）按指示保留给 T35。

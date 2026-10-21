# 内部审查归档 — Round 8（round-7 Blocking 整改复核，delta）

- 范围：`80c92dd..ce4051c`（单提交：planning caseType 声明、双门禁类型交叉校验、E2E-16 负向腿纳入判定、E2E-5/19 诚实证据与重跑、harness 加固）。
- 审查结论：**通过（0 Blocking）**。Round-7 的 B-1/B-2/B-3 全部真实关闭，均有本轮独立执行或代码级推演证据；delta 内未发现新的 Blocking 回归。

## 独立复核（本轮实际执行）

- `node tools/desktop-recv/run-unit.mjs --all`：exit 0，9 套件 90 测试（evidence 16 含 UT-083/084），0 fail/todo/skip。
- `verify-evidence.py --run docs/tests/runs/20261019-teamexec-02 --gate local`：PASS（20 required cases），exit 0；`--gate field`：FAIL（6 violations，E2E-21..26 缺记录），exit 1——诚实负例保持。
- `verify-evidence-selftest.py`：14/14（新增 relabelled caseType、plan-without-caseType 两负例）。
- **独立重放 B-1 攻击**（自有临时目录与 planning，不依赖其 selftest）：
  - relabel（计划 file_roundtrip、记录 negative_or_lifecycle + 仅日志）：Python `GATE local: FAIL`，2 violations（类型不符 + 缺工件，双重拒绝），exit 1；JS `ok=false` 同报。
  - 计划缺 caseType：`E2E-3: the plan does not declare a caseType`，exit 1（fail-closed 成立）。
  - 正向对照（类型一致 + 工件哈希相等）：JS `ok=true`。
- `docs/tests/planning-cases.json`：26/26 e2eScenarios 均已声明 caseType（E2E-1..20 与 E2E-21/22/25 file_roundtrip、E2E-23/24 negative_or_lifecycle、E2E-26 measurement）。
- 证据重算：20/20 记录的 proof 对 SHA-256 全部重算相等；E2E-16 新链（fixtures-media 载荷 = proof/original = proof/received = round-with/received = `bab4d8c0…`）逐字节核对一致。
- 重跑真实性核验（非仅凭声明）：proof/E2E-5、E2E-16、E2E-19 的 screens 文件 mtime 为 2026-10-21 10:02/10:25/10:30（重跑时刻）；E2E-16 载荷/录像链（payload-128k + V-LAST 对，10-20 19:58-19:59 重录）与新记录哈希吻合；E2E-19 `round-after-reopen/`（log "status=Saved … saved (1)"、received.bin 哈希 = `2f5a22f9…` 样本一致）为新增提交。E2E-5/E2E-19 其余 proof 字节未变系确定性输出（同状态同像素），非未执行的迹象；results.json 备注为新代码独有格式，构成重跑路径的独立佐证。

## Blocking issues

无。逐项关闭核验：

- **B-1（已关闭）**：`plan_rows` 读 `case.get("caseType")`（verify-evidence.py:130-136）；类型不符/计划缺类型均 violation（:230-240）；**工件校验改按计划类型触发**（:241-243）——即使重标记录也必须交出字节工件。JS `validateRunGate` 对称实现（evidence.js:149-160）。selftest 14 例 + UT-083/084 负例在库。攻击重放两端均拒绝。
- **B-2（已关闭）**：E2E-16 `const pass = equal && !withoutReady`（run-e2e.mjs，round-7 B-2 注释块）；重生成记录 PASS 且 notes 明示 "V-LAST-without incomplete=true … PASS requires the V-LAST-without leg to end Incomplete (withoutReady=false)"；重跑产物（新载荷哈希 `bab4d8c0…`、changed screenshots）已提交。
- **B-3（已关闭）**：E2E-5 在 7 秒观察窗口**之后**重读 `pageState` 并以 `afterWindow.saveDisabled === true` 判定，notes 记录窗口后状态与 artifact 为空；E2E-19 真实关页重开（`oldPage.close()` + `oldClosed` 入判定 + 新页 `waitForSelector('#btn-video')`），pass = `oldClosed && allEqual`，四轮往返全等；batch-l-status.md 与 stage5-dev-summary.md 的夸大措辞已同步更正。

## Suggestions

- S-1（沿袭 round-7）：E2E-3/4/7/11/14/18/20 仍无 honest-FAIL try/catch——崩溃时 results.json 保留旧 PASS（runner exit 1 诚实，但门禁输入陈旧）。建议统一兜底。
- S-2：`fixtures-media/` 为 gitignore（`docs/tests/runs/*/fixtures-media/`，批次 L 起）：录像证据与再生成载荷仅存在于工作树，round-2 外审只能凭已提交 proof 工件/截图与门禁复算核验，无法直接复跑录像输入旅程。建议在 round-2 包中明示该边界（非新回归）。
- S-3：`pipeline-state.json` 的 `updated_at` 出现 `…Z+08:00` 混合格式，纯外观。

## 审查者

- 内部审查 Round 8（delta 复核），实施方独立复核者：Claude（review-7 agent），2026-10-21。只读；未修改产品代码。本轮实际执行：单元全套、两门禁、selftest、独立 relabel/fail-closed 攻击重放（Python+JS）、planning 完整性清点、20/20 哈希重算、E2E-16 载荷链核对、重跑 mtime 取证、ce4051c 全量 diff 审查（含 harness hard-exit、stack.close 目标修正、context 级 init script——均未见回归）。

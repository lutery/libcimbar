# B1 工具车道 T1 完成报告（dev-v2-tools）

日期：2026-10-24　分支：receiver-ux-v2（HEAD 2b47233 之后，本任务未执行任何 git 命令）

## 文件清单

新增：
- `tools/desktop-recv/tests/run-context.test.mjs`（26,132 字节；UX-UT-081..086；`node --check` 通过）
- `tools/desktop-recv/tests/ux-evidence-selftest.py`（26,404 字节；UX-UT-088..095；`python -m py_compile` 通过）

修改：无。未触碰 `web/desktop-recv/`、`worker/`、历史 run 目录（20261018/20261019/20261021）、`build-desktop-recv/staging`、旧 planning-cases.json。两文件未注册进 `run-unit.mjs`（工具独立测试）。

## RED 证据（均为目标模块缺失，非骨架守卫/路径/语法错误）

命令 1（仓库根执行）：

    node --test tools/desktop-recv/tests/run-context.test.mjs

退出码 1。关键输出：

    Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'E:\Project\OpenSource\c++\libcimbar\tools\desktop-recv\e2e\run-context.mjs' imported from E:\Project\OpenSource\c++\libcimbar\tools\desktop-recv\tests\run-context.test.mjs
    # pass 0
    # fail 1

命令 2（仓库根执行）：

    python tools/desktop-recv/tests/ux-evidence-selftest.py

退出码 1。关键输出：

    FAIL preflight: missing E:\Project\OpenSource\c++\libcimbar\tools\desktop-recv\verify-ux-evidence.py (module missing)
    FAIL preflight: missing E:\Project\OpenSource\c++\libcimbar\tools\desktop-recv\e2e\run-context.mjs (module missing)
    SELFTEST FAIL (module missing)

## 旧自测回归（T1 仅新增测试文件；实测均绿）

    python tools/desktop-recv/verify-evidence-selftest.py
    -> exit 0，SELFTEST PASS (14 cases)

    python tools/desktop-recv/e2e/video-prefix-check.py --selftest
    -> exit 0，SELFTEST PASS (3/3 cases)

    node tools/desktop-recv/run-unit.mjs --all
    -> exit 0，UNIT SUITES PASS (9 suite(s))，0 failed / 0 todo / 0 skipped

## 测试覆盖要点（对应 tooling.json）

- run-context：配方 A 字段全集校验、缺/多字段、坏 JSON、未知 phase、runId/attemptId/revision 形态、加载零写入；CJK+空格仓库根与 fixtureRoot 传播、runner/recorder `--validate-only` 同一上下文身份（contextSha256 一致）；`../`/盘符/URI/反斜杠/规范化越界/同名前缀孪生根/staging 固定根/fixtureRoot 越界/junction 逃逸、历史 run 根与指向历史 run 的路径；baseline/candidate 根相等拒绝、stage.ps1 `-StagingRoot` 只写声明根且共享 staging 与 product/ 指纹不变；resume 仅同 runId/phase/manifest/attempt（含 slice 冒充 final 拒绝、纯 harnessRevision 变更可续跑）、attempt 目录不可覆写；产品 manifest 磁盘重算（篡改/缺文件/文本改 SHA/未排序/重复/base 逃逸拒绝、纯工具提交不换产品绑定）。
- ux-evidence-selftest：正例 local/field 全绿；CLI `--help`/缺参=2、未知 gate=2、缺 context 文件/坏 JSON 非 0；漏任一 UX 必测 ID 逐个失败并点名、空 uxRequired 不可豁免；错 runId/记录 manifestSha、产品字节篡改、inputManifestSha 错配；元数据假等哈希、缺收件、越根 proofRef、空 proofRefs；scope/执行者/caseType 升级、NOT_RUN 伪造执行者/时点；重复 caseId、额外未规划 ID、旧 attempt 冒充；空 assertions、空 observed、FAIL 断言、断言缺 proof 文件；slice 冒 final、local 不代 field、field measurement 未绑定 legacyThreshold 拒绝；UX 记录进 results.json 不算 UX 证据、v1 规则对 results.json 依旧生效（caseType 消息透传）；NOT_RUN 文件字节不变。

## 偏差说明

无计划冲突。一点设计说明（T2 实现需遵循，测试已编码）：
1. `run-e2e.mjs`/`record-sender.mjs` 新增 `--validate-only` 与 `--repo-root`（诊断参数：仅解析并打印上下文身份 JSON，无副作用；`--repo-root` 供临时仓库夹具用，缺省为仓库真实根）。
2. `verify-ux-evidence.py` 接受 `--repo-root`（同上用途），并通过 `node e2e/run-context.mjs --validate` 复用同一上下文解析器（单一事实源）。
3. 产品 manifest 格式：`{"version":1,"iterationId":"receiver-ux-v2","base":"receiver","files":[{path,sha256,bytes}...]}`，files 按相对路径严格排序，base 须位于 stagingRoot 之下；manifest 自身 SHA 写入 context.productManifestSha256。
4. 错误码前缀 `E_CONTEXT_*`/`E_MANIFEST_*`/`E_ATTEMPT_EXISTS`，具体见测试断言。

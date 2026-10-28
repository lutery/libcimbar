# 外审交付包 — Round 16（1.2.0 转正：PS 5.1 启动器兼容正式化）

> 按 dev-pipeline 阶段 6 生成。外部审查者请只读本清单内材料；结论按
> `round-16-template.md` 的固定章节输出。编号公式：ext_rounds=15，verdict 文件 = `round-16-verdict.md`。
>
> 本包审查对象是 **1.2.0 转正增量**（1.1.0 已交付并通过 round-14；PS5.1 预览补丁已通过
> round-15）。本包不重开已关闭主题；原 E2E-35/37、现场 7 项的边界维持用户既有决定。

## 审查对象

| 项 | 值 |
|---|---|
| 仓库/分支 | libcimbar · `ps51-preview`（基线 = master `7b91057`，即 1.1.0 已交付状态） |
| 1.2.0 候选 | 运行根 `docs/tests/runs/20261028-teamexec-13`；product manifest **`7a5e5f1a…`**（27 文件）；attempt `candidate-20261028-01`；source/harness `7e34289` |
| 范围 | `7b91057..64b54ad`：6 提交（ff21be5 启动器兼容、a2c05e1 预览件、b807d1e S15-01 修正、7e34289 版本号+计划、6360cab sender 包字节修复、64b54ad root13 证据） |
| 与 1.1.0 候选的逐文件差异（lead 亲核） | **23/27 字节相同**；变化恰为 4：`config/asset-set.json`（sourceRevision 重戳 7e34289）、`launch.cmd`、`launch.ps1`、`package.json`（version 1.2.0）。**运行时字节（index/styles/src×15/worker×2/vendor×2/server.py/config×2）逐一相同** |
| 前序外审 | round-14 通过（1.1.0 核心验收）；round-15 通过（预览补丁，0 阻断，S15-01 已修） |

## 1.2.0 变更内容

1. `launch.ps1`：`#Requires -Version 5.1`；控制台流 UTF-8 固定（5.1 下 CJK+空格路径输出防乱码；pwsh 7 无副作用）；帮助文案双引擎；失败诊断在可取时打印准确子进程退出码、不可取时**明确输出 `server process exited with an unknown code`**（S15-01 修正，实测根因：5.1 的 Start-Process+文件重定向在子进程退出后句柄不可用——Handle/ExitCode/StartTime 全空且 WaitForExit/Refresh 不可恢复；pwsh 7 正常）。
2. `launch.cmd`：`where pwsh` 优先，否则回退 `powershell -NoProfile -ExecutionPolicy Bypass -File launch.ps1 %*`。
3. `package.json`：version 1.2.0。
4. 接收器 web 运行时**零字节变化**（23 文件 SHA 与 1.1.0 候选逐一相同）。

## 验证证据（全部可复核）

| 证据 | 位置/命令 | 结果 |
|---|---|---|
| 启动矩阵（机读） | `tools/desktop-recv/e2e/ps51-launch-check.mjs`；JSON `docs/tests/runs/20261028-teamexec-13/logs/ps51-launch-check.json` | **8/8 PASS**：5.1 直启 / CMD pwsh 分支 / CMD **5.1 回退分支**（子进程级 PATH 去 pwsh，先断言 where pwsh 失败）/ 端口占用 exit3 / 缺文件 exit4 / 无 python exit2 / 快退 exit(23)：5.1→unknown+5、7→code23+5；正例均 HTTP 200 且 index/wasm SHA 等于 staging 文件 |
| E2E-1（打包接收端自管理启动链） | root13 `proof/E2E-1/`（attempt `…-4eb514`） | PASS：CJK+空格目录 README 形式 launch.cmd exit0、pwsh 绝对路径预检 exit0、live 原/收 SHA 相等、V-GOOD-C 录像导入相等 |
| E2E-2（启动失败恢复） | root13 `proof/E2E-2/`（attempt `…-f75684`） | PASS：端口占用 → launch.ps1 exit3（原因可读）→ 释放后干净重启 exit0 → 恢复轮 live 相等 |
| 非桌面全量 | root13 `logs/green-sweep.log` | run-unit 12 套 **222**；tools 三套件 **69**；ux-selftest **77**；legacy-selftest **14**；video-prefix **3**；check-contracts PASS |
| 1.1.0 证据的字节身份复用 | `docs/tests/runs/20261027-teamexec-12`（product `829d7dec…`） | 双门禁 lead 复跑：legacy `PASS (20 required cases)`、UX exit1 恰 4 条授权缺口——运行时 23 文件逐字节相同，故 root12 的 legacy 20/20、UX 12 条、A/B 5/5、live 10/10 证据对 1.2.0 继续有效（附逐文件 SHA 表） |
| 冻结件 | `git diff 0ed2e5b..HEAD -- docs/plans/receiver-ux-v2/performance-method.json` | 空；v1 契约 SHA 不变 |

## 材料清单

| 类别 | 路径 |
|---|---|
| 计划 | `docs/dev-pipeline/receiver-ux-v2/release-1.2.0-plan.md`（含"22→23"口径修正注记） |
| 前序裁决 | `round-14-verdict.md`（1.1.0 通过）、`round-15-verdict.md`（预览补丁通过，S15-01） |
| 实现/修复提交 | `ff21be5`、`a2c05e1`、`b807d1e`、`7e34289`、`6360cab`、`64b54ad` |
| 证据根 | `docs/tests/runs/20261028-teamexec-13/`（results.json 仅含 E2E-1/2——root13 不冒充 20 案门禁；启动矩阵 JSON；green-sweep；fixtures-provenance-r13 含 fixtureDrift/root12ManifestDrift 披露） |
| 历史/前候选根 | root12（1.1.0 候选 `829d7dec…`）、root11/root10/09b——全部只读 |

## 复跑命令

```powershell
node tools/desktop-recv/run-unit.mjs --all                                     # 222
node --test tools/desktop-recv/tests/measure-ux.test.mjs tools/desktop-recv/tests/run-context.test.mjs tools/desktop-recv/tests/process-guard.test.mjs   # 69
python tools/desktop-recv/tests/ux-evidence-selftest.py                        # 77
python tools/desktop-recv/verify-evidence-selftest.py                          # 14
python tools/desktop-recv/e2e/video-prefix-check.py --selftest                 # 3
python docs/design-catalog/receiver-ux-v2/contracts/check-contracts.py

# 启动矩阵（机读；对 staging receiver）
node tools/desktop-recv/e2e/ps51-launch-check.mjs --staging build-desktop-recv/runs/20261028-teamexec-13/receiver --out docs/tests/runs/20261028-teamexec-13/logs   # 期望 8/8 PASS, exit 0

# E2E-1/2（root13）
node tools/desktop-recv/e2e/run-e2e.mjs --context docs/tests/runs/20261028-teamexec-13/run-context.json --case E2E-1
node tools/desktop-recv/e2e/run-e2e.mjs --context docs/tests/runs/20261028-teamexec-13/run-context.json --case E2E-2

# 1.1.0 证据的字节身份（双门禁 + 逐文件 SHA）
python tools/desktop-recv/verify-evidence.py --run docs/tests/runs/20261027-teamexec-12 --gate local --planning docs/tests/receiver-ux-v2/planning-cases.json
python tools/desktop-recv/verify-ux-evidence.py --context docs/tests/runs/20261027-teamexec-12/run-context.json --gate local   # exit1 恰 4 条授权缺口
node -e "const fs=require('fs');const a=JSON.parse(fs.readFileSync('docs/tests/runs/20261028-teamexec-13/product-manifest.json','utf8')).files;const b=JSON.parse(fs.readFileSync('docs/tests/runs/20261027-teamexec-12/product-manifest.json','utf8')).files;let s=0,ch=[];for(const f of a){const o=b.find(x=>x.path===f.path);if(o&&o.sha256===f.sha256)s++;else ch.push(f.path);}console.log('same='+s+' changed='+JSON.stringify(ch));"   # 期望 same=23 changed=[asset-set,launch.cmd,launch.ps1,package.json]

git diff 0ed2e5b..HEAD -- docs/plans/receiver-ux-v2/performance-method.json   # 期望为空
```

## 诚实性边界

1. 现场 7 项（E2E-21..26/39）用户侧，NOT_RUN 设计内；E2E-35（用户裁定）、E2E-37（环境）继续 NOT_RUN。
2. **root13 仅承载受影响 E2E（E2E-1/2）与启动矩阵**，不冒充 20 案门禁；1.1.0 的全量矩阵证据按字节身份（23/27 SHA 相同）继续有效，该论断附逐文件对照表供复核。
3. **root12 input-manifest 的历史簿记缺口**：对 6 个运行期生成/覆写的 fixtures-media 文件（E2E18-V-C/N×3、e2e6-a/b、payload-1m-e2e10）记录的 SHA 与磁盘不符——这些文件由 E2E-6/10/18 运行中生成，"预锁 SHA"先天不成立；root13 两份清单按磁盘真值重哈希并把 6 条差异全文记入 `fixtures-provenance-r13.json` 的 fixtureDrift/root12ManifestDrift。root12 未改一字；E2E-1/2 与启动矩阵不消费这 6 文件。
4. **sender 包 autocrlf 缺陷（本轮发现并修复）**：被跟踪的 `product/cimbar-sender-1.0.0-20261023-1458` 的 16 个文本文件在 blob 中被 autocrlf 归一为 LF，与 DELIVERY-MANIFEST（CRLF 原始字节）不符 → stageVerifiedSender 拒收（1.2.0 staging 时发现；1.1.0 staging 时工作树尚为原始字节故未暴露）。修复 `6360cab`：从权威 zip 恢复原始字节入库（product/** -text 钉住下逐字存储），21/21 校验通过，复验 SENDER-RESTAGE-OK。这是 7b91057 同型缺陷的第四处表现。
5. **staging 行尾组装方法**：1.1.0 候选的运行时字节为混合行尾（12 文件 CRLF、7 文件 LF，历史编辑产物），当前检出的工作树全为 CRLF；为守"字节身份复用"前提，root13 staging 按 round-15 预览件同一公式组装（23 运行时文件取 1.1.0 包字节＋launch 两文件取工作树 CRLF＋package.json 取 HEAD blob＋asset-set 由 stage.ps1 重写）。
6. 计划文档"22 个运行时文件"为笔误，实测口径 23（27−4）；已在计划文档加注并以实测表为准。
7. E2E-1/2 在 harness 内经 pwsh 正常分支执行；5.1/回退分支由启动矩阵机读覆盖（含真实 HTTP 与字节断言）——两者互补构成启动面的完整验证。
8. round-15 裁决所记 zip SHA `ceec8280…` 对应旧预览件 `…-1447`（保留未动）；正式 1.2.0 包将在本轮通过后从 root13 staging 组装，SHA 将不同。

## 与前轮的关系

- round-14（1.1.0 核心）与 round-15（预览补丁）结论保持不变；本包只审 1.2.0 增量。
- 本轮通过后：从 root13 staging 组装 **libcimbar-desktop-receiver 1.2.0** 正式包（目录+zip+RELEASE-NOTES/CHANGELOG/DELIVERY-MANIFEST）并合并至 master。

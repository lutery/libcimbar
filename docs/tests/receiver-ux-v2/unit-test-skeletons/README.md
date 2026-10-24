# 仅规划单元测试骨架

12份骨架对应80条单元/工具用例：11个Node文件、1个Python文件。每份有顶部`PLANNING_ONLY`错误，且每个用例体还有`SKELETON_ONLY`错误，误执行必定非0。没有产品导入、skip/todo或假通过断言。

骨架语法/守卫校验不是产品测试，守卫错误也不算TDD业务RED。阶段5先迁移/合并到下表正式位置，再补真正的Given/When/Then夹具与行为断言，最后移除守卫；必须看到对应功能断言RED后才能实现产品。

| 骨架 | 目标正式测试文件 | 注册规则 |
|---|---|---|
| [worker.test.mjs](worker.test.mjs) | `web/desktop-recv/tests/unit/worker.test.mjs` | 合并到既有套件，不覆盖旧用例 |
| [client.test.mjs](client.test.mjs) | `web/desktop-recv/tests/unit/client.test.mjs` | 合并到既有套件 |
| [session.test.mjs](session.test.mjs) | `web/desktop-recv/tests/unit/session.test.mjs` | 合并到既有套件 |
| [ux-telemetry.test.mjs](ux-telemetry.test.mjs) | `web/desktop-recv/tests/unit/ux-telemetry.test.mjs` | 新增，T10显式注册 |
| [ux-view.test.mjs](ux-view.test.mjs) | `web/desktop-recv/tests/unit/ux-view.test.mjs` | 新增，T10显式注册 |
| [ux-display.test.mjs](ux-display.test.mjs) | `web/desktop-recv/tests/unit/ux-display.test.mjs` | 新增，T10显式注册 |
| [save.test.mjs](save.test.mjs) | `web/desktop-recv/tests/unit/save.test.mjs` | 合并到既有套件 |
| [video.test.mjs](video.test.mjs) | `web/desktop-recv/tests/unit/video.test.mjs` | 合并到既有套件 |
| [ui.test.mjs](ui.test.mjs) | `web/desktop-recv/tests/unit/ui.test.mjs` | 合并到既有套件 |
| [run-context.test.mjs](run-context.test.mjs) | `tools/desktop-recv/tests/run-context.test.mjs` | 工具独立Node测试，含runner拒绝漏测用例 |
| [measure-ux.test.mjs](measure-ux.test.mjs) | `tools/desktop-recv/tests/measure-ux.test.mjs` | 工具独立Node测试 |
| [ux-evidence-selftest.py](ux-evidence-selftest.py) | `tools/desktop-recv/tests/ux-evidence-selftest.py` | 工具独立Python自测 |

本目录不能加入`run-unit.mjs`的ALL_SUITES，不能复制到用户包。原9套与新增3套产品测试共12套；另3个工具骨架最终在工具目标执行，不能把本目录12份骨架数量混淆为正式suite数量。

完整用例：[test-cases.md](../test-cases.md)，状态一律NOT_RUN；本文没有任何GREEN/覆盖率或真实验收声明。

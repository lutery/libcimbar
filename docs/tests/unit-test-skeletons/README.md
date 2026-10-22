# 单元测试骨架使用说明

这里是阶段4.5规划产物，8个JS文件登记48个test.todo，C++文本模板登记6个用例；**不是已实现/已运行产品测试**。不得把todo/skip或Node进程退出0作为单测通过。

| 骨架 | 后续目标 |
|---|---|
| [contracts.test.mjs](contracts.test.mjs) | web/desktop-recv/tests/unit/contracts.test.mjs |
| [session.test.mjs](session.test.mjs) | web/desktop-recv/tests/unit/session.test.mjs |
| [scheduler.test.mjs](scheduler.test.mjs) | web/desktop-recv/tests/unit/scheduler.test.mjs |
| [worker.test.mjs](worker.test.mjs) | web/desktop-recv/tests/unit/worker.test.mjs，VM fake仅测策略 |
| [save.test.mjs](save.test.mjs) | web/desktop-recv/tests/unit/save.test.mjs |
| [video.test.mjs](video.test.mjs) | web/desktop-recv/tests/unit/video.test.mjs |
| [ui.test.mjs](ui.test.mjs) | web/desktop-recv/tests/unit/ui.test.mjs |
| [evidence.test.mjs](evidence.test.mjs) | web/desktop-recv/tests/unit/evidence.test.mjs |
| [strict-eof.cpp.txt](strict-eof.cpp.txt) | 原compression及cimbar_js测试文件；文本有#error，防空测试被误编译成通过 |

每条给出Given/When/Then。阶段5先写真实arrange/act/assert，确认行为失败再改生产实现；不要把test.todo改名为空test后宣称完成。C++移植时去掉#error并补实际字节断言，编译错误不算业务RED。

例如在目标`scheduler.test.mjs`中将UT-002/003对应行为写成下面的实际测试（需要在实现模块导出被测纯函数；测试文件路径和函数定义必须一致）：

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { rgbaBytes } from '../../src/frame-scheduler.js';

test('UT-003 pixel budget rejects upper bound plus one', () => {
  assert.equal(rgbaBytes(2, 3, 6), 24);
  assert.throws(() => rgbaBytes(2, 3, 5), RangeError);
  assert.throws(() => rgbaBytes(0, 3, 6), RangeError);
  assert.throws(() => rgbaBytes(Number.MAX_SAFE_INTEGER, 2, 6), RangeError);
});
```

确切目标用例在[登记](../test-cases.md)及[实施计划](../../plans/2026-10-18-desktop-receiver-implementation.md)。以上示例只验证尺寸函数，不能证明真实RGBA、Worker、抓屏、保存或E2E。

本轮只允许对骨架执行`node --check <骨架文件>`检查语法；没有执行这些产品测试。后续CMD-05真实测试门禁必须拒绝0测试/剩余TODO/不当skip。原生File/ArrayBuffer/Blob、资源释放、严格EOF、最终磁盘hash分别按IAT和E2E验证。

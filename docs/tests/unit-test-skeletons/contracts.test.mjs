// Planning skeleton only. NOT a product test run; keep TODO until real assertions exist.
import test from 'node:test';

// Given: 伪装ArrayBuffer的普通对象
// When: 提交decoder.frame
// Then: 返回类型错误且不调用WASM
test.todo("UT-001 拒绝非原生帧载荷");

// Given: 2×3帧配23/24/25字节
// When: 校验并提交
// Then: 仅24字节通过；不截断或补零
test.todo("UT-002 RGBA精确长度");

// Given: 上限和上限加一/整数乘积溢出
// When: 分配前校验
// Then: 越界拒绝且不分配；边界内精确匹配
test.todo("UT-003 像素预算边界");

// Given: 同requestId同内容但不同File对象
// When: 重复session.start
// Then: 相同对象幂等，不同对象返回冲突
test.todo("UT-004 File对象身份去重");

// Given: Blob长度和artifact.byteLength不同
// When: 接收产物
// Then: 拒绝错配，不进入Ready
test.todo("UT-005 原生Blob与元数据一致");

// Given: 53登记码及未知原生错误
// When: 生成错误包
// Then: 外层code/name/retryAction一致；未知原因不编造
test.todo("UT-006 错误码登记一致");

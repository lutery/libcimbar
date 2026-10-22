// Planning skeleton only. NOT a product test run; keep TODO until real assertions exist.
import test from 'node:test';

// Given: 一帧在途，新实时帧
// When: submit
// Then: 不排队/不重发；drop计数+1
test.todo("UT-013 实时忙时丢采样");

// Given: 一帧在途，新录像呈现帧
// When: 等待后续提交
// Then: 媒体暂停/恢复配对，单槽不超过1
test.todo("UT-014 录像背压");

// Given: 同一frameId超时/停止/回复
// When: 以所有顺序结算
// Then: 槽位仅释放一次，不变负数
test.todo("UT-015 终止和回复竞争");

// Given: transfer列表中的真实ArrayBuffer
// When: postMessage后访问策略
// Then: 主线程不再消费原缓冲；Worker返回字节独立
test.todo("UT-016 detach后不读取");

// Given: 自然尺寸与CSS显示尺寸不同
// When: 提取RGBA
// Then: 使用自然宽高；预算不够拒绝而非静默缩图
test.todo("UT-017 自然尺寸不缩放");

// Given: EOF与最终帧回复竞争
// When: 锁存并排空
// Then: 回复前不判不足；最多一次最终补采，无无限等待
test.todo("UT-018 EOF在途屏障");

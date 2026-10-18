// Planning skeleton only. NOT a product test run; keep TODO until real assertions exist.
import test from 'node:test';

// Given: fake同步调用顺序记录器
// When: 点击startLiveFromClick
// Then: picker调用前没有await Worker；仅一个会话
test.todo("UT-007 同步reserve并调用选择器");

// Given: 相同requestId和参数
// When: 快速调用两次start
// Then: 只有一次picker和Worker；返回同操作
test.todo("UT-008 重复开始幂等");

// Given: 停止A后新B及A晚回复
// When: 派发消息
// Then: B进度/产物不变，A只清理
test.todo("UT-009 旧Worker回复丢弃");

// Given: A选择器未决时内部stop
// When: 让旧授权返回stream
// Then: track立即stop，未收敛前不新开始
test.todo("UT-010 迟到授权流释放");

// Given: 活动picker或写入尚未返回
// When: stop/read/重复stop
// Then: Stopping且cleanupComplete=false，重复停止无副作用
test.todo("UT-011 未决清理快照");

// Given: 同名同大小内容不同A/B
// When: 停止后启动B
// Then: 计数从零；无A Blob/File引用；eventSeq/身份一致
test.todo("UT-012 新会话干净状态");

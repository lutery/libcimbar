// Planning skeleton only. NOT a product test run; keep TODO until real assertions exist.
import test from 'node:test';

// Given: 已重建Blob及fake调用序列
// When: saveFromClick
// Then: 立即picker；不从Worker回调自动弹窗
test.todo("UT-025 显式用户点击才选目标");

// Given: 分别延迟write/close
// When: 保存
// Then: 两者都成功才saved；拒绝时可重试
test.todo("UT-026 write和close完成才Saved");

// Given: 第一次AbortError，第二次成功
// When: 两次独立点击
// Then: 同一artifact，不再解压/接收，输出字节不变
test.todo("UT-027 取消后同Blob重试");

// Given: 延迟IO超过notice期限
// When: 等提示并重复保存
// Then: 仍pending，只有一次写；不假成功或自动重试
test.todo("UT-028 pending不重复写");

// Given: picker未返回时内部停止
// When: 返回handle
// Then: 不调用createWritable；旧清理收敛后可新会话
test.todo("UT-029 停止后才选定目标");

// Given: 写已启动后stop，close晚成功
// When: 结算旧attempt
// Then: 如实saveStatus=saved，文件不删除；新会话不被覆盖
test.todo("UT-030 在途写晚提交不删除");

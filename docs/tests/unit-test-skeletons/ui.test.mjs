// Planning skeleton only. NOT a product test run; keep TODO until real assertions exist.
import test from 'node:test';

// Given: 缺抓屏/保存/安全上下文
// When: inspect
// Then: 仅报告实际能力，不弹系统授权
test.todo("UT-037 能力检查无授权副作用");

// Given: 已捕获但长时间无有效帧
// When: 等待notice
// Then: 显示检查来源/模式，不报完成/错误风暴/确定原因
test.todo("UT-038 no_data提示准确");

// Given: Preparing/Receiving/Ready/Saving/Stopping
// When: 应用snapshot
// Then: 状态可见，未收敛禁新开始，保存仅可用产物
test.todo("UT-039 状态按钮一致");

// Given: 输入授权取消/拒绝
// When: 错误后新点击
// Then: 可理解提示和恢复，不自动再弹授权
test.todo("UT-040 取消拒绝可恢复");

// Given: 旧session/revision/eventSeq
// When: 更新snapshot
// Then: 拒绝旧事件，当前进度不回退
test.todo("UT-041 旧事件不回写界面");

// Given: 中文空格/路径分隔/缺名
// When: 准备picker选项
// Then: 只给安全basename/回退名，不静默覆盖；系统确认另做E2E
test.todo("UT-042 建议名安全与重名");

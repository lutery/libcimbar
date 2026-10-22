// Planning skeleton only. NOT a product test run; keep TODO until real assertions exist.
import test from 'node:test';

// Given: 声明PASS但两侧摘要不同
// When: verify-evidence
// Then: 非零失败，不能只改hash文本放行
test.todo("UT-043 文件往返不等hash拒绝");

// Given: 不存在路径或空proofRefs
// When: local gate
// Then: 非零，截图不能替代最终文件hash
test.todo("UT-044 实际证据缺失拒绝");

// Given: mock声称local/field或历史当当前
// When: 记录/验证
// Then: 拒绝跨范围PASS；不改变现场NOT_RUN
test.todo("UT-045 scope不能升级");

// Given: NOT_RUN却填executor/user
// When: 校验记录
// Then: 拒绝；空现场模板保持未执行
test.todo("UT-046 未执行者为空");

// Given: runner得到0测试或todo/skip
// When: unit gate
// Then: 非零，不因Node退出0记全绿
test.todo("UT-047 TODO和零测试不放行");

// Given: 有measurement但无确认阈值
// When: 汇总报告
// Then: 功能/测量/性能目标/现场分列，目标未评定
test.todo("UT-048 性能无阈值不PASS");

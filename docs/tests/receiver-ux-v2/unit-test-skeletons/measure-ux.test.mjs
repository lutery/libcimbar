// Planning skeleton only. Never register docs files in the product runner.
import test from 'node:test';
throw new Error('PLANNING_ONLY: complete real assertions at the stage-5 target before running');

// Given: 已排序1..100ms RTT、有效Ready起止和负/缺/混时钟字段
// When: 计算nearest-rank与各轮中位数
// Then: p50=50、p95=95、5轮[10,20,30,40,50]中位数30；缺失不估算
test("UX-UT-096 分位数和Ready差值按独立算例计算", () => {
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Given: Bready=1000，Brtt50=10，Brtt95=20；固定method
// When: 比较C边界和超边界样本
// Then: ready=1350、p50=12、p95=25通过；分别加0.001ms失败
test("UX-UT-097 三个性能阈值等号通过而越界失败", () => {
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Given: 4对或任一轮<30帧、不同WASM/input/media/browser/viewport/instrumentation，另有完整5对
// When: 配对与比较
// Then: 不完整NOT_RUN；完整正例按阈值判定
test("UX-UT-098 五对样本和匹配环境缺一不可判定", () => {
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Given: 某有效候选轮未Ready/产物错误/单在途破坏，其他轮更快
// When: 汇总与替换策略
// Then: FAIL并保留失败轮，不能只挑正常快轮比较
test("UX-UT-099 候选真实失败不能作为噪声剔除", () => {
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Given: 真正环境不匹配的无效对及0/1/2/3对替换场景
// When: 保存原件、标原因、重测整对
// Then: 最多2对且最终仍有5对有效才能比较，超过或不足NOT_RUN
test("UX-UT-100 无效配对最多替换两对且原始数据不删除", () => {
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Given: 数字区高频mutation、合法即时按钮/终态更新、原live busy丢采样
// When: 测量DOM间隔/实际pending与清理
// Then: 数字写间隔≥250ms、pending≤1；业务即时事件不误算，原合法drop可记录
test("UX-UT-101 只计遥测数字写入且保留原busy丢采样策略", () => {
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Given: 录像5对完整主数据、实时5对各30秒活动段、某浏览器不支持longtask
// When: 汇总结果
// Then: 实时行为独立检查，未支持长任务为NOT_MEASURED有原因，不造0或传输SLA
test("UX-UT-102 实时观测与录像数值主判据分列", () => {
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

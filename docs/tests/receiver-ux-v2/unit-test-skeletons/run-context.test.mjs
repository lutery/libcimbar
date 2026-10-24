// Planning skeleton only. Never register docs files in the product runner.
import test from 'node:test';
throw new Error('PLANNING_ONLY: complete real assertions at the stage-5 target before running');

// Given: argv缺context、JSON缺必填字段或未知phase；write/spawn均有调用计数
// When: 解析并准备执行
// Then: 非0/明确错误，未写任何文件也未启动桌面或服务
test("UX-UT-081 缺少运行上下文先拒绝且零副作用", () => {
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Given: 新根名称含中文与空格，隔离sender/receiver/fixtures/plan；旧根字节快照
// When: 通过runner→recorder→proof/result/样本/诊断子调用写入临时实物
// Then: 所有输出位于声明根，旧根SHA不变
test("UX-UT-082 中文空格目录完整传播到所有写入者", () => {
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Given: ../、绝对盘符、URI、解析后越界、历史run输出、指向外部根的可构造链接
// When: 解析输出路径和证明路径
// Then: 写入前拒绝，不跟随逃逸至历史/外部路径
test("UX-UT-083 路径逃逸和历史输出根被拒绝", () => {
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Given: 两个独立staging，旧v1包只读清单；另有相同/相互包含根的负例
// When: 构建/复制和上下文校验
// Then: 只命中各自根，相同或重叠根拒绝
test("UX-UT-084 基线候选staging严格分开且原包只读", () => {
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Given: 已有context/runId/attempt/manifest与原proof；同身份和变更身份两个分支
// When: 请求恢复或重新执行
// Then: 仅一致身份可显式恢复，跨构建拒绝；原attempt原件保留
test("UX-UT-085 续跑只接受同一运行身份且保留旧attempt原件", () => {
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Given: 产品文件清单排序SHA、sourceRevision/harnessRevision；只改工具或实际改一字节产品
// When: 创建/复核manifest
// Then: 工具版本变化可另记；产品字节变化必须新manifest/attempt且旧证据不可复用
test("UX-UT-086 产品摘要与工具提交分别绑定", () => {
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

// Given: 临时runner副本含12套预期与新UX三套；缺文件/0test/skip/todo/真实失败分支
// When: 执行--all和定向套件
// Then: 缺失/未完成/失败非0，完整真实通过才0
test("UX-UT-087 显式测试套件不能漏注册或以空测试绿灯", () => {
  throw new Error('SKELETON_ONLY: implement assertions before genuine RED');
});

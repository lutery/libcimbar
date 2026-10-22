# docs/src —— 报告的源文件与工具

本目录是 `../cloud-desktop-screen-capture-feasibility.md` 的**源**。那份成品报告由
`parts/` 下的分片自动生成，**不要直接编辑成品**——改了下次组装就会被覆盖。

## 为什么要拆成这么多小文件

长中文文档通过 LLM / agent 工具链写入时，有两个已经被观察到的坑：

1. **单次长 Write 会在中段损坏，而尾部看起来完全正常。** 只检查尾部发现不了。
2. **拿中文当锚点做 Edit 是不安全的。** 即使十几行的文件，也会被悄悄换掉一个汉字
   （实测过 `装` → `荝`）。

所以这里用「分片 + ASCII 组装器 + 探针校验」：每个分片一次 Write（写入是安全的通道），
组装器拼接并校验**每一片的收尾行是否存活**，校验不过就报错退出，不产出半成品。

## 目录

```
parts/    每章一个文件，按文件名顺序拼接（00- 开头是封面）
tools/    assemble.py 组装并校验
          verify.py   成品体检（编码 / 换行 / 关键锚点）
          patch.py    中文安全改字（锚点写在 JSON 里，不经过 shell）
```

## 用法

**改内容**——编辑 `parts/` 下对应的分片，然后：

```bash
python docs/src/tools/assemble.py    # 拼接 + 探针校验，输出到 docs/<报告名>.md
python docs/src/tools/verify.py      # 检查编码、换行、关键锚点
```

**改中文、又不想手敲锚点**——把 old/new 写进一个 JSON spec（用工具写，不要用 shell 拼），
格式见 `patch.py` 的文件头注释：

```bash
python docs/src/tools/patch.py --check spec.json   # 先看会改什么，不落盘
python docs/src/tools/patch.py spec.json           # 再改
python docs/src/tools/assemble.py                  # 重新组装
```

`patch.py` 的 `expect` 字段是**必须**的：出现次数对不上就直接中止。这是为了堵住
"命令跑了、但什么都没改"这种静默失败——在这类文档上它发生过。

## 校验判据

`verify.py` 判定 PASS 的条件：CR 计数为 0（纯 LF）、行数大于 100、`ANCHORS` 里每个
ASCII 锚点都能在成品里找到。往报告里加了值得守住的事实，就顺手往 `ANCHORS` 补一条。

## 关于报告本身

报告内容是关于 libcimbar 的两件事：项目完整性审计，以及「云桌面录屏 → 本地接收文件」
的可行性分析。它由编排式多 agent 只读审计生成，**所有结论均未经过编译或运行验证**，
详见报告第 2 章的证据质量声明。

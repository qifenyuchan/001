# 四轮调研总整合：3704 个仓库之后，我们知道什么

> 生成时间：2026-10-20 03:24　|　数据：`research/github-all.json`（四轮合并，`merge_all.py` 产出）

## 0. 这份报告是什么

四轮扫描到此收线。这份报告**不是新一轮扫描**，是把四份报告放在一起做的合并分析：

| 轮次 | 视角 | 报告 |
|---|---|---|
| 一 | 技术：记忆产品 | [RESEARCH.md](RESEARCH.md)（主报告，含 9.5） |
| 二 | 技术：相邻领域 | [RESEARCH-GITHUB.md](RESEARCH-GITHUB.md) / [RESEARCH-ADJACENT.md](RESEARCH-ADJACENT.md) |
| 三 | 技术：领域上游 | [RESEARCH-EDGE.md](RESEARCH-EDGE.md) |
| 四 | 人群：理工与文创 | [RESEARCH-DOMAINS.md](RESEARCH-DOMAINS.md) |

回答三个问题：**四轮加起来到底知道什么（收敛）、哪些判断被推翻了（修正）、接下来做什么（路线图）。**
第五轮不做——第四轮已覆盖理工/文创；用户聚集地（读帖子）成本收益不划算，技术扫描正式结束。

## 1. 数据全景：真实并集是 3704

先修正一个此前各报告反复引用的口径错误：此前说「四轮共 4118 个仓库」，
那是把第一轮的**原始**去重数（1603）和其他轮的去重数直接相加——
既没扣跨轮重叠，第一轮的 1603 里还包含大量未通过相关性过滤的仓库（入库的只有 1325）。
统一口径后的真实数字：**四轮入库合计 3840，跨轮重叠 136，真实并集 3704。**

| 轮次 | 视角 | 本轮去重 | 与其他轮重叠 |
|---|---|---|---|
| 一 | 记忆产品 | 1325 | 与二 59、与三 14、与四 48 |
| 二 | 相邻领域 | 1037 | 与三 12、与四 6 |
| 三 | 领域上游 | 769 | 与四 2 |
| 四 | 理工与文创 | 709 | — |
| **并集** | | **3704** | 跨轮重叠 136 |

- **重叠结构本身是信息**：

- 一↔四重叠最大（48）——搜「memory」的第一轮和搜「人群」的第四轮会撞见同一批编码记忆项目，说明编码记忆确实是两边都显眼的红海；
- 三↔四重叠最小（2）——**领域上游和用户群落几乎完全正交**，这两条路都不白走；
- 四轮两两重叠都不到 60，**没有任何两轮互相包含**——四种视角各自贡献了独立的信息。

其他全景数字：

- **记忆信号项目 1421 个**（描述含记忆语义词，剔除 in-memory 假阳性后）
- **中文描述项目 144 个**（占 3.9%——但第四轮文创类的中文项目 star 全线过千，量小声大）
- 语言分布：Python 1273 / TypeScript 632 / JavaScript 296 / Rust 278 / Go 167——Rust 在嵌入式引擎侧的占比远超它在通用生态的占比
- **中位 star 只有 17**，均值 1025——整个领域是被极少数头部和一巨大长尾构成的，长尾才是真实生态

## 2. 跨轮复现：131 个项目被两种以上视角同时命中（有效 130）

一个项目只在一轮出现，可能是查询词的巧合；**被两种正交视角同时命中，就是真信号**。
四轮里有 126 个项目出现在两轮、5 个出现在三轮。

### 出现三轮的 5 个（剔除 1 个噪声后为 4 个）

三轮命中 = 技术视角、相邻视角、人群视角里它都冒头。这是全库最强的信号：

| Star | 项目 | 命中轮 | 是什么 |
|---|---|---|---|
| 7459 | [Gentleman-Programming/engram](https://github.com/Gentleman-Programming/engram) | R[1, 2, 4] | Persistent memory system for AI coding agents. Agent-agnostic Go binary with SQLite + FTS5 |
| 66 | [yantrikos/yantrikdb](https://github.com/yantrikos/yantrikdb) | R[1, 2, 3] | Cognitive memory engine for AI agents — temporal decay, contradiction detection, autonomou |
| 28 | [anthony-maio/mnemos](https://github.com/anthony-maio/mnemos) | R[1, 2, 3] | Biomimetic memory architectures for LLMs — surprisal gating, reconsolidation, affective ro |
| 24 | [qyiun666/MemHop](https://github.com/qyiun666/MemHop) | R[1, 2, 3] | Embedded long-term memory database for AI agents & LLM apps. Six-layer cognitive architect |

- **engram**（7459）：Go 单二进制、SQLite+FTS5、MCP——四轮口径下它反复出现，是编码记忆红海里体面最大的选手，也是「SQLite+FTS5 及格线」的最好例证。
- **yantrikdb / mnemos / MemHop**：三个都是低 star 项目，但都被三轮命中——它们的关键词组合（temporal decay、surprisal gating、六层认知结构）恰好落在多个视角的交集上。**低 star + 多轮命中 = 被低估的方向**。

### 双轮命中的头部（节选）

| Star | 项目 | 命中轮 | 说明 |
|---|---|---|---|
| 283914 | [affaan-m/ECC](https://github.com/affaan-m/ECC) | R[1, 4] | The agent harness performance optimization system. Skills, instincts, memory, secu |
| 84150 | [bytedance/deer-flow](https://github.com/bytedance/deer-flow) | R[1, 4] | An open-source long-horizon SuperAgent harness that researches, codes, and creates |
| 77051 | [ruvnet/ruflo](https://github.com/ruvnet/ruflo) | R[1, 4] | 🌊 The original agent harness. Deploy intelligent multi-player swarms, coordinate a |
| 46935 | [DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) | R[1, 4] | High-performance code intelligence MCP server. Indexes codebases into a persistent |
| 31023 | [mksglu/context-mode](https://github.com/mksglu/context-mode) | R[1, 4] | Context window optimization for AI coding agents. Sandboxes tool output (98% reduc |
| 29684 | [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) | R[1, 4] | #1 Persistent memory for AI coding agents based on real-world benchmarks |
| 29632 | [TencentCloud/TencentDB-Agent-Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory) | R[1, 4] | TencentDB Agent Memory is a team-level memory hub for AI Agents — turning conversa |
| 28022 | [gastownhall/beads](https://github.com/gastownhall/beads) | R[1, 4] | Beads - A memory upgrade for your coding agent |
| 15647 | [AgriciDaniel/claude-obsidian](https://github.com/AgriciDaniel/claude-obsidian) | R[1, 3] | Self-organizing AI second brain for Obsidian + Claude Code. Drop any source and Cl |
| 11455 | [holaboss-ai/holaOS](https://github.com/holaboss-ai/holaOS) | R[1, 4] | Open-source agentic workspace enterprises can make their own. Connect the systems  |
| 11168 | [akitaonrails/ai-memory](https://github.com/akitaonrails/ai-memory) | R[1, 4] | Solution for long term memory for agent coding CLIs and to facilitate handoff betw |
| 9967 | [xerj-org/xerj](https://github.com/xerj-org/xerj) | R[1, 4] | XERJ is the new way for AI to search data. Its autoindex capability activates agen |
| 9271 | [MervinPraison/PraisonAI](https://github.com/MervinPraison/PraisonAI) | R[1, 4] | PraisonAI 🦞 — Hire a 24/7 AI Workforce. Stop writing boilerplate and start shippin |
| 8917 | [HarnessMD/munder-difflin](https://github.com/HarnessMD/munder-difflin) | R[1, 4] | an open-source alternative to the dots, bots and muses of the world, run an office |
| 8444 | [deeplethe/utopia](https://github.com/deeplethe/utopia) | R[1, 2] | World's first open-source enterprise world model. |
| 7862 | [Gentleman-Programming/gentle-ai](https://github.com/Gentleman-Programming/gentle-ai) | R[1, 4] | Gentle-AI configures the AI coding agents you already use: Claude Code, Cursor, Op |
| 5988 | [ModelEngine-Group/nexent](https://github.com/ModelEngine-Group/nexent) | R[1, 4] | Nexent is a zero-code platform for auto-generating production-grade AI agents usin |
| 5387 | [breferrari/obsidian-mind](https://github.com/breferrari/obsidian-mind) | R[1, 4] | A self-organizing Obsidian vault that gives AI coding agents persistent memory. |

双轮命中里 R1∩R4 占大头——再次确认那是编码记忆红海的显眼包。
**值得反过来看的是 R1∩R2（59 个）**：第一轮搜记忆、第二轮搜相邻，都撞见的这批
（MIRIX、memgraph、deeplethe/utopia 等）是「记忆产品向相邻领域借零件」的实证——
它们自己也意识到零件在别处。

## 3. 收敛：五条被多轮独立确认的结论

单轮结论可能是巧合；**被多轮、多视角独立确认的才是知识**。以下五条，每条至少两个独立来源：

### 3.1 结构化字段路线，被两个互不相识的世界验证

- 工程界用 ADR 验证了十几年（背景/决定/后果/状态，一份一个文件）——R4
- 文创界用角色卡 spec 和七字段式世界书条目验证（有正式 spec、有生态工具链）——R4
- 北极星的七字段每轮表，恰好与两者同构——R0（设计时并不知道这两条验证）

三个来源互相不知道对方存在，结论一致：**记忆的第一形态是结构化条目，不是自由文本**。

### 3.2 巩固与遗忘是全行业最大空白，成熟算法在圈外

- 第一轮词频：巩固 14%、遗忘 13%——说得多人做得少——R1
- 第二轮：艾宾浩斯已成民间流派（67 个项目）但无校准无评测；最成熟实现在 Anki 圈（FSRS+srs-benchmark）——R2
- 第三轮：认知科学上游是空的（最高 54 star），该搬 ACT-R 而非 FSRS——R3

三轮一致：**这块是空白，且现成的可靠答案在记忆行业之外**（Anki 社区 / 认知科学论文）。

### 3.3 SQLite+FTS5 是及格线，差异化在人可读

- 第二轮：30/186 显式用 SQLite、其中 18 个配 FTS5——R2
- 第三轮：选 SQLite 的真正理由浮出——它是唯一一个人也能打开的嵌入式数据库——R3
- 第四轮：Markdown 真源同盟（obsidian-mind 等）在编码场景独立走了同一条路——R4

北极星「文件即数据」不是标新立异，是和一批独立项目趋同的判断；但要清醒：**趋同的东西不是卖点，是及格线**。

### 3.4 记忆安全是独特攻击面：一次写入，永久污染

- 第一轮：安全/投毒词频只有 5%，全行业不重视——R1
- 第二轮：升级理解——RAG 注入错一次，记忆注入永久生效；防御要靠 source 标记而非猜文本——R2
- 第三轮：BIPIA 的间接注入 benchmark 把攻击面接到了写入路径上——R3

### 3.5 简单机制胜出

- 第四轮：理工与文创五问对照，答案全部对得上且全是简单机制——R4
- 第二轮：被反复验证的栈是 SQLite+FTS5（零件级简单）——R2
- 第三轮：Kùzu 推翻了「图库要起服务」，我们仍不换——因为复杂度换不来可读性——R3

**四轮最硬的一条：被真实用户长期打磨出来的机制，没有一个是复杂的。向量、图、自动摘要流水线都活在 demo 里。**

## 4. 修正：被推翻的判断链

调研的可信度不在于从不出错，在于**错了能自己发现**。四轮里被推翻或修正的判断，全记录在此：

| 原判断 | 出处 | 被什么推翻 | 修正后 |
|---|---|---|---|
| 「不引图数据库，因为都要起独立服务」 | R2 | Kùzu 是嵌入式单文件图库（R3） | 结论不变，理由改：嵌入式引擎存私有二进制，破坏人可读 |
| 衰减调度算法选 FSRS | R2 | FSRS 优化复习间隔，不是检索排序（R3） | 改用 ACT-R base-level 激活方程 |
| 「FTS5 侧车索引增量更新」是自己想的方案 | R2 | 它是 IVM，30 年成熟理论，Node 已有实现（R3） | 按 delta 处理思路实现，参考 materialite |
| 「导入导出」是 P1 但形态抽象 | R1/R2 | Obsidian 生态验证了具体形态（R3/R4） | 导出 Obsidian 兼容 Markdown vault |
| 词频显示「语义/向量检索 42%」暗示向量是主流能力 | R1 | 民间真实机制是关键词触发，世界书几十年没用向量（R4） | 向量继续押后，触发式注入提前 |
| 各报告反复引用「四轮共 4118 个仓库」 | 各轮报告 | 口径混杂：R1 原始去重 1603 vs 入库 1325，且未扣跨轮重叠（本报告） | 真实并集 **3704**（入库 3840 − 重叠 136） |

## 5. 最终路线图：四轮合并后的唯一版本

此前四份报告各有一份清单，互相有重叠有冲突。这里合并成**唯一版本**，每项标注来源轮次。
这是总整合后北极星的执行序。

### P0：先能度量

| 动作 | 来源 |
|---|---|
| 评测 harness：召回命中率 / 召回未引用比例 / 跨轮一致性 | R1 + R2 |
| 参照既有 benchmark 口径：LoCoMo / LongMemEval / **memorylens-bench**（专测衰减） | R1/R2 |

### P1：把记忆生命周期补完整（当前版本的主体）

| 动作 | 来源 | 说明 |
|---|---|---|
| FTS5 侧车索引（按 IVM delta 思路） | R2/R3 | 检索不再全量扫文件；索引是派生数据可随时重建 |
| 中文分词：自实现 bigram + 拼音首字母 | R2 | 中文场景前置条件，不引原生二进制 |
| `valid_from` / `valid_to` / `superseded_by` | R2 | 轻 bitemporal，默认空不影响读写 |
| 衰减三派生量 `last_access_at` / `access_count` / `decay_score`（**不落盘**） | R2/R3 | decay 用 ACT-R base-level 公式 |
| search 排序改为 相关性 × 衰减分 | R2 | — |
| `memory_consolidate`：多轮合并为一条，原记录标 superseded_by | R2 | 解决仓库膨胀 |
| `source` 来源标记 + 写入侧注入检测（**标记而非拒绝**） | R2 | 防记忆投毒 |
| `triggers` 触发式注入 | R4 | **查询式的死穴是 Agent 不知道该查什么**；预算优先级：上一轮 > 触发命中 > 搜索 |
| `adr` 自定义字段方案（背景/决定/后果/状态） | R4 | v2.6 方案机制直接支持 |
| 导出 Obsidian 兼容 Markdown vault | R3/R4 | 不是导出 JSON，是导出人可读可用的格式 |
| 文档明文两条原则：「删除 ≠ 遗忘」「记忆用户可审查，不黑箱自动沉淀」 | R3/R4 | 成本极低，现在没人说 |

### P2：按信号做

| 动作 | 来源 |
|---|---|
| `pinned` 真相层（被取代需显式确认） | R4 |
| 会话交接记录（专门负责未来的那条） | R4 |
| `.trash` 组织成事件日志，支持恢复到指定版本 | R2 |
| 时间旅行查询（「三天前我手上有哪几条记忆」） | R3 |
| 实体别名表 `data/entities.json` | R2 |
| ACT-R spreading activation（提到 A 想起 B） | R3 |
| surprise gating（后置清理，禁止前置拦截） | R2 |

### P3：团队/合规场景

| 动作 | 来源 |
|---|---|
| 防篡改审计链 | R3/R4（ZizkaDB / ELN） |
| 实体卡参考 character card spec | R4 |
| 团队 ACL（届时参考 vakt / accesscontrol） | R1/R2 |

### 不做（负结果与边界，全部经过验证）

| 不做 | 依据 |
|---|---|
| 向量检索 / 本地 embedding | R2/R4：民间真实机制是关键词触发；留触发条件（用户出现「只记得大概」诉求） |
| 图数据库 / GraphRAG | R2/R3：不换的理由是人可读，不是性能 |
| bitemporal 数据库 / OpenTelemetry | R2/R3：当前规模用不上 |
| 个性化推荐 / 用户画像 | **R2 负结果**：与记忆技术栈零重叠 |
| Solid POD 类标准协议 | **R2 负结果**：生态已死；便携靠人可读格式 |
| 编码 Agent 专用记忆 | **R4 红海**：四轮见几十个同类 |
| PKM / 世界书管理器 / 跑团管理器 | R3/R4：已有成熟工具，不做 Wiki |

**数一下：P1 共 12 项，其中 9 项是低成本高确定性动作。这是下一步的全部工作量，不再调研。**

## 6. 方法论沉淀：四轮扫描法本身

这套「换视角、多轮扫、交叉验证」的做法，比任何单轮结论都更可复用。沉淀成文：

1. **四种视角互相正交**：产品（搜什么在卖）→ 相邻（零件在哪）→ 上游（零件从哪来）→ 人群（谁在难受）。任何两轮重叠都 <60/1000，没有一条路能替代另一条。
2. **每往外一层，star 下降、信息密度上升**。中位 star 只有 17 的长尾里藏着认知科学四十年的积累；相反，头部几万 star 的仓库里有刷星和互相抄的产品。**star 是流行度，不是价值**。
3. **跨轮复现是最强信号**。被两种正交视角同时命中的 131 个项目，特别是低 star + 多轮命中的（yantrikdb / mnemos / MemHop）——**被低估的方向**。
4. **负结果要记录，且要写明原因**。「个性化推荐踩空」「Solid POD 已死」如果只留在口头，三个月后还会有人想去试。
5. **允许推翻自己，且推翻要留痕**。§4 那张表比任何新发现都值钱——它证明这套流程有纠错能力。

### 复现方式

```bash
python research/github_scan.py         # R1：22 组记忆关键词
python research/github_adjacent_scan.py # R2：22 组相邻领域
python research/github_edge_scan.py     # R3：24 组上游
python research/github_domain_scan.py   # R4：16 组人群
python research/merge_all.py            # 合并 → github-all.json
python research/render_synthesis.py     # 本报告
```

注：GitHub Search API 限流 10 次/分钟；脚本自带 8.5s 间隔。数据为抓取时点的仓库自述，未经安装验证。

## 7. 收线

四轮、3704 个仓库、五份分报告、一份总整合。**调研阶段到此正式结束。**

所有该知道的基本都知道了：空白在哪（巩固与遗忘、时间有效性、中文检索）、
零件在哪（ACT-R、IVM、FSRS、世界书机制）、红线在哪（投毒、删除≠遗忘、红海赛道）、
以及最重要的——**被真实用户验证过的答案全是简单机制**。

剩下的只有一件事：把 §5 的 P1 做出来。

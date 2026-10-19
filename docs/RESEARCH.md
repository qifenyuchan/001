# AI 记忆全景调研（2026-10）

> 目的：不只盯同类 MCP 记忆插件，而是把“AI 记忆”整个领域扫一遍，回答三个问题：
> 1. 别人都在做什么功能？
> 2. 哪些是共识，哪些是坑？
> 3. 北极星接下来该加什么、不该加什么？

**方法**：公开产品文档、开源仓库、综述论文、独立评测交叉核对。
**注意**：厂商自报的 benchmark 数字普遍不可直接比较（见第 5 节），本文会标注“自报/独立”。

---

## 1. 全景地图：六类玩家

| 类别 | 代表 | 他们解决什么 | 对我们的意义 |
|---|---|---|---|
| **助手原生记忆** | ChatGPT Memory、Claude Projects/Memory、Gemini Personal Context | 平台内跨会话记住用户偏好/项目 | 体验标杆；但锁定在平台内，不能跨模型 |
| **专用记忆层/API** | Mem0、Zep/Graphiti、Supermemory、Cognee、Letta、LangMem、Memobase、memU、Hindsight | 给应用/Agent 提供抽取、存储、检索、生命周期 | 功能最全，是我们主要的功能参照 |
| **本地优先 / MCP** | Basic Memory、官方 Memory、local-memory-mcp、Engram、Recall、Beads | 数据留在本机、Markdown/SQLite、MCP 接入 | 直接竞品；我们与 Basic Memory 最接近 |
| **知识管理 / PKM** | Obsidian、Logseq、Basic Memory、Notion | 人可读可编辑的第二大脑 | “可编辑、可导出”是信任基础 |
| **上下文工程** | Anthropic Memory Tool、context editing、compaction、Claude Code CLAUDE.md | 在窗口内管理上下文，不一定要长期库 | 我们的“只注入上一轮”属于这一类 |
| **评测 / 研究** | LoCoMo、LongMemEval、BEAM、MemoryArena、MemoryAgentBench、FAMA | 衡量记忆是否真的有用 | 我们缺自己的评测，必须先补 |

---

## 2. 功能地图（15 个维度）

### 2.1 写入与抽取
- 对话逐轮写入、文档/网页/邮件导入、多模态（图片/PDF/音频）
- 事实抽取、实体抽取、摘要、结构化 schema、用户画像
- 写入策略：每轮必写 / 重要才写 / 后台批处理

### 2.2 记忆类型
研究界基本收敛为四类（CoALA / MemGPT 体系）：
- **工作记忆**：当前上下文
- **情景记忆**：带时间的具体经历（对话、事件）
- **语义记忆**：去情境化的事实/偏好/规则
- **程序性记忆**：怎么做（技能、工具序列、SOP）

多数产品只做“情景+语义”，程序性记忆仍是空白（Voyager 的技能库是少数）。

### 2.3 存储形态
- 纯文件（Markdown/JSON）——可读、可 git、可手工修
- 向量库——模糊语义召回
- 知识图谱——实体/关系/多跳
- 关系库——结构化查询、多租户
- 混合（图+向量+关系）——Cognee/Supermemory 路线

### 2.4 检索
- 关键词/BM25、向量、混合、图遍历、时间过滤
- 查询改写、检索门控（该不该检索）、多粒度索引
- 时间感知：事实的有效期、版本、supersede

### 2.5 上下文组装
- top-k 注入、预算裁剪、JIT 按需加载、分层摘要
- 压缩（compaction）与“清除旧工具结果”（context editing）
- 关键指标：注入 token、召回命中、是否真的被用上

### 2.6 生命周期
- 去重、合并、更新、冲突/矛盾检测、时间有效性
- **遗忘**：TTL、衰减、重要性评分、归档、主动删除
- **巩固**：sleep-time compute、反思、把情景提炼成语义/程序性
- 版本与审计：不可变版本、时间点恢复

### 2.7 人机协作
- 查看/编辑/删除/导出、来源引用、为什么召回、冲突裁决
- 多设备同步、团队共享、权限/租户隔离

### 2.8 安全
- 本地优先、静态加密、E2E 同步
- 记忆投毒（prompt injection 写入长期记忆）已被 OWASP MCP Top 10 列为风险
- 路径穿越、越权读取、超大 payload

### 2.9 接入与生态
- MCP（stdio/HTTP）、SDK、插件、连接器（Drive/Notion/GitHub/Gmail）
- 工具注解（只读/破坏性/幂等）、resources/prompts、hooks

### 2.10 评测与可观测
- LoCoMo / LongMemEval / BEAM / MemoryArena / MemoryAgentBench / FAMA
- 生产指标：召回命中、token/轮、P95 延迟、写入到可检索延迟、成本

---

## 3. 竞品功能矩阵（简化）

图例：✅ 原生支持　◐ 部分/需插件　— 无/不明确

| 能力 | ChatGPT | Claude | Gemini | Mem0 | Zep/Graphiti | Letta | Basic Memory | Cognee | **北极星** |
|---|---|---|---|---|---|---|---|---|---|
| 跨会话记忆 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 本地优先/数据自持 | — | — | — | ◐（OSS） | ◐（OSS） | ✅ | ✅ | ✅ | ✅ |
| 结构化字段表 | — | ◐（Projects） | — | ◐ | ◐ | ◐（blocks） | ◐（Markdown） | ◐ | ✅（七字段/自定义） |
| 只注入上一轮（有界） | — | — | — | — | — | — | — | — | ✅ |
| 语义/向量检索 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | —（当前关键词） |
| 知识图谱 | — | — | — | ◐（Pro） | ✅ | — | ✅（wikilink） | ✅ | — |
| 时间有效性/事实版本 | ◐ | ◐ | ◐ | ◐ | ✅ | ◐ | ◐ | ◐ | — |
| 冲突/矛盾处理 | ◐ | ◐ | ◐ | ◐ | ✅ | ◐ | — | ◐ | ◐（字段级合并） |
| 遗忘/TTL/衰减 | ◐ | ◐ | ✅（保留期） | ✅（过期） | ◐ | ◐ | ◐（归档 skill） | ◐ | — |
| 巩固/反思（sleep-time） | ◐（Dreaming） | ◐ | — | ◐（Dream） | — | ✅（sleep-time） | ◐（reflect） | ✅（Memify） | ◐（范围总结） |
| 可编辑 UI | ✅ | ✅ | ✅ | ◐ | — | ◐ | ✅（Obsidian/文件） | ◐ | ✅ |
| 多设备同步 | ✅（云） | ✅（云） | ✅（云） | ✅（云） | ✅（云） | ✅（云） | ✅（云/文件） | ✅（云） | ✅（自有云盘） |
| 多用户/租户/ACL | ✅ | ◐ | ✅ | ✅ | ✅ | ✅ | ✅（Team） | ✅ | — |
| MCP 接入 | — | ✅（工具） | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 本地无外部模型 | — | — | — | — | — | ◐ | ✅ | —（抽取需 LLM） | ✅ |
| 公开评测 | — | — | — | 自报 | 自报 | 自报 | — | 自报 | — |

> 这张表只看“有没有”，不看质量；同一项的实现差异很大。

---

## 4. 研究共识（值得直接吸收）

1. **分类型记忆优于一锅炖**：工作/情景/语义/程序性分开，召回和推理更稳。
2. **只压缩不保留原文会漂移**：反复摘要会丢低频高价值细节（“never call prod DB”被摘要掉）。
3. **巩固（consolidation）很重要**：把原始经历提炼成规则/偏好，比无限堆原始记录更有效。
4. **遗忘是最难也最被忽视的**：冲突旧事实会显著拖累表现；TTL/衰减/失效是刚需。
5. **时间推理是普遍短板**：独立评测里所有系统在“先后/间隔”类问题上接近零分。
6. **长上下文 ≠ 长期记忆**：1M 窗口仍会在长对话中退化；架构比窗口大小重要。
7. **benchmark 不可直接信**：厂商自报与独立复现差距可达 20–37 个百分点；LoCoMo 答案键本身有错误。
8. **安全是新前沿**：记忆投毒、路径穿越、越权读取已被列为 MCP 主要风险。
9. **可编辑/可导出是信任基础**：隐藏的记忆无法纠错，用户不敢长期用。
10. **“该不该检索/该不该写”本身就是能力**：全量注入和每轮全写都会让记忆变噪音。

---

## 5. 评测现状：数字要怎么看

| 基准 | 规模 | 测什么 | 现状 |
|---|---|---|---|
| LoCoMo | ~35 会话 / 300 轮 / 9K tokens | 多会话 QA、事件摘要、时间排序 | 接近饱和，适合当回归测试 |
| LongMemEval | 500 题，可扩展历史 | 信息抽取、多会话、时间、知识更新、拒答 | 仍有区分度；长历史下普遍掉 ~30% |
| BEAM | 最多 10M tokens / 2000 题 | 矛盾消解、事件排序、知识更新等 10 项 | 当前前沿；1M 窗口模型仍退化 |
| MemoryArena | 多会话任务 | 记忆是否提升任务完成率 | 更接近“有没有用” |
| FAMA | 知识更新 | 对过时信息的惩罚 | 遗忘/更新专用 |

**已知水分**：Mem0 自报 LongMemEval 94.4%，独立 harness 复现 57.5%；LoCoMo 自报 92.5%，独立复现 66.9%；LoCoMo 约有 6.4% 错答案，LLM judge 会接受约 63% 的错误答案。
**结论**：任何数字都要看 harness、模型、预算、judge；我们自己的评测必须固定这些条件。

---

## 6. 北极星的差距

### 已有优势（不要丢）
- 每轮结构化字段表，人可读、可改、可 diff
- 只注入上一轮，token 有界，抗摘要漂移
- 本地优先、数据在用户自己的云盘/git，零托管
- 可编辑仓库 UI + 回收站 + 冲突报告
- 两套表格二选一（通用/自定义），可切换、历史保留
- 零运行时依赖、无外部模型调用

### 主要缺口（按影响排序）
1. **没有评测**：无法证明“记忆变好了”，也无法防回归
2. **没有遗忘/时间有效性**：旧事实会一直留着，冲突只能靠人看
3. **检索只有关键词**：同义/模糊/多跳召回弱
4. **没有巩固/反思**：范围总结是机械聚合，不会提炼偏好/规则
5. **没有实体/关系**：人物、项目、决策之间的关联靠字段文本
6. **没有导入/导出生态**：从 ChatGPT/Claude/Mem0 迁移成本高
7. **没有多用户/ACL**：团队场景进不去
8. **没有可观测**：不知道哪条记忆被注入、是否被用上、token 花在哪

---

## 7. 建议路线（按“价值/成本/风险”排序）

### P0：先能度量（1–2 周）
- 建 `bench/`：固定 30–50 段真实会话 + 100 条问题（事实/时间/更新/拒答）
- 指标：召回命中、注入 token、P95 延迟、写入到可检索延迟
- 每次改动跑回归；没有 baseline 不添加大功能
- 可选：接 LoCoMo/LongMemEval 子集，但**只作参考**，不做营销数字

### P1：把“记忆生命周期”补完整（2–4 周）
1. **TTL / 衰减 / 归档**：字段级 `importance`、`expires_at`、`last_used_at`；过期进归档，不直接删
2. **时间有效性**：`valid_from` / `valid_to` / `superseded_by`；同一事实新版本自动失效旧版本
3. **冲突/重复检测**：相似记录聚类，UI 提供合并/保留/忽略
4. **巩固任务**：`memory_reflect`（离线/手动）把多轮情景提炼成偏好/规则，写回语义层
5. **导入/导出**：ChatGPT/Claude 导出文件、Mem0 JSON、Markdown/Obsidian
6. **记忆健康面板**：重复、过期、冲突、未使用、体积

### P2：差异化能力（1–2 个月，按信号做）
7. **混合检索**：可选本地 embedding（ONNX/小模型），失败自动回退关键词；不引入必装依赖
8. **实体/关系侧车索引**：从字段抽实体，建可重建的图索引；JSON 仍是唯一真源
9. **记忆类型路由**：情景/语义/程序性分开存；写入时决定类型，注入时按任务选
10. **程序性记忆**：可复用的 SOP/命令/技能片段（与普通记忆分开）
11. **“为什么召回”**：注入块标注来源、命中字段、预算占比
12. **MCP resources/prompts**：不只 tools；把记忆作为资源暴露
13. **连接器**：本地文件、网页剪藏、Git 仓库（先做只读导入）

### P3：团队/企业（有明确客户再做）
14. 团队空间、成员/ACL、审计日志
15. 静态加密 / E2E 同步
16. SSO、私有部署、合规材料

### 明确不做（至少现在）
- 强制向量数据库/图数据库（破坏零依赖与可移植）
- 每轮全量注入 / 全量图谱 dump（token 灾难）
- 自动反复摘要替代原始记录（漂移）
- 没有付费信号就做多租户 SaaS

---

## 8. 功能点子清单（可直接排期）

| # | 功能 | 价值 | 成本 | 风险 | 优先级 |
|---|---|---|---|---|---|
| 1 | 评测 harness + 真实会话集 | 高 | 中 | 低 | P0 |
| 2 | TTL/衰减/归档 | 高 | 低 | 低 | P1 |
| 3 | 时间有效性/事实版本 | 高 | 中 | 中 | P1 |
| 4 | 重复/冲突检测 + UI | 高 | 中 | 低 | P1 |
| 5 | 巩固/反思任务 | 高 | 中 | 中 | P1 |
| 6 | ChatGPT/Claude/Mem0 导入 | 高 | 中 | 低 | P1 |
| 7 | Markdown/Obsidian 导出 | 中 | 低 | 低 | P1 |
| 8 | 记忆健康面板 | 中 | 中 | 低 | P1 |
| 9 | 可选本地 embedding | 高 | 中 | 中 | P2 |
| 10 | 实体图侧车索引 | 中 | 高 | 中 | P2 |
| 11 | 记忆类型路由 | 高 | 高 | 中 | P2 |
| 12 | 程序性记忆 | 中 | 高 | 中 | P2 |
| 13 | 为什么召回 | 中 | 低 | 低 | P2 |
| 14 | MCP resources/prompts | 中 | 低 | 低 | P2 |
| 15 | 团队空间/ACL | 高 | 高 | 高 | P3 |
| 16 | E2E 加密同步 | 中 | 高 | 高 | P3 |

---

## 9. 维护机制（长期任务）

- **每周**：跑全量测试 + 基准；看 issue；合并依赖安全更新
- **每月**：一次独立审计（新上下文代理），重点路径穿越/权限/并发/数据一致性
- **每季度**：重跑一次竞品功能矩阵；删掉不再成立的功能
- **发布**：语义化版本；CHANGELOG 必写；破坏性变更给迁移脚本
- **回归**：每个 bug 先写失败用例，再修；P0/P1 必须有测试
- **数据安全**：任何删除/迁移先备份；迁移默认“不覆盖已存在文件”

---

## 10. 参考来源（节选）

- O-mega, *AI Agent Memory in 2026: Architectures & Tools* — https://o-mega.ai/articles/ai-agent-memory-in-2026-architectures-tools
- Supermemory 产品与对比 — https://supermemory.ai ；https://supermemory.ai/blog/mem0-alternatives/
- Cognee 对比与迁移 — https://www.cognee.ai/blog/tutorials/best-ai-memory-layers-for-ai-agents-in-2026-comparison
- Zep/Graphiti vs Cognee — https://vectorize.io/articles/zep-vs-cognee
- Basic Memory 文档/索引 — https://deepwiki.com/basicmachines-co/basic-memory/15.1-development-environment-setup
- Anthropic Memory Tool / context editing — https://aicost.tools/blog/context-editing-cut-agent-token-cost
- LLM memory 综述汇总 — https://aiagentmemory.org/articles/llm-memory-arxiv
- Memory for Autonomous LLM Agents — https://www.emergentmind.com/papers/2603.07670
- Basic Memory 研究 digest — https://basicmemory.com/blog/ai-memory-research-digest
- Bench'd 独立评测 — https://benchd.ai/benchmarks ；https://benchd.ai/blog/six-systems-one-benchmark
- LoCoMo/LongMemEval/BEAM 对比 — https://dreaming.press/posts/locomo-vs-longmemeval-vs-beam-agent-memory.html
- MCP 记忆服务器生态 — https://chatforest.com/guides/best-memory-mcp-servers
- ChatGPT/Claude/Gemini 记忆对比 — https://memx.app/blog/chatgpt-vs-claude-vs-gemini-memory
- OWASP MCP Top 10（记忆投毒）— 见 chatforest 安全段落

> 所有第三方数字均为其发布时点；引用前请回源核对。厂商自报与独立复现的差异已在第 5 节标注。

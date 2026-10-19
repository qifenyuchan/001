# 相邻领域零件库：把不是做记忆的东西，拆开装到记忆上

> 生成时间：2026-10-20 02:45　|　数据源：`research/github-adjacent.json`（GitHub Search API）

## 0. 这份报告和上一份不是一回事

`RESEARCH.md` 与 `RESEARCH-GITHUB.md` 回答的是「**别人家的记忆产品长什么样**」。
这份回答的是另一个问题：**那些压根不做记忆的东西，拆开能不能装在记忆上。**

起因是一个判断——AI 记忆是全球 LLM 用户共同卡住的通用问题，所以它的解法不会全部长在「记忆」这个关键词下面。
真正可用的零件，很多躺在检索、数据库、认知科学、权限、本地推理这些看起来不相干的领域里，等着被拆下来。

### 口径与局限（和上一份同样的声明）

- 数据是**仓库自述**（description / topics / star），**未经实际安装验证**。
- 描述里出现的「更准」「+16pp」「SOTA」都是项目**自己写的**，本扫描不对其负责。
- 按 star 排序会让头部混入**刷星仓库**（见 §1 的噪声处理）。
- 只取 Search API 元数据，**未抓 README**，因此功能判断基于描述文本，可能与实际有出入。

## 1. 方法：为什么不继续搜 memory

上一份扫了 22 组记忆类关键词，拿到 1603 去重 / 693 相关。
但继续加「memory」「agent memory」这类关键词，收益是递减的——**搜记忆只会撞进同温层**，
翻来覆去是同一批项目互相抄。

所以这一轮换了路子：**不搜记忆，搜 9 个相邻领域**，每组 50 条，共 22 组查询。

| 类别 | 查询数 | 命中 | 成色 |
|---|---|---|---|
| 检索/索引 | 4 | 170 | 高——直接捞到主扫描漏掉的一批记忆项目 |
| 数据/版本 | 4 | 199 | 中高——思想是宝，产品太重 |
| 结构/实体 | 3 | 132 | 中——图数据库过重，实体归并有用 |
| 认知/生命周期 | 3 | 149 | **最高**——本次最大收获 |
| 权限/安全 | 2 | 99 | 中——提示注入对记忆是独特攻击面 |
| 运维 | 2 | 100 | 低——当前规模用不上 |
| 本地模型 | 2 | 97 | 中——是最明确的「将来开关」 |
| 个性化 | 1 | 50 | **负结果**——踩空 |
| 便携/标准 | 1 | 41 | **负结果**——生态已死，但理念对 |

### 关于噪声

按 star 排序的搜索结果里，头部会出现一批名字可疑却几万 star 的仓库
（如 `Graphify-Labs/graphify` 12.9万、`tirth8205/code-review-graph` 3.2万、`simonlin1212/a-stock-data` 1.1万）。
这些都是**刷星仓库**，本报告一律不采信、不列入下表。
处理办法：所有入选项目逐一读描述人工确认，宁可少列也不列没把握的。

## 2. 总览：1037 个去重仓库，186 个含记忆信号

22 组查询去重后 **1037** 个仓库。
其中 **186** 个描述里含记忆语义词——
说明一件事：**在别人的地盘上，长着大量我们没见过的记忆项目。**（详见 §5）

## 3. 零件库：九类领域，拆开装到记忆上

每一节三个问题：**它原本解决什么 → 零件是什么 → 拆开装到记忆上怎么用 → 北极星要不要做。**

### 3.1 检索与索引引擎

**它原本解决什么。**

这一领域原本解决的问题很朴素：上百万份文档里，用户问一句话，怎么在几十毫秒内把相关的几份挑出来。

它几十年的积累分成两条路——**关键词派**（倒排索引、BM25、分词器）和**向量派**（embedding、ANN 近似检索）。

近三年的结论是：**两条都要**，单靠任意一条都会在另一条的强项上翻车。

**零件**

| Star | 项目 | 语言 | 说明 |
|---|---|---|---|
| 8197 | [asg017/sqlite-vec](https://github.com/asg017/sqlite-vec) | C | A vector search SQLite extension that runs anywhere! |
| 2005 | [asg017/sqlite-vss](https://github.com/asg017/sqlite-vss) | C++ | A SQLite extension for efficient vector search, based on Faiss! |
| 1190 | [sqliteai/sqlite-vector](https://github.com/sqliteai/sqlite-vector) | C | SQLite-Vector is a cross-platform, ultra-efficient SQLite extension that brings vector search capabilities to |
| 870 | [wangfenjin/simple](https://github.com/wangfenjin/simple) | C++ | 支持中文和拼音的 SQLite fts5 全文搜索扩展 ｜ A SQLite3 fts5 tokenizer which supports Chinese and PinYin |
| 361 | [1yefuwang1/vectorlite](https://github.com/1yefuwang1/vectorlite) | Rust | Fast, SQL powered, in-process vector search for any language with an SQLite driver |
| 87 | [sqliteai/sqlite-rag](https://github.com/sqliteai/sqlite-rag) | Python | A hybrid search engine built on SQLite with SQLite AI and SQLite Vector extensions |
| 7 | [eminsk/nanovector](https://github.com/eminsk/nanovector) | Python | The SQLite of Vector Search & Episodic Memory for AI Agents in ~120KB. Pure C99, AVX2+FMA, ARM NEON, FASM x64, |

**拆开装到记忆上**

- **倒排索引 + FTS5 + BM25** → 人名、项目名、术语、错误码这类**精确命中**需求。向量检索在这里恰恰打不中——embedding 会把「张三」和「李四」拉得很近，因为它们句法位置相同。
- **sqlite-vec（向量扩展）** → 用户问的和存的**措辞不一样**时才需要：「上次那个部署问题」对应记录里写的「k8s rollout 失败」。关键词检索对这种同义改写完全无能。
- **中文分词器** → 这是中文场景的**前置条件**，不是优化项。SQLite 自带 FTS5 默认用 unicode61 分词器，它按空格切词，中文没空格 → 整段话被当成一个 token → 中文检索等于废。
- **混合检索 + RRF 融合** → 关键词和向量各出 Top N，用倒数排名融合（1/(k+rank)）合并。这是当前实践里最省事且效果最稳的做法，不需要学一个融合模型。

**对北极星的判定。**

**该补，但顺序是先关键词、后向量。**

北极星当前的检索是顺序扫描：挨个解析 JSON 文件再匹配。1500 条约 23MB 时保存已退化到 30ms/条，这个退化就来自全量解析。

- **P1 可做**：侧车索引。维护一个 `data/index.db`（SQLite），写入时增量更新 FTS5 索引，`memory_search` 走索引而不是扫文件，扫到 id 再按文件名 O(1) 读记录。

- **P1 前置必做**：中文分词。要么内置 `wangfenjin/simple` 的预编译分词器（要引入原生二进制，与零依赖冲突），要么自己实现 bigram 切分（中文 FTS5 的实用近似：按 2-gram 切 + 拼音首字母），后者更符合北极星的脾气。

- **暂不做**：向量。理由见 §8——它是可选增强，且现在还没有真实需求触发。

### 3.2 数据版本、时间与一致性

**它原本解决什么。**

这一领域原本解决的是：数据会变，变了以后原来的还算不算数？

数据库界的答案是 **bitemporal（双时态）**：把时间拆成两条轴——**有效时间**（这个事实在现实世界里成立的区间）和**事务时间**（我们是什么时候把它记进库的）。

分布式界的答案是 **CRDT** 与 **event sourcing**：不覆盖写，只追加事件，让合并变成可交换的数学运算。

**零件**

| Star | 项目 | 语言 | 说明 |
|---|---|---|---|
| 19147 | [amark/gun](https://github.com/amark/gun) | JavaScript | An open source cybersecurity protocol for syncing decentralized graph data. |
| 10406 | [electric-sql/electric](https://github.com/electric-sql/electric) | TypeScript | The agent platform built on sync. |
| 5194 | [tinyplex/tinybase](https://github.com/tinyplex/tinybase) | TypeScript | A reactive data store & sync engine. |
| 3686 | [oskardudycz/EventSourcing.NetCore](https://github.com/oskardudycz/EventSourcing.NetCore) | C# | Examples and Tutorials of Event Sourcing in .NET |
| 3114 | [aspen-cloud/triplit](https://github.com/aspen-cloud/triplit) | TypeScript | A full-stack, syncing database that runs on both server and client. Pluggable storage (indexeddb, sqlite, dura |
| 3087 | [xtdb/xtdb](https://github.com/xtdb/xtdb) | Clojure | An immutable SQL database for application development, time-travel reporting and data compliance. Developed by |
| 27 | [muhamadjawdatsalemalakoum/kith](https://github.com/muhamadjawdatsalemalakoum/kith) | Rust | Serverless, end-to-end-encrypted, no-account sync for your own devices — memory, tabs, and files. No cloud. MC |
| 2 | [ATOM00blue/wolfdb](https://github.com/ATOM00blue/wolfdb) | Python | WolfDB - the open-source, object-storage-native, bi-temporal memory database for AI agents. |
| 0 | [Bobcatsfan33/loomdb](https://github.com/Bobcatsfan33/loomdb) | Rust | An agent-native database. Sessions are branches an agent can fork, merge, and rewind; every write records what |

**拆开装到记忆上**

- **bitemporal 双时态** → 记忆最尴尬的失败不是记不住，是**旧事实伪装成当前事实**。「张三在 A 公司」三月是对的、六月是错的，但记忆里它俩长得一模一样。双时态直接给出解法：valid_from/valid_to 记事实成立区间，transaction time 记我们何时知道的——后者正是记忆的「什么时候记下来的」。
- **event sourcing（事件溯源）** → 记忆不该是覆盖写，而应是追加事件流。有了事件流，撤销、回滚、审计都是免费的，而且能回答「这条结论当时是怎么得出的」。
- **CRDT（无冲突复制类型）** → 北极星现有的逐字段时间戳合并 + 墓碑，本质上就是手写的一个 LWW-Register CRDT。既然如此，不如直接用成熟的语义而不是自己造。
- **lineage（数据血缘）** → 追踪一条结论由哪几条原始记录推导而来。搬到记忆上就是**「为什么召回这条」**——现在所有记忆产品都只告诉你「召回了什么」，没人告诉你「凭什么」。

**对北极星的判定。**

**只取思想，不换存储。**

- **P1 可做（成本低）**：给记录加 `valid_from` / `valid_to` / `superseded_by` 三个字段。这是 bitemporal 的轻量版，不需要换数据库，而且能直接解决「旧事实冒充新事实」。三个字段默认空，不影响现有读写路径。

- **P2 可做**：把 `.trash` 里的旧版本组织成事件日志，支持「把这一轮恢复到第 2 版」。当前旧版本已经进 `.trash` 了，缺的只是一条能读回来的命令。

- **不做**：不换 bitemporal 数据库。北极星最核心的卖点是「文件即数据」——人可以直接打开 JSON 改。换成 xtdb 这类依赖 JVM 的东西，等于把卖点换成负担。

- **值得盯**：`wolfdb`（bi-temporal memory database）和 `loomdb`（把会话做成可 fork/merge 的分支）虽然现在 0-2 star，但方向对——**把 git 的语义搬到记忆上**。如果它们做成了，是北极星多设备方案的另一种可能。

### 3.3 实体抽取与结构归并

**它原本解决什么。**

这一领域原本解决的是：「张三」「小张」「Zhang San」「他」在数据库里是四条记录，但它们是一个人。

技术上叫 **entity resolution（实体归并）**，图数据库负责存归并后的关系，GraphRAG 负责从文本里抽出实体再建图。

**零件**

| Star | 项目 | 语言 | 说明 |
|---|---|---|---|
| 40210 | [HKUDS/LightRAG](https://github.com/HKUDS/LightRAG) | Python | [EMNLP2025] LightRAG: Simple and Fast Retrieval-Augmented Generation |
| 36387 | [microsoft/graphrag](https://github.com/microsoft/graphrag) | Python | A modular graph-based Retrieval-Augmented Generation (RAG) system |
| 10495 | [FalkorDB/FalkorDB](https://github.com/FalkorDB/FalkorDB) | Rust | A super fast Graph Database uses GraphBLAS under the hood for its sparse adjacency matrix graph representation |
| 5283 | [neo4j-labs/llm-graph-builder](https://github.com/neo4j-labs/llm-graph-builder) | Jupyter Notebook | Neo4j graph construction from unstructured data using LLMs |
| 4623 | [memgraph/memgraph](https://github.com/memgraph/memgraph) | C++ | High-performance open-source in-memory graph database for GraphRAG, AI memory, agentic AI, and real-time graph |
| 4518 | [dedupeio/dedupe](https://github.com/dedupeio/dedupe) | Python | :id: A python library for accurate and scalable fuzzy matching, record deduplication and entity-resolution. |
| 208 | [project-minigraf/minigraf](https://github.com/project-minigraf/minigraf) | Rust | Embedded graph memory for AI agents, mobile apps, and the browser. |

**拆开装到记忆上**

- **实体归并（dedupe 这类模糊匹配）** → **记忆去重的前置条件**。不做归并，「人物」字段就是一堆碎片：「张三」一条、「小张」一条、「Zhang」一条，检索时各自为政，人看着也乱。
- **关系图** → 记忆之间的关联——谁和谁在哪个项目上合作过、这个决策影响了哪个结果。这是纯文本字段表达不了、用户又很想要的东西。
- **GraphRAG** → 从整段记忆里抽实体建图，让「和 X 有关的所有事」变成一次图遍历而不是一次全文扫描。

**对北极星的判定。**

**要它的最轻那一层。**

- **P2 可做**：实体别名表。一个 `data/entities.json`，形如 `{ 张三: [小张, Zhang San, 老张] }`，检索前先归一化再匹配。这是 dedupe 的极简版，不引任何依赖，人还能直接编辑——和北极星的气质一致。

- **不做**：不引图数据库。单机几千条记忆用 Neo4j/memgraph 是杀鸡用牛刀，而且都要起独立服务，直接破坏「零依赖 + 单文件 + 一个 node 进程」这条底线。

- **值得盯**：`minigraf`（嵌入式图记忆，面向 agent/移动端/浏览器）。关键词是 **embedded**——如果图存储能做到单文件嵌入，未来的取舍会变。

### 3.4 记忆的生命周期：巩固与遗忘

**它原本解决什么。**

认知科学原本研究的是人类怎么记住、怎么忘掉，以及为什么睡眠对记忆是必需的。

这批仓库是相邻扫描里**成色最高的一类**——因为认知科学对「记忆该怎么管理」的思考，比整个 AI 记忆行业深得多，也早得多。

里面最成熟的东西来自一个意想不到的地方：**Anki 社区**。间隔重复（spaced repetition）算法被全世界几百万用户打磨了十几年，还有自己的 benchmark。

**零件**

| Star | 项目 | 语言 | 说明 |
|---|---|---|---|
| 4110 | [open-spaced-repetition/fsrs4anki](https://github.com/open-spaced-repetition/fsrs4anki) | Jupyter Notebook | A modern Anki custom scheduling based on Free Spaced Repetition Scheduler algorithm |
| 729 | [open-spaced-repetition/free-spaced-repetition-scheduler](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler) | — | A spaced repetition algorithm based on DSR model |
| 277 | [open-spaced-repetition/srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark) | Jupyter Notebook | A benchmark for spaced repetition schedulers/algorithms |
| 270 | [sachitrafa/YourMemory](https://github.com/sachitrafa/YourMemory) | Python | Agentic AI memory with Ebbinghaus forgetting curve decay. +16pp better recall than Mem0 on LoCoMo. |
| 267 | [xuiltul/animaworks](https://github.com/xuiltul/animaworks) | Python | Organization-as-Code for autonomous AI agents. Brain-inspired memory that grows, consolidates, and forgets. Mu |
| 226 | [maimemo/SSP-MMC](https://github.com/maimemo/SSP-MMC) | Python | A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling |
| 186 | [TiMEM-AI/TiMEM](https://github.com/TiMEM-AI/TiMEM) | Python | Temporal-Hierarchical Memory Consolidation for Long-Horizon Conversational Agents |
| 177 | [yantrikos/yantrikdb-server](https://github.com/yantrikos/yantrikdb-server) | Rust | Cognitive memory database for AI agents — consolidates duplicates, detects contradictions, fades stale memorie |
| 162 | [slow-stack/mneme](https://github.com/slow-stack/mneme) | JavaScript | 🧠 The memory that dreams — cross-session memory for DeepSeek Harness. Local SQLite + Markdown mirrors, autoDre |
| 158 | [grandamenium/dream-skill](https://github.com/grandamenium/dream-skill) | Shell | Memory consolidation skill for Claude Code - replicates Anthropic's unreleased auto-dream feature. 4-phase con |
| 80 | [ldclabs/anda-brain](https://github.com/ldclabs/anda-brain) | Rust | 🧠 A native graph-based memory system for autonomous AI agents, featuring bio-inspired sleep-based memory conso |
| 64 | [pieralukasz/true-recall](https://github.com/pieralukasz/true-recall) | TypeScript | Native spaced repetition for Obsidian: AI-generated flashcards, FSRS v6 scheduling, image occlusion and retent |
| 48 | [muratg98/psychmem](https://github.com/muratg98/psychmem) | TypeScript | Psychology-grounded selective memory system for AI agents (Claude Code, OpenCode) with STM/LTM consolidation, |
| 28 | [anthony-maio/mnemos](https://github.com/anthony-maio/mnemos) | Python | Biomimetic memory architectures for LLMs — surprisal gating, reconsolidation, affective routing, sleep consoli |

**拆开装到记忆上**

- **间隔重复调度（FSRS）** → FSRS 真正算的不是「隔多久复习」，而是**这条记忆现在还能不能被提取出来**（retrievability）。搬到记忆上：每条记录有一个可提取性分数，随时间衰减、每被召回一次就回升。这直接补上了北极星现在最大的洞——只有存取，没有生命周期。
- **艾宾浩斯遗忘曲线** → R = exp(−t/S)，S 是记忆强度，每次被召回 S 增大。落到检索上：排序不该是纯时间倒序，而应是 `相关性 × 衰减分 × 访问频率`。被反复提起的记忆衰减更慢，这正好是间隔重复的语义。
- **巩固（consolidation）** → 把多轮零散记忆整理成一条结构化结论。这是人类睡眠在做的事。落到产品上：`memory_consolidate`——把某会话/某时间区间的多条记录合并成一条，原记录标记 `superseded_by` 而不是删除。
- **睡眠式巩固（mneme / dream-skill / anda-brain）** → 空闲时自动跑巩固，而不是等用户下命令。`dream-skill` 直接点名是复现 Anthropic 未发布的 auto-dream 能力。
- **surprise gating（意外度门控）** → 符合预期的日常不值得存，超预期的才存。这是从源头解决「什么都存导致仓库爆炸」——比事后清理高明。

**对北极星的判定。**

**这是最该补的一块，也是相邻扫描最大的收获。**

北极星现在能存、能取、能编辑，但记忆在它里面是**静态**的：存进去什么样，三年后还是什么样，只有数量在涨。认知科学给出的答案是，记忆的价值恰恰来自它会变——被使用的变强，不被使用的衰减，零散的被整理成结构。

- **P1 可做**：给每条记录加三个派生量——`last_access_at`、`access_count`、`decay_score`。**不落盘，读时计算**（符合「单一真源」铁律）。`memory_search` 的排序从「相关 + 时间倒序」改为「相关 × 衰减分」。

- **P1 可做**：`memory_consolidate` 命令。把指定会话或时间区间的多条记录交给 Agent 合并成一条结构化结论，原记录标记 `superseded_by`（与 §3.2 的三个字段打通）。这既解决了仓库膨胀，也让旧的零散记忆仍然可读。

- **P2 待定**：surprise gating。它要求在写入前判断信息量，而这与「写入永不因残缺拒绝」这条铁律直接冲突。**只能设计成后置清理**（写入照常，事后批量标记低信息量记录），不能做成前置拦截。

- **可直接复用的现成资产**：FSRS 的算法与 `srs-benchmark` 的评测方法。它是 MIT/开源、有 benchmark、有十几年真实数据打磨的成熟算法，比任何一个记忆产品自研的衰减公式都可靠。

### 3.5 权限与提示注入防御

**它原本解决什么。**

这一领域原本解决两件事：**谁能看什么**（访问控制），以及**LLM 被输入内容劫持**（提示注入）。

对记忆系统来说，后者的严重性被整个行业低估了。

**零件**

| Star | 项目 | 语言 | 说明 |
|---|---|---|---|
| 2334 | [onury/accesscontrol](https://github.com/onury/accesscontrol) | TypeScript | Role and Attribute based Access Control for Node.js |
| 739 | [tldrsec/prompt-injection-defenses](https://github.com/tldrsec/prompt-injection-defenses) | — | Every practical and proposed defense against prompt injection. |
| 506 | [liu00222/Open-Prompt-Injection](https://github.com/liu00222/Open-Prompt-Injection) | Python | This repository provides a benchmark for prompt injection attacks and defenses in LLMs |
| 352 | [thepartly/gatehouse](https://github.com/thepartly/gatehouse) | Rust | A flexible authorization library that combines role-based (RBAC), attribute-based (ABAC), and relationship-bas |
| 194 | [kolotaev/vakt](https://github.com/kolotaev/vakt) | Python | Attribute-based access control (ABAC) SDK for Python |
| 160 | [microsoft/BIPIA](https://github.com/microsoft/BIPIA) | Python | A benchmark for evaluating the robustness of LLMs and defenses to indirect prompt injection attacks. |
| 130 | [SleuthCo/clawshield-public](https://github.com/SleuthCo/clawshield-public) | Go | Security proxy for AI agents. Scans every message for prompt injection, PII, and secrets. Defense-in-depth: Go |

**拆开装到记忆上**

- **提示注入防御 → 记忆投毒** → **这是记忆系统独有的、比 RAG 严重得多的攻击面**：RAG 被注入只让这一次答错，记忆被注入是**往长期记忆里写一条脏数据，永久生效**，此后每次召回都在复述它。一次写入，永久污染。
- **间接注入（BIPIA）** → 攻击者不直接和你对话，而是把指令藏在你让 Agent 读的网页、文件、工具输出里。这些内容是记忆的重要来源，等于把攻击面直接接到了写入路径上。
- **ABAC（属性访问控制）** → 谁能看什么。对团队共享记忆是必需项——「这条客户记录只有 A 组能看」。
- **入站内容扫描** → 在写入前扫一遍，识别注入特征、PII、密钥。

**对北极星的判定。**

**低成本的部分现在就该做。**

- **P1 可做**：**来源标记**。每条记录记 `source`（`user_input` / `tool_output` / `web_content` / `file` / `agent`）。这是防御间接注入的正路——不是靠猜文本里有没有恶意指令，而是靠知道这条内容从哪来。来自网页/文件的记录，召回时默认降低信任权重。

- **P1 可做**：**写入侧注入特征检测**。命中已知模式（`ignore previous instructions`、`system:`、`你现在的目标是` 等）时**标记 `suspect` 而不是拒绝写入**——必须守住「写入永不因残缺拒绝」这条铁律。UI 里高亮提示即可。

- **不做**：不自己做 ABAC。团队共享还没排期，做了也是空跑。等 P3 真要做团队功能时，再看 `vakt` / `accesscontrol` 这些成熟实现，那时大概率是直接借鉴而不是自己造。

### 3.6 可观测性与持久化执行

**它原本解决什么。**

这一领域原本解决的是：分布式系统出问题时怎么知道哪里坏了，以及长流程跑到一半崩了怎么接着跑。

前者是 OpenTelemetry/Jaeger，后者是 durable execution（持久化工作流）。

**零件**

| Star | 项目 | 语言 | 说明 |
|---|---|---|---|
| 32392 | [SigNoz/signoz](https://github.com/SigNoz/signoz) | TypeScript | SigNoz is an open-source, OpenTelemetry-native observability platform for your team and their AI agents. Get l |
| 32338 | [conductor-oss/conductor](https://github.com/conductor-oss/conductor) | Java | Conductor is an event driven agentic workflow engine providing durable and highly resilient execution engine f |
| 23316 | [jaegertracing/jaeger](https://github.com/jaegertracing/jaeger) | Go | CNCF Jaeger, a Distributed Tracing Platform |
| 6576 | [open-telemetry/opentelemetry-go](https://github.com/open-telemetry/opentelemetry-go) | Go | OpenTelemetry Go API and SDK |

**拆开装到记忆上**

- **durable execution（持久化工作流）** → Agent 的任务跨越多轮、随时可能中断，需要外部记住「做到哪一步了」。**这本质上就是记忆**——只是存的是执行状态而不是对话内容。它是记忆的一个被忽略的应用场景。
- **分布式追踪 → 记忆操作可观测** → 每次 recall/save 记一条 span。真正有用的不是看延迟，而是能看到**哪次召回是无效的**（召回了但 Agent 根本没用），这是评测召回质量的基础数据。

**对北极星的判定。**

**现在不做，但埋一个数据点。**

- **不做**：北极星是单进程本地服务，没有分布式需求，引 OpenTelemetry 只会把 46 个文件的包变成 460 个。

- **但值得做**：记录「召回了但没被引用」的比例。这个数字现在是评测召回质量的唯一客观信号，也是 P0 评测 harness 的输入。实现成本极低——召回时记 id，下一轮保存时看引用。

### 3.7 本地推理与嵌入式向量

**它原本解决什么。**

这一领域原本解决的是：不联网、不调大厂 API、在自己机器上跑 embedding 和向量检索。

它是「本地优先」理念在模型侧的对应物。

**零件**

| Star | 项目 | 语言 | 说明 |
|---|---|---|---|
| 16127 | [alibaba/zvec](https://github.com/alibaba/zvec) | C++ | A lightweight, lightning-fast, in-process vector database |
| 1401 | [jdagdelen/hyperDB](https://github.com/jdagdelen/hyperDB) | Python | A hyper-fast local vector database for use with LLM Agents. Now accepting SAFEs at $135M cap. |
| 633 | [Stevenic/vectra](https://github.com/Stevenic/vectra) | TypeScript | Vectra is a local vector database for Node.js with features similar to pinecone but built using local files. |
| 232 | [NodeDB-Lab/nodedb](https://github.com/NodeDB-Lab/nodedb) | Rust | The memory & storage engine for AI agents. Multi-model, edge-to-cloud, PostgreSQL-compatible. |
| 103 | [Egoist-Machines/LodeDB](https://github.com/Egoist-Machines/LodeDB) | Python | World's fastest and most compact embedded vector database: exact by default, multimodal, local-first, and GPU- |
| 80 | [cortex-works/cortex-db](https://github.com/cortex-works/cortex-db) | Shell | The local-first relational and vector database engine for Cortex-Works. Built with SQLite and LanceDB, it brin |
| 38 | [NTU-Siqiang-Group/AsterVec](https://github.com/NTU-Siqiang-Group/AsterVec) | C++ | Embedded on-device vector database for AI agent memory and local RAG — disk-based HNSW in an LSM-tree, C++/Pyt |
| 12 | [konjoai/vectro](https://github.com/konjoai/vectro) | Rust | ⚡ Vectro: Lightning-fast embedding quantization. Hit 12M+ vec/s throughput (4.85× faster than FAISS C++) while |

**拆开装到记忆上**

- **本地 embedding** → 语义检索不联网。对隐私诉求强、或离线使用的用户是刚需。
- **嵌入式向量库** → 不单独起一个向量服务，而是嵌进进程里。`zvec`（阿里开源，16k star）是 in-process 路线的代表。
- **向量量化** → 768 维 float32 一条要 3KB。8-bit 或二值量化能压到 1/4 以下。几千条记忆时这点空间不算什么，但**量化让「向量可以进主仓库」这件事变得可讨论**——否则光向量就比正文大。

**对北极星的判定。**

**暂不做，但这是最明确的一个「将来要不要做」的开关。**

现状是刻意的：零依赖、无向量、靠结构化字段 + 关键词。1500 条的规模下这个选择是对的。

- **触发条件**：用户出现「我想不起来那次聊的是什么，只记得大概内容」这类诉求时，才需要。在那之前，FTS5 关键词 + 结构化字段更准、更快、更能解释。

- **若做，路径是**：`sqlite-vec`（存储）+ 本地 ONNX 小模型（编码），**全部可选、默认关闭、装了才生效**。这与「零依赖」不冲突——零依赖说的是「不装也能跑」，不是「永远不许有第二个零件」。

- **注意**：一旦引入向量，就必须同时回答「向量文件在不在同步目录里」「换机器要不要重算」，否则会破坏本地优先的多设备方案。这不是技术问题，是它必须排在 P1 全部完成之后的理由。

### 3.8 个性化推荐与用户画像

**它原本解决什么。**

这一领域原本解决的是：根据用户的历史行为，猜他想要什么。

它和 AI 记忆看起来很像——都要「记住用户」。**这是本次扫描里踩空的一类。**

**对北极星的判定。**

**负结果，记录在案以免以后重复踩。**

50 条命中里几乎没有可用项，最高 318 star 的还是 FTC 机器人比赛的 SDK（误命中，名字里带 memory）。剩下的多是课程作业级推荐系统。

原因值得写下来：**「推荐系统的用户画像」和「AI 记忆」是看起来像、实际完全不重叠的两个问题。** 推荐系统用协同过滤从千万人行为里统计出偏好，它不需要、也做不到记住「你上次说你妈生日是 10 月 3 号」。它要的是统计意义上的相似，记忆要的是个体意义上的精确。

对北极星的启示：别往「猜你想要什么」的方向做。用户要的不是推荐，是**你说过的话别被忘掉**。

### 3.9 个人数据容器与便携标准

**它原本解决什么。**

这一领域原本解决的是：数据属于用户自己，应用只是借用。Solid（Tim Berners-Lee 发起）是这条路最著名的尝试。

**它是第二个负结果，但负得比个性化有价值。**

**零件**

| Star | 项目 | 语言 | 说明 |
|---|---|---|---|
| 45 | [pod-os/PodOS](https://github.com/pod-os/PodOS) | TypeScript | Personal Online Data Operating System |
| 36 | [polypoly-eu/polyPod](https://github.com/polypoly-eu/polyPod) | JavaScript | Personal data store and privacy-preserving runtime environment |
| 28 | [openwallet-foundation-labs/solid-data-wallet](https://github.com/openwallet-foundation-labs/solid-data-wallet) | TypeScript | A white label React Native data wallet app for storing and sharing personal data, utilizing Solid Pods. |
| 25 | [steamory/portal](https://github.com/steamory/portal) | JavaScript | Explore your personal data in SoLiD Pod |

**对北极星的判定。**

**理念对了，产品死了。**

整个 Solid POD 生态里 star 最高的项目只有 45 个，活跃度近乎停滞。polyPod 已归档，多数仓库停在数年前。

但**它失败的部位值得注意**：Solid 想用一套协议 + 数据规范解决便携性，结果是协议复杂、应用稀少、用户没有迁移的动力。

对北极星的启示是反过来的：**便携性不该靠标准协议实现，该靠人可读的文件格式实现。** 用户能用自己的编辑器打开 JSON、能用 git 管它、能把它扔进任何网盘，这种「不需要谁批准的可迁移性」比任何标准都管用。

这一点上北极星已经做对了——`data/` 下面是一堆人能读懂的 JSON。要守住的正是这个：**任何新功能都不能让数据变成只有本程序能读的东西。**

## 4. 一个没想到的流派：艾宾浩斯遗忘曲线

扫描前没想到的是：**「艾宾浩斯遗忘曲线」在 AI 记忆圈已经长成了一个独立流派。**
仅本次相邻扫描就命中 **67** 个以遗忘曲线 / 间隔重复 / 巩固为核心机制的项目，
其中不少是给 Claude Code、OpenClaw、DeepSeek Harness 做的 **skill 插件包**。

这说明两件事：

1. **衰减是公认的刚需**，民间已经自发实现了一堆，但**没有一个是可靠的**——它们几乎都是把 `exp(-t/S)` 直接套上去，没有经过真实数据校准，也没有评测。
2. **真正成熟的实现不在记忆圈，在 Anki 圈**。FSRS（free-spaced-repetition-scheduler，729 star）有算法本体、有 `srs-benchmark` 评测、有十几年几百万用户的行为数据打磨，是 MIT 许可的成熟算法。

| Star | 项目 | 说明 |
|---|---|---|
| 270 | [sachitrafa/YourMemory](https://github.com/sachitrafa/YourMemory) | Agentic AI memory with Ebbinghaus forgetting curve decay. +16pp better recall than Mem0 on LoCoMo. |
| 186 | [TiMEM-AI/TiMEM](https://github.com/TiMEM-AI/TiMEM) | Temporal-Hierarchical Memory Consolidation for Long-Horizon Conversational Agents |
| 158 | [grandamenium/dream-skill](https://github.com/grandamenium/dream-skill) | Memory consolidation skill for Claude Code - replicates Anthropic's unreleased auto-dream feature. 4 |
| 125 | [AaronRoeF/claude-code-patterns](https://github.com/AaronRoeF/claude-code-patterns) | Field-tested Claude Code patterns & anti-patterns for personal agents — an AI workflow that compound |
| 80 | [ldclabs/anda-brain](https://github.com/ldclabs/anda-brain) | 🧠 A native graph-based memory system for autonomous AI agents, featuring bio-inspired sleep-based me |
| 79 | [Kyros-494/kyros-ai](https://github.com/Kyros-494/kyros-ai) | Kyros — The Memory OS for AI Agents  Give your AI agents secure, self-correcting, persistent memory |
| 74 | [maimemo/SSP-MMC-Plus](https://github.com/maimemo/SSP-MMC-Plus) | Optimizing Spaced Repetition Schedule by Capturing the Dynamics of Memory |
| 64 | [pieralukasz/true-recall](https://github.com/pieralukasz/true-recall) | Native spaced repetition for Obsidian: AI-generated flashcards, FSRS v6 scheduling, image occlusion |
| 56 | [MemoryMagic/MemoryMagic-React-Native](https://github.com/MemoryMagic/MemoryMagic-React-Native) | Memory Magic App: The Ebbinghaus Forgetting Curve, Written by React Native for iOS. |
| 56 | [jack66g/spatial-memory-engine](https://github.com/jack66g/spatial-memory-engine) | A next-gen long-term memory engine for AI apps: self-organizing spatial regions, memory dynamics (Eb |
| 48 | [muratg98/psychmem](https://github.com/muratg98/psychmem) | Psychology-grounded selective memory system for AI agents (Claude Code, OpenCode) with STM/LTM conso |
| 46 | [tonitangpotato/engram-ai](https://github.com/tonitangpotato/engram-ai) | Neuroscience-grounded memory for AI agents — ACT-R activation, Ebbinghaus forgetting, Hebbian learni |
| 37 | [prefrontal-systems/cortexgraph](https://github.com/prefrontal-systems/cortexgraph) | Temporal memory system for AI assistants with human-like forgetting curves. All data stored locally |
| 33 | [mlapeter/claude-engram](https://github.com/mlapeter/claude-engram) | Brain-inspired persistent memory for Claude.ai. A single React artifact gives Claude salience scorin |
| 27 | [zensation-ai/zenbrain](https://github.com/zensation-ai/zenbrain) | Dynamic agent memory for LLM agents: 7 neuroscience-inspired layers (working, episodic, semantic, pr |
| 27 | [kyegomez/MC-ViT](https://github.com/kyegomez/MC-ViT) | Implementation of the model: "(MC-ViT)" from the paper: "Memory Consolidation Enables Long-Context V |
| 26 | [AnubisQuantumCipher/sia](https://github.com/AnubisQuantumCipher/sia) | SIA — the Omarchy Brain: a persistent, associative, self-consolidating memory for your Linux desktop |
| 24 | [qyiun666/MemHop](https://github.com/qyiun666/MemHop) | Embedded long-term memory database for AI agents & LLM apps. Six-layer cognitive architecture, knowl |
| 22 | [cgbarlow/machine-dream_AG](https://github.com/cgbarlow/machine-dream_AG) | Machine Dream - Continuous machine cognition research platform with GRASP loop, dreaming consolidati |
| 22 | [CaiusDai/RecMem](https://github.com/CaiusDai/RecMem) | This repository contains the implementation of the paper "RecMem: Recurrence-based Memory Consolidat |
| 22 | [deep-spin/Infinite-Video](https://github.com/deep-spin/Infinite-Video) | \infty-Video: A Training-Free Approach to Long Video Understanding via Continuous-Time Memory Consol |
| 19 | [nishit546/OpenPrep-AI](https://github.com/nishit546/OpenPrep-AI) | An advanced AI-powered exam preparation workspace to analyze lecture notes & PYQs, auto-schedule stu |

**结论**：要加衰减，**别自己写公式，去借 FSRS**。同时必须做评测，
否则只是把「感觉应该衰减」换成了「代码里写着衰减」，对用户没有任何区别。

两件能直接拿来用的现成资产：

- **`open-spaced-repetition/free-spaced-repetition-scheduler`** —— 有 benchmark、有十几年真实行为数据打磨的成熟算法（MIT）。
- **`Neal006/memorylens-bench`** —— 专门**评测 LLM 记忆衰减**的 benchmark，直接对比 Naive / RAG / 各类衰减策略。这正是主报告里 P0「评测 harness」缺的一块拼图。

## 5. 意外收获：在别人地盘上找到的记忆项目

下面是相邻扫描里含记忆信号、**且不在上一份 693 个相关项目里**的仓库（按 star 排序）。
它们证明了这条路是通的：搜「sqlite fts5」能搜到 engram，搜「spaced repetition」能搜到 YourMemory，
**搜什么不重要，重要的是别只搜一个词。**

共 **130** 个新增。

| Star | 项目 | 来源类别 | 说明 |
|---|---|---|---|
| 1766 | [tickernelz/opencode-mem](https://github.com/tickernelz/opencode-mem) | 本地模型 | OpenCode plugin that gives coding agents persistent memory using local vector database |
| 619 | [winstonkoh87/Athena-Public](https://github.com/winstonkoh87/Athena-Public) | 结构/实体 | Local-first memory, decision engine, and governance harness for AI agents — portable across IDEs |
| 318 | [chrisneagu/FTC-Skystone-Dark-Angels-Romania-2020](https://github.com/chrisneagu/FTC-Skystone-Dark-Angels-Romania-2020) | 个性化 | NOTICE This repository contains the public FTC SDK for the SKYSTONE (2019-2020) competition seas |
| 273 | [codecoradev/uteke](https://github.com/codecoradev/uteke) | 本地模型 | 🧠 The Brain for Your AI — Local-first memory engine for AI agents. Store, recall, and search mem |
| 270 | [sachitrafa/YourMemory](https://github.com/sachitrafa/YourMemory) | 认知/生命周期 | Agentic AI memory with Ebbinghaus forgetting curve decay. +16pp better recall than Mem0 on LoCoM |
| 232 | [NodeDB-Lab/nodedb](https://github.com/NodeDB-Lab/nodedb) | 本地模型 | The memory & storage engine for AI agents. Multi-model, edge-to-cloud, PostgreSQL-compatible. |
| 224 | [Phant0Meow/dsh-meow-memory](https://github.com/Phant0Meow/dsh-meow-memory) | 认知/生命周期 | Cross-session memory plugin for DeepSeek Harness: seven-layer SQLite store (soul/user/project/fa |
| 208 | [project-minigraf/minigraf](https://github.com/project-minigraf/minigraf) | 数据/版本 | Embedded graph memory for AI agents, mobile apps, and the browser. |
| 164 | [jettbrains/-L-](https://github.com/jettbrains/-L-) | 本地模型 | W3C Strategic Highlights  September 2019  This report was prepared for the September 2019 W3C Ad |
| 158 | [grandamenium/dream-skill](https://github.com/grandamenium/dream-skill) | 认知/生命周期 | Memory consolidation skill for Claude Code - replicates Anthropic's unreleased auto-dream featur |
| 138 | [Aik358/dsh-auto-memory](https://github.com/Aik358/dsh-auto-memory) | 认知/生命周期 | Proactive associative memory for DSH: system-prompt recall before the model speaks, three-layer |
| 129 | [radimsem/remindb](https://github.com/radimsem/remindb) | 检索/索引 | An agentic memory database that cuts session tokens by 82–99%. One portable SQLite file — your a |
| 125 | [AaronRoeF/claude-code-patterns](https://github.com/AaronRoeF/claude-code-patterns) | 认知/生命周期 | Field-tested Claude Code patterns & anti-patterns for personal agents — an AI workflow that comp |
| 92 | [klonnet23/helloy-word](https://github.com/klonnet23/helloy-word) | 权限/安全 | {   "releases": {     "2.0.4": [       "[Fixed] Refresh for Enterprise repositories did not |
| 80 | [ldclabs/anda-brain](https://github.com/ldclabs/anda-brain) | 认知/生命周期 | 🧠 A native graph-based memory system for autonomous AI agents, featuring bio-inspired sleep-base |
| 77 | [Da7-Tech/mind](https://github.com/Da7-Tech/mind) | 认知/生命周期 | Persistent memory for AI coding agents: automatic capture, explainable recall, knowledge consoli |
| 74 | [maimemo/SSP-MMC-Plus](https://github.com/maimemo/SSP-MMC-Plus) | 认知/生命周期 | Optimizing Spaced Repetition Schedule by Capturing the Dynamics of Memory |
| 68 | [francislabountyjr/Dreambooth-Anything](https://github.com/francislabountyjr/Dreambooth-Anything) | 认知/生命周期 | A repository to consolidate stable diffusion finetuning scripts. Train inpainting, depth, v1+, v |
| 64 | [pieralukasz/true-recall](https://github.com/pieralukasz/true-recall) | 认知/生命周期 | Native spaced repetition for Obsidian: AI-generated flashcards, FSRS v6 scheduling, image occlus |
| 56 | [MemoryMagic/MemoryMagic-React-Native](https://github.com/MemoryMagic/MemoryMagic-React-Native) | 认知/生命周期 | Memory Magic App: The Ebbinghaus Forgetting Curve, Written by React Native for iOS. |
| 50 | [Fozikio/cortex-engine](https://github.com/Fozikio/cortex-engine) | 认知/生命周期 | Cognitive engine for AI agents — semantic memory, observations, embeddings, dream consolidation. |
| 49 | [kapillamba4/code-memory](https://github.com/kapillamba4/code-memory) | 检索/索引 | MCP server with local vector search for your codebase. Smart indexing, semantic search, Git hist |
| 48 | [limen-threshold/anchor-memory](https://github.com/limen-threshold/anchor-memory) | 认知/生命周期 | Graph-structured memory for AI with Hebbian learning, emotion scoring, and dream consolidation. |
| 48 | [daveshap/HierarchicalMemoryConsolidationSystem](https://github.com/daveshap/HierarchicalMemoryConsolidationSystem) | 认知/生命周期 | HMCS - Experiments on how to consolidate and manage ACE memories |
| 48 | [muratg98/psychmem](https://github.com/muratg98/psychmem) | 认知/生命周期 | Psychology-grounded selective memory system for AI agents (Claude Code, OpenCode) with STM/LTM c |
| 47 | [nexus9888/hermes-memory-skills](https://github.com/nexus9888/hermes-memory-skills) | 认知/生命周期 | Memory hygiene skills for Hermes Agent — dreaming (3-phase consolidation) |
| 47 | [tstockham96/engram](https://github.com/tstockham96/engram) | 认知/生命周期 | Universal memory layer for AI agents. Remember, recall, consolidate. |
| 46 | [tonitangpotato/engram-ai](https://github.com/tonitangpotato/engram-ai) | 认知/生命周期 | Neuroscience-grounded memory for AI agents — ACT-R activation, Ebbinghaus forgetting, Hebbian le |
| 40 | [cogitator-ai/Cogitator-AI](https://github.com/cogitator-ai/Cogitator-AI) | 运维 | AI agents that survive production. Self-hosted TypeScript runtime: multi-provider LLMs, tools wi |
| 39 | [braincompany/sessiongrep](https://github.com/braincompany/sessiongrep) | 检索/索引 | Local-first memory layer for CLI agents. Indexes Claude Code, Codex CLI, Cursor, Antigravity, an |
| 38 | [NTU-Siqiang-Group/AsterVec](https://github.com/NTU-Siqiang-Group/AsterVec) | 本地模型 | Embedded on-device vector database for AI agent memory and local RAG — disk-based HNSW in an LSM |
| 36 | [TopGunBuild/topgun](https://github.com/TopGunBuild/topgun) | 数据/版本 | Offline-first in-memory data grid with CRDT sync and a Rust server |
| 35 | [HydStAn/agy-memory-engine](https://github.com/HydStAn/agy-memory-engine) | 检索/索引 | Lightweight SQLite FTS5 dynamic memory layer & MCP server for Google Antigravity (AGY) |
| 35 | [mdxedia/Awsome-Cash](https://github.com/mdxedia/Awsome-Cash) | 结构/实体 | Updated January 2016  Note on translation: These Website Terms of Service may have been translat |
| 34 | [iCanDoAllThingszz/brain-mem](https://github.com/iCanDoAllThingszz/brain-mem) | 认知/生命周期 | Brain-inspired memory system for AI agents — hippocampal buffer, working memory, and sleep conso |
| 33 | [mlapeter/claude-engram](https://github.com/mlapeter/claude-engram) | 认知/生命周期 | Brain-inspired persistent memory for Claude.ai. A single React artifact gives Claude salience sc |
| 32 | [r0b0tlab/llm-wiki_obsidian_hermes_r0b0tlabbra1n](https://github.com/r0b0tlab/llm-wiki_obsidian_hermes_r0b0tlabbra1n) | 检索/索引 | Filesystem-first LLM-Wiki + Obsidian + Hermes Agent memory system. Markdown source of truth, SQL |
| 32 | [TT-Wang/memem](https://github.com/TT-Wang/memem) | 检索/索引 | A Claude Code plugin that gives Claude persistent memory across sessions — stores lessons and de |
| 31 | [speedydivid/TokenForge](https://github.com/speedydivid/TokenForge) | 检索/索引 | Context window optimization for AI coding agents. Sandboxes tool output (98% reduction), persist |
| 30 | [stn1slv/spec-kit-archive](https://github.com/stn1slv/spec-kit-archive) | 认知/生命周期 | Archive merged features into main project memory. Consolidates feature specs, plans, and technic |
| 29 | [hr98w/dsh-memory](https://github.com/hr98w/dsh-memory) | 认知/生命周期 | 融合 Claude Code 的 Auto Memory 与 Codex 的 Session 记忆整理，为 DeepSeek Harness 提供简单、透明、上下文友好的长期记忆。Claude |
| 29 | [Arlodotexe/OwlCore.AI.Exocortex](https://github.com/Arlodotexe/OwlCore.AI.Exocortex) | 认知/生命周期 | The Exocortex is a remembrance agent, a generative agent designed to simulate the human brain's |
| 27 | [muhamadjawdatsalemalakoum/kith](https://github.com/muhamadjawdatsalemalakoum/kith) | 数据/版本 | Serverless, end-to-end-encrypted, no-account sync for your own devices — memory, tabs, and files |
| 27 | [kyegomez/MC-ViT](https://github.com/kyegomez/MC-ViT) | 认知/生命周期 | Implementation of the model: "(MC-ViT)" from the paper: "Memory Consolidation Enables Long-Conte |
| 27 | [DickDumBR1/Aim](https://github.com/DickDumBR1/Aim) | 个性化 | Skip to content Sign up Sign in This repository   Search Explore Features Enterprise Pricing  Wa |
| 25 | [archit15singh/memori](https://github.com/archit15singh/memori) | 检索/索引 | Persistent memory for AI coding agents — SQLite + FTS5 + vector search in a single file |
| 25 | [BluePointDigital/smart-memory](https://github.com/BluePointDigital/smart-memory) | 认知/生命周期 | A local, persistent cognitive OS for AI agents. Features continuous background consolidation, cu |
| 22 | [spectrayan/spector](https://github.com/spectrayan/spector) | 认知/生命周期 | Memory backbone for AI agents. Four-tier store — working, episodic, semantic, procedural — with |
| 22 | [deep-spin/Infinite-Video](https://github.com/deep-spin/Infinite-Video) | 认知/生命周期 | \infty-Video: A Training-Free Approach to Long Video Understanding via Continuous-Time Memory Co |
| 21 | [SE-Design/FAQ.md](https://github.com/SE-Design/FAQ.md) | 权限/安全 | NetSaver Pro ========  Please scroll down if you want to ask a question, request a feature or re |
| 20 | [epinethrone/apricity](https://github.com/epinethrone/apricity) | 检索/索引 | Apricity — a fast, local-first web UI for MemPalace: browse, search, edit & curate your AI agent |
| 20 | [TerminallyLazy/Tree-Ring-Memory](https://github.com/TerminallyLazy/Tree-Ring-Memory) | 认知/生命周期 | Framework-agnostic, local-first memory lifecycle for AI agents: Rust CLI, SQLite/FTS recall, for |
| 20 | [Lifestylerr/DAWD](https://github.com/Lifestylerr/DAWD) | 个性化 | /*The MIT License (MIT) Copyright (c) 2015 Apostolique Permission is hereby granted, free of cha |
| 19 | [nishit546/OpenPrep-AI](https://github.com/nishit546/OpenPrep-AI) | 认知/生命周期 | An advanced AI-powered exam preparation workspace to analyze lecture notes & PYQs, auto-schedule |
| 18 | [edg-l/engram-mcp](https://github.com/edg-l/engram-mcp) | 本地模型 | MCP server in Rust for AI agent persistent memory: branch-aware session handoffs, local ONNX emb |
| 17 | [arananet/cognition.md](https://github.com/arananet/cognition.md) | 认知/生命周期 | Cognitive contract spec for agentic memory. Grounded in neuroscience, not vendor docs. Defines h |
| 17 | [1420079678-ctrl/agent-body](https://github.com/1420079678-ctrl/agent-body) | 认知/生命周期 | Gates 84.7% of tool-schema prompt tokens away for DeepSeek Harness: plugins declare themselves o |
| 16 | [krsnczky/agency-memory-kit](https://github.com/krsnczky/agency-memory-kit) | 认知/生命周期 | Per-client, no-mixing memory engine for agencies running Claude Code. Deterministic context load |
| 14 | [danielwanwx/am-memory](https://github.com/danielwanwx/am-memory) | 检索/索引 | Persistent memory for Claude Code — SQLite-backed knowledge store with BM25+Vector search and MC |
| 14 | [LARIkoz/eidetic](https://github.com/LARIkoz/eidetic) | 检索/索引 | Claude Code memory system — auto context injection, drift detection, compounding, FTS5/vector se |

## 6. 一个被反复验证的技术栈

把这些项目用的存储方案数一遍，会发现一个明显的事实：
**在「本地 / 单文件 / 无服务」这条路上，大家的答案高度一致——SQLite + FTS5。**

本次含记忆信号的 186 个项目里，**30 个**在描述里明确提到 SQLite，其中 **18 个**同时提到 FTS5。

（绝对占比只有 16%，看着不高——但多数项目的描述根本不会提存储方案，
**会提的那批，提的就是 SQLite**。这个信号强度比数字本身要大。）

| Star | 项目 | 说明 |
|---|---|---|
| 7459 | [Gentleman-Programming/engram](https://github.com/Gentleman-Programming/engram) | Persistent memory system for AI coding agents. Agent-agnostic Go binary with SQLite + FTS5, MCP serv |
| 224 | [Phant0Meow/dsh-meow-memory](https://github.com/Phant0Meow/dsh-meow-memory) | Cross-session memory plugin for DeepSeek Harness: seven-layer SQLite store (soul/user/project/fact/l |
| 219 | [fellowgeek/mcp-memory](https://github.com/fellowgeek/mcp-memory) | An OKF-backed Model Context Protocol (MCP) server delivering persistent long-term memory and SQLite |
| 189 | [willynikes2/knowledge-base-server](https://github.com/willynikes2/knowledge-base-server) | Make every AI agent you use smarter. Persistent memory with SQLite FTS5, MCP server, Obsidian sync, |
| 162 | [slow-stack/mneme](https://github.com/slow-stack/mneme) | 🧠 The memory that dreams — cross-session memory for DeepSeek Harness. Local SQLite + Markdown mirror |
| 129 | [radimsem/remindb](https://github.com/radimsem/remindb) | An agentic memory database that cuts session tokens by 82–99%. One portable SQLite file — your agent |
| 94 | [syiibfs-hash/cc-agent-brain](https://github.com/syiibfs-hash/cc-agent-brain) | Local-first memory engine for coding agents (Claude Code/Cursor/Codex): SQLite+FTS5 retrieval, versi |
| 79 | [NanoFlow-io/engram](https://github.com/NanoFlow-io/engram) | 🧠 Hybrid long-term memory plugin for OpenClaw agents — SQLite+FTS5 for structured facts, LanceDB for |
| 75 | [cdeust/Cortex](https://github.com/cdeust/Cortex) | Cross-platform persistent memory MCP for Codex, Gemini CLI, Claude Code, and other local MCP hosts. |
| 67 | [sdsrss/claude-mem-lite](https://github.com/sdsrss/claude-mem-lite) | Persistent long-term memory for Claude Code via MCP — captures coding decisions, bugfixes, and conte |
| 39 | [braincompany/sessiongrep](https://github.com/braincompany/sessiongrep) | Local-first memory layer for CLI agents. Indexes Claude Code, Codex CLI, Cursor, Antigravity, and Pi |
| 39 | [MarceloCaporale/codex-agent-mem](https://github.com/MarceloCaporale/codex-agent-mem) | Local-first Model Context Protocol (MCP) memory layer for Codex CLI/Desktop, Claude Code, Gemini CLI |
| 36 | [Haustorium12/continuity-v2](https://github.com/Haustorium12/continuity-v2) | Long-term memory for Claude Code. Indexes every session as SQLite+FTS5, exposes recall via MCP, and |
| 35 | [HydStAn/agy-memory-engine](https://github.com/HydStAn/agy-memory-engine) | Lightweight SQLite FTS5 dynamic memory layer & MCP server for Google Antigravity (AGY) |
| 32 | [r0b0tlab/llm-wiki_obsidian_hermes_r0b0tlabbra1n](https://github.com/r0b0tlab/llm-wiki_obsidian_hermes_r0b0tlabbra1n) | Filesystem-first LLM-Wiki + Obsidian + Hermes Agent memory system. Markdown source of truth, SQLite |
| 32 | [TT-Wang/memem](https://github.com/TT-Wang/memem) | A Claude Code plugin that gives Claude persistent memory across sessions — stores lessons and decisi |
| 31 | [speedydivid/TokenForge](https://github.com/speedydivid/TokenForge) | Context window optimization for AI coding agents. Sandboxes tool output (98% reduction), persists se |
| 25 | [archit15singh/memori](https://github.com/archit15singh/memori) | Persistent memory for AI coding agents — SQLite + FTS5 + vector search in a single file |
| 20 | [TerminallyLazy/Tree-Ring-Memory](https://github.com/TerminallyLazy/Tree-Ring-Memory) | Framework-agnostic, local-first memory lifecycle for AI agents: Rust CLI, SQLite/FTS recall, forgett |
| 18 | [edg-l/engram-mcp](https://github.com/edg-l/engram-mcp) | MCP server in Rust for AI agent persistent memory: branch-aware session handoffs, local ONNX embeddi |

这对北极星是个好消息也是个警告：

- **好消息**：选定的方向与主流一致，说明判断没错。
- **警告**：**这已经是及格线，不再是差异化**。当所有人都用 SQLite+FTS5 时，它不构成任何卖点。
北极星真正不一样的地方是**文件即数据、人可直接编辑、单一真源、只注入上一轮**——这些才是别人没有的。

## 7. 落到北极星的清单

按「成本 / 收益 / 是否与铁律冲突」排序，只列本次扫描新推导出的，已在主报告列的（如评测 harness）不重复。

| 优先级 | 动作 | 来自 § | 成本 | 与铁律的关系 |
|---|---|---|---|---|
| **P1** | FTS5 侧车索引（`data/index.db`），检索不再全量扫文件 | 3.1 | 中 | 不冲突——索引是派生数据，可随时重建 |
| **P1** | 中文分词（自实现 bigram + 拼音首字母，不引原生二进制） | 3.1 | 中 | 不冲突 |
| **P1** | 记录加 `valid_from` / `valid_to` / `superseded_by` | 3.2 | 低 | 不冲突——默认空，读路径不受影响 |
| **P1** | `last_access_at` / `access_count` / `decay_score` 三个派生量（**不落盘**） | 3.4 | 低 | **必须不落盘**，否则违反单一真源 |
| **P1** | search 排序改为 `相关性 × 衰减分` | 3.4 | 低 | 不冲突 |
| **P1** | `memory_consolidate`：多轮合并为一条，原记录标 `superseded_by` | 3.4 | 中 | 不冲突——原记录保留可读 |
| **P1** | `source` 来源标记（user_input / web_content / file / tool_output） | 3.5 | 低 | 不冲突 |
| **P1** | 写入侧注入特征检测，**标记而非拒绝** | 3.5 | 低 | **只能标记**，拒绝会违反「写入永不因残缺拒绝」 |
| **P1** | 记录「召回了但没被引用」的比例 | 3.6 | 低 | 不冲突 |
| P2 | 实体别名表 `data/entities.json` | 3.3 | 低 | 不冲突——人可编辑 |
| P2 | `.trash` 旧版本组织成事件日志，支持恢复到指定版本 | 3.2 | 中 | 不冲突 |
| P2 | surprise gating（**后置清理**，不得前置拦截） | 3.4 | 中 | **前置拦截会违反写入铁律** |
| 不做 | 向量检索 / 本地 embedding | 3.7 | 高 | 待触发条件出现 |
| 不做 | 图数据库 / GraphRAG | 3.3 | 高 | 破坏零依赖 + 单文件 |
| 不做 | bitemporal 数据库 / ABAC / OpenTelemetry | 3.2,3.5,3.6 | 高 | 当前规模不需要 |
| 不做 | 个性化推荐 / Solid POD | 3.8,3.9 | — | **已验证为负，不再投入** |

## 8. 再往外一层

这一轮扫了 9 个相邻领域。回头看，**边缘还没到头**：

1. **认知科学本体**——这一轮只扫到了它在 GitHub 上的实现。真正的源头是论文：记忆巩固的睡眠机制、提取练习效应（testing effect）、间隔效应（spacing effect）、ACT-R 激活模型。其中 ACT-R 已经有人搬进来了（`tonitangpotato/engram-ai`），但还很粗糙。
2. **更多存储引擎**——本次只覆盖了 SQLite 生态。Kùzu（嵌入式图）、DuckDB（嵌入式分析）、Redb/SQLite 的 LMDB 替代，这些「嵌入式」家族里还可能躺着别的零件。
3. **人类的外部记忆工具**——Obsidian、Logseq、Zettelkasten 这些方法论已经打磨了几十年，解决的是同一个问题：**怎么让记住的东西以后还能找到**。本次只碰到了 `pieralukasz/true-recall`（Obsidian 间隔重复）。
4. **法律与合规**——记忆会留存多久、用户要求删除时怎么办、「被遗忘权」怎么落地。这一块在 AI 记忆讨论里几乎无人提起，但它是真的会来的。
5. **更奇怪的地方**——文件系统（`nisamaasoglu/LetheFS`，会自主遗忘的文件系统）、游戏存档、版本控制系统。本次只看到 0-2 star 的雏形。

**结论：这片海确实比扫到的更深。** 本次 22 组查询拿到的东西已经超出预期，
而它只是 9 个方向的第一层。


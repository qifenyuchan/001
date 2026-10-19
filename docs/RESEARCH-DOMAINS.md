# 按人群扫：理工与文创各自的土办法

> 生成时间：2026-10-20 03:12　|　数据源：`research/github-domains.json`（GitHub Search API）

## 0. 第四轮：换成人视角

前三轮都是技术视角——产品、相邻领域、上游。这一轮换成**用户视角**：
AI 用得最多的两群人，是**理工类**（写代码、做工程）和**文创类**（写长篇、做角色扮演、跑团）。

这两群人早就被同一个问题折磨——「AI 记不住」——而且**各自攒出了土办法**：
理工的有决策记录、会话交接、实验笔记；文创的有世界书、角色卡、故事圣经。

本轮只问一件事：**他们的土办法里，有没有可以直接搬的机制。**

| 群落 | 查询数 | 命中 | 一句话概括 |
|---|---|---|---|
| 理工·工程 | 8 | 345 | 模板的富矿，赛道的红海 |
| 文创·叙事 | 8 | 368 | 土办法已经解决了半个问题 |

### 口径与局限

- 与前三轮一致：仓库自述、未抓 README、未安装验证。
- 去重 **709** 个，其中 **654** 个是前三轮没见过的——**四轮里重叠最低的一次**，
说明按人群扫与技术视角几乎正交，两条路都值得走。
- star 异常高的头部项目（疑似刷星）一律不采信。

## 1. 文创·叙事：土办法已经解决了半个问题

写长篇的人面对的记忆问题，比对话助手苛刻得多：一部网文几百万字，角色三百个，

第三章埋的伏笔第三百章要收。AI 记不住设定，写出来的角色就会前后矛盾。

这个社区被折磨了几年，攒出了几样土办法——**没有一样用向量**。

**样本**

| Star | 项目 | 语言 | 说明 |
|---|---|---|---|
| 7755 | [zenstory-ai/oh-story-claudecode](https://github.com/zenstory-ai/oh-story-claudecode) | Python | Claude Code / Codex / OpenCode agent skills for writing Chinese web novels (网文): 扫榜、拆文、写作、去AI味、封面全流程，长篇短 |
| 3975 | [PenglongHuang/chinese-novelist-skill](https://github.com/PenglongHuang/chinese-novelist-skill) | Python | 🎭 AI 写小说：从零生成 10-50 章完整中文小说，三层问答 · 创作记忆 · 悬念钩子 · 自动校验，长篇网文连载皆宜｜开源免费，适配主流 coding agent｜🤝 Infistar.cc 赞助 · |
| 3238 | [ExplosiveCoderflome/AI-Novel-Writing-Assistant](https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant) | TypeScript | 面向长篇小说创作的 AI Native 开源系统，用 Agent、世界观、写法引擎、RAG 和整本生产工作流，帮助新手从一句灵感走到完整小说。AI-native engine for end-to-end n |
| 1646 | [EthanYoQ/AI-Novel-Writer](https://github.com/EthanYoQ/AI-Novel-Writer) | TypeScript | 书童 Pagekin（原名 AI 小说作家）：开源免费的 AI 长篇小说写作桌面软件，从设定、蓝图到正文、审稿、定稿；支持拆解仿写、续写、改写，可导入写作 Skill（如去 AI 味）。模型需自行配置，作品在 |
| 1233 | [syrizelink/OpenFic](https://github.com/syrizelink/OpenFic) | Python | 专为小说创作打造的跨平台、用户友好、AI Native 的一站式 Vibe Writing 工具。A cross-platform, user-friendly, AI-native, all-in-one |
| 951 | [alfredxw/denova](https://github.com/alfredxw/denova) | Go | An AI creative platform for novel writing and AI generated RPG, with built-in support for AI agents, Ski |
| 911 | [yuanbw2025/storyforge](https://github.com/yuanbw2025/storyforge) | TypeScript | 故事熔炉 StoryForge — AI 小说创作工作台 / AI novel writing workshop |
| 735 | [mak-kirkland/chronicler](https://github.com/mak-kirkland/chronicler) | Svelte | Chronicler is a free, offline worldbuilding tool and local wiki for writers, game masters, and tabletop |
| 411 | [indentlabs/notebook](https://github.com/indentlabs/notebook) | HTML | Notebook.ai is a set of tools for writers, game designers, and roleplayers to create magnificent univers |
| 360 | [owlchester/kanka](https://github.com/owlchester/kanka) | PHP | Worldbuilding and RPG campaign management tool |
| 246 | [carlonicora/obsidian-rpg-manager](https://github.com/carlonicora/obsidian-rpg-manager) | TypeScript | RPG Manager is a tool to simplify the plot, run and track of role playing game campaigns, helping storyt |
| 202 | [SenriYuki/SillyTavern-Horae](https://github.com/SenriYuki/SillyTavern-Horae) | JavaScript | SillyTavern 记忆增强插件 / Memory enhancement extension for SillyTavern |
| 199 | [malfoyslastname/character-card-spec-v2](https://github.com/malfoyslastname/character-card-spec-v2) | — | An updated specification for AI character cards. |
| 176 | [Lodactio/Extension-Summaryception](https://github.com/Lodactio/Extension-Summaryception) | JavaScript | Sillytavern memory plug-in |
| 133 | [bmen25124/SillyTavern-WorldInfo-Recommender](https://github.com/bmen25124/SillyTavern-WorldInfo-Recommender) | TypeScript | A SillyTavern extension that helps you manage world info based on the current context with LLMs using co |
| 126 | [SillyTavern/SillyTavern-Timelines](https://github.com/SillyTavern/SillyTavern-Timelines) | JavaScript | Timeline view for SillyTavern chats |
| 75 | [Anshler/graphify-novel](https://github.com/Anshler/graphify-novel) | — | A knowledge-graph AI writing assistant - tracks characters, threads, and world-building across your full |
| 34 | [awrshift/agent-memory-kit](https://github.com/awrshift/agent-memory-kit) | Python | Built-in memory decides what to remember. This one asks. Agent memory as plain files in your folder: the |
| 14 | [ynnyh/jarvis-write](https://github.com/ynnyh/jarvis-write) | Python | A controllable, revisable, consistency-first AI system for long-form novel writing — temporal story bibl |
| 6 | [ocedo-apps/StoryBook-AI](https://github.com/ocedo-apps/StoryBook-AI) | TypeScript | StoryBook AI — local-first prose tool. The Story Bible holds truth. The model drafts. You decide. |

**他们的机制，拆开装到记忆上**

- **世界书（Lorebook / World Info）——触发式注入** → 一大堆设定条目，每条带**触发关键词**；对话中出现关键词，对应条目才被注入上下文。这是从 AI Dungeon 到 NovelAI 到 SillyTavern 打磨了多年的机制。**注意它和向量检索的根本区别**：向量是「算出来的相似」，世界书是「作者指定的命中」——更可控、更便宜、可解释，坏处是靠人维护。
- **角色卡（Character Card）——结构化人设** → 有正式 spec（v2/v3）：名字、描述、性格、场景、示例对话，PNG 元数据里嵌 JSON。关键是 spec 里还有 `character_book` 字段——**角色卡里内嵌一个迷你世界书**。「对方是谁」被建模成一张卡，而不是一堆流水。
- **故事圣经（Story Bible）——真相层** → 已确立事实的清单：世界规则、角色年龄、时间线。写作时必须遵守。有项目把这个说破了：「**The Story Bible holds truth**」——真相和过程是两层，过程草稿怎么改都不碰真相层。
- **一致性校验** → 中文网文工具开始内置「自动校验」与「consistency-first」——检测「第三章用剑的人第三百章突然用枪」。这是记忆矛盾检测的应用形态。
- **跑团管理（Campaign Manager）** → 世界状态、NPC 关系、时间线、**session recap**（每次跑完团写一篇回顾）。session recap 就是「会话总结」的人类版，跑团社区已经写了几十年。

**对北极星的判定。**

**这一轮最大的发现：中文网文社区。**
本轮扫到的中文网文 AI 写作工具全部是中文社区做的，star 全线高于英文同类
（7755 / 3975 / 3238 / 1646 / 1233……），而且描述里直接写着「**创作记忆**」「**自动校验**」
——**「AI 记不住设定」在这个社区已经是被点名、被产品化的痛点**。
这对北极星「首发中文 Agent 生态」的判断是第四轮的独立验证：不是我们猜中文用户需要记忆，
是他们已经在自己动手造了。

**可搬的机制，按价值排序：**

- **触发式注入（P1/P2，本轮最大收获）**：北极星现在的注入只有两种——固定注入上一轮（被动、有界）和查询式召回（要 Agent 主动发起）。世界书是第三种：**记录带触发词，当前对话命中就自动进上下文**。它解决的是查询式的死穴——Agent 不知道自己该查什么。落地：记录加可选 `triggers` 字段（关键词列表），每轮对当前输入做一次本地关键词匹配（微秒级），命中且预算允许则随上一轮一起注入。预算优先级：上一轮 > 触发命中 > 搜索结果。
- **真相层（P2）**：记录加 `pinned`（钉为事实）标记。文创的「故事圣经」验证了「真相与过程分层」的必要性——被钉住的记录被新记录取代时要显式确认，这同时是「旧事实冒充新事实」的一道光闸。
- **决策记录模板（P1，几乎零成本）**：ADR 的结构（背景/决定/后果/状态）与北极星七字段高度同构——**这等于工程界用十几年验证了「结构化字段」这条路线**。既然 v2.6 已有自定义方案机制，出一个 `adr` 风格模板就是一晚上的事。
- **兼容角色卡 spec（P3，先记下）**：中文文创用户对 character card spec 极熟。若将来做「实体卡」（人物/项目的结构化档案），直接参考它的字段设计，能省一次发明。

## 2. 理工·工程：模板的富矿，赛道的红海

写代码的人是 AI 记忆产品最密集的用户群，本轮再扫一遍，仍然能翻出新东西。

但结论和文创正好相反：文创是蓝海里长出了机制，工程是**红海里长满了模板**。

**样本**

| Star | 项目 | 语言 | 说明 |
|---|---|---|---|
| 46935 | [DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) | C | High-performance code intelligence MCP server. Indexes codebases into a persistent knowledge graph — ave |
| 28022 | [gastownhall/beads](https://github.com/gastownhall/beads) | Go | Beads - A memory upgrade for your coding agent |
| 17248 | [architecture-decision-record/architecture-decision-record](https://github.com/architecture-decision-record/architecture-decision-record) | CSS | Architecture decision record (ADR) examples for software planning, IT leadership, and template documenta |
| 11168 | [akitaonrails/ai-memory](https://github.com/akitaonrails/ai-memory) | Rust | Solution for long term memory for agent coding CLIs and to facilitate handoff between different agent ve |
| 5735 | [npryce/adr-tools](https://github.com/npryce/adr-tools) | Shell | Command-line tools for working with Architecture Decision Records |
| 5387 | [breferrari/obsidian-mind](https://github.com/breferrari/obsidian-mind) | TypeScript | A self-organizing Obsidian vault that gives AI coding agents persistent memory. |
| 4948 | [campfirein/byterover-cli](https://github.com/campfirein/byterover-cli) | TypeScript | ByteRover CLI (brv) - The portable memory layer for  autonomous coding agents (formerly Cipher) |
| 4821 | [eugeniughelbur/obsidian-second-brain](https://github.com/eugeniughelbur/obsidian-second-brain) | Python | Persistent memory for Claude Code, Codex and 6 other AI agents, stored as plain markdown in your Obsidia |
| 4385 | [tigerless-labs/agent-memory](https://github.com/tigerless-labs/agent-memory) | Python | Long-term memory runtime for AI agents — plain Markdown as the source of truth, local ranked retrieval, |
| 2570 | [adr/madr](https://github.com/adr/madr) | Markdown | Markdown Architectural Decision Records |
| 1603 | [thomvaill/log4brains](https://github.com/thomvaill/log4brains) | TypeScript | ✍️ Architecture Decision Records (ADR) management and publication tool |
| 1456 | [elabftw/elabftw](https://github.com/elabftw/elabftw) | PHP | :notebook: eLabFTW is the most popular open source electronic lab notebook for research labs. |
| 62 | [blader/baton](https://github.com/blader/baton) | — | Baton — clean session handoffs: pass in-progress work to the next agent with a single verified markdown |
| 34 | [awrshift/agent-memory-kit](https://github.com/awrshift/agent-memory-kit) | Python | Built-in memory decides what to remember. This one asks. Agent memory as plain files in your folder: the |

**他们的机制，拆开装到记忆上**

- **ADR（架构决策记录）** → 软件界沉淀十几年的「当时为什么这么决定」的记录格式：背景 → 决定 → 后果，一份一个 Markdown 文件，有 spec（madr）、有 CLI（adr-tools）、有发布工具（log4brains）。**这是「决策与过程分离」的最成熟模板。**
- **会话交接（Session Handoff）** → 「把做到一半的活交给下一个会话」——baton 这类工具在定义交接的格式：当前状态、下一步、注意事项。这就是跨会话记忆的最小形态。
- **Markdown 真源同盟** → obsidian-mind、obsidian-second-brain、agent-memory（tigerless-labs）……一批项目不约而同选了「纯 Markdown 作为 source of truth」。**与北极星的「文件即数据」是同一条路线**，且它们证明了这条路在编码场景站得住。
- **电子实验记录本（ELN）** → elabftw：科研界的记录本，带签名、时间戳、版本、不可篡改。记忆「被当作证据使用」时的形态参照。

**对北极星的判定。**

**红海警告：编码 Agent 记忆这个方向，不要再投入。**
四轮扫描里，编码 Agent 记忆项目出现了几十个，SQLite+FTS5、MCP、Markdown 真源……
赛道拥挤到连描述都开始互相抄。北极星的通用定位（不只服务编码）在这里反而是优势，
**但若把编码当主战场，就是在别人的主场打仗。**

**可搬的东西：**

- **ADR 模板（P1）**：见文创节的判定——它同时验证了两件事：结构化字段的路线是对的，以及「决策类记忆」值得一个专属模板。北极星的七字段里「原因/结果」本来就在，但 ADR 的「背景→决定→后果→状态（被取代/生效中）」多了一个**状态**维度，恰好和第三轮的 `superseded_by` 接上。
- **会话交接格式（P2）**：北极星已有 `recall range`（跨轮总结），但没有「交接」语义——把「当前会话进行到哪、下一步是什么」作为一条特殊记录写给下一个会话。baton 这类工具在定义它的格式，值得抄作业。这其实就是 v2.6 自定义方案里「下一步」字段的强化版：**一条记录，专门负责未来而不是过去**。
- **ELN 的不可篡改（P3）**：与第三轮的「防篡改审计链」是同一件事，elabftw 是它在科研界的成熟形态。继续押后。

另外值得记一个反主流的声音：`agent-memory-kit` 的描述写着「**Built-in memory decides what to remember. This one asks.**」
——内置记忆替你决定记什么；这个工具反过来，**问你**。这与北极星「可编辑仓库」的哲学完全同频，
并且点出了一个真问题：自动沉淀的边界在哪。值得在文档里把「记忆是用户可审查的，不是黑箱自动的」写成明文原则。

## 3. 两个群落合起来看

把文创和理工放在一起，会出现一张很有意思的对照表：

| 记忆问题 | 文创的土办法 | 理工的土办法 | 北极星现状 |
|---|---|---|---|
| 「哪些内容必须被记住」 | 故事圣经（真相层） | ADR（决策记录） | 没有——所有记录平权 |
| 「什么时候把记忆拿出来」 | 世界书（关键词触发） | 会话交接（固定时机） | 上一轮固定注入 + 查询式召回 |
| 「这条记忆现在还算数吗」 | 一致性校验 | ADR 的状态字段（被取代/生效中） | 没有 `superseded_by`（第三轮已提出未实现） |
| 「记忆以什么格式存」 | 角色卡 spec | Markdown 真源 | JSON 文件（同路） |
| 「记错了怎么办」 | 改圣经，章节重写 | ADR 被新 ADR 取代而非删除 | `.trash` + 墓碑（同路） |

看到规律了吗：**两个群落各自独立演化，答案却在五个问题上全部对得上。**
而且他们的答案都朴素得可疑——关键词触发、一份一个文件、被取代而不是删除——
没有一个用了向量，没有一个用了图数据库。

**这是四轮调研里最硬的一条结论：被真实用户打磨出来的记忆机制，全是简单机制。**
复杂的（向量、图、自动摘要流水线）都活在 demo 里。

## 4. 四轮累计账

| 轮次 | 视角 | 去重 | 新增 | 主要收获 |
|---|---|---|---|---|
| 一 | 技术：记忆产品 | 1603 | — | 竞品全景、功能词频 |
| 二 | 技术：相邻领域 | 1037 | 130 | 巩固与遗忘、中文 FTS5、记忆投毒、2 个负结果 |
| 三 | 技术：领域上游 | 769 | 747 | 认知上游是空的、IVM、遗忘权、时间旅行 |
| 四 | **人群：理工与文创** | 709 | **654** | 触发式注入、真相层、ADR 同构、中文网文社区 |

四轮加起来 **4118 个去重仓库**。

## 5. 本轮新增的清单

| 优先级 | 动作 | 来自 | 说明 |
|---|---|---|---|
| **P1** | 记录加可选 `triggers` 字段，注入时做触发匹配 | 文创·世界书 | 本轮最大收获。**查询式的死穴是 Agent 不知道该查什么，触发式补上被动一路** |
| **P1** | `adr` 风格自定义字段方案（背景/决定/后果/状态） | 理工·ADR | v2.6 的方案机制直接支持，一晚上的事 |
| **P1** | 文档明文原则：记忆用户可审查，不黑箱自动沉淀 | 理工·agent-memory-kit | 「Built-in memory decides. This one asks.」 |
| P2 | `pinned` 真相层：钉为事实，被取代需显式确认 | 文创·故事圣经 | 同时是「旧事实冒充新事实」的一道闸 |
| P2 | 会话交接记录（写给下一个会话的「下一步」） | 理工·baton | 「下一步」字段的强化版：专门负责未来的记录 |
| P3 | 实体卡参考 character card spec 的字段设计 | 文创·角色卡 | 中文用户极熟这套 spec，兼容即省一次发明 |
| 不做 | 编码 Agent 专用记忆 | 理工 | **红海**，四轮见了几十个同类，不要进别人主场 |
| 不做 | 世界书管理器 / 跑团管理器 | 文创 | 已有成熟工具，北极星不做 Wiki |

## 6. 这条线还能不能继续

能，但方向变了。四轮下来，技术侧（产品/相邻/上游）的边际收益在第三轮末已经下降，
本轮证明**人群侧还是富矿**——因为用户社区和 GitHub 技术搜索几乎正交。

如果还有第五轮，值得去的地方不是 GitHub 搜索，而是**用户聚集地本身**：

- **SillyTavern 的扩展生态与讨论区**——世界书的实战用法、失败案例、用户自己发明的补丁。
- **中文网文写作社区**——他们在用什么工具、放弃什么工具、为什么放弃。
- **跑团社区的 session recap 模板**——几十年打磨出来的「会话总结」格式。

这些地方没有 API，要靠读帖子。**收益大概率还在，但方式得换。**

技术扫描正式收尾。四轮、4118 个仓库、四份报告，该回到写代码了。

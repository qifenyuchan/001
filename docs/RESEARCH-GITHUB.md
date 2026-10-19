# GitHub AI 记忆生态扫描（2026-10）

> 由 `research/github_scan.py` + `research/render_github_report.py` 自动生成。
> 通过 GitHub 搜索 API 扫 22 组关键词（每组最多 100 条，按 star 排序），去重后 1603 个仓库，收紧相关性后 **693 个**。

## 口径与局限

- 相关性：名称/描述/topics 命中“记忆/上下文”强信号，且排除 GPU memory / in-memory / KV cache 等误命中
- 分类：一个仓库可属于多类；分类基于文字，不保证实现质量
- **README 未抓**：GitHub 核心 API 配额耗尽（60/h），本轮是描述级判断；词频会低估实现细节
- star 只代表关注度，不代表质量、维护状态或安全性；归档项目已标注
- 搜索每组最多 100 条，会漏掉低 star 新项目；这是“广度快照”，不是穷举

## 分类分布

| 类别 | 数量 |
|---|---|
| MCP 服务器 | 239 |
| 本地优先/PKM | 169 |
| 其他 | 162 |
| 编码 Agent 记忆 | 161 |
| 记忆层/API/SDK | 156 |
| 图/时序/认知架构 | 140 |
| 上下文/工具输出优化 | 73 |
| 评测/论文/清单 | 51 |
| 团队/企业记忆 | 35 |
| 记忆 OS/平台 | 28 |

## 功能词频（描述 + topics；README 未计入）

| 功能 | 命中 | 占比 |
|---|---|---|
| 语义/向量/混合检索 | 296 | 42% |
| MCP | 239 | 34% |
| 知识图谱/实体关系 | 110 | 15% |
| 记忆类型(情景/语义/程序) | 107 | 15% |
| 本地优先/离线 | 104 | 15% |
| 巩固/反思/睡眠计算 | 98 | 14% |
| 遗忘/衰减/TTL | 97 | 13% |
| 用户画像/偏好 | 68 | 9% |
| 可编辑/可读文件 | 52 | 7% |
| 评测/基准 | 50 | 7% |
| 上下文预算/压缩 | 50 | 7% |
| 安全/投毒/注入 | 35 | 5% |
| 多用户/租户/ACL | 33 | 4% |
| 结构化字段/schema | 29 | 4% |
| 时间感知/事实有效期 | 25 | 3% |
| 导入/导出/迁移 | 19 | 2% |
| 去重/冲突/矛盾 | 18 | 2% |
| 空间/记忆宫殿 | 15 | 2% |
| 重要性/评分/排序 | 14 | 2% |
| 代码库记忆 | 11 | 1% |
| 加密/E2E | 9 | 1% |

## Star Top 100

| # | 仓库 | Stars | 语言 | 更新 | 类别 | 说明 |
|---|---|---|---|---|---|---|
| 1 | [mem0ai/mem0](https://github.com/mem0ai/mem0) | 67457 | Python | 2026-10-19 | 记忆层/API/SDK | The Memory Layer for AI Agents - Drop-in memory infrastructure for AI agents and apps. Context that persists. Built for  |
| 2 | [MemPalace/mempalace](https://github.com/MemPalace/mempalace) | 59643 | Python | 2026-10-19 | 评测/论文/清单/MCP 服务器 | The best-benchmarked open-source AI memory system. And it's free. |
| 3 | [vectorize-io/hindsight](https://github.com/vectorize-io/hindsight) | 51598 | Python | 2026-10-19 | 其他 | Hindsight: Agent Memory That Learns |
| 4 | [volcengine/OpenViking](https://github.com/volcengine/OpenViking) | 40343 | Python | 2026-10-19 | 记忆 OS/平台 | Self-evolving Context Database for AI Agents. Unify Agent Memory, Knowledge RAG and Skills. |
| 5 | [topoteretes/cognee](https://github.com/topoteretes/cognee) | 32546 | Python | 2026-10-19 | 图/时序/认知架构/记忆 OS/平台 | Cognee is the open-source AI memory platform for agents. Give your AI agents persistent long-term memory with small mode |
| 6 | [supermemoryai/supermemory](https://github.com/supermemoryai/supermemory) | 31314 | TypeScript | 2026-10-19 | 记忆层/API/SDK | Memory and context engine + app that is extremely fast, scalable, and can be run fully locally. The Memory API for the A |
| 7 | [mksglu/context-mode](https://github.com/mksglu/context-mode) | 31014 | TypeScript | 2026-10-19 | MCP 服务器/编码 Agent 记忆/上下文/工具输出优化 | Context window optimization for AI coding agents. Sandboxes tool output (98% reduction), persists session memory, and    |
| 8 | [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) | 29684 | TypeScript | 2026-10-19 | 评测/论文/清单/编码 Agent 记忆 | #1 Persistent memory for AI coding agents based on real-world benchmarks |
| 9 | [TencentCloud/TencentDB-Agent-Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory) | 29631 | TypeScript | 2026-10-19 | 本地优先/PKM/团队/企业记忆/记忆 OS/平台/记忆层/API/SDK | TencentDB Agent Memory is a team-level memory hub for AI Agents — turning conversations, docs, and code into four reusab |
| 10 | [memvid/memvid](https://github.com/memvid/memvid) | 16604 | Rust | 2026-10-19 | 本地优先/PKM/记忆层/API/SDK | Memory layer for AI Agents. Replace complex RAG pipelines with a serverless, single-file memory layer. Give your agents  |
| 11 | [EverMind-AI/EverOS](https://github.com/EverMind-AI/EverOS) | 13503 | Python | 2026-10-19 | MCP 服务器/本地优先/PKM/记忆 OS/平台/记忆层/API/SDK | One portable memory layer for every AI agent: local-first, Markdown-native, user-owned, and self-evolving across apps, t |
| 12 | [MemTensor/MemOS](https://github.com/MemTensor/MemOS) | 11939 | TypeScript | 2026-10-19 | MCP 服务器/记忆 OS/平台 | Self-evolving memory OS for LLM & AI Agents: ultra-persistent memory, hybrid-retrieval, and cross-task skill reuse, with |
| 13 | [akitaonrails/ai-memory](https://github.com/akitaonrails/ai-memory) | 11124 | Rust | 2026-10-19 | 其他 | Solution for long term memory for agent coding CLIs and to facilitate handoff between different agent vendors |
| 14 | [StarTrail-org/PixelRAG](https://github.com/StarTrail-org/PixelRAG) | 10312 | Python | 2026-10-19 | 其他 | https://arxiv.org/abs/2606.28344. The end of web parsing. The beginning of scalable pixel-native search. link: https://p |
| 15 | [xerj-org/xerj](https://github.com/xerj-org/xerj) | 9487 | Rust | 2026-10-19 | 其他 | XERJ is the new way for AI to search data. Its autoindex capability activates agents to know your data without the token |
| 16 | [activeloopai/deeplake](https://github.com/activeloopai/deeplake) | 9253 | C++ | 2026-10-17 | 其他 | Deeplake is AI Data Runtime for Agents. It provides serverless postgres with a multimodal datalake, enabling scalable re |
| 17 | [osaurus-ai/osaurus](https://github.com/osaurus-ai/osaurus) | 8056 | Swift | 2026-10-19 | MCP 服务器/本地优先/PKM | Own your AI. The native macOS harness for AI agents -- any model, persistent memory, autonomous execution, cryptographic |
| 18 | [Gentleman-Programming/gentle-ai](https://github.com/Gentleman-Programming/gentle-ai) | 7861 | Go | 2026-10-19 | MCP 服务器/编码 Agent 记忆 | Gentle-AI configures the AI coding agents you already use: Claude Code, Cursor, OpenCode, Codex, Pi, and more. Choose pe |
| 19 | [plastic-labs/honcho](https://github.com/plastic-labs/honcho) | 7688 | Python | 2026-10-19 | 记忆层/API/SDK |  Memory library for building stateful agents |
| 20 | [Gentleman-Programming/engram](https://github.com/Gentleman-Programming/engram) | 7458 | Go | 2026-10-19 | MCP 服务器/编码 Agent 记忆/本地优先/PKM | Persistent memory system for AI coding agents. Agent-agnostic Go binary with SQLite + FTS5, MCP server, HTTP API, CLI, a |
| 21 | [breferrari/obsidian-mind](https://github.com/breferrari/obsidian-mind) | 5387 | TypeScript | 2026-10-19 | 编码 Agent 记忆/本地优先/PKM | A self-organizing Obsidian vault that gives AI coding agents persistent memory. |
| 22 | [campfirein/byterover-cli](https://github.com/campfirein/byterover-cli)（归档） | 4948 | TypeScript | 2026-10-19 | MCP 服务器/编码 Agent 记忆/记忆层/API/SDK | ByteRover CLI (brv) - The portable memory layer for  autonomous coding agents (formerly Cipher) |
| 23 | [eugeniughelbur/obsidian-second-brain](https://github.com/eugeniughelbur/obsidian-second-brain) | 4821 | Python | 2026-10-19 | 编码 Agent 记忆/本地优先/PKM | Persistent memory for Claude Code, Codex and 6 other AI agents, stored as plain markdown in your Obsidian vault. New: Cr |
| 24 | [macro-inc/macro](https://github.com/macro-inc/macro) | 4751 | Rust | 2026-10-19 | MCP 服务器/团队/企业记忆 | Macro is a unified workspace for teams: email, chat, docs, tasks, agents, calls, and CRM — @-linked together with shared |
| 25 | [ruvnet/RuVector](https://github.com/ruvnet/RuVector) | 4595 | Rust | 2026-10-19 | 图/时序/认知架构 | RuVector provides High Performance, Real-Time decisions and agent memory , Self-Learning Ai, Vector GNN DB built in Rust |
| 26 | [CaviraOSS/LongMemory](https://github.com/CaviraOSS/LongMemory) | 4541 | TypeScript | 2026-10-19 | 编码 Agent 记忆/图/时序/认知架构/记忆层/API/SDK | Local persistent memory store for LLM applications including claude desktop, github copilot, codex, antigravity, etc. |
| 27 | [FlowElement-xinliuyuansu/m_flow](https://github.com/FlowElement-xinliuyuansu/m_flow) | 4512 | Python | 2026-10-19 | MCP 服务器/图/时序/认知架构 | A bio-inspired cognitive memory engine — a new paradigm for Graph RAG. |
| 28 | [tigerless-labs/agent-memory](https://github.com/tigerless-labs/agent-memory) | 4385 | Python | 2026-10-19 | MCP 服务器/编码 Agent 记忆/本地优先/PKM | Long-term memory runtime for AI agents — plain Markdown as the source of truth, local ranked retrieval, and an independe |
| 29 | [basicmachines-co/basic-memory](https://github.com/basicmachines-co/basic-memory) | 4279 | Python | 2026-10-19 | MCP 服务器/本地优先/PKM | AI conversations that actually remember. Never re-explain your project to your AI again. Join our Discord: https://disco |
| 30 | [OSU-NLP-Group/HippoRAG](https://github.com/OSU-NLP-Group/HippoRAG) | 4072 | Python | 2026-10-19 | 图/时序/认知架构/记忆层/API/SDK | [NeurIPS'24] HippoRAG is a novel RAG framework inspired by human long-term memory that enables LLMs to continuously inte |
| 31 | [memodb-io/Acontext](https://github.com/memodb-io/Acontext) | 3695 | JavaScript | 2026-10-19 | 记忆 OS/平台/记忆层/API/SDK | Agent Skills as a Memory Layer |
| 32 | [agentscope-ai/ReMe](https://github.com/agentscope-ai/ReMe) | 3654 | Python | 2026-10-19 | 其他 | ReMe: Memory Management Kit for Agents - Remember Me, Refine Me. |
| 33 | [Ar9av/obsidian-wiki](https://github.com/Ar9av/obsidian-wiki) | 3594 | Python | 2026-10-19 | MCP 服务器/编码 Agent 记忆/本地优先/PKM/记忆层/API/SDK | Framework for AI agents to build and maintain a digital brain through Obsidian wiki / Memory System for Agents |
| 34 | [mnemosyne-oss/mnemosyne](https://github.com/mnemosyne-oss/mnemosyne) | 3456 | Python | 2026-10-19 | 本地优先/PKM | Zero-cloud AI memory that works everywhere. SQLite-backed. One pure-Python dependency. |
| 35 | [rlaope/oh-my-hermes](https://github.com/rlaope/oh-my-hermes) | 3433 | Python | 2026-10-19 | 编码 Agent 记忆 | All in one plugin for Hermes Agent ⚚ the coding intelligence, a long-term memory system and model optimized workflow pac |
| 36 | [pashpashpash/vault-ai](https://github.com/pashpashpash/vault-ai) | 3388 | JavaScript | 2026-10-16 | 其他 | OP Vault ChatGPT: Give ChatGPT long-term memory using the OP Stack (OpenAI + Pinecone Vector Database). Upload your own  |
| 37 | [MemMachine/MemMachine](https://github.com/MemMachine/MemMachine) | 3074 | Python | 2026-10-19 | 记忆层/API/SDK | Universal memory layer for AI Agents. It provides scalable, extensible, and interoperable memory storage and retrieval t |
| 38 | [vanzan01/cursor-memory-bank](https://github.com/vanzan01/cursor-memory-bank) | 3060 | - | 2026-10-18 | 编码 Agent 记忆/记忆层/API/SDK | A modular, documentation-driven framework using Cursor custom modes (VAN, PLAN, CREATIVE, IMPLEMENT) to provide persiste |
| 39 | [NxcoreAI/EverRoom](https://github.com/NxcoreAI/EverRoom) | 2992 | TypeScript | 2026-10-19 | 团队/企业记忆 | EverRoom - A workspace that remembers your projects, decisions, and sources. |
| 40 | [openrecall/openrecall](https://github.com/openrecall/openrecall) | 2960 | Python | 2026-10-18 | 其他 | OpenRecall is a fully open-source, privacy-first alternative to proprietary solutions like Microsoft's Windows Recall. W |
| 41 | [memodb-io/memobase](https://github.com/memodb-io/memobase) | 2936 | Python | 2026-10-19 | 其他 | User Profile-Based Long-Term Memory for AI Chatbot Applications.  |
| 42 | [rohitg00/pro-workflow](https://github.com/rohitg00/pro-workflow) | 2921 | JavaScript | 2026-10-19 | 编码 Agent 记忆/上下文/工具输出优化/团队/企业记忆 | Claude Code learns from your corrections: self-correcting memory that compounds over 50+ sessions. Context engineering,  |
| 43 | [zilliztech/memsearch](https://github.com/zilliztech/memsearch) | 2762 | Python | 2026-10-19 | 编码 Agent 记忆/本地优先/PKM/记忆层/API/SDK | A persistent, unified memory layer for all your AI agents (e.g. Claude Code, Codex, DSH), backed by Markdown and Milvus. |
| 44 | [wassim249/fastapi-langgraph-agent-production-ready-template](https://github.com/wassim249/fastapi-langgraph-agent-production-ready-template) | 2711 | Python | 2026-10-19 | 其他 | A production-ready FastAPI template for building AI agent applications with LangGraph integration. This template provide |
| 45 | [felinics/Memoh](https://github.com/felinics/Memoh) | 2709 | Go | 2026-10-19 | 编码 Agent 记忆 | ✨ The open-source multi-agent platform. Every agent gets its own computer, desktop, network, and long-term memory.  You  |
| 46 | [kingjulio8238/Memary](https://github.com/kingjulio8238/Memary) | 2661 | Jupyter Notebook | 2026-10-16 | 记忆层/API/SDK | The Open Source Memory Layer For Autonomous Agents |
| 47 | [Shichun-Liu/Agent-Memory-Paper-List](https://github.com/Shichun-Liu/Agent-Memory-Paper-List) | 2433 | - | 2026-10-19 | 评测/论文/清单 | The paper list of "Memory in the Age of AI Agents: A Survey" |
| 48 | [microsoft/kernel-memory](https://github.com/microsoft/kernel-memory) | 2233 | C# | 2026-10-19 | 团队/企业记忆 | Research project. A Memory solution for users, teams, and applications. |
| 49 | [MemTensor/memmy-agent](https://github.com/MemTensor/memmy-agent) | 2117 | TypeScript | 2026-10-19 | MCP 服务器/编码 Agent 记忆/记忆 OS/平台 | 🍙  A personal AI agent & local memory hub for all AI agents, gives every AI one shared, fully controlled memory and pers |
| 50 | [maxritter/pilot-shell](https://github.com/maxritter/pilot-shell) | 2095 | JavaScript | 2026-10-19 | MCP 服务器/编码 Agent 记忆 | Professional context and harness engineering for Claude Code and OpenAI Codex. Build production-grade software with spec |
| 51 | [doobidoo/mcp-memory-service](https://github.com/doobidoo/mcp-memory-service) | 2023 | Python | 2026-10-19 | MCP 服务器/图/时序/认知架构/本地优先/PKM | Open-source persistent memory for AI agent pipelines (LangGraph, CrewAI, AutoGen) and Claude. REST API + knowledge graph |
| 52 | [joeynyc/hermes-hudui](https://github.com/joeynyc/hermes-hudui) | 1849 | Python | 2026-10-18 | 其他 | Web UI consciousness monitor for Hermes — the AI agent with persistent memory |
| 53 | [Asymptote-Labs/agent-beacon](https://github.com/Asymptote-Labs/agent-beacon) | 1844 | Go | 2026-10-19 | 编码 Agent 记忆/记忆层/API/SDK | The cross-harness, self-improving memory layer for AI agents. Join our community: https://discord.com/invite/zdNChS2fBu |
| 54 | [supermemoryai/supermemory-mcp](https://github.com/supermemoryai/supermemory-mcp) | 1723 | TypeScript | 2026-10-19 | MCP 服务器 | Your memories are in ChatGPT... But nowhere else. Universal Memory MCP makes your memories available to every single LLM |
| 55 | [ghostwright/phantom](https://github.com/ghostwright/phantom) | 1485 | TypeScript | 2026-10-18 | MCP 服务器/记忆 OS/平台/记忆层/API/SDK | An AI co-worker with its own computer. Self-evolving, persistent memory, MCP server, secure credential collection, email |
| 56 | [superloglabs/superlog](https://github.com/superloglabs/superlog) | 1467 | TypeScript | 2026-10-19 | 其他 | Open-source observability tool that uses AI agents to self-heal your software |
| 57 | [mnemox-ai/tradememory-protocol](https://github.com/mnemox-ai/tradememory-protocol) | 1430 | Python | 2026-10-19 | MCP 服务器 | Decision audit trail + persistent memory for AI trading agents. Outcome-weighted recall, tamper-evident SHA-256 chain wi |
| 58 | [Dataojitori/nocturne_memory](https://github.com/Dataojitori/nocturne_memory) | 1395 | Python | 2026-10-19 | MCP 服务器/本地优先/PKM | A lightweight, rollbackable, and visual Long-Term Memory Server for MCP Agents. Say goodbye to Vector RAG and amnesia. E |
| 59 | [morettt/my-neuro](https://github.com/morettt/my-neuro) | 1395 | JavaScript | 2026-10-19 | 其他 | This project lets you create your own AI desktop companion with customizable characters and voice conversations that res |
| 60 | [DrJonaC/Pensieve](https://github.com/DrJonaC/Pensieve) | 1383 | TypeScript | 2026-10-13 | 其他 | Observe how memory shapes an answer.  Pensieve is an interactive system for visualizing, interpreting, and managing how  |
| 61 | [moyangzhan/langchain4j-aideepin](https://github.com/moyangzhan/langchain4j-aideepin) | 1383 | Java | 2026-10-17 | MCP 服务器 | AI 应用平台（聊天、绘画、知识库、工作流、 MCP服务市场、语音输入输出、长期记忆） / AI application platform (Chat,Draw,RAG,Workflow,MCP marketplace, ASR,TTS,  |
| 62 | [ClaudioDrews/memory-os](https://github.com/ClaudioDrews/memory-os) | 1380 | Python | 2026-10-17 | 本地优先/PKM/记忆 OS/平台 | A 7-layer memory operating system for Hermes Agent — persistent memory with Qdrant, structured facts, fabric recall, aut |
| 63 | [IAAR-Shanghai/Awesome-AI-Memory](https://github.com/IAAR-Shanghai/Awesome-AI-Memory) | 1281 | Python | 2026-10-19 | 其他 | Awesome AI Memory / LLM Memory / A curated knowledge base on AI memory for LLMs and agents, covering long-term memory, r |
| 64 | [chunxiaoxx/nautilus-compass](https://github.com/chunxiaoxx/nautilus-compass) | 1256 | Python | 2026-10-18 | 评测/论文/清单/MCP 服务器/本地优先/PKM | Open memory & reliability layer for AI agents + independent judging/verification (NACRE judge, caliber-bench meta-benchm |
| 65 | [vshulcz/deja-vu](https://github.com/vshulcz/deja-vu) | 1252 | Go | 2026-10-19 | MCP 服务器/编码 Agent 记忆 | Coding agent memory for Claude Code, Codex, Cursor and 39 more, built from the session history already on your disk. Loc |
| 66 | [agiresearch/A-mem](https://github.com/agiresearch/A-mem) | 1204 | Python | 2026-10-18 | 其他 | A-MEM: Agentic Memory for LLM Agents |
| 67 | [Mibayy/token-savior](https://github.com/Mibayy/token-savior) | 1182 | Python | 2026-10-17 | 评测/论文/清单/MCP 服务器 | MCP server that gets Claude to 97.9% (188/192) on a real coding benchmark at -80% active tokens and -83% wall time, vs 7 |
| 68 | [agentrq/agentrq](https://github.com/agentrq/agentrq) | 1162 | Go | 2026-10-19 | MCP 服务器 | AgentRQ: Human-in-loop realtime conversational task manager for AI Agents. Self-hosted! Control your own agents from whe |
| 69 | [withkynam/vibecode-pro-max-kit](https://github.com/withkynam/vibecode-pro-max-kit) | 1154 | JavaScript | 2026-10-19 | 编码 Agent 记忆/团队/企业记忆 | Your AI forgets. This remembers. Spec-driven coding harness for vibecoders, product owners, CEOs and real builders — sel |
| 70 | [NirDiamant/Agent_Memory_Techniques](https://github.com/NirDiamant/Agent_Memory_Techniques) | 1111 | Jupyter Notebook | 2026-10-19 | 评测/论文/清单/图/时序/认知架构 | Agent memory for LLMs: 30 runnable Jupyter notebooks covering conversation buffers, vector stores, knowledge graphs, epi |
| 71 | [lucasrosati/claude-code-memory-setup](https://github.com/lucasrosati/claude-code-memory-setup) | 1034 | Python | 2026-10-19 | 编码 Agent 记忆/图/时序/认知架构/本地优先/PKM | Up to 71.5x fewer tokens per session on Claude Code with Obsidian + Graphify. Persistent memory, codebase knowledge grap |
| 72 | [DasterProkio/awesome-ai-companion](https://github.com/DasterProkio/awesome-ai-companion) | 1021 | HTML | 2026-10-19 | 其他 | Open-source AI companions, desktop pets, long-term memory & proactive chat. 人机恋开源项目大全。让你的家机能够脱离官端自主存在，拥有记忆和主动性。 |
| 73 | [Rath-Team/OpenRath](https://github.com/Rath-Team/OpenRath) | 963 | Python | 2026-10-14 | 上下文/工具输出优化/记忆层/API/SDK | An open-source, PyTorch-like runtime for dynamic multi-agent and multi-session workflows. |
| 74 | [CodeAbra/iai-personal-memory-engine](https://github.com/CodeAbra/iai-personal-memory-engine) | 912 | Python | 2026-10-18 | MCP 服务器/编码 Agent 记忆/本地优先/PKM | A cyber brain for your AI. It never forgets a detail, remembers exactly what you said, and learns how you work over time |
| 75 | [openmemind/memind](https://github.com/openmemind/memind) | 899 | Java | 2026-10-13 | 图/时序/认知架构/记忆 OS/平台 | Self-evolving cognitive memory and context engine for AI agents in Java. Empowering 24/7 proactive agents like OpenClaw  |
| 76 | [nuwax-ai/nuwax](https://github.com/nuwax-ai/nuwax) | 894 | TypeScript | 2026-10-19 | MCP 服务器/上下文/工具输出优化/团队/企业记忆 | Nuwax Agent OS - An enterprise-grade AI Agent Development and Operation Platform - Providing a complete solution for age |
| 77 | [topoteretes/awesome-ai-memory](https://github.com/topoteretes/awesome-ai-memory) | 891 | Python | 2026-10-19 | 其他 | A list of AI memory projects |
| 78 | [shaneholloman/mcp-knowledge-graph](https://github.com/shaneholloman/mcp-knowledge-graph) | 885 | JavaScript | 2026-10-18 | MCP 服务器/图/时序/认知架构 | MCP server enabling persistent memory for Claude through a local knowledge graph - fork focused on local development |
| 79 | [thedivergentai/Game-Dev-Agentic-Skills](https://github.com/thedivergentai/Game-Dev-Agentic-Skills) | 869 | GDScript | 2026-10-19 | 其他 | Multi-engine long-term memory for game AI agents. Deep Godot 4.7+ (99 skills, 27 genre blueprints) + Bevy docs-first par |
| 80 | [AVIDS2/memorix](https://github.com/AVIDS2/memorix) | 848 | TypeScript | 2026-10-19 | MCP 服务器/编码 Agent 记忆/本地优先/PKM/记忆层/API/SDK | Open-source cross-agent memory layer for coding agents via MCP. Compatible with Claude Code, Codex, Cursor, Windsurf, Ge |
| 81 | [SakanaAI/doc-to-lora](https://github.com/SakanaAI/doc-to-lora) | 836 | Python | 2026-10-18 | 其他 | Hypernetworks that update LLMs to remember factual information |
| 82 | [verygoodplugins/automem](https://github.com/verygoodplugins/automem) | 822 | Python | 2026-10-12 | 其他 | Long-term memory for AI assistants. Graph + vector store that recalls decisions, relationships, and context across sessi |
| 83 | [AlphaAvatar/AlphaAvatar](https://github.com/AlphaAvatar/AlphaAvatar) | 818 | Python | 2026-10-15 | 其他 | An Omni Real-Time Assistant for Everyone |
| 84 | [rahilp/second-brain-cloudflare](https://github.com/rahilp/second-brain-cloudflare) | 813 | TypeScript | 2026-10-19 | MCP 服务器/编码 Agent 记忆/本地优先/PKM/记忆层/API/SDK | One memory layer, every AI tool. Store anything once — recall it in Claude, ChatGPT, Cursor, or any MCP client. Self-hos |
| 85 | [christopherkarani/Wax](https://github.com/christopherkarani/Wax) | 804 | Swift | 2026-10-07 | MCP 服务器/记忆层/API/SDK | Shared Single-file memory layer for all your agents, sub mili-second RAG over text, photo and video on Apple Silicon.. N |
| 86 | [supermemoryai/openclaw-supermemory](https://github.com/supermemoryai/openclaw-supermemory) | 797 | TypeScript | 2026-10-13 | 其他 | OpenClaw Supermemory lets to have long-term memory and recall for your openclaw agent. |
| 87 | [kitfunso/hippo-memory](https://github.com/kitfunso/hippo-memory) | 782 | TypeScript | 2026-10-18 | MCP 服务器/编码 Agent 记忆/本地优先/PKM | Stop re-teaching your agent. Make your agent's memory work like a brain. Hippo is long-term memory for coding agents. It |
| 88 | [alash3al/stash](https://github.com/alash3al/stash) | 769 | Go | 2026-10-13 | MCP 服务器/记忆层/API/SDK | Stash — persistent memory layer for AI agents. Episodes, facts, and working context stored in Postgres. MCP server inclu |
| 89 | [raiyanyahya/recall](https://github.com/raiyanyahya/recall) | 761 | Python | 2026-10-19 | 编码 Agent 记忆/本地优先/PKM | Stop wasting tokens and re-explaining your project every session. Recall gives Claude Code , Opencode durable memory — e |
| 90 | [alvinreal/awesome-openclaw](https://github.com/alvinreal/awesome-openclaw) | 742 | - | 2026-10-15 | 其他 | A curated list of the best OpenClaw resources: official projects, skills, plugins, dashboards, deployment tooling, memor |
| 91 | [swarmclawai/swarmvault](https://github.com/swarmclawai/swarmvault) | 723 | TypeScript | 2026-10-18 | MCP 服务器/编码 Agent 记忆/图/时序/认知架构/本地优先/PKM | The local-first LLM Wiki: open-source knowledge graph builder, RAG knowledge base, and agent memory store. Built on Andr |
| 92 | [jaredrhod/ai-memory-vault](https://github.com/jaredrhod/ai-memory-vault) | 713 | - | 2026-10-19 | MCP 服务器/本地优先/PKM | Give your AI a real, persistent memory. The open-source system plus templates that turn an Obsidian vault into your AI's |
| 93 | [caspianmoon/memoripy](https://github.com/caspianmoon/memoripy) | 694 | Python | 2026-10-06 | MCP 服务器/图/时序/认知架构 | Evidence-first local memory for AI agents with temporal versions, admission policies, citations, explainable recall, MCP |
| 94 | [swarmclawai/swarmclaw](https://github.com/swarmclawai/swarmclaw) | 693 | TypeScript | 2026-10-19 | MCP 服务器/编码 Agent 记忆/记忆层/API/SDK | Open-source self-hosted AI agent runtime and multi-agent framework for autonomous agent swarms. Agent memory, MCP tools, |
| 95 | [coleam00/mcp-mem0](https://github.com/coleam00/mcp-mem0) | 685 | Python | 2026-10-19 | MCP 服务器 | MCP server for long term agent memory with Mem0. Also useful as a template to get you started building your own MCP serv |
| 96 | [adoresever/graph-memory](https://github.com/adoresever/graph-memory) | 655 | TypeScript | 2026-10-18 | 编码 Agent 记忆/图/时序/认知架构 | Deepseek Harness、Openclaw知识图谱记忆插件。2026年4月受邀发布在清华大学讨论会。Knowledge Graph + Memory；Knowledge Graph Context Engine for OpenCl |
| 97 | [Arvincreator/project-golem](https://github.com/Arvincreator/project-golem) | 642 | JavaScript | 2026-10-18 | 其他 | OS-level autonomous AI agent with long-term memory, multi-agent coordination, Titan Chronos scheduler & Moltbot Social C |
| 98 | [BruceLanLan/augur](https://github.com/BruceLanLan/augur) | 642 | Python | 2026-10-19 | MCP 服务器/本地优先/PKM | 🦉 Augur — 本地优先的投资研究记忆系统：18 位投资大师独立分析 + 加权共识，证据带时间语义、每次运行可复查，CLI / Dashboard / MCP。A local-first research memory system w |
| 99 | [mnemon-dev/mnemon](https://github.com/mnemon-dev/mnemon) | 640 | Go | 2026-10-19 | 编码 Agent 记忆/记忆层/API/SDK | LLM-supervised persistent memory for AI agents — graph-based recall, cross-session knowledge, single binary. Works with  |
| 100 | [matrixorigin/memoria](https://github.com/matrixorigin/memoria) | 614 | Rust | 2026-10-19 | 其他 | Secure memory management for AI Agents • Ensures data integrity • Reduces hallucinations • Maintains consistent long-ter |

## 上一份调研没覆盖、但值得看的项目

筛选 star ≥ 1000、不在首份报告清单里的仓库。

| 仓库 | Stars | 类别 | 说明 |
|---|---|---|---|
| [MemPalace/mempalace](https://github.com/MemPalace/mempalace) | 59643 | 评测/论文/清单/MCP 服务器 | The best-benchmarked open-source AI memory system. And it's free. |
| [volcengine/OpenViking](https://github.com/volcengine/OpenViking) | 40343 | 记忆 OS/平台 | Self-evolving Context Database for AI Agents. Unify Agent Memory, Knowledge RAG and Skills. |
| [mksglu/context-mode](https://github.com/mksglu/context-mode) | 31014 | MCP 服务器/编码 Agent 记忆/上下文/工具输出优化 | Context window optimization for AI coding agents. Sandboxes tool output (98% reduction), persists session memo |
| [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) | 29684 | 评测/论文/清单/编码 Agent 记忆 | #1 Persistent memory for AI coding agents based on real-world benchmarks |
| [TencentCloud/TencentDB-Agent-Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory) | 29631 | 本地优先/PKM/团队/企业记忆/记忆 OS/平台/记忆层/API/SDK | TencentDB Agent Memory is a team-level memory hub for AI Agents — turning conversations, docs, and code into f |
| [memvid/memvid](https://github.com/memvid/memvid) | 16604 | 本地优先/PKM/记忆层/API/SDK | Memory layer for AI Agents. Replace complex RAG pipelines with a serverless, single-file memory layer. Give yo |
| [EverMind-AI/EverOS](https://github.com/EverMind-AI/EverOS) | 13503 | MCP 服务器/本地优先/PKM/记忆 OS/平台/记忆层/API/SDK | One portable memory layer for every AI agent: local-first, Markdown-native, user-owned, and self-evolving acro |
| [MemTensor/MemOS](https://github.com/MemTensor/MemOS) | 11939 | MCP 服务器/记忆 OS/平台 | Self-evolving memory OS for LLM & AI Agents: ultra-persistent memory, hybrid-retrieval, and cross-task skill r |
| [akitaonrails/ai-memory](https://github.com/akitaonrails/ai-memory) | 11124 | 其他 | Solution for long term memory for agent coding CLIs and to facilitate handoff between different agent vendors |
| [StarTrail-org/PixelRAG](https://github.com/StarTrail-org/PixelRAG) | 10312 | 其他 | https://arxiv.org/abs/2606.28344. The end of web parsing. The beginning of scalable pixel-native search. link: |
| [xerj-org/xerj](https://github.com/xerj-org/xerj) | 9487 | 其他 | XERJ is the new way for AI to search data. Its autoindex capability activates agents to know your data without |
| [activeloopai/deeplake](https://github.com/activeloopai/deeplake) | 9253 | 其他 | Deeplake is AI Data Runtime for Agents. It provides serverless postgres with a multimodal datalake, enabling s |
| [osaurus-ai/osaurus](https://github.com/osaurus-ai/osaurus) | 8056 | MCP 服务器/本地优先/PKM | Own your AI. The native macOS harness for AI agents -- any model, persistent memory, autonomous execution, cry |
| [Gentleman-Programming/gentle-ai](https://github.com/Gentleman-Programming/gentle-ai) | 7861 | MCP 服务器/编码 Agent 记忆 | Gentle-AI configures the AI coding agents you already use: Claude Code, Cursor, OpenCode, Codex, Pi, and more. |
| [Gentleman-Programming/engram](https://github.com/Gentleman-Programming/engram) | 7458 | MCP 服务器/编码 Agent 记忆/本地优先/PKM | Persistent memory system for AI coding agents. Agent-agnostic Go binary with SQLite + FTS5, MCP server, HTTP A |
| [breferrari/obsidian-mind](https://github.com/breferrari/obsidian-mind) | 5387 | 编码 Agent 记忆/本地优先/PKM | A self-organizing Obsidian vault that gives AI coding agents persistent memory. |
| [campfirein/byterover-cli](https://github.com/campfirein/byterover-cli) | 4948 | MCP 服务器/编码 Agent 记忆/记忆层/API/SDK | ByteRover CLI (brv) - The portable memory layer for  autonomous coding agents (formerly Cipher) |
| [eugeniughelbur/obsidian-second-brain](https://github.com/eugeniughelbur/obsidian-second-brain) | 4821 | 编码 Agent 记忆/本地优先/PKM | Persistent memory for Claude Code, Codex and 6 other AI agents, stored as plain markdown in your Obsidian vaul |
| [macro-inc/macro](https://github.com/macro-inc/macro) | 4751 | MCP 服务器/团队/企业记忆 | Macro is a unified workspace for teams: email, chat, docs, tasks, agents, calls, and CRM — @-linked together w |
| [ruvnet/RuVector](https://github.com/ruvnet/RuVector) | 4595 | 图/时序/认知架构 | RuVector provides High Performance, Real-Time decisions and agent memory , Self-Learning Ai, Vector GNN DB bui |
| [CaviraOSS/LongMemory](https://github.com/CaviraOSS/LongMemory) | 4541 | 编码 Agent 记忆/图/时序/认知架构/记忆层/API/SDK | Local persistent memory store for LLM applications including claude desktop, github copilot, codex, antigravit |
| [FlowElement-xinliuyuansu/m_flow](https://github.com/FlowElement-xinliuyuansu/m_flow) | 4512 | MCP 服务器/图/时序/认知架构 | A bio-inspired cognitive memory engine — a new paradigm for Graph RAG. |
| [tigerless-labs/agent-memory](https://github.com/tigerless-labs/agent-memory) | 4385 | MCP 服务器/编码 Agent 记忆/本地优先/PKM | Long-term memory runtime for AI agents — plain Markdown as the source of truth, local ranked retrieval, and an |
| [OSU-NLP-Group/HippoRAG](https://github.com/OSU-NLP-Group/HippoRAG) | 4072 | 图/时序/认知架构/记忆层/API/SDK | [NeurIPS'24] HippoRAG is a novel RAG framework inspired by human long-term memory that enables LLMs to continu |
| [memodb-io/Acontext](https://github.com/memodb-io/Acontext) | 3695 | 记忆 OS/平台/记忆层/API/SDK | Agent Skills as a Memory Layer |
| [agentscope-ai/ReMe](https://github.com/agentscope-ai/ReMe) | 3654 | 其他 | ReMe: Memory Management Kit for Agents - Remember Me, Refine Me. |
| [Ar9av/obsidian-wiki](https://github.com/Ar9av/obsidian-wiki) | 3594 | MCP 服务器/编码 Agent 记忆/本地优先/PKM/记忆层/API/SDK | Framework for AI agents to build and maintain a digital brain through Obsidian wiki / Memory System for Agents |
| [mnemosyne-oss/mnemosyne](https://github.com/mnemosyne-oss/mnemosyne) | 3456 | 本地优先/PKM | Zero-cloud AI memory that works everywhere. SQLite-backed. One pure-Python dependency. |
| [rlaope/oh-my-hermes](https://github.com/rlaope/oh-my-hermes) | 3433 | 编码 Agent 记忆 | All in one plugin for Hermes Agent ⚚ the coding intelligence, a long-term memory system and model optimized wo |
| [pashpashpash/vault-ai](https://github.com/pashpashpash/vault-ai) | 3388 | 其他 | OP Vault ChatGPT: Give ChatGPT long-term memory using the OP Stack (OpenAI + Pinecone Vector Database). Upload |
| [MemMachine/MemMachine](https://github.com/MemMachine/MemMachine) | 3074 | 记忆层/API/SDK | Universal memory layer for AI Agents. It provides scalable, extensible, and interoperable memory storage and r |
| [vanzan01/cursor-memory-bank](https://github.com/vanzan01/cursor-memory-bank) | 3060 | 编码 Agent 记忆/记忆层/API/SDK | A modular, documentation-driven framework using Cursor custom modes (VAN, PLAN, CREATIVE, IMPLEMENT) to provid |
| [NxcoreAI/EverRoom](https://github.com/NxcoreAI/EverRoom) | 2992 | 团队/企业记忆 | EverRoom - A workspace that remembers your projects, decisions, and sources. |
| [openrecall/openrecall](https://github.com/openrecall/openrecall) | 2960 | 其他 | OpenRecall is a fully open-source, privacy-first alternative to proprietary solutions like Microsoft's Windows |
| [rohitg00/pro-workflow](https://github.com/rohitg00/pro-workflow) | 2921 | 编码 Agent 记忆/上下文/工具输出优化/团队/企业记忆 | Claude Code learns from your corrections: self-correcting memory that compounds over 50+ sessions. Context eng |
| [zilliztech/memsearch](https://github.com/zilliztech/memsearch) | 2762 | 编码 Agent 记忆/本地优先/PKM/记忆层/API/SDK | A persistent, unified memory layer for all your AI agents (e.g. Claude Code, Codex, DSH), backed by Markdown a |
| [wassim249/fastapi-langgraph-agent-production-ready-template](https://github.com/wassim249/fastapi-langgraph-agent-production-ready-template) | 2711 | 其他 | A production-ready FastAPI template for building AI agent applications with LangGraph integration. This templa |
| [felinics/Memoh](https://github.com/felinics/Memoh) | 2709 | 编码 Agent 记忆 | ✨ The open-source multi-agent platform. Every agent gets its own computer, desktop, network, and long-term mem |
| [kingjulio8238/Memary](https://github.com/kingjulio8238/Memary) | 2661 | 记忆层/API/SDK | The Open Source Memory Layer For Autonomous Agents |
| [Shichun-Liu/Agent-Memory-Paper-List](https://github.com/Shichun-Liu/Agent-Memory-Paper-List) | 2433 | 评测/论文/清单 | The paper list of "Memory in the Age of AI Agents: A Survey" |

## 低 star、功能更“偏门”的项目（50–1500 stars）

| 仓库 | Stars | 类别 | 说明 |
|---|---|---|---|
| [chunxiaoxx/nautilus-compass](https://github.com/chunxiaoxx/nautilus-compass) | 1256 | 评测/论文/清单/MCP 服务器/本地优先/PKM | Open memory & reliability layer for AI agents + independent judging/verification (NACRE judge, caliber-bench m |
| [Mibayy/token-savior](https://github.com/Mibayy/token-savior) | 1182 | 评测/论文/清单/MCP 服务器 | MCP server that gets Claude to 97.9% (188/192) on a real coding benchmark at -80% active tokens and -83% wall  |
| [withkynam/vibecode-pro-max-kit](https://github.com/withkynam/vibecode-pro-max-kit) | 1154 | 编码 Agent 记忆/团队/企业记忆 | Your AI forgets. This remembers. Spec-driven coding harness for vibecoders, product owners, CEOs and real buil |
| [NirDiamant/Agent_Memory_Techniques](https://github.com/NirDiamant/Agent_Memory_Techniques) | 1111 | 评测/论文/清单/图/时序/认知架构 | Agent memory for LLMs: 30 runnable Jupyter notebooks covering conversation buffers, vector stores, knowledge g |
| [lucasrosati/claude-code-memory-setup](https://github.com/lucasrosati/claude-code-memory-setup) | 1034 | 编码 Agent 记忆/图/时序/认知架构/本地优先/PKM | Up to 71.5x fewer tokens per session on Claude Code with Obsidian + Graphify. Persistent memory, codebase know |
| [CodeAbra/iai-personal-memory-engine](https://github.com/CodeAbra/iai-personal-memory-engine) | 912 | MCP 服务器/编码 Agent 记忆/本地优先/PKM | A cyber brain for your AI. It never forgets a detail, remembers exactly what you said, and learns how you work |
| [AlphaAvatar/AlphaAvatar](https://github.com/AlphaAvatar/AlphaAvatar) | 818 | 其他 | An Omni Real-Time Assistant for Everyone |
| [raiyanyahya/recall](https://github.com/raiyanyahya/recall) | 761 | 编码 Agent 记忆/本地优先/PKM | Stop wasting tokens and re-explaining your project every session. Recall gives Claude Code , Opencode durable  |
| [jaredrhod/ai-memory-vault](https://github.com/jaredrhod/ai-memory-vault) | 713 | MCP 服务器/本地优先/PKM | Give your AI a real, persistent memory. The open-source system plus templates that turn an Obsidian vault into |
| [caspianmoon/memoripy](https://github.com/caspianmoon/memoripy) | 694 | MCP 服务器/图/时序/认知架构 | Evidence-first local memory for AI agents with temporal versions, admission policies, citations, explainable r |
| [atomicstrata/atomicmemory](https://github.com/atomicstrata/atomicmemory) | 439 | MCP 服务器/本地优先/PKM/记忆层/API/SDK | Portable semantic memory for AI agents: core engine, TypeScript SDK, framework adapters, MCP server, CLI, and  |
| [Lyellr88/marm-memory](https://github.com/Lyellr88/marm-memory) | 422 | MCP 服务器/编码 Agent 记忆/本地优先/PKM/记忆层/API/SDK | Local-first 3-in-1 AI memory layer & MCP server for Claude Code, Codex, Grok, Gemini, VS Code and Cursor. Fuse |
| [Goldentrii/AgentRecall-X](https://github.com/Goldentrii/AgentRecall-X) | 371 | MCP 服务器/记忆层/API/SDK | Correction-first persistent memory for AI agents. MCP server + SDK + CLI. Compounds across sessions. |
| [abraxas914/VESTI](https://github.com/abraxas914/VESTI) | 361 | 本地优先/PKM/记忆 OS/平台/记忆层/API/SDK | Local-first AI conversation memory hub to capture, search, summarize, and export chats across major AI platfor |
| [DEEP-PolyU/Awesome-GraphMemory](https://github.com/DEEP-PolyU/Awesome-GraphMemory) | 358 | 评测/论文/清单 | A survey of Graph-based Agent Memory / A curated list of resources (surveys, papers, benchmarks, and opensourc |
| [JordyZomer/lemmalog](https://github.com/JordyZomer/lemmalog) | 340 | MCP 服务器 | A Datalog engine for LLM agent memory: stratified rules, provenance-tracked facts, incremental derivation, and |
| [LucieEveille/kiwi-mem](https://github.com/LucieEveille/kiwi-mem) | 339 | MCP 服务器 | 🥝 Self-hosted memory gateway for AI companions — OpenAI-compatible proxy with vector search, memory heat, Drea |
| [supermemoryai/memorybench](https://github.com/supermemoryai/memorybench) | 330 | 评测/论文/清单/记忆层/API/SDK | Unified benchmark for evaluating conversational memory and RAG across multiple datasets |
| [Prompthon-IO/agent-systems-handbook](https://github.com/Prompthon-IO/agent-systems-handbook) | 316 | 评测/论文/清单/MCP 服务器/上下文/工具输出优化/记忆层/API/SDK | A practical AI agents handbook covering agent systems, agentic workflows, LangGraph, MCP/A2A, context engineer |
| [AGI-is-going-to-arrive/Memory-Palace](https://github.com/AGI-is-going-to-arrive/Memory-Palace) | 315 | 图/时序/认知架构/记忆 OS/平台 | Memory Palace is a long-term memory operating system purpose-built for AI Agents. |
| [keli-wen/agentic-harness-patterns-skill](https://github.com/keli-wen/agentic-harness-patterns-skill) | 306 | 编码 Agent 记忆/上下文/工具输出优化 | Agent skill for harness engineering — memory, permissions, context engineering, multi-agent coordination. Dist |
| [a2328275243/mempalace-evolve](https://github.com/a2328275243/mempalace-evolve) | 300 | 图/时序/认知架构/记忆 OS/平台 | Self-evolving memory palace for AI agents — persistent memory with automatic learning, knowledge graph, and mu |
| [timgordontg/engrim](https://github.com/timgordontg/engrim) | 299 | MCP 服务器/编码 Agent 记忆/本地优先/PKM | The Universal Cross-Model Episodic Memory Standard. Local-first, project-scoped SQLite engine for Google Antig |
| [molyswu/hand_detection](https://github.com/molyswu/hand_detection) | 284 | 评测/论文/清单/记忆层/API/SDK | using Neural Networks (SSD) on Tensorflow.  This repo documents steps and scripts used to train a hand detecto |
| [xuiltul/animaworks](https://github.com/xuiltul/animaworks) | 267 | 编码 Agent 记忆/团队/企业记忆/记忆层/API/SDK | Organization-as-Code for autonomous AI agents. Brain-inspired memory that grows, consolidates, and forgets. Mu |
| [ramakay/claude-self-reflect](https://github.com/ramakay/claude-self-reflect) | 227 | MCP 服务器 | Claude forgets everything. This fixes that. 🔗 www.npmjs.com/package/claude-self-reflect |
| [aouicher/graphmind](https://github.com/aouicher/graphmind) | 216 | MCP 服务器/编码 Agent 记忆/图/时序/认知架构/本地优先/PKM | Local-first code intelligence for AI assistants. Turns your codebase into a knowledge graph your AI can query, |
| [nemori-ai/nemori](https://github.com/nemori-ai/nemori) | 213 | 评测/论文/清单/记忆层/API/SDK | A minimalist MVP demonstrating a simple yet profound insight: aligning AI memory with human episodic memory gr |
| [alibaizhanov/mengram](https://github.com/alibaizhanov/mengram) | 204 | MCP 服务器/编码 Agent 记忆/图/时序/认知架构 | Human-like memory for AI agents — semantic, episodic & procedural. Experience-driven procedures that learn fro |
| [Siddhant-K-code/distill](https://github.com/Siddhant-K-code/distill) | 196 | 其他 | Context intelligence layer for LLM agents: persistent memory with write-time dedup, sensitivity tagging, confl |
| [TiMEM-AI/TiMEM](https://github.com/TiMEM-AI/TiMEM) | 186 | 图/时序/认知架构 | Temporal-Hierarchical Memory Consolidation for Long-Horizon Conversational Agents |
| [MemTensor/HaluMem](https://github.com/MemTensor/HaluMem) | 176 | 评测/论文/清单 | HaluMem is the first operation level hallucination evaluation benchmark tailored to agent memory systems. |
| [Herricka/RecallWeave](https://github.com/Herricka/RecallWeave) | 175 | 上下文/工具输出优化/本地优先/PKM | Local-first agent memory lifecycle engine: typed memories in an append-only, hash-chained log with dedupe, con |
| [ourmem/omem](https://github.com/ourmem/omem) | 173 | MCP 服务器/编码 Agent 记忆/团队/企业记忆 | Shared Memory That Never Forgets — persistent memory for AI agents with Space-based sharing across agents and  |
| [tercumantanumut/selene](https://github.com/tercumantanumut/selene) | 172 | MCP 服务器/编码 Agent 记忆 | Selene is a desktop app that runs AI agents on your machine. Connect them to your WhatsApp, Telegram, Slack, o |
| [swapnildahiphale/OpenSRE](https://github.com/swapnildahiphale/OpenSRE) | 164 | 图/时序/认知架构/团队/企业记忆 | OpenSRE — the memory-first AI SRE. Self-hosted incident investigation with episodic memory, knowledge graph, w |
| [slow-stack/mneme](https://github.com/slow-stack/mneme) | 162 | MCP 服务器/编码 Agent 记忆/本地优先/PKM | 🧠 The memory that dreams — cross-session memory for DeepSeek Harness. Local SQLite + Markdown mirrors, autoDre |
| [memoket/memoket-kite](https://github.com/memoket/memoket-kite) | 161 | 评测/论文/清单 | An open-source, vector-free long-term memory engine for AI agents, achieving SOTA on LoCoMo and LongMemEval wi |
| [mohammadtavakoli78/BEAM](https://github.com/mohammadtavakoli78/BEAM) | 160 | 评测/论文/清单/记忆层/API/SDK | [ICLR 2026] Beyond a Million Tokens: Benchmarking and Enhancing Long-Term Memory in LLMs |
| [vasilyevdm/ai-agent-handbook](https://github.com/vasilyevdm/ai-agent-handbook) | 154 | MCP 服务器/上下文/工具输出优化/记忆层/API/SDK | Comprehensive guide to AI agent engineering: how 30+ frameworks actually work under the hood. Context rot,  co |

## 从 GitHub 看到的新功能方向（上一份报告没有的）

1. **Context Database / 上下文数据库**：把“记忆 + 知识 + 上下文”统一成一个可查询的库（OpenViking）。
2. **上下文沙箱/工具输出压缩**：在进入模型前把工具结果压掉（context-mode），直接省 token。
3. **Agent Skills 作为记忆层**：把可复用技能/SOP 当记忆存（Acontext），对应“程序性记忆”。
4. **团队级记忆 Hub**：多人共享记忆 + 权限（TencentDB-Agent-Memory）。
5. **零云端 SQLite 单文件记忆**：一个文件带走全部记忆（mnemosyne、LongMemory）。
6. **Markdown-native 便携记忆层**：跨 Agent、可 git diff（EverOS、agent-memory）。
7. **记忆宫殿/空间记忆**：用空间结构组织记忆（MemPalace）。
8. **自演化 Memory OS**：记忆自己重组、淘汰、升级（MemOS、EverOS）。
9. **代码库记忆与对话记忆分离**：代码索引/符号图单独一层（codebase-memory-mcp、DeusData）。
10. **记忆评测/榜单**：以 benchmark 为卖点（MemPalace、Hindsight、agentmemory）。
11. **用户画像记忆**：profile 优先于原始对话（memobase）。
12. **多 Agent 共享记忆/协作**：多个 Agent 读写同一记忆空间（Memoh、EverRoom）。

## 对北极星的直接启示

- 我们的“每轮七字段 + 只注入上一轮”在 GitHub 上几乎没有同款，仍是差异点。
- 但“上下文沙箱/工具输出压缩”“程序性记忆/技能”“团队记忆 Hub”“零云端单文件”是明确的空白赛道。
- 本地优先项目普遍强调 Markdown/plain text；我们的 JSON 同样可读，但应考虑 Markdown 导出/镜像。
- 评测正在成为卖点；没有自己的评测，很难证明“更好”。
- 记忆安全（投毒、路径穿越、越权）在长尾项目里讨论很多，我们的审计方向是对的。

## 数据文件

- `research/github-repos.json`：1603 个仓库的元数据（star/fork/language/topics/license/updated）
- `research/github_scan.py`：搜索脚本（可改关键词、重跑）
- `research/render_github_report.py`：本报告生成器


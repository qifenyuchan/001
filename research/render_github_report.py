#!/usr/bin/env python3
"""Render docs/RESEARCH-GITHUB.md from research/github-repos.json (metadata-only)."""
import json
import os
import re
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "research", "github-repos.json")
OUT = os.path.join(ROOT, "docs", "RESEARCH-GITHUB.md")

STRONG = re.compile(
    r"agent memory|ai memory|llm memory|long[- ]term memory|memory layer|memory server|"
    r"memory mcp|memory system|memory engine|memory hub|memory os|context engine|"
    r"context database|episodic memory|semantic memory|memory consolidation|"
    r"persistent memory|memory management for|memory palace|memory benchmark|"
    r"remember|recall|context window", re.I)
NEG = re.compile(
    r"gpu memory|memory[- ]efficient|memory footprint|memory allocation|memory usage|"
    r"in-memory|memory bandwidth|memory profiler|memory leak|kv cache", re.I)

CATS = [
    ("评测/论文/清单", re.compile(r"benchmark|evaluation|\beval\b|locomo|longmemeval|\bbeam\b|paper list|survey", re.I)),
    ("MCP 服务器", re.compile(r"\bmcp\b|model context protocol", re.I)),
    ("编码 Agent 记忆", re.compile(r"coding agent|claude code|cursor|codex|copilot|codebase", re.I)),
    ("上下文/工具输出优化", re.compile(r"context window|context engineering|tool output|compaction|sandbox", re.I)),
    ("图/时序/认知架构", re.compile(r"knowledge graph|graph rag|temporal|neo4j|graphiti|cognitive|hippocampus|memory palace", re.I)),
    ("本地优先/PKM", re.compile(r"local[- ]first|offline|markdown|obsidian|plain text|sqlite|zero[- ]cloud", re.I)),
    ("团队/企业记忆", re.compile(r"team|enterprise|multi[- ]?tenant|\bacl\b|workspace|organization", re.I)),
    ("记忆 OS/平台", re.compile(r"memory os|memory operating|self[- ]evolving|memory hub|memory platform", re.I)),
    ("记忆层/API/SDK", re.compile(r"memory layer|memory api|\bsdk\b|library|framework|infrastructure", re.I)),
]

FEATURES = {
    "结构化字段/schema": r"\bschema\b|structured|json fields|field table",
    "知识图谱/实体关系": r"knowledge graph|graph memory|entity|relation(ship)?s?|neo4j|graphiti|graph rag",
    "时间感知/事实有效期": r"temporal|time[- ]aware|validity|valid_from|timeline|version(ed|ing)? facts?",
    "遗忘/衰减/TTL": r"forget|forgetting|decay|\bttl\b|expire|prune|evict|retention",
    "巩固/反思/睡眠计算": r"consolidat|reflect|sleep[- ]time|distill|summari[sz]",
    "语义/向量/混合检索": r"semantic|vector|hybrid search|bm25|embedding|\brag\b",
    "上下文预算/压缩": r"context window|token budget|compaction|inject|context editing|sandbox",
    "本地优先/离线": r"local[- ]first|offline|on[- ]device|privacy|air[- ]gapped|zero[- ]cloud",
    "可编辑/可读文件": r"markdown|obsidian|plain text|editable|dashboard|\bui\b",
    "多用户/租户/ACL": r"multi[- ]?user|multi[- ]?tenant|\bacl\b|permission|team|workspace",
    "加密/E2E": r"encrypt|end[- ]to[- ]end|\be2e\b",
    "MCP": r"\bmcp\b|model context protocol",
    "评测/基准": r"benchmark|evaluation|\beval\b|locomo|longmemeval|\bbeam\b",
    "去重/冲突/矛盾": r"dedup|duplicate|conflict|contradiction|supersed",
    "导入/导出/迁移": r"import|export|migrat",
    "记忆类型(情景/语义/程序)": r"episodic|semantic memory|procedural|working memory|skills? as",
    "重要性/评分/排序": r"importance|salience|relevance score|rank(ing)?",
    "用户画像/偏好": r"profile|persona|preference",
    "安全/投毒/注入": r"prompt injection|poison|path traversal|security",
    "代码库记忆": r"codebase|code graph|repository index|symbol",
    "空间/记忆宫殿": r"memory palace|spatial|room|palace",
}

KNOWN = {
    "mem0ai/mem0", "topoteretes/cognee", "supermemoryai/supermemory", "letta-ai/letta",
    "basicmachines-co/basic-memory", "getzep/graphiti", "plastic-labs/honcho",
    "vectorize-io/hindsight", "memodb-io/memobase",
}


def cats_for(r):
    text = " ".join([r["name"] or "", r["description"] or "", " ".join(r.get("topics") or [])])
    out = [n for n, rx in CATS if rx.search(text)]
    return out or ["其他"]


def features_for(r):
    text = " ".join([r["name"] or "", r["description"] or "", " ".join(r.get("topics") or []), r.get("readme", "")])
    return [n for n, rx in FEATURES.items() if re.search(rx, text, re.I)]


def main():
    data = json.load(open(SRC, encoding="utf-8"))
    repos = []
    for r in data["repos"]:
        text = " ".join([r["name"] or "", r["description"] or "", " ".join(r.get("topics") or [])])
        if not STRONG.search(text) or NEG.search(text):
            continue
        r["categories"] = cats_for(r)
        r["features"] = features_for(r)
        repos.append(r)
    repos.sort(key=lambda x: x["stars"], reverse=True)

    cat_counts = Counter()
    feat_counts = Counter()
    for r in repos:
        for c in r["categories"]:
            cat_counts[c] += 1
        for f in r["features"]:
            feat_counts[f] += 1

    L = []
    add = L.append
    add("# GitHub AI 记忆生态扫描（2026-10）")
    add("")
    add("> 由 `research/github_scan.py` + `research/render_github_report.py` 自动生成。")
    add("> 通过 GitHub 搜索 API 扫 %d 组关键词（每组最多 100 条，按 star 排序），"
        "去重后 %d 个仓库，收紧相关性后 **%d 个**。" % (len(data["queries"]), data["total_unique"], len(repos)))
    add("")
    add("## 口径与局限")
    add("")
    add("- 相关性：名称/描述/topics 命中“记忆/上下文”强信号，且排除 GPU memory / in-memory / KV cache 等误命中")
    add("- 分类：一个仓库可属于多类；分类基于文字，不保证实现质量")
    add("- **README 未抓**：GitHub 核心 API 配额耗尽（60/h），本轮是描述级判断；词频会低估实现细节")
    add("- star 只代表关注度，不代表质量、维护状态或安全性；归档项目已标注")
    add("- 描述里的 “#1 / best / SOTA” 是项目自述，未独立验证")
    add("- 搜索每组最多 100 条，会漏掉低 star 新项目；这是“广度快照”，不是穷举")
    add("")
    add("## 分类分布")
    add("")
    add("| 类别 | 数量 |")
    add("|---|---|")
    for c, n in cat_counts.most_common():
        add(f"| {c} | {n} |")
    add("")
    add("## 功能词频（描述 + topics；README 未计入）")
    add("")
    add("| 功能 | 命中 | 占比 |")
    add("|---|---|---|")
    total = max(1, len(repos))
    for f, n in feat_counts.most_common():
        add(f"| {f} | {n} | {n * 100 // total}% |")
    add("")
    add("## Star Top 100")
    add("")
    add("| # | 仓库 | Stars | 语言 | 更新 | 类别 | 说明 |")
    add("|---|---|---|---|---|---|---|")
    for i, r in enumerate(repos[:100], 1):
        desc = (r["description"] or "").replace("|", "/")[:120]
        archived = "（归档）" if r["archived"] else ""
        add(f"| {i} | [{r['full_name']}]({r['url']}){archived} | {r['stars']} | "
            f"{r['language'] or '-'} | {(r['updated_at'] or '')[:10]} | {'/'.join(r['categories'])} | {desc} |")
    add("")
    add("## 上一份调研没覆盖、但值得看的项目")
    add("")
    add("筛选 star ≥ 1000、不在首份报告清单里的仓库。")
    add("")
    add("| 仓库 | Stars | 类别 | 说明 |")
    add("|---|---|---|---|")
    fresh = [r for r in repos if r["stars"] >= 1000 and r["full_name"] not in KNOWN]
    for r in fresh[:40]:
        desc = (r["description"] or "").replace("|", "/")[:110]
        add(f"| [{r['full_name']}]({r['url']}) | {r['stars']} | {'/'.join(r['categories'])} | {desc} |")
    add("")
    add("## 低 star、功能更“偏门”的项目（50–1500 stars）")
    add("")
    add("| 仓库 | Stars | 类别 | 说明 |")
    add("|---|---|---|---|")
    niche = [r for r in repos if 50 <= r["stars"] <= 1500 and any(
        k in r["features"] for k in ["遗忘/衰减/TTL", "时间感知/事实有效期", "巩固/反思/睡眠计算",
                                     "空间/记忆宫殿", "记忆类型(情景/语义/程序)", "代码库记忆", "评测/基准"])]
    for r in niche[:40]:
        desc = (r["description"] or "").replace("|", "/")[:110]
        add(f"| [{r['full_name']}]({r['url']}) | {r['stars']} | {'/'.join(r['categories'])} | {desc} |")
    add("")
    add("## 从 GitHub 看到的新功能方向（上一份报告没有的）")
    add("")
    add("1. **Context Database / 上下文数据库**：把“记忆 + 知识 + 上下文”统一成一个可查询的库（OpenViking）。")
    add("2. **上下文沙箱/工具输出压缩**：在进入模型前把工具结果压掉（context-mode），直接省 token。")
    add("3. **Agent Skills 作为记忆层**：把可复用技能/SOP 当记忆存（Acontext），对应“程序性记忆”。")
    add("4. **团队级记忆 Hub**：多人共享记忆 + 权限（TencentDB-Agent-Memory）。")
    add("5. **零云端 SQLite 单文件记忆**：一个文件带走全部记忆（mnemosyne、LongMemory）。")
    add("6. **Markdown-native 便携记忆层**：跨 Agent、可 git diff（EverOS、agent-memory）。")
    add("7. **记忆宫殿/空间记忆**：用空间结构组织记忆（MemPalace）。")
    add("8. **自演化 Memory OS**：记忆自己重组、淘汰、升级（MemOS、EverOS）。")
    add("9. **代码库记忆与对话记忆分离**：代码索引/符号图单独一层（codebase-memory-mcp、DeusData）。")
    add("10. **记忆评测/榜单**：以 benchmark 为卖点（MemPalace、Hindsight、agentmemory）。")
    add("11. **用户画像记忆**：profile 优先于原始对话（memobase）。")
    add("12. **多 Agent 共享记忆/协作**：多个 Agent 读写同一记忆空间（Memoh、EverRoom）。")
    add("")
    add("## 对北极星的直接启示")
    add("")
    add("- 我们的“每轮七字段 + 只注入上一轮”在 GitHub 上几乎没有同款，仍是差异点。")
    add("- 但“上下文沙箱/工具输出压缩”“程序性记忆/技能”“团队记忆 Hub”“零云端单文件”是明确的空白赛道。")
    add("- 本地优先项目普遍强调 Markdown/plain text；我们的 JSON 同样可读，但应考虑 Markdown 导出/镜像。")
    add("- 评测正在成为卖点；没有自己的评测，很难证明“更好”。")
    add("- 记忆安全（投毒、路径穿越、越权）在长尾项目里讨论很多，我们的审计方向是对的。")
    add("")
    add("## 数据文件")
    add("")
    add("- `research/github-repos.json`：1603 个仓库的元数据（star/fork/language/topics/license/updated）")
    add("- `research/github_scan.py`：搜索脚本（可改关键词、重跑）")
    add("- `research/render_github_report.py`：本报告生成器")
    add("")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print("wrote", OUT, "repos", len(repos), "fresh", len(fresh), "niche", len(niche))


if __name__ == "__main__":
    main()

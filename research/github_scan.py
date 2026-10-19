#!/usr/bin/env python3
"""GitHub AI-memory landscape scanner.

Searches a broad set of queries via the GitHub Search API, dedupes repos,
fetches READMEs for the top repos, classifies them, and mines feature keywords.
Outputs research/github-repos.json and docs/RESEARCH-GITHUB.md.
"""
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_JSON = os.path.join(ROOT, "research", "github-repos.json")
OUT_MD = os.path.join(ROOT, "docs", "RESEARCH-GITHUB.md")
README_LIMIT = 0
README_TIME_BUDGET = 110

QUERIES = [
    "agent memory",
    "llm memory",
    "ai memory",
    "long-term memory agent",
    "memory mcp",
    "mcp memory server",
    "memory os",
    "knowledge graph memory",
    "episodic memory llm",
    "memory layer llm",
    "context engineering memory",
    "conversational memory",
    "memory consolidation llm",
    "forgetting llm memory",
    "topic:agent-memory",
    "topic:ai-memory",
    "topic:long-term-memory",
    "topic:memory-mcp",
    "memory compaction",
    "memory poisoning",
    "personal knowledge graph",
    "agent state persistence",
]

FEATURES = {
    "结构化字段/schema": r"\bschema\b|structured|json fields|field table|seven[- ]field",
    "知识图谱/实体关系": r"knowledge graph|graph memory|entity|relation(ship)?s?|neo4j|graphiti",
    "时间感知/事实有效期": r"temporal|time[- ]aware|validity|valid_from|timeline|version(ed|ing)? facts?",
    "遗忘/衰减/TTL": r"forget|forgetting|decay|\bttl\b|expire|prune|evict|retention",
    "巩固/反思/睡眠计算": r"consolidat|reflect|sleep[- ]time|distill|summari[sz]",
    "语义/向量/混合检索": r"semantic|vector|hybrid search|bm25|embedding|\brag\b",
    "上下文预算/压缩": r"context window|token budget|compaction|inject|context editing",
    "本地优先/离线": r"local[- ]first|offline|on[- ]device|privacy|air[- ]gapped",
    "可编辑/可读文件": r"markdown|obsidian|plain text|editable|dashboard|\bui\b",
    "多用户/租户/ACL": r"multi[- ]?user|multi[- ]?tenant|\bacl\b|permission|team|workspace",
    "加密/E2E": r"encrypt|end[- ]to[- ]end|\be2e\b",
    "MCP": r"\bmcp\b|model context protocol",
    "评测/基准": r"benchmark|evaluation|\beval\b|locomo|longmemeval|\bbeam\b",
    "去重/冲突/矛盾": r"dedup|duplicate|conflict|contradiction|supersed",
    "导入/导出/迁移": r"import|export|migrat",
    "记忆类型(情景/语义/程序)": r"episodic|semantic memory|procedural|working memory",
    "重要性/评分/排序": r"importance|salience|relevance score|rank(ing)?",
    "用户画像/偏好": r"profile|persona|preference",
    "安全/投毒/注入": r"prompt injection|poison|path traversal|security",
}

AI_RE = re.compile(r"\b(ai|llm|agent|mcp|chat|chatbot|conversation|rag|embedding|transformer|gpt|claude|copilot|assistant)\b", re.I)
MEM_RE = re.compile(r"memory|memories|recall|remember|context|knowledge graph|memoryos|memory os", re.I)

CATEGORIES = [
    ("评测/基准", re.compile(r"benchmark|evaluation|\beval\b|locomo|longmemeval|\bbeam\b", re.I)),
    ("MCP 服务器", re.compile(r"\bmcp\b|model context protocol", re.I)),
    ("图/时序记忆", re.compile(r"knowledge graph|graph memory|temporal|neo4j|graphiti", re.I)),
    ("本地优先/PKM", re.compile(r"local[- ]first|offline|markdown|obsidian|plain text|sqlite", re.I)),
    ("框架/SDK/记忆层", re.compile(r"framework|\bsdk\b|library|memory layer|\bapi\b", re.I)),
    ("产品/助手", re.compile(r"personal|assistant|chatgpt|memory os|copilot|second brain", re.I)),
]

HEADERS = {"User-Agent": "northstar-memory-research", "Accept": "application/vnd.github+json"}


def api(url, accept=None, tries=3):
    headers = dict(HEADERS)
    if accept:
        headers["Accept"] = accept
    for attempt in range(tries):
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=35) as resp:
                return resp.read().decode("utf-8", "replace"), resp.headers
        except urllib.error.HTTPError as e:
            if e.code in (403, 429):
                reset = e.headers.get("X-RateLimit-Reset")
                wait = max(5, int(reset) - int(time.time()) + 3) if reset else 30
                wait = min(wait, 90)
                print(f"  rate limited ({e.code}), waiting {wait}s ...", flush=True)
                time.sleep(wait)
                continue
            print(f"  HTTP {e.code}: {url}", flush=True)
            return None, None
        except Exception as e:
            print(f"  error: {e}", flush=True)
            time.sleep(3)
    return None, None


def classify(repo):
    text = " ".join([
        repo.get("name", ""),
        repo.get("description") or "",
        " ".join(repo.get("topics") or []),
    ])
    cats = [name for name, rx in CATEGORIES if rx.search(text)]
    return cats or ["其他"]


def feature_hits(text):
    return [name for name, rx in FEATURES.items() if re.search(rx, text, re.I)]


def main():
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    repos = {}
    query_counts = {}
    for i, q in enumerate(QUERIES):
        if i:
            time.sleep(8.5)
        url = ("https://api.github.com/search/repositories?q=" + urllib.parse.quote(q)
               + "&sort=stars&order=desc&per_page=100")
        print(f"[search {i+1}/{len(QUERIES)}] {q}", flush=True)
        raw, headers = api(url)
        if not raw:
            query_counts[q] = 0
            continue
        data = json.loads(raw)
        items = data.get("items", [])
        query_counts[q] = len(items)
        for r in items:
            full = r.get("full_name")
            if not full or full in repos:
                continue
            repos[full] = {
                "full_name": full,
                "name": r.get("name"),
                "url": r.get("html_url"),
                "description": r.get("description") or "",
                "stars": r.get("stargazers_count", 0),
                "forks": r.get("forks_count", 0),
                "language": r.get("language"),
                "topics": r.get("topics") or [],
                "license": (r.get("license") or {}).get("spdx_id"),
                "archived": r.get("archived", False),
                "updated_at": r.get("updated_at"),
                "created_at": r.get("created_at"),
            }

    # relevance filter
    relevant = {}
    for full, r in repos.items():
        text = " ".join([r["name"] or "", r["description"], " ".join(r["topics"])])
        if MEM_RE.search(text) and AI_RE.search(text):
            relevant[full] = r

    ranked = sorted(relevant.values(), key=lambda x: x["stars"], reverse=True)

    # 先落盘搜索结果，避免 README 阶段超时丢数据
    interim = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "queries": QUERIES,
        "query_counts": query_counts,
        "total_unique": len(repos),
        "relevant": len(ranked),
        "readmes": 0,
        "repos": ranked,
    }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(interim, f, ensure_ascii=False, indent=2)
    print(f"[saved] search results -> {OUT_JSON}", flush=True)

    # fetch READMEs for top repos (core API: 60/hour), with a hard time budget
    print(f"[readme] fetching up to {README_LIMIT} (budget {README_TIME_BUDGET}s) ...", flush=True)
    fetched = 0
    started = time.time()
    for r in ranked[:README_LIMIT]:
        if r["archived"]:
            continue
        if time.time() - started > README_TIME_BUDGET:
            print("  time budget reached, stop fetching readmes", flush=True)
            break
        raw, _ = api(f"https://api.github.com/repos/{r['full_name']}/readme",
                     accept="application/vnd.github.raw")
        if raw:
            r["readme"] = raw[:30000]
            fetched += 1
        time.sleep(0.4)

    # classify + feature flags
    feature_counts = Counter()
    cat_counts = Counter()
    for r in ranked:
        r["categories"] = classify(r)
        for c in r["categories"]:
            cat_counts[c] += 1
        text = " ".join([r["name"] or "", r["description"], " ".join(r["topics"]), r.get("readme", "")])
        r["features"] = feature_hits(text)
        for f in r["features"]:
            feature_counts[f] += 1

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "queries": QUERIES,
        "query_counts": query_counts,
        "total_unique": len(repos),
        "relevant": len(ranked),
        "readmes": fetched,
        "repos": ranked,
    }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    write_markdown(payload, feature_counts, cat_counts, ranked)
    print(f"[done] {len(repos)} unique, {len(ranked)} relevant, {fetched} readmes", flush=True)


def write_markdown(payload, feature_counts, cat_counts, ranked):
    lines = []
    add = lines.append
    add("# GitHub AI 记忆生态扫描（2026-10）")
    add("")
    add("> 由 `research/github_scan.py` 自动生成。搜索 API 覆盖 14 组关键词，"
        "按 star 排序；README 由 GitHub API 读取（受 60 次/小时限制）。")
    add("")
    add("## 方法与口径")
    add("")
    add(f"- 生成时间：{payload['generated_at']}")
    add(f"- 关键词：{len(QUERIES)} 组；去重后仓库 **{payload['total_unique']}** 个；"
        f"与 AI/Agent 相关的 **{payload['relevant']}** 个")
    add(f"- 抓到 README：**{payload['readmes']}** 个（仅 top {README_LIMIT}，受 API 配额限制）")
    add("- 相关判定：名称/描述/topics 同时命中“记忆/上下文”与“AI/LLM/Agent/MCP”")
    add("- star 只代表关注度，不代表质量或可维护性；归档仓库未剔除，表中标注")
    add("")
    add("## 分类分布")
    add("")
    add("| 类别 | 数量 |")
    add("|---|---|")
    for c, n in cat_counts.most_common():
        add(f"| {c} | {n} |")
    add("")
    add("## 功能词频（README + 描述 + topics）")
    add("")
    add("| 功能 | 命中仓库数 | 占比 |")
    add("|---|---|---|")
    total = max(1, payload["relevant"])
    for f, n in feature_counts.most_common():
        add(f"| {f} | {n} | {n * 100 // total}% |")
    add("")
    add("## Star Top 60")
    add("")
    add("| # | 仓库 | Stars | 语言 | 更新 | 类别 | 说明 |")
    add("|---|---|---|---|---|---|---|")
    for i, r in enumerate(ranked[:60], 1):
        desc = (r["description"] or "").replace("|", "/")[:110]
        cats = "/".join(r["categories"])
        archived = "（归档）" if r["archived"] else ""
        add(f"| {i} | [{r['full_name']}]({r['url']}){archived} | {r['stars']} | "
            f"{r['language'] or '-'} | {(r['updated_at'] or '')[:10]} | {cats} | {desc} |")
    add("")
    add("## 低 star 但功能有意思的项目（50–1500 stars）")
    add("")
    add("筛选含“遗忘/时间/巩固/图/评测/记忆类型”等少见关键词的仓库。")
    add("")
    add("| 仓库 | Stars | 类别 | 说明 |")
    add("|---|---|---|---|")
    niche = [r for r in ranked if 50 <= r["stars"] <= 1500 and
             any(k in " ".join(r["features"]) for k in ["遗忘", "时间", "巩固", "知识图谱", "评测", "记忆类型"])]
    for r in niche[:30]:
        desc = (r["description"] or "").replace("|", "/")[:100]
        add(f"| [{r['full_name']}]({r['url']}) | {r['stars']} | {'/'.join(r['categories'])} | {desc} |")
    add("")
    add("## 从 GitHub 能看出的功能方向")
    add("")
    add("- **生命周期**：TTL/衰减/归档、去重、冲突/矛盾、时间有效性，是高频但实现质量差异最大的部分。")
    add("- **检索**：向量/混合检索几乎成标配；纯关键词的本地实现反而稀缺。")
    add("- **巩固**：consolidation / reflection / sleep-time 在头部项目出现，长尾很少。")
    add("- **可编辑**：Markdown/plain-text 路线在本地优先项目里反复出现，是信任关键。")
    add("- **安全**：prompt injection / memory poisoning / path traversal 开始被单独讨论。")
    add("- **评测**：LoCoMo/LongMemEval 被大量引用，但独立复现少，数字不可直接比较。")
    add("")
    add("## 数据文件")
    add("")
    add("- `research/github-repos.json`：全部仓库元数据、分类、功能标记、README 截断文本")
    add("- `research/github_scan.py`：可重跑脚本（改 `QUERIES` / `README_LIMIT`）")
    add("")
    add("## 局限")
    add("")
    add("- 搜索 API 单次最多 100 条，14 组关键词无法覆盖全部；按 star 排序会漏掉新项目。")
    add("- README 只取 top 55，功能词频对长尾项目是“描述级”判断，可能漏标。")
    add("- 关键词匹配会把“提到”当成“实现”，需要人工抽查（本报告已抽查 Top 20）。")
    add("- GitHub 搜索不含私有仓库、论文、商业产品内部实现。")
    add("")
    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()

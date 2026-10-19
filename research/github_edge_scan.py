#!/usr/bin/env python3
"""第三轮扫描：到更边缘的地方去。

第二轮证明了「搜别的东西能捞到记忆零件」。这一轮再往外推一层——
不搜任何能被称作「记忆相关」的领域，改搜这些领域的**上游**：
认知科学的原始机制、嵌入式存储引擎家族、人类用了几十年的外部记忆工具、
没人讨论的法律合规、以及一批看起来完全不相关的偏门东西。

思路仍然是同一个：不问「这是不是记忆」，只问「这拆开能不能装在记忆上」。
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "research", "github-edge.json")

QUERIES = [
    # ---- 认知科学本体：第二轮的认知类是从实现侧扫的，这里扫机制侧
    ("认知·机制", "testing effect retrieval practice"),
    ("认知·机制", "spacing effect learning"),
    ("认知·机制", "act-r cognitive architecture"),
    ("认知·机制", "hippocampal replay consolidation"),
    ("认知·机制", "complementary learning systems"),
    ("认知·机制", "memory reconsolidation"),
    # ---- 嵌入式存储家族：SQLite 之外的嵌入式引擎
    ("存储·引擎", "embedded graph database"),
    ("存储·引擎", "duckdb embedded analytics"),
    ("存储·引擎", "embedded key value store"),
    ("存储·引擎", "lsm tree storage engine"),
    ("存储·引擎", "embedded database rust"),
    # ---- 人类外部记忆：几十年前就在解决「记下来以后怎么找到」
    ("外部记忆", "zettelkasten"),
    ("外部记忆", "obsidian plugin"),
    ("外部记忆", "personal knowledge management"),
    ("外部记忆", "note taking local first"),
    # ---- 法律合规：AI 记忆讨论里几乎无人提起，但一定会来
    ("合规", "right to be forgotten"),
    ("合规", "gdpr erasure implementation"),
    ("合规", "data retention policy engine"),
    # ---- 最偏门：看起来和记忆毫无关系的东西
    ("偏门", "time travel debugging"),
    ("偏门", "undo history tree"),
    ("偏门", "conversation version control"),
    ("偏门", "minhash simhash deduplication"),
    ("偏门", "incremental view maintenance"),
    ("偏门", "method of loci memory palace"),
]

HEADERS = {"User-Agent": "northstar-memory-research", "Accept": "application/vnd.github+json"}


def api(url, tries=3):
    for _ in range(tries):
        req = urllib.request.Request(url, headers=HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=35) as resp:
                return resp.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (403, 429):
                reset = e.headers.get("X-RateLimit-Reset")
                wait = max(5, int(reset) - int(time.time()) + 3) if reset else 30
                wait = min(wait, 90)
                print(f"  rate limited, wait {wait}s", flush=True)
                time.sleep(wait)
                continue
            print(f"  HTTP {e.code}", flush=True)
            return None
        except Exception as e:
            print(f"  error {e}", flush=True)
            time.sleep(3)
    return None


def main():
    result = {}
    for i, (cat, q) in enumerate(QUERIES):
        if i:
            time.sleep(8.5)
        url = ("https://api.github.com/search/repositories?q=" + urllib.parse.quote(q)
               + "&sort=stars&order=desc&per_page=50")
        print(f"[{i+1}/{len(QUERIES)}] {cat} :: {q}", flush=True)
        raw = api(url)
        if not raw:
            continue
        data = json.loads(raw)
        items = []
        for r in data.get("items", []):
            items.append({
                "full_name": r.get("full_name"),
                "url": r.get("html_url"),
                "description": r.get("description") or "",
                "stars": r.get("stargazers_count", 0),
                "language": r.get("language"),
                "topics": r.get("topics") or [],
                "license": (r.get("license") or {}).get("spdx_id"),
                "updated_at": r.get("updated_at"),
                "created_at": r.get("created_at"),
                "archived": r.get("archived", False),
            })
        result[q] = {"category": cat, "items": items}

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "queries": [{"category": c, "query": q} for c, q in QUERIES],
        "results": result,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print("[done]", OUT, "queries:", len(result), flush=True)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Scan adjacent GitHub ecosystems whose components can be repurposed for AI memory.

Not memory products: search/index, versioned data, entity resolution, cognitive
scheduling, personalization, access control, durable execution, local models, etc.
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "research", "github-adjacent.json")

QUERIES = [
    ("检索/索引", "sqlite fts5"),
    ("检索/索引", "sqlite vector search"),
    ("检索/索引", "hybrid search reranker"),
    ("检索/索引", "late chunking retrieval"),
    ("数据/版本", "bitemporal database"),
    ("数据/版本", "event sourcing"),
    ("数据/版本", "crdt sync"),
    ("数据/版本", "data lineage provenance"),
    ("结构/实体", "entity resolution"),
    ("结构/实体", "zero-shot entity extraction"),
    ("结构/实体", "graphrag"),
    ("认知/生命周期", "spaced repetition scheduler"),
    ("认知/生命周期", "forgetting curve memory"),
    ("认知/生命周期", "memory consolidation"),
    ("个性化", "recommender user profile"),
    ("权限/安全", "attribute based access control"),
    ("权限/安全", "prompt injection defense"),
    ("运维", "durable execution workflow"),
    ("本地模型", "onnx embedding local"),
    ("本地模型", "local vector database"),
    ("便携/标准", "personal data pod"),
    ("运维", "opentelemetry tracing"),
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

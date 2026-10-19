#!/usr/bin/env python3
"""第四轮扫描：按用户群落扫，而不是按技术扫。

前三轮都是技术视角（产品/相邻领域/上游）。这一轮换成人视角：
AI 用得最多的两群人是「理工类」（写代码、做工程的）和「文创类」
（写长篇、做角色扮演、跑团、世界观设定的）。

这两群人早就被同一个问题折磨——「AI 记不住」——而且各自攒出了土办法：
理工的有决策记录、会话交接、实验笔记；文创的有世界书、角色卡、故事圣经。
问的是同一件事：**他们的土办法里，有没有可以直接搬的机制。**
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "research", "github-domains.json")

QUERIES = [
    # ---- 理工类：写代码与做工程的人怎么对付"记不住"
    ("理工·工程", "coding agent memory"),
    ("理工·工程", "codebase index mcp"),
    ("理工·工程", "session handoff agent"),
    ("理工·工程", "architecture decision record"),
    ("理工·工程", "electronic lab notebook"),
    ("理工·工程", "reproducible research workflow"),
    ("理工·工程", "developer journal devlog"),
    ("理工·工程", "engineering change management traceability"),
    # ---- 文创类：写长篇与角色扮演的人怎么对付"记不住"
    ("文创·叙事", "sillytavern extension"),
    ("文创·叙事", "lorebook world info"),
    ("文创·叙事", "character card ai"),
    ("文创·叙事", "ai novel writing"),
    ("文创·叙事", "story bible"),
    ("文创·叙事", "worldbuilding tool"),
    ("文创·叙事", "interactive fiction engine"),
    ("文创·叙事", "ttrpg campaign manager"),
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

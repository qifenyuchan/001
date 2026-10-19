#!/usr/bin/env python3
"""四轮扫描数据合并 → research/github-all.json。

输入四个来源（格式两种）：
  R1 github-repos.json     —— 扁平 repos 列表，已带 categories/features（第一轮已做过相关性判定）
  R2 github-adjacent.json  —— {results: {query: {category, items}}}
  R3 github-edge.json      —— 同上
  R4 github-domains.json   —— 同上

输出统一数据集，每条记录：
  full_name / url / description / stars / language / topics / license /
  rounds（出现在哪几轮）/ categories（各轮类目标签并集）/
  queries（命中过的查询词）/ features（仅 R1 有）/ mem_signal（记忆信号，剔除 in-memory 假阳性）
"""
import json
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "research", "github-all.json")

SOURCES = [
    (1, os.path.join(ROOT, "research", "github-repos.json")),
    (2, os.path.join(ROOT, "research", "github-adjacent.json")),
    (3, os.path.join(ROOT, "research", "github-edge.json")),
    (4, os.path.join(ROOT, "research", "github-domains.json")),
]

MEM = re.compile(r"\b(memory|memories|memor|remember|recall|mnem|engram|hippocamp)\w*", re.I)
FAKE = re.compile(r"in-memory|in memory", re.I)
CJK = re.compile(r"[\u4e00-\u9fff]")
# 抓取的仓库描述里可能带密钥样式的字符串（如失效的 S3 预签名 URL 凭证），
# 会被 GitHub 推送保护拦截——合并时统一脱敏。
SECRET = re.compile(r"(AKIA|ASIA)[0-9A-Z]{16}")


def iter_r1(path):
    d = json.load(open(path, encoding="utf-8"))
    for r in d.get("repos", []):
        yield r, (r.get("categories") or []), (r.get("features") or []), []


def iter_query_file(path):
    d = json.load(open(path, encoding="utf-8"))
    for q, v in d.get("results", {}).items():
        for it in v.get("items", []):
            yield it, [v.get("category")], [], [q]


def norm_round(round_no, path):
    if round_no == 1:
        items = iter_r1(path)
    else:
        items = iter_query_file(path)
    out = []
    for it, cats, feats, queries in items:
        fn = it.get("full_name")
        if not fn:
            continue
        out.append((fn, it, cats, feats, queries))
    return out


def main():
    merged = {}
    for rnd, path in SOURCES:
        if not os.path.exists(path):
            print(f"missing: {path}", file=sys.stderr)
            continue
        for fn, it, cats, feats, queries in norm_round(rnd, path):
            e = merged.get(fn)
            if e is None:
                e = {
                    "full_name": fn,
                    "url": it.get("url") or f"https://github.com/{fn}",
                    "description": it.get("description") or "",
                    "stars": it.get("stars", 0),
                    "language": it.get("language"),
                    "topics": it.get("topics") or [],
                    "license": it.get("license"),
                    "archived": bool(it.get("archived")),
                    "rounds": [],
                    "categories": [],
                    "queries": [],
                    "features": [],
                }
                merged[fn] = e
            if rnd not in e["rounds"]:
                e["rounds"].append(rnd)
            if it.get("stars", 0) > e["stars"]:
                e["stars"] = it["stars"]
            for c in cats:
                if c and c not in e["categories"]:
                    e["categories"].append(c)
            for f in feats:
                if f and f not in e["features"]:
                    e["features"].append(f)
            for q in queries:
                if q and q not in e["queries"]:
                    e["queries"].append(q)

    repos = list(merged.values())
    for e in repos:
        e["description"] = SECRET.sub(r"\1[REDACTED]", e["description"] or "")
        text = (e["description"] or "") + " " + e["full_name"]
        e["mem_signal"] = bool(MEM.search(text) and not (FAKE.search(e["description"] or "") and not MEM.search(e["description"] or "")))
        e["chinese"] = bool(CJK.search(e["description"] or ""))

    repos.sort(key=lambda x: (-len(x["rounds"]), -x["stars"]))

    # ---- 统计 ----
    rounds_cnt = Counter()
    for e in repos:
        for r in e["rounds"]:
            rounds_cnt[r] += 1
    recur = Counter(len(e["rounds"]) for e in repos)
    overlap = {}
    for i in range(1, 5):
        for j in range(i + 1, 5):
            si = {e["full_name"] for e in repos if i in e["rounds"]}
            sj = {e["full_name"] for e in repos if j in e["rounds"]}
            overlap[f"R{i}&R{j}"] = len(si & sj)
    chinese = sum(1 for e in repos if e["chinese"])
    mems = sum(1 for e in repos if e["mem_signal"])

    stats = {
        "total": len(repos),
        "per_round": dict(sorted(rounds_cnt.items())),
        "recurrence": dict(sorted(recur.items())),  # 出现轮数 -> 仓库数
        "overlap_pairs": overlap,
        "chinese_desc": chinese,
        "mem_signal": mems,
    }

    payload = {
        "generated_at": __import__("datetime").datetime.now().astimezone().isoformat(),
        "stats": stats,
        "repos": repos,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)

    print("total:", stats["total"])
    print("per_round:", stats["per_round"])
    print("recurrence:", stats["recurrence"])
    print("overlap:", stats["overlap_pairs"])
    print("chinese:", chinese, "mem_signal:", mems)
    print("->", OUT)


if __name__ == "__main__":
    main()

#!/usr/bin/env node
// run.mjs — 检索质量基线：总体 + 分类别的 Hit@5 / MRR@5，加延迟与注入有界性
// 用法：
//   node eval/run.mjs                # 摘要 + 分类表 + 未命中清单
//   node eval/run.mjs --verbose      # 全部用例
//   node eval/run.mjs --cat fuzzy    # 只看某一类
//   node eval/run.mjs --min-hit 0.75 # 低于阈值退出码 1（CI 用）
//   node eval/run.mjs --json
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RepoStore } from "../dist/store/repo.js";
import { searchRecords } from "../dist/features/search.js";
import { recall } from "../dist/features/inject.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const verbose = argv.includes("--verbose");
const asJson = argv.includes("--json");
const minHitArg = argv.indexOf("--min-hit");
const minHit = minHitArg >= 0 ? Number(argv[minHitArg + 1]) : null;
const minMrrArg = argv.indexOf("--min-mrr");
const minMrr = minMrrArg >= 0 ? Number(argv[minMrrArg + 1]) : null;
const noCons = argv.includes("--no-cons");
const catArg = argv.indexOf("--cat");
const onlyCat = catArg >= 0 ? argv[catArg + 1] : null;
const decayArg = argv.indexOf("--decay");
const decay = decayArg >= 0 ? Number(argv[decayArg + 1]) : 0;
const K = 5;

const CAT_LABEL = {
  consolidation: "巩固记录",
  keyword: "关键词直给",
  fuzzy: "口语/同义",
  "long-record": "长记录里找答案",
  "cross-session": "跨会话指代",
  time: "时间指代",
};

const suite = JSON.parse(fs.readFileSync(path.join(ROOT, "eval", "seed.json"), "utf8"));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-eval-"));
const repo = new RepoStore({ dataDir, rangeEvery: 999, rawHead: 1200, rawTail: 600 });
repo.open();

const idOf = new Map();
for (const s of suite.sessions) {
  for (const t of s.turns) {
    const created_at = t.age_days != null ? Date.now() - Number(t.age_days) * 86400000 : undefined;
    const r = repo.upsertTurn({ session_id: s.key, turn_no: t.turn, fields: t.fields, created_at });
    idOf.set(`${s.key}#${t.turn}`, r.id);
  }
}

// 巩固记录：把一批轮次的结论收进一条（文本由 seed 提供，核心不生成内容）
for (const c of noCons ? [] : suite.consolidations || []) {
  const r = repo.upsertConsolidation({
    session_id: c.session,
    kind: "consolidation",
    theme: c.theme,
    covers: (c.covers || []).map(String),
    fields: c.fields,
  });
  idOf.set(`cons:${c.session}:${c.theme}`, r.id);
}

const rows = [];
const lat = [];
for (const c of suite.queries) {
  const cat = c.cat || "keyword";
  if (onlyCat && cat !== onlyCat) continue;
  const t0 = performance.now();
  const res = searchRecords(repo, c.q, { limit: K, decayHalfLifeDays: decay });
  lat.push(performance.now() - t0);
  const got = res.results.map(r => r.id);
  const expect = c.expect.map(k => idOf.get(k)).filter(Boolean);
  const rank = got.findIndex(id => expect.includes(id));
  const topHits = expect.length ? got.filter(id => expect.includes(id)).length : 0;
  rows.push({
    q: c.q,
    cat,
    hit: rank >= 0,
    rank: rank >= 0 ? rank + 1 : 0,
    coverage: expect.length ? topHits / expect.length : 0,
    top: res.results.map(r => r.title),
    expect: c.expect,
  });
}

const n = rows.length;
const groups = new Map();
for (const r of rows) {
  if (!groups.has(r.cat)) groups.set(r.cat, []);
  groups.get(r.cat).push(r);
}

const stat = list => ({
  n: list.length,
  hit: list.filter(r => r.hit).length / list.length,
  mrr: list.reduce((a, r) => a + (r.hit ? 1 / r.rank : 0), 0) / list.length,
  recall: list.reduce((a, r) => a + r.coverage, 0) / list.length,
});

const overall = stat(rows);
lat.sort((a, b) => a - b);
const p = q => lat[Math.min(lat.length - 1, Math.max(0, Math.floor(lat.length * q)))];

const budget = 1200;
let maxBlock = 0;
for (const s of suite.sessions) {
  const r = recall(repo, { session_id: s.key }, budget);
  maxBlock = Math.max(maxBlock, r.text.length);
}

const summary = {
  queries: n,
  k: K,
  hit_at_5: Number(overall.hit.toFixed(4)),
  recall_at_5: Number(overall.recall.toFixed(4)),
  mrr_at_5: Number(overall.mrr.toFixed(4)),
  latency_ms: { p50: Number(p(0.5).toFixed(2)), p95: Number(p(0.95).toFixed(2)) },
  records: idOf.size,
  consolidations: noCons ? 0 : (suite.consolidations || []).length,
  budget_max: maxBlock,
  budget_ok: maxBlock <= budget,
  by_cat: Object.fromEntries(
    [...groups].map(([cat, list]) => {
      const s = stat(list);
      return [cat, { n: s.n, hit_at_5: Number(s.hit.toFixed(3)), recall_at_5: Number(s.recall.toFixed(3)), mrr_at_5: Number(s.mrr.toFixed(3)) }];
    })
  ),
};

if (asJson) {
  process.stdout.write(JSON.stringify({ summary, rows }, null, 2) + "\n");
} else {
  const pad = (s, w) => String(s).padEnd(w);
  process.stdout.write("\n检索质量基线（合成语料 v2，非真实历史）\n");
  process.stdout.write("─".repeat(64) + "\n");
  process.stdout.write(`用例 ${n}　记录 ${summary.records}　K=${K}\n`);
  process.stdout.write(`Hit@5 ${summary.hit_at_5.toFixed(3)}　Recall@5 ${summary.recall_at_5.toFixed(3)}　MRR@5 ${summary.mrr_at_5.toFixed(3)}\n`);
  process.stdout.write(`衰减   半衰期 ${decay === 0 ? "关闭" : decay + " 天"}\n`);
  process.stdout.write(`延迟   p50 ${summary.latency_ms.p50}ms　p95 ${summary.latency_ms.p95}ms\n`);
  process.stdout.write(`注入   最长 ${maxBlock} 字符　${summary.budget_ok ? "OK" : `超预算 ${budget}`}\n`);

  process.stdout.write("\n按类别：\n");
  process.stdout.write(`  ${pad("类别", 20)}${pad("用例", 6)}${pad("Hit@5", 8)}${pad("Recall@5", 10)}MRR@5\n`);
  for (const [cat, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const s = stat(list);
    process.stdout.write(
      `  ${pad(CAT_LABEL[cat] || cat, 20)}${pad(s.n, 6)}${pad(s.hit.toFixed(3), 8)}${pad(s.recall.toFixed(3), 10)}${s.mrr.toFixed(3)}\n`
    );
  }

  const miss = rows.filter(r => !r.hit);
  process.stdout.write(`\n未命中 ${miss.length} 条\n`);
  for (const r of verbose ? rows : miss) {
    const mark = r.hit ? `✓ #${r.rank}` : "✗";
    process.stdout.write(`  ${pad(mark, 6)} ${pad(r.q, 26)} [${r.cat}] 期望 ${r.expect.join(", ")}\n`);
    if (verbose || !r.hit) process.stdout.write(`         实际前五：${r.top.join(" ｜ ") || "（空）"}\n`);
  }
  process.stdout.write("");
}

try {
  fs.rmSync(dataDir, { recursive: true, force: true });
} catch {
  /* 临时目录清理失败不影响结果 */
}

if (minHit != null && Number.isFinite(minHit) && overall.hit < minHit) {
  process.stderr.write(`\n[eval] Hit@5 ${overall.hit.toFixed(3)} 低于阈值 ${minHit}\n`);
  process.exitCode = 1;
}
if (minMrr != null && Number.isFinite(minMrr) && overall.mrr < minMrr) {
  process.stderr.write(`\n[eval] MRR@5 ${overall.mrr.toFixed(3)} 低于阈值 ${minMrr}\n`);
  process.exitCode = 1;
}

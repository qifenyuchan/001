#!/usr/bin/env node
// run.mjs — 检索质量基线：Hit@5 / Recall@5 / MRR@5 + 延迟 + 注入有界性
// 用法：
//   node eval/run.mjs             # 跑一遍，打印摘要与失败用例
//   node eval/run.mjs --verbose   # 打印全部用例
//   node eval/run.mjs --min-mrr 0.6   # 低于阈值则退出码 1（可进 CI）
//   node eval/run.mjs --json      # 机器可读输出
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
const minMrrArg = argv.indexOf("--min-mrr");
const minMrr = minMrrArg >= 0 ? Number(argv[minMrrArg + 1]) : null;
const K = 5;

const suite = JSON.parse(fs.readFileSync(path.join(ROOT, "eval", "seed.json"), "utf8"));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-eval-"));
const repo = new RepoStore({ dataDir, rangeEvery: 999, rawHead: 1200, rawTail: 600 });
repo.open();

const idOf = new Map();
for (const s of suite.sessions) {
  for (const t of s.turns) {
    const r = repo.upsertTurn({ session_id: s.key, turn_no: t.turn, fields: t.fields });
    idOf.set(`${s.key}#${t.turn}`, r.id);
  }
}

const rows = [];
const lat = [];
let hits = 0;
let rr = 0;
let rec = 0;

for (const c of suite.queries) {
  const t0 = performance.now();
  const res = searchRecords(repo, c.q, { limit: K });
  lat.push(performance.now() - t0);
  const got = res.results.map(r => r.id);
  const expect = c.expect.map(k => idOf.get(k)).filter(Boolean);
  const rank = got.findIndex(id => expect.includes(id));
  const hit = rank >= 0;
  if (hit) hits++;
  rr += hit ? 1 / (rank + 1) : 0;
  const inter = got.filter(id => expect.includes(id)).length;
  rec += expect.length ? inter / expect.length : 0;
  rows.push({
    q: c.q,
    hit,
    rank: hit ? rank + 1 : 0,
    top: res.results.map(r => r.title),
    expect: c.expect,
  });
}

const n = rows.length;
const hitRate = hits / n;
const recall5 = rec / n;
const mrr = rr / n;
lat.sort((a, b) => a - b);
const p = q => lat[Math.min(lat.length - 1, Math.max(0, Math.floor(lat.length * q)))];

// 注入有界性：每个会话的上一轮块（含包补充）都不得超过预算
const budget = 1200;
let maxBlock = 0;
for (const s of suite.sessions) {
  const r = recall(repo, { session_id: s.key }, budget);
  maxBlock = Math.max(maxBlock, r.text.length);
}

const summary = {
  queries: n,
  k: K,
  hit_at_5: Number(hitRate.toFixed(4)),
  recall_at_5: Number(recall5.toFixed(4)),
  mrr_at_5: Number(mrr.toFixed(4)),
  latency_ms: { p50: Number(p(0.5).toFixed(2)), p95: Number(p(0.95).toFixed(2)) },
  records: [...idOf.keys()].length,
  budget_max: maxBlock,
  budget_ok: maxBlock <= budget,
};

if (asJson) {
  process.stdout.write(JSON.stringify({ summary, rows }, null, 2) + "\n");
} else {
  const pad = (s, w) => String(s).padEnd(w);
  process.stdout.write("\n检索质量基线（合成语料，非真实历史）\n");
  process.stdout.write("─".repeat(56) + "\n");
  process.stdout.write(`用例 ${n}　记录 ${summary.records}　K=${K}\n`);
  process.stdout.write(`Hit@5    ${summary.hit_at_5.toFixed(3)}\n`);
  process.stdout.write(`Recall@5 ${summary.recall_at_5.toFixed(3)}\n`);
  process.stdout.write(`MRR@5    ${summary.mrr_at_5.toFixed(3)}\n`);
  process.stdout.write(`延迟      p50 ${summary.latency_ms.p50}ms　p95 ${summary.latency_ms.p95}ms\n`);
  process.stdout.write(
    `注入有界  最长 ${maxBlock} 字符　${summary.budget_ok ? "OK" : `超预算 ${budget}`}\n`
  );
  const miss = rows.filter(r => !r.hit);
  process.stdout.write(`\n未命中 ${miss.length} 条${miss.length ? "（按查询列出）" : ""}\n`);
  for (const r of verbose ? rows : miss) {
    const mark = r.hit ? `✓ #${r.rank}` : "✗";
    process.stdout.write(`  ${pad(mark, 6)} ${pad(r.q, 22)} 期望 ${r.expect.join(", ")}\n`);
    if (verbose || !r.hit) process.stdout.write(`         实际前五：${r.top.join(" ｜ ") || "（空）"}\n`);
  }
  process.stdout.write("");
}

try {
  fs.rmSync(dataDir, { recursive: true, force: true });
} catch {
  /* 临时目录清理失败不影响结果 */
}

if (minMrr != null && Number.isFinite(minMrr) && mrr < minMrr) {
  process.stderr.write(`\n[eval] MRR@5 ${mrr.toFixed(3)} 低于阈值 ${minMrr}\n`);
  process.exit(1);
}

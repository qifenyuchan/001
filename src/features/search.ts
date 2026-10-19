// search.ts — 按需检索（中文 bigram + 字段加权；不自动注入）

import type { MemoryRecord } from "../core/types.js";
import { RepoStore } from "../store/repo.js";
import { tokenize } from "../core/tokenize.js";
import { scoreRecord } from "../core/score.js";
import { deriveTitleFromFields } from "../core/title.js";
import { safeSlice } from "../core/text.js";
import { sanitizeKey } from "../core/util.js";

export interface SearchHit {
  id: string;
  kind: string;
  session_key: string;
  turn_no: number;
  created_at: number;
  title: string;
  excerpt: string;
  score: number;
}

export function searchRecords(repo: RepoStore, query: string, opts: { limit?: number; session_key?: string } = {}): { ok: boolean; total: number; results: SearchHit[] } {
  const terms = tokenize(query);
  const limit = Math.max(1, Math.min(50, Math.floor(Number(opts.limit) || 5)));
  if (!terms.length) return { ok: true, total: 0, results: [] };
  let records: MemoryRecord[] = repo.all();
  if (opts.session_key) {
    const key = sanitizeKey(opts.session_key);
    records = records.filter(r => r.session_key === key);
  }
  const scored: { rec: MemoryRecord; score: number }[] = [];
  for (const rec of records) {
    const s = scoreRecord(rec, terms, repo.profileOf(rec.profile));
    if (s > 0) scored.push({ rec, score: s });
  }
  scored.sort((a, b) => b.score - a.score || b.rec.created_at - a.rec.created_at);
  const results = scored.slice(0, limit).map(({ rec, score }) => ({
    id: rec.id,
    kind: rec.kind,
    session_key: rec.session_key,
    turn_no: rec.turn_no,
    created_at: rec.created_at,
    title: deriveTitleFromFields(rec.fields, rec.raw_text, repo.profileOf(rec.profile)),
    excerpt: safeSlice(`${rec.fields[repo.profileOf(rec.profile).excerpt_field] || ""}`.trim(), 120),
    score: Math.round(score * 100) / 100,
  }));
  return { ok: true, total: scored.length, results };
}

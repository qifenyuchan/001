// search.ts — 按需检索（中文 bigram + 字段加权；不自动注入）

import type { MemoryRecord } from "../core/types.js";
import { RepoStore } from "../store/repo.js";
import { tokenize } from "../core/tokenize.js";
import { buildCorpus, docTexts, scoreDoc, type ExplainPart } from "../core/score.js";
import { deriveTitleFromFields } from "../core/title.js";
import { safeSlice } from "../core/text.js";
import { sanitizeKey } from "../core/util.js";
import type { PackHost } from "../packs/host.js";

export interface SearchHit {
  id: string;
  kind: string;
  session_key: string;
  session_id: string;
  turn_no: number;
  created_at: number;
  title: string;
  excerpt: string;
  score: number;
  /** explain=true 时返回：这条凭什么命中（按贡献降序，最多 4 条） */
  why?: { f: string; t: string; c: number }[];
}

export function searchRecords(
  repo: RepoStore,
  query: string,
  opts: { limit?: number; session_key?: string; explain?: boolean } = {},
  host?: PackHost
): { ok: boolean; total: number; results: SearchHit[] } {
  const terms = tokenize(query);
  const limit = Math.max(1, Math.min(50, Math.floor(Number(opts.limit) || 5)));
  if (!terms.length) return { ok: true, total: 0, results: [] };
  let records: MemoryRecord[] = repo.all();
  if (opts.session_key) {
    const key = sanitizeKey(opts.session_key);
    records = records.filter(r => r.session_key === key);
  }
  // 一次展开 + 一次统计：IDF 与平均长度需要全语料视角，逐条独立打分算不出来
  const docs = records.map(rec => docTexts(rec, repo.profileOf(rec.profile)));
  const corpus = buildCorpus(docs, terms);
  const scored: { rec: MemoryRecord; score: number; parts?: ExplainPart[] }[] = [];
  for (const d of docs) {
    const parts: ExplainPart[] | undefined = opts.explain ? [] : undefined;
    let s = scoreDoc(d, terms, corpus, parts);
    // 包的 score hook 只在原本命中时调整排序，不负责「从无到有」捞记录
    if (s > 0 && host) {
      const delta = host.score(d.rec, { query, terms });
      if (delta) {
        s += delta;
        if (parts) parts.push({ term: "*", field: "扩展", weight: 0, tf: 0, contribution: Math.round(delta * 100) / 100 });
      }
    }
    if (s > 0) scored.push({ rec: d.rec, score: s, parts });
  }
  scored.sort((a, b) => b.score - a.score || b.rec.created_at - a.rec.created_at);
  const results = scored.slice(0, limit).map(({ rec, score, parts }) => ({
    id: rec.id,
    kind: rec.kind,
    session_key: rec.session_key,
    session_id: rec.session_id,
    turn_no: rec.turn_no,
    created_at: rec.created_at,
    title: deriveTitleFromFields(rec.fields, rec.raw_text, repo.profileOf(rec.profile)),
    excerpt: safeSlice(`${rec.fields[repo.profileOf(rec.profile).excerpt_field] || ""}`.trim(), 120),
    score: Math.round(score * 100) / 100,
    ...(parts
      ? {
          why: parts
            .slice()
            .sort((a, b) => b.contribution - a.contribution)
            .slice(0, 4)
            .map(p => ({ f: p.field, t: p.term, c: p.contribution })),
        }
      : {}),
  }));
  return { ok: true, total: scored.length, results };
}

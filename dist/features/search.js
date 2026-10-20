// search.ts — 按需检索（中文 bigram + 字段加权；不自动注入）
import { tokenize } from "../core/tokenize.js";
import { buildCorpus, docTexts, scoreDoc } from "../core/score.js";
import { deriveTitleFromFields } from "../core/title.js";
import { safeSlice } from "../core/text.js";
import { sanitizeKey } from "../core/util.js";
import { parseTimeWindow } from "./time.js";
export function searchRecords(repo, query, opts = {}, host) {
    const terms = tokenize(query);
    const limit = Math.max(1, Math.min(50, Math.floor(Number(opts.limit) || 5)));
    if (!terms.length)
        return { ok: true, total: 0, results: [] };
    let records = repo.all();
    if (opts.session_key) {
        const key = sanitizeKey(opts.session_key);
        records = records.filter(r => r.session_key === key);
    }
    // 一次展开 + 一次统计：IDF 与平均长度需要全语料视角，逐条独立打分算不出来
    const docs = records.map(rec => docTexts(rec, repo.profileOf(rec.profile)));
    const now = opts.now ?? Date.now();
    const halfLifeDays = Math.max(0, Number(opts.decayHalfLifeDays ?? 0));
    const corpus = buildCorpus(docs, terms, { now, halfLifeDays });
    // 查询里明确写了时间（上周/最近三天…）→ 落在窗口内的记录加权，但不排除窗口外
    const window = parseTimeWindow(query, now);
    const WINDOW_BONUS = 8;
    const scored = [];
    for (const d of docs) {
        const parts = opts.explain ? [] : undefined;
        let s = scoreDoc(d, terms, corpus, parts);
        // 包的 score hook 只在原本命中时调整排序，不负责「从无到有」捞记录
        if (s > 0 && window && d.rec.created_at >= window.from && d.rec.created_at < window.to) {
            s += WINDOW_BONUS;
            if (parts)
                parts.push({ term: "*", field: window.label, weight: 0, tf: 0, contribution: WINDOW_BONUS });
        }
        if (s > 0 && host) {
            const delta = host.score(d.rec, { query, terms });
            if (delta) {
                s += delta;
                if (parts)
                    parts.push({ term: "*", field: "扩展", weight: 0, tf: 0, contribution: Math.round(delta * 100) / 100 });
            }
        }
        if (s > 0)
            scored.push({ rec: d.rec, score: s, parts });
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

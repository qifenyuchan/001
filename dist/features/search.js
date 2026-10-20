// search.ts — 按需检索（中文 bigram + 字段加权；不自动注入）
import { tokenize } from "../core/tokenize.js";
import { scoreRecord } from "../core/score.js";
import { deriveTitleFromFields } from "../core/title.js";
import { safeSlice } from "../core/text.js";
import { sanitizeKey } from "../core/util.js";
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
    const scored = [];
    for (const rec of records) {
        let s = scoreRecord(rec, terms, repo.profileOf(rec.profile));
        // 包的 score hook 只在原本命中时调整排序，不负责「从无到有」捞记录
        if (s > 0 && host)
            s += host.score(rec, { query, terms });
        if (s > 0)
            scored.push({ rec, score: s });
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

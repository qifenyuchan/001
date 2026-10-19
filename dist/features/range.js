// range.ts — 每 N 轮范围总结：自动机械聚合（Agent 可覆盖升级为精编）
import { fmtDay, today } from "../core/util.js";
import { safeSlice } from "../core/text.js";
export function buildAutoRange(repo, sessionId, from, to) {
    const key = sessionId;
    const turns = repo
        .all()
        .filter(r => r.kind === "turn" && r.session_key === key && r.turn_no >= from && r.turn_no <= to)
        .sort((a, b) => a.turn_no - b.turn_no);
    if (turns.length < 2) {
        return { ok: false, reason: `not-enough-turns(${turns.length})` };
    }
    const profile = repo.profileOf(turns[0].profile);
    const uniq = (vals, max) => {
        const out = [];
        for (const v of vals) {
            const t = (v || "").replace(/\s+/g, " ").trim();
            if (t && out.indexOf(t) === -1)
                out.push(t);
            if (out.length >= max)
                break;
        }
        return out;
    };
    const last = turns[turns.length - 1];
    const lastNonEmpty = (field) => {
        for (let i = turns.length - 1; i >= 0; i--) {
            const v = (turns[i].fields[field] || "").trim();
            if (v)
                return v;
        }
        return "";
    };
    const fields = {};
    for (const f of profile.fields) {
        let value = "";
        if (f.key === "时间" || f.key === "时间线") {
            value = `${fmtDay(turns[0].created_at)} ~ ${fmtDay(last.created_at)}`;
        }
        else if (f.key === profile.excerpt_field) {
            value = lastNonEmpty(f.key);
        }
        else if (f.key === profile.title_field) {
            value = uniq(turns.map(t => t.fields[f.key]), 5).join("；");
        }
        else {
            value = uniq(turns.map(t => t.fields[f.key]), 3).join("；");
        }
        if (!value)
            value = f.required ? "（区间内无有效记录）" : "";
        fields[f.key] = safeSlice(value, f.max_chars || 400);
    }
    const covers = turns.map(t => t.id);
    const res = repo.upsertRange({
        session_id: key,
        profile: profile.id,
        kind: "range",
        range_from: from,
        range_to: to,
        fields,
        covers,
        tags: ["阶段总结"],
        rating: 3,
        source: "auto-range",
    });
    return { ok: true, record: res };
}
export function gapsHint(gaps) {
    if (!gaps.length)
        return "";
    return `缺口轮次：${gaps.join(", ")}`;
}
export function todayTag() {
    return today();
}

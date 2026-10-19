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
    const shi = uniq(turns.map(t => t.fields["事情"]), 5).join("；");
    const last = turns[turns.length - 1];
    const zhong = uniq(turns.map(t => t.fields["重点"]), 3).join("；");
    const ren = uniq(turns.map(t => t.fields["人物"]), 3).join("、");
    const fields = {
        时间: `${fmtDay(turns[0].created_at)} ~ ${fmtDay(last.created_at)}`,
        地点: "无",
        人物: ren || "无",
        事情: safeSlice(shi || "（区间内无有效事情记录）", 400),
        原因: "无",
        结果: safeSlice(last.fields["结果"] || "无", 400),
        重点: safeSlice(zhong || "无", 300),
    };
    const covers = turns.map(t => t.id);
    const res = repo.upsertRange({
        session_id: key,
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

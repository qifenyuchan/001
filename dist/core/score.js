// score.ts — v2 检索打分：字段加权（标题/标签 3；事情 2.5；结果/重点 2；原因 1.5；其余 1；raw 1）
import { asText } from "./text.js";
import { countHits, proxBonus } from "./tokenize.js";
import { deriveTitleFromFields } from "./title.js";
import { fieldsToContent } from "../store/schema.js";
import { GENERAL_PROFILE } from "../store/profiles.js";
export function scoreRecord(rec, terms, profile = GENERAL_PROFILE) {
    if (!terms.length)
        return 0;
    const title = deriveTitleFromFields(rec.fields, rec.raw_text, profile);
    const tagStr = (rec.tags || []).join(" ");
    const content = fieldsToContent(rec.fields, profile);
    const raw = asText(rec.raw_text);
    const tl = terms.length;
    const th = countHits(title, terms);
    const gh = countHits(tagStr, terms);
    const ch = countHits(content, terms);
    const rh = countHits(raw, terms);
    let hit = th + gh + ch + rh;
    let score = th * 3 + gh * 3 + rh * 1;
    for (const f of profile.fields) {
        const h = countHits(rec.fields[f.key] || "", terms);
        hit += h;
        score += h * f.weight;
    }
    if (!hit)
        return 0;
    if (th === tl)
        score += 5;
    score += (rec.rating || 3) * 0.15;
    score += proxBonus(content, terms);
    if (rec.kind === "range")
        score *= 0.7;
    return score;
}

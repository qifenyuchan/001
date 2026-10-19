// score.ts — v2 检索打分：字段加权（标题/标签 3；事情 2.5；结果/重点 2；原因 1.5；其余 1；raw 1）

import { asText } from "./text.js";
import { countHits, proxBonus } from "./tokenize.js";
import { deriveTitleFromFields } from "./title.js";
import { fieldsToContent } from "../store/schema.js";
import type { MemoryRecord } from "./types.js";

export function scoreRecord(rec: MemoryRecord, terms: string[]): number {
  if (!terms.length) return 0;
  const title = deriveTitleFromFields(rec.fields, rec.raw_text);
  const tagStr = (rec.tags || []).join(" ");
  const content = fieldsToContent(rec.fields);
  const raw = asText(rec.raw_text);
  const tl = terms.length;
  const th = countHits(title, terms);
  const gh = countHits(tagStr, terms);
  const shi = countHits(rec.fields["事情"] || "", terms);
  const guo = countHits(rec.fields["结果"] || "", terms);
  const zhong = countHits(rec.fields["重点"] || "", terms);
  const yin = countHits(rec.fields["原因"] || "", terms);
  const others =
    countHits(rec.fields["时间"] || "", terms) +
    countHits(rec.fields["地点"] || "", terms) +
    countHits(rec.fields["人物"] || "", terms);
  const ch = countHits(content, terms);
  const rh = countHits(raw, terms);
  const hit = th + gh + ch + rh + shi + guo + zhong + yin + others;
  if (!hit) return 0;
  let score =
    th * 3 +
    gh * 3 +
    shi * 2.5 +
    (guo + zhong) * 2 +
    yin * 1.5 +
    others * 1 +
    rh * 1;
  if (th === tl) score += 5;
  score += (rec.rating || 3) * 0.15;
  score += proxBonus(content, terms);
  if (rec.kind === "range") score *= 0.7;
  return score;
}

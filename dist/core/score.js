// score.ts — BM25-lite 检索打分：字段加权 + IDF + 长度归一
// 为什么不只用命中计数：常见词（今天/问题）会与关键词同权，长记录会靠词多压过短精准记录。
import { proxBonus } from "./tokenize.js";
import { deriveTitleFromFields } from "./title.js";
import { asText } from "./text.js";
import { GENERAL_PROFILE } from "../store/profiles.js";
const K1 = 1.2; // 词频饱和
const B = 0.75; // 长度归一强度
// 标题由 title_field 派生，与字段正文是同一段文字——单独计分会把该字段算两遍。
// 实测（eval v2，58 记录 / 83 查询）：去掉标题计分后 keyword MRR 0.901→0.966。
const TAG_W = 3;
const RAW_W = 1;
function countOcc(hay, needle) {
    if (!hay || !needle)
        return 0;
    let n = 0;
    let i = hay.indexOf(needle);
    while (i >= 0) {
        n++;
        i = hay.indexOf(needle, i + needle.length);
    }
    return n;
}
/** 把一条记录展开成小写文本（一次展开，供 df 统计与打分复用） */
export function docTexts(rec, profile) {
    const fields = {};
    for (const f of profile.fields)
        fields[f.key] = asText(rec.fields[f.key] || "").toLowerCase();
    return {
        rec,
        profile,
        title: deriveTitleFromFields(rec.fields, rec.raw_text, profile).toLowerCase(),
        tags: (rec.tags || []).join(" ").toLowerCase(),
        raw: asText(rec.raw_text).toLowerCase(),
        fields,
    };
}
export function buildCorpus(docs, terms) {
    const df = new Map();
    const sum = {};
    for (const d of docs) {
        // 逐段检查，避免把一条记录拼成一个大字符串（省一次分配与拷贝）
        for (const t of terms) {
            if (d.title.indexOf(t) >= 0 || d.tags.indexOf(t) >= 0 || d.raw.indexOf(t) >= 0) {
                df.set(t, (df.get(t) || 0) + 1);
                continue;
            }
            for (const f of d.profile.fields) {
                if ((d.fields[f.key] || "").indexOf(t) >= 0) {
                    df.set(t, (df.get(t) || 0) + 1);
                    break;
                }
            }
        }
        sum.__tags = (sum.__tags || 0) + d.tags.length;
        sum.__raw = (sum.__raw || 0) + d.raw.length;
        for (const f of d.profile.fields)
            sum[f.key] = (sum[f.key] || 0) + (d.fields[f.key] || "").length;
    }
    const n = docs.length || 1;
    const avg = {};
    for (const [k, v] of Object.entries(sum))
        avg[k] = Math.max(1, v / n);
    return { n: docs.length, df, avg };
}
function idf(term, c) {
    const df = c.df.get(term) || 0;
    return Math.log(1 + (c.n - df + 0.5) / (df + 0.5));
}
function termIn(term, text, avgLen, weight, c) {
    const tf = countOcc(text, term);
    if (!tf)
        return 0;
    const norm = 1 - B + B * (text.length / (avgLen || 1));
    const sat = (tf * (K1 + 1)) / (tf + K1 * norm);
    return weight * idf(term, c) * sat;
}
export function scoreDoc(d, terms, corpus, out) {
    if (!terms.length)
        return 0;
    let score = 0;
    let matched = 0;
    const label = (key) => d.profile.fields.find(f => f.key === key)?.label || key;
    for (const t of terms) {
        let hit = 0;
        const bump = (field, weight, text, avgLen) => {
            const c = termIn(t, text, avgLen, weight, corpus);
            if (!c)
                return;
            hit += c;
            if (out)
                out.push({ term: t, field, weight, tf: countOcc(text, t), contribution: Math.round(c * 100) / 100 });
        };
        bump("标签", TAG_W, d.tags, corpus.avg.__tags || 1);
        for (const f of d.profile.fields)
            bump(label(f.key), f.weight, d.fields[f.key] || "", corpus.avg[f.key] || 1);
        bump("原文", RAW_W, d.raw, corpus.avg.__raw || 1);
        if (hit > 0)
            matched++;
        score += hit;
    }
    if (!matched)
        return 0;
    // 覆盖全部查询词：小幅加成，不压倒单字段高分
    if (matched === terms.length)
        score += 4;
    score += (d.rec.rating || 3) * 0.15;
    // 邻近加成只看摘要字段（比拼全部字段便宜，且更贴近「这句话在讲什么」）
    score += proxBonus(d.fields[d.profile.excerpt_field] || d.title, terms);
    if (d.rec.kind === "range")
        score *= 0.7;
    return score;
}
/** 单条打分（无语料上下文时的退化路径：IDF 近似均匀） */
export function scoreRecord(rec, terms, profile = GENERAL_PROFILE) {
    const d = docTexts(rec, profile);
    return scoreDoc(d, terms, buildCorpus([d], terms));
}

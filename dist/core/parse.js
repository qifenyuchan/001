// parse.ts — 七字段解析族（自 turn_memory 内核裁剪：只保留读路径，删除摘要块捕获/think 剥离）
import { asText } from "./text.js";
const FACTS_RE = /事：([\s\S]*?)｜\s*人：([\s\S]*?)｜\s*果：([\s\S]*)$/;
export const SEVEN_FIELDS = ["时间", "地点", "人物", "事情", "原因", "结果", "重点"];
// 七字段解析（读时派生零写盘）。返回 {body, fields}；fields 为 null 表示不是七字段文本。
export function parseSevenFields(content) {
    const c = asText(content);
    if (!c)
        return { body: "", fields: null };
    const marker = "时间：";
    let idx = -1;
    let startIdx = -1;
    while ((idx = c.indexOf(marker, idx + 1)) !== -1) {
        const segs = c.slice(idx).split(/[｜\n]/);
        const fields = {};
        let found = 0;
        for (const seg of segs) {
            const m = seg.trim().match(/^(时间|地点|人物|事情|原因|结果|重点)：(.*)$/);
            if (m) {
                fields[m[1]] = m[2].trim();
                found++;
            }
        }
        if (found >= 3) {
            startIdx = idx;
            break;
        }
    }
    if (startIdx === -1)
        return { body: c, fields: null };
    const body = c.slice(0, startIdx).replace(/[｜\s]+$/, "").trim();
    const segs2 = c.slice(startIdx).split(/[｜\n]/);
    const fields2 = {};
    let found2 = 0;
    for (const seg of segs2) {
        const m = seg.trim().match(/^(时间|地点|人物|事情|原因|结果|重点)：(.*)$/);
        if (m) {
            fields2[m[1]] = m[2].trim();
            found2++;
        }
    }
    if (found2 < 3)
        return { body: c, fields: null };
    return { body, fields: fields2 };
}
// 多行七字段 → {shi,ren,guo} 或 null（<3 字段行/核心残缺 → null）
export function parseSevenFacts(c) {
    const lines = asText(c).split("\n");
    const f = {};
    let hit = 0;
    for (const raw of lines) {
        const ln = raw.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
        for (const key of SEVEN_FIELDS) {
            const pre = key + "：";
            if (ln.indexOf(pre) === 0) {
                f[key] = ln.slice(pre.length).replace(/[ \t]+$/, "");
                hit++;
                break;
            }
        }
    }
    if (hit < 3)
        return null;
    const shi = asText(f["事情"]).trim();
    let ren = asText(f["人物"]).trim();
    const guo = asText(f["结果"]).trim();
    if (shi.length < 2 || shi === "无" || shi === "-")
        return null;
    if (guo.length < 2 || guo === "无" || guo === "-")
        return null;
    if (ren === "" || ren === "-")
        ren = "无";
    return { shi, ren, guo };
}
// 从 content 派生三段（多行七字段 → 单行三段 → 单行｜七字段）
export function parseSummaryFacts(content) {
    const c = asText(content);
    if (c.indexOf("\n") !== -1) {
        const s7 = parseSevenFacts(c);
        if (s7)
            return s7;
    }
    if (c.indexOf("事：") !== -1) {
        const m = FACTS_RE.exec(c);
        if (m) {
            const g = [m[1].trim(), m[2].trim(), m[3].trim()];
            let short = false;
            for (const item of g) {
                if (item.length < 2 || item === "-") {
                    short = true;
                    break;
                }
            }
            if (!short)
                return { shi: g[0], ren: g[1], guo: g[2] };
        }
    }
    const pf = parseSevenFields(c);
    if (pf && pf.fields) {
        const fs7 = pf.fields;
        const tShi = asText(fs7["事情"]).trim();
        const tRen = asText(fs7["人物"]).trim();
        const tGuo = asText(fs7["结果"]).trim();
        if (tShi.length >= 2 && tShi !== "无" && tShi !== "-" && tGuo.length >= 2 && tGuo !== "无" && tGuo !== "-") {
            return { shi: tShi, ren: tRen === "" || tRen === "-" ? "无" : tRen, guo: tGuo };
        }
    }
    return null;
}

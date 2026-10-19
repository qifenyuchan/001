// tokenize.ts — 分词/命中/邻近族（自 turn_memory 内核原样保留）
import { asText } from "./text.js";
export function tokenize(q) {
    const raw = asText(q).toLowerCase().trim();
    if (!raw)
        return [];
    const coarse = raw
        .split(/[\s,，。;；:：!！?？、()（）\[\]【】"'`~@#$%^&*+=<>|/\\]+/)
        .filter(Boolean);
    const set = {};
    const terms = [];
    function push(t) {
        t = t.trim();
        if (t && !set[t]) {
            set[t] = 1;
            terms.push(t);
        }
    }
    for (const tk of coarse) {
        push(tk);
        const cjk = tk.match(/[\u4e00-\u9fff]+/g);
        if (cjk) {
            for (const seg of cjk) {
                if (seg.length >= 2) {
                    for (let k = 0; k + 1 < seg.length; k++)
                        push(seg.slice(k, k + 2));
                }
            }
        }
    }
    return terms;
}
export function countHits(hay, terms) {
    let n = 0;
    const h = asText(hay).toLowerCase();
    for (const t of terms) {
        if (h.indexOf(t) >= 0)
            n++;
    }
    return n;
}
// 滑窗找覆盖≥2个不同 term 的最小窗，gap 越小加分越高（上限 4，单 term 不加）
export function proxBonus(content, terms) {
    if (!content || !terms || terms.length < 2)
        return 0;
    const text = String(content);
    const all = [];
    for (let ti = 0; ti < terms.length && ti < 8; ti++) {
        let pos = -1;
        for (;;) {
            pos = text.indexOf(terms[ti], pos + 1);
            if (pos === -1)
                break;
            all.push([pos, ti]);
        }
    }
    if (all.length < 2)
        return 0;
    all.sort((a, b) => a[0] - b[0]);
    let best = 1e9;
    for (let i = 1; i < all.length; i++) {
        if (all[i][1] !== all[i - 1][1]) {
            const g = all[i][0] - all[i - 1][0];
            if (g < best)
                best = g;
        }
    }
    if (best > 80)
        return 0;
    return best <= 6 ? 4 : best <= 20 ? 2.5 : best <= 45 ? 1.5 : 0.5;
}

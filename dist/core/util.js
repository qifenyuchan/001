// util.ts — 标识/标签/时间格式化等纯逻辑
import { asText } from "./text.js";
export function genId() {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 6);
    return `tm_${ts}_${rand}`;
}
// 会话键清洗：小写、仅 [a-z0-9_-]、最长 48、空则 default
export function sanitizeKey(v) {
    const raw = asText(v).trim().toLowerCase();
    const cleaned = raw.replace(/[^a-z0-9_-]/g, "").slice(0, 48);
    return cleaned || "default";
}
export function normTags(v) {
    const out = [];
    if (Array.isArray(v)) {
        for (const item of v) {
            const t = asText(item).trim();
            if (t && out.indexOf(t) === -1)
                out.push(t.slice(0, 16));
        }
    }
    return out.slice(0, 4);
}
export function fmtDay(ts) {
    try {
        const d = new Date(Number(ts));
        return ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    }
    catch {
        return "??-??";
    }
}
export function fmtDateTime(ts) {
    try {
        const d = new Date(Number(ts));
        const p = (n) => ("0" + n).slice(-2);
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    catch {
        return "????-??-?? ??:??";
    }
}
export function today() {
    const d = new Date();
    const p = (n) => ("0" + n).slice(-2);
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function clampInt(v, min, max, fallback) {
    const n = Number(v);
    if (!isFinite(n))
        return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
}

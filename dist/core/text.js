// text.ts — 文本基础叶子（自 turn_memory 内核裁剪）
export function asText(v) {
    return v == null ? "" : String(v);
}
export const NL = "\n";
// 三窗截断：仅保留头 head + 尾 tail（中间用标记替代）
export function truncateWindow(text, head, tail) {
    const t = asText(text);
    if (t.length <= head + tail + 24)
        return t;
    return t.slice(0, head) + NL + "…〔truncated:" + (t.length - head - tail) + "〕…" + NL + t.slice(-tail);
}
// 代理对安全截断（截断点落在 UTF-16 高代理中间会产 \uFFFD）
export function safeSlice(str, maxLen) {
    if (str.length <= maxLen)
        return str;
    const hi = str.charCodeAt(maxLen - 1);
    if (hi >= 0xd800 && hi <= 0xdbff)
        return str.slice(0, maxLen - 1);
    return str.slice(0, maxLen);
}
export function num(v) {
    const n = Number(v);
    return isFinite(n) ? n : 0;
}

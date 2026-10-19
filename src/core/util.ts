// util.ts — 标识/标签/时间格式化等纯逻辑
import crypto from "node:crypto";
import { asText } from "./text.js";

export function genId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `tm_${ts}_${rand}`;
}

// 会话键清洗：小写 + 仅 [a-z0-9_-]；有损清洗或截断时追加原始 id 短哈希，避免不同会话碰撞
export function sanitizeKey(v: unknown): string {
  const raw = asText(v).trim();
  if (!raw) return "default";
  const lower = raw.toLowerCase();
  const cleaned = lower.replace(/[^a-z0-9_-]/g, "").slice(0, 48) || "default";
  if (raw === lower && cleaned === lower && raw.length <= 48) return cleaned;
  const hash = crypto.createHash("sha1").update(raw, "utf8").digest("hex").slice(0, 6);
  return `${cleaned}-${hash}`;
}

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
export function isSafeId(v: unknown): boolean {
  return SAFE_ID_RE.test(asText(v));
}

export function normTags(v: unknown): string[] {
  const out: string[] = [];
  if (Array.isArray(v)) {
    for (const item of v) {
      const t = asText(item).trim();
      if (t && out.indexOf(t) === -1) out.push(t.slice(0, 16));
    }
  }
  return out.slice(0, 4);
}

export function fmtDay(ts: unknown): string {
  try {
    const d = new Date(Number(ts));
    return ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  } catch {
    return "??-??";
  }
}

export function fmtDateTime(ts: unknown): string {
  try {
    const d = new Date(Number(ts));
    const p = (n: number) => ("0" + n).slice(-2);
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch {
    return "????-??-?? ??:??";
  }
}

export function today(): string {
  const d = new Date();
  const p = (n: number) => ("0" + n).slice(-2);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

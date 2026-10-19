// schema.ts — 七字段归一 / 质量评估 / 记录构造（唯一记录形状真源）

import type { MemoryRecord, Quality, RangeMeta, SaveInput, SevenFields, SevenKey } from "../core/types.js";
import { SEVEN_FIELD_KEYS } from "../core/types.js";
import { parseSevenFields } from "../core/parse.js";
import { safeSlice, truncateWindow } from "../core/text.js";
import { deriveTags } from "../core/title.js";
import { genId, normTags, sanitizeKey, today } from "../core/util.js";
import { NorthstarError } from "../core/types.js";

const ALIASES: Record<string, SevenKey> = {
  时间: "时间", time: "时间", date: "时间", when: "时间",
  地点: "地点", place: "地点", location: "地点", where: "地点",
  人物: "人物", people: "人物", person: "人物", who: "人物", actor: "人物",
  事情: "事情", event: "事情", thing: "事情", what: "事情", matter: "事情",
  原因: "原因", cause: "原因", why: "原因", reason: "原因",
  结果: "结果", result: "结果", outcome: "结果", effect: "结果",
  重点: "重点", keypoint: "重点", key_point: "重点", key: "重点", highlight: "重点", important: "重点",
};

export function blankFields(): SevenFields {
  return {
    时间: "",
    地点: "",
    人物: "",
    事情: "",
    原因: "",
    结果: "",
    重点: "",
  };
}

export function normalizeFields(input: Record<string, unknown> | null | undefined): SevenFields {
  const out = blankFields();
  if (!input) return out;
  for (const [rawKey, rawVal] of Object.entries(input)) {
    const k = ALIASES[String(rawKey).trim().toLowerCase()] || ALIASES[String(rawKey).trim()];
    if (!k) continue;
    const v = rawVal == null ? "" : String(rawVal).replace(/\r\n/g, "\n").trim();
    if (v) out[k] = v;
  }
  return out;
}

// 只映射“传入的键”（不补齐空值），用于编辑时的局部更新
export function partialFields(input: Record<string, unknown> | null | undefined): Partial<SevenFields> {
  const out: Partial<SevenFields> = {};
  if (!input) return out;
  for (const [rawKey, rawVal] of Object.entries(input)) {
    const k = ALIASES[String(rawKey).trim().toLowerCase()] || ALIASES[String(rawKey).trim()];
    if (!k) continue;
    out[k] = rawVal == null ? "" : String(rawVal).replace(/\r\n/g, "\n").trim();
  }
  return out;
}

export function fieldsToContent(f: SevenFields): string {
  return SEVEN_FIELD_KEYS.map(k => `${k}：${f[k] || ""}`).join("\n");
}

export function contentToFields(content: string): SevenFields {
  const parsed = parseSevenFields(content);
  const out = blankFields();
  if (parsed.fields) {
    for (const k of SEVEN_FIELD_KEYS) out[k] = String(parsed.fields[k] || "").trim();
  }
  return out;
}

export function isNoneValue(v: string): boolean {
  const s = (v || "").trim().toLowerCase();
  return s === "无" || s === "-" || s === "—" || s === "" || s === "none" || s === "n/a";
}

export function assess(fields: SevenFields, qualityHint?: Quality): { missing: SevenKey[]; blank: SevenKey[]; quality: Quality } {
  const missing = SEVEN_FIELD_KEYS.filter(k => !(fields[k] || "").trim());
  const blank = SEVEN_FIELD_KEYS.filter(k => isNoneValue(fields[k]) && !!(fields[k] || "").trim());
  const coreOk = !!(fields["事情"] || "").trim() && !(fields["结果"] || "").trim().toLowerCase().startsWith("…");
  let quality: Quality;
  if (qualityHint === "degraded") quality = "degraded";
  else if (!coreOk) quality = "degraded";
  else if (missing.length > 0) quality = "partial";
  else quality = "complete";
  return { missing, blank, quality };
}

// 只给 raw 时的骨架：时间=今天，地点/人物/原因=无，事情=首句，结果/重点=截取
export function buildSkeleton(raw: string, nowMs: number): SevenFields {
  const clean = raw.replace(/\s+/g, " ").trim();
  const firstCut = clean.search(/[。！？!?；;]/);
  const shi = firstCut > 0 ? clean.slice(0, firstCut) : clean;
  return {
    时间: today(),
    地点: "无",
    人物: "无",
    事情: safeSlice(shi, 60) || "未命名轮次",
    原因: "无",
    结果: safeSlice(clean, 120) || "（原文已归档）",
    重点: safeSlice(clean, 80) || "无",
  };
}

function windowRaw(raw: string, head: number, tail: number): { text: string; truncated: boolean } {
  if (!raw) return { text: "", truncated: false };
  if (raw.length <= head + tail + 24) return { text: raw, truncated: false };
  return { text: truncateWindow(raw, head, tail), truncated: true };
}

export interface BuildOpts {
  nowMs: number;
  rawHead: number;
  rawTail: number;
  sessionKeyOverride?: string;
  sourceDefault?: string;
}

export function buildTurn(input: SaveInput, opts: BuildOpts, existing?: MemoryRecord): MemoryRecord {
  const sessionId = String(input.session_id || "").trim() || "default";
  const sessionKey = opts.sessionKeyOverride || sanitizeKey(sessionId);
  const explicit = normalizeFields(input.fields || null);
  let fields = explicit;
  if (input.content != null && String(input.content).trim()) {
    const fromContent = contentToFields(String(input.content));
    // content 为底，显式 fields 覆盖非空项
    for (const k of SEVEN_FIELD_KEYS) {
      if (!fields[k] && fromContent[k]) fields[k] = fromContent[k];
    }
  }
  const rawIn = String(input.raw_text ?? "");
  const { text: rawText, truncated: rawTruncated } = windowRaw(rawIn, opts.rawHead, opts.rawTail);
  let qualityHint: Quality | undefined;
  const hasAnyField = SEVEN_FIELD_KEYS.some(k => (fields[k] || "").trim());
  if (!hasAnyField && rawText.trim()) {
    fields = buildSkeleton(rawText, opts.nowMs);
    qualityHint = "degraded";
  }
  const { missing, blank, quality } = assess(fields, qualityHint);
  const contentForTags = fieldsToContent(fields) + "\n" + rawText.slice(0, 500);
  const tags = normTags(input.tags && input.tags.length ? input.tags : deriveTags(contentForTags));
  const ratingRaw = Number(input.rating);
  const rating = isFinite(ratingRaw) ? Math.max(1, Math.min(5, Math.floor(ratingRaw))) : 3;

  const now = opts.nowMs;
  return {
    schema: 1,
    id: existing ? existing.id : genId(),
    kind: "turn",
    session_id: sessionId,
    session_key: sessionKey,
    turn_no: existing ? existing.turn_no : Number(input.turn_no) || 1,
    created_at: existing ? existing.created_at : now,
    updated_at: now,
    revision: existing ? existing.revision + 1 : 1,
    fields,
    raw_text: rawText,
    raw_truncated: rawTruncated,
    truncated: !!input.truncated,
    missing,
    blank,
    quality,
    tags,
    rating,
    source: String(input.source || opts.sourceDefault || "agent"),
    origin: existing ? existing.origin : "native",
    legacy: existing ? existing.legacy : undefined,
  };
}

export function buildRange(input: SaveInput, opts: BuildOpts, existing?: MemoryRecord): MemoryRecord {
  const from = Math.max(1, Math.floor(Number(input.range_from) || 0));
  const to = Math.max(from, Math.floor(Number(input.range_to) || 0));
  if (!from || !to) throw new NorthstarError("INVALID_ARG", "range_from/range_to required for kind=range");
  const base = buildTurn({ ...input, turn_no: to }, opts, existing);
  const covers = Array.isArray(input.covers) ? input.covers.map(x => String(x)) : [];
  const range: RangeMeta = { from, to, covers, unresolved: [] };
  return {
    ...base,
    kind: "range",
    turn_no: to,
    range,
    auto: input.source === "auto-range",
    source: String(input.source || opts.sourceDefault || "agent"),
  };
}

export function recordFileName(rec: MemoryRecord): string {
  if (rec.kind === "range" && rec.range) {
    return `range-${String(rec.range.from).padStart(4, "0")}-${String(rec.range.to).padStart(4, "0")}.json`;
  }
  return `turn-${String(rec.turn_no).padStart(4, "0")}.json`;
}

export function ensureRecordShape(value: unknown): MemoryRecord | null {
  const v = value as Partial<MemoryRecord> | null;
  if (!v || typeof v !== "object") return null;
  if (v.schema !== 1 || !v.id || !v.session_key || !v.fields || (v.kind !== "turn" && v.kind !== "range")) return null;
  return v as MemoryRecord;
}

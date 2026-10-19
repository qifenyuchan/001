// schema.ts — 七字段归一 / 质量评估 / 记录构造（唯一记录形状真源）

import type { MemoryRecord, Quality, RangeMeta, SaveInput, SevenFields, SevenKey } from "../core/types.js";
import { SEVEN_FIELD_KEYS } from "../core/types.js";
import { parseSevenFields } from "../core/parse.js";
import { safeSlice, truncateWindow } from "../core/text.js";
import { deriveTags } from "../core/title.js";
import { genId, normTags, sanitizeKey, today, isSafeId } from "../core/util.js";
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
  deviceId: string;
  spaceId: string;
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
  let hasAnyField = SEVEN_FIELD_KEYS.some(k => (fields[k] || "").trim());
  // P1-3：已有记录只重存 raw（截断兜底）时，保留原七字段，不能用骨架覆盖
  if (!hasAnyField && existing && !(input.content && String(input.content).trim())) {
    fields = { ...existing.fields };
    hasAnyField = SEVEN_FIELD_KEYS.some(k => (fields[k] || "").trim());
  }
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
  const turnNo = existing ? existing.turn_no : Number(input.turn_no) || 1;
  if (!Number.isSafeInteger(turnNo) || turnNo < 1 || turnNo > 1000000) {
    throw new NorthstarError("INVALID_ARG", `turn_no must be an integer in [1, 1000000], got ${input.turn_no}`);
  }
  // 字段级同步元数据：仅记录发生变化的字段，冲突合并时按 ts/by 决胜
  const fieldMeta: Record<string, { ts: number; by: string }> = { ...(existing && existing.field_meta ? existing.field_meta : {}) };
  for (const k of SEVEN_FIELD_KEYS) {
    const prev = existing ? existing.fields[k] || "" : null;
    if (prev === null || prev !== (fields[k] || "")) fieldMeta[k] = { ts: now, by: opts.deviceId };
  }
  if (!existing || (existing.raw_text || "") !== rawText) fieldMeta["raw_text"] = { ts: now, by: opts.deviceId };

  return {
    schema: 1,
    id: existing ? existing.id : genId(),
    kind: "turn",
    space_id: existing ? existing.space_id : opts.spaceId,
    session_id: sessionId,
    session_key: sessionKey,
    turn_no: turnNo,
    created_at: existing ? existing.created_at : now,
    updated_at: now,
    revision: existing ? existing.revision + 1 : 1,
    updated_by: opts.deviceId,
    field_meta: fieldMeta,
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
  if (v.schema !== 1 || !v.fields || (v.kind !== "turn" && v.kind !== "range")) return null;
  if (!isSafeId(v.id) || !isSafeId(v.session_key)) return null;
  const turnNo = Number(v.turn_no);
  if (!Number.isSafeInteger(turnNo) || turnNo < 1 || turnNo > 1000000) return null;
  // 类型归一：手工修改/同步冲突可能带来脏类型，归一后再进内存
  const fields = blankFields();
  for (const k of SEVEN_FIELD_KEYS) {
    const fv = (v.fields as Record<string, unknown>)[k];
    fields[k] = fv == null ? "" : String(fv);
  }
  const rec = v as MemoryRecord;
  rec.fields = fields;
  rec.turn_no = turnNo;
  rec.revision = Number.isSafeInteger(Number(rec.revision)) && Number(rec.revision) >= 1 ? Number(rec.revision) : 1;
  rec.tags = Array.isArray(rec.tags) ? rec.tags.map(x => String(x)).slice(0, 8) : [];
  rec.raw_text = rec.raw_text == null ? "" : String(rec.raw_text);
  rec.created_at = Number.isFinite(Number(rec.created_at)) ? Number(rec.created_at) : Date.now();
  rec.updated_at = Number.isFinite(Number(rec.updated_at)) ? Number(rec.updated_at) : rec.created_at;
  rec.updated_by = rec.updated_by ? String(rec.updated_by) : "legacy";
  rec.space_id = rec.space_id ? String(rec.space_id) : "personal";
  if (rec.kind === "range") {
    const r = rec.range;
    const from = Number(r && r.from);
    const to = Number(r && r.to);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 1 || to < from || to > 1000000) return null;
    rec.range = {
      from,
      to,
      covers: Array.isArray(r && r.covers) ? (r as any).covers.map((x: unknown) => String(x)) : [],
      unresolved: Array.isArray(r && (r as any).unresolved) ? (r as any).unresolved.map((x: unknown) => String(x)) : [],
    };
  }
  const a = assess(fields);
  rec.missing = a.missing;
  rec.blank = a.blank;
  if (!rec.quality) rec.quality = a.quality;
  return rec;
}

export const CANONICAL_TURN_RE = /^turn-\d{4,}\.json$/;
export const CANONICAL_RANGE_RE = /^range-\d{4,}-\d{4,}\.json$/;

export function isCanonicalRecordFile(name: string): boolean {
  return CANONICAL_TURN_RE.test(name) || CANONICAL_RANGE_RE.test(name);
}

export function isConflictCandidate(name: string): boolean {
  if (name === "_meta.json" || name.startsWith(".")) return false;
  if (isCanonicalRecordFile(name)) return false;
  return /^(turn-\d{4,}|range-\d{4,}-\d{4,}).*\.json$/i.test(name);
}

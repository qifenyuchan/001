// schema.ts — 字段方案驱动（general 内置，work/story 可安装）/ 质量评估 / 记录构造

import type { MemoryRecord, Quality, RangeMeta, SaveInput, SevenFields } from "../core/types.js";
import { NorthstarError, SEVEN_FIELD_KEYS } from "../core/types.js";
import { safeSlice, truncateWindow } from "../core/text.js";
import { deriveTags } from "../core/title.js";
import { genId, normTags, sanitizeKey, today, isSafeId, isSafeKey } from "../core/util.js";
import { GENERAL_PROFILE, profileFieldKeys, type Profile } from "./profiles.js";

const ALIASES: Record<string, string> = {
  时间: "时间", time: "时间", date: "时间", when: "时间",
  地点: "地点", place: "地点", location: "地点", where: "地点",
  人物: "人物", people: "人物", person: "人物", who: "人物", actor: "人物",
  事情: "事情", event: "事情", thing: "事情", what: "事情", matter: "事情",
  原因: "原因", cause: "原因", why: "原因", reason: "原因",
  结果: "结果", result: "结果", outcome: "结果", effect: "结果",
  重点: "重点", keypoint: "重点", key_point: "重点", key: "重点", highlight: "重点", important: "重点",
};

const FIELD_KEY_RE = /^[\p{L}\p{N}_-]{1,24}$/u;

export function blankFields(profile: Profile = GENERAL_PROFILE): SevenFields {
  const out: SevenFields = {};
  for (const f of profile.fields) out[f.key] = "";
  return out;
}

function keyFor(rawKey: unknown, profile: Profile): string | undefined {
  const s = String(rawKey == null ? "" : rawKey).trim();
  if (!s) return undefined;
  if (profile.fields.some(f => f.key === s)) return s;
  const byLabel = profile.fields.find(f => f.label === s);
  if (byLabel) return byLabel.key;
  if (profile.id === "general") return ALIASES[s.toLowerCase()] || ALIASES[s];
  return undefined;
}

export function normalizeFields(input: Record<string, unknown> | null | undefined, profile: Profile = GENERAL_PROFILE): SevenFields {
  const out = blankFields(profile);
  if (!input) return out;
  for (const [rawKey, rawVal] of Object.entries(input)) {
    const k = keyFor(rawKey, profile);
    if (!k) continue;
    const v = rawVal == null ? "" : String(rawVal).replace(/\r\n/g, "\n").trim();
    if (v) out[k] = v;
  }
  return out;
}

// 只映射“传入的键”（不补齐空值），用于编辑时的局部更新
export function partialFields(input: Record<string, unknown> | null | undefined, profile: Profile = GENERAL_PROFILE): Partial<SevenFields> {
  const out: Partial<SevenFields> = {};
  if (!input) return out;
  for (const [rawKey, rawVal] of Object.entries(input)) {
    const k = keyFor(rawKey, profile);
    if (!k) continue;
    out[k] = rawVal == null ? "" : String(rawVal).replace(/\r\n/g, "\n").trim();
  }
  return out;
}

export function fieldsToContent(f: SevenFields, profile: Profile = GENERAL_PROFILE): string {
  return profile.fields.map(x => `${x.key}：${f[x.key] || ""}`).join("\n");
}

export function contentToFields(content: string, profile: Profile = GENERAL_PROFILE): SevenFields {
  const out = blankFields(profile);
  const text = String(content || "");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([^：:]{1,24})[：:]([\s\S]*)$/);
    if (!m) continue;
    const k = keyFor(m[1], profile);
    if (k) out[k] = m[2].trim();
  }
  return out;
}

export function isNoneValue(v: string): boolean {
  const s = (v || "").trim().toLowerCase();
  return s === "无" || s === "-" || s === "—" || s === "" || s === "none" || s === "n/a";
}

// 兼容旧调用：assess(fields, qualityHint)
export function assess(fields: SevenFields, qualityHint?: Quality, profile: Profile = GENERAL_PROFILE): { missing: string[]; blank: string[]; quality: Quality } {
  const keys = profileFieldKeys(profile);
  const missing = keys.filter(k => !(fields[k] || "").trim());
  const blank = keys.filter(k => isNoneValue(fields[k]) && !!(fields[k] || "").trim());
  let quality: Quality;
  if (qualityHint === "degraded") {
    quality = "degraded";
  } else if (profile.id === "general") {
    const coreOk = !!(fields["事情"] || "").trim() && !(fields["结果"] || "").trim().toLowerCase().startsWith("…");
    if (!coreOk) quality = "degraded";
    else if (missing.length > 0) quality = "partial";
    else quality = "complete";
  } else {
    const required = profile.fields.filter(f => f.required).map(f => f.key);
    const hasAny = keys.some(k => (fields[k] || "").trim());
    if (!hasAny) quality = "degraded";
    else if (required.some(k => !(fields[k] || "").trim())) quality = "partial";
    else quality = "complete";
  }
  return { missing, blank, quality };
}

export function assessFor(fields: SevenFields, profile: Profile, qualityHint?: Quality) {
  return assess(fields, qualityHint, profile);
}

// 只给 raw 时的骨架：general 保持旧的兜底形状；其他 profile 填标题与摘要字段
export function buildSkeleton(raw: string, nowMs: number, profile: Profile = GENERAL_PROFILE): SevenFields {
  const clean = raw.replace(/\s+/g, " ").trim();
  const out = blankFields(profile);
  if (profile.id === "general") {
    const firstCut = clean.search(/[。！？!?；;]/);
    const shi = firstCut > 0 ? clean.slice(0, firstCut) : clean;
    out["时间"] = today();
    out["地点"] = "无";
    out["人物"] = "无";
    out["事情"] = safeSlice(shi, 60) || "未命名轮次";
    out["原因"] = "无";
    out["结果"] = safeSlice(clean, 120) || "（原文已归档）";
    out["重点"] = safeSlice(clean, 80) || "无";
    return out;
  }
  if (profile.fields.some(f => f.key === "时间")) out["时间"] = today();
  const firstCut = clean.search(/[。！？!?；;]/);
  out[profile.title_field] = safeSlice(firstCut > 0 ? clean.slice(0, firstCut) : clean, 60) || "未命名轮次";
  out[profile.excerpt_field] = safeSlice(clean, 120) || "（原文已归档）";
  return out;
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
  profile?: Profile;
}

export function buildTurn(input: SaveInput, opts: BuildOpts, existing?: MemoryRecord): MemoryRecord {
  const profile = opts.profile || GENERAL_PROFILE;
  if (existing && existing.profile && existing.profile !== profile.id) {
    throw new NorthstarError("CONFLICT", `profile cannot change on the same turn (${existing.profile} -> ${profile.id})`);
  }
  const sessionId = String(input.session_id || "").trim() || "default";
  const sessionKey = opts.sessionKeyOverride || sanitizeKey(sessionId);
  const explicit = normalizeFields(input.fields || null, profile);
  let fields = explicit;
  if (input.content != null && String(input.content).trim()) {
    const fromContent = contentToFields(String(input.content), profile);
    for (const k of profileFieldKeys(profile)) {
      if (!fields[k] && fromContent[k]) fields[k] = fromContent[k];
    }
  }
  const rawIn = String(input.raw_text ?? "");
  const { text: rawText, truncated: rawTruncated } = windowRaw(rawIn, opts.rawHead, opts.rawTail);
  let qualityHint: Quality | undefined;
  const keys = profileFieldKeys(profile);
  let hasAnyField = keys.some(k => (fields[k] || "").trim());
  // 已有记录只重存 raw（截断兜底）时，保留原字段
  if (!hasAnyField && existing && !(input.content && String(input.content).trim())) {
    fields = { ...existing.fields };
    hasAnyField = keys.some(k => (fields[k] || "").trim());
  }
  if (!hasAnyField && rawText.trim()) {
    fields = buildSkeleton(rawText, opts.nowMs, profile);
    qualityHint = "degraded";
  }
  const { missing, blank, quality } = assess(fields, qualityHint, profile);
  const contentForTags = fieldsToContent(fields, profile) + "\n" + rawText.slice(0, 500);
  const tags = normTags(input.tags && input.tags.length ? input.tags : deriveTags(contentForTags));
  const ratingRaw = Number(input.rating);
  const rating = isFinite(ratingRaw) ? Math.max(1, Math.min(5, Math.floor(ratingRaw))) : 3;

  const now = opts.nowMs;
  const turnNo = existing ? existing.turn_no : Number(input.turn_no) || 1;
  if (!Number.isSafeInteger(turnNo) || turnNo < 1 || turnNo > 1000000) {
    throw new NorthstarError("INVALID_ARG", `turn_no must be an integer in [1, 1000000], got ${input.turn_no}`);
  }
  const fieldMeta: Record<string, { ts: number; by: string }> = { ...(existing && existing.field_meta ? existing.field_meta : {}) };
  for (const k of keys) {
    const prev = existing ? existing.fields[k] || "" : null;
    if (prev === null || prev !== (fields[k] || "")) fieldMeta[k] = { ts: now, by: opts.deviceId };
  }
  if (!existing || (existing.raw_text || "") !== rawText) fieldMeta["raw_text"] = { ts: now, by: opts.deviceId };

  return {
    schema: 1,
    id: existing ? existing.id : genId(),
    kind: "turn",
    profile: existing ? existing.profile : profile.id,
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
  if (!isSafeId(v.id) || !isSafeKey(v.session_key)) return null;
  const turnNo = Number(v.turn_no);
  if (!Number.isSafeInteger(turnNo) || turnNo < 1 || turnNo > 1000000) return null;
  const profile = typeof v.profile === "string" && /^[a-z0-9_-]{1,32}$/.test(v.profile) ? v.profile : "general";
  const fields: SevenFields = {};
  for (const [k, val] of Object.entries(v.fields as Record<string, unknown>)) {
    if (!FIELD_KEY_RE.test(k)) continue;
    fields[k] = val == null ? "" : String(val).slice(0, 4000);
  }
  if (profile === "general") for (const k of SEVEN_FIELD_KEYS) if (!(k in fields)) fields[k] = "";
  const rec = v as MemoryRecord;
  rec.profile = profile;
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
  if (profile === "general") {
    const a = assess(fields);
    rec.missing = a.missing;
    rec.blank = a.blank;
    if (!rec.quality) rec.quality = a.quality;
  } else {
    rec.missing = Object.keys(fields).filter(k => !(fields[k] || "").trim());
    rec.blank = [];
    if (!rec.quality) rec.quality = rec.missing.length ? "partial" : "complete";
  }
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

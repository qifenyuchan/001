// types.ts — v2 单一记录模型的共享类型
// 铁律：一条记录 = 一个文件 = 一个事实；派生值（content/title）不落盘。

export const SEVEN_FIELD_KEYS = ["时间", "地点", "人物", "事情", "原因", "结果", "重点"] as const;
// 字段方案（profile）可扩展：键不再限定为七字段，但默认 general 仍是这七个
export type SevenKey = string;
export type SevenFields = Record<string, string>;

export type RecordKind = "turn" | "range";
export type Quality = "complete" | "partial" | "degraded";

export interface RangeMeta {
  from: number;
  to: number;
  covers: string[];
  unresolved?: string[];
}

export interface LegacyMeta {
  uid?: string;
  chat_id?: string;
  kind?: string;
  content_sha256?: string;
  body_sha256?: string;
  content?: string;
  body?: string;
}

// 字段级同步元数据：多设备同一字段冲突时取 ts 大者（平局按 device id）
export interface FieldMeta {
  ts: number;
  by: string;
}

export interface MemoryRecord {
  schema: 1;
  id: string;
  kind: RecordKind;
  profile: string;
  space_id: string;
  session_id: string;
  session_key: string;
  turn_no: number;
  created_at: number;
  updated_at: number;
  revision: number;
  updated_by: string;
  field_meta?: Record<string, FieldMeta>;
  fields: SevenFields;
  raw_text: string;
  raw_truncated: boolean;
  truncated: boolean;
  missing: SevenKey[];
  blank: SevenKey[];
  quality: Quality;
  tags: string[];
  rating: number;
  source: string;
  origin: "native" | "legacy";
  range?: RangeMeta;
  auto?: boolean;
  legacy?: LegacyMeta;
}

export interface Tombstone {
  schema: 1;
  id: string;
  session_key: string;
  deleted_at: number;
  by: string;
  reason: string;
  record: MemoryRecord;
}

export interface SessionMeta {
  schema: 1;
  session_id: string;
  session_key: string;
  name: string;
  name_source: "legacy" | "auto" | "user";
  range_every: number;
  created_at: number;
  updated_at: number;
}

export interface SessionView {
  session_key: string;
  session_id: string;
  name: string;
  name_source: string;
  range_every: number;
  turn_count: number;
  range_count: number;
  first_at: number;
  last_at: number;
  max_turn_no: number;
  gaps: number[];
}

export interface SaveInput {
  session_id?: string;
  profile?: string;
  turn_no?: number;
  fields?: Record<string, unknown> | null;
  content?: string;
  raw_text?: string;
  truncated?: boolean;
  kind?: RecordKind;
  range_from?: number;
  range_to?: number;
  covers?: string[];
  tags?: string[];
  rating?: number;
  source?: string;
}

export interface SaveResult {
  ok: boolean;
  id: string;
  kind: RecordKind;
  profile: string;
  session_key: string;
  turn_no: number;
  next_turn_no: number;
  quality: Quality;
  missing: SevenKey[];
  range_due: boolean;
  range?: RangeMeta;
  created: boolean;
}

export interface ListQuery {
  session_key?: string;
  profile?: string;
  kind?: RecordKind;
  quality?: "incomplete";
  page?: number;
  page_size?: number;
  include_degraded?: boolean;
}

export interface ListResult {
  ok: boolean;
  total: number;
  page: number;
  page_size: number;
  pages: number;
  records: MemoryRecord[];
}

export interface UpdateInput {
  id: string;
  fields?: Record<string, unknown> | null;
  raw_text?: string;
  tags?: string[];
  rating?: number;
  expect_revision?: number;
}

export interface RecallQuery {
  session_id?: string;
  session_key?: string;
  before_turn_no?: number;
  scope?: "turn" | "range";
  max_chars?: number;
}

export interface RecallResult {
  ok: boolean;
  text: string;
  found: boolean;
  record?: MemoryRecord;
  next_turn_no: number;
  gap: boolean;
  reason?: string;
}

export interface StatsResult {
  ok: boolean;
  total: number;
  by_kind: Record<string, number>;
  by_profile?: Record<string, number>;
  sessions: number;
  incomplete: number;
  corrupted: number;
  gaps: number;
  data_dir: string;
  version: string;
  space_id?: string;
  device_id?: string;
  tombstones?: number;
  conflicts?: number;
}

export interface TrashItem {
  trash_id: string;
  record: MemoryRecord;
  deleted_at: number;
  original_path: string;
  reason: string;
}

export type ErrorCode =
  | "EMPTY_INPUT"
  | "INVALID_ARG"
  | "NOT_FOUND"
  | "CONFLICT"
  | "IO_ERROR"
  | "CORRUPT_RECORD"
  | "LOCK_TIMEOUT"
  | "INVALID_PROFILE"
  | "PROFILE_NOT_FOUND";

export class NorthstarError extends Error {
  code: ErrorCode;
  details?: unknown;
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

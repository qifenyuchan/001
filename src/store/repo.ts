// repo.ts — 本地优先文件真源：扫描/upsert/查询/编辑/回收站/墓碑/冲突合并
// 多设备：记录自带 space_id + updated_by + field_meta；冲突副本按字段 ts 合并；删除写墓碑。
import fs from "node:fs";
import path from "node:path";
import type {
  FieldMeta,
  ListQuery,
  ListResult,
  MemoryRecord,
  SaveInput,
  SaveResult,
  SessionMeta,
  SessionView,
  StatsResult,
  Tombstone,
  TrashItem,
  UpdateInput,
  SevenKey,
} from "../core/types.js";
import { NorthstarError, SEVEN_FIELD_KEYS } from "../core/types.js";
import {
  assess,
  buildRange,
  buildTurn,
  ensureRecordShape,
  isConflictCandidate,
  normalizeFields,
  partialFields,
  recordFileName,
} from "./schema.js";
import { fieldsToContent } from "./schema.js";
import { atomicWriteJson, ensureDir, listDirs, listFiles, readJson, revStamp, touchRev, withLock } from "./files.js";
import { clampInt, sanitizeKey, normTags, isSafeId } from "../core/util.js";
import { logWarn } from "../log.js";
import { truncateWindow } from "../core/text.js";
import { getDeviceId } from "../device.js";

// 缺口计算：排序后按相邻差生成，带 cap，避免 turn_no=1e9 时线性遍历
function computeGaps(turns: MemoryRecord[], cap = 500): { gaps: number[]; count: number } {
  const nums = turns.map(t => t.turn_no).sort((a, b) => a - b);
  const gaps: number[] = [];
  let count = 0;
  let prev = 0;
  for (const n of nums) {
    if (n - prev > 1) {
      count += n - prev - 1;
      for (let i = prev + 1; i < n && gaps.length < cap; i++) gaps.push(i);
    }
    prev = Math.max(prev, n);
  }
  return { gaps, count };
}

function assertTrashId(v: unknown): string {
  const id = String(v || "");
  if (!isSafeId(id)) throw new NorthstarError("INVALID_ARG", "invalid trash_id");
  return id;
}

export interface RepoOptions {
  dataDir: string;
  rangeEvery: number;
  rawHead: number;
  rawTail: number;
  deviceId?: string;
  spaceId?: string;
}

interface SessionState {
  key: string;
  meta: SessionMeta;
  dir: string;
  records: Map<string, MemoryRecord>;
  rev: number;
}

export interface SyncStatus {
  ok: boolean;
  device_id: string;
  space_id: string;
  data_dir: string;
  sessions: number;
  records: number;
  tombstones: number;
  conflicts: number;
  last_maintenance: number;
}

export class RepoStore {
  readonly dataDir: string;
  readonly spaceId: string;
  readonly deviceId: string;
  private spaceRoot: string;
  private sessionsDir: string;
  private trashDir: string;
  private tombDir: string;
  private conflictDir: string;
  private lockDir: string;
  private opts: RepoOptions;
  private sessions = new Map<string, SessionState>();
  private byId = new Map<string, MemoryRecord>();
  private corruptedCount = 0;
  private lastMaintenance = 0;
  private lastMergeCount = 0;

  constructor(opts: RepoOptions) {
    this.opts = opts;
    this.dataDir = opts.dataDir;
    this.spaceId = opts.spaceId || "personal";
    this.deviceId = opts.deviceId || getDeviceId();
    this.spaceRoot = path.join(this.dataDir, "spaces", this.spaceId);
    this.sessionsDir = path.join(this.spaceRoot, "sessions");
    this.trashDir = path.join(this.dataDir, ".trash");
    this.tombDir = path.join(this.dataDir, "tombstones");
    this.conflictDir = path.join(this.dataDir, "conflicts");
    this.lockDir = path.join(this.dataDir, ".locks");
    this.migrateLegacyLayout();
    for (const d of [this.sessionsDir, this.trashDir, this.tombDir, this.conflictDir, this.lockDir]) ensureDir(d);
    this.writeSpaceMeta();
  }

  // v2 布局（data/sessions）→ v2.2 布局（data/spaces/<space>/sessions），自动且一次性
  private migrateLegacyLayout(): void {
    const legacy = path.join(this.dataDir, "sessions");
    if (!fs.existsSync(legacy)) return;
    if (fs.existsSync(this.sessionsDir)) {
      if (listDirs(this.sessionsDir).length > 0) {
        logWarn(`legacy data/sessions exists alongside spaces/${this.spaceId}; left untouched`);
        return;
      }
      try {
        fs.rmdirSync(this.sessionsDir);
      } catch {
        /* non-empty or busy */
      }
    }
    ensureDir(path.dirname(this.sessionsDir));
    try {
      fs.renameSync(legacy, this.sessionsDir);
      logWarn(`migrated data/sessions -> spaces/${this.spaceId}/sessions`);
    } catch (e: any) {
      logWarn(`legacy layout migration failed: ${e && e.message}`);
    }
  }

  private writeSpaceMeta(): void {
    const file = path.join(this.spaceRoot, "space.json");
    if (fs.existsSync(file)) return;
    atomicWriteJson(file, {
      schema: 1,
      space_id: this.spaceId,
      name: this.spaceId === "personal" ? "个人空间" : this.spaceId,
      members: [],
      created_at: Date.now(),
    });
  }

  open(): void {
    this.sessions.clear();
    this.byId.clear();
    this.corruptedCount = 0;
    for (const key of listDirs(this.sessionsDir)) this.loadSession(key);
    this.lastMaintenance = 0;
    this.maintainIfDue(true);
  }

  private sessionDir(key: string): string {
    return path.join(this.sessionsDir, key);
  }

  private loadSession(key: string): SessionState {
    if (!/^[a-z0-9_-]{1,64}$/.test(key)) {
      logWarn(`skip unsafe session dir name: ${key}`);
      const now = Date.now();
      const meta: SessionMeta = {
        schema: 1,
        session_id: key,
        session_key: key,
        name: key,
        name_source: "auto",
        range_every: this.opts.rangeEvery,
        created_at: now,
        updated_at: now,
      };
      return { key, meta, dir: this.sessionDir(key), records: new Map(), rev: 0 };
    }
    const dir = this.sessionDir(key);
    const meta = this.readMeta(key, dir);
    const records = new Map<string, MemoryRecord>();
    for (const fname of listFiles(dir)) {
      if (fname === "_meta.json") continue;
      if (isConflictCandidate(fname)) continue; // 冲突副本由 mergeConflicts 处理，不重复计数
      const r = readJson(path.join(dir, fname));
      if (!r.ok) {
        this.corruptedCount++;
        logWarn(`corrupt record skipped: ${key}/${fname}`, r.error);
        continue;
      }
      const rec = ensureRecordShape(r.value);
      if (!rec) {
        this.corruptedCount++;
        logWarn(`shape mismatch skipped: ${key}/${fname}`);
        continue;
      }
      if (rec.session_key !== key) rec.session_key = key;
      records.set(rec.id, rec);
    }
    const state: SessionState = { key, meta, dir, records, rev: revStamp(dir) };
    this.sessions.set(key, state);
    for (const rec of records.values()) this.byId.set(rec.id, rec);
    return state;
  }

  private readMeta(key: string, dir: string): SessionMeta {
    const file = path.join(dir, "_meta.json");
    const r = readJson<SessionMeta>(file);
    if (r.ok && r.value && r.value.session_key) return r.value;
    const now = Date.now();
    const meta: SessionMeta = {
      schema: 1,
      session_id: key,
      session_key: key,
      name: key,
      name_source: "auto",
      range_every: this.opts.rangeEvery,
      created_at: now,
      updated_at: now,
    };
    atomicWriteJson(file, meta);
    return meta;
  }

  private writeMeta(state: SessionState): void {
    state.meta.updated_at = Date.now();
    atomicWriteJson(path.join(state.dir, "_meta.json"), state.meta);
  }

  private maintainIfDue(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastMaintenance < 2000) return;
    this.lastMaintenance = now;
    this.mergeConflicts();
    this.applyTombstones();
  }

  // 跨进程失效：任一会话 .rev 变化即整库重扫（目录数几十，代价可忽略）
  private maybeRefresh(): void {
    this.maintainIfDue();
    let stale = false;
    for (const [key, st] of this.sessions) {
      if (revStamp(st.dir) !== st.rev) {
        stale = true;
        break;
      }
    }
    const dirs = listDirs(this.sessionsDir);
    if (!stale && dirs.length === this.sessions.size) return;
    this.sessions.clear();
    this.byId.clear();
    this.corruptedCount = 0;
    for (const key of dirs) this.loadSession(key);
  }

  private ensureSession(sessionId: string): SessionState {
    const key = sanitizeKey(sessionId);
    let st = this.sessions.get(key);
    if (!st) {
      const dir = this.sessionDir(key);
      ensureDir(dir);
      const now = Date.now();
      st = {
        key,
        meta: {
          schema: 1,
          session_id: sessionId || key,
          session_key: key,
          name: sessionId || key,
          name_source: "auto",
          range_every: this.opts.rangeEvery,
          created_at: now,
          updated_at: now,
        },
        dir,
        records: new Map(),
        rev: 0,
      };
      this.sessions.set(key, st);
      this.writeMeta(st);
      touchRev(dir);
      st.rev = revStamp(dir);
    }
    return st;
  }

  nextTurnNo(key: string): number {
    const st = this.sessions.get(sanitizeKey(key));
    if (!st) return 1;
    let max = 0;
    for (const r of st.records.values()) if (r.kind === "turn" && r.turn_no > max) max = r.turn_no;
    return max + 1;
  }

  private findTurn(st: SessionState, turnNo: number): MemoryRecord | undefined {
    for (const r of st.records.values()) if (r.kind === "turn" && r.turn_no === turnNo) return r;
    return undefined;
  }

  private hasRangeCovering(st: SessionState, from: number, to: number): boolean {
    for (const r of st.records.values()) {
      if (r.kind === "range" && r.range && r.range.from === from && r.range.to === to) return true;
    }
    return false;
  }

  private fileFor(st: SessionState, rec: MemoryRecord): string {
    return path.join(st.dir, recordFileName(rec));
  }

  private snapshot(st: SessionState, rec: MemoryRecord, reason: string): void {
    const item: TrashItem = {
      trash_id: `${Date.now()}_${rec.id}_${reason}`,
      record: rec,
      deleted_at: Date.now(),
      original_path: path.relative(this.dataDir, this.fileFor(st, rec)).replace(/\\/g, "/"),
      reason,
    };
    atomicWriteJson(path.join(this.trashDir, `${item.trash_id}.json`), item);
    // 快照保留上限：只留最近 200 份，避免长期使用后无限增长
    try {
      const files = listFiles(this.trashDir);
      if (files.length > 200) {
        for (const f of files.slice(0, files.length - 200)) {
          try {
            fs.unlinkSync(path.join(this.trashDir, f));
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  private scanSessionRecords(st: SessionState): MemoryRecord[] {
    const out: MemoryRecord[] = [];
    for (const fname of listFiles(st.dir)) {
      if (fname === "_meta.json" || isConflictCandidate(fname)) continue;
      const r = readJson(path.join(st.dir, fname));
      if (!r.ok) continue;
      const rec = ensureRecordShape(r.value);
      if (rec) {
        rec.session_key = st.key;
        out.push(rec);
      }
    }
    return out;
  }

  private withSessionLock<T>(st: SessionState, fn: () => T): T {
    return withLock(this.lockDir, st.key, fn);
  }

  upsertTurn(input: SaveInput): SaveResult {
    this.maybeRefresh();
    const sessionId = String(input.session_id || "").trim() || "default";
    const st = this.ensureSession(sessionId);
    let rec!: MemoryRecord;
    let created = false;
    this.withSessionLock(st, () => {
      // 锁内重新读盘，避免两个进程同时取到同一个 turn_no（P0-4）
      const fresh = this.scanSessionRecords(st);
      const turnNo = input.turn_no && Number(input.turn_no) > 0 ? Math.floor(Number(input.turn_no)) : fresh.filter(r => r.kind === "turn").reduce((m, r) => Math.max(m, r.turn_no), 0) + 1;
      const existing = fresh.find(r => r.kind === "turn" && r.turn_no === turnNo);
      const built = buildTurn(
        { ...input, session_id: sessionId, turn_no: turnNo },
        {
          nowMs: Date.now(),
          rawHead: this.opts.rawHead,
          rawTail: this.opts.rawTail,
          sessionKeyOverride: st.key,
          deviceId: this.deviceId,
          spaceId: this.spaceId,
        },
        existing
      );
      if (existing) this.snapshot(st, existing, "edit");
      atomicWriteJson(this.fileFor(st, built), built);
      touchRev(st.dir);
      rec = built;
      created = !existing;
    });
    st.records.set(rec.id, rec);
    this.byId.set(rec.id, rec);
    st.rev = revStamp(st.dir);
    const next = this.nextTurnNo(st.key);
    const rangeEvery = st.meta.range_every || this.opts.rangeEvery;
    const rangeDue =
      rec.kind === "turn" && rangeEvery > 0 && rec.turn_no % rangeEvery === 0 && !this.hasRangeCovering(st, rec.turn_no - rangeEvery + 1, rec.turn_no);
    return {
      ok: true,
      id: rec.id,
      kind: rec.kind,
      session_key: st.key,
      turn_no: rec.turn_no,
      next_turn_no: next,
      quality: rec.quality,
      missing: rec.missing,
      range_due: rangeDue,
      created,
    };
  }

  upsertRange(input: SaveInput): SaveResult {
    this.maybeRefresh();
    const sessionId = String(input.session_id || "").trim() || "default";
    const st = this.ensureSession(sessionId);
    const from = Math.max(1, Math.floor(Number(input.range_from) || 0));
    const to = Math.max(from, Math.floor(Number(input.range_to) || 0));
    if (!from || !to) throw new NorthstarError("INVALID_ARG", "range_from and range_to are required");
    if (from > to || to > 1000000) throw new NorthstarError("INVALID_ARG", "invalid range_from/range_to");
    let rec!: MemoryRecord;
    let created = false;
    this.withSessionLock(st, () => {
      const fresh = this.scanSessionRecords(st);
      const existing = fresh.find(r => r.kind === "range" && r.range && r.range.from === from && r.range.to === to);
      const built = buildRange(
        { ...input, session_id: sessionId, range_from: from, range_to: to },
        {
          nowMs: Date.now(),
          rawHead: this.opts.rawHead,
          rawTail: this.opts.rawTail,
          sessionKeyOverride: st.key,
          deviceId: this.deviceId,
          spaceId: this.spaceId,
        },
        existing
      );
      if (existing) this.snapshot(st, existing, "range-edit");
      atomicWriteJson(this.fileFor(st, built), built);
      touchRev(st.dir);
      rec = built;
      created = !existing;
    });
    st.records.set(rec.id, rec);
    this.byId.set(rec.id, rec);
    st.rev = revStamp(st.dir);
    return {
      ok: true,
      id: rec.id,
      kind: "range",
      session_key: st.key,
      turn_no: rec.turn_no,
      next_turn_no: this.nextTurnNo(st.key),
      quality: rec.quality,
      missing: rec.missing,
      range_due: false,
      range: rec.range,
      created,
    };
  }

  get(id: string): MemoryRecord | undefined {
    this.maybeRefresh();
    return this.byId.get(id);
  }

  all(): MemoryRecord[] {
    this.maybeRefresh();
    return [...this.byId.values()];
  }

  list(query: ListQuery = {}): ListResult {
    this.maybeRefresh();
    const pageSize = clampInt(query.page_size, 1, 100, 20);
    let items = [...this.byId.values()];
    if (query.session_key) {
      const key = sanitizeKey(query.session_key);
      items = items.filter(r => r.session_key === key);
    }
    if (query.kind) items = items.filter(r => r.kind === query.kind);
    if (query.quality === "incomplete") items = items.filter(r => r.quality !== "complete");
    items.sort((a, b) => b.created_at - a.created_at);
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = clampInt(query.page, 1, pages, 1);
    return {
      ok: true,
      total,
      page,
      page_size: pageSize,
      pages,
      records: items.slice((page - 1) * pageSize, page * pageSize),
    };
  }

  listSessions(includeEmpty = false): SessionView[] {
    this.maybeRefresh();
    const out: SessionView[] = [];
    for (const st of this.sessions.values()) {
      const turns = [...st.records.values()].filter(r => r.kind === "turn");
      if (!turns.length && !includeEmpty) continue;
      const ranges = [...st.records.values()].filter(r => r.kind === "range");
      const times = [...turns, ...ranges].map(r => r.created_at);
      const maxTurn = turns.reduce((m, r) => Math.max(m, r.turn_no), 0);
      const gaps = computeGaps(turns).gaps;
      out.push({
        session_key: st.key,
        session_id: st.meta.session_id,
        name: st.meta.name || st.key,
        name_source: st.meta.name_source,
        range_every: st.meta.range_every || this.opts.rangeEvery,
        turn_count: turns.length,
        range_count: ranges.length,
        first_at: times.length ? Math.min(...times) : 0,
        last_at: times.length ? Math.max(...times) : 0,
        max_turn_no: maxTurn,
        gaps,
      });
    }
    out.sort((a, b) => b.last_at - a.last_at);
    return out;
  }

  renameSession(sessionKey: string, name: string): SessionMeta {
    this.maybeRefresh();
    const key = sanitizeKey(sessionKey);
    const st = this.sessions.get(key);
    if (!st) throw new NorthstarError("NOT_FOUND", `session not found: ${key}`);
    const clean = String(name || "").trim().slice(0, 60);
    if (!clean) throw new NorthstarError("INVALID_ARG", "name is required");
    st.meta.name = clean;
    st.meta.name_source = "user";
    this.writeMeta(st);
    touchRev(st.dir);
    st.rev = revStamp(st.dir);
    return st.meta;
  }

  rangeEveryOf(sessionKey: string): number {
    const st = this.sessions.get(sanitizeKey(sessionKey));
    return (st && st.meta.range_every) || this.opts.rangeEvery;
  }

  update(input: UpdateInput): MemoryRecord {
    this.maybeRefresh();
    const rec = this.byId.get(String(input.id || ""));
    if (!rec) throw new NorthstarError("NOT_FOUND", `record not found: ${input.id}`);
    const st = this.sessions.get(rec.session_key);
    if (!st) throw new NorthstarError("NOT_FOUND", `session not found: ${rec.session_key}`);
    let updated!: MemoryRecord;
    this.withSessionLock(st, () => {
      // 锁内重读，乐观锁检查与写回原子化（P1-8）
      const file = this.fileFor(st, rec);
      const freshRead = readJson(file);
      const fresh = freshRead.ok ? ensureRecordShape(freshRead.value) : null;
      if (!fresh) throw new NorthstarError("NOT_FOUND", `record file missing: ${rec.id}`);
      if (input.expect_revision != null && Number(input.expect_revision) !== fresh.revision) {
        throw new NorthstarError("CONFLICT", `revision mismatch: expected ${input.expect_revision}, actual ${fresh.revision}`);
      }
      const patch = input.fields ? partialFields(input.fields) : {};
      const mergedFields = { ...fresh.fields, ...patch };
      const now = Date.now();
      const fieldMeta: Record<string, FieldMeta> = { ...(fresh.field_meta || {}) };
      for (const k of Object.keys(patch) as SevenKey[]) {
        if ((patch[k] || "") !== (fresh.fields[k] || "")) fieldMeta[k] = { ts: now, by: this.deviceId };
      }
      let rawText = fresh.raw_text;
      let rawTruncated = fresh.raw_truncated;
      if (input.raw_text != null) {
        rawText = String(input.raw_text);
        if (rawText.length > this.opts.rawHead + this.opts.rawTail + 24) {
          rawText = truncateWindow(rawText, this.opts.rawHead, this.opts.rawTail);
          rawTruncated = true;
        } else {
          rawTruncated = false;
        }
        if (rawText !== fresh.raw_text) fieldMeta["raw_text"] = { ts: now, by: this.deviceId };
      }
      const a = assess(mergedFields);
      updated = {
        ...fresh,
        fields: mergedFields,
        raw_text: rawText,
        raw_truncated: rawTruncated,
        missing: a.missing,
        blank: a.blank,
        quality: a.quality,
        tags: input.tags ? normTags(input.tags) : fresh.tags,
        rating: input.rating != null ? clampInt(input.rating, 1, 5, fresh.rating || 3) : fresh.rating,
        updated_at: now,
        updated_by: this.deviceId,
        revision: fresh.revision + 1,
        field_meta: fieldMeta,
      };
      this.snapshot(st, fresh, "edit");
      atomicWriteJson(file, updated);
      touchRev(st.dir);
    });
    st.records.set(updated.id, updated);
    this.byId.set(updated.id, updated);
    st.rev = revStamp(st.dir);
    return updated;
  }

  // 删除：写墓碑（随文件同步传播）+ 删本地文件；墓碑里保留完整记录，可恢复
  softDelete(id: string, reason = "delete"): { ok: boolean; trash_id: string } {
    this.maybeRefresh();
    const rec = this.byId.get(String(id || ""));
    if (!rec) throw new NorthstarError("NOT_FOUND", `record not found: ${id}`);
    const st = this.sessions.get(rec.session_key);
    if (!st) throw new NorthstarError("NOT_FOUND", `session not found: ${rec.session_key}`);
    this.withSessionLock(st, () => {
      const tomb: Tombstone = {
        schema: 1,
        id: rec.id,
        session_key: rec.session_key,
        deleted_at: Date.now(),
        by: this.deviceId,
        reason,
        record: rec,
      };
      atomicWriteJson(path.join(this.tombDir, `${rec.id}.json`), tomb);
      try {
        fs.unlinkSync(this.fileFor(st, rec));
      } catch (e: any) {
        throw new NorthstarError("IO_ERROR", `delete failed: ${e.message}`);
      }
      touchRev(st.dir);
    });
    st.records.delete(rec.id);
    this.byId.delete(rec.id);
    st.rev = revStamp(st.dir);
    return { ok: true, trash_id: rec.id };
  }

  private applyTombstones(): void {
    if (!fs.existsSync(this.tombDir)) return;
    for (const f of listFiles(this.tombDir)) {
      const r = readJson<Tombstone>(path.join(this.tombDir, f));
      if (!r.ok || !r.value || !r.value.record) continue;
      const tomb = r.value;
      const rec = this.byId.get(tomb.id);
      if (!rec) continue;
      // 删除之后又被编辑（updated_at 更新）→ 保留记录，视为有意复活
      if (rec.updated_at > tomb.deleted_at) continue;
      const st = this.sessions.get(rec.session_key);
      if (!st) continue;
      try {
        fs.unlinkSync(this.fileFor(st, rec));
      } catch {
        /* already gone */
      }
      st.records.delete(rec.id);
      this.byId.delete(rec.id);
      touchRev(st.dir);
      st.rev = revStamp(st.dir);
    }
  }

  // 冲突副本（OneDrive/Syncthing/git 产生）→ 字段级合并到 canonical，副本归档
  private mergeConflicts(): void {
    let merged = 0;
    for (const st of this.sessions.values()) {
      for (const fname of listFiles(st.dir)) {
        if (!isConflictCandidate(fname)) continue;
        const full = path.join(st.dir, fname);
        const r = readJson(full);
        if (!r.ok) continue;
        const incoming = ensureRecordShape(r.value);
        if (!incoming) continue;
        incoming.session_key = st.key;
        const target = this.byId.get(incoming.id) || this.findByNaturalKey(incoming);
        if (!target) {
          const canonical = path.join(st.dir, recordFileName(incoming));
          if (!fs.existsSync(canonical)) {
            atomicWriteJson(canonical, incoming);
            st.records.set(incoming.id, incoming);
            this.byId.set(incoming.id, incoming);
          }
        } else {
          const result = this.mergeTwo(target, incoming);
          const mergedRec = result.record;
          withLock(this.lockDir, st.key, () => {
            atomicWriteJson(this.fileFor(st, mergedRec), mergedRec);
            touchRev(st.dir);
          });
          st.records.set(mergedRec.id, mergedRec);
          this.byId.set(mergedRec.id, mergedRec);
          atomicWriteJson(path.join(this.conflictDir, `${Date.now()}_${sanitizeKey(fname)}.report.json`), {
            at: new Date().toISOString(),
            device: this.deviceId,
            conflict_file: fname,
            target_id: target.id,
            kept: result.conflicts.map(c => c.kept),
            discarded: result.conflicts.map(c => c.discarded),
            fields: result.conflicts.map(c => c.field),
          });
        }
        try {
          fs.renameSync(full, path.join(this.conflictDir, `${Date.now()}_${fname}`));
        } catch {
          try {
            fs.unlinkSync(full);
          } catch {
            /* ignore */
          }
        }
        st.rev = revStamp(st.dir);
        merged++;
        this.lastMergeCount++;
      }
    }
  }

  private findByNaturalKey(rec: MemoryRecord): MemoryRecord | undefined {
    for (const r of this.byId.values()) {
      if (r.session_key !== rec.session_key || r.kind !== rec.kind) continue;
      if (rec.kind === "turn" && r.turn_no === rec.turn_no) return r;
      if (rec.kind === "range" && r.range && rec.range && r.range.from === rec.range.from && r.range.to === rec.range.to) return r;
    }
    return undefined;
  }

  private mergeTwo(a: MemoryRecord, b: MemoryRecord): { record: MemoryRecord; conflicts: { field: string; kept: string; discarded: string }[] } {
    const fields = { ...a.fields };
    let rawText = a.raw_text;
    const meta: Record<string, FieldMeta> = { ...(a.field_meta || {}) };
    const conflicts: { field: string; kept: string; discarded: string }[] = [];
    const newer = (x: MemoryRecord, key: string): FieldMeta =>
      (x.field_meta && x.field_meta[key]) || { ts: x.updated_at, by: x.updated_by || "legacy" };
    for (const key of [...SEVEN_FIELD_KEYS, "raw_text"] as string[]) {
      const va = key === "raw_text" ? a.raw_text : a.fields[key as SevenKey] || "";
      const vb = key === "raw_text" ? b.raw_text : b.fields[key as SevenKey] || "";
      const ma = newer(a, key);
      const mb = newer(b, key);
      if (va === vb) {
        meta[key] = mb.ts > ma.ts ? mb : ma;
        continue;
      }
      const bWins = mb.ts > ma.ts || (mb.ts === ma.ts && String(mb.by) > String(ma.by));
      if (bWins) {
        if (key === "raw_text") rawText = vb;
        else fields[key as SevenKey] = vb;
        meta[key] = mb;
      } else {
        meta[key] = ma;
      }
      if (va && vb) conflicts.push({ field: key, kept: bWins ? vb : va, discarded: bWins ? va : vb });
    }
    const aNewer = a.updated_at >= b.updated_at;
    const a2 = assess(fields);
    return {
      record: {
        ...a,
        fields,
        raw_text: rawText,
        field_meta: meta,
        missing: a2.missing,
        blank: a2.blank,
        quality: a2.quality,
        tags: aNewer ? a.tags : b.tags,
        rating: aNewer ? a.rating : b.rating,
        updated_at: Math.max(a.updated_at, b.updated_at),
        updated_by: aNewer ? a.updated_by || "legacy" : b.updated_by || "legacy",
        revision: Math.max(a.revision, b.revision) + 1,
      },
      conflicts,
    };
  }

  trashList(): TrashItem[] {
    const out: TrashItem[] = [];
    for (const f of listFiles(this.tombDir)) {
      const r = readJson<Tombstone>(path.join(this.tombDir, f));
      if (!r.ok || !r.value || !r.value.record) continue;
      out.push({
        trash_id: r.value.id,
        record: r.value.record,
        deleted_at: r.value.deleted_at,
        original_path: `spaces/${this.spaceId}/sessions/${r.value.session_key}/${recordFileName(r.value.record)}`,
        reason: r.value.reason || "delete",
      });
    }
    for (const f of listFiles(this.trashDir)) {
      const r = readJson<TrashItem>(path.join(this.trashDir, f));
      if (r.ok && r.value && r.value.record) out.push(r.value);
    }
    out.sort((a, b) => b.deleted_at - a.deleted_at);
    return out;
  }

  restore(trashId: string): MemoryRecord {
    this.maybeRefresh();
    const id = assertTrashId(trashId);
    const tombFile = path.join(this.tombDir, `${id}.json`);
    const tombRead = readJson<Tombstone>(tombFile);
    if (tombRead.ok && tombRead.value && tombRead.value.record) {
      const rec = ensureRecordShape(tombRead.value.record);
      if (!rec) throw new NorthstarError("CORRUPT_RECORD", "tombstone record is corrupted");
      if (!/^[a-z0-9_-]{1,64}$/.test(rec.session_key)) throw new NorthstarError("INVALID_ARG", "invalid session key in tombstone");
      const st = this.sessions.get(rec.session_key) || this.loadSession(rec.session_key);
      const target = this.fileFor(st, rec);
      if (fs.existsSync(target)) throw new NorthstarError("CONFLICT", `target already exists: ${path.basename(target)}`);
      const restored: MemoryRecord = { ...rec, updated_at: Date.now(), updated_by: this.deviceId, revision: rec.revision + 1 };
      this.withSessionLock(st, () => {
        atomicWriteJson(target, restored);
        touchRev(st.dir);
      });
      st.records.set(restored.id, restored);
      this.byId.set(restored.id, restored);
      st.rev = revStamp(st.dir);
      try {
        fs.unlinkSync(tombFile);
      } catch {
        /* ignore */
      }
      return restored;
    }
    const file = path.join(this.trashDir, `${id}.json`);
    const r = readJson<TrashItem>(file);
    if (!r.ok || !r.value || !r.value.record) throw new NorthstarError("NOT_FOUND", `trash item not found: ${trashId}`);
    const rec = r.value.record;
    if (!/^[a-z0-9_-]{1,64}$/.test(rec.session_key)) throw new NorthstarError("INVALID_ARG", "invalid session key in trash item");
    const st = this.sessions.get(rec.session_key) || this.loadSession(rec.session_key);
    const target = this.fileFor(st, rec);
    // P1-1：编辑快照恢复 = 用快照覆盖当前版本（先快照当前，再写回，revision 递增）
    let restored!: MemoryRecord;
    this.withSessionLock(st, () => {
      const currentRead = fs.existsSync(target) ? readJson(target) : { ok: false as const };
      const current = currentRead.ok ? ensureRecordShape((currentRead as any).value) : null;
      if (current) this.snapshot(st, current, "edit");
      const baseRevision = current ? current.revision : rec.revision;
      restored = {
        ...rec,
        updated_at: Date.now(),
        updated_by: this.deviceId,
        revision: baseRevision + 1,
      };
      atomicWriteJson(target, restored);
      touchRev(st.dir);
    });
    st.records.set(restored.id, restored);
    this.byId.set(restored.id, restored);
    st.rev = revStamp(st.dir);
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
    return restored;
  }

  purge(trashId: string): { ok: boolean } {
    const id = assertTrashId(trashId);
    const tombFile = path.join(this.tombDir, `${id}.json`);
    if (fs.existsSync(tombFile)) {
      fs.unlinkSync(tombFile);
      return { ok: true };
    }
    const file = path.join(this.trashDir, `${id}.json`);
    if (!fs.existsSync(file)) throw new NorthstarError("NOT_FOUND", `trash item not found: ${trashId}`);
    fs.unlinkSync(file);
    return { ok: true };
  }

  previousTurn(sessionKey: string, beforeTurnNo?: number): { record?: MemoryRecord; gap: boolean; next_turn_no: number } {
    this.maybeRefresh();
    const key = sanitizeKey(sessionKey);
    const st = this.sessions.get(key);
    if (!st) return { gap: true, next_turn_no: 1 };
    const turns = [...st.records.values()].filter(r => r.kind === "turn").sort((a, b) => a.turn_no - b.turn_no);
    const next = turns.length ? turns[turns.length - 1].turn_no + 1 : 1;
    if (!turns.length) return { gap: true, next_turn_no: next };
    const boundary = beforeTurnNo && beforeTurnNo > 0 ? beforeTurnNo : Number.MAX_SAFE_INTEGER;
    let prev: MemoryRecord | undefined;
    for (const t of turns) if (t.turn_no < boundary) prev = t;
    if (!prev) return { gap: true, next_turn_no: next };
    const expected = prev.turn_no + 1;
    const gap = boundary !== Number.MAX_SAFE_INTEGER && expected < boundary;
    return { record: prev, gap, next_turn_no: next };
  }

  gapsFor(sessionKey: string): number[] {
    const key = sanitizeKey(sessionKey);
    const st = this.sessions.get(key);
    if (!st) return [];
    return computeGaps([...st.records.values()].filter(r => r.kind === "turn")).gaps;
  }

  stats(): StatsResult {
    this.maybeRefresh();
    const byKind: Record<string, number> = { turn: 0, range: 0 };
    let incomplete = 0;
    for (const r of this.byId.values()) {
      byKind[r.kind] = (byKind[r.kind] || 0) + 1;
      if (r.quality !== "complete") incomplete++;
    }
    let sessions = 0;
    let gaps = 0;
    for (const st of this.sessions.values()) {
      const turns = [...st.records.values()].filter(r => r.kind === "turn");
      if (turns.length) sessions++;
      gaps += computeGaps(turns).count;
    }
    const tombstones = listFiles(this.tombDir).length;
    const conflicts = listFiles(this.conflictDir).filter(f => f.endsWith(".report.json")).length;
    return {
      ok: true,
      total: this.byId.size,
      by_kind: byKind,
      sessions,
      incomplete,
      corrupted: this.corruptedCount,
      gaps,
      data_dir: this.dataDir,
      version: "2.2.0",
      space_id: this.spaceId,
      device_id: this.deviceId,
      tombstones,
      conflicts,
    };
  }

  syncStatus(): SyncStatus {
    this.maybeRefresh();
    return {
      ok: true,
      device_id: this.deviceId,
      space_id: this.spaceId,
      data_dir: this.dataDir,
      sessions: this.sessions.size,
      records: this.byId.size,
      tombstones: listFiles(this.tombDir).length,
      conflicts: listFiles(this.conflictDir).filter(f => f.endsWith(".report.json")).length,
      last_maintenance: this.lastMaintenance,
    };
  }

  lastMerged(): number {
    return this.lastMergeCount;
  }

  conflictReports(): any[] {
    const out: any[] = [];
    for (const f of listFiles(this.conflictDir)) {
      if (!f.endsWith(".report.json")) continue;
      const r = readJson<any>(path.join(this.conflictDir, f));
      if (r.ok && r.value) out.push({ file: f, ...r.value });
    }
    out.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
    return out;
  }

  conflictFiles(): string[] {
    return listFiles(this.conflictDir).filter(f => !f.endsWith(".report.json"));
  }

  exportAll(): { exported_at: number; sessions: SessionMeta[]; records: MemoryRecord[]; tombstones: Tombstone[] } {
    this.maybeRefresh();
    const tombstones: Tombstone[] = [];
    for (const f of listFiles(this.tombDir)) {
      const r = readJson<Tombstone>(path.join(this.tombDir, f));
      if (r.ok && r.value) tombstones.push(r.value);
    }
    return {
      exported_at: Date.now(),
      sessions: [...this.sessions.values()].map(s => s.meta),
      records: [...this.byId.values()].sort((a, b) => a.created_at - b.created_at),
      tombstones,
    };
  }
}

export function recordToText(rec: MemoryRecord): string {
  return fieldsToContent(rec.fields);
}

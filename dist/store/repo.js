// repo.ts — 文件真源 + 内存索引：扫描/upsert/查询/编辑/回收站/统计
import fs from "node:fs";
import path from "node:path";
import { NorthstarError } from "../core/types.js";
import { assess, buildRange, buildTurn, ensureRecordShape, partialFields, recordFileName } from "./schema.js";
import { fieldsToContent } from "./schema.js";
import { atomicWriteJson, ensureDir, listDirs, listFiles, readJson, revStamp, touchRev, withLock } from "./files.js";
import { clampInt, sanitizeKey, normTags } from "../core/util.js";
import { logWarn } from "../log.js";
import { truncateWindow } from "../core/text.js";
export class RepoStore {
    dataDir;
    sessionsDir;
    trashDir;
    lockDir;
    opts;
    sessions = new Map();
    byId = new Map();
    corruptedCount = 0;
    constructor(opts) {
        this.opts = opts;
        this.dataDir = opts.dataDir;
        this.sessionsDir = path.join(opts.dataDir, "sessions");
        this.trashDir = path.join(opts.dataDir, ".trash");
        this.lockDir = path.join(opts.dataDir, ".locks");
        ensureDir(this.sessionsDir);
        ensureDir(this.trashDir);
        ensureDir(this.lockDir);
    }
    open() {
        this.sessions.clear();
        this.byId.clear();
        this.corruptedCount = 0;
        for (const key of listDirs(this.sessionsDir)) {
            this.loadSession(key);
        }
    }
    sessionDir(key) {
        return path.join(this.sessionsDir, key);
    }
    loadSession(key) {
        const dir = this.sessionDir(key);
        const meta = this.readMeta(key, dir);
        const records = new Map();
        for (const fname of listFiles(dir)) {
            if (fname === "_meta.json")
                continue;
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
            if (rec.session_key !== key) {
                rec.session_key = key;
            }
            records.set(rec.id, rec);
        }
        const state = { key, meta, dir, records, rev: revStamp(dir) };
        this.sessions.set(key, state);
        for (const rec of records.values())
            this.byId.set(rec.id, rec);
        return state;
    }
    readMeta(key, dir) {
        const file = path.join(dir, "_meta.json");
        const r = readJson(file);
        if (r.ok && r.value && r.value.session_key)
            return r.value;
        const now = Date.now();
        const meta = {
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
    writeMeta(state) {
        state.meta.updated_at = Date.now();
        atomicWriteJson(path.join(state.dir, "_meta.json"), state.meta);
    }
    // 跨进程失效：任一会话 .rev 变化即整库重扫（目录数几十，代价可忽略）
    maybeRefresh() {
        let stale = false;
        for (const [key, st] of this.sessions) {
            if (revStamp(st.dir) !== st.rev) {
                stale = true;
                break;
            }
        }
        const dirs = listDirs(this.sessionsDir);
        if (!stale && dirs.length === this.sessions.size)
            return;
        this.sessions.clear();
        this.byId.clear();
        this.corruptedCount = 0;
        for (const key of dirs)
            this.loadSession(key);
    }
    ensureSession(sessionId) {
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
    nextTurnNo(key) {
        const st = this.sessions.get(sanitizeKey(key));
        if (!st)
            return 1;
        let max = 0;
        for (const r of st.records.values())
            if (r.kind === "turn" && r.turn_no > max)
                max = r.turn_no;
        return max + 1;
    }
    findTurn(st, turnNo) {
        for (const r of st.records.values())
            if (r.kind === "turn" && r.turn_no === turnNo)
                return r;
        return undefined;
    }
    hasRangeCovering(st, from, to) {
        for (const r of st.records.values()) {
            if (r.kind === "range" && r.range && r.range.from === from && r.range.to === to)
                return true;
        }
        return false;
    }
    fileFor(st, rec) {
        return path.join(st.dir, recordFileName(rec));
    }
    snapshot(st, rec, reason) {
        const item = {
            trash_id: `${Date.now()}_${rec.id}_${reason}`,
            record: rec,
            deleted_at: Date.now(),
            original_path: path.relative(this.dataDir, this.fileFor(st, rec)).replace(/\\/g, "/"),
            reason,
        };
        atomicWriteJson(path.join(this.trashDir, `${item.trash_id}.json`), item);
    }
    upsertTurn(input) {
        this.maybeRefresh();
        const sessionId = String(input.session_id || "").trim() || "default";
        const st = this.ensureSession(sessionId);
        const turnNo = input.turn_no && Number(input.turn_no) > 0 ? Math.floor(Number(input.turn_no)) : this.nextTurnNo(st.key);
        const existing = this.findTurn(st, turnNo);
        const rec = buildTurn({ ...input, session_id: sessionId, turn_no: turnNo }, { nowMs: Date.now(), rawHead: this.opts.rawHead, rawTail: this.opts.rawTail, sessionKeyOverride: st.key }, existing);
        if (existing)
            this.snapshot(st, existing, "edit");
        withLock(this.lockDir, st.key, () => {
            atomicWriteJson(this.fileFor(st, rec), rec);
            touchRev(st.dir);
        });
        st.records.set(rec.id, rec);
        this.byId.set(rec.id, rec);
        st.rev = revStamp(st.dir);
        const next = this.nextTurnNo(st.key);
        const rangeEvery = st.meta.range_every || this.opts.rangeEvery;
        const rangeDue = rec.kind === "turn" && rangeEvery > 0 && rec.turn_no % rangeEvery === 0 && !this.hasRangeCovering(st, rec.turn_no - rangeEvery + 1, rec.turn_no);
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
            created: !existing,
        };
    }
    upsertRange(input) {
        this.maybeRefresh();
        const sessionId = String(input.session_id || "").trim() || "default";
        const st = this.ensureSession(sessionId);
        const from = Math.max(1, Math.floor(Number(input.range_from) || 0));
        const to = Math.max(from, Math.floor(Number(input.range_to) || 0));
        if (!from || !to)
            throw new NorthstarError("INVALID_ARG", "range_from and range_to are required");
        let existing;
        for (const r of st.records.values()) {
            if (r.kind === "range" && r.range && r.range.from === from && r.range.to === to)
                existing = r;
        }
        const rec = buildRange({ ...input, session_id: sessionId, range_from: from, range_to: to }, { nowMs: Date.now(), rawHead: this.opts.rawHead, rawTail: this.opts.rawTail, sessionKeyOverride: st.key }, existing);
        if (existing)
            this.snapshot(st, existing, "range-edit");
        withLock(this.lockDir, st.key, () => {
            atomicWriteJson(this.fileFor(st, rec), rec);
            touchRev(st.dir);
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
            created: !existing,
        };
    }
    get(id) {
        this.maybeRefresh();
        return this.byId.get(id);
    }
    all() {
        this.maybeRefresh();
        return [...this.byId.values()];
    }
    list(query = {}) {
        this.maybeRefresh();
        const pageSize = clampInt(query.page_size, 1, 100, 20);
        let items = [...this.byId.values()];
        if (query.session_key) {
            const key = sanitizeKey(query.session_key);
            items = items.filter(r => r.session_key === key);
        }
        if (query.kind)
            items = items.filter(r => r.kind === query.kind);
        if (!query.include_degraded)
            items = items.filter(r => r.quality !== "degraded" || r.raw_text);
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
    listSessions(includeEmpty = false) {
        this.maybeRefresh();
        const out = [];
        for (const st of this.sessions.values()) {
            const turns = [...st.records.values()].filter(r => r.kind === "turn");
            if (!turns.length && !includeEmpty)
                continue;
            const ranges = [...st.records.values()].filter(r => r.kind === "range");
            const times = [...turns, ...ranges].map(r => r.created_at);
            const maxTurn = turns.reduce((m, r) => Math.max(m, r.turn_no), 0);
            const present = new Set(turns.map(r => r.turn_no));
            const gaps = [];
            for (let i = 1; i <= maxTurn; i++)
                if (!present.has(i))
                    gaps.push(i);
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
    renameSession(sessionKey, name) {
        this.maybeRefresh();
        const key = sanitizeKey(sessionKey);
        const st = this.sessions.get(key);
        if (!st)
            throw new NorthstarError("NOT_FOUND", `session not found: ${key}`);
        const clean = String(name || "").trim().slice(0, 60);
        if (!clean)
            throw new NorthstarError("INVALID_ARG", "name is required");
        st.meta.name = clean;
        st.meta.name_source = "user";
        this.writeMeta(st);
        return st.meta;
    }
    update(input) {
        this.maybeRefresh();
        const rec = this.byId.get(String(input.id || ""));
        if (!rec)
            throw new NorthstarError("NOT_FOUND", `record not found: ${input.id}`);
        if (input.expect_revision != null && Number(input.expect_revision) !== rec.revision) {
            throw new NorthstarError("CONFLICT", `revision mismatch: expected ${input.expect_revision}, actual ${rec.revision}`);
        }
        const st = this.sessions.get(rec.session_key);
        if (!st)
            throw new NorthstarError("NOT_FOUND", `session not found: ${rec.session_key}`);
        const mergedFields = input.fields
            ? { ...rec.fields, ...partialFields(input.fields) }
            : { ...rec.fields };
        let rawText = rec.raw_text;
        let rawTruncated = rec.raw_truncated;
        if (input.raw_text != null) {
            rawText = String(input.raw_text);
            if (rawText.length > this.opts.rawHead + this.opts.rawTail + 24) {
                rawText = truncateWindow(rawText, this.opts.rawHead, this.opts.rawTail);
                rawTruncated = true;
            }
            else {
                rawTruncated = false;
            }
        }
        const a = assess(mergedFields);
        const updated = {
            ...rec,
            fields: mergedFields,
            raw_text: rawText,
            raw_truncated: rawTruncated,
            missing: a.missing,
            blank: a.blank,
            quality: a.quality,
            tags: input.tags ? normTags(input.tags) : rec.tags,
            rating: input.rating != null ? clampInt(input.rating, 1, 5, rec.rating || 3) : rec.rating,
            updated_at: Date.now(),
            revision: rec.revision + 1,
        };
        this.snapshot(st, rec, "edit");
        withLock(this.lockDir, st.key, () => {
            atomicWriteJson(this.fileFor(st, updated), updated);
            touchRev(st.dir);
        });
        st.records.set(updated.id, updated);
        this.byId.set(updated.id, updated);
        st.rev = revStamp(st.dir);
        return updated;
    }
    softDelete(id, reason = "delete") {
        this.maybeRefresh();
        const rec = this.byId.get(String(id || ""));
        if (!rec)
            throw new NorthstarError("NOT_FOUND", `record not found: ${id}`);
        const st = this.sessions.get(rec.session_key);
        if (!st)
            throw new NorthstarError("NOT_FOUND", `session not found: ${rec.session_key}`);
        this.snapshot(st, rec, reason);
        const file = this.fileFor(st, rec);
        try {
            fs.unlinkSync(file);
        }
        catch (e) {
            throw new NorthstarError("IO_ERROR", `delete failed: ${e.message}`);
        }
        st.records.delete(rec.id);
        this.byId.delete(rec.id);
        touchRev(st.dir);
        st.rev = revStamp(st.dir);
        const items = this.trashList();
        const newest = items.find(t => t.record.id === rec.id);
        return { ok: true, trash_id: newest ? newest.trash_id : "" };
    }
    trashList() {
        const out = [];
        for (const f of listFiles(this.trashDir)) {
            const r = readJson(path.join(this.trashDir, f));
            if (r.ok && r.value && r.value.record)
                out.push(r.value);
        }
        out.sort((a, b) => b.deleted_at - a.deleted_at);
        return out;
    }
    restore(trashId) {
        this.maybeRefresh();
        const file = path.join(this.trashDir, `${String(trashId || "")}.json`);
        const r = readJson(file);
        if (!r.ok || !r.value || !r.value.record)
            throw new NorthstarError("NOT_FOUND", `trash item not found: ${trashId}`);
        const rec = r.value.record;
        const st = this.sessions.get(rec.session_key) || this.loadSession(rec.session_key);
        const target = this.fileFor(st, rec);
        if (fs.existsSync(target))
            throw new NorthstarError("CONFLICT", `target already exists: ${path.basename(target)}`);
        const restored = { ...rec, updated_at: Date.now(), revision: rec.revision + 1 };
        withLock(this.lockDir, st.key, () => {
            atomicWriteJson(target, restored);
            touchRev(st.dir);
        });
        st.records.set(restored.id, restored);
        this.byId.set(restored.id, restored);
        st.rev = revStamp(st.dir);
        try {
            fs.unlinkSync(file);
        }
        catch {
            /* ignore */
        }
        return restored;
    }
    purge(trashId) {
        const file = path.join(this.trashDir, `${String(trashId || "")}.json`);
        if (!fs.existsSync(file))
            throw new NorthstarError("NOT_FOUND", `trash item not found: ${trashId}`);
        fs.unlinkSync(file);
        return { ok: true };
    }
    previousTurn(sessionKey, beforeTurnNo) {
        this.maybeRefresh();
        const key = sanitizeKey(sessionKey);
        const st = this.sessions.get(key);
        if (!st)
            return { gap: true, next_turn_no: 1 };
        const turns = [...st.records.values()].filter(r => r.kind === "turn").sort((a, b) => a.turn_no - b.turn_no);
        const next = turns.length ? turns[turns.length - 1].turn_no + 1 : 1;
        if (!turns.length)
            return { gap: true, next_turn_no: next };
        const boundary = beforeTurnNo && beforeTurnNo > 0 ? beforeTurnNo : Number.MAX_SAFE_INTEGER;
        let prev;
        for (const t of turns)
            if (t.turn_no < boundary)
                prev = t;
        if (!prev)
            return { gap: true, next_turn_no: next };
        // 缺口 = previous 与边界之间有没有断档
        const expected = prev.turn_no + 1;
        const gap = boundary !== Number.MAX_SAFE_INTEGER && expected < boundary;
        return { record: prev, gap, next_turn_no: next };
    }
    gapsFor(sessionKey) {
        const key = sanitizeKey(sessionKey);
        const st = this.sessions.get(key);
        if (!st)
            return [];
        const turns = [...st.records.values()].filter(r => r.kind === "turn");
        const max = turns.reduce((m, r) => Math.max(m, r.turn_no), 0);
        const present = new Set(turns.map(r => r.turn_no));
        const gaps = [];
        for (let i = 1; i <= max; i++)
            if (!present.has(i))
                gaps.push(i);
        return gaps;
    }
    stats() {
        this.maybeRefresh();
        const byKind = { turn: 0, range: 0 };
        let incomplete = 0;
        for (const r of this.byId.values()) {
            byKind[r.kind] = (byKind[r.kind] || 0) + 1;
            if (r.quality !== "complete")
                incomplete++;
        }
        let sessions = 0;
        let gaps = 0;
        for (const st of this.sessions.values()) {
            if ([...st.records.values()].some(r => r.kind === "turn"))
                sessions++;
            gaps += this.gapsFor(st.key).length;
        }
        return {
            ok: true,
            total: this.byId.size,
            by_kind: byKind,
            sessions,
            incomplete,
            corrupted: this.corruptedCount,
            gaps,
            data_dir: this.dataDir,
            version: "2.0.0",
        };
    }
    exportAll() {
        this.maybeRefresh();
        return {
            exported_at: Date.now(),
            sessions: [...this.sessions.values()].map(s => s.meta),
            records: [...this.byId.values()].sort((a, b) => a.created_at - b.created_at),
        };
    }
}
function keyOf(rawKey) {
    const k = String(rawKey).trim();
    const map = {
        时间: "时间", time: "时间",
        地点: "地点", place: "地点", location: "地点",
        人物: "人物", people: "人物", person: "人物", who: "人物",
        事情: "事情", event: "事情", thing: "事情", what: "事情",
        原因: "原因", cause: "原因", why: "原因", reason: "原因",
        结果: "结果", result: "结果", outcome: "结果",
        重点: "重点", keypoint: "重点", key: "重点", highlight: "重点",
    };
    return map[k] || map[k.toLowerCase()] || null;
}
// 供 UI/CLI 复用的一条记录纯文本化
export function recordToText(rec) {
    return fieldsToContent(rec.fields);
}

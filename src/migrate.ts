#!/usr/bin/env node
// migrate.ts — 从旧工作区 pc_host/data 迁移到 v2 单一文件真源（只读旧目录；幂等）
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadConfig } from "./config.js";
import { RepoStore } from "./store/repo.js";
import { atomicWriteJson, ensureDir, listDirs, listFiles, readJson } from "./store/files.js";
import { assess, buildSkeleton, fieldsToContent, normalizeFields, recordFileName } from "./store/schema.js";
import { contentToFields } from "./store/schema.js";
import { fmtDay, sanitizeKey } from "./core/util.js";
import { parseSevenFields } from "./core/parse.js";
import type { MemoryRecord, SessionMeta } from "./core/types.js";
import { SEVEN_FIELD_KEYS } from "./core/types.js";

interface LegacyEntry {
  uid?: string;
  id: string;
  chatId: string;
  createdAt: number;
  updatedAt?: number;
  source?: string;
  tags?: string[];
  rating?: number;
  title?: string;
  content?: string;
  kind?: string;
  body?: string;
  basedOn?: string[];
  [k: string]: any;
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function parseArgs(argv: string[]) {
  const out: Record<string, any> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--verify") out.verify = true;
    else if (a === "--from") out.from = argv[++i];
    else if (a === "--report") out.report = argv[++i];
    else if (a === "--data") out.data = argv[++i];
    else if (a === "--no-backup") out.noBackup = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const config = loadConfig({ data: args.data });
const OLD =
  args.from ||
  process.env.NORTHSTAR_LEGACY_DATA ||
  "D:\\新建文件夹 (2)\\.zcode\\workspace\\default\\pc_host\\data";
const indexFile = path.join(OLD, "index.json");
const namesFile = path.join(OLD, "chat_names.json");
const repoDir = path.join(OLD, "repo");

if (!fs.existsSync(indexFile)) {
  console.error(`[migrate] index.json not found: ${indexFile}`);
  process.exit(1);
}

const idx = readJson<{ entries: LegacyEntry[] }>(indexFile);
if (!idx.ok || !idx.value) {
  console.error(`[migrate] invalid index.json: ${idx.error}`);
  process.exit(1);
}
const legacyEntries = idx.value.entries;
const names = readJson<Record<string, string>>(namesFile);
const chatNames: Record<string, string> = names.ok && names.value ? names.value : {};

// 以 repo 单条文件为准，index 为索引
const entries: LegacyEntry[] = [];
for (const e of legacyEntries) {
  let merged: LegacyEntry = e;
  if (e.chatId) {
    const candidates = listFiles(path.join(repoDir, e.chatId));
    for (const f of candidates) {
      const r = readJson<LegacyEntry>(path.join(repoDir, e.chatId, f));
      if (r.ok && r.value && r.value.id === e.id) {
        merged = { ...e, ...r.value };
        break;
      }
    }
  }
  entries.push(merged);
}

// 按会话分组 + 时间排序
const byChat = new Map<string, LegacyEntry[]>();
for (const e of entries) {
  const chat = e.chatId || "unknown";
  if (!byChat.has(chat)) byChat.set(chat, []);
  byChat.get(chat)!.push(e);
}
for (const list of byChat.values()) list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

// 尾 4 位 → 旧条目（解析 basedOn）
const tailMap = new Map<string, LegacyEntry>();
for (const e of entries) tailMap.set(String(e.id).slice(-4), e);

const plan: { chat: string; key: string; turnNo: number; record: MemoryRecord }[] = [];
const dangling: string[] = [];
const metaList: SessionMeta[] = [];
const usedIds = new Set<string>();

for (const [chat, list] of byChat) {
  const key = sanitizeKey(chat);
  let eventCounter = 0;
  const idMap = new Map<string, string>();
  const pendingRanges: { e: LegacyEntry; covers: string[]; unresolved: string[]; turnNo: number }[] = [];

  for (const e of list) {
    if (e.kind === "topic" || e.source === "crystal") {
      const covers: string[] = [];
      const unresolved: string[] = [];
      for (const ref of e.basedOn || []) {
        const src = tailMap.get(String(ref).slice(-4));
        if (src) covers.push(String(src.id));
        else {
          unresolved.push(String(ref));
          dangling.push(`${e.id} -> ${ref}`);
        }
      }
      pendingRanges.push({ e, covers, unresolved, turnNo: Math.max(1, eventCounter) });
      continue;
    }
    eventCounter++;
    const rec = buildLegacyRecord(e, chat, key, eventCounter, "turn");
    plan.push({ chat, key, turnNo: eventCounter, record: rec });
    idMap.set(String(e.id), rec.id);
  }

  for (const pr of pendingRanges) {
    const coverIds = pr.covers.map(oldId => idMap.get(oldId)).filter(Boolean) as string[];
    const coveredTurns = plan.filter(p => p.chat === chat && coverIds.indexOf(p.record.id) >= 0).map(p => p.turnNo);
    const from = coveredTurns.length ? Math.min(...coveredTurns) : 1;
    const to = coveredTurns.length ? Math.max(...coveredTurns) : pr.turnNo;
    const rec = buildLegacyRecord(pr.e, chat, key, to, "range");
    rec.range = { from, to, covers: coverIds, unresolved: pr.unresolved };
    rec.auto = false;
    rec.source = "migrate";
    plan.push({ chat, key, turnNo: to, record: rec });
  }

  metaList.push({
    schema: 1,
    session_id: chat,
    session_key: key,
    name: chatNames[chat] || chat,
    name_source: chatNames[chat] ? "legacy" : "auto",
    range_every: config.rangeEvery,
    created_at: list[0] ? list[0].createdAt : Date.now(),
    updated_at: Date.now(),
  });
}

// 未落在 byChat 的其它会话名也保留
for (const [chat, name] of Object.entries(chatNames)) {
  const key = sanitizeKey(chat);
  if (!metaList.some(m => m.session_key === key)) {
    metaList.push({
      schema: 1,
      session_id: chat,
      session_key: key,
      name: name || chat,
      name_source: "legacy",
      range_every: config.rangeEvery,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  }
}

function buildLegacyRecord(e: LegacyEntry, chat: string, key: string, turnNo: number, kind: "turn" | "range"): MemoryRecord {
  const content = String(e.content || "");
  const parsed = parseSevenFields(content);
  let fields = parsed.fields ? normalizeFields(parsed.fields) : normalizeFields(null);
  if (!parsed.fields && content.trim()) {
    fields = buildSkeleton(content, e.createdAt || Date.now());
  }
  const raw = String(e.body || "");
  const a = assess(fields, parsed.fields ? undefined : content ? "degraded" : undefined);
  const id = String(e.id || "");
  if (usedIds.has(id)) throw new Error(`duplicate legacy id: ${id}`);
  usedIds.add(id);
  return {
    schema: 1,
    id,
    kind,
    space_id: "personal",
    session_id: chat,
    session_key: key,
    turn_no: turnNo,
    created_at: e.createdAt || Date.now(),
    updated_at: e.updatedAt || e.createdAt || Date.now(),
    revision: 1,
    updated_by: "legacy",
    field_meta: Object.fromEntries(
      [...SEVEN_FIELD_KEYS, "raw_text"].map(k => [k, { ts: e.updatedAt || e.createdAt || Date.now(), by: "legacy" }])
    ),
    fields,
    raw_text: raw,
    raw_truncated: false,
    truncated: false,
    missing: a.missing,
    blank: a.blank,
    quality: a.quality,
    tags: Array.isArray(e.tags) ? e.tags.slice(0, 4) : [],
    rating: Number(e.rating) >= 1 && Number(e.rating) <= 5 ? Number(e.rating) : 3,
    source: "migrate",
    origin: "legacy",
    legacy: {
      uid: e.uid,
      chat_id: chat,
      kind: e.kind || "event",
      content_sha256: sha256(content),
      body_sha256: sha256(raw),
      content,
      body: raw,
    },
  };
}

function copyTree(src: string, dest: string): void {
  ensureDir(dest);
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyTree(s, d);
    else if (st.isFile()) fs.copyFileSync(s, d);
  }
}

function backup(): string | null {
  if (args.noBackup) return null;
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const dest = path.join(config.root, "migration", `backup_pc_host_data_${stamp}`);
  ensureDir(dest);
  fs.copyFileSync(indexFile, path.join(dest, "index.json"));
  if (fs.existsSync(namesFile)) fs.copyFileSync(namesFile, path.join(dest, "chat_names.json"));
  if (fs.existsSync(repoDir)) copyTree(repoDir, path.join(dest, "repo"));
  return dest;
}

function apply(): number {
  let written = 0;
  const sessionDirOf = (key: string) => path.join(config.dataDir, "spaces", "personal", "sessions", key);
  for (const m of metaList) {
    ensureDir(sessionDirOf(m.session_key));
    atomicWriteJson(path.join(sessionDirOf(m.session_key), "_meta.json"), m);
  }
  for (const p of plan) {
    const dir = sessionDirOf(p.key);
    ensureDir(dir);
    atomicWriteJson(path.join(dir, recordFileName(p.record)), p.record);
    written++;
  }
  return written;
}

function verify(): { ok: boolean; total: number; turns: number; ranges: number; names: number; missing_reason: number; sha_mismatch: number; duplicate: number } {
  const repo = new RepoStore({
    dataDir: config.dataDir,
    rangeEvery: config.rangeEvery,
    rawHead: config.rawHead,
    rawTail: config.rawTail,
  });
  repo.open();
  const records = repo.all();
  const byId = new Map(records.map(r => [r.id, r]));
  let sha_mismatch = 0;
  for (const p of plan) {
    const rec = byId.get(p.record.id);
    if (!rec || !rec.legacy) {
      sha_mismatch++;
      continue;
    }
    const contentHash = sha256(String(rec.legacy.content || ""));
    const bodyHash = sha256(String(rec.legacy.body || ""));
    if (contentHash !== p.record.legacy!.content_sha256 || bodyHash !== p.record.legacy!.body_sha256) sha_mismatch++;
  }
  const sessions = repo.listSessions(true);
  const names = metasWithNames();
  const turns = records.filter(r => r.kind === "turn").length;
  const ranges = records.filter(r => r.kind === "range").length;
  const missing_reason = records.filter(r => r.missing.indexOf("原因") >= 0).length;
  const ids = new Set(records.map(r => r.id));
  const duplicate = records.length - ids.size;
  return {
    ok: records.length === plan.length && sha_mismatch === 0 && duplicate === 0,
    total: records.length,
    turns,
    ranges,
    names,
    missing_reason,
    sha_mismatch,
    duplicate,
  };
}

function metasWithNames(): number {
  let n = 0;
  const dir = path.join(config.dataDir, "spaces", "personal", "sessions");
  for (const key of listDirs(dir)) {
    const m = readJson<SessionMeta>(path.join(dir, key, "_meta.json"));
    if (m.ok && m.value && m.value.name) n++;
  }
  return n;
}

const isApply = !!args.apply;
const report: Record<string, any> = {
  generated_at: new Date().toISOString(),
  mode: isApply ? "apply" : "dry-run",
  data_dir: config.dataDir,
  legacy_dir: OLD,
  legacy_entries: entries.length,
  planned: plan.length,
  turns: plan.filter(p => p.record.kind === "turn").length,
  ranges: plan.filter(p => p.record.kind === "range").length,
  sessions: metaList.length,
  dangling_covers: dangling,
  incomplete: plan.filter(p => p.record.quality !== "complete").length,
};

if (isApply) {
  const b = backup();
  report.backup = b;
  report.written = apply();
  report.verify = verify();
}

if (args.verify) {
  report.verify = verify();
}

if (args.report) {
  ensureDir(path.dirname(path.resolve(args.report)));
  fs.writeFileSync(path.resolve(args.report), JSON.stringify({ ...report, plan_sample: plan.slice(0, 3) }, null, 2) + "\n", "utf8");
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.verify && report.verify.ok === false ? 1 : 0);

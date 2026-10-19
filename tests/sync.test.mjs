// sync.test.mjs — 多设备本地优先：字段级冲突合并 / 删除墓碑 / 旧布局迁移 / 设备标识
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RepoStore } from "../dist/store/repo.js";

const FULL = { 时间: "2026-10-19", 地点: "无", 人物: "用户", 事情: "事情A", 原因: "原因A", 结果: "结果A", 重点: "重点A" };

function makeRepo(dir, device, rangeEvery = 10) {
  const repo = new RepoStore({ dataDir: dir, rangeEvery, rawHead: 1200, rawTail: 600, deviceId: device });
  repo.open();
  return repo;
}

test("设备标识写入记录，space 目录自动建立", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-sync-"));
  const a = makeRepo(dir, "dev_aaaaaa");
  const r = a.upsertTurn({ session_id: "s1", turn_no: 1, fields: FULL });
  const rec = a.get(r.id);
  assert.equal(rec.updated_by, "dev_aaaaaa");
  assert.equal(rec.space_id, "personal");
  assert.ok(fs.existsSync(path.join(dir, "spaces", "personal", "space.json")));
});

test("冲突副本：字段级合并 + 归档报告", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-sync2-"));
  const a = makeRepo(dir, "dev_aaaaaa");
  const r = a.upsertTurn({ session_id: "s1", turn_no: 1, fields: FULL });
  const canonical = path.join(dir, "spaces", "personal", "sessions", "s1", "turn-0001.json");
  const base = JSON.parse(fs.readFileSync(canonical, "utf8"));

  // 模拟另一台设备（dev_bbbbbb）改「原因」后的 Syncthing/OneDrive 冲突副本
  const copy = JSON.parse(JSON.stringify(base));
  copy.fields["原因"] = "另一台设备改的原因";
  copy.updated_by = "dev_bbbbbb";
  copy.updated_at = base.updated_at + 5000;
  copy.field_meta["原因"] = { ts: base.updated_at + 5000, by: "dev_bbbbbb" };
  const conflictName = "turn-0001.sync-conflict-20261019-120000.json";
  fs.writeFileSync(path.join(path.dirname(canonical), conflictName), JSON.stringify(copy, null, 2));

  const b = makeRepo(dir, "dev_aaaaaa");
  const merged = b.get(r.id);
  assert.equal(merged.fields["原因"], "另一台设备改的原因", "较新的字段应胜出");
  assert.equal(merged.fields["事情"], "事情A", "未冲突字段保持原值");
  assert.ok(!fs.existsSync(path.join(path.dirname(canonical), conflictName)), "冲突副本应被移走");
  const reports = fs.readdirSync(path.join(dir, "conflicts")).filter(f => f.endsWith(".report.json"));
  assert.equal(reports.length, 1);
  const report = JSON.parse(fs.readFileSync(path.join(dir, "conflicts", reports[0]), "utf8"));
  assert.ok(report.fields.includes("原因"));
});

test("删除墓碑：其他设备打开后记录消失", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-sync3-"));
  const a = makeRepo(dir, "dev_aaaaaa");
  const r = a.upsertTurn({ session_id: "s1", turn_no: 1, fields: FULL });
  const b = makeRepo(dir, "dev_bbbbbb");
  assert.equal(b.all().length, 1);
  a.softDelete(r.id);
  assert.ok(fs.existsSync(path.join(dir, "tombstones", `${r.id}.json`)));
  const b2 = makeRepo(dir, "dev_bbbbbb");
  assert.equal(b2.all().length, 0, "墓碑应让另一设备删除本地记录");
});

test("删除后又被编辑：较新的记录保留（复活）", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-sync4-"));
  const a = makeRepo(dir, "dev_aaaaaa");
  const r = a.upsertTurn({ session_id: "s1", turn_no: 1, fields: FULL });
  a.softDelete(r.id);
  const canonical = path.join(dir, "spaces", "personal", "sessions", "s1", "turn-0001.json");
  const revived = JSON.parse(fs.readFileSync(path.join(dir, "tombstones", `${r.id}.json`), "utf8")).record;
  revived.updated_at = Date.now() + 10000;
  revived.revision = 5;
  fs.mkdirSync(path.dirname(canonical), { recursive: true });
  fs.writeFileSync(canonical, JSON.stringify(revived, null, 2));
  const b = makeRepo(dir, "dev_bbbbbb");
  assert.equal(b.all().length, 1, "updated_at 晚于墓碑的记录应保留");
});

test("旧布局 data/sessions 自动迁移到 spaces/personal/sessions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-sync5-"));
  const legacyDir = path.join(dir, "sessions", "s1");
  fs.mkdirSync(legacyDir, { recursive: true });
  const rec = {
    schema: 1,
    id: "tm_legacy01",
    kind: "turn",
    space_id: "personal",
    session_id: "s1",
    session_key: "s1",
    turn_no: 1,
    created_at: 1000,
    updated_at: 1000,
    revision: 1,
    updated_by: "legacy",
    field_meta: { 时间: { ts: 1000, by: "legacy" } },
    fields: FULL,
    raw_text: "",
    raw_truncated: false,
    truncated: false,
    missing: [],
    blank: [],
    quality: "complete",
    tags: [],
    rating: 3,
    source: "migrate",
    origin: "legacy",
  };
  fs.writeFileSync(path.join(legacyDir, "turn-0001.json"), JSON.stringify(rec));
  fs.writeFileSync(path.join(legacyDir, "_meta.json"), JSON.stringify({ schema: 1, session_id: "s1", session_key: "s1", name: "s1", name_source: "auto", range_every: 10, created_at: 1000, updated_at: 1000 }));
  const repo = makeRepo(dir, "dev_aaaaaa");
  assert.equal(repo.all().length, 1);
  assert.ok(fs.existsSync(path.join(dir, "spaces", "personal", "sessions", "s1", "turn-0001.json")));
  assert.ok(!fs.existsSync(path.join(dir, "sessions")), "旧目录应已迁走");
});

test("sync status 统计墓碑与冲突", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-sync6-"));
  const a = makeRepo(dir, "dev_aaaaaa");
  const r1 = a.upsertTurn({ session_id: "s1", turn_no: 1, fields: FULL });
  a.softDelete(r1.id);
  const st = a.syncStatus();
  assert.equal(st.tombstones, 1);
  assert.equal(st.records, 0);
  assert.equal(st.device_id, "dev_aaaaaa");
});

// edge.test.mjs — 边界输入：超长、Unicode、保留名、轮次边界、方案切换
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RepoStore } from "../dist/store/repo.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CUSTOM = JSON.parse(fs.readFileSync(path.join(ROOT, "profiles", "custom.json"), "utf8"));

function mk() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-edge-"));
  const repo = new RepoStore({ dataDir: dir, rangeEvery: 99, rawHead: 1200, rawTail: 600 });
  repo.open();
  return { dir, repo };
}

const F = (事情, extra = {}) => ({ 时间: "今天", 事情, 结果: "ok", ...extra });

test("超长字段被截断到 5000 并标记 truncated（保存与编辑都生效）", () => {
  const { repo } = mk();
  const r = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: { 时间: "今天", 事情: "长".repeat(50000) } });
  const rec = repo.get(r.id);
  assert.equal(rec.fields["事情"].length, 5000);
  assert.equal(rec.truncated, true);
  assert.ok(rec.fields["事情"].endsWith("…"));

  repo.update({ id: r.id, fields: { 事情: "改".repeat(30000) } });
  assert.equal(repo.get(r.id).fields["事情"].length, 5000);
});

test("正常长度不触发 truncated", () => {
  const { repo } = mk();
  const r = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: F("短内容") });
  assert.equal(repo.get(r.id).truncated, false);
});

test("超长原文按头尾窗口截断（raw_truncated）", () => {
  const { repo } = mk();
  const raw = "头".repeat(1000) + "尾".repeat(1000);
  const r = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: F("原文很长"), raw_text: raw });
  const rec = repo.get(r.id);
  assert.equal(rec.raw_truncated, true);
  assert.ok(rec.raw_text.length < raw.length);
  assert.ok(rec.raw_text.startsWith("头"));
  assert.ok(rec.raw_text.endsWith("尾"));
});

test("emoji 会话名退化为 default-<hash>，但不同 emoji 不碰撞", () => {
  const { repo } = mk();
  const a = repo.upsertTurn({ session_id: "🎭🎭", turn_no: 1, fields: F("emoji 会话 A") });
  const b = repo.upsertTurn({ session_id: "🎬🎬", turn_no: 1, fields: F("emoji 会话 B") });
  assert.match(a.session_key, /^default-[0-9a-f]{6}$/);
  assert.notEqual(a.session_key, b.session_key);
});

test("Windows 保留名加 -k 后缀，不会生成非法目录", () => {
  const { repo } = mk();
  const r = repo.upsertTurn({ session_id: "con", turn_no: 1, fields: F("保留名") });
  assert.match(r.session_key, /^con-k-[0-9a-f]{6}$/);
  assert.equal(repo.get(r.id).fields["事情"], "保留名");
});

test("大小写不同视为不同会话（不合并）", () => {
  const { repo } = mk();
  const a = repo.upsertTurn({ session_id: "AB", turn_no: 1, fields: F("大写") });
  const b = repo.upsertTurn({ session_id: "ab", turn_no: 1, fields: F("小写") });
  assert.notEqual(a.session_key, b.session_key);
  assert.equal(repo.all().length, 2);
});

test("turn_no 越界一律拒绝（0 / 负数 / 超上限 / Infinity）", () => {
  const { repo } = mk();
  for (const bad of [0, -5, 1000001, 1e309]) {
    assert.throws(() => repo.upsertTurn({ session_id: "s1", turn_no: bad, fields: F("x") }), /turn_no/, `turn_no=${bad} 应被拒`);
  }
});

test("同一轮号：turn 与 range 不互相覆盖", () => {
  const { repo } = mk();
  repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: F("普通轮") });
  repo.upsertRange({ session_id: "s1", range_from: 1, range_to: 1, fields: F("范围总结"), covers: [] });
  const all = repo.all();
  assert.equal(all.length, 2);
  assert.equal(all.filter(r => r.kind === "turn").length, 1);
  assert.equal(all.filter(r => r.kind === "range").length, 1);
});

test("更新不存在的记录 → NOT_FOUND", () => {
  const { repo } = mk();
  assert.throws(() => repo.update({ id: "tm_nope", fields: { 事情: "x" } }), /not found/i);
});

test("切换方案后，写入非当前方案被拒（PROFILE_INACTIVE）", () => {
  const { repo } = mk();
  repo.installProfile(CUSTOM);
  repo.setActiveProfile("custom");
  assert.throws(
    () => repo.upsertTurn({ session_id: "s1", turn_no: 1, profile: "general", fields: F("旧方案写入") }),
    e => e.code === "PROFILE_INACTIVE"
  );
  // 当前方案可以写
  const ok = repo.upsertTurn({ session_id: "s1", turn_no: 1, profile: "custom", fields: { 时间: "今天", 事件: "新方案" } });
  assert.equal(ok.profile, "custom");
});

test("只有原文没有字段 → 生成骨架记录并标 degraded", () => {
  const { repo } = mk();
  const r = repo.upsertTurn({ session_id: "s1", turn_no: 1, raw_text: "用户说了一句话" });
  const rec = repo.get(r.id);
  assert.equal(rec.quality, "degraded");
  assert.ok(Object.values(rec.fields).some(v => String(v).includes("用户说了一句话")));
});

test("Unicode 字段内容与标签原样保留", () => {
  const { repo } = mk();
  const r = repo.upsertTurn({
    session_id: "s1_té́st",
    turn_no: 1,
    fields: F("emoji 🎯 混排 content", { 人物: "Zoë、李雷" }),
    tags: ["断剑", "emoji🎯"],
  });
  const rec = repo.get(r.id);
  assert.equal(rec.fields["人物"], "Zoë、李雷");
  assert.equal(rec.fields["事情"], "emoji 🎯 混排 content");
  assert.ok(rec.tags.includes("断剑"));
});

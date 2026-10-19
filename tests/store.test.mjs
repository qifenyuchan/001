// store.test.mjs — 原子存储/天然键/回收站/分页/缺口
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RepoStore } from "../dist/store/repo.js";

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-store-"));
  const repo = new RepoStore({ dataDir: dir, rangeEvery: 10, rawHead: 1200, rawTail: 600 });
  repo.open();
  return { dir, repo };
}

const FULL = { 时间: "2026-10-19", 地点: "无", 人物: "用户", 事情: "事情A", 原因: "原因A", 结果: "结果A", 重点: "重点A" };

test("保存一轮：目录出现 _meta/turn/.rev", () => {
  const { dir, repo } = tmpStore();
  const r = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: FULL });
  assert.equal(r.ok, true);
  assert.equal(r.quality, "complete");
  assert.ok(fs.existsSync(path.join(dir, "sessions", "s1", "_meta.json")));
  assert.ok(fs.existsSync(path.join(dir, "sessions", "s1", "turn-0001.json")));
  assert.ok(fs.existsSync(path.join(dir, "sessions", "s1", ".rev")));
});

test("同 turn_no 重存：不新增文件、revision+1、旧版进回收站", () => {
  const { dir, repo } = tmpStore();
  repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: FULL });
  const r2 = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: { ...FULL, 事情: "事情A修订" } });
  assert.equal(r2.created, false);
  const files = fs.readdirSync(path.join(dir, "sessions", "s1")).filter(f => f.startsWith("turn-"));
  assert.equal(files.length, 1);
  const rec = repo.all()[0];
  assert.equal(rec.revision, 2);
  assert.ok(fs.readdirSync(path.join(dir, ".trash")).length >= 1);
});

test("只给 raw：骨架落库 quality=degraded", () => {
  const { repo } = tmpStore();
  const r = repo.upsertTurn({ session_id: "s1", raw_text: "用户提问后回答被截断，只剩原文。" });
  assert.equal(r.ok, true);
  assert.equal(r.quality, "degraded");
  assert.equal(repo.all().length, 1);
});

test("空输入：EMPTY_INPUT 由工具层拒绝（repo 仍会造骨架）", () => {
  const { repo } = tmpStore();
  // repo 层不乱丢：空字段+空 raw 也保存为 degraded（工具层才拦 EMPTY_INPUT）
  const r = repo.upsertTurn({ session_id: "s1", fields: {} });
  assert.equal(r.quality, "degraded");
});

test("删除 → 回收站 → 恢复闭环", () => {
  const { repo } = tmpStore();
  const r = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: FULL });
  const d = repo.softDelete(r.id);
  assert.equal(repo.all().length, 0);
  assert.equal(repo.trashList().length, 1);
  const rec = repo.restore(d.trash_id);
  assert.equal(rec.id, r.id);
  assert.equal(repo.all().length, 1);
});

test("恢复冲突：目标已存在时 CONFLICT", () => {
  const { repo } = tmpStore();
  const r = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: FULL });
  const d = repo.softDelete(r.id);
  repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: FULL });
  assert.throws(() => repo.restore(d.trash_id), /already exists/);
});

test("列表分页与按会话过滤", () => {
  const { repo } = tmpStore();
  for (let i = 1; i <= 25; i++) repo.upsertTurn({ session_id: "s1", turn_no: i, fields: { ...FULL, 事情: "第" + i + "轮" } });
  repo.upsertTurn({ session_id: "s2", turn_no: 1, fields: FULL });
  const p1 = repo.list({ session_key: "s1", page: 1, page_size: 20 });
  assert.equal(p1.total, 25);
  assert.equal(p1.records.length, 20);
  assert.equal(p1.pages, 2);
  const p2 = repo.list({ session_key: "s1", page: 2, page_size: 20 });
  assert.equal(p2.records.length, 5);
  const s2 = repo.list({ session_key: "s2" });
  assert.equal(s2.total, 1);
});

test("nextTurnNo 与缺口计算", () => {
  const { repo } = tmpStore();
  repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: FULL });
  repo.upsertTurn({ session_id: "s1", turn_no: 3, fields: FULL });
  assert.equal(repo.nextTurnNo("s1"), 4);
  assert.deepEqual(repo.gapsFor("s1"), [2]);
});

test("编辑带乐观锁：revision 不匹配抛 CONFLICT", () => {
  const { repo } = tmpStore();
  const r = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: FULL });
  repo.update({ id: r.id, fields: { 事情: "改1" }, expect_revision: 1 });
  assert.throws(() => repo.update({ id: r.id, fields: { 事情: "改2" }, expect_revision: 1 }), /revision mismatch/);
});

test("编辑清空字段：空串覆盖生效、missing 更新", () => {
  const { repo } = tmpStore();
  const r = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: FULL });
  const u = repo.update({ id: r.id, fields: { 原因: "" } });
  assert.equal(u.fields["原因"], "");
  assert.ok(u.missing.includes("原因"));
  assert.equal(u.quality, "partial");
});

test("原生记录 origin=native、legacy 记录带 legacy 元数据", () => {
  const { repo } = tmpStore();
  const r = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: FULL });
  assert.equal(repo.get(r.id).origin, "native");
  const raw = fs.readFileSync(path.join(repo.dataDir, "sessions", "s1", "turn-0001.json"), "utf8");
  const obj = JSON.parse(raw);
  assert.equal(obj.origin, "native");
  assert.equal(obj.legacy, undefined);
});

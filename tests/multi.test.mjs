// multi.test.mjs — 多实例（模拟多设备/多进程）共用同一 data 目录
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RepoStore } from "../dist/store/repo.js";

const sleep = ms => new Promise(r => setTimeout(r, ms));

function two() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-multi-"));
  const mk = () => {
    const r = new RepoStore({ dataDir: dir, rangeEvery: 99, rawHead: 1200, rawTail: 600 });
    r.open();
    return r;
  };
  return { dir, a: mk(), b: mk() };
}

const F = (事情) => ({ 时间: "今天", 事情, 结果: "ok" });

test("A 写入后 B 能看到（无需重启，靠 .rev 刷新）", async () => {
  const { a, b } = two();
  const saved = a.upsertTurn({ session_id: "s1", turn_no: 1, fields: F("A 写的") });
  await sleep(8);
  assert.equal(b.all().length, 1);
  assert.equal(b.get(saved.id).fields["事情"], "A 写的");
});

test("A 删除后 B 刷新即消失（墓碑传播）", async () => {
  const { a, b } = two();
  const saved = a.upsertTurn({ session_id: "s1", turn_no: 1, fields: F("待删") });
  await sleep(8);
  assert.ok(b.get(saved.id));
  a.softDelete(saved.id);
  await sleep(8);
  assert.equal(b.get(saved.id), undefined);
});

test("乐观锁：旧 revision 的写入被拒（CONFLICT）", async () => {
  const { a, b } = two();
  const saved = a.upsertTurn({ session_id: "s1", turn_no: 1, fields: F("初版") });
  await sleep(8);
  const seenByB = b.get(saved.id);
  assert.equal(seenByB.revision, 1);

  a.update({ id: saved.id, fields: { 事情: "A 改的" }, expect_revision: 1 });
  await sleep(8);
  assert.throws(
    () => b.update({ id: saved.id, fields: { 事情: "B 改的" }, expect_revision: 1 }),
    e => e.code === "CONFLICT"
  );
  // 用最新 revision 就能写
  const fresh = b.get(saved.id);
  b.update({ id: saved.id, fields: { 事情: "B 改的" }, expect_revision: fresh.revision });
  assert.equal(a.all().length, 1);
});

test("两个实例交替写不同会话，记录不丢", async () => {
  const { a, b } = two();
  for (let i = 1; i <= 5; i++) {
    a.upsertTurn({ session_id: "sa", turn_no: i, fields: F(`A-${i}`) });
    b.upsertTurn({ session_id: "sb", turn_no: i, fields: F(`B-${i}`) });
    await sleep(6);
  }
  assert.equal(a.all().length, 10);
  assert.equal(b.all().length, 10);
  const byKey = k => a.all().filter(r => r.session_key === k).length;
  assert.equal(byKey("sa"), 5);
  assert.equal(byKey("sb"), 5);
});

test("两个实例写同一轮：后写覆盖，revision 递增，不产生两个文件", async () => {
  const { a, b, dir } = two();
  a.upsertTurn({ session_id: "s1", turn_no: 1, fields: F("A 先写") });
  await sleep(8);
  b.upsertTurn({ session_id: "s1", turn_no: 1, fields: F("B 后写") });

  const all = a.all();
  assert.equal(all.length, 1, "同一轮只能有一条");
  assert.equal(all[0].revision, 2);
  const files = fs
    .readdirSync(path.join(dir, "spaces", "personal", "sessions", "s1"))
    .filter(f => f.startsWith("turn-") && f.endsWith(".json"));
  assert.equal(files.length, 1);
});

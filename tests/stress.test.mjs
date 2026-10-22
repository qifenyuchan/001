// stress.test.mjs — 压力测试轮的回归：规模敏感性与刷新成本
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RepoStore } from "../dist/store/repo.js";

const FULL = n => ({
  时间: "2026-10-22",
  地点: "本机",
  人物: "运维",
  事情: `第 ${n} 轮：部署流水线夜间失败`,
  原因: "配置漂移",
  结果: "回滚后恢复",
  重点: "加发布前校验",
});

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ns-stress-reg-"));
}
function makeRepo(dir, device = "dev_stress1") {
  const r = new RepoStore({ dataDir: dir, rangeEvery: 9999, rawHead: 1200, rawTail: 600, deviceId: device });
  r.open();
  return r;
}
function p50(list) {
  const a = [...list].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}
function timeIt(fn) {
  const t = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - t) / 1e6;
}

test("P-1 读性能与会话数无关：200 会话的 get 不能比 8 会话慢一个量级", () => {
  function build(sessions, perSession) {
    const dir = tmp();
    const repo = makeRepo(dir);
    let n = 0;
    for (let t = 1; t <= perSession; t++) {
      for (let k = 0; k < sessions; k++) repo.upsertTurn({ session_id: `w${k}`, turn_no: t, fields: FULL(++n) });
    }
    return repo;
  }
  const wide = build(200, 1);
  const deep = build(8, 25);
  const idW = wide.all()[0].id;
  const idD = deep.all()[0].id;
  const w = [];
  const d = [];
  for (let i = 0; i < 80; i++) w.push(timeIt(() => wide.get(idW)));
  for (let i = 0; i < 80; i++) d.push(timeIt(() => deep.get(idD)));
  const pw = p50(w);
  const pd = p50(d);
  assert.ok(pw < 5, `200 会话时单次 get p50 ${pw.toFixed(2)}ms，超过 5ms 说明每次操作都在逐个会话 stat`);
  assert.ok(pw < Math.max(pd * 8, 3), `会话数放大 ${(pw / Math.max(0.01, pd)).toFixed(1)}x（${pw.toFixed(2)} vs ${pd.toFixed(2)}ms）`);
});

test("P-2 来路不明的会话目录不能让每次操作都整库重扫", () => {
  const dir = tmp();
  const repo = makeRepo(dir);
  for (let i = 1; i <= 400; i++) repo.upsertTurn({ session_id: `s${i % 10}`, turn_no: Math.floor(i / 10) + 1, fields: FULL(i) });
  // 名字含空格/点号的目录：加载时被跳过，但仍要计入「目录数」，否则 sessions.size 永远对不上
  fs.mkdirSync(path.join(dir, "spaces", "personal", "sessions", "bad dir.name"), { recursive: true });
  const fresh = makeRepo(dir);
  const id = fresh.all()[0].id;
  const lat = [];
  for (let i = 0; i < 60; i++) lat.push(timeIt(() => fresh.get(id)));
  const p = p50(lat);
  assert.ok(p < 5, `单次 get p50 ${p.toFixed(2)}ms：可疑目录正在触发每次操作的整库重扫`);
  assert.ok(fresh.all().length === 400, "记录数不应受可疑目录影响");
});

test("P-3 跨实例写入仍然立即可见（空间级 rev 快路径没破坏可见性）", () => {
  const dir = tmp();
  const a = makeRepo(dir, "dev_aaaaaa");
  const b = makeRepo(dir, "dev_bbbbbb");
  const r = a.upsertTurn({ session_id: "share", turn_no: 1, fields: FULL(1) });
  assert.equal(b.all().length, 1, "B 在 A 写入后应立刻看到");
  a.update({ id: r.id, fields: { 事情: "A 改过的事情" } });
  assert.equal(b.get(r.id).fields["事情"], "A 改过的事情", "编辑也要立刻可见");
  a.softDelete(r.id);
  assert.equal(b.all().length, 0, "删除（墓碑）也要立刻可见");
});

test("P-4 外部工具改动（不经过本进程写 .rev）在 1 秒深检窗口内可见", async () => {
  const dir = tmp();
  const repo = makeRepo(dir);
  repo.upsertTurn({ session_id: "ext", turn_no: 1, fields: FULL(1) });
  const sdir = path.join(dir, "spaces", "personal", "sessions", "ext");
  const before = repo.all().length;
  // 模拟同步盘丢进来一个新区轮次（只改会话目录里的 .rev，不动空间级 rev）
  const extra = { ...repo.all()[0], id: "tm_external01", turn_no: 2, fields: FULL(2) };
  fs.writeFileSync(path.join(sdir, "turn-0002.json"), JSON.stringify(extra, null, 2));
  fs.writeFileSync(path.join(sdir, ".rev"), String(Date.now()), "utf8");
  await new Promise(r => setTimeout(r, 1100));
  const after = repo.all().length;
  assert.equal(before, 1);
  assert.equal(after, 2, "外部落盘的文件应在深检窗口（1s）内被加载");
});

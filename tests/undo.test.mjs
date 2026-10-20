// undo.test.mjs — 版本回滚：查看历史 / 回退一步 / 回退多步 / 删除后恢复
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RepoStore } from "../dist/store/repo.js";

function mk() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-undo-"));
  const repo = new RepoStore({ dataDir: dir, rangeEvery: 999, rawHead: 1200, rawTail: 600 });
  repo.open();
  return { dir, repo };
}

function threeVersions(repo) {
  const r1 = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: { 时间: "今天", 事情: "第一版" } });
  repo.update({ id: r1.id, fields: { 事情: "第二版" } });
  repo.update({ id: r1.id, fields: { 事情: "第三版" } });
  return r1.id;
}

test("versions：能看到被编辑前的历史版本，按时间倒序", () => {
  const { repo } = mk();
  const id = threeVersions(repo);
  const hist = repo.historyOf(id);
  assert.equal(hist.length, 2);
  assert.equal(hist[0].record.fields["事情"], "第二版");
  assert.equal(hist[1].record.fields["事情"], "第一版");
  assert.ok(hist[0].deleted_at >= hist[1].deleted_at);
});

test("undo：回退一步回到上一版，revision 继续递增", () => {
  const { repo } = mk();
  const id = threeVersions(repo);
  assert.equal(repo.get(id).revision, 3);

  const r = repo.undo(id);
  assert.equal(r.record.fields["事情"], "第二版");
  assert.equal(repo.get(id).revision, 4, "回滚也要留 revision 痕迹");
  assert.equal(repo.historyOf(id).length, 2, "当前版本(第三版)应进 trash");
});

test("undo --steps 2：一次退到最初版本", () => {
  const { repo } = mk();
  const id = threeVersions(repo);
  const r = repo.undo(id, 2);
  assert.equal(r.record.fields["事情"], "第一版");
  assert.equal(r.from.record.fields["事情"], "第一版");
});

test("undo 本身可撤销（再 undo 回到刚才的状态）", () => {
  const { repo } = mk();
  const id = threeVersions(repo);
  repo.undo(id); // → 第二版
  assert.equal(repo.get(id).fields["事情"], "第二版");
  repo.undo(id); // → 回到第三版
  assert.equal(repo.get(id).fields["事情"], "第三版");
});

test("删除后仍可 undo 恢复（墓碑也是历史）", () => {
  const { repo } = mk();
  const r1 = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: { 时间: "今天", 事情: "要删除的" } });
  repo.softDelete(r1.id);
  assert.ok(!repo.get(r1.id));
  const r = repo.undo(r1.id);
  assert.equal(r.record.fields["事情"], "要删除的");
  assert.ok(repo.get(r1.id), "应恢复为可读记录");
});

test("没有历史 / 步数超范围时报错", () => {
  const a = mk();
  const fresh = a.repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: { 时间: "今天", 事情: "从未编辑" } });
  assert.throws(() => a.repo.undo(fresh.id), /no history/);

  const b = mk();
  const id = threeVersions(b.repo);
  assert.throws(() => b.repo.undo(id, 9), /only 2 historical/);
});

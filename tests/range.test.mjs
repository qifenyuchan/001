// range.test.mjs — 每 N 轮自动范围总结与 Agent 升级覆盖
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RepoStore } from "../dist/store/repo.js";
import { buildAutoRange } from "../dist/features/range.js";

function tmpRepo(n = 3) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-range-"));
  const repo = new RepoStore({ dataDir: dir, rangeEvery: n, rawHead: 1200, rawTail: 600 });
  repo.open();
  return repo;
}
const f = (i) => ({ 时间: "2026-10-19", 地点: "无", 人物: "用户", 事情: "第" + i + "轮事情", 原因: "原因" + i, 结果: "结果" + i, 重点: "重点" + i });

test("第 N 轮保存返回 range_due", () => {
  const repo = tmpRepo(3);
  repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: f(1) });
  repo.upsertTurn({ session_id: "s1", turn_no: 2, fields: f(2) });
  const r3 = repo.upsertTurn({ session_id: "s1", turn_no: 3, fields: f(3) });
  assert.equal(r3.range_due, true);
});

test("自动范围条：covers 完整、区间正确", () => {
  const repo = tmpRepo(3);
  const ids = [];
  for (let i = 1; i <= 3; i++) ids.push(repo.upsertTurn({ session_id: "s1", turn_no: i, fields: f(i) }).id);
  const r = buildAutoRange(repo, "s1", 1, 3);
  assert.equal(r.ok, true);
  const rec = repo.all().find(x => x.kind === "range");
  assert.ok(rec);
  assert.deepEqual(rec.range, { from: 1, to: 3, covers: ids, unresolved: [] });
  assert.equal(rec.auto, true);
  assert.equal(rec.source, "auto-range");
  assert.match(rec.fields["事情"], /第1轮事情/);
  assert.match(rec.fields["结果"], /结果3/);
});

test("不足 2 轮：不生成范围条", () => {
  const repo = tmpRepo(3);
  repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: f(1) });
  const r = buildAutoRange(repo, "s1", 1, 3);
  assert.equal(r.ok, false);
});

test("Agent 升级：同区间覆盖为精编（auto=false）", () => {
  const repo = tmpRepo(3);
  for (let i = 1; i <= 3; i++) repo.upsertTurn({ session_id: "s1", turn_no: i, fields: f(i) });
  buildAutoRange(repo, "s1", 1, 3);
  repo.upsertRange({ session_id: "s1", range_from: 1, range_to: 3, fields: { ...f(1), 事情: "精编版范围", 重点: "精编重点" }, covers: ["x"], source: "agent" });
  const ranges = repo.all().filter(x => x.kind === "range");
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0].auto, false);
  assert.match(ranges[0].fields["事情"], /精编版范围/);
});

test("已有范围条后同轮重存不再提示 range_due", () => {
  const repo = tmpRepo(3);
  for (let i = 1; i <= 3; i++) repo.upsertTurn({ session_id: "s1", turn_no: i, fields: f(i) });
  buildAutoRange(repo, "s1", 1, 3);
  const again = repo.upsertTurn({ session_id: "s1", turn_no: 3, fields: { ...f(3), 事情: "第3轮修订" } });
  assert.equal(again.range_due, false);
});

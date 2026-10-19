// recall.test.mjs — 注入严格 1 条/预算/空态/隔离/缺口
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RepoStore } from "../dist/store/repo.js";
import { recall } from "../dist/features/inject.js";

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-recall-"));
  const repo = new RepoStore({ dataDir: dir, rangeEvery: 10, rawHead: 1200, rawTail: 600 });
  repo.open();
  return repo;
}
const f = (i) => ({ 时间: "2026-10-19", 地点: "无", 人物: "用户", 事情: "第" + i + "轮事情", 原因: "原因" + i, 结果: "结果" + i, 重点: "重点" + i });

test("只返回紧邻上一轮（5 轮历史只出第 5 轮）", () => {
  const repo = tmpRepo();
  for (let i = 1; i <= 5; i++) repo.upsertTurn({ session_id: "s1", turn_no: i, fields: f(i), raw_text: "原始第" + i + "轮" });
  const r = recall(repo, { session_id: "s1" }, 1200);
  assert.equal(r.found, true);
  assert.match(r.text, /第5轮事情/);
  for (let i = 1; i <= 4; i++) assert.doesNotMatch(r.text, new RegExp("第" + i + "轮事情"));
  assert.equal(r.text.includes("原始第"), false, "注入块不得包含 raw 原文");
  assert.equal(r.next_turn_no, 6);
});

test("预算裁剪：超长字段仍 ≤ max_chars", () => {
  const repo = tmpRepo();
  const long = "很长的内容".repeat(400);
  repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: { ...f(1), 事情: long, 结果: long, 重点: long, 原因: long } });
  const r = recall(repo, { session_id: "s1" }, 1200);
  assert.ok(r.text.length <= 1200, "length=" + r.text.length);
  assert.match(r.text, /已截断/);
});

test("空会话：found=false 且给出 next_turn_no", () => {
  const repo = tmpRepo();
  const r = recall(repo, { session_id: "empty" }, 1200);
  assert.equal(r.found, false);
  assert.equal(r.next_turn_no, 1);
});

test("会话隔离：s1 的记忆不出现在 s2", () => {
  const repo = tmpRepo();
  repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: { ...f(1), 事情: "s1专属事情" } });
  repo.upsertTurn({ session_id: "s2", turn_no: 1, fields: { ...f(1), 事情: "s2专属事情" } });
  const r = recall(repo, { session_id: "s2" }, 1200);
  assert.match(r.text, /s2专属事情/);
  assert.doesNotMatch(r.text, /s1专属事情/);
});

test("缺口可见：删掉中间一轮后 recall 仍注入最后一轮并提示缺口", () => {
  const repo = tmpRepo();
  for (let i = 1; i <= 5; i++) repo.upsertTurn({ session_id: "s1", turn_no: i, fields: f(i) });
  const r4 = repo.all().find(x => x.turn_no === 4);
  repo.softDelete(r4.id);
  const r = recall(repo, { session_id: "s1" }, 1200);
  assert.match(r.text, /第5轮事情/);
  assert.equal(r.gap, true);
  assert.match(r.text, /缺少总结/);
});

test("before_turn_no 边界生效", () => {
  const repo = tmpRepo();
  for (let i = 1; i <= 3; i++) repo.upsertTurn({ session_id: "s1", turn_no: i, fields: f(i) });
  const r = recall(repo, { session_id: "s1", before_turn_no: 3 }, 1200);
  assert.match(r.text, /第2轮事情/);
});

test("范围摘要 scope=range 返回最近范围条", () => {
  const repo = tmpRepo();
  repo.upsertRange({ session_id: "s1", range_from: 1, range_to: 5, fields: { ...f(1), 事情: "范围摘要事情" }, covers: ["a", "b"] });
  const r = recall(repo, { session_id: "s1", scope: "range" }, 1200);
  assert.equal(r.found, true);
  assert.match(r.text, /范围摘要事情/);
  assert.match(r.text, /最近范围记忆/);
});

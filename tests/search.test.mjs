// search.test.mjs — 中文 bigram 检索/字段权重/会话过滤/空查询
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RepoStore } from "../dist/store/repo.js";
import { searchRecords } from "../dist/features/search.js";

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-search-"));
  const repo = new RepoStore({ dataDir: dir, rangeEvery: 10, rawHead: 1200, rawTail: 600 });
  repo.open();
  return repo;
}
const base = { 时间: "2026-10-19", 地点: "无", 人物: "用户", 原因: "原因", 结果: "结果", 重点: "重点" };

test("中文查询命中（bigram）", () => {
  const repo = tmpRepo();
  repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: { ...base, 事情: "排查记忆写入链断链问题" } });
  repo.upsertTurn({ session_id: "s1", turn_no: 2, fields: { ...base, 事情: "调整 UI 分页样式" } });
  const r = searchRecords(repo, "记忆写入");
  assert.ok(r.total >= 1);
  assert.match(r.results[0].title, /记忆写入/);
});

test("字段权重：事情命中优先于原文命中", () => {
  const repo = tmpRepo();
  repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: { ...base, 事情: "记忆检索优化" } });
  repo.upsertTurn({ session_id: "s1", turn_no: 2, fields: { ...base, 事情: "无关任务" }, raw_text: "记忆 检索 优化 随便提了一下" });
  const r = searchRecords(repo, "记忆检索");
  assert.equal(r.results[0].turn_no, 1);
});

test("limit 生效", () => {
  const repo = tmpRepo();
  for (let i = 1; i <= 10; i++) repo.upsertTurn({ session_id: "s1", turn_no: i, fields: { ...base, 事情: "记忆测试第" + i + "轮" } });
  const r = searchRecords(repo, "记忆测试", { limit: 3 });
  assert.equal(r.results.length, 3);
});

test("会话过滤", () => {
  const repo = tmpRepo();
  repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: { ...base, 事情: "AAA 专项" } });
  repo.upsertTurn({ session_id: "s2", turn_no: 1, fields: { ...base, 事情: "AAA 专项" } });
  const r = searchRecords(repo, "专项", { session_key: "s1" });
  assert.ok(r.results.every(x => x.session_key === "s1"));
});

test("无命中/空查询返回空", () => {
  const repo = tmpRepo();
  repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: base });
  assert.equal(searchRecords(repo, "完全不存在的词").results.length, 0);
  assert.equal(searchRecords(repo, "").results.length, 0);
});

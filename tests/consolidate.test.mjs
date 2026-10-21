// consolidate.test.mjs — 巩固：候选、写入、覆盖更新、可回滚、检索优先、不删原轮次
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RepoStore } from "../dist/store/repo.js";
import { recall } from "../dist/features/inject.js";
import { searchRecords } from "../dist/features/search.js";
import { createTools } from "../dist/mcp/tools.js";

const F = (事情, extra = {}) => ({ 时间: "今天", 事情, 结果: "ok", ...extra });

function mk() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-cons-"));
  const repo = new RepoStore({ dataDir: dir, rangeEvery: 99, rawHead: 1200, rawTail: 600 });
  repo.open();
  const turns = [1, 2, 3].map(n =>
    repo.upsertTurn({ session_id: "长夜", turn_no: n, fields: F(`第${n}轮：断剑相关`, { 时间: `第${n}章` }) })
  );
  return { dir, repo, turns };
}

const cons = (repo, extra = {}) =>
  repo.upsertConsolidation({
    session_id: "长夜",
    kind: "consolidation",
    theme: "断剑线索",
    covers: ["1", "3"],
    fields: { 时间: "一至三章", 事情: "断剑是全书线索", 结果: "第三章被夺", 重点: "后续会断裂" },
    ...extra,
  });

test("候选：只列还没被巩固覆盖的轮次", () => {
  const { repo } = mk();
  assert.deepEqual(repo.uncoveredTurns("长夜").map(r => r.turn_no), [1, 2, 3]);
  cons(repo);
  assert.deepEqual(repo.uncoveredTurns("长夜").map(r => r.turn_no), [2], "1、3 已被覆盖");
});

test("写入：kind / theme / covers / 文件名都对，原轮次保留", () => {
  const { repo, dir } = mk();
  const r = cons(repo);
  assert.equal(r.kind, "consolidation");
  assert.equal(r.theme, "断剑线索");
  assert.equal(r.created, true);

  const rec = repo.get(r.id);
  assert.equal(rec.kind, "consolidation");
  assert.deepEqual(rec.range.covers, ["1", "3"]);
  assert.equal(rec.range.from, 1);
  assert.equal(rec.range.to, 3);
  assert.ok(rec.tags.includes("巩固"));

  const files = fs.readdirSync(path.join(dir, "spaces", "personal", "sessions", "长夜"));
  assert.ok(files.includes("cons-0001-0003.json"), files.join(","));
  assert.equal(files.filter(f => f.startsWith("turn-")).length, 3, "原轮次一个都不能少");
  assert.equal(repo.all().length, 4);
});

test("重复巩固同一段：覆盖更新，revision 递增，不产生第二条", () => {
  const { repo } = mk();
  const a = cons(repo);
  const b = cons(repo, { fields: { 时间: "一至三章", 事情: "断剑线索（修订）", 结果: "被夺", 重点: "会断" } });
  assert.equal(a.id, b.id);
  assert.equal(b.created, false);
  assert.equal(repo.get(a.id).revision, 2);
  assert.match(repo.get(a.id).fields["事情"], /修订/);
  assert.equal(repo.all().filter(r => r.kind === "consolidation").length, 1);
});

test("缺 theme 或 covers 一律报错", () => {
  const { repo } = mk();
  assert.throws(() => cons(repo, { theme: "" }), e => e.code === "INVALID_ARG");
  assert.throws(() => cons(repo, { covers: [] }), e => e.code === "INVALID_ARG");
  assert.throws(() => cons(repo, { covers: ["abc"] }), e => e.code === "INVALID_ARG");
});

test("巩固记录不进「上一轮注入」，也不改变轮次编号", () => {
  const { repo } = mk();
  cons(repo);
  const r = recall(repo, { session_id: "长夜" }, 1200);
  assert.equal(r.found, true);
  assert.match(r.text, /第3轮/, "上一轮仍是最新的 turn，不是巩固记录");
  assert.equal(r.next_turn_no, 4, "巩固不应推进轮次编号");
});

test("检索：主题命中让巩固记录排到前面", () => {
  const { repo } = mk();
  cons(repo);
  const hits = searchRecords(repo, "断剑", { limit: 5 });
  assert.equal(hits.results[0].kind, "consolidation", "同一关键词下，收敛后的结论优先");
  assert.equal(hits.results[0].title, "断剑是全书线索");
});

test("巩固可以撤销：改过一次后能 undo 回上一版", () => {
  const { repo } = mk();
  const a = cons(repo);
  cons(repo, { fields: { 时间: "一至三章", 事情: "改坏了", 结果: "x", 重点: "y" } });
  assert.equal(repo.get(a.id).fields["事情"], "改坏了");
  const undone = repo.undo(a.id);
  assert.match(undone.record.fields["事情"], /断剑是全书线索/);
});

test("删除巩固记录不影响原轮次（巩固≠覆盖）", () => {
  const { repo } = mk();
  const r = cons(repo);
  repo.softDelete(r.id);
  assert.equal(repo.all().filter(x => x.kind === "turn").length, 3);
  assert.deepEqual(repo.uncoveredTurns("长夜").map(x => x.turn_no), [1, 2, 3], "删掉巩固后轮次重新变为未覆盖");
});

test("MCP：memory_save 可以写巩固记录（不新增工具）", () => {
  const { repo } = mk();
  const tools = createTools(repo, { recallMaxChars: 1200 });
  const out = JSON.parse(
    tools.callTool("memory_save", {
      session_id: "长夜",
      kind: "consolidation",
      theme: "断剑线索",
      covers: ["1", "3"],
      fields: { 时间: "一至三章", 事情: "断剑是主线", 结果: "被夺", 重点: "会断" },
    }).content[0].text
  );
  assert.equal(out.kind, "consolidation");
  assert.equal(out.theme, "断剑线索");
  assert.equal(repo.get(out.id).kind, "consolidation");
  // 缺 theme 时报错但仍返回结构化错误
  const bad = tools.callTool("memory_save", { session_id: "长夜", kind: "consolidation", covers: ["1"], fields: { 事情: "x" } });
  assert.equal(bad.isError, true);
});

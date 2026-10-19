// migrate.test.mjs — 合成旧库迁移：条数/哈希/幂等/悬空引用
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function buildLegacy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-legacy-"));
  const data = path.join(dir, "data");
  fs.mkdirSync(path.join(data, "repo", "zctest01"), { recursive: true });
  fs.mkdirSync(path.join(data, "repo", "zctest02"), { recursive: true });
  const seven = (shi, extra = {}) => `时间：2026-10-01\n地点：无\n人物：用户\n事情：${shi}\n原因：原因\n结果：${extra.guo || "结果"}\n重点：重点`;
  const e1 = {
    uid: "u_1", id: "tm_aaa1", chatId: "zctest01", createdAt: 1000, updatedAt: 1000, source: "fallback",
    tags: ["测试"], rating: 4, title: "第一轮", content: seven("第一轮事情"), kind: "event", body: "【问】q1【答】a1",
  };
  const e2 = {
    uid: "u_2", id: "tm_aaa2", chatId: "zctest01", createdAt: 2000, updatedAt: 2000, source: "fallback",
    tags: [], rating: 3, title: "第二轮", content: seven("第二轮事情"), kind: "event", body: "【问】q2【答】a2",
  };
  const topic = {
    uid: "u_3", id: "tm_aaa3", chatId: "zctest01", createdAt: 3000, updatedAt: 3000, source: "crystal",
    tags: [], rating: 5, title: "主题", kind: "topic", basedOn: ["tm_aaa1".slice(-4), "tm_aaa2".slice(-4), "dead"],
    content: "时间：2026-10-01\n地点：无\n人物：用户\n事情：主题归纳\n结果：归纳结果\n重点：归纳重点",
  };
  const e3 = {
    uid: "u_4", id: "tm_aaa4", chatId: "zctest02", createdAt: 1500, updatedAt: 1500, source: "fallback",
    tags: [], rating: 3, title: "另一会话", content: seven("另一会话事情"), kind: "event", body: "【问】q3【答】a3",
  };
  fs.writeFileSync(path.join(data, "index.json"), JSON.stringify({ schemaVersion: 5, entries: [e1, e2, topic, e3] }));
  fs.writeFileSync(path.join(data, "chat_names.json"), JSON.stringify({ zctest01: "测试会话一", zctest02: "测试会话二" }));
  for (const e of [e1, e2, topic]) fs.writeFileSync(path.join(data, "repo", "zctest01", e.id + ".json"), JSON.stringify(e));
  fs.writeFileSync(path.join(data, "repo", "zctest02", e3.id + ".json"), JSON.stringify(e3));
  return { dir, data };
}

function runMigrate(legacyDir, outDir) {
  const reportFile = path.join(outDir, "report.json");
  fs.mkdirSync(outDir, { recursive: true });
  let ok = true;
  try {
    execFileSync("node", [path.join(ROOT, "dist", "migrate.js"), "--from", legacyDir, "--data", outDir, "--apply", "--no-backup", "--report", reportFile], { cwd: ROOT, stdio: "pipe" });
  } catch (e) {
    ok = false;
  }
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  return { ok, report };
}

test("合成旧库迁移：4 条 = 3 turn + 1 range，命名保留，缺失字段标记", () => {
  const { data } = buildLegacy();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-new-"));
  const { report } = runMigrate(data, out);
  assert.equal(report.planned, 4);
  assert.equal(report.turns, 3);
  assert.equal(report.ranges, 1);
  assert.equal(report.sessions, 2);
  assert.equal(report.verify.ok, true);
  assert.equal(report.verify.sha_mismatch, 0);
  assert.equal(report.verify.missing_reason, 1, "topic 缺原因应被标记");
  assert.ok(report.dangling_covers.some(x => x.includes("dead")));
});

test("迁移幂等：重复执行条数不变", () => {
  const { data } = buildLegacy();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-new2-"));
  runMigrate(data, out);
  const { report } = runMigrate(data, out);
  assert.equal(report.verify.total, 4);
  assert.equal(report.verify.duplicate, 0);
});

test("旧数据只读：迁移前后旧目录哈希不变", () => {
  const { data } = buildLegacy();
  const before = execFileSync("node", [path.join(ROOT, "dist", "tools", "hashdir.js"), data], { cwd: ROOT }).toString();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-new3-"));
  runMigrate(data, out);
  const after = execFileSync("node", [path.join(ROOT, "dist", "tools", "hashdir.js"), data], { cwd: ROOT }).toString();
  assert.equal(JSON.parse(before).sha256, JSON.parse(after).sha256);
});

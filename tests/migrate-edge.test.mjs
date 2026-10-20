// migrate-edge.test.mjs — 迁移的异常路径：dry-run / 源缺失 / 坏条目 / 报告 / 不备份
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATE = path.join(ROOT, "dist", "migrate.js");

function legacy({ corrupt = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-mig-"));
  const data = path.join(dir, "data");
  fs.mkdirSync(path.join(data, "repo", "c1"), { recursive: true });
  const seven = s => `时间：2026-10-01\n地点：无\n人物：用户\n事情：${s}\n原因：原因\n结果：结果\n重点：重点`;
  const e1 = { uid: "u1", id: "tm_m1", chatId: "c1", createdAt: 1000, updatedAt: 1000, source: "fallback", tags: [], rating: 3, title: "一", content: seven("第一件事"), kind: "event", body: "q a" };
  const e2 = { uid: "u2", id: "tm_m2", chatId: "c1", createdAt: 2000, updatedAt: 2000, source: "fallback", tags: [], rating: 3, title: "二", content: seven("第二件事"), kind: "event", body: "q a" };
  fs.writeFileSync(path.join(data, "index.json"), JSON.stringify({ schemaVersion: 5, entries: [e1, e2] }));
  fs.writeFileSync(path.join(data, "chat_names.json"), JSON.stringify({ c1: "会话一" }));
  fs.writeFileSync(path.join(data, "repo", "c1", "tm_m1.json"), JSON.stringify(e1));
  if (corrupt) fs.writeFileSync(path.join(data, "repo", "c1", "tm_m2.json"), "{ broken");
  else fs.writeFileSync(path.join(data, "repo", "c1", "tm_m2.json"), JSON.stringify(e2));
  return { dir, data };
}

function migrate(args) {
  try {
    const out = execFileSync(process.execPath, [MIGRATE, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out, report: safeJson(out) };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout || ""), err: String(e.stderr || ""), report: safeJson(String(e.stdout || "")) };
  }
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

test("dry-run：只出计划，不写目标数据、不动源", () => {
  const { data } = legacy();
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "ns-mig-dst-"));
  const r = migrate(["--dry-run", "--from", data, "--data", target]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.report.mode, "dry-run");
  assert.ok(r.report.planned >= 2, "应给出计划条数");
  assert.equal(r.report.written, undefined, "dry-run 不应有写入计数");
  const sessions = path.join(target, "spaces", "personal", "sessions");
  const count = fs.existsSync(sessions) ? fs.readdirSync(sessions).length : 0;
  assert.equal(count, 0, "dry-run 后目标应仍为空");
});

test("apply：写入并自检通过，--report 落盘", () => {
  const { data } = legacy();
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "ns-mig-dst2-"));
  const reportFile = path.join(target, "migration-report.json");
  const r = migrate(["--apply", "--from", data, "--data", target, "--report", reportFile]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.report.mode, "apply");
  assert.ok(r.report.written >= 2);
  assert.equal(r.report.verify.ok, true, JSON.stringify(r.report.verify));
  assert.ok(fs.existsSync(reportFile));
  const saved = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  assert.equal(saved.mode, "apply");
});

test("源目录不存在：明确失败（非 0 退出码），不创建半套数据", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "ns-mig-dst3-"));
  const r = migrate(["--apply", "--from", path.join(target, "no-such-dir"), "--data", target]);
  assert.notEqual(r.code, 0, "源不存在必须失败");
  assert.match(`${r.err}${r.out}`, /not found|missing|不存在/i);
});

test("源里有一个坏条目：不崩，其余照常迁移", () => {
  const { data } = legacy({ corrupt: true });
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "ns-mig-dst4-"));
  const r = migrate(["--apply", "--from", data, "--data", target]);
  assert.equal(r.code, 0, `不该崩：${r.err}${r.out}`);
  assert.ok(r.report, "应仍有报告");
  assert.ok(r.report.written >= 1, "至少迁移一条");
});

test("--no-backup：不生成 migration/backup*", () => {
  const { data } = legacy();
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "ns-mig-dst5-"));
  const r = migrate(["--apply", "--from", data, "--data", target, "--no-backup"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.report.backup, null);
});

test("源数据保持只读：迁移不改动源文件", () => {
  const { data } = legacy();
  const before = new Map();
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else before.set(p, fs.readFileSync(p, "utf8"));
    }
  };
  walk(data);
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "ns-mig-dst6-"));
  migrate(["--apply", "--from", data, "--data", target]);
  let changed = 0;
  for (const [p, content] of before) if (fs.readFileSync(p, "utf8") !== content) changed++;
  assert.equal(changed, 0, "源文件被改动了");
});

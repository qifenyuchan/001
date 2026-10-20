// cli.test.mjs — 命令行全场景：真实进程、真实退出码、真实 JSON 输出
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI = path.join(ROOT, "dist", "cli.js");

function ctx() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-cli-"));
  return { dir, data: path.join(dir, "data"), packs: path.join(dir, "packs") };
}

function run(c, args) {
  return execFileSync(process.execPath, [CLI, ...args, "--data", c.data, "--packs-dir", c.packs], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function cliJson(c, args) {
  return JSON.parse(run(c, args));
}

function cliFail(c, args) {
  try {
    run(c, args);
    return null;
  } catch (e) {
    const err = JSON.parse(String(e.stderr || "{}").trim().split("\n").pop());
    return { status: e.status, code: err?.error?.code, message: err?.error?.message };
  }
}

const F = (事情, extra = {}) => JSON.stringify({ 时间: "今天", 事情, 结果: "ok", ...extra });

test("CLI 全链路：save → recall → search → list → get → stats", () => {
  const c = ctx();
  const saved = cliJson(c, ["save", "--session", "s1", "--fields", F("部署失败因为权限不足")]);
  assert.equal(saved.ok, true);
  assert.equal(saved.turn_no, 1);

  const r2 = cliJson(c, ["recall", "--session", "s1"]);
  assert.equal(r2.found, true);
  assert.match(r2.text, /部署失败/);

  const found = cliJson(c, ["search", "部署权限"]);
  assert.equal(found.results.length, 1);
  assert.equal(found.results[0].id, saved.id);

  const list = cliJson(c, ["list", "--session", "s1", "--page-size", "5"]);
  assert.equal(list.total, 1);

  const got = cliJson(c, ["get", saved.id]);
  assert.equal(got.record.fields["事情"], "部署失败因为权限不足");

  const stats = cliJson(c, ["stats"]);
  assert.equal(stats.total, 1);
  assert.equal(stats.sessions, 1);
});

test("CLI：缺字段保存 → quality 降级并列出 missing", () => {
  const c = ctx();
  const saved = cliJson(c, ["save", "--session", "s1", "--fields", JSON.stringify({ 时间: "今天", 事情: "只写事情" })]);
  assert.equal(saved.quality, "partial");
  assert.ok(saved.missing.includes("结果"));
});

test("CLI：空输入被拒（EMPTY_INPUT，退出码 1）", () => {
  const c = ctx();
  const bad = cliFail(c, ["save", "--session", "s1", "--fields", "{}"]);
  assert.ok(bad, "应当失败");
  assert.equal(bad.status, 1);
  assert.equal(bad.code, "EMPTY_INPUT");
});

test("CLI：字段别名（英文键）可写入", () => {
  const c = ctx();
  const saved = cliJson(c, ["save", "--session", "s1", "--fields", JSON.stringify({ when: "今天", what: "英文键写入", result: "ok" })]);
  const got = cliJson(c, ["get", saved.id]);
  assert.equal(got.record.fields["事情"], "英文键写入");
  assert.equal(got.record.fields["时间"], "今天");
});

test("CLI：versions / undo 往返", () => {
  const c = ctx();
  const s = cliJson(c, ["save", "--session", "s1", "--fields", F("第一版")]);
  cliJson(c, ["save", "--session", "s1", "--turn", "1", "--fields", F("第二版")]);
  const vers = cliJson(c, ["versions", s.id]);
  assert.equal(vers.count, 1);
  const undone = cliJson(c, ["undo", s.id]);
  assert.equal(undone.ok, true);
  const got = cliJson(c, ["get", s.id]);
  assert.equal(got.record.fields["事情"], "第一版");
});

test("CLI：export --out 写出全量 JSON", () => {
  const c = ctx();
  cliJson(c, ["save", "--session", "s1", "--fields", F("导出我")]);
  const out = path.join(c.dir, "backup.json");
  const res = cliJson(c, ["export", "--out", out]);
  assert.equal(res.ok, true);
  const data = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.equal(data.records.length, 1);
  assert.ok(Array.isArray(data.tombstones));
});

test("CLI：pack 生命周期 list → install → disable → enable → doctor → remove", () => {
  const c = ctx();
  assert.deepEqual(cliJson(c, ["pack", "list"]).packs, []);

  const ins = cliJson(c, ["pack", "install", path.join(ROOT, "packs", "export-obsidian")]);
  assert.equal(ins.pack.loaded, true);

  assert.equal(cliJson(c, ["pack", "disable", "export-obsidian"]).disabled, "export-obsidian");
  assert.equal(cliJson(c, ["pack", "list"]).packs[0].loaded, false);

  cliJson(c, ["pack", "enable", "export-obsidian"]);
  assert.equal(cliJson(c, ["pack", "list"]).packs[0].loaded, true);

  const doc = cliJson(c, ["pack", "doctor"]);
  assert.equal(doc.checks.length, 1);
  assert.equal(doc.checks[0].ok, true);

  const rm = cliJson(c, ["pack", "remove", "export-obsidian"]);
  assert.equal(rm.removed, "export-obsidian");
  assert.deepEqual(cliJson(c, ["pack", "list"]).packs, []);
});

test("CLI：未知命令打印帮助（退出码 0，不是 JSON）", () => {
  const c = ctx();
  const text = run(c, ["nonsense-command"]);
  assert.match(text, /northstar-memory CLI/);
  assert.match(text, /versions <record_id>/);
});

test("CLI：中文会话名保持可读", () => {
  const c = ctx();
  const s = cliJson(c, ["save", "--session", "雨夜断剑", "--fields", F("中文会话")]);
  assert.equal(s.session_key, "雨夜断剑");
});

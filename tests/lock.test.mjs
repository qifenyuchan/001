// lock.test.mjs — 会话锁：占用超时、残留锁自愈、失败不写半条、UI 503 映射
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RepoStore } from "../dist/store/repo.js";
import { withLock } from "../dist/store/files.js";
import { loadConfig } from "../dist/config.js";
import { startUiServer } from "../dist/ui/http.js";

const F = { 时间: "今天", 事情: "锁测试", 结果: "ok" };

function mk(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-lock-"));
  const repo = new RepoStore({ dataDir: dir, rangeEvery: 99, rawHead: 1200, rawTail: 600, lockTimeoutMs: 40, ...opts });
  repo.open();
  return { dir, repo };
}

const lockPath = (dir, key) => path.join(dir, ".locks", `${key}.lock`);

/** 造一个「活锁」：持有者 pid 是当前进程，因此不会被判为残留 */
function holdLock(dir, key, ageMs = 0) {
  const lp = lockPath(dir, key);
  fs.mkdirSync(lp, { recursive: true });
  fs.writeFileSync(path.join(lp, "owner.json"), JSON.stringify({ pid: process.pid, ts: Date.now() - ageMs }), "utf8");
}

test("锁被占用且持有者存活：等待到超时抛 LOCK_TIMEOUT", () => {
  const { dir } = mk();
  holdLock(dir, "s1");
  const t0 = Date.now();
  assert.throws(
    () => withLock(path.join(dir, ".locks"), "s1", () => "never", 60),
    e => e.code === "LOCK_TIMEOUT"
  );
  const spent = Date.now() - t0;
  assert.ok(spent >= 55 && spent < 1500, `应等待约 60ms，实际 ${spent}ms`);
});

test("持有者进程已不存在：残留锁自动清理，写入继续", () => {
  const { dir, repo } = mk();
  const lp = lockPath(dir, "s1");
  fs.mkdirSync(lp, { recursive: true });
  // pid 999999 基本不可能存在
  fs.writeFileSync(path.join(lp, "owner.json"), JSON.stringify({ pid: 999999, ts: Date.now() }), "utf8");

  const r = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: F });
  assert.equal(r.ok, true);
  assert.ok(!fs.existsSync(lp), "残留锁应被清理");
});

test("超龄锁（>30s）即使持有者存活也视为残留", () => {
  const { dir, repo } = mk();
  holdLock(dir, "s1", 40_000);
  const r = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: F });
  assert.equal(r.ok, true);
  assert.ok(!fs.existsSync(lockPath(dir, "s1")));
});

test("没有 owner.json 的旧锁按 mtime 判断：新锁会超时，老锁会被清", () => {
  const { dir } = mk();
  const l1 = lockPath(dir, "fresh");
  fs.mkdirSync(l1, { recursive: true });
  assert.throws(() => withLock(path.join(dir, ".locks"), "fresh", () => 1, 60), e => e.code === "LOCK_TIMEOUT");

  const l2 = lockPath(dir, "old");
  fs.mkdirSync(l2, { recursive: true });
  const old = new Date(Date.now() - 40_000);
  fs.utimesSync(l2, old, old);
  assert.equal(withLock(path.join(dir, ".locks"), "old", () => "ok", 100), "ok");
});

test("正常写入后锁目录不残留", () => {
  const { dir, repo } = mk();
  repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: F });
  assert.ok(!fs.existsSync(lockPath(dir, "s1")));
});

test("拿不到锁时不能写入半条记录", () => {
  const { dir, repo } = mk();
  holdLock(dir, "s1");
  assert.throws(() => repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: F }), e => e.code === "LOCK_TIMEOUT");
  assert.equal(repo.all().length, 0, "失败后不应有记录");
  const sessionDir = path.join(dir, "spaces", "personal", "sessions", "s1");
  const files = fs.existsSync(sessionDir) ? fs.readdirSync(sessionDir).filter(f => f.startsWith("turn-")) : [];
  assert.equal(files.length, 0, "失败后不应有落盘文件");
});

test("UI：锁超时映射为 503，且数据未变", async () => {
  const { dir, repo } = mk();
  const saved = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: F });
  const config = loadConfig({ data: dir, uiPort: 0 });
  const { server, port } = await startUiServer(repo, config);
  try {
    holdLock(dir, "s1");
    const res = await fetch(`http://127.0.0.1:${port}/api/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: saved.id, fields: { 事情: "改不动" } }),
    });
    assert.equal(res.status, 503);
    assert.equal(repo.get(saved.id).fields["事情"], "锁测试", "失败不能改数据");
  } finally {
    await new Promise(r => server.close(r));
  }
});

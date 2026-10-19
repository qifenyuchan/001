// security.test.mjs — 审计发现项回归：路径穿越 / 键碰撞 / 并发 / 快照恢复 / CSRF / 大 turn_no
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { RepoStore } from "../dist/store/repo.js";
import { createUiServer } from "../dist/ui/http.js";
import { createHttpRpcServer } from "../dist/mcp/http.js";
import { loadConfig } from "../dist/config.js";
import { INSTRUCTIONS, createTools } from "../dist/mcp/tools.js";

function makeRepo(dir, device = "dev_test01") {
  const r = new RepoStore({ dataDir: dir, rangeEvery: 10, rawHead: 1200, rawTail: 600, deviceId: device });
  r.open();
  return r;
}
const FULL = { 时间: "2026-10-19", 地点: "无", 人物: "用户", 事情: "事情A", 原因: "原因A", 结果: "结果A", 重点: "重点A" };
function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}
function req(port, { method = "POST", path: p = "/", headers = {}, body = "" }) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port, path: p, method, headers }, res => {
      let out = "";
      res.on("data", d => (out += d));
      res.on("end", () => resolve({ status: res.statusCode, body: out }));
    });
    r.on("error", reject);
    r.end(body);
  });
}

test("P0-1 路径穿越：purge/restore 拒绝非法 trash_id", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-sec1-"));
  const repo = makeRepo(dir);
  const r = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: FULL });
  assert.throws(() => repo.purge("../x"), /invalid trash_id/);
  assert.throws(() => repo.restore("../../etc/passwd"), /invalid trash_id/);
  // 记录仍在
  assert.ok(repo.get(r.id));
});

test("P0-3 会话键碰撞：A/B 与 ab、中文会话分开", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-sec2-"));
  const repo = makeRepo(dir);
  const a = repo.upsertTurn({ session_id: "A/B", turn_no: 1, fields: { ...FULL, 事情: "会话A/B" } });
  const b = repo.upsertTurn({ session_id: "ab", turn_no: 1, fields: { ...FULL, 事情: "会话ab" } });
  assert.notEqual(a.session_key, b.session_key);
  assert.equal(a.id !== b.id, true);
  const c = repo.upsertTurn({ session_id: "会话甲", turn_no: 1, fields: { ...FULL, 事情: "中文甲" } });
  const d = repo.upsertTurn({ session_id: "会话乙", turn_no: 1, fields: { ...FULL, 事情: "中文乙" } });
  assert.notEqual(c.session_key, d.session_key);
  assert.equal(repo.all().length, 4);
});

test("P0-4 并发保存：两个实例各自 open 后保存，不覆盖对方", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-sec3-"));
  const a = makeRepo(dir, "dev_AAAAAA");
  const b = makeRepo(dir, "dev_BBBBBB");
  const r1 = a.upsertTurn({ session_id: "s1", fields: { ...FULL, 事情: "A 的轮次" } });
  const r2 = b.upsertTurn({ session_id: "s1", fields: { ...FULL, 事情: "B 的轮次" } });
  assert.notEqual(r1.turn_no, r2.turn_no);
  assert.equal(a.all().filter(x => x.kind === "turn").length, 2);
  assert.equal(b.all().filter(x => x.kind === "turn").length, 2);
});

test("P1-1 编辑快照可恢复（回滚为当前版本）", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-sec4-"));
  const repo = makeRepo(dir);
  const r = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: FULL });
  repo.update({ id: r.id, fields: { 重点: "改过的重点" } });
  const snapshot = repo.trashList().find(t => t.reason === "edit");
  assert.ok(snapshot);
  const restored = repo.restore(snapshot.trash_id);
  assert.equal(restored.fields["重点"], "重点A");
  assert.ok(restored.revision >= 3);
});

test("P1-3 已有记录只重存 raw 不清空七字段", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-sec5-"));
  const repo = makeRepo(dir);
  repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: FULL });
  const r2 = repo.upsertTurn({ session_id: "s1", turn_no: 1, raw_text: "截断后的原文" });
  const rec = repo.get(r2.id);
  assert.equal(rec.fields["事情"], "事情A");
  assert.equal(rec.fields["结果"], "结果A");
  assert.equal(rec.quality, "complete");
});

test("P1-5 超大 turn_no 被拒绝，统计不再线性爆炸", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-sec6-"));
  const repo = makeRepo(dir);
  assert.throws(() => repo.upsertTurn({ session_id: "s1", turn_no: 20000000, fields: FULL }), /turn_no must be/);
  repo.upsertTurn({ session_id: "s1", turn_no: 3, fields: FULL });
  const t0 = Date.now();
  const st = repo.stats();
  assert.ok(Date.now() - t0 < 500, "stats 应快速返回");
  assert.equal(st.gaps, 2);
});

test("P1-6 残留锁自动清理", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-sec7-"));
  const repo = makeRepo(dir);
  const lock = path.join(dir, ".locks", "s1.lock");
  fs.mkdirSync(lock, { recursive: true });
  fs.writeFileSync(path.join(lock, "owner.json"), JSON.stringify({ pid: 999999, ts: Date.now() - 60000 }));
  const r = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: FULL });
  assert.equal(r.ok, true);
});

test("P1-7 degraded 记录在列表中可见", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-sec8-"));
  const repo = makeRepo(dir);
  repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: { 结果: "只有结果" } });
  const list = repo.list({ session_key: "s1" });
  assert.equal(list.total, 1);
});

test("P0-2 UI：跨站 Origin 403、非 JSON 415、purge 必须 confirm", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-sec9-"));
  const config = loadConfig({ data: dir, uiPort: 0 });
  const repo = makeRepo(dir);
  const rec = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: FULL });
  const server = createUiServer(repo, config);
  const port = await listen(server);
  try {
    const body = JSON.stringify({ id: rec.id, fields: { 事情: "x" } });
    const cross = await req(port, { path: "/api/update", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body });
    assert.equal(cross.status, 403);
    const textPlain = await req(port, { path: "/api/update", headers: { "Content-Type": "text/plain" }, body });
    assert.equal(textPlain.status, 415);
    const noConfirm = await req(port, { path: "/api/purge", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trash_id: rec.id }) });
    assert.equal(noConfirm.status, 400);
    const sameOrigin = await req(port, { path: "/api/update", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ id: rec.id, fields: { 事情: "same-origin 可写" } }) });
    assert.equal(sameOrigin.status, 200);
  } finally {
    await new Promise(r => server.close(r));
  }
});

test("P1-4 MCP HTTP：跨源 403、非 JSON 415、非回环 Host 403", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-sec10-"));
  const config = loadConfig({ data: dir });
  const repo = makeRepo(dir);
  const tools = createTools(repo, config);
  const server = createHttpRpcServer({
    serverName: "northstar-memory",
    serverVersion: "2.2.0",
    instructions: INSTRUCTIONS,
    tools: tools.defs,
    callTool: tools.callTool,
    authToken: "",
  });
  const port = await listen(server);
  try {
    const init = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    const cross = await req(port, { path: "/mcp", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: init });
    assert.equal(cross.status, 403);
    const text = await req(port, { path: "/mcp", headers: { "Content-Type": "text/plain" }, body: init });
    assert.equal(text.status, 415);
    const badHost = await req(port, { path: "/mcp", headers: { "Content-Type": "application/json", Host: "evil.example" }, body: init });
    assert.equal(badHost.status, 403);
    const ok = await req(port, { path: "/mcp", headers: { "Content-Type": "application/json", Host: `127.0.0.1:${port}` }, body: init });
    assert.equal(ok.status, 200);
  } finally {
    await new Promise(r => server.close(r));
  }
});

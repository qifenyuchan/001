// http.test.mjs — HTTP 传输层：协议、状态码、错误路径
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHttpRpcServer } from "../dist/mcp/http.js";
import { RepoStore } from "../dist/store/repo.js";
import { INSTRUCTIONS, createTools } from "../dist/mcp/tools.js";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function boot(toolsMode = "lite") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-httpmcp-"));
  const repo = new RepoStore({ dataDir: dir, rangeEvery: 99, rawHead: 1200, rawTail: 600 });
  repo.open();
  const tools = createTools(repo, { recallMaxChars: 1200 });
  const defs = toolsMode === "lite" ? tools.defs.filter(t => ["memory_save", "memory_recall", "memory_search"].includes(t.name)) : tools.defs;
  const server = createHttpRpcServer({
    serverName: "northstar-memory",
    serverVersion: "test",
    instructions: INSTRUCTIONS,
    tools: defs,
    callTool: tools.callTool,
  });
  const port = await listen(server);
  return { dir, repo, server, port };
}

const post = (port, body, raw = false) =>
  fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? body : JSON.stringify(body),
  });

async function rpc(port, method, params = {}, id = 1) {
  const r = await post(port, { jsonrpc: "2.0", id, method, params });
  return { status: r.status, body: await r.json() };
}

test("initialize / tools/list：lite 3 个，full 9 个", async () => {
  const a = await boot("lite");
  try {
    const init = await rpc(a.port, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    assert.equal(init.status, 200);
    assert.equal(init.body.result.serverInfo.name, "northstar-memory");
    assert.ok(init.body.result.instructions.includes("memory_recall"));

    const listLite = await rpc(a.port, "tools/list");
    assert.deepEqual(listLite.body.result.tools.map(t => t.name), ["memory_save", "memory_recall", "memory_search"]);
  } finally {
    a.server.close();
  }

  const b = await boot("full");
  try {
    const listFull = await rpc(b.port, "tools/list");
    assert.equal(listFull.body.result.tools.length, 9);
  } finally {
    b.server.close();
  }
});

test("tools/call：保存后能检索到", async () => {
  const { port, server } = await boot();
  try {
    const save = await rpc(port, "tools/call", {
      name: "memory_save",
      arguments: { session_id: "s1", fields: { 时间: "今天", 事情: "通过 HTTP 保存", 结果: "ok" } },
    });
    const payload = JSON.parse(save.body.result.content[0].text);
    assert.equal(payload.ok, true);

    const search = await rpc(port, "tools/call", { name: "memory_search", arguments: { query: "HTTP 保存" } });
    const hits = JSON.parse(search.body.result.content[0].text);
    assert.equal(hits.results.length, 1);
  } finally {
    server.close();
  }
});

test("未知方法 / 未知工具都返回 -32601", async () => {
  const { port, server } = await boot();
  try {
    const bad = await rpc(port, "no/such/method");
    assert.equal(bad.body.error.code, -32601);

    const badTool = await rpc(port, "tools/call", { name: "nope", arguments: {} });
    assert.equal(badTool.body.error.code, -32601);
    assert.match(badTool.body.error.message, /Unknown tool/);
  } finally {
    server.close();
  }
});

test("坏 JSON → 400 / -32700；错误路径 404；非 POST 405", async () => {
  const { port, server } = await boot();
  try {
    const bad = await post(port, "{ not json", true);
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error.code, -32700);

    const wrongPath = await fetch(`http://127.0.0.1:${port}/nope`, { method: "POST", body: "{}" });
    assert.equal(wrongPath.status, 404);

    const getReq = await fetch(`http://127.0.0.1:${port}/mcp`);
    assert.equal(getReq.status, 405);
  } finally {
    server.close();
  }
});

test("通知（无 id）返回 202 且不阻塞后续请求", async () => {
  const { port, server } = await boot();
  try {
    const note = await post(port, { jsonrpc: "2.0", method: "notifications/initialized" });
    assert.equal(note.status, 202);
    const after = await rpc(port, "tools/list");
    assert.equal(after.status, 200);
    assert.ok(after.body.result.tools.length >= 3);
  } finally {
    server.close();
  }
});

// auth.test.mjs — 远程接入：HTTP MCP 令牌 + UI 令牌/Cookie 引导
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createHttpRpcServer } from "../dist/mcp/http.js";
import { createUiServer } from "../dist/ui/http.js";
import { loadConfig } from "../dist/config.js";
import { RepoStore } from "../dist/store/repo.js";
import { INSTRUCTIONS, createTools } from "../dist/mcp/tools.js";

const TOKEN = "test-token-0123456789abcdef";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function postMcp(port, body, token) {
  return fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

test("HTTP MCP：无令牌 401，有令牌可用，通知返回 202", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-http-"));
  const config = loadConfig({ data: dir });
  const repo = new RepoStore({ dataDir: dir, rangeEvery: 10, rawHead: 1200, rawTail: 600 });
  repo.open();
  const tools = createTools(repo, config);
  const server = createHttpRpcServer({
    serverName: "northstar-memory",
    serverVersion: "2.0.0",
    instructions: INSTRUCTIONS,
    tools: tools.defs,
    callTool: tools.callTool,
    authToken: TOKEN,
  });
  const port = await listen(server);
  try {
    const r401 = await postMcp(port, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    assert.equal(r401.status, 401);

    const rBad = await postMcp(port, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, "wrong");
    assert.equal(rBad.status, 401);

    const ok = await postMcp(port, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, TOKEN);
    assert.equal(ok.status, 200);
    assert.ok(ok.headers.get("mcp-session-id"));
    const init = await ok.json();
    assert.equal(init.result.serverInfo.name, "northstar-memory");

    const list = await (await postMcp(port, { jsonrpc: "2.0", id: 2, method: "tools/list" }, TOKEN)).json();
    assert.equal(list.result.tools.length, 9);

    const save = await (
      await postMcp(
        port,
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "memory_save", arguments: { session_id: "remote1", turn_no: 1, fields: { 时间: "2026-10-19", 事情: "远程保存", 结果: "成功", 重点: "HTTP", 地点: "无", 人物: "用户", 原因: "测试" } } },
        },
        TOKEN
      )
    ).json();
    assert.equal(JSON.parse(save.result.content[0].text).ok, true);

    const notify = await postMcp(port, { jsonrpc: "2.0", method: "notifications/initialized" }, TOKEN);
    assert.equal(notify.status, 202);

    const notFound = await fetch(`http://127.0.0.1:${port}/nope`, { method: "POST" });
    assert.equal(notFound.status, 404);
  } finally {
    await new Promise(r => server.close(r));
  }
});

test("UI：health 放行；令牌引导写 Cookie；无令牌 401", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-uita-"));
  const config = loadConfig({ data: dir, uiPort: 0, authToken: TOKEN });
  const repo = new RepoStore({ dataDir: dir, rangeEvery: 10, rawHead: 1200, rawTail: 600 });
  repo.open();
  const server = createUiServer(repo, config);
  const port = await listen(server);
  const base = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(base + "/api/health")).status, 200);
    assert.equal((await fetch(base + "/api/stats")).status, 401);
    assert.equal((await fetch(base + "/")).status, 401);

    const boot = await fetch(base + "/?token=" + encodeURIComponent(TOKEN), { redirect: "manual" });
    assert.equal(boot.status, 302);
    const cookie = boot.headers.get("set-cookie");
    assert.ok(cookie && cookie.includes("ns_token="));

    const withCookie = await fetch(base + "/api/stats", { headers: { Cookie: cookie.split(";")[0] } });
    assert.equal(withCookie.status, 200);

    const badBoot = await fetch(base + "/?token=wrong", { redirect: "manual" });
    assert.equal(badBoot.status, 401);
  } finally {
    await new Promise(r => server.close(r));
  }
});

test("安全闸：非回环监听且无令牌时拒绝服务（配置层可判定）", () => {
  const c1 = loadConfig({ uiHost: "0.0.0.0", authToken: "" });
  const c2 = loadConfig({ uiHost: "0.0.0.0", authToken: TOKEN });
  const isLoopback = (h) => h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
  const unsafe = (c) => (!c.noUi && !isLoopback(c.uiHost) && !c.authToken) || (c.httpPort > 0 && !isLoopback(c.httpHost) && !c.authToken);
  assert.equal(unsafe(c1), true);
  assert.equal(unsafe(c2), false);
});

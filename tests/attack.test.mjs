// attack.test.mjs — 攻击测试轮的回归：每一个断言对应攻击台里打通过的那条路径
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { RepoStore } from "../dist/store/repo.js";
import { createUiServer } from "../dist/ui/http.js";
import { createHttpRpcServer } from "../dist/mcp/http.js";
import { INSTRUCTIONS, createTools, TOOL_DEFS } from "../dist/mcp/tools.js";
import { PackHost } from "../dist/packs/host.js";
import { tokenize, MAX_TERMS } from "../dist/core/tokenize.js";
import { searchRecords } from "../dist/features/search.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FULL = { 时间: "2026-10-19", 地点: "无", 人物: "用户", 事情: "攻击回归", 原因: "x", 结果: "y", 重点: "z" };
const TOKEN = "reg_" + "ab".repeat(16);

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ns-atk-reg-"));
}
function makeRepo(dir) {
  const r = new RepoStore({ dataDir: dir, rangeEvery: 99, rawHead: 1200, rawTail: 600, deviceId: "dev_reg01" });
  r.open();
  return r;
}
function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}
function req(port, { method = "GET", path: p = "/", headers = {}, body = "" } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port, path: p, method, headers }, res => {
      let out = "";
      res.on("data", d => (out += d));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: out }));
    });
    r.on("error", reject);
    r.end(body);
  });
}
function cli(args) {
  return spawnSync(process.execPath, [path.join(ROOT, "dist", "cli.js"), ...args], { cwd: ROOT, encoding: "utf8", timeout: 30000 });
}

// ---------- 包机制：包目录必须等于代码边界 ----------

function packRoot() {
  const root = tmp();
  const packsDir = path.join(root, "packs");
  const dataDir = path.join(root, "data");
  fs.mkdirSync(packsDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  makeRepo(dataDir);
  const victim = path.join(root, "victim");
  fs.mkdirSync(victim, { recursive: true });
  fs.writeFileSync(path.join(victim, "keep.json"), "{}");
  return { root, packsDir, dataDir, victim };
}

test("A-E1：pack remove 不能穿越包目录（否则 `..` 会删掉整个 ~/.northstar）", () => {
  const f = packRoot();
  const r = cli(["pack", "remove", "../victim", "--packs-dir", f.packsDir, "--data", f.dataDir]);
  assert.notEqual(r.status, 0);
  assert.ok(fs.existsSync(path.join(f.victim, "keep.json")), "包目录之外的目录被删掉了");
  assert.match(String(r.stderr), /invalid pack id|INVALID_ARG/);
});

test("A-E1b：pack rebuild / disable 同样拒绝非法 id", async () => {
  const f = packRoot();
  for (const sub of ["rebuild", "disable"]) {
    const r = cli(["pack", sub, "..", "--packs-dir", f.packsDir, "--data", f.dataDir]);
    assert.notEqual(r.status, 0, `${sub} 接受了非法 id`);
    assert.ok(fs.existsSync(f.dataDir), `${sub} 把数据目录删了`);
  }
  const repo = makeRepo(f.dataDir);
  const host = new PackHost({ packsDir: f.packsDir, dataDir: f.dataDir, repo, coreVersion: "2.14.0", reservedTools: TOOL_DEFS.map(t => t.name), log: { info() {}, warn() {}, error() {} } });
  assert.throws(() => host.remove(".."), /invalid pack id/);
});

test("A-E2：pack enable 不能加载包目录之外的代码", () => {
  const f = packRoot();
  const outside = path.join(f.root, "outside");
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, "pack.json"), JSON.stringify({ id: "outside", version: "1.0.0", main: "index.js" }));
  fs.writeFileSync(path.join(outside, "index.js"), `import fs from "node:fs";fs.writeFileSync(${JSON.stringify(path.join(f.root, "PWNED"))},"1");export function register(){}`);
  const r = cli(["pack", "enable", "../outside", "--packs-dir", f.packsDir, "--data", f.dataDir]);
  assert.notEqual(r.status, 0);
  assert.ok(!fs.existsSync(path.join(f.root, "PWNED")), "包外代码被执行");
});

test("A-E3：manifest 的 main 指向包外文件时必须拒绝加载", async () => {
  const f = packRoot();
  const pwn = path.join(f.packsDir, "pwn");
  fs.mkdirSync(pwn, { recursive: true });
  fs.writeFileSync(path.join(pwn, "pack.json"), JSON.stringify({ id: "pwn", version: "1.0.0", main: "../../escape.js" }));
  fs.writeFileSync(path.join(f.root, "escape.js"), `import fs from "node:fs";fs.writeFileSync(${JSON.stringify(path.join(f.root, "PWNED2"))},"1");export function register(){}`);
  const repo = makeRepo(f.dataDir);
  const host = new PackHost({ packsDir: f.packsDir, dataDir: f.dataDir, repo, coreVersion: "2.14.0", reservedTools: TOOL_DEFS.map(t => t.name), log: { info() {}, warn() {}, error() {} } });
  await host.load();
  assert.ok(!fs.existsSync(path.join(f.root, "PWNED2")), "main 逃出包目录仍被执行");
  assert.ok(!host.list().some(p => p.id === "pwn" && p.loaded));
});

// ---------- UI / MCP 传输层 ----------

async function uiServer(token = "") {
  const dir = tmp();
  makeRepo(dir).upsertTurn({ session_id: "atk", turn_no: 1, fields: FULL });
  const srv = createUiServer(makeRepo(dir), { authToken: token });
  return { srv, port: await listen(srv), dir };
}

test("A-U1：Host 以回环开头再拼接不能骗过回环校验（UI + MCP）", async () => {
  const ui = await uiServer();
  const mcp = (() => {
    const dir = tmp();
    const repo = makeRepo(dir);
    const tools = createTools(repo, { recallMaxChars: 1200 });
    const s = createHttpRpcServer({ serverName: "s", serverVersion: "t", instructions: INSTRUCTIONS, tools: tools.defs, callTool: tools.callTool, authToken: "" });
    return s;
  })();
  const mcpPort = await listen(mcp);
  try {
    const a = await req(ui.port, { path: "/api/health", headers: { Host: "127.0.0.1:1@evil.example.com" } });
    assert.equal(a.status, 403);
    const b = await req(mcpPort, {
      method: "POST",
      path: "/mcp",
      headers: { "Content-Type": "application/json", Host: "127.0.0.1:1@evil.example.com" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    assert.equal(b.status, 403);
  } finally {
    ui.srv.close();
    mcp.close();
  }
});

test("A-U2：畸形百分号是客户端错误（400/401），不是 500", async () => {
  const open = await uiServer();
  const ui = await uiServer(TOKEN);
  try {
    const a = await req(open.port, { path: "/api/session/%E0%A4%A" });
    assert.equal(a.status, 400);
    const b = await req(ui.port, { path: "/", headers: { Host: "127.0.0.1", Cookie: "ns_token=%E0%A4%A" } });
    assert.equal(b.status, 401);
    const c = await req(ui.port, { path: "/api/list", headers: { Host: "127.0.0.1", Cookie: `ns_token=${TOKEN}` } });
    assert.equal(c.status, 200, "畸形 cookie 不应连累正常请求");
  } finally {
    ui.srv.close();
    open.srv.close();
  }
});

test("A-U3：令牌引导不允许开放重定向（`//evil.com`）", async () => {
  const ui = await uiServer(TOKEN);
  try {
    const r = await req(ui.port, { path: `//evil.example.com/?token=${TOKEN}`, headers: { Host: "127.0.0.1" } });
    assert.equal(r.status, 302);
    assert.ok(!String(r.headers.location || "").startsWith("//"), "跳到了站外");
  } finally {
    ui.srv.close();
  }
});

test("A-U4：页面带点击劫持与 CSP 头", async () => {
  const ui = await uiServer();
  try {
    const r = await req(ui.port, { path: "/" });
    assert.equal(r.status, 200);
    assert.equal(r.headers["x-frame-options"], "DENY");
    assert.match(String(r.headers["content-security-policy"] || ""), /frame-ancestors 'none'/);
  } finally {
    ui.srv.close();
  }
});

// ---------- 输入边界 ----------

test("A-C1：turn_no 非整数直接拒绝，不静默取整", () => {
  const dir = tmp();
  const repo = makeRepo(dir);
  for (const bad of [1.5, "abc", true, -1, 0, 1e9]) {
    assert.throws(() => repo.upsertTurn({ session_id: "t", turn_no: bad, fields: FULL }), /INVALID_ARG|integer|turn_no/);
  }
  assert.equal(repo.all().length, 0);
});

test("A-D1：超长查询串先截断，词项数量封顶（否则一条查询能阻塞进程）", () => {
  const q = Array.from({ length: 200000 }, (_, i) => String.fromCharCode(0x4e00 + (i % 20000))).join("");
  const terms = tokenize(q);
  assert.ok(terms.length <= MAX_TERMS, `词项 ${terms.length} 超过上限`);

  const dir = tmp();
  const repo = makeRepo(dir);
  for (let i = 1; i <= 20; i++) repo.upsertTurn({ session_id: "dos", turn_no: i, fields: FULL });
  const t0 = Date.now();
  searchRecords(repo, q, { limit: 5 });
  const ms = Date.now() - t0;
  assert.ok(ms < 300, `超大查询耗时 ${ms}ms`);
});

test("A-C2：英文查询里的 constructor/__proto__ 不会被当成已存在的词丢掉", () => {
  const terms = tokenize("constructor __proto__ toString");
  assert.ok(terms.includes("constructor"));
  assert.ok(terms.includes("__proto__"));
  assert.ok(terms.includes("tostring"));
});

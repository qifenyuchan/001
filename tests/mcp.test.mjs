// mcp.test.mjs — MCP stdio 协议面：initialize/tools/错误/stdout 纯净
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function startServer(dataDir) {
  const child = spawn("node", [path.join(ROOT, "dist", "server.js"), "--data", dataDir, "--no-ui"], {
    cwd: ROOT,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map();
  let seq = 0;
  const badLines = [];
  const rl = readline.createInterface({ input: child.stdout });
  rl.on("line", line => {
    const text = line.trim();
    if (!text) return;
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      badLines.push(text);
      return;
    }
    if (msg.id != null && pending.has(msg.id)) {
      const resolve = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg);
    }
  });
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, resolve);
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }, 8000);
      const done = pending.get(id);
      pending.set(id, msg => {
        clearTimeout(timer);
        done(msg);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  return { child, request, badLines };
}

test("MCP 协议面全链路", async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-mcp-"));
  const s = startServer(dataDir);
  try {
    const init = await s.request("initialize", {});
    assert.equal(init.result.protocolVersion, "2024-11-05");
    assert.match(init.result.instructions, /Northstar memory protocol/);
    assert.equal(init.result.serverInfo.name, "northstar-memory");

    const list = await s.request("tools/list", {});
    const names = list.result.tools.map(x => x.name);
    assert.equal(names.length, 9);
    for (const n of ["memory_save", "memory_recall", "memory_search", "memory_get", "memory_list", "memory_update", "memory_delete", "memory_restore", "memory_stats"]) {
      assert.ok(names.includes(n), "missing " + n);
    }

    const save = await s.request("tools/call", {
      name: "memory_save",
      arguments: {
        session_id: "mcp1",
        turn_no: 1,
        fields: { 时间: "2026-10-19", 地点: "无", 人物: "用户", 事情: "MCP保存", 原因: "测试", 结果: "成功", 重点: "协议" },
      },
    });
    const saved = JSON.parse(save.result.content[0].text);
    assert.equal(saved.ok, true);
    assert.equal(saved.quality, "complete");
    assert.equal(save.result.isError, undefined);

    const rec = await s.request("tools/call", { name: "memory_recall", arguments: { session_id: "mcp1" } });
    const recalled = JSON.parse(rec.result.content[0].text);
    assert.equal(recalled.found, true);
    assert.match(recalled.text, /MCP保存/);

    const empty = await s.request("tools/call", { name: "memory_save", arguments: { session_id: "mcp1" } });
    assert.equal(empty.result.isError, true);
    const err = JSON.parse(empty.result.content[0].text);
    assert.equal(err.error.code, "EMPTY_INPUT");

    const stats = await s.request("tools/call", { name: "memory_stats", arguments: {} });
    const st = JSON.parse(stats.result.content[0].text);
    assert.equal(st.total, 1);

    assert.deepEqual(s.badLines, [], "stdout 必须全部是 JSON-RPC 行");
  } finally {
    s.child.kill();
  }
});

test("未知工具返回协议错误而非崩溃", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-mcp2-"));
  const s = startServer(dataDir);
  try {
    const r = await s.request("tools/call", { name: "no_such_tool", arguments: {} });
    assert.ok(r.error);
    assert.equal(r.error.code, -32601);
  } finally {
    s.child.kill();
  }
});

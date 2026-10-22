// sim.test.mjs — 模拟测试轮的回归：三条「真用起来才会撞到」的行为
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RepoStore } from "../dist/store/repo.js";
import { createTools } from "../dist/mcp/tools.js";
import { recall } from "../dist/features/inject.js";

const FULL = n => ({
  时间: "2026-10-22",
  地点: "北极星项目",
  人物: "用户、Agent",
  事情: `第 ${n} 轮：修复写入路径的锁覆盖范围`,
  原因: "并发出现两份文件",
  结果: "落盘一份",
  重点: `第 ${n} 轮的结论：写路径整段持锁`,
});

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ns-sim-reg-"));
}
function makeRepo(dir, device = "dev_sim1") {
  const r = new RepoStore({ dataDir: dir, rangeEvery: 9999, rawHead: 1200, rawTail: 600, deviceId: device });
  r.open();
  return r;
}

test("M-1 协议顺序：轮首先取拿到上一轮，before_turn_no 回退一轮", () => {
  const dir = tmp();
  const repo = makeRepo(dir);
  const ids = [];
  for (let n = 1; n <= 5; n++) ids.push(repo.upsertTurn({ session_id: "p", turn_no: n, fields: FULL(n) }).id);

  const r1 = recall(repo, { session_id: "p" }, 1200);
  assert.equal(r1.record.id, ids[4], "轮首应拿到最新一轮");
  assert.ok(r1.text.includes("第 5 轮的结论"));
  assert.ok(r1.text.length <= 1200);

  const r2 = recall(repo, { session_id: "p", before_turn_no: 5 }, 1200);
  assert.equal(r2.record.id, ids[3], "before_turn_no=5 应拿到第 4 轮");
});

test("M-2 写入被截断时，返回值必须告诉调用方（不能静默剪内容）", () => {
  const dir = tmp();
  const repo = makeRepo(dir);
  const tools = createTools(repo, { recallMaxChars: 1200 });

  const normal = tools.callTool("memory_save", { session_id: "t", fields: FULL(1) });
  const n1 = JSON.parse(normal.content[0].text);
  assert.equal(n1.truncated, false, "正常写入不该标 truncated");

  const huge = "长".repeat(20000);
  const big = tools.callTool("memory_save", { session_id: "t", fields: { ...FULL(2), 事情: huge } });
  const n2 = JSON.parse(big.content[0].text);
  assert.equal(n2.ok, true, "超长字段仍要落库");
  assert.equal(n2.truncated, true, "截断必须在返回值里体现");
  assert.equal(repo.all().find(r => r.turn_no === 2).fields["事情"].length, 5000);
});

test("M-3 锁超时的错误码要能传到工具层（不能被降级成 IO_ERROR）", () => {
  const dir = tmp();
  const repo = makeRepo(dir);
  const tools = createTools(repo, { recallMaxChars: 1200 });

  // 模拟「另一个活着的进程」占着这个会话的锁
  const lockDir = path.join(dir, ".locks", "locked.lock");
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(path.join(lockDir, "owner.json"), JSON.stringify({ pid: process.pid, ts: Date.now() }), "utf8");
  const slow = new RepoStore({ dataDir: dir, rangeEvery: 9999, rawHead: 1200, rawTail: 600, deviceId: "dev_sim2", lockTimeoutMs: 200 });
  slow.open();

  try {
    const res = slow.upsertTurn({ session_id: "locked", fields: FULL(1) });
    assert.fail(`应当抛锁超时，实际返回 ${JSON.stringify(res)}`);
  } catch (e) {
    assert.equal(e.code, "LOCK_TIMEOUT", `错误码是 ${e.code}，Agent 会误以为是磁盘故障`);
  }

  // 工具层也必须保留这个码
  const viaTool = tools.callTool("memory_save", { session_id: "locked", fields: FULL(1) });
  const payload = JSON.parse(viaTool.content[0].text);
  assert.equal(viaTool.isError, true);
  assert.equal(payload.error.code, "LOCK_TIMEOUT");
});

test("M-4 在终端切换字段方案，常驻进程必须认（跨进程生效）", () => {
  const dir = tmp();
  const a = makeRepo(dir, "dev_aaaaaa");
  const b = makeRepo(dir, "dev_bbbbbb");

  a.installProfile({
    schema: 1,
    id: "work",
    name: "工作",
    description: "回归用",
    title_field: "事情",
    excerpt_field: "结果",
    fields: [
      { key: "时间", label: "时间", weight: 1 },
      { key: "事情", label: "事情", weight: 3, required: true },
      { key: "结果", label: "结果", weight: 2.5, required: true },
    ],
  });
  assert.equal(b.activeProfileId(), "general");

  a.setActiveProfile("work");
  assert.equal(a.activeProfileId(), "work");

  // 另一个进程（常驻 MCP 服务）在一次写操作后必须跟上，而不是一直报「先切换」
  b.upsertTurn({ session_id: "x", fields: { 时间: "2026-10-22", 事情: "切换后的第一轮", 结果: "ok" } });
  assert.equal(b.activeProfileId(), "work", "常驻进程没读到新的 active 方案");
  const saved = b.upsertTurn({ session_id: "x", fields: { 时间: "2026-10-22", 事情: "第二轮", 结果: "ok" }, profile: "work" });
  assert.equal(saved.profile, "work");
});

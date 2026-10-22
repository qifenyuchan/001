// stress/run.mjs — 压力测试台：规模 / 并发 / 尾延迟 / 泄漏
// 运行：node stress/run.mjs [--records=3000] [--json]
// 只打真实代码路径（不 mock、不直接写文件），结果写 stress/report.json
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIST = path.join(ROOT, "dist");

const { RepoStore } = await import("../dist/store/repo.js");
const { searchRecords } = await import("../dist/features/search.js");
const { recall } = await import("../dist/features/inject.js");
const { createUiServer } = await import("../dist/ui/http.js");
const { createHttpRpcServer } = await import("../dist/mcp/http.js");
const { INSTRUCTIONS, createTools } = await import("../dist/mcp/tools.js");

const argv = process.argv.slice(2);
const opt = k => {
  const hit = argv.find(a => a.startsWith(`--${k}=`));
  return hit ? hit.split("=")[1] : undefined;
};
const MAX_RECORDS = Number(opt("records") || 3000);
const AS_JSON = argv.includes("--json");

// ---------------- 工具 ----------------

const SEC = s => `${(s / 1000).toFixed(2)}s`;
const MB = n => `${(n / 1024 / 1024).toFixed(1)}MB`;

function pct(list, q) {
  if (!list.length) return 0;
  const a = [...list].sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.ceil((q / 100) * a.length) - 1));
  return a[i];
}
function stat(list) {
  return {
    n: list.length,
    p50: +pct(list, 50).toFixed(2),
    p95: +pct(list, 95).toFixed(2),
    p99: +pct(list, 99).toFixed(2),
    max: +Math.max(...list).toFixed(2),
    mean: +(list.reduce((a, b) => a + b, 0) / (list.length || 1)).toFixed(2),
  };
}
function timeIt(fn) {
  const t = process.hrtime.bigint();
  const v = fn();
  return { ms: Number(process.hrtime.bigint() - t) / 1e6, value: v };
}
async function timeAsync(fn) {
  const t = process.hrtime.bigint();
  const v = await fn();
  return { ms: Number(process.hrtime.bigint() - t) / 1e6, value: v };
}
const tmproots = [];
function tmp(p = "ns-stress-") {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), p));
  tmproots.push(d);
  return d;
}
function rss() {
  return process.memoryUsage();
}
function fdCount() {
  try {
    return fs.readdirSync("/proc/self/fd").length;
  } catch {
    return -1; // Windows 没有 /proc
  }
}

const FIELDS = n => ({
  时间: "2026-10-2" + (n % 9),
  地点: n % 3 === 0 ? "线上" : "本机",
  人物: ["用户", "运维", "客户"][n % 3],
  事情: `第 ${n} 轮：部署流水线在夜间失败，回滚到上一个版本`,
  原因: n % 4 === 0 ? "镜像 tag 覆盖" : "配置漂移",
  结果: `服务恢复，耗时 ${n % 30} 分钟`,
  重点: "加一条发布前校验",
});

function seedUntil(repo, from, to, sessions) {
  for (let i = from; i <= to; i++) {
    const s = `s${i % sessions}`;
    const turn = Math.floor((i - 1) / sessions) + 1;
    repo.upsertTurn({ session_id: s, turn_no: turn, fields: FIELDS(i) });
  }
}

const report = { at: new Date().toISOString(), machine: { platform: process.platform, cpus: os.cpus().length, node: process.version, mem: os.totalmem() }, sections: [] };
function section(title, rows, note) {
  report.sections.push({ title, rows, note });
  if (AS_JSON) return;
  console.log(`\n### ${title}`);
  if (note) console.log(`    ${note}`);
  for (const r of rows) console.log("    " + r);
}

// ---------------- S1-S4：规模 ----------------

const levels = [200, 1000, MAX_RECORDS].filter((v, i, a) => a.indexOf(v) === i && v > 0);
const dataDir = tmp("ns-stress-data-");
const scaleRows = [];
let repo = null;
let seeded = 0;

console.log("=".repeat(78));
console.log("北极星记忆服务 · 压力测试");
console.log(`平台 ${process.platform} / ${os.cpus().length} 核 / Node ${process.version} / 上限 ${MAX_RECORDS} 条`);
console.log("=".repeat(78));

const SESSIONS = 40;

for (const lv of levels) {
  // 增量灌数据（同一份 data 目录，不重复灌）
  if (!repo) {
    repo = new RepoStore({ dataDir, rangeEvery: 9999, rawHead: 1200, rawTail: 600, deviceId: "dev_stress1" });
    repo.open();
  }
  const addFrom = seeded + 1;
  const tSeed = Date.now();
  seedUntil(repo, addFrom, lv, SESSIONS);
  const seedMs = Date.now() - tSeed;
  seeded = lv;

  // 冷启动扫描：新实例 open() 同一份数据
  const coldOpen = timeIt(() => {
    const r2 = new RepoStore({ dataDir, rangeEvery: 9999, rawHead: 1200, rawTail: 600, deviceId: "dev_stress2" });
    r2.open();
    return r2;
  });
  coldOpen.value.open(); // 让被测实例保持热态（open 幂等）

  // 写：50 次（继续往后编号）
  const writeLat = [];
  for (let i = 0; i < 50; i++) {
    const n = lv + i + 1;
    writeLat.push(timeIt(() => repo.upsertTurn({ session_id: `s${n % SESSIONS}`, fields: FIELDS(n) })).ms);
  }
  seeded = lv + 50;

  // 读
  const recallLat = [];
  for (let i = 0; i < 50; i++) recallLat.push(timeIt(() => recall(repo, { session_id: `s${i % SESSIONS}` }, 1200)).ms);
  const searchLat = [];
  for (let i = 0; i < 30; i++) searchLat.push(timeIt(() => searchRecords(repo, ["部署流水线", "镜像 tag", "配置漂移", "回滚"][i % 4], { limit: 5 })).ms);
  const listLat = [];
  for (let i = 0; i < 30; i++) listLat.push(timeIt(() => repo.list({ page: i + 1, page_size: 30 })).ms);
  const getLat = [];
  const anyId = repo.all()[0]?.id;
  for (let i = 0; i < 50; i++) getLat.push(timeIt(() => repo.get(anyId)).ms);

  const mem = rss();
  scaleRows.push(
    `记录 ${String(lv).padStart(5)} ｜ 冷启动 ${SEC(coldOpen.ms).padStart(7)} ｜ 写 p50 ${stat(writeLat).p50}ms ｜ ` +
      `recall p50 ${stat(recallLat).p50}ms ｜ search p50 ${stat(searchLat).p50}/p95 ${stat(searchLat).p95}ms ｜ ` +
      `list p95 ${stat(listLat).p95}ms ｜ RSS ${MB(mem.rss)} ｜ heap ${MB(mem.heapUsed)}`
  );
  console.log(`\n[灌数据] +${lv - addFrom + 1} 条 ${SEC(seedMs)}（${(seedMs / Math.max(1, lv - addFrom + 1)).toFixed(1)}ms/条）`);

  report[`scale_${lv}`] = {
    records: lv,
    sessions: SESSIONS,
    cold_open_ms: +coldOpen.ms.toFixed(1),
    write: stat(writeLat),
    recall: stat(recallLat),
    search: stat(searchLat),
    list: stat(listLat),
    get: stat(getLat),
    rss_kb: Math.round(mem.rss / 1024),
    heap_kb: Math.round(mem.heapUsed / 1024),
  };
}

section("S1–S4 规模：冷启动 / 写 / 读 / 内存（单进程，串行）", scaleRows, `每级增量灌数据；读写各 30–50 次取分位`);

// ---------------- S5：进程内并发（串行化证据） ----------------

{
  const t1 = Date.now();
  for (let i = 0; i < 10; i++) searchRecords(repo, "部署流水线", { limit: 5 });
  const serialMs = Date.now() - t1;
  const t2 = Date.now();
  await Promise.all(Array.from({ length: 10 }, () => Promise.resolve().then(() => searchRecords(repo, "部署流水线", { limit: 5 }))));
  const concurrentMs = Date.now() - t2;
  section(
    "S5 单进程并发：10 个检索「同时」发出",
    [`串行 ${serialMs}ms ｜ Promise.all ${concurrentMs}ms ｜ 加速比 ${(serialMs / Math.max(1, concurrentMs)).toFixed(2)}x`],
    "库里每个操作都是同步的：并发只是排队，加速比≈1 说明瓶颈是单线程 CPU 而不是 IO 等待"
  );
  report.S5 = { serial_ms: serialMs, concurrent_ms: concurrentMs };
}

// ---------------- S6：跨进程并发写同一会话（真锁竞争） ----------------

async function crossProcess(nProc = 4, perProc = 15) {
  const dir = tmp("ns-stress-lock-");
  fs.mkdirSync(dir, { recursive: true });
  const base = new RepoStore({ dataDir: dir, rangeEvery: 9999, rawHead: 1200, rawTail: 600, deviceId: "dev_seed" });
  base.open();

  const script = path.join(dir, "_writer.mjs");
  fs.writeFileSync(
    script,
    `import { RepoStore } from ${JSON.stringify(pathToFileURL(path.join(DIST, "store", "repo.js")).href)};
const [dir, tag, n] = [process.argv[2], process.argv[3], Number(process.argv[4])];
const r = new RepoStore({ dataDir: dir, rangeEvery: 9999, rawHead: 1200, rawTail: 600, deviceId: "dev_" + tag, lockTimeoutMs: 3000 });
r.open();
let ok = 0, lock = 0, other = 0;
for (let i = 1; i <= n; i++) {
  try { r.upsertTurn({ session_id: "hot", turn_no: i, fields: { 时间: "2026-10-22", 地点: "无", 人物: tag, 事情: tag + " 第 " + i + " 轮", 原因: "x", 结果: "y", 重点: "z" } }); ok++; }
  catch (e) { if (e && e.code === "LOCK_TIMEOUT") lock++; else other++; }
}
process.stdout.write(JSON.stringify({ ok, lock, other }));
`,
    "utf8"
  );

  const t0 = Date.now();
  const results = await Promise.all(
    Array.from({ length: nProc }, (_, i) => {
      return new Promise(resolve => {
        const p = spawn(process.execPath, [script, dir, `p${i}`, String(perProc)], { stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        p.stdout.on("data", d => (out += d));
        p.on("close", () => {
          try {
            resolve(JSON.parse(out));
          } catch {
            resolve({ ok: 0, lock: 0, other: 1 });
          }
        });
      });
    })
  );
  const wall = Date.now() - t0;
  const agg = results.reduce((a, r) => ({ ok: a.ok + r.ok, lock: a.lock + r.lock, other: a.other + r.other }), { ok: 0, lock: 0, other: 0 });
  const fresh = new RepoStore({ dataDir: dir, rangeEvery: 9999, rawHead: 1200, rawTail: 600, deviceId: "dev_verify" });
  fresh.open();
  const inHot = fresh.all().filter(r => r.session_key === "hot");
  const turns = new Set(inHot.map(r => r.turn_no));
  const expected = perProc; // 各进程都写 1..N，天然键相同 → 应只剩 N 条
  return { wall, agg, records: inHot.length, distinctTurns: turns.size, expected, total: nProc * perProc };
}

{
  const r = await crossProcess(4, 15);
  section(
    "S6 跨进程并发写同一会话（4 进程 × 15 轮，同一批 turn_no）",
    [
      `墙钟 ${SEC(r.wall)} ｜ 成功 ${r.agg.ok}/60 ｜ 锁超时 ${r.agg.lock} ｜ 其它错误 ${r.agg.other}`,
      `落盘 ${r.records} 条 / 不同轮次 ${r.distinctTurns} 个（天然键去重后应为 ${r.expected}）`,
    ],
    "同一 turn_no 被多进程抢写：正确行为是「合并成一条 + 版本号递增」，不是报错也不是留两份"
  );
  report.S6 = r;
}

// ---------------- S7：事件循环阻塞 ----------------

{
  // 先排一个 1ms 定时器再把主线程占住：定时器迟到多久 = 事件循环被堵多久
  async function blockedBy(fn) {
    const t0 = Date.now();
    let firedAt = 0;
    const p = new Promise(res => setTimeout(() => { firedAt = Date.now(); res(); }, 1));
    fn();
    await p;
    return { blockMs: firedAt - t0, totalMs: Date.now() - t0 };
  }
  const one = await blockedBy(() => searchRecords(repo, "部署流水线夜间失败回滚", { limit: 5 }));
  const many = await blockedBy(() => { for (let i = 0; i < 10; i++) searchRecords(repo, "部署流水线夜间失败回滚", { limit: 5 }); });
  const write = await blockedBy(() => repo.upsertTurn({ session_id: "s1", fields: FIELDS(777777) }));
  section(
    "S7 事件循环阻塞（同步操作期间其他请求的感受）",
    [
      `单次检索 ${one.totalMs}ms → 阻塞 ${one.blockMs}ms ｜ 连续 10 次检索 ${many.totalMs}ms → 阻塞 ${many.blockMs}ms`,
      `单次写入阻塞 ${write.totalMs}ms`,
    ],
    "阻塞时长≈操作耗时本身：这期间 UI 的 /api/health、MCP 的所有请求都在排队——并发时的 p50 膨胀就是这个原因"
  );
  report.S7 = { single_search: one, ten_search: many, single_write: write };
}

// ---------------- S8：HTTP MCP 吞吐 ----------------

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

{
  const tools = createTools(repo, { recallMaxChars: 1200 });
  const srv = createHttpRpcServer({
    serverName: "northstar-memory",
    serverVersion: "stress",
    instructions: INSTRUCTIONS,
    tools: tools.defs,
    callTool: tools.callTool,
    authToken: "",
  });
  const port = await listen(srv);
  const url = `http://127.0.0.1:${port}/mcp`;
  const call = (method, params, id = 1) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }).then(async r => ({ status: r.status, body: await r.json() }));

  const lat = { save: [], search: [], recall: [] };
  const CONC = 8;
  const ROUNDS = 12;

  // 串行基线
  for (let i = 0; i < 10; i++) {
    const a = await timeAsync(() => call("tools/call", { name: "memory_recall", arguments: { session_id: "s3" } }, 1));
    lat.recall.push(a.ms);
    const b = await timeAsync(() => call("tools/call", { name: "memory_search", arguments: { query: "部署流水线", limit: 5 } }, 2));
    lat.search.push(b.ms);
  }

  // 并发压测
  const t0 = Date.now();
  const errs = { total: 0, bad: 0 };
  const conc = [];
  for (let round = 0; round < ROUNDS; round++) {
    const jobs = Array.from({ length: CONC }, (_, k) =>
      timeAsync(async () => {
        const r = await call("tools/call", { name: "memory_search", arguments: { query: `部署流水线 第 ${round}${k}`, limit: 5 } }, 100 + k);
        if (r.status !== 200 || !r.body?.result) errs.bad++;
        errs.total++;
      })
    );
    const done = await Promise.all(jobs);
    conc.push(...done.map(d => d.ms));
  }
  const wall = Date.now() - t0;
  const qps = (errs.total / wall) * 1000;

  // 写吞吐（每请求一条）
  const tW = Date.now();
  for (let i = 0; i < 20; i++) {
    const r = await timeAsync(() =>
      call("tools/call", { name: "memory_save", arguments: { session_id: "httpstress", fields: FIELDS(9000 + i) } }, 300 + i)
    );
    lat.save.push(r.ms);
  }
  const writeQps = (20 / (Date.now() - tW)) * 1000;

  srv.close();
  section(
    "S8 HTTP MCP 端到端（keep-alive，8 并发）",
    [
      `串行 recall ${stat(lat.recall).p50}ms ｜ search ${stat(lat.search).p50}ms ｜ save ${stat(lat.save).p50}ms（p95 ${stat(lat.save).p95}ms）`,
      `8 并发 × ${ROUNDS} 轮 = ${errs.total} 次检索：吞吐 ${qps.toFixed(0)} req/s ｜ p50 ${stat(conc).p50}ms / p95 ${stat(conc).p95}ms / p99 ${stat(conc).p99}ms ｜ 失败 ${errs.bad}`,
      `写吞吐 ${writeQps.toFixed(1)} 条/s（含 fsync 与快照）`,
    ],
    "检索只读、可并行排队；写每条约一次 fsync，吞吐天花板在磁盘而不是 CPU"
  );
  report.S8 = { recall: stat(lat.recall), search: stat(lat.search), save: stat(lat.save), concurrency: { c: CONC, qps: +qps.toFixed(1), ...stat(conc), errors: errs.bad }, write_qps: +writeQps.toFixed(1) };
}

// ---------------- S9：UI 接口 ----------------

{
  const dir = tmp("ns-stress-ui-");
  const r2 = new RepoStore({ dataDir: dir, rangeEvery: 9999, rawHead: 1200, rawTail: 600, deviceId: "dev_ui" });
  r2.open();
  seedUntil(r2, 1, 800, 20);
  const srv = createUiServer(r2, { authToken: "" });
  const port = await listen(srv);
  const get = p => timeAsync(() => fetch(`http://127.0.0.1:${port}${p}`).then(r => r.arrayBuffer()));

  const listLat = [];
  for (let i = 0; i < 20; i++) listLat.push((await get(`/api/list?page=${(i % 10) + 1}&page_size=30`)).ms);
  const searchLat = [];
  for (let i = 0; i < 15; i++) searchLat.push((await get(`/api/search?q=${encodeURIComponent("部署流水线")}&limit=50`)).ms);
  const sessionLat = [];
  for (let i = 0; i < 10; i++) sessionLat.push((await get(`/api/session/s${i}`)).ms);
  const exportLat = (await get("/api/export")).ms;
  srv.close();
  section(
    "S9 UI 接口（800 条 / 20 会话）",
    [
      `GET /api/list p50 ${stat(listLat).p50}ms / p95 ${stat(listLat).p95}ms ｜ /api/search p95 ${stat(searchLat).p95}ms ｜ /api/session p95 ${stat(sessionLat).p95}ms`,
      `GET /api/export（全量 800 条）${exportLat.toFixed(0)}ms`,
    ],
    "search 与 export 都是全量展开；记录上万后这两个接口是 UI 里最先变慢的"
  );
  report.S9 = { list: stat(listLat), search: stat(searchLat), session: stat(sessionLat), export_ms: +exportLat.toFixed(0), records: 800 };
}

// ---------------- S10：超大请求体并发 ----------------

{
  const dir = tmp("ns-stress-body-");
  const r2 = new RepoStore({ dataDir: dir, rangeEvery: 9999, rawHead: 1200, rawTail: 600, deviceId: "dev_body" });
  r2.open();
  const srv = createUiServer(r2, { authToken: "" });
  const port = await listen(srv);
  r2.upsertTurn({ session_id: "body", turn_no: 1, fields: FIELDS(1) });
  const realId = r2.all()[0].id;
  const big = JSON.stringify({ id: realId, fields: { 事情: "x" }, pad: "A".repeat(1.8 * 1024 * 1024) });
  const N = 12;
  const t0 = Date.now();
  const rs = await Promise.all(
    Array.from({ length: N }, () =>
      fetch(`http://127.0.0.1:${port}/api/update`, { method: "POST", headers: { "Content-Type": "application/json" }, body: big })
        .then(r => r.status)
        .catch(() => -1)
    )
  );
  const wall = Date.now() - t0;
  const min = await fetch(`http://127.0.0.1:${port}/api/health`).then(r => r.status);
  srv.close();
  section(
    "S10 1.8MB 请求体 × 12 并发",
    [`墙钟 ${SEC(wall)} ｜ 状态分布 ${JSON.stringify(rs.reduce((a, s) => ((a[s] = (a[s] || 0) + 1), a), {}))} ｜ 压完 /api/health = ${min}`],
    "上限 2MB：合法的 1.8MB 请求全部走完解析（内存 ×并发数），服务不崩但会短暂变慢"
  );
  report.S10 = { concurrent: N, wall_ms: wall, statuses: rs.reduce((a, s) => ((a[s] = (a[s] || 0) + 1), a), {}), health_after: min };
}

// ---------------- S11：持续混合负载（泄漏观察） ----------------

{
  const dir = tmp("ns-stress-soak-");
  const r2 = new RepoStore({ dataDir: dir, rangeEvery: 9999, rawHead: 1200, rawTail: 600, deviceId: "dev_soak" });
  r2.open();
  seedUntil(r2, 1, 300, 10);
  const srv = createUiServer(r2, { authToken: "" });
  const port = await listen(srv);
  const rss0 = rss();
  const DURATION = Number(opt("soak") || 20000);
  const t0 = Date.now();
  let ops = 0;
  let errors = 0;
  const lat = [];
  while (Date.now() - t0 < DURATION) {
    const jobs = [];
    for (let k = 0; k < 6; k++) {
      const kind = (ops + k) % 3;
      jobs.push(
        timeAsync(async () => {
          try {
            if (kind === 0) await fetch(`http://127.0.0.1:${port}/api/list?page=1&page_size=30`);
            else if (kind === 1) await fetch(`http://127.0.0.1:${port}/api/search?q=${encodeURIComponent("部署")}&limit=20`);
            else searchRecords(r2, "回滚", { limit: 5 });
          } catch {
            errors++;
          }
        })
      );
    }
    const done = await Promise.all(jobs);
    lat.push(...done.map(d => d.ms));
    ops += 6;
  }
  if (global.gc) global.gc();
  const rss1 = rss();
  srv.close();
  section(
    `S11 持续混合负载 ${SEC(DURATION)}（读为主，6 并发）`,
    [
      `${ops} 次操作／${(ops / (DURATION / 1000)).toFixed(0)} op/s ｜ 错误 ${errors} ｜ p50 ${stat(lat).p50}ms / p95 ${stat(lat).p95}ms / p99 ${stat(lat).p99}ms`,
      `RSS ${MB(rss0.rss)} → ${MB(rss1.rss)}（Δ ${((rss1.rss - rss0.rss) / 1024 / 1024).toFixed(1)}MB）｜ heap ${MB(rss0.heapUsed)} → ${MB(rss1.heapUsed)}`,
    ],
    "只读负载下 RSS 应基本平；持续上涨说明有累积（缓存/句柄/闭包）"
  );
  report.S11 = { duration_ms: DURATION, ops, errors, latency: stat(lat), rss0: rss0.rss, rss1: rss1.rss };
}

// ---------------- S12：单会话深度（父目录大了以后） ----------------

{
  const dir = tmp("ns-deep-");
  const r3 = new RepoStore({ dataDir: dir, rangeEvery: 9999, rawHead: 1200, rawTail: 600, deviceId: "dev_deep" });
  r3.open();
  const N = Number(opt("deep") || 600);
  const first = [];
  const last = [];
  const t0 = Date.now();
  for (let i = 1; i <= N; i++) {
    const t = process.hrtime.bigint();
    r3.upsertTurn({ session_id: "long", turn_no: i, fields: FIELDS(i) });
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    if (i <= 30) first.push(ms);
    if (i > N - 30) last.push(ms);
  }
  const wall = Date.now() - t0;
  const rec = timeIt(() => recall(r3, { session_id: "long" }, 1200));
  const srch = timeIt(() => searchRecords(r3, "部署流水线", { limit: 5 }));
  section(
    `S12 单会话深度：${N} 轮写在一个会话里`,
    [
      `写入 前 30 轮 p50 ${stat(first).p50}ms → 后 30 轮 p50 ${stat(last).p50}ms（同一次运行内对比）｜ 总 ${SEC(wall)}`,
      `recall ${rec.ms.toFixed(1)}ms ｜ search ${srch.ms.toFixed(1)}ms`,
    ],
    "保存要 readdir 整个会话目录来找下一个轮次号；会话越深越慢，这是「单会话几万轮」的真实代价"
  );
  report.S12 = { turns: N, write_first: stat(first), write_last: stat(last), recall_ms: +rec.ms.toFixed(1), search_ms: +srch.ms.toFixed(1), wall_ms: wall };
}

// ---------------- S13：CLI 端到端（每次都付一次冷启动扫描） ----------------

{
  const run = args =>
    new Promise(resolve => {
      const t = Date.now();
      const p = spawn(process.execPath, [path.join(DIST, "cli.js"), ...args, "--data", dataDir], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      p.stdout.on("data", d => (out += d));
      p.on("close", code => resolve({ ms: Date.now() - t, code, out }));
    });
  const a = await run(["stats"]);
  const b = await run(["search", "部署流水线", "--limit", "5"]);
  const c = await run(["get", "tm_nonexistent"]);
  section(
    `S13 CLI 端到端（当前库 ${seeded} 条）`,
    [`stats ${SEC(a.ms)} ｜ search ${SEC(b.ms)} ｜ get ${SEC(c.ms)}`, `每次调用都重新扫描全库——CLI 的延迟 = node 启动 + 冷启动扫描`],
    "Agent 主要走 MCP 常驻进程，不付这笔；但「人在终端里查一条」会明显感觉到"
  );
  report.S13 = { records: seeded, stats_ms: a.ms, search_ms: b.ms, get_ms: c.ms };
}

// ---------------- S14：会话数 vs 单会话容量（同样的记录数，不同切分） ----------------

{
  async function measure(sessions, perSession) {
    const dir = tmp("ns-shard-");
    const r4 = new RepoStore({ dataDir: dir, rangeEvery: 9999, rawHead: 1200, rawTail: 600, deviceId: "dev_shard" });
    r4.open();
    let n = 0;
    for (let t = 1; t <= perSession; t++) {
      for (let k = 0; k < sessions; k++) {
        n++;
        r4.upsertTurn({ session_id: `w${k}`, turn_no: t, fields: FIELDS(n) });
      }
    }
    const g = [];
    const rc = [];
    const ls = [];
    const sw = [];
    const id = r4.all()[0].id;
    for (let i = 0; i < 60; i++) g.push(timeIt(() => r4.get(id)).ms);
    for (let i = 0; i < 30; i++) rc.push(timeIt(() => recall(r4, { session_id: `w${i % sessions}` }, 1200)).ms);
    for (let i = 0; i < 20; i++) ls.push(timeIt(() => r4.list({ page: 1, page_size: 30 })).ms);
    for (let i = 0; i < 20; i++) sw.push(timeIt(() => r4.upsertTurn({ session_id: `w${i % sessions}`, fields: FIELDS(999000 + i) })).ms);
    return { sessions, perSession, records: n, get: stat(g), recall: stat(rc), list: stat(ls), save: stat(sw) };
  }
  const wide = await measure(200, 1);
  const deep = await measure(8, 25);
  section(
    "S14 同样 200 条，切成 200 个会话 vs 8 个会话",
    [
      `200 会话：get p50 ${wide.get.p50}ms ｜ recall p50 ${wide.recall.p50}ms ｜ list p50 ${wide.list.p50}ms ｜ save p50 ${wide.save.p50}ms`,
      `  8 会话：get p50 ${deep.get.p50}ms ｜ recall p50 ${deep.recall.p50}ms ｜ list p50 ${deep.list.p50}ms ｜ save p50 ${deep.save.p50}ms`,
      `倍数：get ${(wide.get.p50 / Math.max(0.01, deep.get.p50)).toFixed(1)}x ｜ save ${(wide.save.p50 / Math.max(0.01, deep.save.p50)).toFixed(1)}x`,
    ],
    "每次读写都要逐个会话 stat 一次 .rev 做跨进程失效判断——**开销跟会话数成正比，跟记录数无关**"
  );
  report.S14 = { wide, deep };
}

// ---------------- 收尾 ----------------

for (const d of tmproots) {
  try {
    fs.rmSync(d, { recursive: true, force: true });
  } catch {
    /* Windows 上偶发占用，留给系统临时目录 */
  }
}

fs.writeFileSync(path.join(HERE, "report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
if (!AS_JSON) {
  console.log("\n" + "=".repeat(78));
  console.log("明细：stress/report.json");
}

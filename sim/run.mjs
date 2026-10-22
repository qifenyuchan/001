// sim/run.mjs — 模拟测试台：按真实协议驱动真实进程，演一遍「Agent 用记忆」
// 运行：node sim/run.mjs [--only=S1,S3] [--json]
// 与攻击/压力测试的区别：那两轮问「能不能被突破 / 扛不扛得住」，
// 这轮问「照文档用，记忆到底接不接得上、错了会不会静默」。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIST = path.join(ROOT, "dist");
const argv = process.argv.slice(2);
const only = (argv.find(a => a.startsWith("--only=")) || "").split("=")[1];
const AS_JSON = argv.includes("--json");

const tmpRoots = [];
function tmp(p = "ns-sim-") {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), p));
  tmpRoots.push(d);
  return d;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------- 被测对象：真实 MCP 进程 ----------------

class McpAgent {
  constructor({ dataDir, packsDir, tools = "full" }) {
    this.dataDir = dataDir;
    this.packsDir = packsDir;
    this.tools = tools;
    this.nextId = 1;
    this.pending = new Map();
    this.buf = "";
    this.stderr = [];
    this.alive = false;
  }

  async start(extraArgs = []) {
    const args = [
      path.join(DIST, "server.js"),
      "--data", this.dataDir,
      "--no-ui",
      "--tools", this.tools,
      "--packs-dir", this.packsDir,
      ...extraArgs,
    ];
    this.proc = spawn(process.execPath, args, { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
    this.alive = true;
    this.proc.stderr.on("data", d => {
      const s = String(d);
      this.stderr.push(s);
      if (this.stderr.length > 200) this.stderr.shift();
    });
    this.proc.stdout.on("data", d => this._onData(String(d)));
    this.proc.on("exit", () => {
      this.alive = false;
      for (const [, p] of this.pending) p.reject(new Error("server exited"));
      this.pending.clear();
    });
    // 等 stdio 就绪：发一次 ping
    await this.rpc("ping", {}, 8000);
    return this;
  }

  _onData(chunk) {
    this.buf += chunk;
    let i;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        p.resolve(msg);
      }
    }
  }

  rpc(method, params = {}, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (!this.alive) return reject(new Error("agent not started"));
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`rpc timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: m => {
          clearTimeout(timer);
          resolve(m);
        },
        reject: e => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  /** 调工具，返回解析后的 payload；错误以 {ok:false,error} 形式返回，不抛 */
  async tool(name, args = {}) {
    const r = await this.rpc("tools/call", { name, arguments: args });
    const text = r?.result?.content?.[0]?.text ?? "";
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
    if (r?.result?.isError) payload = { ok: false, ...(payload.error ? { error: payload.error } : { error: { code: "IS_ERROR", message: text } }) };
    return payload;
  }

  async save(fields, extra = {}) {
    return this.tool("memory_save", { fields, ...extra });
  }
  async recall(session) {
    return this.tool("memory_recall", { session_id: session });
  }
  async search(query, session, limit = 5) {
    return this.tool("memory_search", { query, session_id: session, limit });
  }
  async stats() {
    return this.tool("memory_stats", {});
  }

  async stop() {
    if (!this.proc) return;
    this.alive = false;
    try {
      this.proc.stdin.end();
      this.proc.kill();
    } catch {
      /* ignore */
    }
    await sleep(60);
  }

  /** 模拟宿主崩溃：不给优雅退出的机会 */
  async crash() {
    this.alive = false;
    try {
      this.proc.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    await sleep(120);
  }
}

// ---------------- 场景脚手架 ----------------

const scenarios = [];
function scenario(id, title, fn) {
  scenarios.push({ id, title, fn });
}

function makeChecklist() {
  const checks = [];
  const fail = [];
  return {
    ok(name, cond, detail = "") {
      checks.push({ name, pass: !!cond, detail });
      if (!cond) fail.push({ name, detail });
      return !!cond;
    },
    eq(name, actual, expected, detail = "") {
      const pass = JSON.stringify(actual) === JSON.stringify(expected);
      checks.push({ name, pass, detail: detail || `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}` });
      if (!pass) fail.push({ name, detail: detail || `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}` });
      return pass;
    },
    get failed() {
      return fail;
    },
    get total() {
      return checks.length;
    },
  };
}

const FULL = n => ({
  时间: `2026-10-${String((n % 28) + 1).padStart(2, "0")}`,
  地点: "北极星项目 / src/store",
  人物: "用户、Agent",
  事情: `第 ${n} 轮：修复写入路径的锁覆盖范围，把「读-判断-写」全部包进锁`,
  原因: `第 ${n} 轮的触发点是并发写入时出现了同一轮次两份文件`,
  结果: `第 ${n} 轮验证通过：落盘 1 份，revision 递增`,
  重点: `第 ${n} 轮的结论：写路径必须整段持锁`,
});

function fresh() {
  const root = tmp();
  const dataDir = path.join(root, "data");
  const packsDir = path.join(root, "packs");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(packsDir, { recursive: true });
  return { root, dataDir, packsDir };
}

function copyPack(packsDir, name) {
  const src = path.join(ROOT, "packs", name);
  const dst = path.join(packsDir, name);
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f);
    if (fs.statSync(s).isFile()) fs.copyFileSync(s, path.join(dst, f));
    else fs.cpSync(s, path.join(dst, f), { recursive: true });
  }
}

// ============ S1 基本接续：30 轮，严格按文档「轮首先取 → 轮末存」 ============
scenario("S1", "基本接续：30 轮单会话，轮首先取必须拿到上一轮", async () => {
  const c = makeChecklist();
  const env = fresh();
  const agent = await new McpAgent(env).start();
  const S = "daily";
  const ids = [];
  let recallCorrect = 0;
  let contentOk = 0;
  const recallLens = [];
  try {
    for (let n = 1; n <= 30; n++) {
      // ① 轮首：先取
      const r = await agent.recall(S);
      if (n === 1) {
        c.eq("第 1 轮没有历史时 found=false", r.found, false);
      } else {
        recallLens.push(r.text ? r.text.length : 0);
        if (r.record_id === ids[n - 2]) recallCorrect++;
        else c.ok(`第 ${n} 轮轮首先取拿到上一轮`, false, `期望第 ${n - 1} 轮 ${ids[n - 2]}，拿到 ${r.record_id}`);
        if (r.text && r.text.includes(`第 ${n - 1} 轮的结论`)) contentOk++;
        else c.ok(`第 ${n} 轮注入含上一轮重点`, false, String(r.text || "").slice(0, 60));
        if (r.text && r.text.length > 1200) c.ok(`第 ${n} 轮注入不超预算`, false, `${r.text.length} 字符`);
      }
      // ② 轮末：再存
      const saved = await agent.save(FULL(n), { session_id: S });
      if (!c.ok(`第 ${n} 轮保存成功`, saved.ok === true, JSON.stringify(saved.error || ""))) break;
      c.eq(`第 ${n} 轮服务端编号`, saved.turn_no, n);
      c.eq(`第 ${n} 轮 created`, saved.created, true);
      ids.push(saved.id);
    }

    // 全部存完后再取一次：必须拿到最后一轮
    const last = await agent.recall(S);
    c.eq("收尾时拿到第 30 轮", last.record_id, ids[29]);

    const st = await agent.stats();
    c.eq("落库轮次数", st.by_kind?.turn, 30);
    // 默认 range_every=10：第 10/20/30 轮会顺手生成机械范围条，这是协议里写的行为
    c.eq("自动范围条条数", st.by_kind?.range, 3);
    c.eq("接续正确次数", recallCorrect, 29);
    c.eq("注入内容吻合次数", contentOk, 29);
    c.ok("注入长度全部 ≤1200", Math.max(...recallLens) <= 1200, `最长 ${Math.max(...recallLens)}`);
    c.eq("缺口", st.gaps, 0);
  } finally {
    await agent.stop();
  }
  return { checks: c, metrics: { recall_correct: recallCorrect, turns: 30 } };
});

// ============ S2 长会话回溯：用户提旧事时检索命中 ============
scenario("S2", "长会话回溯：40 轮里 10 次提到旧事，检索要能命中", async () => {
  const c = makeChecklist();
  const env = fresh();
  const agent = await new McpAgent(env).start();
  const S = "long";
  const topicOf = {};
  const topics = { 权限: 3, 缓存: 7, 部署: 11, 迁移: 15, 锁: 19, 索引: 23, 冲突: 27, 回收站: 31, 分组: 35, 触发词: 39 };
  let hits = 0;
  let tries = 0;
  try {
    for (let n = 1; n <= 40; n++) {
      const topic = Object.keys(topics).find(k => topics[k] === n);
      const fields = FULL(n);
      if (topic) {
        fields.事情 = `第 ${n} 轮：把「${topic}」这条链路的边界说清楚`;
        fields.重点 = `第 ${n} 轮的结论：${topic} 只影响写入侧`;
        topicOf[topic] = n;
      }
      const saved = await agent.save(fields, { session_id: S });
      if (!saved.ok) {
        c.ok(`第 ${n} 轮保存`, false, JSON.stringify(saved.error));
        break;
      }
    }
    const misses = [];
    for (const [topic, n] of Object.entries(topicOf)) {
      const q = ["之前那个", "上次说的", "前面定过的"][n % 3] + topic;
      const r = await agent.search(q, S, 5);
      tries++;
      const hitTop5 = (r.results || []).some(x => x.turn_no === n);
      if (hitTop5) hits++;
      else misses.push(`「${topic}」→ 第 ${n} 轮不在前五（前五：${(r.results || []).map(x => x.turn_no).join(",")}）`);
    }
    c.ok("命中率 ≥ 0.8（口语化指代允许损失）", hits / tries >= 0.8, `${hits}/${tries}；漏：${misses.join(" / ")}`);
    fs.writeFileSync(path.join(HERE, "s2_misses.txt"), misses.join("\n") + "\n", "utf8");
  } finally {
    await agent.stop();
  }
  return { checks: c, metrics: { search_hit: hits, search_tries: tries } };
});

// ============ S3 宿主崩溃 + 重启：轮次不跳号、不覆盖、不半条 ============
scenario("S3", "宿主崩溃重启：kill -9 之后会话继续，轮次不漏不重", async () => {
  const c = makeChecklist();
  const env = fresh();
  const S = "crashy";
  const a = await new McpAgent(env).start();
  try {
    for (let n = 1; n <= 6; n++) {
      const r = await a.save(FULL(n), { session_id: S });
      c.ok(`崩溃前第 ${n} 轮`, r.ok === true, JSON.stringify(r.error));
    }
  } finally {
    await a.crash();
  }

  const b = await new McpAgent(env).start();
  try {
    const r = await b.recall(S);
    c.eq("重启后仍能取到上一轮", r.record_id != null, true);
    c.ok("重启后注入内容正确", String(r.text || "").includes("第 6 轮的结论"), String(r.text || "").slice(0, 50));
    for (let n = 7; n <= 10; n++) {
      const saved = await b.save(FULL(n), { session_id: S });
      c.ok(`重启后第 ${n} 轮`, saved.ok === true, JSON.stringify(saved.error));
      c.eq(`重启后编号连续`, saved.turn_no, n);
    }
    const st = await b.stats();
    c.eq("记录总数（轮次）", st.by_kind?.turn, 10);
    c.eq("损坏记录", st.corrupted, 0);

    // 每个落盘文件都必须是完整 JSON（没有半条）
    const sdir = path.join(env.dataDir, "spaces", "personal", "sessions", S);
    const files = fs.readdirSync(sdir).filter(f => /^turn-\d+\.json$/.test(f));
    let parseOk = 0;
    for (const f of files) {
      try {
        const v = JSON.parse(fs.readFileSync(path.join(sdir, f), "utf8"));
        if (v.kind === "turn" && v.turn_no >= 1) parseOk++;
      } catch {
        /* 半条 */
      }
    }
    c.eq("落盘文件全部可解析", parseOk, files.length);
    c.eq("文件数 = 记录数", files.length, 10);
  } finally {
    await b.stop();
  }
  return { checks: c, metrics: {} };
});

// ============ S4 降级轮：只有原文 / 被截断 / 超长字段 ============
scenario("S4", "降级轮：只有原文、被截断、20KB 字段都不能让记忆断档", async () => {
  const c = makeChecklist();
  const env = fresh();
  const agent = await new McpAgent(env).start();
  const S = "degraded";
  try {
    await agent.save(FULL(1), { session_id: S });

    const rawOnly = await agent.save(undefined, {
      session_id: S,
      raw_text: "用户只给了一段粘贴的报错：Error: EPERM: operation not permitted, open '.locks/s1.lock'",
    });
    c.ok("只给原文也能存（不拒绝）", rawOnly.ok === true, JSON.stringify(rawOnly.error));
    c.eq("质量标记为骨架", rawOnly.quality, "degraded");

    const truncated = await agent.save(
      { 事情: "这一轮回答被截断了，只写出了前半段", 结果: "…" },
      { session_id: S, truncated: true, raw_text: "前半段内容" + "x".repeat(3000) }
    );
    c.ok("截断轮能存", truncated.ok === true, JSON.stringify(truncated.error));
    c.ok("质量不是 complete", truncated.quality !== "complete", truncated.quality);

    const huge = "长".repeat(20000);
    const big = await agent.save({ ...FULL(4), 事情: huge }, { session_id: S });
    c.ok("20KB 字段能存（截断而不是拒绝）", big.ok === true, JSON.stringify(big.error));
    c.eq("字段被截断到 5000 上限", big.truncated, true);

    const empty = await agent.save(undefined, { session_id: S });
    c.ok("完全空输入要明确报错", empty.ok === false, JSON.stringify(empty));
    c.eq("错误码", empty.error?.code, "EMPTY_INPUT");

    // 四轮都存下来了，且每一轮都能被召回（骨架也算记忆）
    const st = await agent.stats();
    c.eq("降级轮全部落库", st.by_kind?.turn, 4);
    const r = await agent.recall(S);
    c.ok("最后一轮（20KB 截断轮）能被召回", r.record_id != null && String(r.text || "").length > 0);
    c.ok("召回内容不超预算", String(r.text || "").length <= 1200, `${String(r.text || "").length}`);
  } finally {
    await agent.stop();
  }
  return { checks: c, metrics: {} };
});

// ============ S5 记忆修正：编辑 / 删除 / 恢复后，召回要跟着变 ============
scenario("S5", "记忆修正：改一条 / 删一条 / 恢复一条，召回必须立刻反映", async () => {
  const c = makeChecklist();
  const env = fresh();
  const agent = await new McpAgent(env).start();
  const S = "fix";
  try {
    const t1 = await agent.save(FULL(1), { session_id: S });
    const t2 = await agent.save(FULL(2), { session_id: S });

    const before = await agent.recall(S);
    c.ok("召回的是第 2 轮", String(before.text || "").includes("第 2 轮的结论"));

    const upd = await agent.tool("memory_update", { id: t2.id, fields: { 重点: "第 2 轮的结论：已修正为 partialFields 合并" } });
    c.ok("编辑成功", upd.ok === true, JSON.stringify(upd.error));
    const afterEdit = await agent.recall(S);
    c.ok("编辑后召回的是新内容", String(afterEdit.text || "").includes("已修正"), String(afterEdit.text || "").slice(0, 80));

    const del = await agent.tool("memory_delete", { id: t2.id, confirm: true });
    c.ok("删除成功", del.ok === true, JSON.stringify(del.error));
    const afterDel = await agent.recall(S);
    c.eq("删除后退回上一轮", afterDel.record_id, t1.id);

    const delNoConfirm = await agent.tool("memory_delete", { id: t1.id });
    c.ok("不带 confirm 的删除必须被拒", delNoConfirm.ok === false, JSON.stringify(delNoConfirm));
    c.eq("错误码", delNoConfirm.error?.code, "INVALID_ARG");

    const restored = await agent.tool("memory_restore", { trash_id: del.trash_id });
    c.ok("恢复成功", restored.ok === true, JSON.stringify(restored.error));
    const afterRestore = await agent.recall(S);
    c.eq("恢复后又成为「上一轮」", afterRestore.record_id, t2.id);
    c.ok("恢复的内容是修正后的版本", String(afterRestore.text || "").includes("已修正"));
    c.eq("revision 递增", restored.record?.revision, 3);
  } finally {
    await agent.stop();
  }
  return { checks: c, metrics: {} };
});

// ============ S6 两个 Agent 共用同一会话 ============
scenario("S6", "两个 Agent 同时用一个会话：不重号、不半条、互相看得见", async () => {
  const c = makeChecklist();
  const env = fresh();
  const S = "shared";
  const a = await new McpAgent(env).start();
  const b = await new McpAgent(env).start();
  try {
    for (let i = 1; i <= 5; i++) {
      const ra = await a.save({ ...FULL(i), 人物: "Agent A" }, { session_id: S });
      const rb = await b.save({ ...FULL(i + 100), 人物: "Agent B" }, { session_id: S });
      c.ok(`双写第 ${i} 对都成功`, ra.ok === true && rb.ok === true, `${JSON.stringify(ra.error || "")} ${JSON.stringify(rb.error || "")}`);
    }
    const st = await a.stats();
    c.eq("两个 Agent 一共 10 轮，无覆盖", st.by_kind?.turn, 10);

    // 落盘无重号、无半条
    const sdir = path.join(env.dataDir, "spaces", "personal", "sessions", S);
    const files = fs.readdirSync(sdir).filter(f => /^turn-\d+\.json$/.test(f));
    const turns = [];
    let bad = 0;
    for (const f of files) {
      try {
        turns.push(JSON.parse(fs.readFileSync(path.join(sdir, f), "utf8")).turn_no);
      } catch {
        bad++;
      }
    }
    c.eq("无半条文件", bad, 0);
    c.eq("无重复轮次", new Set(turns).size, turns.length);
    c.eq("轮次连续 1..10", turns.sort((x, y) => x - y), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // A 写的，B 要能看见（跨进程可见性不该超过 1.5s）
    await sleep(1200);
    const seen = await b.search("Agent A", S, 5);
    c.ok("B 能检索到 A 写的记录", (seen.results || []).length > 0, `${(seen.results || []).length} 条`);
    const r = await b.recall(S);
    c.ok("B 的轮首能取到最新的那一轮", r.record_id != null);
  } finally {
    await a.stop();
    await b.stop();
  }
  return { checks: c, metrics: {} };
});

// ============ S7 故障注入：坏文件 / 丢 .rev / 锁被占 ============
scenario("S7", "故障注入：坏记录文件、丢 .rev、锁被别的进程占住", async () => {
  const c = makeChecklist();
  const env = fresh();
  const S = "fault";
  const a = await new McpAgent(env).start();
  try {
    for (let n = 1; n <= 3; n++) await a.save(FULL(n), { session_id: S });
  } finally {
    await a.stop();
  }

  const sdir = path.join(env.dataDir, "spaces", "personal", "sessions", S);
  // 1) 半条 JSON（模拟断电/同步中断写了一半）
  fs.writeFileSync(path.join(sdir, "turn-0009.json"), '{"schema":1,"kind":"turn","turn_no":9,');
  // 2) 结构对但 id 非法
  fs.writeFileSync(path.join(sdir, "turn-0010.json"), JSON.stringify({ schema: 1, id: "../../evil", kind: "turn", turn_no: 10, fields: {} }));
  // 3) 丢 .rev
  try {
    fs.unlinkSync(path.join(sdir, ".rev"));
  } catch {
    /* ignore */
  }

  const b = await new McpAgent(env).start();
  try {
    const st = await b.stats();
    c.ok("坏文件被跳过且计数", st.corrupted >= 2, `corrupted=${st.corrupted}`);
    c.eq("好记录一条不少", st.total, 3);
    const r = await b.recall(S);
    c.ok("丢 .rev 之后召回仍然正常", r.record_id != null, String(r.text || "").slice(0, 40));
    const saved = await b.save(FULL(4), { session_id: S });
    c.ok("丢 .rev 之后还能继续写", saved.ok === true, JSON.stringify(saved.error));
    // 目录里还躺着 turn-0009/0010 的坏文件：编号按文件名校准，绝不回收已存在的号
    // （宁可留缺口，也不覆盖可能还能救回来的数据）
    c.eq("新轮次跳过可疑文件占用的号", saved.turn_no, 11);
  } finally {
    await b.stop();
  }

  // 4) 锁被另一个「活着」的进程占住 → 必须明确报 LOCK_TIMEOUT，而不是静默丢
  const lockDir = path.join(env.dataDir, ".locks", `${S}.lock`);
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(path.join(lockDir, "owner.json"), JSON.stringify({ pid: process.pid, ts: Date.now() }), "utf8");
  const d = await new McpAgent(env).start();
  try {
    const t0 = Date.now();
    const res = await d.save(FULL(5), { session_id: S });
    const ms = Date.now() - t0;
    c.ok("锁被占时保存失败（不静默）", res.ok === false, JSON.stringify(res).slice(0, 120));
    c.eq("错误码是 LOCK_TIMEOUT", res.error?.code, "LOCK_TIMEOUT");
    c.ok("等待时长接近锁超时（3s）", ms >= 2500 && ms < 20000, `${ms}ms`);
    const st2 = await d.stats();
    c.eq("失败的那次没有落半条", st2.by_kind?.turn, 4);
  } finally {
    try {
      fs.rmSync(lockDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    await d.stop();
  }
  return { checks: c, metrics: {} };
});

// ============ S8 字段方案切换（装 creative 包后用 story 字段） ============
scenario("S8", "字段方案切换：装 story 之后，general 写入必须被明确拒绝", async () => {
  const c = makeChecklist();
  const env = fresh();
  copyPack(env.packsDir, "creative");
  const S = "proj";
  const agent = await new McpAgent(env).start();
  try {
    await agent.save(FULL(1), { session_id: S });
    const story = {
      时间: "2026-10-22", 地点: "旧港", 人物: "沈舟", 事件: "沈舟在码头发现了那封信",
      因果: "他一直在找失踪的兄长", 结果: "他决定连夜出港", 伏笔: "信上的火漆印是家族纹章",
      设定: "旧港只在涨潮时开闸", 触发词: "沈舟,旧港",
    };
    const rejected = await agent.save(story, { session_id: S, profile: "story" });
    c.ok("未切换到 story 就写 story 字段 → 拒绝", rejected.ok === false, JSON.stringify(rejected).slice(0, 140));
    c.eq("错误码", rejected.error?.code, "PROFILE_INACTIVE");

    const switched = await agent.tool("memory_save", { session_id: S, profile: "story", 事件: "先把方案切过去" });
    // 通过 CLI 切方案更贴近真实（MCP 没有切换工具），这里用独立进程
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync(process.execPath, [path.join(DIST, "cli.js"), "profile", "use", "story", "--data", env.dataDir, "--packs-dir", env.packsDir], { encoding: "utf8" });
    c.ok("CLI 切换方案成功", JSON.parse(out).ok === true, out.slice(0, 80));

    const ok2 = await agent.save(story, { session_id: S, profile: "story" });
    c.ok("切换后写 story 字段成功", ok2.ok === true, JSON.stringify(ok2.error));
    const bad = await agent.save(FULL(9), { session_id: S, profile: "general" });
    c.ok("切到 story 后写 general 也要被拒", bad.ok === false, JSON.stringify(bad).slice(0, 140));

    const r = await agent.recall(S);
    c.ok("story 记录能被召回", String(r.text || "").includes("沈舟") || String(r.text || "").includes("旧港"), String(r.text || "").slice(0, 80));
    const st = await agent.stats();
    c.ok("历史 general 记录仍在（切换不迁移不改写）", (st.by_profile?.general || 0) === 1, JSON.stringify(st.by_profile));
  } finally {
    await agent.stop();
  }
  return { checks: c, metrics: {} };
});

// ============ S9 跨设备冲突：同步盘丢进来一份冲突副本 ============
scenario("S9", "跨设备冲突：冲突副本重启后按字段合并，召回反映合并结果", async () => {
  const c = makeChecklist();
  const env = fresh();
  const S = "sync";
  const a = await new McpAgent(env).start();
  let id;
  try {
    const saved = await a.save(FULL(1), { session_id: S });
    id = saved.id;
  } finally {
    await a.stop();
  }

  const sdir = path.join(env.dataDir, "spaces", "personal", "sessions", S);
  const base = JSON.parse(fs.readFileSync(path.join(sdir, "turn-0001.json"), "utf8"));
  const copy = JSON.parse(JSON.stringify(base));
  copy.fields["重点"] = "另一台设备改的重点：先修锁再谈索引";
  copy.fields["结果"] = "另一台设备的结论";
  copy.updated_by = "dev_other";
  copy.updated_at = base.updated_at + 60000;
  copy.field_meta["重点"] = { ts: base.updated_at + 60000, by: "dev_other" };
  copy.field_meta["结果"] = { ts: base.updated_at + 60000, by: "dev_other" };
  fs.writeFileSync(path.join(sdir, "turn-0001.sync-conflict-20261022-1200.json"), JSON.stringify(copy, null, 2));

  const b = await new McpAgent(env).start();
  try {
    const r = await b.recall(S);
    c.ok("合并后的重点来自较新设备", String(r.text || "").includes("先修锁再谈索引"), String(r.text || "").slice(0, 90));
    const got = await b.tool("memory_get", { id });
    c.eq("未冲突字段保持原值", got.record?.fields?.["事情"], base.fields["事情"]);
    c.ok("冲突副本已被归档移走", !fs.readdirSync(sdir).some(f => f.includes("sync-conflict")), fs.readdirSync(sdir).join(","));
    c.ok("产生了冲突报告", fs.readdirSync(path.join(env.dataDir, "conflicts")).some(f => f.endsWith(".report.json")));
  } finally {
    await b.stop();
  }
  return { checks: c, metrics: {} };
});

// ============ S10 creative 包：触发式注入（提到才带回） ============
scenario("S10", "触发式注入：提到「沈舟」才带回设定，不提就不占上下文", async () => {
  const c = makeChecklist();
  const env = fresh();
  copyPack(env.packsDir, "creative");
  const S = "novel";
  const { execFileSync } = await import("node:child_process");
  execFileSync(process.execPath, [path.join(DIST, "cli.js"), "profile", "use", "story", "--data", env.dataDir, "--packs-dir", env.packsDir], { encoding: "utf8" });
  const agent = await new McpAgent(env).start();
  try {
    const world = {
      时间: "序章", 地点: "旧港", 人物: "沈舟", 事件: "交代旧港的规矩与沈舟的处境",
      因果: "家族没落", 结果: "沈舟接手了码头", 伏笔: "父亲留下的航海图",
      设定: "旧港只在涨潮时开闸，夜里不点灯", 触发词: "旧港,沈舟",
    };
    const saved = await agent.save(world, { session_id: S, profile: "story" });
    c.ok("写入世界观记录", saved.ok === true, JSON.stringify(saved.error));

    const plain = await agent.save(
      { 时间: "第 1 章", 地点: "北岭", 人物: "阿禾", 事件: "阿禾北上送信", 因果: "受人所托", 结果: "途中遇雪", 伏笔: "信被调换", 设定: "北岭无驿站", 触发词: "阿禾" },
      { session_id: S, profile: "story" }
    );
    c.ok("写入第二条", plain.ok === true, JSON.stringify(plain.error));

    const hit = await agent.tool("memory_recall", { session_id: S, input: "沈舟回到旧港时天已经黑了" });
    c.ok("提到触发词时带回世界观", String(hit.text || "").includes("涨潮"), String(hit.text || "").slice(0, 100));
    const miss = await agent.tool("memory_recall", { session_id: S, input: "今天晚饭吃什么" });
    c.ok("没提到触发词时不带回（省上下文）", !String(miss.text || "").includes("涨潮"), String(miss.text || "").slice(0, 100));
    c.ok("两种情况都仍然注入上一轮", String(hit.text || "").includes("阿禾") && String(miss.text || "").includes("阿禾"));

    const pinned = await agent.tool("memory_pin", { id: saved.id });
    c.ok("可钉为真相层（canon）", pinned.ok !== false, JSON.stringify(pinned).slice(0, 100));
    const after = await agent.search("旧港的规矩", S, 3);
    c.ok("检索能拿到设定", (after.results || []).length > 0);
  } finally {
    await agent.stop();
  }
  return { checks: c, metrics: {} };
});

// ---------------- 执行 ----------------

const picked = only ? scenarios.filter(s => only.split(",").includes(s.id)) : scenarios;
const results = [];

console.log("=".repeat(78));
console.log("北极星记忆 · 模拟测试（真实 MCP 进程 + 真实协议）");
console.log("=".repeat(78));

for (const s of picked) {
  const t0 = Date.now();
  let out;
  let error = null;
  try {
    out = await s.fn();
  } catch (e) {
    error = e && e.message ? e.message : String(e);
    out = { checks: null, metrics: {} };
  }
  const ms = Date.now() - t0;
  const checks = out?.checks;
  const failed = checks ? checks.failed : [{ name: "场景异常", detail: error }];
  const total = checks ? checks.total : 0;
  results.push({ id: s.id, title: s.title, pass: failed.length === 0, total, failed, ms, metrics: out?.metrics || {}, error });

  const mark = failed.length === 0 ? "PASS" : "FAIL";
  console.log(`\n[${mark}] ${s.id} ${s.title} — ${total - failed.length}/${total} 项通过 (${ms}ms)`);
  for (const f of failed) console.log(`        ✗ ${f.name}${f.detail ? "：" + f.detail : ""}`);
}

for (const d of tmpRoots) {
  try {
    fs.rmSync(d, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

const pass = results.filter(r => r.pass).length;
const totalChecks = results.reduce((a, r) => a + r.total, 0);
const failedChecks = results.reduce((a, r) => a + r.failed.length, 0);
const report = { at: new Date().toISOString(), scenarios: results, pass, total: results.length, totalChecks, failedChecks };
fs.writeFileSync(path.join(HERE, "report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");

console.log("\n" + "=".repeat(78));
console.log(`场景 ${pass}/${results.length} 通过 ｜ 断言 ${totalChecks - failedChecks}/${totalChecks} 通过`);
console.log("明细：sim/report.json");

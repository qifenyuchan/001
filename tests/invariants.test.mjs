// invariants.test.mjs — 围绕 QUALITY.md §4.1 的七条不变量
// 这些不是功能用例，是「无论怎么操作都必须成立」的性质。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RepoStore } from "../dist/store/repo.js";
import { PackHost } from "../dist/packs/host.js";
import { recall } from "../dist/features/inject.js";
import { defsFor } from "../dist/mcp/tools.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const quiet = { info() {}, warn() {}, error() {} };

function mk() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-inv-"));
  const packsDir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-inv-packs-"));
  const repo = new RepoStore({ dataDir, rangeEvery: 999, rawHead: 1200, rawTail: 600 });
  repo.open();
  return { dataDir, packsDir, repo };
}

function docsOf(dir) {
  const out = [];
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("不变量 1：任意随机操作序列后，已写入的记录都能读回，且无重复键", () => {
  const { repo } = mk();
  const rand = rng(20261020);
  const sessions = ["s1", "s2", "s3"];
  let ops = 0;
  for (let i = 0; i < 80; i++) {
    const session = sessions[Math.floor(rand() * sessions.length)];
    const all = repo.all();
    const roll = rand();
    if (roll < 0.55 || all.length === 0) {
      repo.upsertTurn({
        session_id: session,
        turn_no: 1 + Math.floor(rand() * 12),
        fields: { 时间: "今天", 事情: `随机写入 ${i}`, 结果: "ok" },
      });
    } else if (roll < 0.75) {
      const target = all[Math.floor(rand() * all.length)];
      repo.update({ id: target.id, fields: { 重点: `改动 ${i}` } });
    } else if (roll < 0.9) {
      const target = all[Math.floor(rand() * all.length)];
      try {
        repo.softDelete(target.id);
      } catch {
        /* 已被删除则跳过 */
      }
    } else {
      const tr = repo.trashList();
      if (tr.length) repo.restore(tr[0].trash_id);
    }
    ops++;
  }
  const live = repo.all();
  assert.ok(live.length > 0);
  for (const rec of live) {
    const back = repo.get(rec.id);
    assert.ok(back, `记录读不回: ${rec.id}`);
    assert.equal(back.session_key, rec.session_key);
    assert.ok(back.revision >= 1);
  }
  const keys = new Set(live.map(r => `${r.session_key}#${r.turn_no}#${r.kind}`));
  assert.equal(keys.size, live.length, "存在重复的 (会话, 轮次, 类型)");
  assert.ok(ops === 80);
});

test("不变量 2：同键重复保存＝覆盖，revision+1，旧版进 .trash", () => {
  const { repo, dataDir } = mk();
  const a = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: { 时间: "今天", 事情: "第一版" } });
  const b = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: { 时间: "今天", 事情: "第二版" } });
  assert.equal(a.id, b.id);
  assert.equal(repo.get(a.id).revision, 2);
  assert.equal(repo.get(a.id).fields["事情"], "第二版");
  assert.equal(repo.all().filter(r => r.kind === "turn").length, 1);
  assert.ok(docsOf(path.join(dataDir, ".trash")).length >= 1, "旧版应进入 .trash");
});

test("不变量 3：注入恒为 1 条上一轮，且不超字符预算", () => {
  const { repo } = mk();
  for (let i = 1; i <= 3; i++) {
    repo.upsertTurn({ session_id: "s1", turn_no: i, fields: { 时间: "今天", 事情: "长内容".repeat(200), 结果: "ok" } });
  }
  for (const budget of [200, 400, 1200]) {
    const r = recall(repo, { session_id: "s1" }, budget);
    assert.ok(r.text.length <= budget, `预算 ${budget} 被突破: ${r.text.length}`);
    assert.equal((r.text.match(/【上一轮记忆/g) || []).length, 1, "只能有 1 条上一轮");
  }
});

test("不变量 4：删掉派生数据后，全部记录仍可读（单一真源）", async () => {
  const { repo, dataDir, packsDir } = mk();
  const host = new PackHost({ packsDir, dataDir, repo, coreVersion: "2.8.1", log: quiet });
  await host.load();
  await host.install(path.join(ROOT, "packs", "creative"));
  repo.setActiveProfile("story");
  const saved = repo.upsertTurn({ session_id: "长夜", fields: { 时间: "第一章", 事件: "得到断剑", 结果: "有线索", 触发词: "断剑" } });
  host.onSave(repo.get(saved.id), null);
  assert.ok(fs.existsSync(path.join(dataDir, ".packs", "creative", "triggers.json")));

  fs.rmSync(path.join(dataDir, ".packs"), { recursive: true, force: true });
  const live = repo.all();
  assert.equal(live.length, 1);
  assert.equal(repo.get(saved.id).fields["事件"], "得到断剑");
  // 缺失的派生数据应能自动重建
  const r = recall(repo, { session_id: "长夜", input: "断剑" }, 1200, host);
  assert.ok(fs.existsSync(path.join(dataDir, ".packs", "creative", "triggers.json")), "索引应自动重建");
  assert.match(r.text, /得到断剑/);
});

test("不变量 5：删除写墓碑可恢复；purge 才是真删（墓碑也消失）", () => {
  const { repo, dataDir } = mk();
  const a = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: { 时间: "今天", 事情: "待删除" } });
  const del = repo.softDelete(a.id);
  assert.ok(!repo.get(a.id));
  const tombFile = path.join(dataDir, "tombstones", `${a.id}.json`);
  assert.ok(fs.existsSync(tombFile), "softDelete 必须留墓碑");

  repo.restore(del.trash_id);
  assert.ok(repo.get(a.id), "应可恢复");

  const del2 = repo.softDelete(a.id);
  repo.purge(del2.trash_id);
  assert.ok(!repo.get(a.id));
  assert.ok(!fs.existsSync(tombFile), "purge 后墓碑必须消失");
});

test("不变量 6：损坏的记录文件与坏包都不影响核心启动与其它记录", async () => {
  const { repo, dataDir, packsDir } = mk();
  repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: { 时间: "今天", 事情: "正常记录" } });
  // 塞一条坏 JSON 到会话目录
  const sessionDir = path.join(dataDir, "spaces", "personal", "sessions", "s1");
  const target = fs.readdirSync(sessionDir).find(f => f.endsWith(".json") && f.startsWith("turn-"));
  fs.writeFileSync(path.join(sessionDir, "turn-0099.json"), "{ this is not json", "utf8");
  assert.ok(target);

  repo.open(); // 不应抛
  const live = repo.all();
  assert.equal(live.length, 1, "其它记录仍可读");
  assert.ok(repo.stats().corrupted >= 1, "损坏计数应体现");

  // 坏包：load 不抛，核心工具面不受影响
  const bad = path.join(packsDir, "bad");
  fs.mkdirSync(bad, { recursive: true });
  fs.writeFileSync(path.join(bad, "pack.json"), JSON.stringify({ id: "bad", version: "1.0.0" }));
  fs.writeFileSync(path.join(bad, "index.js"), "export function register(){ throw new Error('nope'); }");
  const host = new PackHost({ packsDir, dataDir, repo, coreVersion: "2.8.1", log: quiet });
  await host.load();
  assert.equal(host.list().find(p => p.id === "bad").loaded, false);
  assert.deepEqual(defsFor("lite", host).map(t => t.name), ["memory_save", "memory_recall", "memory_search"]);
});

test("不变量 7：召回不跨会话", () => {
  const { repo } = mk();
  repo.upsertTurn({ session_id: "A", turn_no: 1, fields: { 时间: "今天", 事情: "A 的私事" } });
  repo.upsertTurn({ session_id: "B", turn_no: 1, fields: { 时间: "今天", 事情: "B 的事" } });
  const rb = recall(repo, { session_id: "B" }, 1200);
  assert.match(rb.text, /B 的事/);
  assert.ok(!rb.text.includes("A 的私事"), "不能串到别的会话");
  const ra = recall(repo, { session_id: "A" }, 1200);
  assert.ok(!ra.text.includes("B 的事"));
});

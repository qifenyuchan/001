// creative.test.mjs — 文创写作包：剧情字段 / 触发式注入 / 真相层
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RepoStore } from "../dist/store/repo.js";
import { PackHost } from "../dist/packs/host.js";
import { recall } from "../dist/features/inject.js";
import { searchRecords } from "../dist/features/search.js";
import { createTools } from "../dist/mcp/tools.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PACK = path.join(ROOT, "packs", "creative");
const quietLog = { info() {}, warn() {}, error() {} };

async function setup() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-creative-"));
  const packsDir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-creative-packs-"));
  const repo = new RepoStore({ dataDir, rangeEvery: 10, rawHead: 1200, rawTail: 600 });
  repo.open();
  const host = new PackHost({ packsDir, dataDir, repo, coreVersion: "2.7.0", log: quietLog });
  await host.load();
  await host.install(PACK);
  repo.setActiveProfile("story");
  return { dataDir, packsDir, repo, host };
}

const turn = (repo, fields) => repo.upsertTurn({ session_id: "长夜", fields });

test("安装后 story 方案可用，字段按剧情结构保存", async () => {
  const { repo } = await setup();
  assert.ok(repo.profilesList().some(p => p.id === "story"));
  const r = turn(repo, { 时间: "第一章", 人物: "林昭", 事件: "雨夜得到断剑", 结果: "剑上有家族纹章" });
  assert.equal(r.profile, "story");
  const rec = repo.get(r.id);
  assert.equal(rec.fields["事件"], "雨夜得到断剑");
});

test("触发式注入：命中触发词才带回，未命中不注入", async () => {
  const { repo, host } = await setup();
  turn(repo, { 时间: "第一章", 人物: "林昭", 事件: "雨夜得到断剑", 结果: "剑上有纹章", 触发词: "断剑" });
  turn(repo, { 时间: "第二章", 事件: "在旅店投宿", 结果: "平安无事", 触发词: "旅店" });

  const hit = recall(repo, { session_id: "长夜", input: "断剑上的纹章是什么意思" }, 1200, host);
  assert.match(hit.text, /相关设定｜触发命中/);
  assert.match(hit.text, /雨夜得到断剑/);

  const miss = recall(repo, { session_id: "长夜", input: "今天天气不错" }, 1200, host);
  assert.ok(!miss.text.includes("相关设定"));
});

test("人物自动作为触发词", async () => {
  const { repo, host } = await setup();
  turn(repo, { 时间: "第一章", 人物: "林昭，沈砚", 事件: "两人结盟", 结果: "约定共赴北境" });
  turn(repo, { 时间: "第二章", 事件: "赶路", 结果: "抵达驿站" });
  const r = recall(repo, { session_id: "长夜", input: "沈砚还记得那个约定吗" }, 1200, host);
  assert.match(r.text, /两人结盟/);
});

test("真相层：memory_pin 后检索优先，且标签保留", async () => {
  const { repo, host } = await setup();
  const a = turn(repo, { 时间: "第一章", 事件: "断剑第一次出现", 结果: "在雨夜" });
  const b = turn(repo, { 时间: "第三章", 事件: "断剑被夺走", 结果: "落入敌手" });

  const tools = createTools(repo, { recallMaxChars: 1200 }, host);
  const pin = tools.callTool("memory_pin", { id: b.id });
  const payload = JSON.parse(pin.content[0].text);
  assert.equal(payload.pinned, true);
  assert.ok(payload.tags.includes("canon"));
  assert.ok(repo.get(b.id).tags.includes("canon"));

  const hits = searchRecords(repo, "断剑", { limit: 5 }, host);
  assert.equal(hits.results[0].id, b.id, "钉住的记录应排第一");

  const unpin = JSON.parse(tools.callTool("memory_pin", { id: b.id, pinned: false }).content[0].text);
  assert.equal(unpin.pinned, false);
  assert.ok(!repo.get(b.id).tags.includes("canon"));
  assert.ok(!repo.get(a.id).tags.includes("canon"));
});

test("注入不超预算", async () => {
  const { repo, host } = await setup();
  turn(repo, {
    时间: "第一章",
    人物: "林昭",
    事件: "很长的事件描述".repeat(20),
    结果: "很长的结果描述".repeat(20),
    设定: "很长的设定描述".repeat(20),
    触发词: "断剑",
  });
  turn(repo, { 时间: "第二章", 事件: "赶路", 结果: "无事" });
  const r = recall(repo, { session_id: "长夜", input: "断剑" }, 260, host);
  assert.ok(r.text.length <= 260, `超预算: ${r.text.length}`);
});

test("索引过期（外部写入没走 onSave）会自愈，不静默漏答", async () => {
  const { repo, host, dataDir } = await setup();
  const a = turn(repo, { 时间: "第一章", 事件: "得到断剑", 结果: "有线索", 触发词: "断剑" });
  host.onSave(repo.get(a.id), null); // 索引 n=1
  turn(repo, { 时间: "第二章", 事件: "赶路", 结果: "抵达" }); // 直接写，绕过包

  const r = recall(repo, { session_id: "长夜", input: "断剑" }, 1200, host);
  assert.match(r.text, /得到断剑/, "过期索引不能导致漏答");

  const idx = JSON.parse(fs.readFileSync(path.join(dataDir, ".packs", "creative", "triggers.json"), "utf8"));
  assert.equal(idx.n, 2, "重建后条数应对上");
});

test("索引一致性：重复 onSave 不产生重复条目，删除会摘除", async () => {
  const { repo, host, dataDir } = await setup();
  const a = turn(repo, { 时间: "第一章", 事件: "得到断剑", 结果: "有线索", 触发词: "断剑" });
  const rec = repo.get(a.id);
  host.onSave(rec, null);
  host.onSave(rec, null); // 重复通知（重放/重建）
  host.onSave(rec, rec);

  const idxFile = path.join(dataDir, ".packs", "creative", "triggers.json");
  let idx = JSON.parse(fs.readFileSync(idxFile, "utf8"));
  assert.equal(idx.byTrigger["断剑"].length, 1, "同一记录同一触发词只能有一条");

  repo.softDelete(a.id);
  host.onSave(null, rec);
  idx = JSON.parse(fs.readFileSync(idxFile, "utf8"));
  assert.equal(idx.byTrigger["断剑"], undefined, "删除后触发词应摘除");
});

test("触发索引可删可重建（派生数据）", async () => {
  const { repo, host, dataDir } = await setup();
  const a = turn(repo, { 时间: "第一章", 事件: "得到断剑", 结果: "有了线索", 触发词: "断剑" });
  const b = turn(repo, { 时间: "第二章", 事件: "赶路", 结果: "无事" });
  // 与产品路径一致：保存后由核心触发 onSave（MCP/CLI 里自动调用）
  host.onSave(repo.get(a.id), null);
  host.onSave(repo.get(b.id), null);
  const idxFile = path.join(dataDir, ".packs", "creative", "triggers.json");
  assert.ok(fs.existsSync(idxFile), "写入时应建索引");
  fs.unlinkSync(idxFile);
  const r = recall(repo, { session_id: "长夜", input: "断剑" }, 1200, host);
  assert.match(r.text, /得到断剑/);
  assert.ok(fs.existsSync(idxFile), "缺失时应自动重建");
});

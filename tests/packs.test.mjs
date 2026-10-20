// packs.test.mjs — 本体 + 包的机制回归：加载/隔离/生命周期/hook/工具集
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RepoStore } from "../dist/store/repo.js";
import { PackHost } from "../dist/packs/host.js";
import { defsFor, createTools } from "../dist/mcp/tools.js";
import { recall } from "../dist/features/inject.js";
import { searchRecords } from "../dist/features/search.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const quietLog = { info() {}, warn() {}, error() {} };

function makeHost() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-pack-data-"));
  const packsDir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-pack-root-"));
  const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-pack-src-"));
  const repo = new RepoStore({ dataDir, rangeEvery: 10, rawHead: 1200, rawTail: 600 });
  repo.open();
  const host = new PackHost({ packsDir, dataDir, repo, coreVersion: "2.6.0", log: quietLog });
  return { dataDir, packsDir, srcDir, repo, host };
}

function writePack(base, id, index, manifest = {}) {
  const dir = path.join(base, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "pack.json"),
    JSON.stringify({ id, name: id, version: "1.0.0", apiVersion: "^1", ...manifest }, null, 2)
  );
  fs.writeFileSync(path.join(dir, "index.js"), index);
  return dir;
}

const CONFIG = { recallMaxChars: 1200 };

test("空目录：没有包，核心工具照常", async () => {
  const { host } = makeHost();
  await host.load();
  assert.deepEqual(host.list(), []);
  assert.deepEqual(host.toolDefs("lite"), []);
  assert.deepEqual(defsFor("lite", host).map(t => t.name), ["memory_save", "memory_recall", "memory_search"]);
});

test("安装包：工具默认不进 lite，标 default 才进；可调用", async () => {
  const { host, srcDir, repo } = makeHost();
  const src = writePack(
    srcDir,
    "hello",
    `export function register(api){
       api.registerTool({name:"memory_hello",description:"hi",inputSchema:{type:"object"}}, () => ({ok:true,msg:"hi"}));
       api.registerTool({name:"memory_always",description:"always",inputSchema:{type:"object"}}, () => ({ok:true}), {default:true});
     }`,
    { provides: { tools: ["memory_hello", "memory_always"] } }
  );
  const info = await host.install(src);
  assert.equal(info.loaded, true);

  const lite = defsFor("lite", host).map(t => t.name);
  assert.ok(lite.includes("memory_always"), "default:true 应进 lite");
  assert.ok(!lite.includes("memory_hello"), "未标 default 不应进 lite");
  const full = defsFor("full", host).map(t => t.name);
  assert.ok(full.includes("memory_hello"));
  assert.ok(full.includes("memory_save"));

  const tools = createTools(repo, CONFIG, host);
  const r = tools.callTool("memory_hello", {});
  assert.equal(JSON.parse(r.content[0].text).msg, "hi");
  const unknown = tools.callTool("nope", {});
  assert.equal(unknown.isError, true);
});

test("坏包只降级：load 不抛，核心工具仍在", async () => {
  const { host, packsDir } = makeHost();
  writePack(packsDir, "broken", `export function register(){ throw new Error("boom"); }`);
  await host.load(); // 不应抛出
  const info = host.list().find(p => p.id === "broken");
  assert.ok(info);
  assert.equal(info.loaded, false);
  assert.match(String(info.error), /boom/);
  assert.deepEqual(defsFor("lite", host).map(t => t.name), ["memory_save", "memory_recall", "memory_search"]);
});

test("disable / enable：工具随之消失与恢复，数据不动", async () => {
  const { host, srcDir } = makeHost();
  const src = writePack(srcDir, "toggler", `export function register(api){
    api.registerTool({name:"memory_toggle",description:"t",inputSchema:{type:"object"}}, () => ({ok:true}), {default:true});
  }`);
  await host.install(src);
  assert.ok(defsFor("lite", host).map(t => t.name).includes("memory_toggle"));
  host.disable("toggler");
  assert.ok(!defsFor("lite", host).map(t => t.name).includes("memory_toggle"));
  await host.enable("toggler");
  assert.ok(defsFor("lite", host).map(t => t.name).includes("memory_toggle"));
});

test("score hook 只调排序，不负责从无到有", () => {
  const { repo, host, srcDir } = makeHost();
  const src = writePack(srcDir, "booster", `export function register(api){
    api.hook("score", (rec) => (String(rec.fields["事情"]||"").includes("重要") ? 100 : 0), {priority:60});
  }`);
  return host.install(src).then(() => {
    repo.upsertTurn({ session_id: "s1", fields: { 时间: "今天", 事情: "部署完成", 结果: "正常" } });
    repo.upsertTurn({ session_id: "s1", fields: { 时间: "今天", 事情: "部署重要变更", 结果: "正常" } });
    const r = searchRecords(repo, "部署", { limit: 5 }, host);
    assert.equal(r.results.length, 2);
    assert.match(r.results[0].title, /重要/);
    // 不命中查询的记录不会被 hook 捞出来
    const none = searchRecords(repo, "完全无关词", { limit: 5 }, host);
    assert.equal(none.results.length, 0);
  });
});

test("compose hook：注入附加段，且不超预算", async () => {
  const { repo, host, srcDir } = makeHost();
  const src = writePack(srcDir, "triggers", `export function register(api){
    api.hook("compose", (input) => (String(input.input||"").includes("暗号")
      ? { text: "【触发】暗号是 42", priority: 80 } : null), {priority: 80});
  }`);
  await host.install(src);
  repo.upsertTurn({ session_id: "s1", fields: { 时间: "今天", 事情: "约定暗号", 重点: "记住暗号" } });

  const hit = recall(repo, { session_id: "s1", input: "暗号是什么" }, 1200, host);
  assert.match(hit.text, /暗号是 42/);
  const miss = recall(repo, { session_id: "s1", input: "今天天气" }, 1200, host);
  assert.ok(!miss.text.includes("暗号是 42"));

  const tight = recall(repo, { session_id: "s1", input: "暗号" }, 200, host);
  assert.ok(tight.text.length <= 200, `预算超限: ${tight.text.length}`);
});

test("remove：有记录依赖其 profile 时需 --force，且数据仍可读", async () => {
  const { repo, host, srcDir } = makeHost();
  const profile = {
    schema: 1,
    id: "storyx",
    name: "剧情测试",
    title_field: "事件",
    excerpt_field: "结果",
    fields: [
      { key: "时间", label: "时间", weight: 1, max_chars: 40 },
      { key: "事件", label: "事件", weight: 3, required: true, max_chars: 500 },
      { key: "结果", label: "结果", weight: 2.5, required: true, max_chars: 500 },
    ],
  };
  const src = writePack(
    srcDir,
    "storyx-pack",
    `const profile = ${JSON.stringify(profile)};
     export function register(api){ api.registerProfile(profile); }`,
    { provides: { profiles: ["storyx"] } }
  );
  await host.install(src);
  assert.ok(repo.profilesList().some(p => p.id === "storyx"));
  repo.setActiveProfile("storyx");
  const saved = repo.upsertTurn({ session_id: "s1", fields: { 时间: "现在", 事件: "开场", 结果: "正常" } });
  assert.equal(saved.profile, "storyx");

  assert.throws(() => host.remove("storyx-pack"), /use profile/);
  const r = host.remove("storyx-pack", { force: true });
  assert.equal(r.records_using_profile, 1);
  // 包没了，记录照样能读
  const back = repo.get(saved.id);
  assert.equal(back.fields["事件"], "开场");
});

test("rebuild：清派生数据并从真源重放 onSave", async () => {
  const { repo, host, srcDir, dataDir } = makeHost();
  const src = writePack(srcDir, "counter", `export function register(api){
    api.hook("onSave", (rec, prev, ctx) => {
      if (!rec) return;
      const n = Number(ctx.storage.read("count.txt") || 0) + 1;
      ctx.storage.write("count.txt", String(n));
    });
  }`);
  await host.install(src);
  const a = repo.upsertTurn({ session_id: "s1", fields: { 时间: "今天", 事情: "a" } });
  const b = repo.upsertTurn({ session_id: "s1", fields: { 时间: "今天", 事情: "b" } });
  host.onSave(repo.get(a.id), null);
  host.onSave(repo.get(b.id), null);
  const file = path.join(dataDir, ".packs", "counter", "count.txt");
  assert.equal(fs.readFileSync(file, "utf8"), "2");
  const r = host.rebuild("counter");
  assert.equal(r.replayed, 2);
  assert.equal(fs.readFileSync(file, "utf8"), "2");
});

test("中文会话键保持可读（导出目录依赖它），大小写仍分开", () => {
  const { repo } = makeHost();
  const cn = repo.upsertTurn({ session_id: "演示", fields: { 时间: "今天", 事情: "中文会话" } });
  assert.equal(cn.session_key, "演示");
  const a = repo.upsertTurn({ session_id: "AB", fields: { 时间: "今天", 事情: "大写" } });
  const b = repo.upsertTurn({ session_id: "ab", fields: { 时间: "今天", 事情: "小写" } });
  assert.notEqual(a.session_key, b.session_key);
});

test("doctor 每个包只出现一次", async () => {
  const { host, srcDir } = makeHost();
  await host.install(writePack(srcDir, "d1", `export function register(){}`));
  const checks = host.doctor();
  assert.equal(checks.length, 1);
  assert.equal(checks[0].id, "d1");
  assert.equal(checks[0].ok, true);
});

test("export-obsidian 包：导出 Obsidian 兼容 vault", async () => {
  const { repo, host } = makeHost();
  await host.install(path.join(ROOT, "packs", "export-obsidian"));
  const saved = repo.upsertTurn({ session_id: "剧本A", fields: { 时间: "第一章", 事情: "主角登场", 结果: "留下伏笔" } });
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ns-vault-")), "vault");

  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true; // 包会往 stdout 打印摘要，避免污染 TAP
  let code;
  try {
    code = (await host.runCli("obsidian", ["--out", out])).code;
  } finally {
    process.stdout.write = orig;
  }
  assert.equal(code, 0);
  assert.ok(fs.existsSync(path.join(out, "README.md")));
  const dir = path.join(out, "记忆", saved.session_key);
  const files = fs.readdirSync(dir);
  assert.ok(files.some(f => f.startsWith("第0001轮")), files.join(","));
  const md = fs.readFileSync(path.join(dir, files.find(f => f.startsWith("第0001轮"))), "utf8");
  assert.match(md, /主角登场/);
  assert.match(md, new RegExp(`所属会话：\\[\\[${saved.session_key}\\]\\]`));
});

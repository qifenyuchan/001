#!/usr/bin/env node
// smoke.mjs — 发布冒烟：把本仓库打包成 tarball，装进干净目录，再当真实用户跑一遍。
// 目的：证明「npm 包发出去能用」——files 清单漏文件、包内相对路径、packs 目录缺失，
// 这类问题只有真的装一遍才会暴露。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const q = p => `"${p}"`;

function run(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).toString();
}

const steps = [];
let tmp = "";
let tarball = "";

function ok(name, extra = "") {
  steps.push(name);
  process.stdout.write(`  ✓ ${name}${extra ? `  ${extra}` : ""}\n`);
}

function must(cond, msg) {
  if (!cond) throw new Error(`断言失败：${msg}`);
}

try {
  process.stdout.write("\n发布冒烟（从 tarball 安装后运行）\n");
  process.stdout.write("─".repeat(56) + "\n");

  // 1. 打包
  const packOut = run(`npm pack --json`, ROOT);
  const meta = JSON.parse(packOut.slice(packOut.indexOf("[")));
  tarball = path.join(ROOT, meta[0].filename);
  must(fs.existsSync(tarball), `tarball 不存在: ${tarball}`);
  ok("打包", `${meta[0].filename} (${Math.round(meta[0].size / 1024)} KB, ${meta[0].entryCount} 文件)`);

  // 2. 装进干净目录
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ns-smoke-"));
  run(`npm init -y`, tmp);
  run(`npm install --no-audit --no-fund ${q(tarball)}`, tmp);
  const PKG = path.join(tmp, "node_modules", "northstar-memory");
  must(fs.existsSync(path.join(PKG, "dist", "cli.js")), "dist/cli.js 缺失");
  must(fs.existsSync(path.join(PKG, "packs", "creative", "index.js")), "packs/creative 未打进包");
  must(fs.existsSync(path.join(PKG, "ui", "index.html")), "ui 未打进包");
  must(fs.existsSync(path.join(PKG, "profiles", "custom.json")), "profiles 未打进包");
  ok("安装", "dist / ui / profiles / packs 均在包内");

  // 3. 当真实用户跑
  const data = path.join(tmp, "data");
  const packs = path.join(tmp, "packs");
  const cli = path.join(PKG, "dist", "cli.js");
  const ns = (args) => run(`node ${q(cli)} ${args} --data ${q(data)} --packs-dir ${q(packs)}`, tmp);

  const saved = JSON.parse(
    ns(`save --session 冒烟 --fields "{\\"时间\\":\\"今天\\",\\"事情\\":\\"部署失败，权限不足\\",\\"结果\\":\\"回滚\\"}"`)
  );
  must(saved.ok && saved.id, "save 失败");
  ok("save", saved.id);

  const found = JSON.parse(ns(`search 部署权限 --explain`));
  must(found.results.length > 0, "search 无结果");
  must(Array.isArray(found.results[0].why) && found.results[0].why.length > 0, "explain 未返回 why");
  ok("search --explain", `top1=${found.results[0].title}`);

  const installed = JSON.parse(ns(`pack install ${q(path.join(PKG, "packs", "creative"))}`));
  must(installed.pack && installed.pack.loaded, "pack 安装后未加载");
  ok("pack install", "creative@1.0.0");

  const installed2 = JSON.parse(ns(`pack install ${q(path.join(PKG, "packs", "export-obsidian"))}`));
  must(installed2.pack && installed2.pack.loaded, "export-obsidian 安装后未加载");
  ok("pack install", "export-obsidian@1.0.0");

  const listed = JSON.parse(ns(`pack list`));
  must(listed.packs.some(p => p.id === "creative" && p.loaded), "pack list 未显示已加载");
  ok("pack list");

  ns(`profile use story`);
  const story1 = JSON.parse(
    ns(`save --session 长夜 --fields "{\\"时间\\":\\"第一章\\",\\"人物\\":\\"林昭\\",\\"事件\\":\\"得到断剑\\",\\"结果\\":\\"有纹章\\",\\"触发词\\":\\"断剑\\"}"`)
  );
  ns(`save --session 长夜 --fields "{\\"时间\\":\\"第二章\\",\\"事件\\":\\"赶路\\",\\"结果\\":\\"抵达\\"}"`);
  const recalled = JSON.parse(ns(`recall --session 长夜 --input "断剑是什么"`));
  must(/相关设定/.test(recalled.text), "触发式注入未生效");
  ok("触发式注入", "命中触发词带回设定");

  const vault = path.join(tmp, "vault");
  const exp = JSON.parse(ns(`obsidian --out ${q(vault)}`));
  must(exp.ok && exp.files >= 3, "obsidian 导出文件数不足");
  must(fs.existsSync(path.join(vault, "README.md")), "vault README 缺失");
  ok("obsidian 导出", `${exp.files} 个文件`);

  // undo：改一次再回退（用 story 方案下的记录，避免跨方案改同一轮）
  ns(`save --session 长夜 --turn ${story1.turn_no} --fields "{\\"时间\\":\\"第一章\\",\\"事件\\":\\"被改坏了\\",\\"结果\\":\\"改坏\\"}"`);
  const vers = JSON.parse(ns(`versions ${story1.id}`));
  must(vers.count >= 1, "versions 无历史");
  const undo = JSON.parse(ns(`undo ${story1.id}`));
  must(undo.ok && undo.revision > vers.versions[0].revision, "undo 未回滚");
  const after = JSON.parse(ns(`get ${story1.id}`));
  must(/得到断剑/.test(after.record.fields["事件"]), "undo 后内容不对");
  ok("versions / undo", `恢复到 revision ${undo.revision}`);

  const stats = JSON.parse(ns(`stats`));
  must(stats.ok && stats.total >= 3, "stats 异常");
  ok("stats", `${stats.total} 条记录`);

  process.stdout.write("─".repeat(56) + "\n");
  process.stdout.write(`发布冒烟通过：${steps.length} 项全部成功\n\n`);
} catch (e) {
  process.stdout.write(`\n✗ 冒烟失败：${e && e.message}\n`);
  if (e && e.stdout) process.stdout.write(String(e.stdout) + "\n");
  if (e && e.stderr) process.stdout.write(String(e.stderr) + "\n");
  process.exitCode = 1;
} finally {
  try {
    if (tarball && fs.existsSync(tarball)) fs.unlinkSync(tarball);
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* 清理失败不影响结论 */
  }
}

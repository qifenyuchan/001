// index.js — Obsidian 导出包：把记录导出成 Obsidian 可直接打开的 Markdown vault
// 约定：本文件是包，不是核心；只读 api.records()，不碰真源写入。

import fs from "node:fs";
import path from "node:path";

const BAD = /[\\/:*?"<>|\u0000-\u001f]/g;

function safeName(s, fallback = "untitled") {
  const t = String(s || "")
    .replace(BAD, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return t || fallback;
}

function pad4(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return String(v).padStart(4, "0");
}

function pickTitle(rec) {
  const f = rec.fields || {};
  const keys = ["事情", "事件", "结果", "重点", "下一步"];
  for (const k of keys) if (String(f[k] || "").trim()) return String(f[k]).trim();
  for (const k of Object.keys(f)) if (String(f[k] || "").trim()) return String(f[k]).trim();
  return rec.kind === "range" ? `第${rec.range ? rec.range.from + "-" + rec.range.to : "?"}轮 汇总` : `第${rec.turn_no}轮`;
}

function isoOf(ms) {
  try {
    return new Date(Number(ms) || 0).toISOString().replace(/\.\d{3}Z$/, "Z");
  } catch {
    return "";
  }
}

function recordFileName(rec) {
  if (rec.kind === "range") {
    const r = rec.range || { from: 0, to: 0 };
    return `汇总-${pad4(r.from)}-${pad4(r.to)}-${safeName(pickTitle(rec))}.md`;
  }
  return `第${pad4(rec.turn_no)}轮-${safeName(pickTitle(rec))}.md`;
}

function recordMarkdown(rec, sessionKey) {
  const f = rec.fields || {};
  const keys = Object.keys(f).filter(k => String(f[k] || "").trim());
  const lines = [];
  lines.push("---");
  lines.push(`turn: ${rec.turn_no}`);
  lines.push(`kind: ${rec.kind}`);
  lines.push(`session: "${String(sessionKey).replace(/"/g, '\\"')}"`);
  lines.push(`date: ${isoOf(rec.created_at)}`);
  lines.push(`quality: ${rec.quality}`);
  lines.push(`profile: ${rec.profile}`);
  if (Array.isArray(rec.tags) && rec.tags.length) lines.push(`tags: [${rec.tags.map(t => `"${String(t).replace(/"/g, '\\"')}"`).join(", ")}]`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${pickTitle(rec)}`);
  lines.push("");
  lines.push(`所属会话：[[${safeName(sessionKey, "default")}]]`);
  lines.push("");
  for (const k of keys) {
    lines.push(`- **${k}**：${String(f[k]).replace(/\r?\n/g, " ").trim()}`);
  }
  const raw = String(rec.raw_text || "").trim();
  if (raw) {
    lines.push("");
    lines.push("## 原文");
    lines.push("");
    lines.push("```text");
    lines.push(raw.slice(0, 4000));
    lines.push("```");
  }
  lines.push("");
  return lines.join("\n");
}

function sessionIndex(sessionKey, recs) {
  const lines = [];
  lines.push(`# ${sessionKey}`);
  lines.push("");
  lines.push(`共 ${recs.length} 条记忆。`);
  lines.push("");
  const turns = recs
    .filter(r => r.kind !== "range")
    .sort((a, b) => a.turn_no - b.turn_no);
  const ranges = recs.filter(r => r.kind === "range").sort((a, b) => (a.range?.from || 0) - (b.range?.from || 0));
  for (const r of turns) {
    lines.push(`- 第 ${r.turn_no} 轮 · ${isoOf(r.created_at).slice(0, 10)} · [[${recordFileName(r).replace(/\.md$/, "")}]]`);
  }
  if (ranges.length) {
    lines.push("");
    lines.push("## 区间汇总");
    lines.push("");
    for (const r of ranges) {
      lines.push(`- 第 ${r.range?.from}-${r.range?.to} 轮 · [[${recordFileName(r).replace(/\.md$/, "")}]]`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function buildVault(records, opts = {}) {
  const files = {};
  const bySession = new Map();
  for (const r of records) {
    if (opts.session && r.session_key !== opts.session) continue;
    if (!bySession.has(r.session_key)) bySession.set(r.session_key, []);
    bySession.get(r.session_key).push(r);
  }
  const sessions = [...bySession.keys()].sort();
  for (const key of sessions) {
    const recs = bySession.get(key);
    const dir = `记忆/${safeName(key, "default")}`;
    files[`${dir}/_${safeName(key, "default")}.md`] = sessionIndex(key, recs);
    for (const rec of recs) {
      files[`${dir}/${recordFileName(rec)}`] = recordMarkdown(rec, key);
    }
  }
  files["README.md"] = [
    "# 北极星记忆导出",
    "",
    `导出时间：${new Date().toISOString()}`,
    `会话数：${sessions.length}`,
    `记录数：${[...bySession.values()].reduce((n, a) => n + a.length, 0)}`,
    "",
    "用 Obsidian 打开这个目录即可。会话索引在 `记忆/` 下，每轮一条笔记，双向链接可直接跳转。",
    "",
    ...sessions.map(s => `- [[${safeName(s, "default")}]]`),
    "",
  ].join("\n");
  return files;
}

function writeFiles(outDir, files) {
  let n = 0;
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
    n++;
  }
  return n;
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const name = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[name] = next;
        i++;
      } else flags[name] = true;
    }
  }
  return flags;
}

export function register(api) {
  api.hook("export", () => {
    const records = api.records();
    return { name: "obsidian", files: buildVault(records) };
  });

  api.registerCli("obsidian", "导出为 Obsidian 兼容的 Markdown vault：obsidian --out <dir> [--session <key>]", argv => {
    const flags = parseFlags(argv || []);
    const out = typeof flags.out === "string" ? flags.out : "./obsidian-vault";
    const session = typeof flags.session === "string" ? flags.session : undefined;
    const records = api.records();
    const files = buildVault(records, { session });
    const n = writeFiles(path.resolve(out), files);
    process.stdout.write(JSON.stringify({ ok: true, out: path.resolve(out), files: n, records: records.length }, null, 2) + "\n");
    return 0;
  });
}

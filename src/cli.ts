#!/usr/bin/env node
// cli.ts — 命令行：save / recall / search / list / get / stats / range / export
import fs from "node:fs";
import { loadConfig } from "./config.js";
import { RepoStore } from "./store/repo.js";
import { recall } from "./features/inject.js";
import { searchRecords } from "./features/search.js";
import { buildAutoRange } from "./features/range.js";
import { NorthstarError } from "./core/types.js";

function parseFlags(argv: string[]): { flags: Record<string, string | boolean>; pos: string[] } {
  const flags: Record<string, string | boolean> = {};
  const pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const name = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[name] = next;
        i++;
      } else {
        flags[name] = true;
      }
    } else {
      pos.push(a);
    }
  }
  return { flags, pos };
}

function out(v: unknown): void {
  process.stdout.write(JSON.stringify(v, null, 2) + "\n");
}

function fail(e: unknown): never {
  const code = e instanceof NorthstarError ? e.code : "IO_ERROR";
  const message = e instanceof Error ? e.message : String(e);
  process.stderr.write(JSON.stringify({ ok: false, error: { code, message } }) + "\n");
  process.exit(1);
}

const argv = process.argv.slice(2);
const cmd = argv[0] || "help";
const { flags, pos } = parseFlags(argv.slice(1));
const config = loadConfig({
  data: typeof flags.data === "string" ? flags.data : undefined,
  rangeEvery: flags["range-every"] ? Number(flags["range-every"]) : undefined,
});
const repo = new RepoStore({
  dataDir: config.dataDir,
  rangeEvery: config.rangeEvery,
  rawHead: config.rawHead,
  rawTail: config.rawTail,
});
repo.open();

try {
  switch (cmd) {
    case "save": {
      const fields = typeof flags.fields === "string" ? JSON.parse(flags.fields) : undefined;
      const res = repo.upsertTurn({
        session_id: typeof flags.session === "string" ? flags.session : "default",
        profile: typeof flags.profile === "string" ? flags.profile : undefined,
        turn_no: flags.turn ? Number(flags.turn) : undefined,
        fields,
        content: typeof flags.content === "string" ? flags.content : undefined,
        raw_text: typeof flags.raw === "string" ? flags.raw : undefined,
        truncated: !!flags.truncated,
        tags: typeof flags.tags === "string" ? flags.tags.split(",") : undefined,
        rating: flags.rating ? Number(flags.rating) : undefined,
        source: "cli",
      });
      let rangeAuto;
      if (res.range_due) {
        const every = repo.rangeEveryOf(res.session_key);
        const r = buildAutoRange(repo, res.session_key, Math.max(1, res.turn_no - every + 1), res.turn_no);
        if (r.ok) rangeAuto = { id: r.record.id, range: r.record.range };
      }
      out({ ...res, range_auto: rangeAuto });
      break;
    }
    case "recall": {
      const r = recall(
        repo,
        {
          session_id: typeof flags.session === "string" ? flags.session : "default",
          before_turn_no: flags.before ? Number(flags.before) : undefined,
          scope: flags.scope === "range" ? "range" : "turn",
        },
        config.recallMaxChars
      );
      out({ ok: r.ok, found: r.found, text: r.text, next_turn_no: r.next_turn_no, gap: r.gap, record_id: r.record?.id });
      break;
    }
    case "search": {
      const q = pos.join(" ") || (typeof flags.q === "string" ? flags.q : "");
      out(searchRecords(repo, q, { limit: flags.limit ? Number(flags.limit) : 10, session_key: typeof flags.session === "string" ? flags.session : undefined }));
      break;
    }
    case "list": {
      const r = repo.list({
        session_key: typeof flags.session === "string" ? flags.session : undefined,
        profile: typeof flags.profile === "string" ? flags.profile : undefined,
        kind: flags.kind === "range" ? "range" : flags.kind === "turn" ? "turn" : undefined,
        page: flags.page ? Number(flags.page) : 1,
        page_size: flags["page-size"] ? Number(flags["page-size"]) : 20,
      });
      out(r);
      break;
    }
    case "get": {
      const id = pos[0] || (typeof flags.id === "string" ? flags.id : "");
      const rec = repo.get(id);
      if (!rec) throw new NorthstarError("NOT_FOUND", `record not found: ${id}`);
      out({ ok: true, record: rec });
      break;
    }
    case "stats": {
      out(repo.stats());
      break;
    }
    case "sessions": {
      out({ ok: true, sessions: repo.listSessions(!!flags.all) });
      break;
    }
    case "profile": {
      const sub = pos[0] || "list";
      if (sub === "list") {
        out({ ok: true, profiles: repo.profilesList(), active: repo.activeProfileId() });
      } else if (sub === "use") {
        const id = String(pos[1] || flags.id || "").trim();
        if (!id) throw new NorthstarError("INVALID_ARG", "usage: profile use <general|custom>");
        const p = repo.setActiveProfile(id);
        out({ ok: true, active: p.id, name: p.name, note: "新写入使用该方案；历史记录保留可读，不会被改写" });
      } else if (sub === "path") {
        out({ ok: true, dir: config.dataDir + "/profiles", file: config.dataDir + "/profiles/" + repo.activeProfileId() + ".json" });
      } else if (sub === "install") {
        const id = String(pos[1] || flags.id || "").trim();
        if (!/^[a-z0-9_-]{1,32}$/.test(id)) throw new NorthstarError("INVALID_ARG", "usage: profile install <work|story> [--file path]");
        let raw: unknown;
        if (typeof flags.file === "string") {
          raw = JSON.parse(fs.readFileSync(flags.file, "utf8"));
        } else {
          const url = typeof flags.url === "string" ? flags.url : `https://raw.githubusercontent.com/qifenyuchan/001/main/profiles/${id}.json`;
          const resp = await fetch(url);
          if (!resp.ok) throw new NorthstarError("IO_ERROR", `download failed: HTTP ${resp.status} (${url})`);
          raw = await resp.json();
        }
        const p = repo.installProfile(raw);
        out({ ok: true, installed: p.id, name: p.name, fields: p.fields.map(f => f.key), dir: config.dataDir + "/profiles" });
      } else if (sub === "remove") {
        const id = String(pos[1] || flags.id || "").trim();
        out({ ok: true, removed: repo.removeProfile(id), id });
      } else {
        throw new NorthstarError("INVALID_ARG", `unknown profile subcommand: ${sub}`);
      }
      break;
    }
    case "sync": {
      const sub = pos[0] || "status";
      if (sub === "status") {
        out(repo.syncStatus());
      } else if (sub === "doctor") {
        const st = repo.syncStatus();
        out({
          ...st,
          hints: [
            st.conflicts > 0 ? "存在冲突副本，已在 data/conflicts 归档；请检查合并结果" : "无冲突副本",
            st.tombstones > 0 ? "存在删除墓碑（会随同步传播，属正常）" : "无删除墓碑",
            "多设备：把 data/ 放进同一同步目录（OneDrive/iCloud/Syncthing/git），各设备独立 device_id",
          ],
        });
      } else {
        throw new NorthstarError("INVALID_ARG", `unknown sync subcommand: ${sub}`);
      }
      break;
    }
    case "range": {
      const session = typeof flags.session === "string" ? flags.session : "default";
      const from = Number(flags.from || 0);
      const to = Number(flags.to || 0);
      if (!from || !to) throw new NorthstarError("INVALID_ARG", "--from and --to are required");
      out(buildAutoRange(repo, session, from, to));
      break;
    }
    case "export": {
      const data = repo.exportAll();
      if (typeof flags.out === "string") {
        const fs = await import("node:fs");
        fs.writeFileSync(flags.out, JSON.stringify(data, null, 2) + "\n", "utf8");
        out({ ok: true, out: flags.out, records: data.records.length });
      } else {
        out(data);
      }
      break;
    }
    default:
      process.stdout.write(
        [
          "northstar-memory CLI",
          "",
          "  node dist/cli.js save --session <id> --fields '<json>' [--raw <text>] [--turn N] [--truncated]",
          "  node dist/cli.js recall --session <id> [--before N] [--scope range]",
          "  node dist/cli.js search <query> [--session id] [--limit 10]",
          "  node dist/cli.js list [--session id] [--kind turn|range] [--page N] [--page-size 20]",
          "  node dist/cli.js get <id>",
          "  node dist/cli.js sessions [--all]",
          "  node dist/cli.js profile [list|use <id>|install custom|path|remove <id>]",
          "  node dist/cli.js sync [status|doctor]",
          "  node dist/cli.js stats",
          "  node dist/cli.js range --session <id> --from N --to M",
          "  node dist/cli.js export [--out file.json]",
          "",
          "Global: --data <dir> --range-every <n>",
        ].join("\n") + "\n"
      );
  }
} catch (e) {
  fail(e);
}

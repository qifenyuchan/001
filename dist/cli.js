#!/usr/bin/env node
// cli.ts — 命令行：save / recall / search / list / get / stats / range / export
import { loadConfig } from "./config.js";
import { RepoStore } from "./store/repo.js";
import { recall } from "./features/inject.js";
import { searchRecords } from "./features/search.js";
import { buildAutoRange } from "./features/range.js";
import { NorthstarError } from "./core/types.js";
function parseFlags(argv) {
    const flags = {};
    const pos = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith("--")) {
            const name = a.slice(2);
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith("--")) {
                flags[name] = next;
                i++;
            }
            else {
                flags[name] = true;
            }
        }
        else {
            pos.push(a);
        }
    }
    return { flags, pos };
}
function out(v) {
    process.stdout.write(JSON.stringify(v, null, 2) + "\n");
}
function fail(e) {
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
                const r = buildAutoRange(repo, res.session_key, Math.max(1, res.turn_no - config.rangeEvery + 1), res.turn_no);
                if (r.ok)
                    rangeAuto = { id: r.record.id, range: r.record.range };
            }
            out({ ...res, range_auto: rangeAuto });
            break;
        }
        case "recall": {
            const r = recall(repo, {
                session_id: typeof flags.session === "string" ? flags.session : "default",
                before_turn_no: flags.before ? Number(flags.before) : undefined,
                scope: flags.scope === "range" ? "range" : "turn",
            }, config.recallMaxChars);
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
            if (!rec)
                throw new NorthstarError("NOT_FOUND", `record not found: ${id}`);
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
        case "range": {
            const session = typeof flags.session === "string" ? flags.session : "default";
            const from = Number(flags.from || 0);
            const to = Number(flags.to || 0);
            if (!from || !to)
                throw new NorthstarError("INVALID_ARG", "--from and --to are required");
            out(buildAutoRange(repo, session, from, to));
            break;
        }
        case "export": {
            const data = repo.exportAll();
            if (typeof flags.out === "string") {
                const fs = await import("node:fs");
                fs.writeFileSync(flags.out, JSON.stringify(data, null, 2) + "\n", "utf8");
                out({ ok: true, out: flags.out, records: data.records.length });
            }
            else {
                out(data);
            }
            break;
        }
        default:
            process.stdout.write([
                "northstar-memory CLI",
                "",
                "  node dist/cli.js save --session <id> --fields '<json>' [--raw <text>] [--turn N] [--truncated]",
                "  node dist/cli.js recall --session <id> [--before N] [--scope range]",
                "  node dist/cli.js search <query> [--session id] [--limit 10]",
                "  node dist/cli.js list [--session id] [--kind turn|range] [--page N] [--page-size 20]",
                "  node dist/cli.js get <id>",
                "  node dist/cli.js sessions [--all]",
                "  node dist/cli.js stats",
                "  node dist/cli.js range --session <id> --from N --to M",
                "  node dist/cli.js export [--out file.json]",
                "",
                "Global: --data <dir> --range-every <n>",
            ].join("\n") + "\n");
    }
}
catch (e) {
    fail(e);
}

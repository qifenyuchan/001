// hashdir.ts — 目录/文件哈希清单（迁移基线冻结与对账）
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
function sha256File(file) {
    const buf = fs.readFileSync(file);
    return crypto.createHash("sha256").update(buf).digest("hex");
}
function walk(p, out, base) {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
        for (const name of fs.readdirSync(p).sort()) {
            if (name.startsWith("."))
                continue;
            walk(path.join(p, name), out, base);
        }
        return;
    }
    out.push({
        path: path.relative(base, p).replace(/\\/g, "/"),
        bytes: st.size,
        sha256: sha256File(p),
    });
}
export function manifest(paths) {
    const base = process.cwd();
    const entries = [];
    for (const p of paths) {
        const abs = path.resolve(p);
        if (!fs.existsSync(abs)) {
            entries.push({ path: path.relative(base, abs).replace(/\\/g, "/"), bytes: 0, sha256: "MISSING" });
            continue;
        }
        walk(abs, entries, base);
    }
    entries.sort((a, b) => a.path.localeCompare(b.path));
    const totalBytes = entries.reduce((s, e) => s + e.bytes, 0);
    const h = crypto.createHash("sha256");
    for (const e of entries)
        h.update(`${e.path}\u0000${e.bytes}\u0000${e.sha256}\n`);
    return { generated_at: Date.now(), base, files: entries.length, bytes: totalBytes, sha256: h.digest("hex"), entries };
}
export function compare(baselinePath, paths) {
    const base = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    const now = manifest(paths);
    const oldMap = new Map(base.entries.map((e) => [e.path, e]));
    const newMap = new Map(now.entries.map(e => [e.path, e]));
    const details = [];
    let changed = 0;
    let added = 0;
    let removed = 0;
    for (const [p, e] of newMap) {
        const o = oldMap.get(p);
        if (!o) {
            added++;
            details.push(`+ ${p}`);
        }
        else if (o.sha256 !== e.sha256 || o.bytes !== e.bytes) {
            changed++;
            details.push(`~ ${p}`);
        }
    }
    for (const p of oldMap.keys()) {
        if (!newMap.has(p)) {
            removed++;
            details.push(`- ${p}`);
        }
    }
    return { ok: changed === 0 && added === 0 && removed === 0, changed, added, removed, details };
}
// CLI: node dist/tools/hashdir.js <path...> [--compare baseline.json]
const args = process.argv.slice(2);
const cmpIdx = args.indexOf("--compare");
if (cmpIdx >= 0) {
    const baseline = args[cmpIdx + 1];
    const paths = args.filter((_, i) => i !== cmpIdx && i !== cmpIdx + 1);
    const r = compare(baseline, paths);
    process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    process.exit(r.ok ? 0 : 1);
}
else {
    const paths = args.filter(a => a !== "--json");
    const m = manifest(paths);
    process.stdout.write(JSON.stringify(m, null, 2) + "\n");
}

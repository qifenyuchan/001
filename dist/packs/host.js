// host.ts — 包宿主：发现 / 加载 / 隔离 / 生命周期 / hook 运行
// 铁律：包加载失败只降级，不让本体起不来；派生数据可删可重建；包不能碰真源写入。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { NorthstarError } from "../core/types.js";
import { CORE_API_VERSION, } from "./types.js";
const HOOKS = ["compose", "score", "onSave", "export"];
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const FILE_RE = /^[A-Za-z0-9._-]{1,64}$/;
const DEFAULT_TIMEOUT = { compose: 50, score: 5, onSave: 100, export: 2000 };
const AUTO_DISABLE_AFTER = 10;
function cmpVer(a, b) {
    const p = (v) => v.replace(/^[^\d]*/, "").split(".").map(x => parseInt(x, 10) || 0);
    const x = p(a);
    const y = p(b);
    for (let i = 0; i < 3; i++) {
        const d = (x[i] || 0) - (y[i] || 0);
        if (d)
            return d > 0 ? 1 : -1;
    }
    return 0;
}
/** 包 id 来自命令行/清单，必须白名单校验后才能拼进路径（否则 `pack remove ../x` 会删到包目录外） */
function assertPackId(id) {
    const s = String(id == null ? "" : id).trim();
    if (!ID_RE.test(s)) {
        throw new NorthstarError("INVALID_ARG", `invalid pack id: ${s || "(empty)"}（只允许 a-z0-9_- 开头、最长 32 位，不含路径分隔符）`);
    }
    return s;
}
/** 入口文件必须落在包目录内：manifest 的 main 写了 ../../evil.js 也不能逃出包边界 */
function insideOrNull(dir, entryName) {
    const root = path.resolve(dir);
    const full = path.resolve(root, String(entryName || ""));
    const rel = path.relative(root, full);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel))
        return null;
    return full;
}
function apiCompatible(spec) {
    if (!spec)
        return true;
    const s = spec.trim();
    if (s.startsWith("^"))
        return s.slice(1).split(".")[0] === CORE_API_VERSION;
    if (s.startsWith(">="))
        return cmpVer(CORE_API_VERSION, s.slice(2)) >= 0;
    return s.split(".")[0] === CORE_API_VERSION;
}
function copyTree(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, ent.name);
        const d = path.join(dst, ent.name);
        if (ent.isDirectory())
            copyTree(s, d);
        else if (ent.isFile())
            fs.copyFileSync(s, d);
    }
}
function rmrf(p) {
    if (!fs.existsSync(p))
        return;
    for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
        const q = path.join(p, ent.name);
        if (ent.isDirectory())
            rmrf(q);
        else
            fs.unlinkSync(q);
    }
    fs.rmdirSync(p);
}
function ensureDir(p) {
    fs.mkdirSync(p, { recursive: true });
}
/**
 * 包目录默认没有 package.json，Node 会把 .js 当 CJS（ESM 语法直接报错）。
 * 这里在加载前补一个 {"type":"module"}——packsDir 由本程序管理，写它是安全的。
 */
function ensureEsm(dir, entryName) {
    if (!entryName.endsWith(".js"))
        return;
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg))
        return;
    try {
        fs.writeFileSync(pkg, JSON.stringify({ type: "module" }, null, 2) + "\n", "utf8");
    }
    catch {
        /* 只读目录：交给 import 自己失败 */
    }
}
export class PackHost {
    opts;
    log;
    loaded = new Map();
    failed = new Map();
    manifests = new Map();
    failures = new Map();
    state = { schema: 1, packs: {} };
    constructor(opts) {
        this.opts = opts;
        this.log = opts.log || {
            info: (s) => console.error(`[pack] ${s}`),
            warn: (s) => console.error(`[pack] WARN ${s}`),
            error: (s) => console.error(`[pack] ERROR ${s}`),
        };
        this.state = this.readState();
    }
    // ---------------- 状态 ----------------
    stateFile() {
        return path.join(this.opts.packsDir, "state.json");
    }
    readState() {
        try {
            const raw = JSON.parse(fs.readFileSync(this.stateFile(), "utf8"));
            if (raw && raw.schema === 1 && raw.packs && typeof raw.packs === "object")
                return raw;
        }
        catch {
            /* 无状态文件 = 空 */
        }
        return { schema: 1, packs: {} };
    }
    writeState() {
        ensureDir(this.opts.packsDir);
        fs.writeFileSync(this.stateFile(), JSON.stringify(this.state, null, 2) + "\n", "utf8");
    }
    // ---------------- 发现与加载 ----------------
    async load() {
        ensureDir(this.opts.packsDir);
        let dirs = [];
        try {
            dirs = fs
                .readdirSync(this.opts.packsDir, { withFileTypes: true })
                .filter(e => e.isDirectory())
                .map(e => path.join(this.opts.packsDir, e.name))
                .sort((a, b) => a.localeCompare(b));
        }
        catch (e) {
            this.log.warn(`cannot read packs dir: ${e && e.message}`);
            return;
        }
        for (const dir of dirs) {
            const manifest = this.readManifest(dir);
            if (!manifest)
                continue;
            this.manifests.set(manifest.id, manifest);
            const st = this.state.packs[manifest.id];
            if (st && st.enabled === false)
                continue;
            await this.loadPack(dir, manifest);
        }
    }
    readManifest(dir) {
        const file = path.join(dir, "pack.json");
        if (!fs.existsSync(file))
            return null;
        let raw;
        try {
            raw = JSON.parse(fs.readFileSync(file, "utf8"));
        }
        catch (e) {
            this.log.warn(`bad pack.json in ${dir}: ${e && e.message}`);
            return null;
        }
        if (!raw || typeof raw.id !== "string" || !ID_RE.test(raw.id)) {
            this.log.warn(`pack.json rejected (bad id) in ${dir}`);
            return null;
        }
        if (typeof raw.version !== "string" || !raw.version.trim()) {
            this.log.warn(`pack.json rejected (missing version): ${raw.id}`);
            return null;
        }
        return raw;
    }
    async loadPack(dir, manifest) {
        const api = String(manifest.apiVersion || "");
        if (!apiCompatible(api)) {
            this.failed.set(manifest.id, `apiVersion ${api} incompatible with core ${CORE_API_VERSION}`);
            this.log.warn(`${manifest.id}: apiVersion ${api} incompatible`);
            return;
        }
        const entryName = String(manifest.main || "index.js");
        const entry = insideOrNull(dir, entryName);
        if (!entry) {
            this.failed.set(manifest.id, `entry escapes pack dir: ${entryName}`);
            this.log.warn(`${manifest.id}: entry escapes pack dir (${entryName}) — refused`);
            return;
        }
        if (!fs.existsSync(entry)) {
            this.failed.set(manifest.id, `entry not found: ${entryName}`);
            this.log.warn(`${manifest.id}: entry not found (${entryName})`);
            return;
        }
        ensureEsm(dir, entryName);
        const hooks = { compose: [], score: [], onSave: [], export: [] };
        const tools = [];
        const cli = [];
        const reserved = this.reservedToolNames();
        const packApi = {
            ...this.ctxFor(manifest.id),
            version: CORE_API_VERSION,
            coreVersion: this.opts.coreVersion,
            registerProfile: (profile) => {
                try {
                    const id = String(profile?.id || "");
                    if (!id)
                        throw new Error("profile without id");
                    if (this.opts.repo.profilesList().some(p => p.id === id))
                        return; // 已装不覆盖
                    this.opts.repo.installProfile(profile);
                }
                catch (e) {
                    this.log.warn(`${manifest.id}: registerProfile failed: ${e && e.message}`);
                }
            },
            registerTool: (def, handler, o) => {
                if (!def || typeof def.name !== "string" || !def.name)
                    throw new Error("invalid tool def");
                if (reserved.has(def.name) || tools.some(t => t.def.name === def.name) || this.hasTool(def.name)) {
                    this.log.warn(`${manifest.id}: tool ${def.name} conflicts with core or another pack, skipped`);
                    return;
                }
                tools.push({ packId: manifest.id, def, handler, default: !!o?.default });
            },
            registerCli: (name, help, run) => {
                if (!ID_RE.test(name))
                    throw new Error(`invalid cli name: ${name}`);
                cli.push({ packId: manifest.id, name, help, run });
            },
            hook: (name, fn, o) => {
                if (!HOOKS.includes(name))
                    throw new Error(`unknown hook: ${name}`);
                if (typeof fn !== "function")
                    throw new Error(`hook ${name} must be a function`);
                hooks[name].push({
                    packId: manifest.id,
                    fn,
                    priority: Number(o?.priority ?? 50),
                    timeoutMs: Number(o?.timeoutMs ?? DEFAULT_TIMEOUT[name]),
                });
            },
            getRecord: (id) => this.opts.repo.get(String(id || "")) || null,
            updateTags: (id, add, remove) => {
                const rec = this.opts.repo.get(String(id || ""));
                if (!rec)
                    throw new NorthstarError("NOT_FOUND", `record not found: ${id}`);
                const minus = new Set((remove || []).map(String));
                const plus = (add || []).map(String).filter(t => t && !minus.has(t));
                // 新标签放前面：核心对标签有条数上限，截断时先保住本次新增的
                const merged = [...new Set([...plus, ...(rec.tags || []).filter(t => !minus.has(t))])];
                return this.opts.repo.update({ id: rec.id, tags: merged });
            },
        };
        try {
            const mod = await Promise.race([
                import(pathToFileURL(entry).href),
                new Promise((_, rej) => setTimeout(() => rej(new Error("import timeout")), 5000)),
            ]);
            const register = mod?.register || mod?.default;
            if (typeof register !== "function")
                throw new Error("pack must export register(api)");
            register(packApi);
        }
        catch (e) {
            this.failed.set(manifest.id, String((e && e.message) || e));
            this.log.warn(`${manifest.id}: load failed (${(e && e.message) || e})`);
            return;
        }
        for (const h of HOOKS)
            hooks[h].sort((a, b) => b.priority - a.priority);
        const info = {
            id: manifest.id,
            name: manifest.name || manifest.id,
            version: manifest.version,
            apiVersion: api || "1",
            description: manifest.description || "",
            enabled: true,
            loaded: true,
            dir,
            provides: manifest.provides,
            tools: tools.map(t => t.def.name),
            cli: cli.map(c => c.name),
        };
        this.loaded.set(manifest.id, { info, hooks, tools, cli });
        this.failed.delete(manifest.id);
        this.log.info(`loaded ${manifest.id}@${manifest.version} (tools=${tools.length} cli=${cli.length})`);
    }
    reservedToolNames() {
        return new Set(this.opts.reservedTools || []);
    }
    ctxFor(packId) {
        const dataDir = this.opts.dataDir;
        const base = path.join(dataDir, ".packs", packId);
        const storage = {
            dir: base,
            read: (name) => {
                if (!FILE_RE.test(name))
                    return null;
                try {
                    return fs.readFileSync(path.join(base, name), "utf8");
                }
                catch {
                    return null;
                }
            },
            write: (name, text) => {
                if (!FILE_RE.test(name))
                    throw new NorthstarError("INVALID_ARG", `invalid pack file name: ${name}`);
                ensureDir(base);
                fs.writeFileSync(path.join(base, name), text, "utf8");
            },
            list: () => {
                try {
                    return fs.readdirSync(base).filter(f => FILE_RE.test(f));
                }
                catch {
                    return [];
                }
            },
            clear: () => rmrf(base),
        };
        return {
            id: packId,
            dataDir,
            packsDir: this.opts.packsDir,
            storage,
            records: () => this.opts.repo.all(),
            log: {
                info: (s) => this.log.info(`${packId}: ${s}`),
                warn: (s) => this.log.warn(`${packId}: ${s}`),
                error: (s) => this.log.error(`${packId}: ${s}`),
            },
        };
    }
    // ---------------- 查询 ----------------
    list() {
        const out = [];
        const ids = new Set([
            ...Object.keys(this.state.packs || {}),
            ...this.manifests.keys(),
            ...this.loaded.keys(),
            ...this.failed.keys(),
        ]);
        for (const id of ids) {
            const lp = this.loaded.get(id);
            if (lp) {
                out.push(lp.info);
                continue;
            }
            const m = this.manifests.get(id) || (this.state.packs[id] ? { id, version: this.state.packs[id].version } : null);
            if (!m)
                continue;
            out.push({
                id,
                name: m.name || id,
                version: m.version || String(this.state.packs[id]?.version || ""),
                apiVersion: String(m.apiVersion || "1"),
                description: m.description || "",
                enabled: this.state.packs[id]?.enabled !== false,
                loaded: false,
                error: this.failed.get(id),
                dir: path.join(this.opts.packsDir, id),
                provides: m.provides,
                tools: [],
                cli: [],
            });
        }
        return out.sort((a, b) => a.id.localeCompare(b.id));
    }
    info(id) {
        return this.list().find(p => p.id === id);
    }
    toolDefs(mode) {
        const out = [];
        for (const lp of this.loaded.values()) {
            for (const t of lp.tools) {
                if (mode === "lite" && !t.default)
                    continue;
                out.push(t.def);
            }
        }
        return out;
    }
    hasTool(name) {
        for (const lp of this.loaded.values())
            if (lp.tools.some(t => t.def.name === name))
                return true;
        return false;
    }
    callTool(name, args) {
        for (const lp of this.loaded.values()) {
            const t = lp.tools.find(x => x.def.name === name);
            if (!t)
                continue;
            try {
                return { found: true, value: t.handler(args || {}) };
            }
            catch (e) {
                this.noteFailure(t.packId, "tool");
                throw e instanceof NorthstarError ? e : new NorthstarError("IO_ERROR", String((e && e.message) || e));
            }
        }
        return { found: false };
    }
    cliCommands() {
        const out = [];
        for (const lp of this.loaded.values())
            for (const c of lp.cli)
                out.push({ name: c.name, help: c.help, pack: lp.info.id });
        return out;
    }
    async runCli(name, argv) {
        for (const lp of this.loaded.values()) {
            const c = lp.cli.find(x => x.name === name);
            if (!c)
                continue;
            try {
                const r = await c.run(argv);
                return { found: true, code: typeof r === "number" ? r : 0 };
            }
            catch (e) {
                this.noteFailure(lp.info.id, "cli");
                throw e instanceof NorthstarError ? e : new NorthstarError("IO_ERROR", String((e && e.message) || e));
            }
        }
        return { found: false, code: 1 };
    }
    // ---------------- hook ----------------
    hooksOf(name) {
        const out = [];
        for (const lp of this.loaded.values())
            out.push(...lp.hooks[name]);
        return out.sort((a, b) => b.priority - a.priority);
    }
    /** 同步 hook；返回前 N 个结果（失败/超时只告警，绝不抛出） */
    invoke(name, build) {
        const out = [];
        for (const e of this.hooksOf(name)) {
            const t0 = Date.now();
            try {
                const r = e.fn(...build(e));
                if (r && typeof r.then === "function") {
                    this.log.warn(`${e.packId}: hook ${name} returned a promise; async hooks are unsupported (ignored)`);
                    continue;
                }
                out.push(r);
            }
            catch (err) {
                this.noteFailure(e.packId, `hook:${name}`);
                this.log.warn(`${e.packId}: hook ${name} failed: ${(err && err.message) || err}`);
            }
            const dt = Date.now() - t0;
            if (dt > e.timeoutMs)
                this.log.warn(`${e.packId}: hook ${name} took ${dt}ms > ${e.timeoutMs}ms`);
        }
        return out;
    }
    noteFailure(packId, where) {
        const n = (this.failures.get(packId) || 0) + 1;
        this.failures.set(packId, n);
        if (n >= AUTO_DISABLE_AFTER) {
            this.state.packs[packId] = {
                enabled: false,
                version: this.manifests.get(packId)?.version || "",
                installed_at: Date.now(),
                source: "auto-disabled",
            };
            this.writeState();
            this.loaded.delete(packId);
            this.log.error(`${packId}: auto-disabled after ${n} failures (${where})`);
        }
    }
    /** 排序加减分（各包求和） */
    score(rec, q) {
        let sum = 0;
        for (const r of this.invoke("score", e => [rec, q, this.ctxFor(e.packId)])) {
            if (typeof r === "number" && isFinite(r))
                sum += r;
        }
        return sum;
    }
    /** 上下文附加段（按优先级占用预算） */
    compose(input) {
        const segs = [];
        for (const r of this.invoke("compose", e => [input, this.ctxFor(e.packId)])) {
            if (Array.isArray(r)) {
                for (const s of r)
                    if (s && typeof s.text === "string" && s.text.trim())
                        segs.push(s);
                continue;
            }
            if (r && typeof r.text === "string" && r.text.trim())
                segs.push(r);
        }
        if (!segs.length)
            return null;
        segs.sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50));
        const parts = [];
        let used = 0;
        for (const s of segs) {
            const room = input.maxChars - used;
            if (room <= 20)
                break;
            const text = s.text.length > room ? s.text.slice(0, Math.max(0, room - 8)) + "…" : s.text;
            parts.push(text);
            used += text.length + 1;
        }
        return parts.length ? parts.join("\n") : null;
    }
    onSave(rec, prev) {
        this.invoke("onSave", e => [rec, prev, this.ctxFor(e.packId)]);
    }
    exportAll() {
        const out = [];
        for (const r of this.invoke("export", e => [this.ctxFor(e.packId)])) {
            if (r && typeof r.name === "string" && r.files)
                out.push(r);
        }
        return out;
    }
    // ---------------- 生命周期 ----------------
    async install(sourceDir, opts = {}) {
        const src = path.resolve(String(sourceDir || ""));
        if (!fs.existsSync(src))
            throw new NorthstarError("INVALID_ARG", `pack source not found: ${src}`);
        const manifest = this.readManifest(src);
        if (!manifest)
            throw new NorthstarError("INVALID_ARG", "invalid pack.json (id/version required)");
        const entry = insideOrNull(src, String(manifest.main || "index.js"));
        if (!entry || !fs.existsSync(entry)) {
            throw new NorthstarError("INVALID_ARG", "pack entry not found (must be inside the pack dir)");
        }
        const dst = path.join(this.opts.packsDir, manifest.id);
        if (fs.existsSync(dst)) {
            if (!opts.force)
                throw new NorthstarError("CONFLICT", `pack already installed: ${manifest.id} (use --force)`);
            rmrf(dst);
            this.loaded.delete(manifest.id);
        }
        ensureDir(this.opts.packsDir);
        copyTree(src, dst);
        this.manifests.set(manifest.id, manifest);
        this.state.packs[manifest.id] = { enabled: true, version: manifest.version, installed_at: Date.now(), source: src };
        this.writeState();
        await this.loadPack(dst, manifest);
        const info = this.loaded.get(manifest.id)?.info;
        if (!info)
            throw new NorthstarError("IO_ERROR", `installed but failed to load: ${this.failed.get(manifest.id)}`);
        return info;
    }
    async enable(id) {
        const pid = assertPackId(id);
        const dir = path.join(this.opts.packsDir, pid);
        const manifest = this.readManifest(dir);
        if (!manifest)
            throw new NorthstarError("NOT_FOUND", `pack not installed: ${pid}`);
        this.state.packs[pid] = {
            enabled: true,
            version: manifest.version,
            installed_at: this.state.packs[pid]?.installed_at || Date.now(),
            source: this.state.packs[pid]?.source || dir,
        };
        this.writeState();
        this.failures.delete(pid);
        await this.loadPack(dir, manifest);
    }
    disable(id) {
        const pid = assertPackId(id);
        if (!this.manifests.has(pid) && !this.loaded.has(pid))
            throw new NorthstarError("NOT_FOUND", `pack not installed: ${pid}`);
        this.state.packs[pid] = {
            enabled: false,
            version: this.manifests.get(pid)?.version || "",
            installed_at: this.state.packs[pid]?.installed_at || Date.now(),
            source: this.state.packs[pid]?.source || "",
        };
        this.writeState();
        this.loaded.delete(pid);
    }
    remove(id, opts = {}) {
        const pid = assertPackId(id);
        const manifest = this.manifests.get(pid) || this.readManifest(path.join(this.opts.packsDir, pid));
        const profiles = manifest?.provides?.profiles || [];
        const using = profiles.length
            ? this.opts.repo.all().filter(r => profiles.includes(r.profile)).length
            : 0;
        if (using > 0 && !opts.force) {
            throw new NorthstarError("CONFLICT", `${using} records use profile(s) ${profiles.join(",")}; pass --force (data stays readable)`);
        }
        rmrf(path.join(this.opts.packsDir, pid));
        delete this.state.packs[pid];
        this.writeState();
        this.manifests.delete(pid);
        this.loaded.delete(pid);
        this.failed.delete(pid);
        return { removed: pid, records_using_profile: using };
    }
    /** 清空派生数据并从真源重放 onSave */
    rebuild(id) {
        const pid = assertPackId(id);
        if (!this.loaded.has(pid))
            throw new NorthstarError("NOT_FOUND", `pack not loaded: ${pid}`);
        rmrf(path.join(this.opts.dataDir, ".packs", pid));
        const recs = this.opts.repo.all();
        let n = 0;
        for (const rec of recs) {
            this.invoke("onSave", e => [rec, null, this.ctxFor(e.packId)]);
            n++;
        }
        return { replayed: n };
    }
    doctor() {
        const out = [];
        for (const info of this.list()) {
            const notes = [];
            const dir = info.dir;
            const manifest = this.readManifest(dir);
            if (!manifest)
                notes.push("pack.json 缺失或非法");
            if (manifest && !apiCompatible(manifest.apiVersion))
                notes.push(`apiVersion ${manifest.apiVersion} 与核心 ${CORE_API_VERSION} 不兼容`);
            const entry = path.join(dir, String(manifest?.main || "index.js"));
            if (!fs.existsSync(entry))
                notes.push("入口文件缺失");
            if (this.failed.has(info.id))
                notes.push(`加载失败：${this.failed.get(info.id)}`);
            if (info.enabled && !info.loaded && !this.failed.has(info.id))
                notes.push("未加载（可能已禁用）");
            const derived = path.join(this.opts.dataDir, ".packs", info.id);
            if (fs.existsSync(derived))
                notes.push("存在派生数据（可 pack rebuild 重建）");
            out.push({ id: info.id, ok: notes.length === 0, notes });
        }
        return out;
    }
}

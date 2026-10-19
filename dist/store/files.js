// files.ts — 原子写 / 读 / 锁 / 回收站（唯一 IO 入口）
import fs from "node:fs";
import path from "node:path";
export function ensureDir(p) {
    fs.mkdirSync(p, { recursive: true });
}
export function sleepSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
export function atomicWrite(file, content) {
    const dir = path.dirname(file);
    ensureDir(dir);
    const tmp = path.join(dir, `.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    const fd = fs.openSync(tmp, "w");
    try {
        fs.writeFileSync(fd, content, "utf8");
        try {
            fs.fsyncSync(fd);
        }
        catch {
            /* fsync may be unsupported on some FS */
        }
    }
    finally {
        fs.closeSync(fd);
    }
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            fs.renameSync(tmp, file);
            return;
        }
        catch (e) {
            if (attempt === 2) {
                try {
                    fs.unlinkSync(tmp);
                }
                catch {
                    /* ignore */
                }
                throw e;
            }
            sleepSync(20);
        }
    }
}
export function atomicWriteJson(file, value) {
    atomicWrite(file, JSON.stringify(value, null, 2) + "\n");
}
export function readJson(file) {
    try {
        const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
        return { ok: true, value: JSON.parse(text) };
    }
    catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
    }
}
export function listFiles(dir, suffix = ".json") {
    try {
        return fs
            .readdirSync(dir)
            .filter(n => n.endsWith(suffix) && !n.startsWith("."))
            .sort();
    }
    catch {
        return [];
    }
}
export function listDirs(dir) {
    try {
        return fs
            .readdirSync(dir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name)
            .sort();
    }
    catch {
        return [];
    }
}
// 短写锁：mkdir 原子性；持锁 <50ms；超时抛 LOCK_TIMEOUT 由调用方处理
export function withLock(lockRoot, key, fn, timeoutMs = 2000) {
    ensureDir(lockRoot);
    const lockPath = path.join(lockRoot, `${key}.lock`);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        try {
            fs.mkdirSync(lockPath);
            break;
        }
        catch (e) {
            if (e && e.code === "EEXIST") {
                if (Date.now() > deadline) {
                    const err = new Error(`lock timeout: ${key}`);
                    err.code = "LOCK_TIMEOUT";
                    throw err;
                }
                sleepSync(25);
                continue;
            }
            throw e;
        }
    }
    try {
        fn();
    }
    finally {
        try {
            fs.rmdirSync(lockPath);
        }
        catch {
            /* ignore */
        }
    }
}
export function touchRev(sessionDir) {
    try {
        ensureDir(sessionDir);
        fs.writeFileSync(path.join(sessionDir, ".rev"), String(Date.now()), "utf8");
    }
    catch {
        /* ignore */
    }
}
export function revStamp(sessionDir) {
    try {
        return fs.statSync(path.join(sessionDir, ".rev")).mtimeMs;
    }
    catch {
        return 0;
    }
}

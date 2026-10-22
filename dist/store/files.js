// files.ts — 原子写 / 读 / 锁 / 回收站（唯一 IO 入口）
import fs from "node:fs";
import path from "node:path";
import { NorthstarError } from "../core/types.js";
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
// 短写锁：mkdir 原子性；带 owner 心跳，崩溃/跨设备残留超过 30s 自动清理
export function withLock(lockRoot, key, fn, timeoutMs = 3000) {
    ensureDir(lockRoot);
    const lockPath = path.join(lockRoot, `${key}.lock`);
    const ownerFile = path.join(lockPath, "owner.json");
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        try {
            fs.mkdirSync(lockPath);
            try {
                fs.writeFileSync(ownerFile, JSON.stringify({ pid: process.pid, ts: Date.now() }), "utf8");
            }
            catch {
                /* owner file best-effort */
            }
            break;
        }
        catch (e) {
            if (e && e.code === "EEXIST") {
                // 残留锁：超过 30s 或持有进程已不存在 → 清理重试
                let stale = false;
                try {
                    const owner = JSON.parse(fs.readFileSync(ownerFile, "utf8"));
                    const age = Date.now() - Number(owner.ts || 0);
                    let alive = true;
                    if (owner.pid) {
                        try {
                            process.kill(Number(owner.pid), 0);
                        }
                        catch {
                            alive = false;
                        }
                    }
                    if (age > 30000 || !alive)
                        stale = true;
                }
                catch {
                    // 没有 owner（旧版残留/刚建目录）→ 按 mtime 判断
                    try {
                        const age = Date.now() - fs.statSync(lockPath).mtimeMs;
                        if (age > 30000)
                            stale = true;
                    }
                    catch {
                        stale = true;
                    }
                }
                if (stale) {
                    try {
                        fs.rmSync(lockPath, { recursive: true, force: true });
                    }
                    catch {
                        /* ignore */
                    }
                    continue;
                }
                if (Date.now() > deadline) {
                    // 必须是 NorthstarError：工具层只认这个类型，用普通 Error 会被降级成 IO_ERROR，
                    // 于是 Agent 分不清「别人正在写，稍后重试」和「磁盘坏了」
                    throw new NorthstarError("LOCK_TIMEOUT", `lock timeout: ${key}`);
                }
                sleepSync(25);
                continue;
            }
            throw e;
        }
    }
    let result;
    try {
        result = fn();
    }
    finally {
        try {
            fs.rmSync(lockPath, { recursive: true, force: true });
        }
        catch {
            /* ignore */
        }
    }
    return result;
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

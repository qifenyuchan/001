// files.ts — 原子写 / 读 / 锁 / 回收站（唯一 IO 入口）

import fs from "node:fs";
import path from "node:path";

export function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

export function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function atomicWrite(file: string, content: string): void {
  const dir = path.dirname(file);
  ensureDir(dir);
  const tmp = path.join(dir, `.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, content, "utf8");
    try {
      fs.fsyncSync(fd);
    } catch {
      /* fsync may be unsupported on some FS */
    }
  } finally {
    fs.closeSync(fd);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (e) {
      if (attempt === 2) {
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* ignore */
        }
        throw e;
      }
      sleepSync(20);
    }
  }
}

export function atomicWriteJson(file: string, value: unknown): void {
  atomicWrite(file, JSON.stringify(value, null, 2) + "\n");
}

export interface ReadResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

export function readJson<T = unknown>(file: string): ReadResult<T> {
  try {
    const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    return { ok: true, value: JSON.parse(text) as T };
  } catch (e: any) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

export function listFiles(dir: string, suffix = ".json"): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter(n => n.endsWith(suffix) && !n.startsWith("."))
      .sort();
  } catch {
    return [];
  }
}

export function listDirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort();
  } catch {
    return [];
  }
}

// 短写锁：mkdir 原子性；持锁 <50ms；超时抛 LOCK_TIMEOUT 由调用方处理
export function withLock(lockRoot: string, key: string, fn: () => void, timeoutMs = 2000): void {
  ensureDir(lockRoot);
  const lockPath = path.join(lockRoot, `${key}.lock`);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      fs.mkdirSync(lockPath);
      break;
    } catch (e: any) {
      if (e && e.code === "EEXIST") {
        if (Date.now() > deadline) {
          const err: any = new Error(`lock timeout: ${key}`);
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
  } finally {
    try {
      fs.rmdirSync(lockPath);
    } catch {
      /* ignore */
    }
  }
}

export function touchRev(sessionDir: string): void {
  try {
    ensureDir(sessionDir);
    fs.writeFileSync(path.join(sessionDir, ".rev"), String(Date.now()), "utf8");
  } catch {
    /* ignore */
  }
}

export function revStamp(sessionDir: string): number {
  try {
    return fs.statSync(path.join(sessionDir, ".rev")).mtimeMs;
  } catch {
    return 0;
  }
}

// log.ts — 日志：stderr + data/logs/server.log（5MB 轮转）
import fs from "node:fs";
import path from "node:path";
let logFile = "";
const MAX_BYTES = 5 * 1024 * 1024;
export function initLog(file) {
    logFile = file;
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
    }
    catch {
        /* ignore */
    }
}
function rotateIfNeeded() {
    if (!logFile)
        return;
    try {
        const st = fs.statSync(logFile);
        if (st.size > MAX_BYTES) {
            const backup = logFile + ".1";
            try {
                fs.rmSync(backup, { force: true });
            }
            catch {
                /* ignore */
            }
            fs.renameSync(logFile, backup);
        }
    }
    catch {
        /* file absent */
    }
}
export function log(level, msg, extra) {
    const line = `[${new Date().toISOString()}] [${level}] ${msg}` + (extra === undefined ? "" : ` ${safeJson(extra)}`);
    process.stderr.write(line + "\n");
    if (!logFile)
        return;
    try {
        rotateIfNeeded();
        fs.appendFileSync(logFile, line + "\n", "utf8");
    }
    catch {
        /* logging must never throw */
    }
}
function safeJson(v) {
    try {
        return JSON.stringify(v);
    }
    catch {
        return String(v);
    }
}
export const logInfo = (m, e) => log("info", m, e);
export const logWarn = (m, e) => log("warn", m, e);
export const logError = (m, e) => log("error", m, e);

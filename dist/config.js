// config.ts — 配置解析：CLI > 环境变量 > tm.config.json > 默认值
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function loadConfig(cli = {}) {
    let fileCfg = {};
    try {
        fileCfg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, "tm.config.json"), "utf8"));
    }
    catch {
        fileCfg = {};
    }
    const dataRaw = cli.data || process.env.TM_DATA_DIR || process.env.NORTHSTAR_DATA || fileCfg.data_dir || "./data";
    const dataDir = path.isAbsolute(dataRaw) ? dataRaw : path.resolve(PACKAGE_ROOT, dataRaw);
    const uiHost = cli.uiHost || process.env.TM_UI_HOST || fileCfg.ui_host || "127.0.0.1";
    const uiPort = Number(cli.uiPort ?? process.env.TM_UI_PORT ?? fileCfg.ui_port ?? 8777);
    const rangeEvery = Math.max(2, Number(cli.rangeEvery ?? process.env.TM_RANGE_EVERY ?? fileCfg.range_every ?? 10));
    const recallMaxChars = Math.max(200, Number(cli.recallMaxChars ?? fileCfg.recall_max_chars ?? 1200));
    const rawHead = Math.max(200, Number(fileCfg.raw_head ?? 1200));
    const rawTail = Math.max(0, Number(fileCfg.raw_tail ?? 600));
    return {
        root: PACKAGE_ROOT,
        dataDir,
        uiHost,
        uiPort: isFinite(uiPort) ? uiPort : 8777,
        noUi: !!cli.noUi,
        uiOnly: !!cli.uiOnly,
        rangeEvery,
        recallMaxChars,
        rawHead,
        rawTail,
        logFile: path.join(dataDir, "logs", "server.log"),
    };
}

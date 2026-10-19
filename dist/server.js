#!/usr/bin/env node
// server.ts — 入口：MCP stdio + 可选 UI HTTP；配置/日志/信号
import { loadConfig, PACKAGE_ROOT } from "./config.js";
import { initLog, logError, logInfo, logWarn } from "./log.js";
import { RepoStore } from "./store/repo.js";
import { createTools, INSTRUCTIONS } from "./mcp/tools.js";
import { startRpcServer } from "./mcp/jsonrpc.js";
import { startUiServer } from "./ui/http.js";
// stdout 是 MCP 协议通道：任何 console.log 一律转 stderr
console.log = (...args) => console.error(...args);
function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => argv[++i];
        switch (a) {
            case "--data":
                out.data = next();
                break;
            case "--ui-port":
                out.uiPort = Number(next());
                break;
            case "--ui-host":
                out.uiHost = next();
                break;
            case "--no-ui":
                out.noUi = true;
                break;
            case "--ui-only":
                out.uiOnly = true;
                break;
            case "--range-every":
                out.rangeEvery = Number(next());
                break;
            case "--recall-max-chars":
                out.recallMaxChars = Number(next());
                break;
            default:
                break;
        }
    }
    return out;
}
const config = loadConfig(parseArgs(process.argv.slice(2)));
initLog(config.logFile);
console.error(`[northstar] start | data=${config.dataDir} | ui=${config.noUi ? "off" : `${config.uiHost}:${config.uiPort}`} | mcp=${config.uiOnly ? "off" : "stdio"}`);
console.error(`[northstar] package root: ${PACKAGE_ROOT}`);
const repo = new RepoStore({
    dataDir: config.dataDir,
    rangeEvery: config.rangeEvery,
    rawHead: config.rawHead,
    rawTail: config.rawTail,
});
repo.open();
let uiServer;
if (!config.noUi) {
    startUiServer(repo, config)
        .then(({ server, port }) => {
        uiServer = server;
        const url = `http://${config.uiHost}:${port}`;
        console.error(`[northstar] UI ready: ${url}`);
        logInfo(`ui ready ${url}`);
    })
        .catch((e) => {
        logWarn(`ui failed to start (MCP continues): ${e && e.message}`);
        console.error(`[northstar] UI failed (MCP continues): ${e && e.message}`);
    });
}
if (!config.uiOnly) {
    const tools = createTools(repo, config);
    startRpcServer({
        serverName: "northstar-memory",
        serverVersion: "2.0.0",
        instructions: INSTRUCTIONS,
        tools: tools.defs,
        callTool: tools.callTool,
        onShutdown: () => {
            try {
                uiServer?.close();
            }
            catch {
                /* ignore */
            }
        },
    });
}
else {
    // 仅 UI 模式：保持进程存活
    process.on("SIGINT", () => {
        uiServer?.close();
        process.exit(0);
    });
    process.on("SIGTERM", () => {
        uiServer?.close();
        process.exit(0);
    });
}
process.on("uncaughtException", e => logError("uncaughtException", e && e.stack ? e.stack : String(e)));
process.on("unhandledRejection", e => logError("unhandledRejection", e && e.stack ? e.stack : String(e)));

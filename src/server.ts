#!/usr/bin/env node
// server.ts — 入口：MCP stdio + MCP over HTTP + UI HTTP；配置/日志/信号
import { loadConfig, PACKAGE_ROOT, type CliOptions } from "./config.js";
import { initLog, logError, logInfo, logWarn } from "./log.js";
import { RepoStore } from "./store/repo.js";
import { createTools, INSTRUCTIONS, defsFor, TOOL_DEFS } from "./mcp/tools.js";
import { startRpcServer } from "./mcp/jsonrpc.js";
import { startHttpRpcServer } from "./mcp/http.js";
import { startUiServer } from "./ui/http.js";
import { isLoopbackHost } from "./auth.js";
import { PackHost } from "./packs/host.js";

// stdout 是 MCP 协议通道：任何 console.log 一律转 stderr
console.log = (...args: unknown[]) => console.error(...args);

function parseArgs(argv: string[]): CliOptions {
  const out: CliOptions = {};
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
      case "--http-port":
        out.httpPort = Number(next());
        break;
      case "--http-host":
        out.httpHost = next();
        break;
      case "--token":
        out.authToken = next();
        break;
      case "--tools":
        out.toolsMode = next() === "full" ? "full" : "lite";
        break;
      case "--no-ui":
        out.noUi = true;
        break;
      case "--no-mcp":
        out.noMcp = true;
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
      case "--packs-dir":
        out.packsDir = next();
        break;
      case "--no-packs":
        out.noPacks = true;
        break;
      default:
        break;
    }
  }
  return out;
}

const config = loadConfig(parseArgs(process.argv.slice(2)));
initLog(config.logFile);

// 安全闸：任何非回环监听都必须有令牌（fail closed）
const exposeUi = !config.noUi && !isLoopbackHost(config.uiHost);
const exposeHttp = config.httpPort > 0 && !config.noMcp && !isLoopbackHost(config.httpHost);
if ((exposeUi || exposeHttp) && !config.authToken) {
  console.error(
    `[northstar] 拒绝启动：监听非回环地址（ui=${config.uiHost} http=${config.httpHost}:${config.httpPort}）但未设置令牌。\n` +
      `请设置 TM_AUTH_TOKEN 或 --token <随机字符串> 后重试。`
  );
  process.exit(1);
}

console.error(
  `[northstar] start | data=${config.dataDir} | ui=${config.noUi ? "off" : `${config.uiHost}:${config.uiPort}`} | ` +
    `mcp=${config.uiOnly ? "off" : "stdio"} | http-mcp=${config.httpPort ? `${config.httpHost}:${config.httpPort}/mcp` : "off"} | auth=${config.authToken ? "on" : "off"}`
);
console.error(`[northstar] package root: ${PACKAGE_ROOT}`);

const repo = new RepoStore({
  dataDir: config.dataDir,
  rangeEvery: config.rangeEvery,
  rawHead: config.rawHead,
  rawTail: config.rawTail,
});
repo.open();

// 包宿主：加载失败只降级，绝不让服务起不来
let host: PackHost | undefined;
if (!config.noPacks) {
  host = new PackHost({
    packsDir: config.packsDir,
    dataDir: config.dataDir,
    repo,
    coreVersion: "2.11.2",
    reservedTools: TOOL_DEFS.map(t => t.name),
  });
  try {
    await host.load();
    const loaded = host.list().filter(p => p.loaded);
    if (loaded.length) console.error(`[northstar] packs: ${loaded.map(p => `${p.id}@${p.version}`).join(", ")}`);
  } catch (e: any) {
    console.error(`[northstar] pack load failed (core continues): ${e && e.message}`);
    host = undefined;
  }
}

const tools = createTools(repo, config, host);
const toolDefs = defsFor(config.toolsMode, host);
const servers: Array<import("node:http").Server> = [];

if (!config.noUi) {
  startUiServer(repo, config)
    .then(({ server, port }) => {
      servers.push(server);
      const url = `http://${config.uiHost}:${port}`;
      console.error(`[northstar] UI ready: ${url}${config.authToken ? "/?token=<TM_AUTH_TOKEN>" : ""}`);
      logInfo(`ui ready ${url}`);
    })
    .catch((e: any) => {
      logWarn(`ui failed to start (MCP continues): ${e && e.message}`);
      console.error(`[northstar] UI failed (MCP continues): ${e && e.message}`);
    });
}

if (config.httpPort > 0 && !config.noMcp) {
  startHttpRpcServer(
    {
      serverName: "northstar-memory",
      serverVersion: "2.11.2",
      instructions: INSTRUCTIONS,
      tools: toolDefs,
      callTool: tools.callTool,
      authToken: config.authToken,
    },
    config.httpHost,
    config.httpPort
  )
    .then(({ server, port }) => {
      servers.push(server);
      console.error(`[northstar] HTTP MCP ready: http://${config.httpHost}:${port}/mcp${config.authToken ? " (bearer token required)" : ""}`);
    })
    .catch((e: any) => {
      logError(`http mcp failed to start: ${e && e.message}`);
      console.error(`[northstar] HTTP MCP failed: ${e && e.message}`);
    });
}

if (!config.uiOnly && !config.noMcp) {
  startRpcServer({
    serverName: "northstar-memory",
    serverVersion: "2.11.2",
    instructions: INSTRUCTIONS,
    tools: toolDefs,
    callTool: tools.callTool,
    onShutdown: () => {
      for (const s of servers) {
        try {
          s.close();
        } catch {
          /* ignore */
        }
      }
    },
  });
} else if (!config.noUi || config.httpPort > 0) {
  const stop = () => {
    for (const s of servers) {
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

process.on("uncaughtException", e => logError("uncaughtException", e && (e as any).stack ? (e as any).stack : String(e)));
process.on("unhandledRejection", e => logError("unhandledRejection", e && (e as any).stack ? (e as any).stack : String(e)));

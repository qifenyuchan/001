// jsonrpc.ts — MCP JSON-RPC 2.0 核心（stdio + HTTP 共用同一处理器）
// 铁律：stdio 模式下 stdout 只允许协议行；日志一律走 stderr。
import readline from "node:readline";
function errorObj(id, code, message) {
    return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}
// 传输无关的 JSON-RPC 处理器：返回响应对象；通知返回 null
export function createRpcHandler(opts) {
    return (req) => {
        if (!req || typeof req !== "object" || typeof req.method !== "string") {
            return errorObj(req && req.id, -32600, "Invalid Request");
        }
        const isNotification = req.id === undefined || req.id === null;
        try {
            switch (req.method) {
                case "initialize":
                    return {
                        jsonrpc: "2.0",
                        id: req.id,
                        result: {
                            protocolVersion: "2024-11-05",
                            capabilities: { tools: {} },
                            serverInfo: { name: opts.serverName, version: opts.serverVersion },
                            instructions: opts.instructions,
                        },
                    };
                case "notifications/initialized":
                case "notifications/cancelled":
                    return null;
                case "ping":
                    return { jsonrpc: "2.0", id: req.id, result: {} };
                case "tools/list":
                    return { jsonrpc: "2.0", id: req.id, result: { tools: opts.tools } };
                case "tools/call": {
                    const name = req.params && req.params.name;
                    const args = (req.params && req.params.arguments) || {};
                    const def = opts.tools.find(t => t.name === name);
                    if (!def)
                        return errorObj(req.id, -32601, `Unknown tool: ${name}`);
                    const result = opts.callTool(name, args);
                    return { jsonrpc: "2.0", id: req.id, result };
                }
                default:
                    if (isNotification)
                        return null;
                    return errorObj(req.id, -32601, `Method not found: ${req.method}`);
            }
        }
        catch (e) {
            return errorObj(req.id, -32603, e && e.message ? e.message : String(e));
        }
    };
}
export function startRpcServer(opts) {
    const handler = createRpcHandler(opts);
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    rl.on("line", line => {
        const text = line.trim();
        if (!text)
            return;
        let req;
        try {
            req = JSON.parse(text);
        }
        catch {
            process.stdout.write(JSON.stringify(errorObj(null, -32700, "Parse error")) + "\n");
            return;
        }
        const res = handler(req);
        if (res)
            process.stdout.write(JSON.stringify(res) + "\n");
    });
    rl.on("close", () => {
        if (opts.onShutdown)
            opts.onShutdown();
        process.exit(0);
    });
}

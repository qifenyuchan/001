// http.ts — MCP over HTTP（Streamable HTTP 子集，兼容 2024-11-05 / 2025-03-26 客户端）
// POST /mcp ：JSON-RPC 单请求；通知返回 202；带 Bearer 令牌鉴权
import http from "node:http";
import crypto from "node:crypto";
import { checkToken } from "../auth.js";
import { createRpcHandler } from "./jsonrpc.js";
import { logInfo, logWarn } from "../log.js";
const MAX_BODY = 4 * 1024 * 1024;
function json(res, status, payload, extra = {}) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ...extra,
    });
    res.end(body);
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on("data", (c) => {
            size += c.length;
            if (size > MAX_BODY) {
                reject(new Error("body too large"));
                req.destroy();
                return;
            }
            chunks.push(c);
        });
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}
export function createHttpRpcServer(opts) {
    const handler = createRpcHandler(opts);
    return http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
            if (url.pathname !== "/mcp") {
                json(res, 404, { ok: false, error: "not found; MCP endpoint is POST /mcp" });
                return;
            }
            if (req.method === "OPTIONS") {
                res.writeHead(204, {
                    "Access-Control-Allow-Origin": req.headers.origin || "*",
                    "Access-Control-Allow-Headers": "content-type, authorization, mcp-session-id",
                    "Access-Control-Allow-Methods": "POST, OPTIONS",
                });
                res.end();
                return;
            }
            if (req.method !== "POST") {
                json(res, 405, { ok: false, error: "method not allowed; use POST /mcp" });
                return;
            }
            if (!checkToken(req, url, opts.authToken)) {
                json(res, 401, { jsonrpc: "2.0", id: null, error: { code: -32001, message: "unauthorized: bearer token required" } });
                return;
            }
            const raw = await readBody(req);
            let parsed;
            try {
                parsed = JSON.parse(raw || "{}");
            }
            catch {
                json(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
                return;
            }
            const isNotification = parsed && parsed.id === undefined;
            const result = handler(parsed);
            const extra = {};
            if (parsed && parsed.method === "initialize") {
                extra["Mcp-Session-Id"] = crypto.randomBytes(16).toString("hex");
            }
            if (!result) {
                res.writeHead(202, extra);
                res.end();
                return;
            }
            json(res, 200, result, extra);
            if (isNotification)
                return;
        }
        catch (e) {
            logWarn(`http mcp error: ${e && e.message}`);
            json(res, 500, { jsonrpc: "2.0", id: null, error: { code: -32603, message: e && e.message ? e.message : String(e) } });
        }
    });
}
export function startHttpRpcServer(opts, host, port) {
    return new Promise((resolve, reject) => {
        const server = createHttpRpcServer(opts);
        server.once("error", reject);
        server.listen(port, host, () => {
            const addr = server.address();
            const actual = typeof addr === "object" && addr ? addr.port : port;
            logInfo(`http mcp ready http://${host}:${actual}/mcp`);
            resolve({ server, port: actual });
        });
    });
}

// http.ts — MCP over HTTP（Streamable HTTP 子集，兼容 2024-11-05 / 2025-03-26 客户端）
// POST /mcp ：JSON-RPC 单请求；通知返回 202；带 Bearer 令牌鉴权
import http from "node:http";
import crypto from "node:crypto";
import { checkToken, isLoopbackHost } from "../auth.js";
import { createRpcHandler, type RpcOptions } from "./jsonrpc.js";
import { logInfo, logWarn } from "../log.js";

const MAX_BODY = 4 * 1024 * 1024;

function json(res: http.ServerResponse, status: number, payload: unknown, extra: Record<string, string> = {}): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extra,
  });
  res.end(body);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
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

export interface HttpRpcOptions extends RpcOptions {
  authToken: string;
}

export function createHttpRpcServer(opts: HttpRpcOptions): http.Server {
  const handler = createRpcHandler(opts);
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      if (url.pathname !== "/mcp") {
        json(res, 404, { ok: false, error: "not found; MCP endpoint is POST /mcp" });
        return;
      }
      const hostHeader = String(req.headers.host || "");
      const hostOnly = hostHeader.startsWith("[") ? hostHeader.slice(0, hostHeader.indexOf("]") + 1) : hostHeader.split(":")[0];
      if (!opts.authToken && !isLoopbackHost(hostOnly)) {
        json(res, 403, { jsonrpc: "2.0", id: null, error: { code: -32002, message: "host not allowed" } });
        return;
      }
      const origin = req.headers.origin;
      if (origin) {
        let ok = false;
        try {
          ok = new URL(origin).host === hostHeader;
        } catch {
          ok = false;
        }
        if (!ok) {
          json(res, 403, { jsonrpc: "2.0", id: null, error: { code: -32002, message: "cross-origin request rejected" } });
          return;
        }
      }
      if (req.method === "OPTIONS") {
        res.writeHead(204, { Allow: "POST, OPTIONS" });
        res.end();
        return;
      }
      if (req.method !== "POST") {
        json(res, 405, { ok: false, error: "method not allowed; use POST /mcp" });
        return;
      }
      const ct = String(req.headers["content-type"] || "").toLowerCase();
      if (!ct.startsWith("application/json")) {
        json(res, 415, { jsonrpc: "2.0", id: null, error: { code: -32003, message: "Content-Type must be application/json" } });
        return;
      }
      if (!checkToken(req, url, opts.authToken)) {
        json(res, 401, { jsonrpc: "2.0", id: null, error: { code: -32001, message: "unauthorized: bearer token required" } });
        return;
      }
      const raw = await readBody(req);
      let parsed: any;
      try {
        parsed = JSON.parse(raw || "{}");
      } catch {
        json(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        return;
      }
      const isNotification = parsed && parsed.id === undefined;
      const result = handler(parsed);
      const extra: Record<string, string> = {};
      if (parsed && parsed.method === "initialize") {
        extra["Mcp-Session-Id"] = crypto.randomBytes(16).toString("hex");
      }
      if (!result) {
        res.writeHead(202, extra);
        res.end();
        return;
      }
      json(res, 200, result, extra);
      if (isNotification) return;
    } catch (e: any) {
      logWarn(`http mcp error: ${e && e.message}`);
      json(res, 500, { jsonrpc: "2.0", id: null, error: { code: -32603, message: e && e.message ? e.message : String(e) } });
    }
  });
}

export function startHttpRpcServer(opts: HttpRpcOptions, host: string, port: number): Promise<{ server: http.Server; port: number }> {
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

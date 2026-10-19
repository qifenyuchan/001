// jsonrpc.ts — 手写 MCP stdio 协议（换行分帧 JSON-RPC 2.0；零依赖）
// 铁律：stdout 只允许协议行；日志一律走 stderr。

import readline from "node:readline";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface RpcOptions {
  serverName: string;
  serverVersion: string;
  instructions: string;
  tools: ToolDef[];
  callTool: (name: string, args: Record<string, unknown>) => { content: Array<{ type: string; text: string }>; isError?: boolean };
  onShutdown?: () => void;
}

interface Request {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: any;
}

function send(msg: unknown): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function reply(id: string | number | null | undefined, result: unknown): void {
  if (id === undefined || id === null) return; // 通知不回复
  send({ jsonrpc: "2.0", id, result });
}

function replyError(id: string | number | null | undefined, code: number, message: string): void {
  if (id === undefined || id === null) return;
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

export function startRpcServer(opts: RpcOptions): void {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", line => {
    const text = line.trim();
    if (!text) return;
    let req: Request;
    try {
      req = JSON.parse(text);
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }
    if (!req || typeof req.method !== "string") {
      replyError(req && req.id, -32600, "Invalid Request");
      return;
    }
    try {
      switch (req.method) {
        case "initialize":
          reply(req.id, {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: opts.serverName, version: opts.serverVersion },
            instructions: opts.instructions,
          });
          break;
        case "notifications/initialized":
        case "notifications/cancelled":
          break;
        case "ping":
          reply(req.id, {});
          break;
        case "tools/list":
          reply(req.id, { tools: opts.tools });
          break;
        case "tools/call": {
          const name = req.params && req.params.name;
          const args = (req.params && req.params.arguments) || {};
          const def = opts.tools.find(t => t.name === name);
          if (!def) {
            replyError(req.id, -32601, `Unknown tool: ${name}`);
            break;
          }
          const result = opts.callTool(name, args);
          reply(req.id, result);
          break;
        }
        default:
          replyError(req.id, -32601, `Method not found: ${req.method}`);
      }
    } catch (e: any) {
      replyError(req.id, -32603, e && e.message ? e.message : String(e));
    }
  });
  rl.on("close", () => {
    if (opts.onShutdown) opts.onShutdown();
    process.exit(0);
  });
}

// auth.ts — 令牌校验（Bearer / Cookie / Query；恒定时间比较）
import crypto from "node:crypto";
import type http from "node:http";

export const TOKEN_COOKIE = "ns_token";

export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function isLoopbackHost(host: string): boolean {
  const h = String(host || "").toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) continue;
    // 畸形百分号是客户端问题：退化成原值（比对必然失败），不能把整个请求变成 500
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function extractToken(req: http.IncomingMessage, url?: URL): string {
  const auth = req.headers.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[TOKEN_COOKIE]) return cookies[TOKEN_COOKIE];
  if (url && url.searchParams.get("token")) return String(url.searchParams.get("token"));
  const h = req.headers["x-northstar-token"];
  if (typeof h === "string" && h.trim()) return h.trim();
  return "";
}

export function checkToken(req: http.IncomingMessage, url: URL | undefined, expected: string): boolean {
  if (!expected) return true; // 未配置令牌 = 仅回环模式（启动时已强制）
  const got = extractToken(req, url);
  return !!got && safeEqual(got, expected);
}

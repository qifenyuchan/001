// http.ts — 极简 UI 服务（零依赖；支持令牌鉴权与远程绑定）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { PACKAGE_ROOT, type Config } from "../config.js";
import { RepoStore } from "../store/repo.js";
import { GENERAL_PROFILE } from "../store/profiles.js";
import { searchRecords } from "../features/search.js";
import { deriveTitleFromFields } from "../core/title.js";
import { logWarn } from "../log.js";
import { checkToken, extractToken, safeEqual, TOKEN_COOKIE, isLoopbackHost } from "../auth.js";
import type { MemoryRecord } from "../core/types.js";

const MAX_BODY = 2 * 1024 * 1024;

function json(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function readBody(req: http.IncomingMessage): Promise<any> {
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
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid json body"));
      }
    });
    req.on("error", reject);
  });
}

function decorate(rec: MemoryRecord, sessionName?: string, profile = GENERAL_PROFILE) {
  return {
    id: rec.id,
    kind: rec.kind,
    profile: rec.profile,
    profile_name: profile.name,
    session_key: rec.session_key,
    session_id: rec.session_id,
    session_name: sessionName,
    turn_no: rec.turn_no,
    created_at: rec.created_at,
    updated_at: rec.updated_at,
    revision: rec.revision,
    quality: rec.quality,
    missing: rec.missing,
    blank: rec.blank,
    tags: rec.tags,
    rating: rec.rating,
    range: rec.range,
    auto: rec.auto,
    truncated: rec.truncated,
    raw_truncated: rec.raw_truncated,
    origin: rec.origin,
    title: deriveTitleFromFields(rec.fields, rec.raw_text, profile),
    excerpt: rec.fields[profile.excerpt_field] || "",
    fields: rec.fields,
    raw_text: rec.raw_text,
  };
}

function hostAllowed(hostHeader: string | undefined, authToken: string): boolean {
  if (!hostHeader) return false;
  if (authToken) return true; // 有令牌时允许任意 Host（远程/域名访问）
  const host = hostHeader.startsWith("[") ? hostHeader.slice(0, hostHeader.indexOf("]") + 1) : hostHeader.split(":")[0];
  const h = host.toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "[::1]" || h === "::1";
}

// 同源校验：浏览器跨站 POST 会带 Origin/Sec-Fetch-Site；本地 CLI/脚本无 Origin 放行
function sameOrigin(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin) {
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  }
  const site = req.headers["sec-fetch-site"];
  if (typeof site === "string" && site !== "same-origin" && site !== "none") return false;
  return true;
}

function requireJson(req: http.IncomingMessage): boolean {
  const ct = String(req.headers["content-type"] || "").toLowerCase();
  return ct.startsWith("application/json");
}

export function createUiServer(repo: RepoStore, config: Config): http.Server {
  const htmlFile = path.join(PACKAGE_ROOT, "ui", "index.html");
  const staticMap: Record<string, { file: string; type: string }> = {
    "/styles.css": { file: path.join(PACKAGE_ROOT, "ui", "styles.css"), type: "text/css; charset=utf-8" },
    "/app.js": { file: path.join(PACKAGE_ROOT, "ui", "app.js"), type: "text/javascript; charset=utf-8" },
  };
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      const p = url.pathname;
      if (!hostAllowed(req.headers.host, config.authToken)) {
        json(res, 403, { ok: false, error: "host not allowed" });
        return;
      }

      // 令牌引导：/?token=xxx → 写 Cookie 后重定向（去掉 URL 里的令牌）
      const queryToken = url.searchParams.get("token") || "";
      if (config.authToken && queryToken) {
        if (!safeEqual(queryToken, config.authToken)) {
          json(res, 401, { ok: false, error: "invalid token" });
          return;
        }
        url.searchParams.delete("token");
        const target = url.pathname + (url.search ? url.search : "") + url.hash;
        res.writeHead(302, {
          "Set-Cookie": `${TOKEN_COOKIE}=${encodeURIComponent(config.authToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
          Location: target || "/",
        });
        res.end();
        return;
      }

      // 鉴权：/api/health 放行，其余全部需要令牌（配置了令牌时）
      if (config.authToken && p !== "/api/health") {
        if (!checkToken(req, url, config.authToken)) {
          if (p.startsWith("/api/")) {
            json(res, 401, { ok: false, error: "unauthorized: token required" });
          } else {
            res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
              `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#0f1216;color:#e6edf3;padding:40px">` +
                `<h2>需要访问令牌</h2><p>请在地址后追加 <code>/?token=你的令牌</code> 打开一次，浏览器会记住。</p></body>`
            );
          }
          return;
        }
      }

      if (req.method === "POST") {
        if (!sameOrigin(req)) {
          json(res, 403, { ok: false, error: "cross-origin request rejected" });
          return;
        }
        if (!requireJson(req)) {
          json(res, 415, { ok: false, error: "Content-Type must be application/json" });
          return;
        }
      }

      if (req.method === "GET" && staticMap[p]) {
        const asset = staticMap[p];
        try {
          const body = fs.readFileSync(asset.file);
          res.writeHead(200, { "Content-Type": asset.type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
          res.end(body);
        } catch {
          json(res, 404, { ok: false, error: "asset missing" });
        }
        return;
      }

      if (req.method === "GET" && (p === "/" || p === "/index.html")) {
        let html = "";
        try {
          html = fs.readFileSync(htmlFile, "utf8");
        } catch {
          json(res, 500, { ok: false, error: "ui/index.html missing" });
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(html);
        return;
      }

      if (req.method === "GET" && p === "/api/health") {
        json(res, 200, { ok: true, name: "northstar-memory", version: "2.7.0" });
        return;
      }

      if (req.method === "GET" && p === "/api/stats") {
        json(res, 200, repo.stats());
        return;
      }

      if (req.method === "GET" && p === "/api/list") {
        const r = repo.list({
          session_key: url.searchParams.get("session") || undefined,
          profile: url.searchParams.get("profile") || undefined,
          kind: url.searchParams.get("kind") === "range" ? "range" : url.searchParams.get("kind") === "turn" ? "turn" : undefined,
          quality: url.searchParams.get("quality") === "incomplete" ? "incomplete" : undefined,
          page: Number(url.searchParams.get("page") || 1),
          page_size: Number(url.searchParams.get("page_size") || 30),
        });
        const sessions = new Map(repo.listSessions(true).map(s => [s.session_key, s.name]));
        json(res, 200, { ...r, records: r.records.map(x => decorate(x, sessions.get(x.session_key), repo.profileOf(x.profile))) });
        return;
      }

      if (req.method === "GET" && p === "/api/profiles") {
        json(res, 200, { ok: true, profiles: repo.profilesList(), active: repo.activeProfileId() });
        return;
      }

      if (req.method === "POST" && p === "/api/profile/active") {
        const body = await readBody(req);
        const id = String(body.id || "").trim();
        if (!id) {
          json(res, 400, { ok: false, error: "id required" });
          return;
        }
        const prof = repo.setActiveProfile(id);
        json(res, 200, { ok: true, active: prof.id, name: prof.name });
        return;
      }

      if (req.method === "GET" && p === "/api/conflicts") {
        json(res, 200, { ok: true, reports: repo.conflictReports(), files: repo.conflictFiles() });
        return;
      }

      if (req.method === "GET" && p === "/api/sessions") {
        const includeEmpty = url.searchParams.get("include_empty") === "1";
        json(res, 200, { ok: true, sessions: repo.listSessions(includeEmpty) });
        return;
      }

      if (req.method === "GET" && p.startsWith("/api/session/")) {
        const key = decodeURIComponent(p.slice("/api/session/".length));
        const sessions = repo.listSessions(true);
        const view = sessions.find(s => s.session_key === key);
        if (!view) {
          json(res, 404, { ok: false, error: "session not found" });
          return;
        }
        const records = repo
          .all()
          .filter(r => r.session_key === key)
          .sort((a, b) => a.turn_no - b.turn_no || a.created_at - b.created_at)
          .map(r => decorate(r, view.name, repo.profileOf(r.profile)));
        json(res, 200, { ok: true, session: view, records });
        return;
      }

      if (req.method === "GET" && p.startsWith("/api/record/")) {
        const id = decodeURIComponent(p.slice("/api/record/".length));
        const rec = repo.get(id);
        if (!rec) {
          json(res, 404, { ok: false, error: "record not found" });
          return;
        }
        json(res, 200, { ok: true, record: decorate(rec, undefined, repo.profileOf(rec.profile)) });
        return;
      }

      if (req.method === "GET" && p === "/api/trash") {
        json(res, 200, { ok: true, items: repo.trashList().map(t => ({ trash_id: t.trash_id, deleted_at: t.deleted_at, reason: t.reason, record: decorate(t.record, undefined, repo.profileOf(t.record.profile)) })) });
        return;
      }

      if (req.method === "GET" && p === "/api/search") {
        const q = url.searchParams.get("q") || "";
        const limit = Number(url.searchParams.get("limit") || 20);
        const session = url.searchParams.get("session") || undefined;
        const r = searchRecords(repo, q, { limit, session_key: session });
        json(res, 200, r);
        return;
      }

      if (req.method === "GET" && p === "/api/export") {
        json(res, 200, repo.exportAll());
        return;
      }

      if (req.method === "POST" && p === "/api/update") {
        const body = await readBody(req);
        const rec = repo.update({
          id: String(body.id || ""),
          fields: body.fields,
          raw_text: body.raw_text,
          tags: body.tags,
          rating: body.rating,
          expect_revision: body.expect_revision,
        });
        json(res, 200, { ok: true, record: decorate(rec, undefined, repo.profileOf(rec.profile)) });
        return;
      }

      if (req.method === "POST" && p === "/api/delete") {
        const body = await readBody(req);
        if (body.confirm !== true) {
          json(res, 400, { ok: false, error: "confirm required" });
          return;
        }
        const r = repo.softDelete(String(body.id || ""));
        json(res, 200, { ok: true, trash_id: r.trash_id });
        return;
      }

      if (req.method === "POST" && p === "/api/restore") {
        const body = await readBody(req);
        const rec = repo.restore(String(body.trash_id || ""));
        json(res, 200, { ok: true, record: decorate(rec, undefined, repo.profileOf(rec.profile)) });
        return;
      }

      if (req.method === "POST" && p === "/api/purge") {
        const body = await readBody(req);
        if (body.confirm !== true) {
          json(res, 400, { ok: false, error: "confirm required" });
          return;
        }
        const r = repo.purge(String(body.trash_id || ""));
        json(res, 200, r);
        return;
      }

      if (req.method === "POST" && p === "/api/rename") {
        const body = await readBody(req);
        const meta = repo.renameSession(String(body.session_key || ""), String(body.name || ""));
        json(res, 200, { ok: true, session: meta });
        return;
      }

      json(res, 404, { ok: false, error: "not found" });
    } catch (e: any) {
      const codeMap: Record<string, number> = { CONFLICT: 409, NOT_FOUND: 404, INVALID_ARG: 400, LOCK_TIMEOUT: 503, CORRUPT_RECORD: 500, IO_ERROR: 500 };
      const status = (e && codeMap[e.code]) || (String(e && e.message).includes("too large") ? 413 : 500);
      const safeUrl = String(req.url || "").replace(/token=[^&]*/g, "token=***");
      logWarn(`ui ${req.method} ${safeUrl} -> ${e && e.message}`);
      json(res, status, { ok: false, error: e && e.message ? e.message : String(e), code: e && e.code });
    }
  });
}

export function startUiServer(repo: RepoStore, config: Config): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createUiServer(repo, config);
    server.once("error", reject);
    server.listen(config.uiPort, config.uiHost, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : config.uiPort;
      resolve({ server, port });
    });
  });
}

export { isLoopbackHost, extractToken };

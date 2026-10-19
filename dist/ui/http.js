// http.ts — 极简 UI 服务（仅 127.0.0.1；无框架；零依赖）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { PACKAGE_ROOT } from "../config.js";
import { searchRecords } from "../features/search.js";
import { deriveTitleFromFields } from "../core/title.js";
import { logWarn } from "../log.js";
const MAX_BODY = 2 * 1024 * 1024;
function json(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
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
        req.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            if (!raw.trim())
                return resolve({});
            try {
                resolve(JSON.parse(raw));
            }
            catch {
                reject(new Error("invalid json body"));
            }
        });
        req.on("error", reject);
    });
}
function decorate(rec, sessionName) {
    return {
        id: rec.id,
        kind: rec.kind,
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
        title: deriveTitleFromFields(rec.fields, rec.raw_text),
        fields: rec.fields,
        raw_text: rec.raw_text,
    };
}
function hostAllowed(hostHeader) {
    if (!hostHeader)
        return false;
    const host = hostHeader.split(":")[0].toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "::1";
}
export function createUiServer(repo, config) {
    const htmlFile = path.join(PACKAGE_ROOT, "ui", "index.html");
    return http.createServer(async (req, res) => {
        try {
            if (!hostAllowed(req.headers.host)) {
                json(res, 403, { ok: false, error: "host not allowed" });
                return;
            }
            const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
            const p = url.pathname;
            if (req.method === "GET" && (p === "/" || p === "/index.html")) {
                let html = "";
                try {
                    html = fs.readFileSync(htmlFile, "utf8");
                }
                catch {
                    json(res, 500, { ok: false, error: "ui/index.html missing" });
                    return;
                }
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
                res.end(html);
                return;
            }
            if (req.method === "GET" && p === "/api/health") {
                json(res, 200, { ok: true, name: "northstar-memory", version: "2.0.0" });
                return;
            }
            if (req.method === "GET" && p === "/api/stats") {
                json(res, 200, repo.stats());
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
                    .map(r => decorate(r, view.name));
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
                json(res, 200, { ok: true, record: decorate(rec) });
                return;
            }
            if (req.method === "GET" && p === "/api/trash") {
                json(res, 200, { ok: true, items: repo.trashList().map(t => ({ trash_id: t.trash_id, deleted_at: t.deleted_at, reason: t.reason, record: decorate(t.record) })) });
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
                json(res, 200, { ok: true, record: decorate(rec) });
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
                json(res, 200, { ok: true, record: decorate(rec) });
                return;
            }
            if (req.method === "POST" && p === "/api/purge") {
                const body = await readBody(req);
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
        }
        catch (e) {
            const code = e && e.code === "CONFLICT" ? 409 : e && e.code === "NOT_FOUND" ? 404 : 500;
            logWarn(`ui ${req.method} ${req.url} -> ${e && e.message}`);
            json(res, code, { ok: false, error: e && e.message ? e.message : String(e), code: e && e.code });
        }
    });
}
export function startUiServer(repo, config) {
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

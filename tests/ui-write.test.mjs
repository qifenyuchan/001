// ui-write.test.mjs — UI 写接口：编辑/删除/恢复/彻底删除/改名 + 同源与内容类型闸门
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { RepoStore } from "../dist/store/repo.js";
import { loadConfig } from "../dist/config.js";
import { startUiServer } from "../dist/ui/http.js";

const F = { 时间: "今天", 地点: "无", 人物: "我", 事情: "初始内容", 原因: "无", 结果: "ok", 重点: "无" };

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-uiw-"));
  const config = loadConfig({ data: dir, uiPort: 0 });
  const repo = new RepoStore({ dataDir: dir, rangeEvery: 99, rawHead: 1200, rawTail: 600 });
  repo.open();
  const rec = repo.upsertTurn({ session_id: "uiw", turn_no: 1, fields: F });
  return { config, repo, id: rec.id };
}

async function withServer(fn) {
  const { config, repo, id } = setup();
  const { server, port } = await startUiServer(repo, config);
  try {
    await fn({ port, repo, id });
  } finally {
    await new Promise(res => server.close(res));
  }
}

/** 精确控制 header（fetch 会改写 Origin/Sec-Fetch-Site，所以用 http.request） */
function req(port, method, p, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body);
    const r = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path: p,
        headers: {
          host: `127.0.0.1:${port}`,
          ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      res => {
        let data = "";
        res.on("data", c => (data += c));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {
            /* 非 JSON */
          }
          resolve({ status: res.statusCode, body: json, raw: data, headers: res.headers });
        });
      }
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

test("编辑：改字段成功；旧 revision 返回 409", async () => {
  await withServer(async ({ port, repo, id }) => {
    const ok = await req(port, "POST", "/api/update", { body: { id, fields: { 事情: "改过了" }, expect_revision: 1 } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.record.fields["事情"], "改过了");

    const stale = await req(port, "POST", "/api/update", { body: { id, fields: { 事情: "又改" }, expect_revision: 1 } });
    assert.equal(stale.status, 409);
    assert.equal(repo.get(id).fields["事情"], "改过了");
  });
});

test("删除需 confirm；恢复后内容一致；purge 也需 confirm", async () => {
  await withServer(async ({ port, repo, id }) => {
    const noConfirm = await req(port, "POST", "/api/delete", { body: { id } });
    assert.equal(noConfirm.status, 400);
    assert.ok(repo.get(id), "没确认就不该删除");

    const del = await req(port, "POST", "/api/delete", { body: { id, confirm: true } });
    assert.equal(del.status, 200);
    assert.ok(!repo.get(id));

    const restore = await req(port, "POST", "/api/restore", { body: { trash_id: del.body.trash_id } });
    assert.equal(restore.status, 200);
    assert.equal(restore.body.record.fields["事情"], "初始内容");

    const del2 = await req(port, "POST", "/api/delete", { body: { id, confirm: true } });
    const purgeNoConfirm = await req(port, "POST", "/api/purge", { body: { trash_id: del2.body.trash_id } });
    assert.equal(purgeNoConfirm.status, 400);

    const purge = await req(port, "POST", "/api/purge", { body: { trash_id: del2.body.trash_id, confirm: true } });
    assert.equal(purge.status, 200);
    const back = await req(port, "POST", "/api/restore", { body: { trash_id: del2.body.trash_id } });
    assert.equal(back.status, 404, "purge 之后不该还能恢复");
  });
});

test("改名：会话名生效", async () => {
  await withServer(async ({ port, repo }) => {
    const r = await req(port, "POST", "/api/rename", { body: { session_key: "uiw", name: "新名字" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.session.name, "新名字");
    const sessions = await (await fetch(`http://127.0.0.1:${port}/api/sessions`)).json();
    assert.equal(sessions.sessions[0].name, "新名字");
    assert.equal(repo.listSessions()[0].name, "新名字");
  });
});

test("跨站 POST 被拒（Origin 不同源 / Sec-Fetch-Site: cross-site）", async () => {
  await withServer(async ({ port, repo, id }) => {
    const badOrigin = await req(port, "POST", "/api/delete", {
      body: { id, confirm: true },
      headers: { origin: "https://evil.example.com" },
    });
    assert.equal(badOrigin.status, 403);
    assert.ok(repo.get(id), "跨站请求不能生效");

    const badSite = await req(port, "POST", "/api/delete", {
      body: { id, confirm: true },
      headers: { "sec-fetch-site": "cross-site" },
    });
    assert.equal(badSite.status, 403);

    // 同源 Origin 放行
    const goodOrigin = await req(port, "POST", "/api/rename", {
      body: { session_key: "uiw", name: "同源改名" },
      headers: { origin: `http://127.0.0.1:${port}` },
    });
    assert.equal(goodOrigin.status, 200);
  });
});

test("非 JSON Content-Type → 415", async () => {
  await withServer(async ({ port, id }) => {
    const r = await req(port, "POST", "/api/delete", {
      body: JSON.stringify({ id, confirm: true }),
      headers: { "content-type": "text/plain" },
    });
    assert.equal(r.status, 415);
  });
});

test("未知路径 404；GET 写接口不生效", async () => {
  await withServer(async ({ port, repo, id }) => {
    assert.equal((await req(port, "GET", "/api/nope")).status, 404);
    const getDelete = await req(port, "GET", "/api/delete");
    assert.equal(getDelete.status, 404);
    assert.ok(repo.get(id), "GET 不能删东西");
  });
});

test("静态资源 no-store + nosniff：升级后不会拿到旧 app.js", async () => {
  await withServer(async ({ port }) => {
    for (const p of ["/", "/app.js", "/styles.css"]) {
      const r = await req(port, "GET", p);
      assert.equal(r.status, 200, `${p} 应可访问`);
      assert.equal(r.headers["cache-control"], "no-store", `${p} 必须禁用缓存`);
    }
    const js = await req(port, "GET", "/app.js");
    assert.equal(js.headers["x-content-type-options"], "nosniff");
    assert.match(String(js.headers["content-type"]), /javascript/);
  });
});

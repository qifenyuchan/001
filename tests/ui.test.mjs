// ui.test.mjs — UI HTTP 端点：统计/会话/编辑乐观锁/删除恢复/Host 校验
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { RepoStore } from "../dist/store/repo.js";
import { loadConfig } from "../dist/config.js";
import { startUiServer } from "../dist/ui/http.js";

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-ui-"));
  const config = loadConfig({ data: dir, uiPort: 0 });
  const repo = new RepoStore({ dataDir: dir, rangeEvery: 10, rawHead: 1200, rawTail: 600 });
  repo.open();
  const r = repo.upsertTurn({
    session_id: "ui1",
    turn_no: 1,
    fields: { 时间: "2026-10-19", 地点: "无", 人物: "用户", 事情: "UI测试", 原因: "测试", 结果: "成功", 重点: "验证" },
  });
  return { config, repo, id: r.id };
}

async function withServer(fn) {
  const { config, repo, id } = setup();
  const { server, port } = await startUiServer(repo, config);
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn({ base, repo, id, port });
  } finally {
    await new Promise(res => server.close(res));
  }
}

test("stats 与 session 端点", async () => {
  await withServer(async ({ base }) => {
    const stats = await (await fetch(base + "/api/stats")).json();
    assert.equal(stats.total, 1);
    assert.equal(stats.by_kind.turn, 1);
    const sess = await (await fetch(base + "/api/session/ui1")).json();
    assert.equal(sess.records.length, 1);
    assert.equal(sess.records[0].fields["事情"], "UI测试");
  });
});

test("编辑 + 乐观锁 409", async () => {
  await withServer(async ({ base, id }) => {
    const post = (body) => fetch(base + "/api/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const r1 = await post({ id, fields: { 事情: "UI测试改" }, expect_revision: 1 });
    assert.equal(r1.status, 200);
    const j1 = await r1.json();
    assert.equal(j1.record.revision, 2);
    const r2 = await post({ id, fields: { 事情: "冲突改" }, expect_revision: 1 });
    assert.equal(r2.status, 409);
  });
});

test("删除 → 回收站 → 恢复", async () => {
  await withServer(async ({ base, id }) => {
    const del = await (await fetch(base + "/api/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, confirm: true }) })).json();
    assert.ok(del.trash_id);
    const trash = await (await fetch(base + "/api/trash")).json();
    assert.equal(trash.items.length, 1);
    const restore = await (await fetch(base + "/api/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trash_id: del.trash_id }) })).json();
    assert.equal(restore.ok, true);
    const stats = await (await fetch(base + "/api/stats")).json();
    assert.equal(stats.total, 1);
  });
});

test("Host 头校验：非本机 Host 返回 403", async () => {
  await withServer(async ({ port }) => {
    const status = await new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, path: "/api/stats", method: "GET", headers: { Host: "evil.example.com" } }, res => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(status, 403);
  });
});

test("搜索端点返回命中", async () => {
  await withServer(async ({ base }) => {
    const r = await (await fetch(base + "/api/search?q=" + encodeURIComponent("UI测试"))).json();
    assert.ok(r.total >= 1);
  });
});

test("前端拆分：HTML 只留结构，CSS/JS 独立可缓存", async () => {
  await withServer(async ({ base }) => {
    const htmlRes = await fetch(base + "/");
    const html = await htmlRes.text();
    assert.match(html, /href="\/styles\.css"/);
    assert.match(html, /src="\/app\.js"/);
    assert.ok(!html.includes("<style"), "不应再有内联 style");
    assert.ok(!/<script>\s*[^<]/.test(html), "不应再有内联脚本");
    assert.match(html, /viewport/);

    const cssRes = await fetch(base + "/styles.css");
    assert.equal(cssRes.status, 200);
    assert.match(cssRes.headers.get("content-type") || "", /text\/css/);
    const css = await cssRes.text();
    assert.match(css, /@media \(max-width:959px\)/, "侧栏断点");
    assert.match(css, /@media \(max-width:759px\)/, "抽屉全屏断点");
    assert.match(css, /overflow-wrap:anywhere/, "长文本防溢出");
    assert.match(css, /resize-handle/, "吸附手柄样式");

    const jsRes = await fetch(base + "/app.js");
    assert.equal(jsRes.status, 200);
    assert.match(jsRes.headers.get("content-type") || "", /javascript/);
    const js = await jsRes.text();
    assert.match(js, /initPanelResize/, "面板拖拽吸附");
    assert.match(js, /PANEL_SNAPS/, "吸附档位");
  });
});

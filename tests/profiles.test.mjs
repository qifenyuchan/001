// profiles.test.mjs — 通用 vs 自定义：二选一、切换、历史只读保留
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RepoStore } from "../dist/store/repo.js";
import { recall } from "../dist/features/inject.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const custom = JSON.parse(fs.readFileSync(path.join(ROOT, "profiles", "custom.json"), "utf8"));

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-profile-"));
  const repo = new RepoStore({ dataDir: dir, rangeEvery: 10, rawHead: 1200, rawTail: 600 });
  repo.open();
  return { dir, repo };
}

test("默认 general；未安装 custom 时不能切换，也不能写入", () => {
  const { repo } = makeRepo();
  assert.equal(repo.activeProfileId(), "general");
  assert.deepEqual(repo.profilesList().map(p => p.id), ["general"]);
  assert.throws(() => repo.setActiveProfile("custom"), /profile not installed/);
  assert.throws(() => repo.upsertTurn({ session_id: "s1", profile: "custom", fields: { 事件: "x", 结果: "y" } }), /profile not installed/);
});

test("安装 custom 并切换：新写入使用 custom，旧方案写入被拒绝", () => {
  const { repo } = makeRepo();
  repo.installProfile(custom);
  repo.setActiveProfile("custom");
  assert.equal(repo.activeProfileId(), "custom");

  const saved = repo.upsertTurn({
    session_id: "c1", turn_no: 1,
    fields: { 时间: "2026-10-20", 事件: "合并两张表", 结果: "留下 4 个固定字段", 下一步: "补切换说明", 自定义1: "northstar" },
  });
  assert.equal(saved.profile, "custom");
  assert.equal(saved.quality, "complete");

  // 不能再用 general 写入（二选一）
  assert.throws(() => repo.upsertTurn({ session_id: "c1", turn_no: 2, profile: "general", fields: { 事情: "x", 结果: "y" } }), /active profile is custom/);

  const r = recall(repo, { session_id: "c1" }, 1200);
  assert.match(r.text, /自定义/);
  assert.match(r.text, /合并两张表/);
});

test("切回 general：custom 历史仍可读，新写入用 general", () => {
  const { repo } = makeRepo();
  repo.installProfile(custom);
  repo.setActiveProfile("custom");
  const old = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: { 事件: "旧方案记录", 结果: "保留", 下一步: "无" } });
  repo.setActiveProfile("general");
  const fresh = repo.upsertTurn({ session_id: "s1", turn_no: 2, fields: { 时间: "2026-10-20", 事情: "新方案记录", 结果: "ok", 重点: "无" } });

  assert.equal(repo.get(old.id).profile, "custom");
  assert.equal(repo.get(fresh.id).profile, "general");
  assert.equal(repo.all().length, 2, "历史记录不被删除或改写");

  const r = recall(repo, { session_id: "s1" }, 1200);
  assert.match(r.text, /新方案记录/);
  assert.doesNotMatch(r.text, /旧方案记录/);
});

test("自定义字段可增删：安装改过的模板后保存新字段", () => {
  const { repo } = makeRepo();
  const edited = JSON.parse(JSON.stringify(custom));
  edited.fields.push({ key: "角色", label: "角色状态", weight: 2, max_chars: 300 });
  repo.installProfile(edited);
  repo.setActiveProfile("custom");
  const saved = repo.upsertTurn({
    session_id: "s2", turn_no: 1,
    fields: { 事件: "雨夜", 结果: "发现线索", 下一步: "去找线人", 角色: "林：警觉" },
  });
  assert.equal(saved.quality, "complete");
  assert.equal(repo.get(saved.id).fields["角色"], "林：警觉");
});

test("不能移除当前方案；自定义包不能占用 general", () => {
  const { repo } = makeRepo();
  repo.installProfile(custom);
  repo.setActiveProfile("custom");
  assert.throws(() => repo.removeProfile("custom"), /cannot remove the active profile/);
  assert.throws(() => repo.installProfile({ ...custom, id: "general" }), /not be general/);
});

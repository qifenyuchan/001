// profiles.test.mjs — 三套字段方案：general 默认 / work / story 可安装
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RepoStore } from "../dist/store/repo.js";
import { recall } from "../dist/features/inject.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = JSON.parse(fs.readFileSync(path.join(ROOT, "profiles", "work.json"), "utf8"));
const story = JSON.parse(fs.readFileSync(path.join(ROOT, "profiles", "story.json"), "utf8"));

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-profile-"));
  const repo = new RepoStore({ dataDir: dir, rangeEvery: 10, rawHead: 1200, rawTail: 600 });
  repo.open();
  return { dir, repo };
}

test("默认只有 general；work/story 未安装时保存报 PROFILE_NOT_FOUND", () => {
  const { repo } = makeRepo();
  assert.deepEqual(repo.profilesList().map(p => p.id), ["general"]);
  assert.throws(() => repo.upsertTurn({ session_id: "s1", profile: "work", fields: { 目标: "x", 下一步: "y" } }), /profile not installed/);
});

test("安装 work 后：保存、注入、列表过滤、字段完整", () => {
  const { repo } = makeRepo();
  repo.installProfile(work);
  assert.deepEqual(repo.profilesList().map(p => p.id).sort(), ["general", "work"]);
  const fields = {
    时间: "2026-10-20", 项目: "northstar", 目标: "做三套表格", 进展: "profile 引擎完成",
    决策: "用可安装 JSON 包", 阻塞: "无", 文件: "src/store/profiles.ts", 下一步: "补 UI 与文档",
  };
  const saved = repo.upsertTurn({ session_id: "w1", profile: "work", turn_no: 1, fields });
  assert.equal(saved.profile, "work");
  assert.equal(saved.quality, "complete");
  const rec = repo.get(saved.id);
  assert.equal(rec.profile, "work");
  assert.equal(rec.fields["目标"], "做三套表格");
  const r = recall(repo, { session_id: "w1" }, 1200);
  assert.match(r.text, /长工作/);
  assert.match(r.text, /目标：做三套表格/);
  assert.match(r.text, /下一步：补 UI 与文档/);
  const onlyWork = repo.list({ profile: "work" });
  assert.equal(onlyWork.total, 1);
  const onlyGeneral = repo.list({ profile: "general" });
  assert.equal(onlyGeneral.total, 0);
});

test("story：必需字段缺失时 quality=partial", () => {
  const { repo } = makeRepo();
  repo.installProfile(story);
  const ok = repo.upsertTurn({
    session_id: "st1", profile: "story", turn_no: 1,
    fields: { 时间线: "第3章", 场景: "雨夜", 人物: "林", 关系: "信任 +1", 事件: "发现一封信", 伏笔: "铜钥匙", 状态: "在车站等车", 下一步: "去找线人" },
  });
  assert.equal(ok.quality, "complete");
  const partial = repo.upsertTurn({
    session_id: "st1", profile: "story", turn_no: 2,
    fields: { 事件: "遇到陌生人" },
  });
  assert.equal(partial.quality, "partial");
  const r = recall(repo, { session_id: "st1" }, 1200);
  assert.match(r.text, /长剧情/);
  assert.match(r.text, /事件：遇到陌生人/);
});

test("同一轮不允许切换 profile", () => {
  const { repo } = makeRepo();
  repo.installProfile(work);
  const saved = repo.upsertTurn({ session_id: "s1", profile: "work", turn_no: 1, fields: { 目标: "a", 下一步: "b" } });
  assert.throws(() => repo.upsertTurn({ session_id: "s1", profile: "general", turn_no: 1, fields: { 事情: "x" } }), /profile cannot change/);
  assert.ok(repo.get(saved.id));
});

test("profile 包校验：不能占用 general、字段不能重复", () => {
  const { repo } = makeRepo();
  assert.throws(() => repo.installProfile({ ...work, id: "general" }), /not be general/);
  const dup = JSON.parse(JSON.stringify(work));
  dup.fields[1].key = dup.fields[0].key;
  assert.throws(() => repo.installProfile(dup), /duplicate field key/);
});

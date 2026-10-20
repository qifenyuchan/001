// time.test.mjs — 时间有效性：相对时间解析 / 记录时间 / 时间窗加权 / 衰减可开关
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RepoStore } from "../dist/store/repo.js";
import { parseTimeWindow } from "../dist/features/time.js";
import { searchRecords } from "../dist/features/search.js";

const DAY = 86400000;
const F = (事情, extra = {}) => ({ 时间: "今天", 事情, 结果: "ok", ...extra });

function mk() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-time-"));
  const repo = new RepoStore({ dataDir: dir, rangeEvery: 99, rawHead: 1200, rawTail: 600 });
  repo.open();
  return { dir, repo };
}

// 固定基准时间：2026-10-20 12:00 本地时间（周二）
const NOW = new Date(2026, 9, 20, 12, 0, 0).getTime();

test("parseTimeWindow：常见相对时间都能定出边界", () => {
  const d = (label, from, to) => {
    const w = parseTimeWindow(label, NOW);
    assert.ok(w, `${label} 应能解析`);
    assert.equal(new Date(w.from).toDateString(), new Date(from).toDateString(), `${label} 起点`);
    assert.equal(new Date(w.to).toDateString(), new Date(to).toDateString(), `${label} 终点（不含）`);
  };
  const today = new Date(2026, 9, 20).getTime();
  d("今天做了什么", today, today + 1);
  d("昨天的会议", today - DAY, today);
  d("前天", today - 2 * DAY, today - DAY);
  d("这周的计划", new Date(2026, 9, 19).getTime(), today + 1); // 周一
  d("上周的返工", new Date(2026, 9, 12).getTime(), new Date(2026, 9, 19).getTime());
  d("上个月的报价", new Date(2026, 8, 1).getTime(), new Date(2026, 9, 1).getTime());
  d("本月进展", new Date(2026, 9, 1).getTime(), today + 1);
});

test("parseTimeWindow：N 天/周/月 与「N 天前」", () => {
  const recent = parseTimeWindow("最近三天的记录", NOW);
  assert.equal(new Date(recent.from).toDateString(), new Date(NOW - 3 * DAY).toDateString());
  const weeks = parseTimeWindow("最近两周的实验", NOW);
  assert.equal(new Date(weeks.from).toDateString(), new Date(NOW - 14 * DAY).toDateString());
  const months = parseTimeWindow("最近2个月的账", NOW);
  assert.equal(new Date(months.from).toDateString(), new Date(NOW - 60 * DAY).toDateString());

  const ago = parseTimeWindow("三天前的决定", NOW);
  // 「三天前」= 那一天（三天前的 00:00 到 两天前的 00:00）
  assert.equal(new Date(ago.from).toDateString(), new Date(NOW - 3 * DAY).toDateString());
  assert.equal(new Date(ago.to).toDateString(), new Date(NOW - 2 * DAY).toDateString());
});

test("parseTimeWindow：没有时间词就返回 null（不猜）", () => {
  for (const q of ["部署失败", "断剑是线索", "", "   "]) assert.equal(parseTimeWindow(q, NOW), null);
});

test("created_at：可指定过去的记录时间；未来时间被拒；编辑不改原时间", () => {
  const { repo } = mk();
  const old = NOW - 10 * DAY;
  const r = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: F("旧记录"), created_at: old });
  assert.equal(repo.get(r.id).created_at, old);

  assert.throws(
    () => repo.upsertTurn({ session_id: "s1", turn_no: 2, fields: F("未来"), created_at: Date.now() + 5 * DAY }),
    e => e.code === "INVALID_ARG"
  );

  repo.update({ id: r.id, fields: { 重点: "改了重点" } });
  assert.equal(repo.get(r.id).created_at, old, "编辑不应改记录时间");
});

test("时间窗加权：字面相同，落在「上周」的记录排前", () => {
  const { repo } = mk();
  const inWeek = repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: F("返工了"), created_at: NOW - 4 * DAY });
  const outWeek = repo.upsertTurn({ session_id: "s1", turn_no: 2, fields: F("返工了"), created_at: NOW - 30 * DAY });

  const r = searchRecords(repo, "上周的返工", { limit: 5, now: NOW, decayHalfLifeDays: 0 });
  assert.equal(r.results[0].id, inWeek.id, "窗口内应排前");
  assert.ok(r.results.some(x => x.id === outWeek.id), "窗口外也要保留，不能直接排除");
});

test("explain 里能看到时间窗的贡献", () => {
  const { repo } = mk();
  repo.upsertTurn({ session_id: "s1", turn_no: 1, fields: F("返工了"), created_at: NOW - 4 * DAY });
  const r = searchRecords(repo, "上周的返工", { limit: 5, now: NOW, explain: true });
  const why = r.results[0].why || [];
  assert.ok(why.some(w => w.f === "上周"), why.map(w => `${w.f}:${w.t}`).join(","));
});

test("衰减默认关闭；开启后「更近但字面略弱」的记录能反超", () => {
  const { repo } = mk();
  const strongOld = repo.upsertTurn({
    session_id: "s1",
    turn_no: 1,
    fields: F("返工 返工 返工", { 重点: "返工" }),
    created_at: NOW - 60 * DAY,
  });
  const weakNew = repo.upsertTurn({ session_id: "s1", turn_no: 2, fields: F("返工"), created_at: NOW - 1 * DAY });

  const off = searchRecords(repo, "返工", { limit: 5, now: NOW, decayHalfLifeDays: 0 });
  assert.equal(off.results[0].id, strongOld.id, "关闭衰减时按字面强度排");

  const on = searchRecords(repo, "返工", { limit: 5, now: NOW, decayHalfLifeDays: 30 });
  assert.equal(on.results[0].id, weakNew.id, "开启衰减后更近的排前");
});

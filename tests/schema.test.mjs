// schema.test.mjs — 七字段归一/质量/骨架/序列化
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeFields,
  assess,
  buildSkeleton,
  contentToFields,
  fieldsToContent,
  blankFields,
} from "../dist/store/schema.js";

test("别名归一：英文键映射到中文七字段", () => {
  const f = normalizeFields({ time: "2026-10-19", event: "修 bug", result: "通过", keypoint: "要点" });
  assert.equal(f["时间"], "2026-10-19");
  assert.equal(f["事情"], "修 bug");
  assert.equal(f["结果"], "通过");
  assert.equal(f["重点"], "要点");
});

test("未知键被忽略、空值不覆盖", () => {
  const f = normalizeFields({ foo: "bar", 时间: "", 事情: "  " });
  assert.equal(f["时间"], "");
  assert.equal(f["事情"], "");
  assert.equal(Object.keys(f).length, 7);
});

test("七字段齐全 → complete", () => {
  const f = normalizeFields({ 时间: "t", 地点: "p", 人物: "a", 事情: "事", 原因: "因", 结果: "果", 重点: "点" });
  const a = assess(f);
  assert.equal(a.quality, "complete");
  assert.equal(a.missing.length, 0);
});

test("缺原因 → partial 且 missing 精确", () => {
  const f = normalizeFields({ 时间: "t", 地点: "p", 人物: "a", 事情: "事", 结果: "果", 重点: "点" });
  const a = assess(f);
  assert.equal(a.quality, "partial");
  assert.deepEqual(a.missing, ["原因"]);
});

test("缺核心（无事情/结果）→ degraded", () => {
  const a = assess(normalizeFields({ 时间: "t", 地点: "无" }));
  assert.equal(a.quality, "degraded");
});

test("显式 qualityHint=degraded 优先（骨架轮）", () => {
  const f = buildSkeleton("用户问了一个很长的问题。AI 回答了细节。", Date.now());
  const a = assess(f, "degraded");
  assert.equal(a.quality, "degraded");
  assert.ok(a.blank.includes("地点"));
});

test("骨架：时间=今天/人物=无/事情非空", () => {
  const f = buildSkeleton("第一句。第二句。", Date.now());
  assert.match(f["时间"], /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(f["地点"], "无");
  assert.equal(f["人物"], "无");
  assert.ok(f["事情"].length > 0);
});

test("content ↔ fields 往返一致", () => {
  const f = { 时间: "t", 地点: "p", 人物: "a", 事情: "事", 原因: "因", 结果: "果", 重点: "点" };
  const content = fieldsToContent(f);
  const back = contentToFields(content);
  for (const k of Object.keys(f)) assert.equal(back[k], f[k]);
});

test("非法 content → 全空字段", () => {
  const f = contentToFields("这不是七字段，只是一段文字。");
  assert.deepEqual(f, blankFields());
});

test("字段值保留换行（多行内容）", () => {
  const f = normalizeFields({ 事情: "第一行\n第二行" });
  assert.equal(f["事情"], "第一行\n第二行");
});

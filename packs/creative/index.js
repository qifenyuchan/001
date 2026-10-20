// index.js — 文创写作包：剧情字段 + 触发式注入 + 真相层
// 机制来源：世界书（关键词命中才注入）、故事圣经（真相层与过程层分开）、角色卡（人物即触发词）

const STORY = {
  schema: 1,
  id: "story",
  name: "剧情",
  description: "长篇 / 连载 / 角色扮演用：以事件为轴，带伏笔与触发词；设定可钉为真相层。",
  title_field: "事件",
  excerpt_field: "结果",
  fields: [
    { key: "时间", label: "时间", weight: 1, max_chars: 40, hint: "故事内时间或章节" },
    { key: "地点", label: "地点", weight: 1, max_chars: 60, hint: "场景；没有可填无" },
    { key: "人物", label: "人物", weight: 2, max_chars: 120, hint: "出场角色（也会自动当作触发词）" },
    { key: "事件", label: "事件", weight: 3, required: true, max_chars: 500, hint: "这一轮发生了什么" },
    { key: "因果", label: "因果", weight: 1.5, max_chars: 300, hint: "动机 / 为什么这样发展" },
    { key: "结果", label: "结果", weight: 2.5, required: true, max_chars: 400, hint: "局面变化 / 留下的状态" },
    { key: "伏笔", label: "伏笔", weight: 2, max_chars: 300, hint: "埋下的线索，或回收了哪条" },
    { key: "设定", label: "设定", weight: 2, max_chars: 600, hint: "已确立的世界规则 / 角色设定（真相层）" },
    { key: "触发词", label: "触发词", weight: 1.5, max_chars: 200, hint: "逗号分隔：提到这些词时自动带回本条" },
  ],
};

const CANON = "canon";
const INDEX = "triggers.json";
const SPLIT = /[,，、;；\s|/]+/;
const NOBODY = new Set(["", "无", "none", "n/a"]);

function clip(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

function triggersOf(rec) {
  const out = new Set();
  const f = rec.fields || {};
  for (const raw of String(f["触发词"] || "").split(SPLIT)) {
    const t = raw.trim().toLowerCase();
    if (t.length >= 1) out.add(t);
  }
  for (const raw of String(f["人物"] || "").split(SPLIT)) {
    const t = raw.trim().toLowerCase();
    if (t.length >= 2 && !NOBODY.has(t)) out.add(t);
  }
  return [...out];
}

function readIndex(ctx) {
  try {
    const raw = ctx.storage.read(INDEX);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && v.v === 1 && v.byTrigger && typeof v.byTrigger === "object") return v;
  } catch {
    /* 损坏则重建 */
  }
  return null;
}

function buildIndex(ctx) {
  const byTrigger = {};
  for (const rec of ctx.records()) {
    if (rec.kind === "range") continue;
    for (const t of triggersOf(rec)) {
      if (!byTrigger[t]) byTrigger[t] = [];
      if (!byTrigger[t].includes(rec.id)) byTrigger[t].push(rec.id);
    }
  }
  const idx = { v: 1, built_at: Date.now(), byTrigger };
  ctx.storage.write(INDEX, JSON.stringify(idx));
  return idx;
}

function dropFromIndex(idx, id) {
  for (const t of Object.keys(idx.byTrigger)) {
    const arr = idx.byTrigger[t];
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    if (!arr.length) delete idx.byTrigger[t];
  }
}

function addToIndex(idx, rec) {
  for (const t of triggersOf(rec)) {
    if (!idx.byTrigger[t]) idx.byTrigger[t] = [];
    if (!idx.byTrigger[t].includes(rec.id)) idx.byTrigger[t].push(rec.id);
  }
}

function line(rec) {
  const f = rec.fields || {};
  const bits = [];
  if (f["设定"]) bits.push(`设定：${clip(f["设定"], 70)}`);
  if (f["事件"]) bits.push(`事件：${clip(f["事件"], 56)}`);
  if (f["结果"]) bits.push(`结果：${clip(f["结果"], 44)}`);
  if (f["伏笔"]) bits.push(`伏笔：${clip(f["伏笔"], 36)}`);
  if (!bits.length) return "";
  const canon = (rec.tags || []).includes(CANON);
  const head = canon ? "设定" : "情节";
  return `- [${head}｜第${rec.turn_no}轮] ${bits.join("｜")}`;
}

export function register(api) {
  api.registerProfile(STORY);

  api.registerTool(
    {
      name: "memory_pin",
      description:
        "Mark a record as canonical (真相层 / story bible) or unmark it. Canonical records rank higher in search and are injected first when their triggers match. Use when the user says a fact is settled and must not be contradicted.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Record id" },
          pinned: { type: "boolean", description: "true (default) to pin, false to unpin" },
        },
        required: ["id"],
      },
    },
    args => {
      const id = String(args.id || "");
      const want = args.pinned !== false;
      const rec = api.updateTags(id, want ? [CANON] : [], want ? [] : [CANON]);
      return { ok: true, id: rec.id, pinned: want, tags: rec.tags };
    },
    { default: true }
  );

  // 维护触发索引：写入时增量更新，删除时摘除
  api.hook("onSave", (rec, prev, ctx) => {
    const idx = readIndex(ctx) || buildIndex(ctx);
    if (prev && prev.id) dropFromIndex(idx, prev.id);
    if (rec && rec.id) {
      dropFromIndex(idx, rec.id);
      if (rec.kind !== "range") addToIndex(idx, rec);
    }
    ctx.storage.write(INDEX, JSON.stringify(idx));
  });

  // 触发式注入：当前输入里出现触发词才带回来（世界书机制）
  api.hook(
    "compose",
    (input, ctx) => {
      const text = String(input.input || "").toLowerCase();
      if (!text.trim()) return null;
      const idx = readIndex(ctx) || buildIndex(ctx);
      const hits = new Map();
      for (const [trigger, ids] of Object.entries(idx.byTrigger)) {
        if (!trigger || !text.includes(trigger)) continue;
        for (const id of ids) {
          const h = hits.get(id) || { id, n: 0 };
          h.n += 1;
          hits.set(id, h);
        }
      }
      if (!hits.size) return null;
      const prevId = input.prev && input.prev.id;
      const ranked = [];
      for (const { id, n } of hits.values()) {
        if (id === prevId) continue;
        const rec = api.getRecord(id);
        if (!rec) continue;
        if (rec.kind === "range") continue;
        ranked.push({ rec, n, canon: (rec.tags || []).includes(CANON) });
      }
      if (!ranked.length) return null;
      ranked.sort((a, b) => (b.canon - a.canon) || (b.n - a.n) || (b.rec.created_at - a.rec.created_at));
      const lines = ranked.map(x => line(x.rec)).filter(Boolean).slice(0, 3);
      if (!lines.length) return null;
      return { text: ["【相关设定｜触发命中】", ...lines].join("\n"), priority: 70 };
    },
    { priority: 70 }
  );

  // 真相层在检索里优先
  api.hook(
    "score",
    (rec, _q, ctx) => {
      if (!(rec.tags || []).includes(CANON)) return 0;
      return 0.8;
    },
    { priority: 40 }
  );
}

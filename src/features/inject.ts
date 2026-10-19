// inject.ts — 上一轮注入块（严格 1 条 + 预算裁剪；绝不注入全量历史）

import type { MemoryRecord, RecallQuery, RecallResult } from "../core/types.js";
import { RepoStore } from "../store/repo.js";
import { safeSlice } from "../core/text.js";
import { fmtDateTime, sanitizeKey } from "../core/util.js";
import type { Profile } from "../store/profiles.js";

const QUALITY_LABEL: Record<string, string> = {
  complete: "完整",
  partial: "部分",
  degraded: "骨架",
};

function budgetLine(label: string, value: string, budget: number): string {
  if (!value) return "";
  const prefix = `${label}：`;
  const room = Math.max(0, budget - prefix.length);
  if (room <= 2) return "";
  return prefix + safeSlice(value.replace(/\s+/g, " ").trim(), room);
}

export function formatTurnBlock(rec: MemoryRecord, profile: Profile, maxChars: number): string {
  const pname = profile.id === "general" ? "" : `｜${profile.name}`;
  const header = `【上一轮记忆｜第${rec.turn_no}轮｜${fmtDateTime(rec.created_at)}｜${QUALITY_LABEL[rec.quality] || rec.quality}${pname}】`;
  const f = rec.fields;
  const headFields = profile.fields.filter(x => x.weight <= 1.5).slice(0, 3);
  const mainFields = profile.fields.filter(x => !headFields.includes(x) && (f[x.key] || "").trim());
  const headLine = headFields
    .map(x => `${x.label}：${safeSlice((f[x.key] || "无"), 40)}`)
    .join(" ｜ ");
  const fixed = header.length + (headLine ? headLine.length + 1 : 0) + 2;
  const budget = Math.max(160, maxChars - fixed);
  const totalWeight = mainFields.reduce((sum, x) => sum + x.weight, 0) || 1;
  const lines: string[] = [];
  let cut = false;
  for (const x of mainFields) {
    const part = Math.max(40, Math.floor((budget * x.weight) / totalWeight));
    if ((f[x.key] || "").length > part) cut = true;
    const line = budgetLine(x.label, f[x.key], part);
    if (line) lines.push(line);
  }
  let text = header + (headLine ? "\n" + headLine : "") + (lines.length ? "\n" + lines.join("\n") : "");
  if (text.length > maxChars || cut) {
    const suffix = "\n（已截断，完整内容用 memory_get）";
    text = safeSlice(text, Math.max(80, maxChars - suffix.length)) + suffix;
  }
  return text;
}

export function formatRangeBlock(rec: MemoryRecord, profile: Profile, maxChars: number): string {
  const r = rec.range;
  const pname = profile.id === "general" ? "" : `｜${profile.name}`;
  const header = `【最近范围记忆｜第${r ? r.from : "?"}-${r ? r.to : "?"}轮｜${fmtDateTime(rec.created_at)}｜${rec.auto ? "自动" : "精编"}${pname}】`;
  const f = rec.fields;
  const ordered = profile.fields
    .filter(x => (f[x.key] || "").trim())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6);
  const per = Math.max(60, Math.floor((maxChars - header.length - 8) / Math.max(1, ordered.length)));
  const body = ordered.map(x => budgetLine(x.label, f[x.key], per)).filter(Boolean).join("\n");
  const text = header + (body ? "\n" + body : "");
  return text.length > maxChars ? safeSlice(text, Math.max(80, maxChars - 18)) + "\n（已截断，完整内容用 memory_get）" : text;
}

export function recall(repo: RepoStore, query: RecallQuery, maxChars: number): RecallResult {
  const rawKey = String(query.session_key || query.session_id || "").trim();
  const key = sanitizeKey(rawKey);
  if (query.scope === "range") {
    if (!rawKey) {
      return { ok: true, found: false, text: "（未指定会话，无法取范围总结）", next_turn_no: 1, gap: false, reason: "no-session" };
    }
    const ranges = repo
      .all()
      .filter(r => r.kind === "range" && r.session_key === key && (!query.before_turn_no || (r.range ? r.range.to <= query.before_turn_no : true)))
      .sort((a, b) => b.created_at - a.created_at);
    const latest = ranges[0];
    const next = repo.nextTurnNo(key);
    if (!latest) {
      return { ok: true, found: false, text: "（暂无范围总结）", next_turn_no: next, gap: false, reason: "no-range" };
    }
    return { ok: true, found: true, text: formatRangeBlock(latest, repo.profileOf(latest.profile), maxChars), record: latest, next_turn_no: next, gap: false };
  }

  const prev = repo.previousTurn(key, query.before_turn_no);
  if (!prev.record) {
    return {
      ok: true,
      found: false,
      text: "（暂无上一轮记忆——这是本会话的第一轮，正常保存即可）",
      next_turn_no: prev.next_turn_no,
      gap: false,
      reason: "no-previous",
    };
  }
  const gaps = repo.gapsFor(key);
  const gap = prev.gap || gaps.length > 0;
  const hint = gap
    ? `\n（注意：${gaps.length ? `第${gaps.slice(0, 8).join("、")}轮` : `第${prev.record.turn_no + 1}轮之后的轮次`}缺少总结，可让用户补记或用 memory_search 检索历史）`
    : "";
  // 先预留提示长度，保证最终块不超过预算（P2-1）
  let text = formatTurnBlock(prev.record, repo.profileOf(prev.record.profile), Math.max(160, maxChars - hint.length));
  text += hint;
  if (text.length > maxChars) text = safeSlice(text, maxChars);
  return { ok: true, found: true, text, record: prev.record, next_turn_no: prev.next_turn_no, gap };
}

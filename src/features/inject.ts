// inject.ts — 上一轮注入块（严格 1 条 + 预算裁剪；绝不注入全量历史）

import type { MemoryRecord, RecallQuery, RecallResult } from "../core/types.js";
import { RepoStore } from "../store/repo.js";
import { safeSlice } from "../core/text.js";
import { fmtDateTime } from "../core/util.js";

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

export function formatTurnBlock(rec: MemoryRecord, maxChars: number): string {
  const header = `【上一轮记忆｜第${rec.turn_no}轮｜${fmtDateTime(rec.created_at)}｜${QUALITY_LABEL[rec.quality] || rec.quality}】`;
  const f = rec.fields;
  const headLine = ["时间", "地点", "人物"]
    .map(k => `${k}：${safeSlice((f as any)[k] || "无", 40)}`)
    .join(" ｜ ");
  const fixed = header.length + headLine.length + 2;
  let budget = Math.max(120, maxChars - fixed);
  const alloc = { 事情: 0.42, 结果: 0.3, 重点: 0.18, 原因: 0.1 } as Record<string, number>;
  const lines: string[] = [];
  for (const key of ["事情", "结果", "重点", "原因"]) {
    const value = (f as any)[key] || "";
    if (!value) continue;
    const part = Math.floor(budget * alloc[key]);
    const line = budgetLine(key, value, part);
    if (line) lines.push(line);
  }
  const text = header + "\n" + headLine + "\n" + lines.join("\n");
  if (text.length > maxChars) {
    const suffix = "\n（已截断，完整内容用 memory_get）";
    return safeSlice(text, Math.max(80, maxChars - suffix.length)) + suffix;
  }
  return text;
}

export function formatRangeBlock(rec: MemoryRecord, maxChars: number): string {
  const r = rec.range;
  const header = `【最近范围记忆｜第${r ? r.from : "?"}-${r ? r.to : "?"}轮｜${fmtDateTime(rec.created_at)}｜${rec.auto ? "自动" : "精编"}】`;
  const f = rec.fields;
  const body = [
    `事情：${safeSlice(f["事情"] || "无", 160)}`,
    `结果：${safeSlice(f["结果"] || "无", 120)}`,
    `重点：${safeSlice(f["重点"] || "无", 100)}`,
  ].join("\n");
  const text = header + "\n" + body;
  return text.length > maxChars ? safeSlice(text, maxChars - 18) + "\n（已截断，完整内容用 memory_get）" : text;
}

export function recall(repo: RepoStore, query: RecallQuery, maxChars: number): RecallResult {
  const key = query.session_key || query.session_id || "default";
  if (query.scope === "range") {
    const ranges = repo
      .all()
      .filter(r => r.kind === "range" && (r.session_key === key || key === "default") && (!query.before_turn_no || (r.range ? r.range.to <= query.before_turn_no : true)))
      .sort((a, b) => b.created_at - a.created_at);
    const latest = ranges[0];
    const next = repo.nextTurnNo(key);
    if (!latest) {
      return { ok: true, found: false, text: "（暂无范围总结）", next_turn_no: next, gap: false, reason: "no-range" };
    }
    return { ok: true, found: true, text: formatRangeBlock(latest, maxChars), record: latest, next_turn_no: next, gap: false };
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
  let text = formatTurnBlock(prev.record, maxChars);
  const gap = prev.gap || gaps.length > 0;
  if (gap) {
    const detail = gaps.length ? `第${gaps.slice(0, 8).join("、")}轮` : `第${prev.record.turn_no + 1}轮之后的轮次`;
    text += `\n（注意：${detail}缺少总结，可让用户补记或用 memory_search 检索历史）`;
  }
  return { ok: true, found: true, text, record: prev.record, next_turn_no: prev.next_turn_no, gap };
}

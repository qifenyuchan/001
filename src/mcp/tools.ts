// tools.ts — MCP 工具面：9 个工具（save/recall/search/get/list/update/delete/restore/stats）

import type { MemoryRecord, SaveInput } from "../core/types.js";
import { NorthstarError } from "../core/types.js";
import { RepoStore } from "../store/repo.js";
import { recall, formatTurnBlock, formatRangeBlock } from "../features/inject.js";
import { buildAutoRange } from "../features/range.js";
import { searchRecords } from "../features/search.js";
import { deriveTitleFromFields } from "../core/title.js";
import { contentToFields } from "../store/schema.js";
import type { ToolDef } from "./jsonrpc.js";
import type { Config } from "../config.js";

const SEVEN_SCHEMA = {
  type: "object",
  description: "Seven-field summary. Keys may be Chinese (时间/地点/人物/事情/原因/结果/重点) or English aliases (time/place/people/event/cause/result/keypoint).",
  properties: {
    时间: { type: "string", description: "When it happened (date or datetime)" },
    地点: { type: "string", description: "Where (use 无 when not applicable)" },
    人物: { type: "string", description: "Who was involved (use 无 when not applicable)" },
    事情: { type: "string", description: "What happened — one clear statement" },
    原因: { type: "string", description: "Why it happened (use 无 when unknown)" },
    结果: { type: "string", description: "What came out of it" },
    重点: { type: "string", description: "What matters most for future turns" },
  },
  additionalProperties: true,
} as const;

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "memory_save",
    description:
      "Save the summary of one conversation turn (or a range summary). Call once at the END of every turn. Never skip a turn: if truncated, pass truncated=true plus whatever fields/raw_text you have. Re-saving the same turn_no replaces it (upsert).",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Stable conversation id (e.g. your host session id)" },
        turn_no: { type: "number", description: "Turn number; omit to auto-assign next" },
        fields: SEVEN_SCHEMA,
        content: { type: "string", description: "Optional: seven-field text (时间：… lines)" },
        raw_text: { type: "string", description: "Optional raw turn text (question + answer), head/tail windowed" },
        truncated: { type: "boolean", description: "True if the turn was cut off" },
        kind: { type: "string", enum: ["turn", "range"], description: "turn (default) or range" },
        range_from: { type: "number", description: "For kind=range: first turn number" },
        range_to: { type: "number", description: "For kind=range: last turn number" },
        covers: { type: "array", items: { type: "string" }, description: "For kind=range: covered record ids" },
        tags: { type: "array", items: { type: "string" } },
        rating: { type: "number", description: "1-5, default 3" },
      },
      required: [],
    },
  },
  {
    name: "memory_recall",
    description:
      "Get ONLY the immediately previous turn's summary for this session. Call once at the START of every user turn and put the returned text into context. This is bounded by design; use memory_search for older history.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        before_turn_no: { type: "number", description: "Optional boundary: recall the turn before this number" },
        scope: { type: "string", enum: ["turn", "range"], description: "turn (default) or latest range summary" },
        max_chars: { type: "number", description: "Budget for the injected block (default 1200)" },
      },
      required: [],
    },
  },
  {
    name: "memory_search",
    description:
      "Search older summaries on demand (Chinese bigram + field-weighted). Use when the user refers to something from many turns ago. Returns compact hits; call memory_get for full text.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        session_id: { type: "string", description: "Optional: restrict to one session" },
        limit: { type: "number", description: "Default 5" },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_get",
    description: "Read one full record by id (fields + raw_text + metadata).",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "memory_list",
    description: "List records with pagination (server-side, 20/page by default), newest first.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        kind: { type: "string", enum: ["turn", "range"] },
        page: { type: "number" },
        page_size: { type: "number" },
      },
      required: [],
    },
  },
  {
    name: "memory_update",
    description: "Edit a record's fields/raw_text/tags/rating. Pass expect_revision for optimistic locking; previous version is kept in trash.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        fields: SEVEN_SCHEMA,
        raw_text: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        rating: { type: "number" },
        expect_revision: { type: "number" },
      },
      required: ["id"],
    },
  },
  {
    name: "memory_delete",
    description: "Move a record to trash (requires confirm:true). Restorable via memory_restore.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, confirm: { type: "boolean" } }, required: ["id"] },
  },
  {
    name: "memory_restore",
    description: "Restore a record from trash by trash_id.",
    inputSchema: { type: "object", properties: { trash_id: { type: "string" } }, required: ["trash_id"] },
  },
  {
    name: "memory_stats",
    description: "Repository statistics: totals, sessions, incomplete records, gaps, data dir.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

export function createTools(repo: RepoStore, config: Config) {
  function ok(payload: unknown) {
    return { content: [{ type: "text", text: JSON.stringify(payload) }] };
  }
  function fail(e: unknown) {
    const code = e instanceof NorthstarError ? e.code : "IO_ERROR";
    const message = e instanceof Error ? e.message : String(e);
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: false, error: { code, message } }) }],
      isError: true,
    };
  }

  function save(args: Record<string, any>) {
    const kind = args.kind === "range" ? "range" : "turn";
    const hasFields = args.fields && typeof args.fields === "object" && Object.values(args.fields).some(v => String(v || "").trim());
    const hasContent = args.content && String(args.content).trim();
    const hasRaw = args.raw_text && String(args.raw_text).trim();
    if (!hasFields && !hasContent && !hasRaw) {
      throw new NorthstarError("EMPTY_INPUT", "nothing to save: provide fields, content or raw_text");
    }
    // content 非七字段且无 raw：拒绝，避免落空记录（P2-11）
    if (hasContent && !hasFields && !hasRaw) {
      const parsed = contentToFields(String(args.content));
      if (!Object.values(parsed).some(v => v.trim())) {
        throw new NorthstarError("INVALID_ARG", "content is not a seven-field block; provide fields or raw_text");
      }
    }
    const input: SaveInput = {
      session_id: String(args.session_id || "").trim() || "default",
      turn_no: args.turn_no,
      fields: args.fields,
      content: args.content,
      raw_text: args.raw_text,
      truncated: !!args.truncated,
      kind,
      range_from: args.range_from,
      range_to: args.range_to,
      covers: args.covers,
      tags: args.tags,
      rating: args.rating,
      source: "agent",
    };
    const result = kind === "range" ? repo.upsertRange(input) : repo.upsertTurn(input);
    let rangeAuto: { id: string; range: unknown } | undefined;
    if (result.range_due && kind === "turn") {
      try {
        const every = repo.rangeEveryOf(result.session_key);
        const r = buildAutoRange(repo, result.session_key, Math.max(1, result.turn_no - (every - 1)), result.turn_no);
        if (r.ok) rangeAuto = { id: r.record.id, range: r.record.range };
      } catch {
        /* 自动范围条失败不影响主保存 */
      }
    }
    return ok({
      ok: true,
      id: result.id,
      kind: result.kind,
      session_key: result.session_key,
      turn_no: result.turn_no,
      next_turn_no: result.next_turn_no,
      quality: result.quality,
      missing: result.missing,
      range_due: result.range_due,
      range_auto: rangeAuto,
      created: result.created,
    });
  }

  function recallTool(args: Record<string, any>) {
    const r = recall(
      repo,
      {
        session_id: String(args.session_id || "").trim() || "default",
        before_turn_no: args.before_turn_no,
        scope: args.scope === "range" ? "range" : "turn",
        max_chars: args.max_chars,
      },
      Math.max(200, Number(args.max_chars) || config.recallMaxChars)
    );
    return ok({
      ok: true,
      found: r.found,
      text: r.text,
      next_turn_no: r.next_turn_no,
      gap: r.gap,
      reason: r.reason,
      record_id: r.record ? r.record.id : undefined,
    });
  }

  function searchTool(args: Record<string, any>) {
    const r = searchRecords(repo, String(args.query || ""), {
      limit: args.limit,
      session_key: args.session_id ? String(args.session_id) : undefined,
    });
    return ok(r);
  }

  function getTool(args: Record<string, any>) {
    const rec = repo.get(String(args.id || ""));
    if (!rec) throw new NorthstarError("NOT_FOUND", `record not found: ${args.id}`);
    return ok({ ok: true, record: decorate(rec) });
  }

  function listTool(args: Record<string, any>) {
    const r = repo.list({
      session_key: args.session_id ? String(args.session_id) : undefined,
      kind: args.kind === "range" ? "range" : args.kind === "turn" ? "turn" : undefined,
      quality: args.quality === "incomplete" ? "incomplete" : undefined,
      page: args.page,
      page_size: args.page_size,
    });
    return ok({ ...r, records: r.records.map(rec => decorate(rec)) });
  }

  function updateTool(args: Record<string, any>) {
    const rec = repo.update({
      id: String(args.id || ""),
      fields: args.fields,
      raw_text: args.raw_text,
      tags: args.tags,
      rating: args.rating,
      expect_revision: args.expect_revision,
    });
    return ok({ ok: true, record: decorate(rec, true) });
  }

  function deleteTool(args: Record<string, any>) {
    if (args.confirm !== true) throw new NorthstarError("INVALID_ARG", "confirm must be true to delete");
    const r = repo.softDelete(String(args.id || ""));
    return ok({ ok: true, trash_id: r.trash_id });
  }

  function restoreTool(args: Record<string, any>) {
    const rec = repo.restore(String(args.trash_id || ""));
    return ok({ ok: true, record: decorate(rec) });
  }

  function statsTool() {
    return ok(repo.stats());
  }

  function decorate(rec: MemoryRecord, withFields = true) {
    return {
      id: rec.id,
      kind: rec.kind,
      session_key: rec.session_key,
      session_id: rec.session_id,
      turn_no: rec.turn_no,
      created_at: rec.created_at,
      updated_at: rec.updated_at,
      revision: rec.revision,
      quality: rec.quality,
      missing: rec.missing,
      tags: rec.tags,
      rating: rec.rating,
      range: rec.range,
      auto: rec.auto,
      truncated: rec.truncated,
      raw_truncated: rec.raw_truncated,
      title: deriveTitleFromFields(rec.fields, rec.raw_text),
      fields: withFields ? rec.fields : undefined,
      raw_text: rec.raw_text,
    };
  }

  return {
    defs: TOOL_DEFS,
    callTool(name: string, args: Record<string, any>) {
      try {
        switch (name) {
          case "memory_save":
            return save(args);
          case "memory_recall":
            return recallTool(args);
          case "memory_search":
            return searchTool(args);
          case "memory_get":
            return getTool(args);
          case "memory_list":
            return listTool(args);
          case "memory_update":
            return updateTool(args);
          case "memory_delete":
            return deleteTool(args);
          case "memory_restore":
            return restoreTool(args);
          case "memory_stats":
            return statsTool();
          default:
            throw new NorthstarError("INVALID_ARG", `unknown tool: ${name}`);
        }
      } catch (e) {
        return fail(e);
      }
    },
    formatTurnBlock,
    formatRangeBlock,
  };
}

export const INSTRUCTIONS = [
  "Northstar memory protocol.",
  "1) At the START of every user turn, call memory_recall with your stable session_id and put the returned previous-turn block into context.",
  "2) At the END of every turn, call memory_save with the seven fields. Never skip, even if the turn was truncated: pass truncated=true, the fields you have, and raw_text.",
  "3) Only the immediately previous turn is injected. Call memory_search for older history; never ask for full history injection.",
  "4) If memory_save returns range_due, an automatic range summary is created; you may call memory_save once with kind=\"range\", range_from, range_to to replace it with a better one.",
  "5) Never store API keys, passwords, tokens or other secrets.",
].join("\n");

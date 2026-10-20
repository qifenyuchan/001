// types.ts — 包机制的类型：清单、API、四个 hook
// 原则：包只加能力不改真源；不装包数据也可读；包失败不炸本体。

import type { MemoryRecord } from "../core/types.js";
import type { ToolDef } from "../mcp/jsonrpc.js";

export const CORE_API_VERSION = "1";

export type HookName = "compose" | "score" | "onSave" | "export";

export interface PackManifest {
  id: string;
  name?: string;
  version: string;
  apiVersion?: string;
  requires?: { core?: string };
  provides?: {
    profiles?: string[];
    tools?: string[];
    cli?: string[];
    hooks?: HookName[];
  };
  description?: string;
}

export interface PackStorage {
  dir: string;
  read(name: string): string | null;
  write(name: string, text: string): void;
  list(): string[];
  clear(): void;
}

export interface PackLogger {
  info(s: string): void;
  warn(s: string): void;
  error(s: string): void;
}

export interface PackContext {
  id: string;
  dataDir: string;
  packsDir: string;
  storage: PackStorage;
  /** 只读遍历全部记录（写入永远走 RepoStore） */
  records(): MemoryRecord[];
  log: PackLogger;
}

export interface ComposeInput {
  /** 上一轮记录（可能不存在） */
  prev?: MemoryRecord;
  /** 当前用户输入（若宿主提供） */
  input?: string;
  maxChars: number;
}

export interface ComposeSegment {
  text: string;
  /** 数值越大越先占用预算，默认 50 */
  priority?: number;
}

export type ComposeHook = (input: ComposeInput, ctx: PackContext) => ComposeSegment[] | void | null;

export interface ScoreQuery {
  query: string;
  terms: string[];
}

export type ScoreHook = (rec: MemoryRecord, q: ScoreQuery, ctx: PackContext) => number;

/** rec 为 null 表示删除（此时 prev 是被删的记录） */
export type SaveHook = (rec: MemoryRecord | null, prev: MemoryRecord | null, ctx: PackContext) => void;

export interface ExportResult {
  /** 导出格式名，如 obsidian / jsonl */
  name: string;
  /** 相对路径 -> 文件内容 */
  files: Record<string, string>;
}

export type ExportHook = (ctx: PackContext) => ExportResult | void | null;

export interface PackApi extends PackContext {
  /** 扩展 API 版本（用于包侧判断） */
  version: string;
  coreVersion: string;

  registerProfile(profile: unknown): void;
  registerTool(def: ToolDef, handler: (args: Record<string, any>) => unknown, opts?: { default?: boolean }): void;
  registerCli(name: string, help: string, run: (argv: string[]) => number | void | Promise<number | void>): void;
  hook(name: HookName, fn: (...args: any[]) => any, opts?: { priority?: number; timeoutMs?: number }): void;
}

export interface PackInfo {
  id: string;
  name: string;
  version: string;
  apiVersion: string;
  description: string;
  enabled: boolean;
  loaded: boolean;
  error?: string;
  dir: string;
  provides: PackManifest["provides"];
  tools: string[];
  cli: string[];
}

export interface HookEntry {
  packId: string;
  fn: (...args: any[]) => any;
  priority: number;
  timeoutMs: number;
}

export interface PackToolEntry {
  packId: string;
  def: ToolDef;
  handler: (args: Record<string, any>) => unknown;
  default: boolean;
}

export interface PackCliEntry {
  packId: string;
  name: string;
  help: string;
  run: (argv: string[]) => number | void | Promise<number | void>;
}

// config.ts — 配置解析：CLI > 环境变量 > tm.config.json > 默认值
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface CliOptions {
  data?: string;
  uiHost?: string;
  uiPort?: number;
  httpHost?: string;
  httpPort?: number;
  authToken?: string;
  toolsMode?: "lite" | "full";
  noUi?: boolean;
  noMcp?: boolean;
  uiOnly?: boolean;
  rangeEvery?: number;
  recallMaxChars?: number;
  decayHalfLifeDays?: number;
  packsDir?: string;
  noPacks?: boolean;
}

export interface Config {
  root: string;
  dataDir: string;
  uiHost: string;
  uiPort: number;
  httpHost: string;
  httpPort: number;
  authToken: string;
  toolsMode: "lite" | "full";
  noUi: boolean;
  noMcp: boolean;
  uiOnly: boolean;
  rangeEvery: number;
  recallMaxChars: number;
  decayHalfLifeDays: number;
  rawHead: number;
  rawTail: number;
  logFile: string;
  packsDir: string;
  noPacks: boolean;
}

export function loadConfig(cli: CliOptions = {}): Config {
  let fileCfg: any = {};
  try {
    fileCfg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, "tm.config.json"), "utf8"));
  } catch {
    fileCfg = {};
  }
  const dataRaw = cli.data || process.env.TM_DATA_DIR || process.env.NORTHSTAR_DATA || fileCfg.data_dir || "./data";
  const dataDir = path.isAbsolute(dataRaw) ? dataRaw : path.resolve(PACKAGE_ROOT, dataRaw);
  const uiHost = cli.uiHost || process.env.TM_UI_HOST || fileCfg.ui_host || "127.0.0.1";
  const uiPort = Number(cli.uiPort ?? process.env.TM_UI_PORT ?? fileCfg.ui_port ?? 8777);
  const httpHost = cli.httpHost || process.env.TM_HTTP_HOST || fileCfg.http_host || "127.0.0.1";
  const httpPort = Number(cli.httpPort ?? process.env.TM_HTTP_PORT ?? fileCfg.http_port ?? 0);
  const authToken = String(cli.authToken || process.env.TM_AUTH_TOKEN || fileCfg.auth_token || "").trim();
  const toolsMode = (cli.toolsMode || process.env.TM_TOOLS_MODE || fileCfg.tools_mode || "lite") === "full" ? "full" : "lite";
  const rangeEvery = Math.max(2, Number(cli.rangeEvery ?? process.env.TM_RANGE_EVERY ?? fileCfg.range_every ?? 10));
  const recallMaxChars = Math.max(200, Number(cli.recallMaxChars ?? fileCfg.recall_max_chars ?? 1200));
  // 新鲜度衰减：默认关闭（实测在合成集上拉低 MRR），需要时用配置开启
  const decayHalfLifeDays = Math.max(0, Number(cli.decayHalfLifeDays ?? process.env.TM_DECAY_HALF_LIFE_DAYS ?? fileCfg.decay_half_life_days ?? 0));
  const rawHead = Math.max(200, Number(fileCfg.raw_head ?? 1200));
  const rawTail = Math.max(0, Number(fileCfg.raw_tail ?? 600));
  const packsRaw = cli.packsDir || process.env.TM_PACKS_DIR || fileCfg.packs_dir || path.join(os.homedir(), ".northstar", "packs");
  const packsDir = path.isAbsolute(packsRaw) ? packsRaw : path.resolve(PACKAGE_ROOT, packsRaw);
  return {
    root: PACKAGE_ROOT,
    dataDir,
    uiHost,
    uiPort: isFinite(uiPort) ? uiPort : 8777,
    httpHost,
    httpPort: isFinite(httpPort) && httpPort > 0 ? httpPort : 0,
    authToken,
    toolsMode,
    noUi: !!cli.noUi,
    noMcp: !!cli.noMcp,
    uiOnly: !!cli.uiOnly,
    rangeEvery,
    recallMaxChars,
    decayHalfLifeDays,
    rawHead,
    rawTail,
    logFile: path.join(dataDir, "logs", "server.log"),
    packsDir,
    noPacks: !!cli.noPacks,
  };
}

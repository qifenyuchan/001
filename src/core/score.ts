// score.ts — BM25-lite 检索打分：字段加权 + IDF + 长度归一
// 为什么不只用命中计数：常见词（今天/问题）会与关键词同权，长记录会靠词多压过短精准记录。

import { proxBonus } from "./tokenize.js";
import { deriveTitleFromFields } from "./title.js";
import { asText } from "./text.js";
import { GENERAL_PROFILE, type Profile } from "../store/profiles.js";
import type { MemoryRecord } from "./types.js";

const K1 = 1.2; // 词频饱和
const B = 0.75; // 长度归一强度
const TITLE_W = 3; // 标题是概要，额外加权
const TAG_W = 3;
const RAW_W = 1;

export interface DocTexts {
  rec: MemoryRecord;
  profile: Profile;
  title: string;
  tags: string;
  raw: string;
  fields: Record<string, string>;
}

export interface ScoreCorpus {
  n: number;
  df: Map<string, number>;
  avg: Record<string, number>;
}

function countOcc(hay: string, needle: string): number {
  if (!hay || !needle) return 0;
  let n = 0;
  let i = hay.indexOf(needle);
  while (i >= 0) {
    n++;
    i = hay.indexOf(needle, i + needle.length);
  }
  return n;
}

/** 把一条记录展开成小写文本（一次展开，供 df 统计与打分复用） */
export function docTexts(rec: MemoryRecord, profile: Profile): DocTexts {
  const fields: Record<string, string> = {};
  for (const f of profile.fields) fields[f.key] = asText(rec.fields[f.key] || "").toLowerCase();
  return {
    rec,
    profile,
    title: deriveTitleFromFields(rec.fields, rec.raw_text, profile).toLowerCase(),
    tags: (rec.tags || []).join(" ").toLowerCase(),
    raw: asText(rec.raw_text).toLowerCase(),
    fields,
  };
}

export function buildCorpus(docs: DocTexts[], terms: string[]): ScoreCorpus {
  const df = new Map<string, number>();
  const sum: Record<string, number> = {};
  for (const d of docs) {
    // 逐段检查，避免把一条记录拼成一个大字符串（省一次分配与拷贝）
    for (const t of terms) {
      if (d.title.indexOf(t) >= 0 || d.tags.indexOf(t) >= 0 || d.raw.indexOf(t) >= 0) {
        df.set(t, (df.get(t) || 0) + 1);
        continue;
      }
      for (const f of d.profile.fields) {
        if ((d.fields[f.key] || "").indexOf(t) >= 0) {
          df.set(t, (df.get(t) || 0) + 1);
          break;
        }
      }
    }
    sum.__title = (sum.__title || 0) + d.title.length;
    sum.__tags = (sum.__tags || 0) + d.tags.length;
    sum.__raw = (sum.__raw || 0) + d.raw.length;
    for (const f of d.profile.fields) sum[f.key] = (sum[f.key] || 0) + (d.fields[f.key] || "").length;
  }
  const n = docs.length || 1;
  const avg: Record<string, number> = {};
  for (const [k, v] of Object.entries(sum)) avg[k] = Math.max(1, v / n);
  return { n: docs.length, df, avg };
}

function idf(term: string, c: ScoreCorpus): number {
  const df = c.df.get(term) || 0;
  return Math.log(1 + (c.n - df + 0.5) / (df + 0.5));
}

function termIn(term: string, text: string, avgLen: number, weight: number, c: ScoreCorpus): number {
  const tf = countOcc(text, term);
  if (!tf) return 0;
  const norm = 1 - B + B * (text.length / (avgLen || 1));
  const sat = (tf * (K1 + 1)) / (tf + K1 * norm);
  return weight * idf(term, c) * sat;
}

export function scoreDoc(d: DocTexts, terms: string[], corpus: ScoreCorpus): number {
  if (!terms.length) return 0;
  let score = 0;
  let matched = 0;
  for (const t of terms) {
    let hit = 0;
    hit += termIn(t, d.title, corpus.avg.__title || 1, TITLE_W, corpus);
    hit += termIn(t, d.tags, corpus.avg.__tags || 1, TAG_W, corpus);
    for (const f of d.profile.fields) {
      hit += termIn(t, d.fields[f.key] || "", corpus.avg[f.key] || 1, f.weight, corpus);
    }
    hit += termIn(t, d.raw, corpus.avg.__raw || 1, RAW_W, corpus);
    if (hit > 0) matched++;
    score += hit;
  }
  if (!matched) return 0;
  // 覆盖全部查询词：小幅加成，不压倒单字段高分
  if (matched === terms.length) score += 4;
  score += (d.rec.rating || 3) * 0.15;
  // 邻近加成只看摘要字段（比拼全部字段便宜，且更贴近「这句话在讲什么」）
  score += proxBonus(d.fields[d.profile.excerpt_field] || d.title, terms);
  if (d.rec.kind === "range") score *= 0.7;
  return score;
}

/** 单条打分（无语料上下文时的退化路径：IDF 近似均匀） */
export function scoreRecord(rec: MemoryRecord, terms: string[], profile: Profile = GENERAL_PROFILE): number {
  const d = docTexts(rec, profile);
  return scoreDoc(d, terms, buildCorpus([d], terms));
}

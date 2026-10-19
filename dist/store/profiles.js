// profiles.ts — 字段方案（profile）：通用内置；长工作/长剧情为可单独安装的 JSON 包
import fs from "node:fs";
import path from "node:path";
import { NorthstarError } from "../core/types.js";
import { atomicWriteJson, ensureDir, listFiles, readJson } from "./files.js";
export const GENERAL_PROFILE = {
    schema: 1,
    id: "general",
    name: "通用",
    description: "日常对话与通用任务；默认方案。",
    title_field: "事情",
    excerpt_field: "结果",
    builtin: true,
    fields: [
        { key: "时间", label: "时间", weight: 1, max_chars: 40, hint: "YYYY-MM-DD 或相对时间" },
        { key: "地点", label: "地点", weight: 1, max_chars: 120, hint: "地点 / 项目 / 环境，可写“无”" },
        { key: "人物", label: "人物", weight: 1, max_chars: 120, hint: "参与者，可写“无”" },
        { key: "事情", label: "事情", weight: 3, required: true, max_chars: 300, hint: "一句话说清发生了什么" },
        { key: "原因", label: "原因", weight: 1.5, max_chars: 300, hint: "为什么会这样" },
        { key: "结果", label: "结果", weight: 2.5, required: true, max_chars: 400, hint: "可验证的产出 / 结论" },
        { key: "重点", label: "重点", weight: 2, max_chars: 300, hint: "下一轮最该记住的" },
    ],
};
const ID_RE = /^[a-z0-9_-]{1,32}$/;
const KEY_RE = /^[\p{L}\p{N}_-]{1,24}$/u;
export function profileFieldKeys(p) {
    return p.fields.map(f => f.key);
}
export function validateProfile(raw) {
    const v = raw;
    if (!v || typeof v !== "object")
        throw new NorthstarError("INVALID_PROFILE", "profile must be an object");
    const id = String(v.id || "").trim();
    if (!ID_RE.test(id) || id === "general")
        throw new NorthstarError("INVALID_PROFILE", "profile id must match [a-z0-9_-]{1,32} and not be general");
    const name = String(v.name || "").trim().slice(0, 40);
    if (!name)
        throw new NorthstarError("INVALID_PROFILE", "profile.name is required");
    const rawFields = Array.isArray(v.fields) ? v.fields : [];
    if (rawFields.length < 1 || rawFields.length > 12)
        throw new NorthstarError("INVALID_PROFILE", "profile needs 1-12 fields");
    const seen = new Set();
    const fields = rawFields.map((f) => {
        const key = String(f && f.key ? f.key : "").trim();
        if (!KEY_RE.test(key))
            throw new NorthstarError("INVALID_PROFILE", `invalid field key: ${key}`);
        if (seen.has(key))
            throw new NorthstarError("INVALID_PROFILE", `duplicate field key: ${key}`);
        seen.add(key);
        const weight = Number(f && f.weight);
        const maxChars = Number(f && f.max_chars);
        return {
            key,
            label: String((f && f.label) || key).trim().slice(0, 30),
            weight: Number.isFinite(weight) ? Math.min(5, Math.max(0.5, weight)) : 1,
            required: !!(f && f.required),
            max_chars: Number.isFinite(maxChars) ? Math.min(2000, Math.max(20, Math.floor(maxChars))) : 400,
            hint: f && f.hint ? String(f.hint).slice(0, 120) : undefined,
        };
    });
    const keys = new Set(fields.map(f => f.key));
    const titleField = String(v.title_field || fields.find(f => f.required)?.key || fields[0].key);
    const excerptField = String(v.excerpt_field || fields.find(f => f.key !== titleField)?.key || fields[0].key);
    if (!keys.has(titleField) || !keys.has(excerptField)) {
        throw new NorthstarError("INVALID_PROFILE", "title_field/excerpt_field must be one of the fields");
    }
    return {
        schema: 1,
        id,
        name,
        description: String(v.description || "").slice(0, 200),
        title_field: titleField,
        excerpt_field: excerptField,
        fields,
    };
}
export class ProfileRegistry {
    dir;
    installed = new Map();
    constructor(dataDir) {
        this.dir = path.join(dataDir, "profiles");
        ensureDir(this.dir);
        this.refresh();
    }
    refresh() {
        this.installed.clear();
        for (const f of listFiles(this.dir)) {
            if (!f.endsWith(".json"))
                continue;
            const r = readJson(path.join(this.dir, f));
            if (!r.ok)
                continue;
            try {
                const p = validateProfile(r.value);
                this.installed.set(p.id, p);
            }
            catch {
                /* 非法 profile 忽略，不影响主流程 */
            }
        }
    }
    list() {
        return [GENERAL_PROFILE, ...[...this.installed.values()].sort((a, b) => a.name.localeCompare(b.name, "zh"))];
    }
    get(id) {
        if (!id || id === "general")
            return GENERAL_PROFILE;
        return this.installed.get(id);
    }
    require(id) {
        const p = this.get(id);
        if (!p)
            throw new NorthstarError("PROFILE_NOT_FOUND", `profile not installed: ${id}. Run: node dist/cli.js profile install ${id}`);
        return p;
    }
    install(raw) {
        const p = validateProfile(raw);
        atomicWriteJson(path.join(this.dir, `${p.id}.json`), p);
        this.installed.set(p.id, p);
        return p;
    }
    remove(id) {
        if (!ID_RE.test(id))
            throw new NorthstarError("INVALID_ARG", "invalid profile id");
        const file = path.join(this.dir, `${id}.json`);
        if (!fs.existsSync(file))
            return false;
        fs.unlinkSync(file);
        this.installed.delete(id);
        return true;
    }
    dirPath() {
        return this.dir;
    }
}

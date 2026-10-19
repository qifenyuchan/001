// title.ts — 标题/标签派生（v2：优先取 fields.事情，其次 content 解析）
import { asText, safeSlice } from "./text.js";
import { parseSevenFields } from "./parse.js";
import { GENERAL_PROFILE } from "../store/profiles.js";
export function deriveTitleFromFields(fields, fallback, profile = GENERAL_PROFILE) {
    if (fields) {
        const t = asText(fields[profile.title_field] || (profile.id === "general" ? fields["事情"] : "")).trim();
        if (t.length >= 2)
            return safeTitle(t);
    }
    const raw = asText(fallback);
    const pf7 = parseSevenFields(raw);
    if (pf7 && pf7.fields && pf7.fields["事情"] && pf7.fields["事情"].length >= 2) {
        return safeTitle(pf7.fields["事情"]);
    }
    let s = raw.replace(/\s+/g, " ").trim();
    s = s.replace(/^【总结[·•・]?(深|浅)?】\s*/i, "").trim();
    s = s.replace(/^[#\-*\s]+/, "").trim();
    let cut = s;
    const m = s.search(/[。！？；;\n]/);
    if (m > 0)
        cut = s.slice(0, m);
    cut = cut.trim();
    if (cut.length > 28)
        cut = safeSlice(cut, 27) + "…";
    return cut || "未命名条目";
}
export function safeTitle(sv) {
    let cut = sv;
    const m = sv.search(/[。！？；;]/);
    if (m > 0)
        cut = sv.slice(0, m);
    cut = cut.trim();
    if (cut.length > 28)
        cut = safeSlice(cut, 27) + "…";
    return cut || "未命名条目";
}
const TAG_RULES = [
    ["插件开发", ["插件", "toolpkg", "package", "main.js", "子包", "钩子", "registerToolPkg", "sandbox", "打包", "pack"]],
    ["版本发布", ["版本", "发版", "打包", "md5", "manifest", "release", "验收", "收口"]],
    ["数据落盘", ["落盘", "schema", "entry", "uid", "index.json", "相对", "绝对路径", "sqlite", "repo", "state.json"]],
    ["数据迁移", ["迁移", "migrate", "存量", "回填", "backfill", "清洗", "旧包", "懒加载", "eager"]],
    ["UI界面", ["ui", "界面", "显示", "视图", "标签", "卡片", "渲染", "memory_browser", "tab", "首页", "hex", "标题"]],
    ["架构决策", ["架构", "决策", "愿景", "路线", "roadmap", "阶段", "依赖", "自治", "可移植", "方案", "优先级", "roi"]],
    ["排错诊断", ["报错", "失败", "崩", "oom", "卡", "超时", "异常", "bug", "诊断", "根因", "缺陷", "真因"]],
    ["记忆系统", ["记忆", "晋升", "注入", "检索", "归纳", "提炼", "digest", "promote", "归档", "总结", "契约"]],
    ["性能优化", ["token", "缓存", "cache", "瘦身", "节流", "budget", "预算", "性能", "分页", "渲染卡顿"]],
    ["测试验证", ["测试", "回归", "用例", "passed", "failed", "node", "check", "全绿", "断言"]],
    ["工具调用", ["工具", "terminal", "code_runner", "package_proxy", "grep", "read_file", "调用", "探针"]],
    ["权限配置", ["权限", "角色卡", "env", "环境变量", "开关", "门控", "配置", "默认关"]],
    ["缓存计费", ["计费", "命中率", "前缀", "预热", "deepseek", "费用", "破缓存", "分叉点"]],
];
const TAG_STOP_BIGRAMS = {
    的是: 1, 了是: 1, 是在: 1, 我们: 1, 你们: 1, 他们: 1, 这个: 1, 那个: 1, 一个: 1,
    可以: 1, 没有: 1, 但是: 1, 因为: 1, 所以: 1, 如果: 1, 然后: 1, 接着: 1, 此外: 1,
    另外: 1, 同时: 1, 首先: 1, 其次: 1, 最后: 1, 总之: 1, 以上: 1, 如下: 1, 比如: 1,
    例如: 1, 等等: 1, 现在: 1, 时候: 1, 东西: 1, 问题: 1, 情况: 1, 方式: 1, 内容: 1,
    相关: 1, 进行: 1, 使用: 1, 通过: 1, 对于: 1, 关于: 1, 根据: 1, 由于: 1, 以及: 1,
    不是: 1, 已经: 1, 还是: 1, 就是: 1, 也是: 1, 只是: 1, 而是: 1, 或者: 1, 而且: 1,
    虽然: 1, 尽管: 1, 即使: 1, 只要: 1, 只有: 1, 所有: 1, 任何: 1, 每个: 1, 什么: 1,
    怎么: 1, 哪个: 1, 自己: 1, 大家: 1, 这些: 1, 那些: 1, 这样: 1, 那样: 1, 方面: 1,
    阶段: 1, 过程: 1, 部分: 1, 表示: 1, 说明: 1, 需要: 1, 应该: 1, 可能: 1, 目前: 1,
    工作: 1, 处理: 1, 检查: 1, 确认: 1, 注意: 1, 记得: 1, 发现: 1, 知道: 1, 觉得: 1,
    看到: 1, 听到: 1, 说到: 1, 做到: 1, 起到: 1, 导致: 1, 造成: 1, 出现: 1,
    存在: 1, 发生: 1, 变化: 1, 影响: 1, 作用: 1, 关系: 1, 特点: 1, 区别: 1, 联系: 1,
};
export function extractBigramTags(content) {
    const s = asText(content);
    const re = /[\u4e00-\u9fff]+/g;
    const freq = {};
    let m;
    while ((m = re.exec(s)) !== null) {
        const seg = m[0];
        for (let i = 0; i < seg.length - 1; i++) {
            const bg = seg.substring(i, i + 2);
            freq[bg] = (freq[bg] || 0) + 1;
        }
    }
    const cands = [];
    for (const bgk in freq) {
        if (freq[bgk] >= 2 && !TAG_STOP_BIGRAMS[bgk])
            cands.push({ t: bgk, f: freq[bgk] });
    }
    cands.sort((a, b) => b.f - a.f || a.t.localeCompare(b.t));
    return cands.slice(0, 3).map(c => c.t);
}
export function deriveTags(content) {
    const s = asText(content).toLowerCase();
    const hits = [];
    for (const [tag, keys] of TAG_RULES) {
        let score = 0;
        for (const k of keys)
            if (s.indexOf(k) !== -1)
                score++;
        if (score > 0)
            hits.push({ t: tag, s: score });
    }
    hits.sort((a, b) => b.s - a.s);
    const out = hits.slice(0, 3).map(h => h.t);
    if (out.length)
        return out;
    return extractBigramTags(asText(content));
}

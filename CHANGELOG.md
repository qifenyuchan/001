# Changelog

## 2.8.1 — 2026-10-20

- **检索排序改为 BM25-lite**：字段权重保留，加入 IDF 与长度归一（k1=1.2, b=0.75）
  - 修掉「长流水账与短精准记录并列、只能靠时间戳决定」的问题（实测：旧公式 27.45 = 27.45，新公式 13.98 > 11.43）
  - 常见词自动降权（IDF），不需要手工停用词表
- 评测：MRR@5 0.898 → **0.908**；Hit@5 保持 0.982；延迟 1000 条 p50 9.7ms / p95 20.4ms
- 省掉两处字符串拼接（df 统计逐段检查、邻近加成只看摘要字段）
- 新增 2 项排序回归测试（长度归一 / IDF），测试 91 → 93


## 2.8.0 — 2026-10-20

- 新增升级包 `creative`（文创写作）：`story` 剧情字段方案 + **触发式注入** + **真相层**
  - 触发词 / 人物命中当前输入时才带回相关记录（世界书机制），受注入预算约束
  - `memory_pin` 把记录钉为「设定」（canon），检索优先、触发命中时排前
  - 触发索引随写入增量维护，存 `data/.packs/creative/`，可删可重建
- 包 API 增加窄写入端口：`getRecord(id)`、`updateTags(id, add, remove)`（内容仍只能走 RepoStore）
- 新增检索质量基线：`npm run eval`（55 条合成用例 → Hit@5 / Recall@5 / MRR@5 / 延迟 / 注入有界性）
- CI 增加评测门禁 `--min-mrr 0.85`
- 基线数字：Hit@5 0.982 / Recall@5 0.982 / MRR@5 0.898 / p50 0.9ms / p95 3.0ms
- 测试 74 → 91（包机制 11 + 文创包 6）

## 2.7.0 — 2026-10-20

- 新增**本体 + 升级包**机制：能力以包的形式按需安装，不装包本体完整可用
- 包 API：`registerProfile` / `registerTool` / `registerCli` + 四个同步 hook（`compose` / `score` / `onSave` / `export`）
- 工具集随已装包变化：lite 只带核心 3 个 + 包内标 `default:true` 的工具
- 包隔离：加载失败 / hook 抛错 / 派生数据缺失只降级，核心照常启动；连续失败 10 次自动禁用
- CLI `pack list|install|enable|disable|remove|doctor|rebuild`；派生数据在 `data/.packs/<id>/`，可删可重建
- 首个包 `export-obsidian`：导出 Obsidian 兼容 Markdown vault（一轮一笔记 + 会话索引 + 双向链接）
- `memory_recall` 新增可选 `input` 参数：已装包可据此做触发式补充，仍受预算约束
- 修复：中文会话名被清洗成 `default-<hash>`（`sanitizeKey` 与仓库目录、记录校验三处放宽为 Unicode 字母数字）
- 测试 74 → 85（新增 11 项包机制回归）

## 2.6.0 — 2026-10-20

- 表格方案收敛为两套：`general`（内置）与 `custom`（可安装、可改）
- 合并原 work/story 为自定义模板：4 个固定字段 + 3 个可改槽位
- 新增 active profile（`data/profile.json`）：新写入只用当前方案，历史保留可读
- CLI `profile use` / `path`；UI 侧栏方案切换；旧方案记录打标签
- 非当前方案写入返回 `PROFILE_INACTIVE`；当前方案不可删除
- 自定义删字段后，旧字段在详情“其他字段”只读显示

## 2.5.0 — 2026-10-20

- 三套字段方案：`general` 内置；`work`（长工作）/ `story`（长剧情）可单独安装
- 新增 `profile` 注册表、CLI `profile install/list/remove`、`/api/profiles`
- 保存/注入/范围总结/检索/UI 详情全部按 profile 驱动
- README 降调；新增 `docs/PROFILES.md`；测试 74 项

## 2.4.0 — 2026-10-19

- 默认 **lite 模式**：只暴露 `memory_save` / `memory_recall` / `memory_search`（`--tools full` 开 9 个）
- 协议约定：正常轮不传 `raw_text`（仅截断/缺字段时传），避免整轮重复
- 性能：保存从“全量解析会话目录”改为按文件名 O(1) 定位；1500 轮不再退化
- 新增 `docs/LOAD.md`：每轮 token、延迟、规模实测与减压开关
- 发布准备：`npm files` 白名单、LICENSE（MIT）、CI、宿主接入文档

## 2.3.0 — 2026-10-19

- 响应式/吸附布局：三档断点、侧栏抽屉、详情全屏、面板拖拽吸附（340/420/520/640）
- 前端拆分为 `ui/index.html` + `styles.css` + `app.js`
- 独立审计修复：路径穿越、会话键碰撞、并发保存丢轮、编辑快照恢复、CSRF、大 turn_no OOM、残留锁、迁移覆盖等
- 测试 68 项（新增 security 套件）

## 2.2.0 — 2026-10-19

- 本地优先多设备：`device_id`、`space_id`、字段级 `field_meta`
- 删除墓碑、冲突副本自动字段合并、`data/conflicts` 报告
- 数据布局迁移到 `data/spaces/<space>/sessions/`
- 专业工具风 UI（时间线 / 详情抽屉 / 浅深主题）

## 2.1.0 — 2026-10-19

- MCP over HTTP（`POST /mcp`，Bearer 令牌）
- UI 远程绑定 + `/?token=` 引导 Cookie
- 非回环监听无令牌时拒绝启动（fail closed）

## 2.0.0 — 2026-10-19

- 从 turn_memory 0.9.33-F 重构为独立 MCP 契约式记忆服务
- 每轮七字段总结、只注入上一轮、可编辑记忆仓库
- 单一文件真源；旧库 31 条无损迁移

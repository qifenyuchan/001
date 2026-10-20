# Changelog

## 2.11.0 — 2026-10-20

深度测试（场景级）扩展：新增 4 个套件，测试 114 → 145

- `tests/cli.test.mjs`：真实进程跑 CLI 全链路（save/recall/search/list/get/
  versions/undo/export/pack 生命周期/别名/中文会话/空输入）
- `tests/http.test.mjs`：HTTP 传输层（initialize、tools/list 3 vs 9、
  tools/call、-32601、坏 JSON 400、错误路径 404、非 POST 405、通知 202）
- `tests/edge.test.mjs`：超长字段、原文窗口、emoji 会话名、Windows 保留名、
  大小写会话、turn_no 边界、turn/range 同轮、方案切换
- `tests/multi.test.mjs`：两实例共用 data 目录（刷新可见、墓碑传播、
  乐观锁冲突、交替写、同轮覆盖）

测试抓到的四个真问题：
- **单字段无上限**：5 万字字段原样落盘（148KB/条）→ 硬上限 5000 字并置 truncated
- **`turn_no: 0 / -5` 被静默自动编号** → 改为只在未传时自动，非法值报 INVALID_ARG
- **CLI 与 MCP 校验不一致**：CLI 能写空记录 → 补 EMPTY_INPUT
- **方案不匹配的错误信息死循环** → 改成「请求了 X，当前是 Y，先 switch」

新增 `npm run test:unit`（快循环，约 25s）

## 2.10.0 — 2026-10-20

- **Q8 版本回滚**：`versions <id>` 列出历史版本（编辑快照 + 删除墓碑），
  `undo <id> [--steps N]` 回退；回退本身也会被快照，所以能再回退回去
- **Q9 导出**：`export --out`（全量 JSON）+ 包 `export-obsidian`（Markdown vault）
- **Q10 损坏隔离**：由不变量测试 6 覆盖（坏记录 / 坏包都只降级）
- **新增发布冒烟 `npm run smoke`**：打包 → 装进干净目录 → 当真实用户跑 11 项
  （save / search --explain / 装两个包 / 切换方案 / 触发注入 / obsidian 导出 /
  versions+undo / stats）。CI 上在 Node 22 跑一次
- 测试 108 → 114


## 2.9.0 — 2026-10-20

- **Q3 召回理由**：`memory_search` 增 `explain`；CLI `search --explain`
  返回每条命中的构成（词项 / 字段 / 贡献分），包加成显示为「扩展」
- **Q4 不变量测试**：7 条性质落地（随机操作序列不丢、同键覆盖、注入有界、
  单一真源、删除≠遗忘、坏数据/坏包隔离、不跨会话），含种子化随机序列
- **新包 `safety`（安全合规）**：写入时标记可疑注入内容（`suspect`）、
  低信任来源降权、上一轮可疑时在注入块加提示；`safety scan` 追溯标记历史，
  `safety flag <id> --off` 撤销。**只标记，不拒绝写入**
- `memory_save` 新增可选 `source`（agent/user_input/tool_output/web_content/file），
  让安全包能按来源衡量信任；非法值回落到 agent
- 性能实测：1000 条检索 p50 9.7ms / p95 20.4ms，索引估算 0.6MB——
  **Q5 倒排索引推迟**（理由与触发条件见 QUALITY.md §4.3）
- 测试 93 → 108


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

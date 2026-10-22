# Changelog

## 2.15.0 — 2026-10-22

三轮测试：攻击 36 条（`npm run attack`）＋ 压力 14 组（`npm run stress`）＋
模拟 10 场景（`npm run sim`）。分别回答「边界被不被突破」「规模扛不扛得住」「照文档用记不记得住」。

**攻击测试轮**——把「包目录」这条信任边界补实

**严重**

- `pack remove ../x` 会递归删掉包目录之外的任意目录（`remove` 直接 `path.join(packsDir, id)`
  后 `rmrf`）：所有接受包 id 的入口统一走 `assertPackId()` 白名单，非法 id 直接拒绝
- `pack enable ../x` 会 `import` 包目录之外的 JS 并执行：同上；`readManifest` 校验了 `id`
  却漏了目录名

**高**

- `pack.json` 的 `main` 可写 `../../escape.js` 逃出包目录：`insideOrNull()` 校验入口文件
  必须落在包目录内，`install` 的源目录同样校验

**中**

- 单条超长查询能把整个进程钉住（词项 × 记录 × 字段全量 `indexOf` 跑在主线程）：
  `MAX_QUERY_CHARS=4096`、`MAX_TERMS=128`；实测 4 万字查询 792ms → 26ms
- 分词去重表由对象换成 `Set`：`constructor` / `__proto__` 这类英文词原来会被当成
  「已存在」静默丢弃
- UI 页面补 `X-Frame-Options: DENY` + `frame-ancestors 'none'` CSP + `Referrer-Policy`

**低**

- Host 回环闸门被 `127.0.0.1:1@evil.com` 绕过（切字符串取主机名）：改用 URL 解析
- 畸形百分号编码把客户端错误变 500：路径段 → 400，cookie 解码失败 → 退化成原值（401）
- 令牌引导接口可被 `//evil.com/?token=…` 做开放重定向：目标路径强制单斜杠
- `turn_no=1.5`/`true` 被静默取整成第 1 轮：入口要求整数，否则 `INVALID_ARG`

**工程**

- 新增攻击台 `attack/run.mjs`（`npm run attack`，36 条用例，输出 `attack/report.json`）
- 新增回归 `tests/attack.test.mjs`（11 条断言）；测试 190 → **201**
- 报告：`docs/ATTACK-REPORT.md`（含载荷、复现、修复、两条不修的取舍）
- 评测无回归：Hit@5 0.965 / Recall@5 0.951 / MRR@5 0.928

**压力测试轮**（14 组用例，`npm run stress`，报告 `docs/STRESS-REPORT.md`）

- 读路径原本是 O(会话数)：每次读写都给每个会话 `stat` 一次 `.rev`。
  200 个会话时 `get` 18.37ms、`save` 83.25ms。改为**空间级 `.rev` 快路径**（1 次 stat）
  + 逐会话深检限流 1s 后：`get` **0.50ms（36×）**、`save` **35.82ms（2.3×）**
- 连带 bug：目录名不合规时 `loadSession` 不登记状态，导致「目录数 === 会话数」永不成立，
  **一个脏目录就让每次操作整库重扫**。已登记为空占位会话
- 语义说明：经本进程/另一 RepoStore 写入**立刻可见**；外部工具直接落盘的文件最迟 1s 内可见
  （原来靠 `.rev` mtime 判断，同样看不见「不动 `.rev` 的外部改动」，非新增盲区）
- 实测确认的墙（不修，写进报告）：检索 3000 条 p50 34.6ms/p95 57.7ms，单次阻塞进程 123ms，
  8 并发 p50 401ms；冷启动 1ms/条（CLI 每次 4s）；写吞吐受 fsync 限制 ≈30 条/s
- 无泄漏：20s 混合负载 5292 次操作 0 错误，GC 后 heap 下降
- 新增 `tests/stress.test.mjs`（4 条回归）；测试 201 → **205**

**模拟测试轮**（10 个场景 / 179 条断言，真进程 + 真协议，报告 `docs/SIM-REPORT.md`）

- **锁超时被降级成 `IO_ERROR`**：`withLock` 抛的是普通 `Error`，工具层只认 `NorthstarError`。
  于是 Agent 把「别人正在写，稍后重试」当成「磁盘坏了」。改抛 `NorthstarError("LOCK_TIMEOUT")`
- **跨进程切字段方案不生效**：`active` 在构造时缓存，终端里 `profile use story` 对已跑起来的服务无效，
  而报错还在提示「请先 profile use story」——按提示做完仍然失败。切换时推进空间 rev，
  重扫时重读 `profile.json` 并 `profiles.refresh()`（否则新装的方案 id 认不出来）
- **写入被截断但返回体不说**：`SaveResult` 补 `truncated`，三个 upsert 回填、MCP 返回体带出，
  Agent 才知道自己塞 20KB 进去被剪成 5000
- 验证到位的（不改）：kill -9 重启后轮次连续不重不丢、两进程共写无重号无半条、
  坏文件跳过并计数、冲突副本按字段合并、触发式注入命中才带回
- 记录一个已知弱项：单字主题在长口语查询里整块丢失（只切 bigram），10 次回溯命中 9 次；
  修它要动分词 + 重跑评测，属排序专项
- 新增 `sim/run.mjs` + `tests/sim.test.mjs`（4 条回归）；测试 205 → **209**

## 2.14.0 — 2026-10-21

巩固（调研里「空白且算法在圈外」的那一项）

- 新记录种类 `kind="consolidation"`：把一批轮次的结论收进一条，
  按主题检索；`range` 是「这段时间做了什么」，`consolidation` 是「这件事的结论是什么」
- 主题 `theme` 参与打分（权重 4），记录本身 ×1.2——收敛后的结论优先于过程记录
- **原轮次一条都不删**：巩固≠覆盖，删掉巩固记录后轮次重新变为「未覆盖」
- 文本必须由调用方给出（Agent/用户），核心不生成内容——零外部模型的铁律没破
- `repo.uncoveredTurns()` + CLI `consolidate`（不带参数列候选，带参数写入）；
  MCP 走 `memory_save` 的 `kind=consolidation`（不新增工具，省 token）
- 导出包同步支持：`巩固-0001-0005-主题.md` 单独成文件，索引里独立一节并标出覆盖轮次
- 评测：Hit@5 0.930 → **0.965**、Recall@5 0.917 → **0.951**、MRR@5 0.898 → **0.933**
  （`npm run eval --no-cons` 可复现对照）
- 工程：`test:one`（直跑单文件 3s，实测 npm 层要多花 9s）、`test:watch`
- 测试 181 → **190**（consolidate 套件 9 项，含 MCP 路径）

## 2.13.0 — 2026-10-20

时间有效性（调研里「空白且算法在圈外」的那一项）

- `src/features/time.ts`：把「今天/昨天/前天/本周/上周/本月/上个月/最近 N 天|周|月/N 天前」
  解析成时间窗；解析不出来就返回 null（**不猜**）
- 检索时窗口内记录加权、窗口外保留：**时间是过滤信号，不是排序信号**
- `SaveInput.created_at`：可指定记录时间（只允许过去），导入/迁移/评测都用得上
- 新鲜度衰减（`decay_half_life_days`）实现但**默认关闭**：实测 60/120/180/365 天
  四种半衰期都拉低整体 MRR，因为它惩罚「老但正确」的答案
- 评测：时间类 MRR@5 0.500 → **1.000**；整体 Recall@5 0.932 → 0.950、MRR@5 0.918 → 0.930
- 语料加入 `age_days`，时间类用例改为可验证「窗口」与「衰减」的三种设计
- 测试 174 → **181**（新增 time 套件 7 项）

## 2.12.0 — 2026-10-20

评测升级 + 两处由数据驱动的排序修正

**评测集 v2**（`eval/seed.json`）：6 段会话 / 58 条记录 / 83 条查询，
查询按类别标注（关键词直给 / 口语同义 / 长记录 / 跨会话 / 时间指代）。
`run.mjs` 输出分类别 Hit@5、Recall@5、MRR@5，支持 `--cat`、`--min-hit`、`--min-mrr`。

**修掉一个重复计分**：标题由 `事情` 派生，却在打分时又按权重 3 单独算了一遍，
同一个字段被算两次。去掉后：关键词 MRR 0.901 → 0.969，口语类 0.386 → 0.457。

**字段权重**：`人物` 1 → 2.5（人名是强标识）。Hit@5 0.952 → 0.964。

**当前基线**：Hit@5 0.964 / Recall@5 0.932 / MRR@5 0.918
- 关键词 1.000、长记录 1.000、跨会话 1.000、时间指代 1.000（Recall 0.5）、口语 0.571
- 口语类是真实短板：3 条未命中的期望记录里**一个查询词都没有**，
  硬修只会过拟合，这是语义检索该上场的唯一场景

CI 门禁改为 `--min-hit 0.92 --min-mrr 0.86`

## 2.11.2 — 2026-10-20

第三批场景测试（159 → 174），又抓到一个真 bug

- `tests/lock.test.mjs`（7）：锁被占用超时 LOCK_TIMEOUT、死进程残留锁自动清理、
  超龄锁（>30s）清理、无 owner 时按 mtime 判断、正常写入不留锁、
  **拿不到锁不写半条记录**、UI 映射 503
- `tests/pack-edge.test.mjs`（7）：核心同名工具被挡、跨包重名、
  hook（score/compose/onSave）抛错只降级、apiVersion 不兼容、
  入口缺失、state.json 损坏、异步工具不崩
- `ui-write` 增一条：静态资源 `no-store` + `nosniff`（防止升级后拿到旧 app.js）

修复：
- **包可以注册与核心同名的工具**（如 memory_save），工具面会重复或静默覆盖
  → 传入核心保留名，冲突直接跳过并告警
- **两个包可注册同名工具** → 工具名全局唯一，先加载者生效（加载顺序按 id 排序，确定）
- 新增 `RepoStore` 选项 `lockTimeoutMs`（默认 3000），锁超时行为可测、可调

测试 174；发布冒烟 11 项通过；MRR@5 0.908 不变。

## 2.11.1 — 2026-10-20

补第二批场景测试（145 → 159），并修一个「静默答错」的隐患

- `tests/ui-write.test.mjs`（6）：UI 写接口全路径——编辑/乐观锁 409、
  删除 confirm、恢复、purge、改名、跨站 Origin 403、Content-Type 415、
  GET 不能触发写
- `tests/migrate-edge.test.mjs`（6）：dry-run 不写盘、apply + report、
  源缺失明确失败、坏条目不影响其余、--no-backup、源文件零改动
- **修：creative 触发索引过期不自我纠正**——外部写入（别的设备 / 直接改
  文件）不经过 onSave 时，索引会停留在旧状态并**静默漏答案**。
  现在索引记录条数 `n`，查询时对不上就整表重建；重复 onSave 去重、
  删除自动摘除（各加一条回归）
- 测试 145 → 159


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

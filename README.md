# 北极星记忆 · Northstar Memory

给任何支持 MCP 的 AI Agent 装"长期记忆"的独立服务。**不绑定宿主、零运行时依赖、下载即用。**

> 只有三件事：
> 1. **每轮对话总结**（Agent 填表）；
> 2. **上一轮总结注入下一轮**（严格只注入紧邻上一轮的一条，绝不注入全量历史）；
> 3. **可编辑记忆仓库**（浏览器查看 / 逐字段修改 / 删除恢复）。

---

## 为什么是这个形状

主流记忆插件靠"范围压缩"：上下文压缩一次，再压缩一次，几轮之后记忆就漂了。
本项目的做法相反：**每轮总结一次成型、不再被二次压缩**，作为地面真值存档；
下一轮只注入上一轮那一条（相邻上下文本来就在 AI 记忆范围内，真正的价值是几十轮后被截断时，
AI 仍能从这条滚动锚点接上）。完整历史不注入，用 `memory_search` 按需检索。

2026 年 LongMemEval 榜首的 Mastra Observational Memory（94.87%）验证了同一条路线：
**压缩循环优于重检索**；而 PrecisionMemBench 测出主流检索方案主动检索精度只有 0.05–0.09、
会话漂移污染严重——这也解释了为什么本项目坚持"有界注入 + 人可编辑"。

## 三条需求如何被满足

| 需求 | 机制 |
|---|---|
| 每轮总结 | Agent 轮末调用 `memory_save`，提交七字段表（时间/地点/人物/事情/原因/结果/重点）；服务校验并落库，缺字段也保存（标记 `partial`），只给原文也保存（`degraded` 骨架）——**截断轮永不丢** |
| 上轮注入下轮 | Agent 轮首调用 `memory_recall`，只返回紧邻上一轮一条、≤1200 字符、不含原文；`initialize.instructions` 与 `docs/AGENTS.md` 强制约定 |
| 可编辑仓库 | `http://127.0.0.1:8777`：会话时间线、七字段逐字段编辑（带乐观锁）、缺口占位、回收站恢复、服务端分页 |

## 快速开始（任何 Agent）

1. 安装 Node ≥ 18.17（MCP 走 stdio，不需要数据库、不需要模型 key、不需要联网）。
2. 拿到本目录（已含构建产物 `dist/`，无需 `npm install` 即可运行）。
3. 在宿主的 MCP 配置里加一条：

```json
{
  "mcpServers": {
    "northstar-memory": {
      "command": "node",
      "args": [
        "D:/北极星_turn_memory/dist/server.js",
        "--data", "D:/北极星_turn_memory/data"
      ]
    }
  }
}
```

4. 把 `docs/AGENTS.md`（或压缩版 `docs/SKILL.md`）交给 Agent 作为行为约定。
   服务启动时会自动尝试打开记忆仓库 UI：<http://127.0.0.1:8777>（端口占用则只记日志，不影响 MCP）。

> Claude Desktop / Cursor / ZCode / WorkBuddy / 自研 Agent 同理：任何支持 MCP stdio 的宿主都能接。

## 工具面（9 个）

| 工具 | 作用 |
|---|---|
| `memory_save` | 轮末保存一轮（或范围总结）。天然键 `(session_id, turn_no)`，重复保存=覆盖，不重复 |
| `memory_recall` | 轮首取**恰好一条**上一轮总结（或最近范围总结） |
| `memory_search` | 按需检索历史（中文 bigram + 字段加权） |
| `memory_get` / `memory_list` | 读单条 / 分页列表 |
| `memory_update` | 编辑字段（`expect_revision` 乐观锁；旧版自动进回收站） |
| `memory_delete` / `memory_restore` | 删除进回收站 / 恢复 |
| `memory_stats` | 总数、会话、不完整、缺口、数据目录 |

## UI

![记忆流（浅色）](docs/screenshots/feed-light.png)
![详情面板（七字段编辑）](docs/screenshots/detail-light.png)

移动端（侧栏抽屉 + 全屏详情）：

![移动端记忆流](docs/screenshots/mobile-feed.png)
![移动端详情](docs/screenshots/mobile-detail.png)

- 左侧导航（记忆流 / 会话 / 冲突 / 回收站）+ 会话列表；中间时间线；右侧详情抽屉
- **自适应布局**：≥1280 三栏；960–1279 收窄；<960 侧栏变抽屉；<760 详情全屏；任意宽度文本自动换行/省略，不横向溢出
- **面板吸附**：拖动详情左边缘在 340/420/520/640 四档吸附，双击复位；宽度记忆在本地
- 七字段**逐字段**编辑，缺失字段琥珀色提示；乐观锁（多设备同时改会提示冲突）
- 范围总结用紫色标线与"范围总结"标签区分，不与单轮混淆
- 删除进回收站（墓碑，可恢复）；编辑保留旧版快照（可回滚）
- 服务端分页（加载更多追加）、全局搜索（`/` 聚焦）、浅色/深色主题、零外部资源
- 前端拆分为 `index.html`（结构）+ `styles.css`（样式）+ `app.js`（逻辑）

## CLI（可选，调试与补录）

```bash
node dist/cli.js save   --session s1 --fields '{"时间":"2026-10-19","事情":"...","结果":"...","重点":"..."}' [--raw "..."] [--truncated]
node dist/cli.js recall --session s1 [--before 12] [--scope range]
node dist/cli.js search "记忆 注入" [--session s1] [--limit 5]
node dist/cli.js list   [--session s1] [--page 2]
node dist/cli.js get <id>
node dist/cli.js sessions [--all]
node dist/cli.js stats
node dist/cli.js range  --session s1 --from 1 --to 10
node dist/cli.js export [--out backup.json]
```

全局参数：`--data <dir>`、`--range-every <n>`。

## 跨设备 / 跨网络（本地优先）

**不共用一台设备，也不托管用户数据。** 每台设备都有完整副本，同步走你自己的存储：

- 把 `data/` 放进 OneDrive / iCloud / Syncthing / 坚果云的同步目录，或提交到 git 仓库
- 每台设备跑本地实例（stdio MCP），记录自带 `device_id` 与字段级时间戳
- 同一轮在两台设备被改：同步工具产生冲突副本 → 下次启动自动**逐字段合并**，冲突记入 `data/conflicts/`
- 删除写**墓碑**（`data/tombstones/`），随同步传播，不会"删了又回来"；删除后又被编辑则按时间判定是否复活
- 多人：每人一个 `space`（`data/spaces/<space>/`），互不共用设备；团队共享 = 共享同一同步目录

```bash
# 设备 A 与设备 B 各自跑本地实例，data 放在同一同步目录
node dist/server.js --data "D:/OneDrive/northstar/data"
node dist/cli.js sync doctor   # 查看设备 id / 墓碑 / 冲突合并情况
```

可选：需要让远程/无头设备直接连某台常开机器时，才启用 MCP over HTTP（带令牌）：

```bash
node dist/server.js --data ./data --http-host 0.0.0.0 --http-port 8788 --token <令牌>
```

跨公网优先 Tailscale / Cloudflare Tunnel / SSH 隧道；裸端口必须 HTTPS 反代。
完整说明见 **[docs/REMOTE.md](docs/REMOTE.md)**。

## 配置

`tm.config.json`（项目根，可被 CLI 参数/环境变量覆盖）：

| 键 | 默认 | 说明 |
|---|---|---|
| `data_dir` | `./data` | 数据目录（相对项目根） |
| `ui_host` / `ui_port` | `127.0.0.1` / `8777` | 记忆仓库；非回环需令牌 |
| `http_host` / `http_port` | `127.0.0.1` / `0` | MCP over HTTP（`/mcp`）；0=关闭 |
| `auth_token` | 空 | 远程访问令牌，或环境变量 `TM_AUTH_TOKEN` |
| `range_every` | `10` | 每 N 轮自动生成范围总结 |
| `recall_max_chars` | `1200` | 注入块预算 |
| `raw_head` / `raw_tail` | `1200` / `600` | 原文头尾窗口 |

环境变量：`TM_DATA_DIR`、`TM_UI_PORT`、`TM_UI_HOST`、`TM_HTTP_PORT`、`TM_HTTP_HOST`、`TM_AUTH_TOKEN`、`TM_RANGE_EVERY`、`TM_DEVICE_ID`。

## 数据布局（单一真源，无镜像、无 SQLite）

```
data/
  spaces/<space_id>/space.json      空间元数据（members 预留给团队）
  spaces/<space_id>/sessions/<key>/
    _meta.json                      会话名 / range_every
    turn-0001.json                  一轮一条（七字段 + 原文 + 字段级同步元数据）
    range-0001-0010.json            每 N 轮范围总结
    .rev                            跨进程刷新标记
  tombstones/<record_id>.json       删除墓碑（含完整记录，可恢复；随同步传播）
  conflicts/                        冲突副本归档与合并报告
  .trash/                           编辑快照（可回滚）
  .locks/                           短写锁
  logs/server.log                   运行日志（5MB 轮转）
```

一条记录一个 JSON 文件：可读、可 git、可手工修、可直接备份。
`content`（七字段文本）与 `title` 都是读时派生，不落盘，杜绝两处不一致。
每条记录带 `space_id / updated_by / field_meta`，多设备合并时按字段时间戳与设备 id 决胜。

## 从旧版（0.9.x）迁移

```bash
node dist/migrate.js --dry-run --from "<旧>/pc_host/data" --data ./data
node dist/migrate.js --apply   --from "<旧>/pc_host/data" --data ./data --report ./migration/report.json
```

- 只读旧目录（迁移前后旧数据哈希不变）；自动备份旧数据到 `migration/backup_pc_host_data_<ts>/`
- `event → turn`、`topic → range`（`basedOn` 解析 covers，悬空引用进报告）
- 幂等且不覆盖：重复执行只补缺失文件，已存在记录/会话名（含人工修改）一律跳过
- 实测：31/31 条（27 turn + 4 range）、35 个会话名、4 条"缺原因"如实标记

## 备份 / 回滚

- 备份：整目录拷贝 `data/` 即可（纯文件，无数据库）
- 回滚：`mv data data.failed_<ts>` 后重新迁移（幂等）
- 导入导出：`node dist/cli.js export --out backup.json`

## 测试

```bash
npm test        # 11 套件 68 断言：schema/store/recall/range/search/mcp/ui/sync/migrate/auth/security
npm run build   # TypeScript 构建（仅开发需要；dist/ 已随包提供）
```

## 明确不做（范围护栏）

不接外部模型/向量检索；不做 SQLite/镜像/双写；不移植插件与宿主钩子；
不做结晶/lint/裁决台；不做多用户/鉴权/云同步；不做自动抓取对话。
**没有钩子就无法 100% 强制 Agent 保存**——这是"下载即用"的代价，用约定文档 + 缺口提示 + UI 补记兜底。

## License

MIT

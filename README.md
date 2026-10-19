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

- 会话列表 → 轮次时间线（范围总结卡插在区间末尾，缺失轮次显示缺口卡）
- 详情页：七字段**逐字段**编辑，缺失字段琥珀色提示，一键"填无"；原文折叠编辑
- 删除两步确认进回收站；恢复/彻底删除（输入 PURGE）
- 20 条/页服务端分页；检索页；深色主题；零外部资源

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

## 跨设备 / 跨网络

默认只在本机可用（MCP stdio + 127.0.0.1）。跨设备有两种正确做法：

- **Hub 模式（推荐）**：一台常开主机跑服务，其他设备通过 `http://<hub>:8788/mcp`（Bearer 令牌）接入，
  UI 用 `http://<hub>:8777/?token=...` 打开。跨公网建议 Tailscale / Cloudflare Tunnel / SSH 隧道。
- **文件同步模式**：`data/` 是纯文件（一条记录一个 JSON、无索引），可放 Syncthing / OneDrive / git；
  不同轮次天然不冲突；删除不会收敛（无墓碑），强一致编辑请用 Hub。

完整步骤、安全清单与反代示例见 **[docs/REMOTE.md](docs/REMOTE.md)**。

```bash
# Hub 启动（无令牌绑定非回环地址会被拒绝）
node dist/server.js --data ./data \
  --ui-host 0.0.0.0 --ui-port 8777 \
  --http-host 0.0.0.0 --http-port 8788 \
  --token <32位以上随机令牌>
```

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

环境变量：`TM_DATA_DIR`、`TM_UI_PORT`、`TM_UI_HOST`、`TM_HTTP_PORT`、`TM_HTTP_HOST`、`TM_AUTH_TOKEN`、`TM_RANGE_EVERY`。

## 数据布局（单一真源，无镜像、无 SQLite）

```
data/
  sessions/<session_key>/
    _meta.json              会话名 / range_every
    turn-0001.json          一轮一条（七字段 + 原文 + 元数据）
    range-0001-0010.json    每 N 轮范围总结
    .rev                    跨进程刷新标记
  .trash/                   删除与编辑快照（可恢复）
  .locks/                   短写锁
  logs/server.log           运行日志（5MB 轮转）
```

一条记录一个 JSON 文件：可读、可 git、可手工修、可直接备份。
`content`（七字段文本）与 `title` 都是读时派生，不落盘，杜绝两处不一致。

## 从旧版（0.9.x）迁移

```bash
node dist/migrate.js --dry-run --from "<旧>/pc_host/data" --data ./data
node dist/migrate.js --apply   --from "<旧>/pc_host/data" --data ./data --report ./migration/report.json
```

- 只读旧目录（迁移前后旧数据哈希不变）；自动备份旧数据到 `migration/backup_pc_host_data_<ts>/`
- `event → turn`、`topic → range`（`basedOn` 解析 covers，悬空引用进报告）
- 幂等：重复执行条数不变；逐条 sha256 对账
- 实测：31/31 条（27 turn + 4 range）、35 个会话名、4 条"缺原因"如实标记

## 备份 / 回滚

- 备份：整目录拷贝 `data/` 即可（纯文件，无数据库）
- 回滚：`mv data data.failed_<ts>` 后重新迁移（幂等）
- 导入导出：`node dist/cli.js export --out backup.json`

## 测试

```bash
npm test        # 8 套件 48 断言：schema/store/recall/range/search/mcp/ui/migrate
npm run build   # TypeScript 构建（仅开发需要；dist/ 已随包提供）
```

## 明确不做（范围护栏）

不接外部模型/向量检索；不做 SQLite/镜像/双写；不移植插件与宿主钩子；
不做结晶/lint/裁决台；不做多用户/鉴权/云同步；不做自动抓取对话。
**没有钩子就无法 100% 强制 Agent 保存**——这是"下载即用"的代价，用约定文档 + 缺口提示 + UI 补记兜底。

## License

MIT

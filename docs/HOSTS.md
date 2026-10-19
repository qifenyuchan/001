# 宿主接入示例

两种接入方式，任选：

- **stdio（默认，推荐）**：宿主自己拉起本地进程，零网络、零令牌
- **HTTP（可选）**：连一台已经在跑服务的机器，需要令牌

> 默认 lite 模式只暴露 3 个工具（save / recall / search）。需要编辑/删除/统计工具时加 `--tools full`。

把 `<ABS>/dist/server.js` 换成你的绝对路径（Windows 用正斜杠），数据目录建议独立：

```
<ABS>/data
```

---

## Claude Desktop

配置文件：
- Windows：`%APPDATA%\Claude\claude_desktop_config.json`
- macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "northstar-memory": {
      "command": "node",
      "args": ["<ABS>/dist/server.js", "--data", "<ABS>/data"]
    }
  }
}
```

重启 Claude Desktop。首次会请求工具权限，允许 `memory_save` / `memory_recall` / `memory_search`。

## Cursor

项目级 `.cursor/mcp.json` 或全局 `~/.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "northstar-memory": {
      "command": "node",
      "args": ["<ABS>/dist/server.js", "--data", "<ABS>/data"]
    }
  }
}
```

## WorkBuddy

`~/.workbuddy/mcp.json`（不存在就新建）：

```json
{
  "mcpServers": {
    "northstar-memory": {
      "command": "node",
      "args": ["<ABS>/dist/server.js", "--data", "<ABS>/data"]
    }
  }
}
```

写入后在 **连接器管理页 → 自定义连接器** 里对 `northstar-memory` 点“信任/Trust”。

## ZCode

工作区 `.zcode/config.json`（沿用 `mcp.servers` 结构）：

```json
{
  "mcp": {
    "servers": {
      "northstar-memory": {
        "command": "node",
        "args": ["<ABS>/dist/server.js", "--data", "<ABS>/data"]
      }
    }
  }
}
```

## 任意 MCP 宿主（通用）

stdio：

```json
{
  "command": "node",
  "args": ["<ABS>/dist/server.js", "--data", "<ABS>/data", "--tools", "full"]
}
```

HTTP（服务端先启动）：

```bash
node dist/server.js --data ./data --http-host 0.0.0.0 --http-port 8788 --token <令牌>
```

客户端：

```json
{
  "url": "http://<host>:8788/mcp",
  "headers": { "Authorization": "Bearer <令牌>" }
}
```

---

## 接入后的行为约定

把 [`AGENTS.md`](AGENTS.md)（或压缩版 [`SKILL.md`](SKILL.md)）交给 Agent：

1. 轮首 `memory_recall(session_id)`，把返回块放入上下文
2. 轮末 `memory_save(session_id, fields)`，截断也要存
3. 历史用 `memory_search`，不要要求全量注入

## 排障

```bash
node dist/cli.js stats --data <ABS>/data      # 有没有数据
node dist/cli.js sync doctor --data <ABS>/data # 设备/墓碑/冲突
curl http://127.0.0.1:8777/api/health          # UI 是否在跑（如果开了）
```

- 工具不出现：检查宿主日志里的 MCP 启动错误（多为 node 路径或 `--data` 目录不可写）
- 保存成功但下一轮没注入：`session_id` 是否每轮都变？必须同一会话固定值
- 同一轮重复：`turn_no` 是否显式传错？不传由服务端自动编号

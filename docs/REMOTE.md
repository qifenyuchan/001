# 跨设备 / 跨网络使用指南

北极星记忆的默认形态是**单机**：MCP 走 stdio、UI 只监听 127.0.0.1。
跨设备有两种正确做法——**Hub（一台主机，其他设备远程连）** 与 **文件同步（每台设备本地副本）**。
两者可以组合，但不要同时用（会产生分叉）。

---

## 方案 A：Hub 模式（推荐，跨网络/多设备强一致）

一台常开设备（NAS / 旧笔记本 / 云服务器）作为唯一数据源，其他设备只做客户端。

### 1. 在 Hub 上启动服务

```bash
# 生成令牌（32 位以上随机串）
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"

# 监听局域网/公网入口（必须带令牌，否则拒绝启动）
node dist/server.js \
  --data ./data \
  --ui-host 0.0.0.0 --ui-port 8777 \
  --http-host 0.0.0.0 --http-port 8788 \
  --token <你的令牌>
```

- `8777` = 记忆仓库 UI；`8788/mcp` = MCP over HTTP。
- 也可以用环境变量：`TM_AUTH_TOKEN`、`TM_UI_HOST`、`TM_HTTP_PORT`。
- 安全闸：绑定非回环地址却没设令牌 → 进程直接拒绝启动。

### 2. 其他设备上的 Agent 接入

支持远程 MCP 的宿主（Claude Desktop / Cursor / WorkBuddy / 自研）配置：

```json
{
  "mcpServers": {
    "northstar-memory": {
      "url": "http://<Hub-IP>:8788/mcp",
      "headers": { "Authorization": "Bearer <你的令牌>" }
    }
  }
}
```

不支持 HTTP 的宿主：在那台设备上跑 `ssh -L 8788:127.0.0.1:8788 user@hub`，
然后按本地 `http://127.0.0.1:8788/mcp` 配置。

### 3. 其他设备打开记忆仓库

浏览器访问 `http://<Hub-IP>:8777/?token=<你的令牌>`，令牌会写入 HttpOnly Cookie
并立即从 URL 去掉；之后直接访问 `http://<Hub-IP>:8777` 即可。

### 4. 跨公网怎么连（按推荐顺序）

| 方式 | 说明 | 端口暴露 |
|---|---|---|
| **Tailscale**（首选） | 设备加入同一虚拟内网，用 `100.x.y.z` 直连；零端口映射、自动加密 | 无 |
| ZeroTier | 同类虚拟内网 | 无 |
| Cloudflare Tunnel | `cloudflared tunnel --url http://127.0.0.1:8777`，得到 https 域名 | 无（出站） |
| SSH 隧道 | `ssh -L 8777:127.0.0.1:8777 -L 8788:127.0.0.1:8788 user@hub` | 仅 SSH |
| 路由器端口转发 | **不推荐裸奔**；必须配 Caddy/Nginx 反代 + HTTPS + 强令牌 | 有 |

> 令牌在明文 HTTP 下可被同网段嗅探。可信内网/ Tailscale 可以接受；公网必须 HTTPS。

### 5. HTTPS 反代示例（Caddy）

```caddyfile
memory.example.com {
  reverse_proxy 127.0.0.1:8777
}
mcp.example.com {
  reverse_proxy 127.0.0.1:8788
}
```

Caddy 自动签发证书；随后 MCP 配 `https://mcp.example.com/mcp`。

---

## 方案 B：文件同步模式（多设备离线副本）

因为本项目是**一条记录一个 JSON、无索引、无 SQLite**，`data/` 目录可以直接交给
Syncthing / OneDrive / 坚果云 / git 同步。每台设备跑自己的本地实例，stdio MCP 不变。

### 做法

1. 把 `data/`（或整个项目）放进同步目录。
2. 每台设备：`node dist/server.js --data <同步目录>/data`（默认回环，无需令牌）。
3. 各设备的 Agent 各记各的会话；同步工具负责把文件合并过来。

### 为什么冲突少

- 不同轮次 = 不同文件名（`turn-0007.json`），同步层天然不冲突。
- 同一轮在不同设备同时保存 = 同一个文件名 → 同步工具会产生 "conflicted copy"；
  扫描器只认 `turn-*.json` / `range-*.json`，冲突副本会被忽略并保留，人工挑一个改回原名即可。

### 已知限制（重要）

- **删除不会收敛**：删掉的文件会被同步，但一台离线设备带着旧文件回来会"复活"。
  没有墓碑机制（这是有意的简化）。→ 删除/回滚请在 Hub 模式做，或接受偶发复活。
- **编辑并发**：同一字段两边同时改，后同步者覆盖前者（文件级 LWW）。
- **建议**：追加型使用（各自记各自的会话）非常稳；需要强一致的编辑用方案 A。

---

## 安全清单

- 令牌 ≥ 32 位随机（`crypto.randomBytes(24).toString('hex')`），不要用生日/单词。
- 不在 URL、日志、截图里长期暴露令牌（UI 引导后会自动从 URL 去掉）。
- 公网访问必须 HTTPS；内网也建议 Tailscale。
- `data/` 含真实对话内容，备份与同步盘注意访问权限。
- 定期备份：整目录拷贝即可（纯文件，无数据库）。
- 怀疑令牌泄漏：换令牌并重启服务，旧 Cookie 立即失效。

## 一页速查

```bash
# Hub 启动
node dist/server.js --data ./data --ui-host 0.0.0.0 --ui-port 8777 \
  --http-host 0.0.0.0 --http-port 8788 --token <token>

# 远程设备 MCP 配置
{ "mcpServers": { "northstar-memory": {
  "url": "http://<hub>:8788/mcp",
  "headers": { "Authorization": "Bearer <token>" } } } }

# 远程 UI
http://<hub>:8777/?token=<token>
```

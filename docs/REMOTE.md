# 跨设备 / 跨网络：本地优先同步

## 结论先行

**不共用一台设备，不托管用户数据。** 每台设备保留完整副本，同步走用户自己的存储：
OneDrive、iCloud、Syncthing、坚果云、WebDAV、git 都可以。

- 没有"中心设备"：任何一台掉线，其他设备照常读写
- 没有新增托管成本：用的是你已经在付费的存储
- 没有中心化风险：数据不在第三方服务里，不存在"100 人共用一台机器"
- 多人 = 多个空间（space）：每人一份数据，互不共用设备；团队共享 = 共享同一同步目录

## 工作原理

1. **每台设备一个数据目录**（可以是同一个云盘同步目录，也可以是 git 工作区）
2. 每条记录自带：
   - `device_id`（设备身份，存在 `~/.northstar/device_id`，不进同步目录）
   - `field_meta`（每个字段的最后修改时间与设备）
   - 删除写**墓碑**（`data/tombstones/`），不是直接抹掉
3. 同步工具负责搬运文件；应用在启动/刷新时做两件事：
   - **冲突合并**：识别 `turn-0001 (conflicted copy).json`、`turn-0001.sync-conflict-….json` 等副本，按字段 `ts` 合并，较新值胜出（平局按设备 id）
   - **墓碑应用**：看到墓碑且本地记录不比墓碑新 → 删除本地记录；墓碑之后又被编辑（`updated_at` 更晚）→ 保留，视为有意复活
4. 合并结果写入 canonical 文件，冲突副本移入 `data/conflicts/`，并生成 `.report.json` 合并报告；UI「冲突」页可查看

## 三种同步载体（任选）

| 载体 | 适合 | 注意 |
|---|---|---|
| **云盘目录**（OneDrive/iCloud/Dropbox/坚果云） | 大多数个人用户 | 冲突文件命名因厂商而异，已兼容常见格式 |
| **Syncthing** | 局域网/自建、无云依赖 | 冲突副本形如 `*.sync-conflict-*`，已识别 |
| **git 仓库** | 技术用户、需要历史与回滚 | 冲突时 git 会改文件内容；建议 `merge=union` 或人工处理后让应用合并 |

### 云盘方式（推荐）

```bash
# 设备 A
node dist/server.js --data "D:/OneDrive/northstar/data"

# 设备 B（同一云盘账号，等同步完成）
node dist/server.js --data "D:/OneDrive/northstar/data"
```

设备身份自动生成；两台设备同时写不同轮次不会冲突（文件名不同），
同一轮同时编辑才会产生冲突副本，由应用自动合并。

### git 方式

```bash
cd D:/northstar-data && git init
# 每台设备：pull → 使用 → commit/push
git pull --rebase
node dist/server.js --data D:/northstar-data
git add -A && git commit -m "memory: device B" && git push
```

建议设置 `.gitattributes`：`*.json merge=union` 或直接采用"冲突副本"策略。

## 多设备操作与自检

```bash
node dist/cli.js sync status   # 设备 id / 记录数 / 墓碑数 / 冲突数
node dist/cli.js sync doctor   # 附带排查提示
```

正常状态：`conflicts` 为 0 或偶发；`tombstones` 有少量属正常（删除记录）。
`data/conflicts/` 里的 `.report.json` 会写明：哪个文件、合并到哪条、保留/丢弃了哪些字段值。

## 删除与恢复语义

- 删除 → 写 `tombstones/<id>.json`（含完整记录）+ 删本地文件
- 其他设备同步到墓碑后，本地记录消失
- 回收站恢复 → 删除墓碑、写回记录（`updated_at` 更新）
- **复活规则**：墓碑时间晚于记录 → 删除；记录时间晚于墓碑 → 保留（说明删除后又被编辑）
- 墓碑会一直保留（体积很小），暂不自动 GC；确认所有设备已同步后可手工清理 `data/tombstones/`

## 多人 / 团队

- 个人：`data/spaces/personal/`
- 团队：每人一个 space；共享空间 = 一个被成员共同同步的目录（`data/spaces/team-x/`）
- 权限：当前版本把 ACL 交给存储层（云盘共享权限 / git 仓库权限）；应用侧预留 `space.json.members`，后续可加签名成员清单
- 不建议 100 人共用一个目录：按团队/项目拆分 space，各自同步，互不干扰

## 可选：远程 Agent 接入（不是多设备方案）

若某台设备无法运行本地进程（无头服务器、手机端 Agent），可以让它直连一台常开机器：

```bash
node dist/server.js --data ./data --http-host 0.0.0.0 --http-port 8788 --token <令牌>
```

MCP 配置：`{"url":"http://<host>:8788/mcp","headers":{"Authorization":"Bearer <令牌>"}}`

这属于"远程访问一台已有副本"，不是"所有设备共用一台机器"；
能本地跑的设备，优先本地副本 + 文件同步。

## 公网访问（可选）

| 方式 | 端口暴露 | 说明 |
|---|---|---|
| Tailscale | 无 | 虚拟内网，自动加密，首选 |
| Cloudflare Tunnel | 无（出站） | `cloudflared tunnel --url http://127.0.0.1:8777` |
| SSH 隧道 | 仅 SSH | `ssh -L 8777:127.0.0.1:8777 -L 8788:127.0.0.1:8788 user@host` |
| 端口转发 | 有 | 不推荐裸奔；必须 HTTPS 反代 + 强令牌 |

## 成本与风险

| 项 | 本地优先方案 |
|---|---|
| 服务器成本 | 0（用现有云盘/git） |
| 存储成本 | 用户已有的云盘配额 |
| 单点故障 | 无中心节点；某台设备坏了，其他副本仍在 |
| 数据泄露风险 | 数据在用户自己的存储；无第三方托管 |
| 冲突风险 | 自动字段合并 + 冲突报告 + 回收站可恢复 |
| 运维 | 无服务要维护；同步工具用户本来就在用 |

## 安全清单

- 只在需要远程接入时才开 HTTP/UI 的非回环监听，并必须设 `TM_AUTH_TOKEN`
- 令牌 ≥32 位随机；公网必须 HTTPS
- 云盘共享目录注意成员权限；团队 space 不要放个人敏感记忆
- 定期备份 `data/`（纯文件，直接拷贝即可）

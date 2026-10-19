# 字段方案（Profiles）

一条记忆存什么字段，由 **profile** 决定。默认是 `general`（七字段）；`work` / `story` 不内置，需要单独安装。

## 三套方案

### general（内置，默认）

| 字段 | 必填 | 说明 |
|---|---|---|
| 时间 | | 日期或相对时间 |
| 地点 | | 地点 / 项目 / 环境，可写“无” |
| 人物 | | 参与者，可写“无” |
| 事情 | ✅ | 一句话说清发生了什么 |
| 原因 | | 为什么会这样 |
| 结果 | ✅ | 可验证的产出 / 结论 |
| 重点 | | 下一轮最该记住的 |

标题取 `事情`，摘要取 `结果`。

### work（长工作，需安装）

适合跨多轮的项目/工程任务，强调“随时能接上”。

| 字段 | 必填 |
|---|---|
| 时间 | |
| 项目 / 模块 | |
| 目标 | ✅ |
| 已完成 / 进展 | |
| 关键决策 | |
| 阻塞 / 风险 | |
| 相关文件 / 命令 | |
| 下一步 | ✅ |

标题取 `目标`，摘要取 `下一步`。

### story（长剧情，需安装）

适合长篇叙事 / 角色扮演，强调连续性。

| 字段 | 必填 |
|---|---|
| 时间线 | |
| 场景 | |
| 人物 | |
| 关系变化 | |
| 事件 | ✅ |
| 伏笔 / 线索 | |
| 当前状态 | ✅ |
| 下一步 / 走向 | |

标题取 `事件`，摘要取 `当前状态`。

## 安装 / 查看 / 移除

```bash
# 从 GitHub 下载并安装（默认源 raw.githubusercontent.com）
node dist/cli.js profile install work
node dist/cli.js profile install story

# 离线安装（用仓库里的 profiles/*.json）
node dist/cli.js profile install work --file profiles/work.json

# 查看当前可用方案
node dist/cli.js profile list

# 移除
node dist/cli.js profile remove work
```

安装后写入 `data/profiles/<id>.json`，随 `data/` 一起同步到其他设备。
另一台设备没有安装时，记录仍能读，但 UI 会标“未安装”，保存会提示先安装。

## 使用

MCP：

```json
{
  "session_id": "proj-x",
  "profile": "work",
  "fields": {
    "时间": "2026-10-20",
    "项目": "northstar",
    "目标": "实现 profile 引擎",
    "进展": "存储/注入/UI 完成",
    "决策": "JSON 包，general 内置",
    "阻塞": "无",
    "文件": "src/store/profiles.ts",
    "下一步": "补文档"
  }
}
```

CLI：

```bash
node dist/cli.js save --session proj-x --profile work --fields '{"目标":"...","下一步":"..."}'
```

- 不传 `profile` 时使用 `general`
- 同一轮不允许切换 profile（会返回 `CONFLICT`）
- `memory_recall` 会按记录自己的 profile 渲染，标头带方案名
- 自动范围总结也按 profile 聚合字段

## 自定义方案

复制 `profiles/work.json`，改 `id`、`name`、`fields` 后安装：

```bash
node dist/cli.js profile install myflow --file ./myflow.json
```

规则：

- `id`：`[a-z0-9_-]{1,32}`，不能叫 `general`
- 字段 1–12 个，`key` 不能重复，只允许中英文/数字/下划线/短横线
- `title_field` / `excerpt_field` 必须是已有字段
- 每字段可设 `weight`（检索权重 0.5–5）、`max_chars`、`required`
- 安装时会校验；非法包会被拒绝，不影响已有数据

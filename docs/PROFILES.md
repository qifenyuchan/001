# 表格方案：通用 / 自定义（二选一）

只有两套表格，且**同一时间只能启用一套**：

| 方案 | 来源 | 字段 |
|---|---|---|
| `general` 通用 | 内置，默认 | 时间、地点、人物、事情、原因、结果、重点（7 个） |
| `custom` 自定义 | 需安装，可改 | 4 个固定字段 + 自定义槽位 |

“启用”的这套叫 **active profile**，决定**新写入**用哪套表。
历史记录保留原来的方案，仍可阅读/编辑；但不能再以非当前方案写入。

## 自定义表格

模板在 `profiles/custom.json`，安装后复制到 `data/profiles/custom.json`。

固定字段（不建议删）：

| 字段 | 必填 | 说明 |
|---|---|---|
| 时间 | | 日期或故事内时间 |
| 事件 / 进展 | ✅ | 本轮发生了什么、推进了什么 |
| 结果 / 状态 | ✅ | 可验证的结果，或此刻的状态 |
| 下一步 | | 下一轮从哪继续 |

默认还带 3 个自定义槽位（`自定义1/2/3`），可以：

- 改 `label`：显示名改成“项目 / 人物 / 决策 / 伏笔 / 关系…”等
- 改 `hint`：给 Agent 的填写提示
- 删掉不需要的槽位
- 追加新字段（1–12 个，`key` 不能重复）

> 建议：`key` 定下来后不要改。改 `key` 等于换字段，旧数据不会自动映射；
> 旧字段仍会在详情页的“其他字段（只读）”里显示。

### 安装

```bash
# 从 GitHub 下载（需要仓库已推送）
node dist/cli.js profile install custom

# 离线：用仓库里的模板
node dist/cli.js profile install custom --file profiles/custom.json

# 查看安装位置
node dist/cli.js profile path
```

安装后编辑 `data/profiles/custom.json`，改完重启服务或重新打开 UI 生效。

### 启用 / 切回

```bash
node dist/cli.js profile use custom
node dist/cli.js profile use general
node dist/cli.js profile list      # 显示 active
```

UI 左侧栏底部也有“字段方案”下拉框，切换前会确认。

## 切换时发生什么

1. **新写入**立即使用新方案；不传 `profile` 时自动用 active。
2. **历史记录**保留原方案，不删除、不改写；列表里会给非当前方案的记录加标签。
3. 用非 active 方案写入会报 `PROFILE_INACTIVE`，需要先 `profile use` 切过去。
4. 同一轮已有记录不允许换方案（报 `CONFLICT`）。
5. 旧方案的自动范围总结会跳过（`profile-inactive`），避免混表。
6. 当前方案不能被 `profile remove` 删除。

这是一次“软切换”：不清库、不迁移、不丢历史。代价是新旧记录可能同时存在，
UI 会标明每条记录属于哪套表。

## 自定义字段的校验

- `id`：`[a-z0-9_-]{1,32}`，不能叫 `general`
- 字段 1–12 个；`key` 唯一，只允许中英文/数字/下划线/短横线
- `title_field` / `excerpt_field` 必须是已有字段
- `weight` 0.5–5（检索权重）；`max_chars` 20–2000；`required` 布尔
- 安装时校验，非法包会被拒绝，不影响已有数据

## 多设备

`data/profiles/*.json` 与 `data/profile.json` 都在数据目录里，随云盘/git 同步。
另一台设备没装 custom 时，记录仍能读，保存会提示先安装。

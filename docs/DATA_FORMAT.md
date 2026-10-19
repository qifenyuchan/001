# 数据格式（DATA_FORMAT）

单一真源：`data/sessions/<session_key>/<record>.json`。无索引文件、无 SQLite、无镜像。

## 文件命名

| 类型 | 文件名 | 例 |
|---|---|---|
| 单轮 | `turn-<4位轮次>.json` | `turn-0007.json` |
| 范围总结 | `range-<4位起>-<4位止>.json` | `range-0001-0010.json` |
| 会话元数据 | `_meta.json` | — |
| 刷新标记 | `.rev` | — |

## 记录 schema（v1）

```json
{
  "schema": 1,
  "id": "tm_muwsmpge_hrpp",
  "kind": "turn | range",
  "session_id": "宿主会话 id（原样）",
  "session_key": "清洗后的键（目录名）",
  "turn_no": 7,
  "created_at": 1791298086494,
  "updated_at": 1791298086494,
  "revision": 3,
  "fields": {
    "时间": "2026-10-19",
    "地点": "无",
    "人物": "用户、Agent",
    "事情": "一句话",
    "原因": "无",
    "结果": "可验证结果",
    "重点": "下轮锚点"
  },
  "raw_text": "【问】…\n\n【答】…",
  "raw_truncated": false,
  "truncated": false,
  "missing": ["原因"],
  "blank": ["地点"],
  "quality": "complete | partial | degraded",
  "tags": ["排错诊断"],
  "rating": 3,
  "source": "agent | cli | migrate | auto-range",
  "origin": "native | legacy",
  "range": { "from": 1, "to": 10, "covers": ["tm_…"], "unresolved": [] },
  "auto": true,
  "legacy": { "uid": "…", "chat_id": "…", "content_sha256": "…", "body_sha256": "…", "content": "…" }
}
```

- `fields` 七个键**恒存在**，缺失值为空串；`missing` 是空串键的派生，`blank` 是"无/—"的派生。
- `content`（七字段文本）与 `title` 不落盘，读取时由 `fieldsToContent()` / `deriveTitleFromFields()` 生成。
- `range` 仅 `kind="range"` 有；`legacy` 仅迁移条有，只作审计，不参与检索与注入。
- `revision` 每次保存/编辑 +1；`memory_update` 可带 `expect_revision` 做乐观锁。

## quality 语义

| 值 | 含义 | 触发 |
|---|---|---|
| `complete` | 七字段齐全且事情/结果非空 | 正常保存 |
| `partial` | 核心在，但缺字段 | 部分字段保存 |
| `degraded` | 骨架/仅原文 | 只传 raw_text，或事情/结果缺失 |

## 会话元数据 `_meta.json`

```json
{
  "schema": 1,
  "session_id": "宿主会话 id",
  "session_key": "清洗后的键",
  "name": "会话显示名",
  "name_source": "legacy | auto | user",
  "range_every": 10,
  "created_at": 0,
  "updated_at": 0
}
```

## 回收站 `.trash/<trash_id>.json`

```json
{
  "trash_id": "1792407809369_tm_xxx_delete",
  "record": { "...完整记录..." },
  "deleted_at": 1792407809369,
  "original_path": "sessions/s1/turn-0007.json",
  "reason": "delete | edit | range-edit"
}
```

- `delete`：删除操作；`edit`：编辑前快照（可回滚）。
- 恢复：写回原路径（目标存在则 CONFLICT）；彻底删除：输入 PURGE。

## 并发与一致性

- 原子写：临时文件 → fsync → rename（Windows EPERM 重试 3×20ms）。
- 会话级短锁（`.locks/<key>.lock`，mkdir 原子性）。
- 跨进程刷新：`.rev` mtime 变化即重扫该会话。
- 解析失败的文件不覆盖、不删除，计入 `stats.corrupted` 并在日志告警。

# 数据格式（DATA_FORMAT）

单一真源：`data/spaces/<space_id>/sessions/<session_key>/<record>.json`。无索引文件、无 SQLite、无镜像。

## 文件命名

| 类型 | 文件名 | 例 |
|---|---|---|
| 单轮 | `turn-<4位轮次>.json` | `turn-0007.json` |
| 范围总结 | `range-<4位起>-<4位止>.json` | `range-0001-0010.json` |
| 会话元数据 | `_meta.json` | — |
| 空间元数据 | `spaces/<space_id>/space.json` | — |
| 删除墓碑 | `tombstones/<record_id>.json` | — |
| 冲突副本 | 同步工具生成（`*.sync-conflict-*` 等），启动时合并归档 | — |

## 记录 schema（v1）

```json
{
  "schema": 1,
  "id": "tm_muwsmpge_hrpp",
  "kind": "turn | range",
  "profile": "general",
  "space_id": "personal",
  "session_id": "宿主会话 id（原样）",
  "session_key": "清洗后的键（目录名）",
  "turn_no": 7,
  "created_at": 1791298086494,
  "updated_at": 1791298086494,
  "revision": 3,
  "updated_by": "dev_1bfc459b",
  "field_meta": {
    "时间": { "ts": 1791298086494, "by": "dev_1bfc459b" },
    "事情": { "ts": 1791298086494, "by": "dev_1bfc459b" },
    "raw_text": { "ts": 1791298086494, "by": "dev_1bfc459b" }
  },
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
- `space_id / updated_by / field_meta` 是多设备同步的基础：合并时按字段 `ts` 决胜，平局按 `by`。
- `profile` 决定字段集合：`general`（七字段）或 `custom`（固定 4 字段 + 自定义）；由 `data/profile.json` 的 `active` 决定新写入方案。
- `device_id` 存在 `~/.northstar/device_id`，不放进同步目录（避免多设备互相覆盖）。

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

## 删除墓碑 `tombstones/<id>.json`

```json
{
  "schema": 1,
  "id": "tm_…",
  "session_key": "s1",
  "deleted_at": 1792407809369,
  "by": "dev_…",
  "reason": "delete",
  "record": { "...完整记录..." }
}
```

- 墓碑随文件同步传播；其他设备看到后删除本地记录
- 若本地记录 `updated_at > deleted_at`，保留记录（删除后又被编辑 = 有意复活）
- 恢复 = 删除墓碑 + 写回记录

## 回收站 `.trash/<trash_id>.json`

编辑前的快照（回滚用）：

```json
{
  "trash_id": "1792407809369_tm_xxx_edit",
  "record": { "...完整记录..." },
  "deleted_at": 1792407809369,
  "original_path": "spaces/personal/sessions/s1/turn-0007.json",
  "reason": "edit | range-edit"
}
```

## 冲突合并

- 触发：同步工具生成 `turn-0001 (conflicted copy).json`、`*.sync-conflict-*` 等非 canonical 文件
- 处理：按记录 id / 天然键找到目标 → 逐字段按 `field_meta.ts` 取较新值 → 写回 canonical → 副本移入 `data/conflicts/` → 生成 `.report.json`
- 字段值冲突时保留较新值，被丢弃的值记录在报告里（UI「冲突」页可查）
- 多设备产生不同 id 但同一轮次：按天然键合并到已有记录，避免重复

## 并发与一致性

- 原子写：临时文件 → fsync → rename（Windows EPERM 重试 3×20ms）。
- 会话级短锁（`.locks/<key>.lock`，mkdir 原子性）。
- 跨进程刷新：`.rev` mtime 变化即重扫该会话。
- 解析失败的文件不覆盖、不删除，计入 `stats.corrupted` 并在日志告警。

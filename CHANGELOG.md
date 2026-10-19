# Changelog

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

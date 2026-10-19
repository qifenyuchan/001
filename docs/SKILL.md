---
name: northstar-memory
description: 北极星记忆协议（压缩版）。轮首 memory_recall 取上一轮总结；轮末 memory_save 填七字段；历史用 memory_search。适用于任何接入 northstar-memory MCP 服务的 Agent。
---

# 北极星记忆协议（SKILL）

**三条规则**

1. 每个用户回合开始：`memory_recall({session_id})` → 返回文本原样放上下文。
2. 每个回合结束：`memory_save({session_id, fields:{时间,地点,人物,事情,原因,结果,重点}})`（默认用当前启用的方案：general 或 custom；一般不用传 profile）。
   **截断也要存**：`truncated:true` + 已有字段 + `raw_text`。正常轮**不要传 raw_text**（省 token）。永不跳过。
3. 只注入上一轮；几十轮前的事用 `memory_search({query})`，不要求全量注入。

**session_id**：同一会话固定值（宿主 session id / 工作区名+日期）。

**七字段要点**

- 时间：绝对日期（`2026-10-19`），不写"今天"
- 地点/人物：无关写 `无`
- 事情：一句话说清做了什么（最重要）
- 原因：触发点/目标，未知写 `无`
- 结果：可验证的产出/结论
- 重点：下一轮最需要记住的一条（决策、约束、待办）

**范围总结**：`memory_save` 返回 `range_due:true` 时系统已生成机械范围条；
可用 `kind:"range", range_from, range_to` 提交更好的覆盖。

**异常处理**

- 截断/超时：先存再停，`truncated:true`
- 只有原文：只传 `raw_text`（服务生成骨架，标记 degraded）
- 补录：显式传 `turn_no`
- 改历史：`memory_update({id, expect_revision})`；删除 `memory_delete({id, confirm:true})`

**隐私**：不存 key、密码、令牌、证件号。

**工具一览**：memory_save / recall / search / get / list / update / delete / restore / stats

# 旧工作区封存声明（SEALED）

- 旧工作区 `D:\新建文件夹 (2)\.zcode\workspace\default`（版本 0.9.33-F）为**只读封存区**。
- 本工程（`D:\北极星_turn_memory`）不读取、不写入、不依赖其中任何代码或运行时。
- 唯一与旧工作区的交互是一次性只读迁移（`migrate.js`），且迁移前后旧数据哈希一致（见 `baseline_manifest.json` 与 `report_apply.json`）。
- 禁止再启动旧 `pc_host/service.js` 与 `turn_memory/mem_service`（会写入旧库，造成两套记忆分叉）。
- 旧数据备份位于 `migration/backup_pc_host_data_<时间戳>/`。

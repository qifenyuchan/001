# 本体 + 升级包：模块化架构规范

> 生成时间：2026-10-20　|　状态：**v1 已实现（2.7.0）**　|　前置：`QUALITY.md`（质量门禁）、`UPGRADE-PLAN.md`（六个包的内容）
> 目标：**需要什么就装什么**——本体保持极小，能力以「包」的形式独立安装、独立卸载。

## 0.1 实现状态（2.7.0）

已落地：`src/packs/{types,host}.ts`、CLI `pack` 七个命令、四个 hook 接入（compose 在注入、score 在检索、onSave 在保存/删除、export 在导出）、工具集按包合并、三个包（`export-obsidian` / `creative` / `safety`）、24 项包相关回归测试。

与设计稿的三处偏差（以实现为准）：

| 设计稿 | 实际 | 原因 |
|---|---|---|
| hook 有超时（50/5/100ms）并中断 | hook **必须同步**；超时只记告警，不中断 | 同步函数无法抢占；异步 hook 会让核心路径全部变 async |
| `~/.northstar/pack-state.json` | `<packsDir>/state.json` | 状态跟着安装目录走，便于整体迁移与测试隔离 |
| `install` 支持 npm / git | v1 只支持**本地路径** | 从网络装代码需要额外的信任与校验设计，先不做 |

另：装载时若包目录缺 `package.json`，会自动补 `{"type":"module"}`——否则 Node 会把包的 `.js` 当 CJS，`export` 语法直接报错。

## 0. 为什么要拆

现在的结构是单体：`core/`（分词/打分/标题）+ `features/`（注入/范围/搜索）+ `store/`。
每加一个能力（触发注入、衰减、索引、导出）都要改 `features/` 和 `mcp/tools.ts`，
结果是三个代价同时上涨：

1. **工具定义膨胀**：`tools/list` 每加一个工具就多几百 token，所有用户都付；
2. **功能互相打架**：衰减排序和索引维护都改 `scoreRecord`，改一处影响全部；
3. **卸载不存在**：用户不需要文创能力，也背着它的代码和字段。

profile 机制（v2.6）已经证明「可选能力」这条路可行——它把「字段」做成了可安装的东西。
包机制是把同样的思路推到「能力」层。

## 1. 五条设计原则

1. **本体不装任何包也能完整工作**：只有核心 3 个工具，5000 条记录照常存读。
2. **包失败不炸本体**：加载异常、hook 超时、索引损坏 → 降级跳过，服务照常起。
3. **不装包，数据也可读**：包写入的字段在卸载后以「其他字段（只读）」展示，绝不丢。
4. **包只加能力，不改真源**：写入永远走 `RepoStore`，包只能通过 hook 观察与建议。
5. **装了才付 token**：工具集随已启用包变化，没装的能力不出现在 `tools/list`。

## 2. 目录布局

```
~/.northstar/
  packs/                        # 已安装的包（代码，用户级，不随项目走）
    creative/
      pack.json
      index.js                  # ESM，导出 register(api)
      ui/                       # 可选静态资源
      profiles/story.json       # 可选字段模板
  pack-state.json               # 启用状态与版本锁定

<dataDir>/
  spaces/<space>/sessions/...   # 真源：一条记录一个 JSON（不变）
  profile.json  profiles/       # 字段方案（不变）
  tombstones/                   # 墓碑（不变）
  .packs/<id>/                  # 包的派生数据（索引/缓存），**可删可重建，不同步**
```

关键区分：`~/.northstar/packs` 是**代码**，`<dataDir>/.packs` 是**派生数据**。
前者不进同步目录，后者可随时删——这条决定了「删掉派生数据后记录仍可读」的不变量。

## 3. pack.json 规范

```json
{
  "id": "creative",
  "name": "文创写作包",
  "version": "1.0.0",
  "apiVersion": "^1",
  "requires": { "core": ">=2.7.0" },
  "provides": {
    "profiles": ["story"],
    "tools": ["memory_pin"],
    "cli": ["story"],
    "hooks": ["compose", "score", "onSave"],
    "ui": ["panel"]
  },
  "description": "剧情字段模板 + 触发式注入 + 真相层"
}
```

- `apiVersion`：包所针对的核心扩展 API 版本，不匹配则拒绝加载（不是崩，是跳过并提示）。
- `provides` 是**声明式清单**，安装时展示给用户看（「这个包会注册 1 个工具、2 个 hook」）。
- 包不得声明自己修改记录结构——字段必须走 profile。

## 4. PackApi：包能碰到什么

```ts
export interface PackApi {
  readonly version: string;                    // 核心扩展 API 版本
  readonly coreVersion: string;
  readonly dataDir: string;

  registerProfile(p: Profile): void;           // 字段模板（写入 data/profiles/<id>.json）
  registerTool(def: ToolDef, handler: Handler): void;  // 追加 MCP 工具
  registerCli(name: string, help: string, run: (argv: string[]) => Promise<number>): void;

  hook(name: HookName, fn: HookFn, opts?: { priority?: number; timeoutMs?: number }): void;

  storage(): PackStorage;                      // <dataDir>/.packs/<id>/ 的读写封装
  records(): Iterable<MemoryRecord>;           // 只读遍历（不给写入口）
  log: { info(s: string): void; warn(s: string): void; error(s: string): void };
}
```

### 四个 hook（足够覆盖六个包，不再多）

| hook | 签名 | 用途 | 已对应包 |
|---|---|---|---|
| `compose` | `(turn, budget, ctx) => Segment[]` | 往上下文里加段（触发命中、真相层提示） | creative |
| `score` | `(rec, query) => number` | 给排序加/减分（衰减、索引命中、信任度） | lifecycle / recall-index / safety |
| `onSave` | `(rec, prev) => void` | 观察写入，维护派生数据（索引、来源标记） | recall-index / safety |
| `export` | `(records) => {name, files}` | 贡献导出格式 | export-obsidian |

`onDelete` 与 `onSave` 合并（`prev` 非空即更新，`rec` 为空即删除），少一个 hook 少一套语义。

## 5. 生命周期

```bash
northstar pack list                  # 已装 / 已启用 / 版本 / apiVersion 兼容性
northstar pack install <id|path|npm:pkg|git:url#sha> [--yes]
northstar pack enable|disable <id>   # 只切开关，不删文件
northstar pack remove <id> [--force] # 有记录依赖其 profile 时必须 --force，且数据仍可读
northstar pack doctor                # 检查兼容性、数据可读性、索引完整性
northstar pack rebuild <id>          # 重建派生数据（从真源重放）
```

- **install 必须确认**：打印 `provides` 清单再执行（包是代码，等于装依赖）。
- **disable ≠ remove**：disable 后工具消失、hook 不跑，但字段和派生数据都还在。
- **remove 不删数据**：只删代码与该包派生数据；记录里的字段保留只读。
- **rebuild 是安全阀**：任何派生数据损坏，一条命令从真源重放。

## 6. 数据兼容：一个必须处理的现实约束

`normalizeFields` 只保留 profile 声明过的键（`if (!k) continue`）。这意味着：

> **包不能偷偷往 `fields` 里塞新键——会被 schema 丢掉。**

两条路，选后者：

- ❌ 放宽 `normalizeFields` 接受任意键 → 字段失控，七字段恒存在的铁律被破；
- ✅ **包通过 profile 提供字段**：`creative` 包注册 `story` 方案（含「触发词」「真相」槽位），
  记录用该方案写入时字段自然存在；卸载包后记录仍带着这些字段，按「其他字段（只读）」展示。

配套要求：**包必须能容忍「字段存在但包不在」**——读取时按空值处理，不得假定包已装。
这条同时保证了跨设备场景：A 设备装了 creative，B 设备没装，B 仍能读全部记录。

## 7. 失败隔离与超时

```ts
try {
  const mod = await import(packEntryUrl);
  mod.register(api);            // 每个 register* 都做参数校验
} catch (e) {
  markFailed(id, e);            // 状态置 failed，核心继续启动
}
```

- 每个 hook 调用包一层 try/catch（默认预算 `compose` 50ms、`score` 5ms、`onSave` 100ms、`export` 2000ms）；
- **hook 必须同步**：返回 Promise 会被忽略并告警。超时只记告警、不中断（同步代码无法抢占）；
- 抛错 → 该 hook 本次跳过 + 失败计数，连续 10 次自动 disable 并提示；
- 派生数据缺失/损坏 → 自动回退核心路径（全量扫描），并在 `pack doctor` 里报出来。

**这一节的每条都必须有对应的测试**，否则包机制会把「单点故障」升级成「全局故障」。

## 8. 安全模型（不假装有沙箱）

包是**进程内可执行代码**，Node 无法真正沙箱化。所以不承诺隔离，只做三件事：

1. **明示**：install 时打印它要注册什么、要哪些 hook，需要 `--yes`；
2. **来源收敛**：只接受本地路径、npm 包（`northstar-pack-*` 前缀）、git 固定 SHA；
3. **权限最小化**：`api` 不暴露 `fs`、`child_process`、网络——包只能通过 `storage()` 读写自己的目录。

不做的：签名校验、运行时沙箱、包市场。当前阶段做这些是过度设计。

## 9. 工具集与 token 预算

| 模式 | 内容 |
|---|---|
| `--tools lite`（默认） | 核心 3 个 + 已启用包里标了 `default: true` 的工具 |
| `--tools full` | 核心 9 个 + 全部已启用包工具 |

- 包工具**默认不进 lite**，只有明确标 `default: true` 才进（避免装一个包就多几百 token）；
- 每个包的 token 成本写进 `pack.json` 的 `provides.tools` 长度估算，`pack list` 里展示；
- 这条让「按需安装」不只是省内存，而是**实打实省上下文预算**。

## 10. 六个升级包 → 具体实现映射

| 升级包 | pack id | 提供 | hook | 核心改动 |
|---|---|---|---|---|
| A 文创写作 | `creative` ✅ 已实现 | `story` 字段方案、`memory_pin` | compose（触发命中）、score（pinned 加成）、onSave（触发索引） | 无（profile + hook 足够；仅新增窄写入端口 updateTags） |
| B 会话交接 | `handoff` | `adr` 方案、`memory_handoff`、`handoff` 命令 | compose（交接摘要） | 无 |
| C 生命周期 | `lifecycle` | `memory_consolidate`、时间字段方案 | score（ACT-R 衰减） | 需 `superseded_by` 进 profile |
| D 检索索引 | `recall-index` | 无工具（透明加速） | onSave（维护倒排）、score（索引命中加权） | 无 |
| E 安全合规 | `safety` ✅ 已实现 | `safety` CLI（scan/flag/list） | onSave（注入检测）、score（信任权重）、compose（上一轮可疑提示） | 无（新增 `memory_save.source` 声明来源） |
| F 导出互通 | `export-obsidian` | `northstar export --format obsidian` | export | 无 |

只有 C 需要核心配合（把时间字段变成可声明的），其余五个都能纯 hook 实现——**说明扩展点设计得够用**。

## 11. 实施顺序

| 步骤 | 内容 | 依赖 | 规模 |
|---|---|---|---|
| 1 | `src/packs/api.ts` + `loader.ts`（扫描/加载/隔离/超时） | 无 | ~300 行 |
| 2 | `hook` 注册表 + 三处接入（compose / score / onSave） | 1 | ~120 行 |
| 3 | `pack` CLI（list/install/enable/disable/remove/doctor/rebuild） | 1 | ~200 行 |
| 4 | `defsFor` 合并包工具 + token 估算 | 1 | ~60 行 |
| 5 | UI：包状态面板 + 挂载包静态资源 | 1 | ~80 行 |
| 6 | 首个包 `export-obsidian`（最小、能验证全链路） | 1–4 | ~150 行 |
| 7 | 其余包按需 | 6 | 每个 150–300 行 |

**先做 F（导出包）做验证**：它只用一个 hook、不依赖数据改造、失败也不影响核心——
是检验包机制本身的最便宜方式。

## 12. 不做的事

- 运行时沙箱 / 签名校验（当前阶段过度设计）
- 包市场 / 在线仓库索引（先支持路径与 npm，够了）
- 热重载（改包要重启，简单可控）
- 包之间互相依赖（v1 禁止：包只能依赖本体，避免依赖地狱）
- 让包直接写记录（写入永远走 RepoStore）

# 攻击测试报告 — northstar-memory 2.15.0

> 目标：`D:\北极星_turn_memory`（本地 MCP 记忆服务：stdio MCP + HTTP MCP + 本机 UI + 包机制）
> 时间：2026-10-22　方式：白盒（读源码定位）+ 黑盒（真起服务打）
> 攻击台：`npm run attack`（`attack/run.mjs`，36 条用例，输出 `attack/report.json`）
> 回归：`tests/attack.test.mjs`（11 条断言，已进 `npm test`）

## 一、结果

| | 修复前 | 修复后 |
|---|---|---|
| 用例总数 | 36 | 36 |
| 拦住 | 26 | **34** |
| 打通 | 10 | 2（均为设计取舍，见 §4） |
| critical / high 打通 | 4 | **0** |

修完命中率之外的两条硬指标没有退化：

- `npm test`：190 → **201** 断言全绿
- `npm run eval`：Hit@5 0.965 / Recall@5 0.951 / MRR@5 0.928（与 2.14.0 基线同级）

## 二、打通的缺陷（按严重度）

### C1 ｜ 严重 ｜ `pack remove` 路径穿越，可删除包目录之外任意目录

- 位置：`src/packs/host.ts` `remove(id)` → `rmrf(path.join(packsDir, id))`
- 载荷：`northstar-memory pack remove ../victim --packs-dir <packs> --data <data>`
- 实测：`<packs>/../victim` 整个目录被递归删除（exit=0，无任何告警）。
  更糟的形状：`pack remove .` 会删掉整个 `~/.northstar/packs`，`pack remove ..` 会删掉 `~/.northstar`。
- 同类：`rebuild(id)` 拼的是 `data/.packs/<id>`，`disable`/`enable` 同样未校验 id。
- 修复：所有接受包 id 的入口统一走 `assertPackId()`（`^[a-z0-9][a-z0-9_-]{0,31}$`），
  不合规直接 `INVALID_ARG`，不进入任何 `path.join`/`rmrf`。
- 回归：`A-E1`、`A-E1b`

### C2 ｜ 严重 ｜ `pack enable` 路径穿越 + 任意 JS 执行

- 位置：`src/packs/host.ts` `enable(id)` → `readManifest(path.join(packsDir, id))` → `import(entry)`
- 载荷：`pack enable ../outside`，`../outside/pack.json` 与该目录下的 `index.js` 由攻击者放置。
- 实测：包外 `index.js` 被 `import` 执行（marker 文件落盘，exit=0）。
  `pack.json` 的 `id` 会被 `readManifest` 校验，但**目录名不校验**——校验错了对象。
- 修复：同 C1（id 白名单）。
- 回归：`A-E2`

### H1 ｜ 高 ｜ manifest 的 `main` 逃出包目录（包目录 ≠ 代码边界）

- 位置：`loadPack()` 用 `path.join(dir, entryName)`，`../../escape.js` 直接被解析到包外
- 实测：`packs/pwn/pack.json` 写 `"main": "../../escape.js"` → 启动/任意命令加载包时执行包外文件。
  这条让「包目录」这个信任边界失效：即使只审计过包目录内容，也可能执行到目录外的东西。
- 修复：`insideOrNull(dir, entryName)`——`path.resolve` 后求相对路径，含 `..`/绝对路径一律拒绝；
  `install()` 的源目录同样校验。
- 回归：`A-E3`

### M1 ｜ 中 ｜ 单条超长查询把整个进程钉住（同步检索，无词项上限）

- 位置：`src/core/tokenize.ts` 无词项上限；`buildCorpus`/`scoreDoc` 是 `词项 × 记录 × 字段` 的
  全量 `indexOf`，跑在唯一的主线程上——检索期间 stdio MCP、HTTP MCP、UI 全部无响应。
- 实测（20 条记录）：2 000 字 → 211ms，10 000 字 → 514ms，40 000 字 → 792ms；
  2MB 请求体上限内可反复打，1 req/s 就能占满 CPU。
- 修复：`MAX_QUERY_CHARS = 4096` + `MAX_TERMS = 128`（先截断再分词）。
  修复后同一组测量：39ms / 43ms / 26ms。
- 副作用：>128 个词项的查询只按前 128 项打分；评测集查询都很短，MRR 未变。
- 顺带修掉：去重表从对象换成 `Set`——原来 `constructor`、`__proto__` 这类词会被当成
  「已存在」直接丢弃（英文查询里 `constructor` 是合法技术词）。
- 回归：`A-D1`、`A-C2`

### M2 ｜ 中 ｜ 页面无点击劫持与 CSP 防护

- 位置：`src/ui/http.ts` HTML 响应只设了 `Content-Type` / `no-store`
- 影响：任意站点可把 UI 套进 iframe 诱导点击（删除/彻底删除都有二次确认或 3 秒上膛，
  所以实际危害有限，但这类「本机管理界面」不该可被嵌套）。
- 修复：`X-Frame-Options: DENY` + `CSP frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  （UI 零外部资源，只需为行内事件/样式保留 `'unsafe-inline'`）+ `Referrer-Policy: no-referrer`。
- 回归：`A-U4`

### L1 ｜ 低 ｜ Host 回环校验被 URL 语法绕过

- 位置：`hostAllowed()` / `buildHttpRpcServer()` 都用 `host.split(":")[0]` 取主机名
- 载荷：`Host: 127.0.0.1:1@evil.example.com` → 被切出 `127.0.0.1` → 放行（实测 200，返回工具列表）
- 真实危害有限：浏览器发不出这种 Host，DNS rebinding 场景下 Host 只会是自己域名（已被拦）。
  但这道闸门的语义是「只有本机才能访问」，绕过方式不该存在。
- 修复：改用 `new URL("http://" + host).hostname`（URL 解析器会把 `user:pass@` 正确剥离，
  也天然处理 `[::1]:8777`）。
- 回归：`A-U1`

### L2 ｜ 低 ｜ 畸形百分号编码把客户端错误变成 500

- 位置：`/api/session/`、`/api/record/` 的 `decodeURIComponent`、`parseCookies` 的 `decodeURIComponent`
- 实测：`GET /api/session/%E0%A4%A` → 500（日志 `URI malformed`）；
  带 `Cookie: ns_token=%E0%A4%A` 的请求也可能整条 500。
- 修复：路径段解码失败 → 400；cookie 解码失败 → 退化成原值（比对必然失败 → 401）。
- 回归：`A-U2`

### L3 ｜ 低 ｜ 令牌引导接口的开放重定向

- 位置：`target = url.pathname + url.search`，`//evil.example.com` 是协议相对 URL
- 实测：`GET //evil.example.com/?token=<有效令牌>` → `302 Location: //evil.example.com/`
  （需要有效令牌，所以只是钓鱼链上的一环，不是接管）。
- 修复：目标路径强制归一化为单斜杠开头。
- 回归：`A-U3`

### L4 ｜ 低 ｜ `turn_no` 静默取整

- 位置：`upsertTurn` 里 `Math.floor(Number(rawTurn))`——`1.5` 悄悄变成第 1 轮，
  `true` 因 `Number(true) === 1` 也被当成第 1 轮，`"abc"` 变 `NaN` 后落到自动编号。
- 修复：入口处要求「数字或非空数字字符串 + `Number.isInteger`」，否则 `INVALID_ARG`。
- 回归：`A-C1`

## 三、被拦住的部分（防线现状）

| 面 | 攻击 | 结果 |
|---|---|---|
| DNS rebinding | `Host: evil.example.com` 打 UI / MCP | 403 |
| 鉴权 | 无凭证、前缀、超长、大小写变形 | 全 401 |
| CSRF | 伪造 Origin / `Origin: null` / 仅 `Sec-Fetch-Site: cross-site` / 表单 `text/plain` | 403 / 415 |
| 路径穿越 | `/api/record/..%2F..%2F`、静态资源 `../`、`%00`、`/api/session/..%2f` | 全 404 |
| 越权工具 | 调未注册的 `shell_exec`、编码穿越到 `/api` | `-32601` / 404 |
| 请求体 | 4.5MB（MCP）、2.5MB（UI） | 连接中断，服务存活、后续请求正常 |
| 解析器 | 1 万层嵌套 JSON | 正常返回，不崩 |
| 存储 | `session_id = ../../pwned` | 落进 `pwned-<hash>` 目录，不越界 |
| 存储 | 伪造记录文件 `id: "../../evil"` | 加载时被 `isSafeId` 丢弃 |
| 存储 | `__proto__` / `constructor` 字段键 | 无原型污染 |
| 存储 | 单字段 100KB | 截到 5 000 字符并标 `truncated` |
| 注入 | 上一轮内容超预算 / 泄漏 `raw_text` | 443 字符、不含 `raw_text` |
| 并发 | 6 个并发写同一轮次 | 落盘 1 个文件、内存 1 条，无半条 |
| 供应链 | 包注册与核心同名的 `memory_save` | 重名被拒，核心工具未被劫持 |

一处例外值得说明：把指令注入文本存进记忆后，它会原样出现在下一轮的注入块里
（`忽略之前的所有指令…`）。这是**记忆的本职**，不是本层的漏洞——内容可信度交给
`safety` 包（`suspect` 标签 + 低信任来源降权）+ 调用方 `source` 声明。报告里保留这条，
是为了记住边界在哪。

## 四、未修的两条（设计取舍，已记录不修）

### D2 ｜ 中 ｜ 会话目录无配额
120 次保存 = 120 个目录，每次保存都可能新建 `_meta.json`。一个 MCP 客户端用随机
`session_id` 就能持续堆目录。这与「一条记录一个 JSON、目录即真源」的架构同源，
加配额会动摇布局；建议后续做成 `northstar gc --sessions --empty --older-than 30d` 显式清理，
而不是在写路径上拒绝。

### E4 ｜ 中 ｜ `packsDir` 下的代码在启动时无条件执行
包目录本身就是代码执行边界：任何命令（连 `stats`）都会 `import` 目录下所有可加载的包，
没有签名、没有首次确认。这是包机制的既定设计（包=可执行扩展），但意味着
**别把 `~/.northstar/packs` 放进云盘同步目录或共享仓库**。修复方向（未做）：
首次加载要求 `pack trust <id>` 显式确认 + 记录清单哈希，改动即失效。

## 五、本轮没覆盖的

- 多用户/多租户：当前是单机单用户模型，没有账号体系，所以没测越权（不存在主体）。
- 浏览器侧真实点击劫持与 DNS rebinding 全链路：只验证了服务端闸门，没起 DNS/浏览器靶场。
- 依赖供应链：零运行时依赖，`node_modules` 里只有 typescript/@types（dev），未做 SBOM 审计。
- 加密与静态数据保护：设计上就是明文 JSON（本地优先、可编辑），不属攻击面但属隐私边界，
  文档里应继续明确写「记忆是明文」。
- 模糊测试：`fields`/`tags`/`covers` 只做了定向边界，没跑持续 fuzz。

## 六、复现方式

```bash
npm run build
npm run attack          # 36 条攻击用例，逐条打印 BLOCKED / OPEN
npm test                # 含 tests/attack.test.mjs（11 条回归）
npm run eval            # 确认修复没把检索质量打下去
```

每条 `OPEN` 用例都会打印载荷与判定依据；`attack/report.json` 存机器可读结果。

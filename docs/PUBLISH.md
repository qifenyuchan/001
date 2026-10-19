# 发布手册（GitHub + npm）

> 目标：把本地 `D:\北极星_turn_memory` 推到你的远程仓库，并发布到 npm。
> 以下命令在项目根目录执行（Git Bash / PowerShell 均可）。

---

## 0. 推送前必做：改掉占位身份

当前本地提交作者是 `Northstar <northstar@local>`，推到 GitHub 会显示错误的作者。

```bash
# 只改这个仓库（推荐）
git config user.name  "你的 GitHub 名字"
git config user.email "你的 GitHub 邮箱"

# 或全局改
git config --global user.name  "你的 GitHub 名字"
git config --global user.email "你的 GitHub 邮箱"
```

> 如果希望隐藏真实邮箱，用 GitHub 提供的 `12345678+username@users.noreply.github.com`。
> 已经产生的提交作者不会自动变；介意的话可以最后做一次 squash/重写（见第 7 节）。

## 1. 本地整理

```bash
cd "D:/北极星_turn_memory"
git status                 # 应该干净；有改动先 commit
git branch -M main         # 统一用 main（GitHub 默认）
```

## 2. 连接你的远程仓库

把 `<你的用户名>/<仓库名>` 换成实际值。

### 情况 A：远程是空仓库（只有页面，没有文件）

```bash
git remote add origin https://github.com/<用户名>/<仓库名>.git
git push -u origin main
```

### 情况 B：远程已有 README / LICENSE 等文件

先拉下来合并，避免 `non-fast-forward`：

```bash
git remote add origin https://github.com/<用户名>/<仓库名>.git
git fetch origin
git pull origin main --allow-unrelated-histories
# 若 README/LICENSE 冲突：保留本地版本（我们的更完整），解决后：
git add -A && git commit -m "merge remote README"
git push -u origin main
```

> 不确定远程是否为空：`git ls-remote origin`，没有任何输出就是空仓库。

## 3. 认证（HTTPS 密码已不可用）

**方式一：PAT（最简单）**
1. GitHub → Settings → Developer settings → Personal access tokens
2. 生成 token，勾选 `repo`（或 fine-grained 的 Contents: Read and write）
3. push 时用户名填 GitHub 用户名，密码填 token

**方式二：SSH（长期推荐）**

```bash
ssh-keygen -t ed25519 -C "你的邮箱"
# 把 ~/.ssh/id_ed25519.pub 内容加到 GitHub → Settings → SSH keys
ssh -T git@github.com          # 看到 Hi <user> 即成功
git remote set-url origin git@github.com:<用户名>/<仓库名>.git
```

## 4. 推送并确认 CI

```bash
git push -u origin main
```

打开 GitHub 仓库 → **Actions**，应看到 `CI` 在 Node 20/22 上跑 `npm ci && npm run build && npm test`。
首次失败常见原因：`package-lock.json` 没提交（本项目已提交）、Node 版本过低。

## 5. 打版本标签（可选但建议）

```bash
git tag -a v2.4.0 -m "northstar-memory v2.4.0"
git push origin v2.4.0
```

GitHub → Releases → Draft a new release → 选择 `v2.4.0` → 粘贴 CHANGELOG 对应段落。

## 6. 发布到 npm

```bash
npm login          # 浏览器/2FA
npm whoami         # 确认登录账号
npm publish --access public
```

发布前检查（本地已满足）：

```bash
npm pack --dry-run        # 46 files / 779KB，含 dist、ui、docs、LICENSE
npm view northstar-memory version   # 应报 404（未占用）
```

发布后验证：

```bash
npm view northstar-memory version
npx northstar-memory --data ./demo-data --no-ui < /dev/null
# 或直接：
npx northstar-memory --data ./demo-data
# 浏览器打开 http://127.0.0.1:8777
```

> 包名被占用时：改成 `@你的scope/northstar-memory`（`package.json` 的 `name` 与 README 命令同步改）。

## 7. 发布后 10 分钟清单

- [ ] 仓库 Description：`Local-first long-term memory for any MCP agent`
- [ ] Topics：`mcp` `ai-agent` `memory` `local-first` `claude` `cursor`
- [ ] About 勾选 Releases / Packages
- [ ] Issues 开启；Discussions 可选
- [ ] README 顶部加 npm 版本徽章（可选）
- [ ] 把仓库链接与 `npx` 命令发到首发社区

## 8. 常见错误

| 现象 | 原因 / 解决 |
|---|---|
| `Authentication failed` | 用了账号密码；改用 PAT 或 SSH |
| `non-fast-forward` | 远程已有提交；按第 2 节 B 先 pull 合并 |
| `refusing to merge unrelated histories` | 加 `--allow-unrelated-histories` |
| npm `403 ... Two-factor authentication or granular access token with bypass 2fa enabled is required` | npm 强制发布必须 2FA。二选一：开 2FA（验证器 App），或创建带 **Bypass 2FA** 的 Granular Access Token |
| 2FA 二维码扫不到 / 验证器说“QR 无效” | page 上是 **Security key / Passkey** 的二维码，不是 TOTP；点 Continue 用 Windows Hello，或改用手机系统 Passkey（不是验证器 App） |
| 验证器提示“验证码错误” | 手机时间不是自动同步；打开“自动设置时间”后重试 |
| 2FA 设置到一半想退出 | 直接关闭页面，未输入验证码前不会真正启用，不会锁号 |
| npm `403 Forbidden`（已登录） | 包名被占用或 token 只读；换 scope 或重新登录 |
| npm `EOTP` | 开了 2FA；发布时输入 6 位验证码，或 `npm publish --otp=123456` |
| CI 失败 `tsc not found` | `npm ci` 没装 devDependencies；确认不是 `--production` |
| 提交作者是 `northstar@local` | 第 0 节没改；重写最近提交或接受 |

### npm 403 的解法（2026 现状：Security key / WebAuthn）

npm 现在发布包要求 **2FA**。很多账号的 2FA 设置页**只提供 Security key（WebAuthn）**，没有“验证器 App”选项；
如果出现二维码且提示“用手机/平板”，那是**跨设备 Passkey**，不是 TOTP，验证器 App 扫了必然报无效。

**正确流程（Security key）**
1. 2FA 设置页选 **Security key** → Continue
2. 浏览器弹出 Windows Hello（PIN/指纹/人脸）或 Passkey 对话框：
   - 选“此 Windows 设备 / This device” → 验证 PIN 或指纹
   - 若只有“用手机或平板”二维码：用手机相机/系统 Passkey 扫描，**不要**用 Google Authenticator
3. 给密钥起名（如 `My PC`）→ 保存 10 个恢复码（丢了只能靠它们找回）
4. **必须在本机真实终端里发布**（PowerShell 窗口，不能是脚本/CI/Agent 管道）：

```powershell
cd "D:\北极星_turn_memory"
npm login --auth-type=web
npm publish --access public
```

`npm publish` 会打印：

```
Authenticate your account at: https://www.npmjs.com/auth/cli/...
Press ENTER to open in the browser...
```

按回车 → 浏览器点 **Use security key** → 验证 Windows Hello → 终端自动继续并发布。

> 关键：没有 TTY 的环境（CI、Agent、管道）会直接 `EOTP` 失败，因为 npm 无法弹浏览器。
> 如果登录页勾选 “Do not challenge npm publish from IP for the next 5 minutes”，5 分钟内连续发版可免再次验证。

**Granular token 兜底**：创建时勾 **Bypass 2FA**、权限 Read and write。
但注意 npm 自 2026-08 起收紧了 bypass 令牌对敏感操作的豁免，能否发布以实际结果为准；不行就回到 Security key。

**实在搞不定**：先跳过 npm。GitHub 已可用（Download ZIP 或 `git clone`），npm 只是把安装简化成 `npx`，不影响别人使用。

## 9. 回滚

- 代码：`git revert <commit>` 后 push
- 版本标签：`git tag -d v2.4.0 && git push origin :refs/tags/v2.4.0`
- npm：发布 72 小时内可 `npm unpublish northstar-memory@2.4.0`；之后只能发新版本（`npm deprecate` 标记）

---

## 最少命令版（空仓库 + HTTPS）

```bash
cd "D:/北极星_turn_memory"
git config user.name "你的名字"
git config user.email "你的邮箱"
git branch -M main
git remote add origin https://github.com/<用户名>/<仓库名>.git
git push -u origin main
git tag -a v2.4.0 -m "v2.4.0" && git push origin v2.4.0
npm login && npm publish --access public
```

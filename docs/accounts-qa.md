# 账户功能验证 · 2026-10-04

分支：`deploy/fullstack-diary`。使用 `frontend-design` skill，沿用现有夜蓝油画棒背景、暖黄纸本、楷体文字、蓝色文字与粉色天气。

## 自动化与构建

- Node.js 24.19.0：新增 6 项账户 API / 迁移测试，覆盖未登录拦截、用户隔离、注册与登录、唯一用户名、密码规则、退出及过期会话、账户修改及其他设备退出、Lin 空密码初始化与设置密码后的失效、旧数据库逐字段保留、HTTPS Cookie、来源校验及尝试频率限制。
- Linux 独立检查目录 `/tmp/treehole-auth-check.E6nvLb`：全部 38 项测试通过。数据库全部在测试临时目录内，未使用线上数据库。
- 本机生产构建及 `npm run test:sites` 通过；保留 `dist/client/index.html`、`dist/server/index.js` 和 `dist/.openai/hosting.json`。
- Windows 首次完整测试有两项因符号链接 EPERM 受限，另有一项在构建前缺少产物；在 Linux 与构建后分别完成验证，没有跳过失败断言。

## 真实浏览器

Codex 内置浏览器，本地前端 `http://127.0.0.1:4173` 和独立数据库 `data/auth-preview.sqlite`，不是线上记录。

- 注册页切换、密码确认不一致提示、注册成功自动进入空白私人日记本。
- 新账户写入并保存一篇独立本地验证日记，列表正确展示。
- 账户设置与返回日记本、退出后显示登录页。
- Lin 错误密码被拒绝，空密码按用户选择允许；Lin 不显示另一账户的测试日记。
- 桌面登录 / 账户设置完整纸页截图检查；390 × 844 窄屏账户表单检查，修复纸页继承定位造成的横向偏移，复核无横向溢出；恢复默认视口。
- 账户用户名和密码变更由 API 自动化验证，没有修改用户 Lin 的正式密码。

## 正式部署

- 2026-10-04 已更新 `https://treehole.ventsdenye.com`，运行版本 `/opt/treehole/releases/20261004-247a192`，应用提交 `247a192`。
- 一致在线备份副本先试迁移，再停服取得最终一致备份 `/var/lib/treehole/backups/pre-accounts-final-20261004-247a192.sqlite`；旧 release 保留。
- 正式迁移后只读核对：原有 **1 条**日记的 ID、日期、正文、天气模式、天气、创建时间、更新时间逐字段完全相等，全部属于 Lin；schema v2、完整性及外键检查正常。
- 原始字段指纹前后相同：`fddbbb7db508df1b3a877d4b111b248b658659a052240bf933f823c7939b30ba`。没有删除或改写旧日记。
- 正式 HTTPS API 检查通过：匿名读取 401、错误密码 401、Lin 空密码登录 200 并读取 1 条旧记录、HttpOnly / SameSite=Strict / Secure Cookie、退出后原会话被拒绝、新前端 CSS 可访问。
- 可信 Nginx 已覆盖 `X-Real-IP`，服务仅监听回环地址；启用 `TRUST_PROXY=1`，原环境文件保留为 `/etc/treehole.env.pre-accounts-247a192`。
- 正式浏览器刷新显示登录页，并以 Lin 空密码登录成功：显示「Lin 的日记本」、设置密码提醒和原有的 2026-10-03 日记。正式 Lin 密码保持为空；用户名、密码变更和注册隔离在独立测试数据库中验收，避免修改用户的正式数据。
- 最终登录页截图：`docs/design/auth-login-20261004.jpg`（本地）与 `docs/design/auth-live-login-20261004.jpg`（正式站点）。

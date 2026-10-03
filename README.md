# 星光树洞

根据参考插画制作的全栈心情日记网站。React 19 + Vite 前端、Node.js 24 HTTP API、SQLite 数据库。分层手绘素材、透视、鼠标视差和柔和黄光构成 2.5D 场景。

服务器部署见 [部署说明](docs/deploy.md)。分支：`deploy/fullstack-diary`；推荐 Docker Compose，数据库由独立数据卷持久保存。

## 本地开发

需要 Node.js 24.x 和 pnpm 11.19.0。

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev:server
# 另一个终端启动前端（/api 代理到本地 3000）
pnpm dev --host 127.0.0.1 --port 4173
```

```sh
pnpm build
pnpm test
```

生产运行：`pnpm build && pnpm start`，访问 `http://localhost:3000`。同一个服务提供 `dist/client` 静态资源及 `/api` 接口。日记功能需要这个后端，单独静态托管不能保存日记。原 Sites Worker 构建文件保留，但不提供新的 SQLite API。

## 使用

- 书本始终竖立，正面的书页保持可见。点击书本，女孩起身、走近；抵达后书页、投射光与星光由暗渐亮。亮起后短暂停留，约 6.8 秒后自动进入心情日记本。没有封面或书页开合动画。
- 三颗大星星可悬停点亮与放大，移开恢复；点击分别进入三个占位区域。
- 返回星光场景即可重播。浏览器前进、后退与页面刷新均支持。
- 支持 Tab / Enter，星星也可键盘聚焦点亮；系统减少动态偏好及「简化动效」会缩短过渡、停止视差和漂浮。
- 浏览器进入后台时暂停故事与图层动画，返回后继续。

## 心情日记

- 以摊开的双页本浏览日记，每页 5 条：蓝色日期、灰色摘要、粉色心情天气。支持按日期倒序分页。
- 右上角「添加日记」创建，点击具体条目编辑；日期可修改，每天一篇，最多 2000 字。未保存离开时会提醒，删除有二次确认。
- 根据文字的本地关键词规则自动推测晴天、晴间多云、多云、小雨或雷雨，也可手动选择。这是心情比喻，不调用外部 AI 或天气服务。
- 日记保存在服务器 SQLite 数据库，换浏览器或设备访问同一网站即可查看。当前没有登录与用户隔离，所有能访问网站的人共用同一本日记，并可新增、编辑和删除。
- 旧版 localStorage（`treehool.diary.v1`）有日记时显示「导入旧日记」；点击后原子导入，不覆盖服务器已有的不同内容，浏览器原件保留。浏览器只能读取当前地址的旧数据；迁移域名前应在旧地址完成导入。
- 等服务器确认后才显示保存成功；网络错误保留编辑内容。服务端检查日期、正文长度、天气，并用版本比较拒绝过期编辑，避免多窗口覆盖。首次使用为空白本，无预填日记。

## 页面与后续扩展

| 路由 | 内容 |
| --- | --- |
| `#/` | 互动插画 |
| `#/diary` | 心情日记双页列表 |
| `#/diary/new` | 新增日记 |
| `#/diary/entry/:id` | 编辑指定日记 |
| `#/stars/1`、`#/stars/2`、`#/stars/3` | 三个待定入口占位 |

- `src/components/StoryScene.jsx`：主场景与交互。
- `src/scene.css`：分层构图、视差和动画。
- `src/components/EnchantedBook.jsx`、`src/book.css`：竖立书页与柔和光晕。
- `src/bookLighting.js`：女孩靠近后的光线渐亮时序。
- `src/sceneConfig.js`：素材、路由、动画阶段配置。
- `src/hooks/useStory.js`：计时、重复触发保护与清理。
- `src/components/diary`、`src/diary.css`：日记列表、编辑页、天气图标和确认对话框。
- `src/diaryApi.js`：同源 API 客户端、请求超时和错误提示。
- `src/diaryModel.js`：共享验证和心情天气规则，保留旧版浏览器数据读取用于迁移。
- `server/`：HTTP 接口、SQLite 存储和生产静态资源服务。
- `Dockerfile`、`compose.yaml`、`docs/deploy.md`：部署、更新及备份恢复。
- `src/components/DestinationPage.jsx`：星星占位页。
- `public/art`：WebP 素材；场景仅预载当前使用的图层。
- `docs/design`：横屏概念、视觉约定、原始素材与 Image Gen 提示词。

图片由内置 Image Gen 基于用户参考图生成独立图层，保留油画棒风格；不需要外部图片服务、登录或 API Key。浏览器验证记录见 `design-qa.md`。

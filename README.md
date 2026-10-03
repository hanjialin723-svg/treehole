# 星光树洞

根据参考插画制作的电脑全屏互动前端。React 19 + Vite，分层手绘素材、透视、鼠标视差和柔和黄光构成 2.5D 场景。

## 本地开发

需要 Node.js 20.19+ 和 pnpm。

```sh
pnpm install
pnpm dev --host 127.0.0.1 --port 4173
```

```sh
pnpm build
pnpm test
```

构建产物在 `dist/client`，可作为静态网页托管。项目也保留了可选的 Sites Worker 构建支持；目前仅本地预览，没有发布到外网。

## 使用

- 点击书本，女孩起身、走向门口。书身固定，前封面沿书脊翻转，三张独立纸页依次展开；细书缝漏光逐渐变为宽光路，星光随之亮起。女孩抵达后停留约一秒，约 6.8 秒后自动进入心情日记本。
- 三颗大星星可悬停点亮与放大，移开恢复；点击分别进入三个占位区域。
- 返回星光场景即可重播。浏览器前进、后退与页面刷新均支持。
- 支持 Tab / Enter，星星也可键盘聚焦点亮；系统减少动态偏好及「简化动效」会缩短过渡、停止视差和漂浮。
- 浏览器进入后台时暂停故事与图层动画，返回后继续。

## 页面与后续扩展

| 路由 | 内容 |
| --- | --- |
| `#/` | 互动插画 |
| `#/diary` | 心情日记本入口占位，具体功能留待下一阶段 |
| `#/stars/1`、`#/stars/2`、`#/stars/3` | 三个待定入口占位 |

- `src/components/StoryScene.jsx`：主场景与交互。
- `src/scene.css`：分层构图、视差和动画。
- `src/components/EnchantedBook.jsx`、`src/book.css`：固定书身、双面封皮、纸页和厚度。
- `src/bookMotion.js`：书封、纸页与光线共用的动画时序。
- `src/sceneConfig.js`：素材、路由、动画阶段配置。
- `src/hooks/useStory.js`：计时、重复触发保护与清理。
- `src/components/DestinationPage.jsx`：日记本与星星占位页，可在后续替换为实际功能。
- `public/art`：浏览器使用的 WebP 素材，总体积约 2.5 MB。
- `docs/design`：横屏概念、视觉约定、原始素材与 Image Gen 提示词。

图片由内置 Image Gen 基于用户参考图生成独立图层，保留油画棒风格；不需要外部图片服务、登录、API Key 或后端。浏览器验证记录见 `design-qa.md`。

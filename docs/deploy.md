# 服务器部署

部署分支：`deploy/fullstack-diary`。前端和日记 API 由同一个 Node.js 24 服务提供，SQLite 保存在服务器磁盘中。无需单独安装数据库或配置跨域。

这一版没有登录：能够访问网站的人共用同一本日记，并能够查看、新增、修改和删除其中的内容。`PUBLIC_ORIGIN` 仅用于校验浏览器请求来源，不提供访问控制。

## Docker Compose 部署（推荐）

服务器需已安装 Docker Engine 和 Compose 插件，并能访问代码仓库、npm 和 Docker Hub。第一次拉取：

```bash
git clone --branch deploy/fullstack-diary https://github.com/hanjialin723-svg/treehole.git treehool
cd treehool
cp .env.example .env
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3000/api/health
```

已有仓库时，在工作区没有未提交修改的前提下运行：

```bash
git fetch origin
git switch deploy/fullstack-diary
git pull --ff-only origin deploy/fullstack-diary
docker compose up -d --build
```

浏览器打开 `http://服务器IP:3000`，进入书本或直接访问 `/#/diary`。如需外网访问，服务器防火墙需要允许对应端口。首次启动自动创建数据库。

`.env` 可调整：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `APP_PORT` | `3000` | Docker 映射到宿主机的端口 |
| `APP_BIND_ADDRESS` | `0.0.0.0` | 宿主机绑定地址；同机反向代理可改为 `127.0.0.1` |
| `PUBLIC_ORIGIN` | 空 | 公开网址的来源，例如 `https://diary.example.com`；无路径及尾部斜杠 |

容器内的 `HOST=0.0.0.0`、`PORT=3000`、`DATABASE_PATH=/app/data/diary.sqlite` 由 Compose 设置，无需修改。修改 `.env` 后重新运行 `docker compose up -d`。

镜像构建阶段安装固定版本的 pnpm 并按锁文件构建；运行阶段只包含 Node、后端和构建后的前端，以 `node` 用户运行。健康检查请求 `/api/health`，容器异常退出后自动重启。

## 域名与 HTTPS

如使用同一台服务器上的 Caddy，把 `.env` 改为：

```dotenv
APP_PORT=3000
APP_BIND_ADDRESS=127.0.0.1
PUBLIC_ORIGIN=https://diary.example.com
```

对应的 Caddyfile（域名替换为实际域名，DNS 指向服务器）：

```caddyfile
diary.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

也可使用已配置 HTTPS 证书的 Nginx，在站点的 `server` 块中设置：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

整个站点及 `/api/` 都代理给同一个服务。设置 `PUBLIC_ORIGIN` 后，通过其他网址访问时的写入会被拒绝，应始终使用配置的正式网址。

## 更新与数据持久化

在同一部署目录内更新：

```bash
git pull --ff-only origin deploy/fullstack-diary
docker compose up -d --build
docker compose ps
```

项目名固定为 `treehool`，数据库使用 `treehool_diary-data` 命名卷。重新构建镜像、重建容器和普通 `docker compose down` 都会保留该卷。**不要执行 `docker compose down -v` 或删除这个数据卷**，否则会删除日记。卷是持久化位置，仍需另外备份以应对服务器磁盘故障。[Docker 卷说明](https://docs.docker.com/engine/storage/volumes/)

只运行一个应用实例写入此数据库；此配置用于单台服务器。查看运行日志：

```bash
docker compose logs --tail=100 app
```

## 备份

脚本使用 SQLite 的备份 API，可以在网站运行中得到一致快照，包括已经写入 WAL 的内容。不要在运行时只复制 `diary.sqlite` 文件。[Node SQLite 备份 API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html#sqlitebackupsourcedb-path-options)

生成一个自动命名的备份，命令输出备份的完整路径：

```bash
docker compose exec app node scripts/backup-db.mjs
```

默认保存在同一卷的 `/app/data/backups/`。也可以指定一个尚不存在的文件名并复制到宿主机（再次备份时请换新文件名）：

```bash
docker compose exec app node scripts/backup-db.mjs /app/data/backups/manual-20261003.sqlite
mkdir -p backups
docker compose cp app:/app/data/backups/manual-20261003.sqlite ./backups/manual-20261003.sqlite
```

脚本拒绝覆盖已有文件或源数据库。把宿主机得到的备份再复制到另一台机器或独立备份存储；容器卷内的备份仍在同一块磁盘上。

## 从备份恢复

恢复会把当前日记替换为备份时的内容。先完成上述备份，再停止应用；将下面的 `manual-20261003.sqlite` 替换成已下载到 `./backups/` 的备份名。

```bash
docker compose stop app
docker compose run --rm --no-deps --user root \
  --cap-add CHOWN --cap-add DAC_OVERRIDE \
  --volume "$PWD/backups:/restore:ro" app \
  node --input-type=module -e '
    import { DatabaseSync } from "node:sqlite";
    import { constants, copyFileSync, existsSync, mkdirSync, renameSync, chownSync, chmodSync } from "node:fs";
    const source = "/restore/manual-20261003.sqlite";
    const candidate = new DatabaseSync(source, { readOnly: true });
    const check = candidate.prepare("PRAGMA quick_check").all();
    candidate.prepare("SELECT id, date, content, weatherMode, weather, createdAt, updatedAt FROM diaries LIMIT 0").all();
    candidate.close();
    if (check.length !== 1 || Object.values(check[0])[0] !== "ok") throw new Error("备份数据库检查失败");
    const archive = "/app/data/before-restore-" + Date.now();
    mkdirSync(archive, { mode: 0o700 });
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = "/app/data/diary.sqlite" + suffix;
      if (existsSync(file)) renameSync(file, archive + "/diary.sqlite" + suffix);
    }
    copyFileSync(source, "/app/data/diary.sqlite", constants.COPYFILE_EXCL);
    chownSync("/app/data/diary.sqlite", 1000, 1000);
    chmodSync("/app/data/diary.sqlite", 0o600);
    console.log("已恢复。原数据库保留在 " + archive);
  '
docker compose up -d app
curl --fail http://127.0.0.1:3000/api/health
```

恢复命令先验证备份可读且包含日记表，再把旧数据库及 WAL/SHM 文件移到卷内的 `before-restore-*` 目录。临时恢复容器使用 root，并仅为这次恢复添加 `CHOWN` 和 `DAC_OVERRIDE` 权限，以读取私有备份和将数据库归还给应用账号。正常应用仍以非 root 用户运行，并移除全部 Linux capabilities。若恢复命令失败，先检查错误并保留归档，不要删除卷。

## 不使用 Docker

安装 **Node.js 24.x** 和 **pnpm 11.19.0**，在项目目录执行：

```bash
npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile
pnpm build
cp .env.example .env
npm start
```

`npm start` 读取 `.env`。裸机使用 `HOST`、`PORT`、`DATABASE_PATH`、`PUBLIC_ORIGIN`；`APP_PORT` 和 `APP_BIND_ADDRESS` 仅用于 Compose。默认数据文件是项目目录下的 `data/diary.sqlite`。后端直接提供 `dist/client`，生产环境无需运行 Vite。

裸机备份：

```bash
node --env-file-if-exists=.env scripts/backup-db.mjs
```

### systemd 常驻服务

仓库提供 `deploy/treehool.service` 模板，假设代码在 `/opt/treehool`，Node 在 `/usr/bin/node`，服务账号为 `treehool`。部署前按实际位置修改 `WorkingDirectory` 和 `ExecStart`。把代码目录权限设为该账号可读取；数据目录由 systemd 创建在 `/var/lib/treehool`。

```bash
sudo useradd --system --home /var/lib/treehool --shell /usr/sbin/nologin treehool
sudo cp deploy/treehool.service /etc/systemd/system/treehool.service
sudo systemctl daemon-reload
sudo systemctl enable --now treehool
sudo systemctl status treehool
```

如账号已存在，跳过 `useradd`。模板默认绑定 `127.0.0.1:3000`，配合上方反向代理；若需修改公开网址，创建 `/etc/treehool.env`：

```dotenv
PUBLIC_ORIGIN=https://diary.example.com
```

systemd 不读取仓库 `.env`；它使用 service 文件及 `/etc/treehool.env`。如覆盖 `DATABASE_PATH`，请保持目录与服务的 `ReadWritePaths` 一致。环境修改后重启服务。

更新时以代码目录所有者执行 `git pull --ff-only origin deploy/fullstack-diary`、`pnpm install --frozen-lockfile`、`pnpm build`，成功后执行 `sudo systemctl restart treehool`。数据库位于代码目录外，不会随构建替换。

## 本次验证范围

已在独立目录按锁文件全新安装依赖并完成生产构建，32 项自动化测试通过。浏览器实际验证了新增、编辑、手动天气、跨窗口读取、并发冲突、断线保留草稿、后端重启后的记录保留和删除；桌面与窄屏布局正常。测试日记已清理，数据库文件不进入 Git。

开发环境没有 Docker 命令，因此未在本机实际构建或启动容器。后端与备份脚本通过 Node.js 24 的自动化测试；Compose YAML 已解析检查。另用与 Docker 运行阶段相同的精简文件集（不含 `node_modules`）启动服务，验证了健康接口与前端网页正常响应。首次在服务器部署时，以 `docker compose ps` 的健康状态及 `/api/health` 响应确认容器环境。

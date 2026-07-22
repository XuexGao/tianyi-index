# TianYi-Index — 双云盘文件索引

把你的**天翼云盘 + OneDrive** 同时挂载到一个可分享的文件站点。基于 Next.js 构建，天翼云后端走 cloud.189.cn API，OneDrive 后端走 Microsoft Graph API，两个网盘的文件出现在同一个网站的不同路径下。支持图片/视频/音频/PDF/Office/Markdown/EPUB/代码等多格式在线预览，多选打包下载，私密目录密码保护，8 种语言切换，配合 Vercel + Upstash Redis 实现零服务器部署。

## 功能

- 📁 同时挂载天翼云 + OneDrive 两个网盘
- 🔀 天翼云默认在根目录 `/`，OneDrive 默认在 `/OneDrive`（均可通过环境变量配置）
- 🖼️ 文件预览：图片、视频、音频、PDF、Office、Markdown、EPUB、代码等
- ⬇️ 文件下载（单选/多选打包/ZIP 递归下载）
- 🌐 多语言（中文/English/日本語 等 8 种语言）
- 🌗 毛玻璃主题 + 随机壁纸
- 🔐 天翼云环境变量自动登录，OneDrive OAuth 2.0 refresh token
- 🔒 私密目录密码保护（两个网盘各自独立配置，在对应目录放 `.password` 文件）
- 🌐 WebDAV 只读挂载：通过 Cloudflare Worker 独立子域名访问双云盘绝对根目录

## 部署到 Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FXuexGao%2Ftianyi-index)

### 环境变量

在 Vercel 项目设置 → Environment Variables 中配置以下变量。

#### 天翼云（必填）

| 变量 | 说明 |
|------|------|
| `TIANYI_USERNAME` | 天翼云账号（手机号/邮箱） |
| `TIANYI_PASSWORD` | 天翼云密码 |
| `REDIS_URL` | Upstash Redis 连接字符串，必须使用 `rediss://`（双 s，TLS）格式，例如 `rediss://default:<密码>@<区域>.upstash.io:6379`。注意不是 Upstash 的 REST URL（`https://...`） |

#### 安全配置（必填）

| 变量 | 说明 |
|------|------|
| `ADMIN_PASSWORD` | 管理员后台登录密码，用于访问 `/@manage` 管理后台（私密目录管理、清缓存等）。生成建议：`openssl rand -base64 24` |
| `CRYPTO_SECRET` | OneDrive 凭据加解密密钥，启用 OneDrive 时必须配置。服务端首次解密 `CLIENT_SECRET` / OAuth token 时若未配置会抛错（不再回退公开密钥）。生成建议：`openssl rand -hex 32` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST API 地址（如 `https://xxx.upstash.io`），用于 middleware 在 Edge Runtime 中真校验 admin session。Vercel 集成 Upstash 时自动注入，无需手动填写。未配置时 middleware 仅做 cookie 存在性检查 |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST API 访问 token，与 `UPSTASH_REDIS_REST_URL` 配套。Vercel 集成 Upstash 时自动注入 |
| `WEBDAV_WORKER_SECRET` | WebDAV Cloudflare Worker 回源签名密钥，仅 Worker 和 Vercel API 之间使用。生成建议：`openssl rand -base64 48` |

#### OneDrive（可选，不配置则只使用天翼云）

| 变量 | 说明 |
|------|------|
| `CLIENT_ID` | Microsoft OAuth 客户端 ID，在 Azure Portal → App registrations 注册应用获取 |
| `CLIENT_SECRET` | Microsoft OAuth 客户端密钥，需先用 `CRYPTO_SECRET` 加密后填入（见下方说明） |
| `USER_PRINCIPAL_NAME` | Microsoft 账户邮箱，用于 OAuth 身份校验 |
| `BASE_DIRECTORY` | OneDrive 远端根目录，默认 `/`。设为 `/Photos/Blog` 则只挂载该子目录 |

配置 OneDrive 后，访问 `/onedrive-index-oauth/step-1` 完成 OAuth 三步授权流程，将 refresh token 存入 Redis。

#### 可选

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DEFAULT_FOLDER_ID` | `-11` | 天翼云默认浏览的文件夹 ID，`-11` 为根目录 |
| `KV_PREFIX` | （空） | Redis 键前缀，多项目共用同一 Redis 时用于隔离 |
| `TIANYI_UA` | （空） | 天翼云请求 User-Agent。留空则从内置 UA 池（6 条主流浏览器 UA）随机轮换，1 小时缓存一次。排查风控问题时可固定一个 UA |
| `NEXT_PUBLIC_SITE_TITLE` | `TianYi-Index` | 网站标题，显示在左上角和浏览器标签 |
| `NEXT_PUBLIC_TIANYI_MOUNT_PATH` | `/` | 天翼云挂载路径。设为 `/Tianyi` 则天翼云文件出现在 `/Tianyi` 下 |
| `NEXT_PUBLIC_ONEDRIVE_MOUNT_PATH` | `/OneDrive` | OneDrive 挂载路径。天翼云根目录会自动出现 OneDrive 文件夹入口。设为空则禁用 OneDrive |
| `NEXT_PUBLIC_PROTECTED_ROUTES` | `/其他文件/文件传输` | 天翼云受密码保护的目录路径，多个用逗号分隔。需在天翼云对应目录下放 `.password` 文件 |
| `NEXT_PUBLIC_PROTECTED_ROUTES_OD` | （空） | OneDrive 受密码保护的目录路径（相对于 `BASE_DIRECTORY`），多个用逗号分隔 |
| `NEXT_PUBLIC_EMAIL` | （空） | 联系邮箱，显示在导航栏，格式 `you@example.com` |
| `NEXT_PUBLIC_UMAMI_BASE_URL` | （空） | Umami 统计服务地址，例如 `https://umami.example.com`。三个 Umami 变量需同时配置才生效 |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | （空） | Umami 网站 ID |
| `NEXT_PUBLIC_UMAMI_SHARE_ID` | （空） | Umami 分享 ID，用于读取公开统计接口 |
| `SITE_URL` | （空） | 站点可信域名，例如 `https://your-domain.com`。用于 RSS/sitemap 生成绝对 URL，避免 Host 头注入。未配置时回退到请求的 Host 头 |
| `NEXT_PUBLIC_PDF_VIEWER_URL` | `https://mozilla.github.io/pdf.js/web/viewer.html` | PDF 在线预览器地址。如需自托管或换源可修改此变量 |
| `WALLPAPER_UPSTREAM` | `https://api.elaina.cat/random/` | 随机壁纸上游图源地址 |

### 本地开发

```bash
cp .env.example .env
# 编辑 .env 填入真实凭据
pnpm install
pnpm run dev
```

### WebDAV 使用说明

WebDAV 已通过独立 Cloudflare Worker 子域名提供，只读访问双云盘的**绝对根目录**。

WebDAV 客户端配置：

| 项目 | 值 |
|------|----|
| 地址 | `https://dav.example.com/` |
| 用户名 | `admin` |
| 密码 | 网站管理员登录密码（即 `/@login` 使用的 `ADMIN_PASSWORD`） |

挂载后根目录会显示两个文件夹：

| 文件夹 | 对应远端目录 |
|--------|--------------|
| `天翼云盘` | 天翼云盘绝对根目录（固定 `-11`，不受 `DEFAULT_FOLDER_ID` 影响） |
| `OneDrive` | OneDrive 绝对根目录（不受 `BASE_DIRECTORY` 影响） |

实现方式：

- `workers/webdav` 中的 Cloudflare Worker 负责接收 WebDAV 客户端请求和 Basic Auth。
- Worker 调用现有 `/api/auth/login/` 校验管理员密码，避免在 Worker 中保存管理员密码副本。
- Worker 使用 `WEBDAV_WORKER_SECRET` 对回源请求做短时 HMAC 签名，Vercel 的 `/api/dav/[[...path]]` 只信任该签名或直接 Basic Auth。
- Worker 路由绑定为 `dav.example.com/*`，因此主站 `pan.example.com` 可以保持 DNS-only 灰云直连 Vercel，不影响正常网页访问。

部署/更新 Worker：

```bash
npx wrangler deploy --config workers/webdav/wrangler.jsonc
```

Cloudflare DNS 需要有：

| 类型 | 名称 | 目标 | 代理状态 |
|------|------|------|----------|
| `CNAME` | `dav` | `tianyi-webdav.example.workers.dev` | Proxied（橙云） |

当前 WebDAV 仅支持目录浏览和文件下载（`PROPFIND` / `GET` / `HEAD` / `OPTIONS`），不支持上传、删除、移动等写操作。

### OneDrive OAuth 授权流程

1. 在 [Azure Portal](https://portal.azure.com/) → App registrations 注册一个应用
2. 配置 Redirect URI 为 `http://localhost`（与 `config/api.config.js` 中 `redirectUri` 一致）
3. 获取 `CLIENT_ID` 和 `CLIENT_SECRET`
4. 用 `CRYPTO_SECRET` 作为密钥加密 `CLIENT_SECRET`（可使用项目内的 `obfuscateToken` 函数或在线 AES 加密工具），把加密产物填入 `CLIENT_SECRET` 变量
5. 填入 `USER_PRINCIPAL_NAME`（你的 Microsoft 账户邮箱）
6. 部署后访问 `/onedrive-index-oauth/step-1`，按页面提示完成三步授权
7. 授权成功后 refresh token 会自动存入 Redis，OneDrive 即可正常使用

### 私密目录使用说明

**天翼云侧：**
1. 通过环境变量 `NEXT_PUBLIC_PROTECTED_ROUTES` 配置路径（多个用逗号分隔）
2. 在天翼云网盘对应目录下上传一个名为 `.password` 的文件，文件内容即为访问密码

**OneDrive 侧：**
1. 通过环境变量 `NEXT_PUBLIC_PROTECTED_ROUTES_OD` 配置路径（相对于 `BASE_DIRECTORY`，多个用逗号分隔）
2. 在 OneDrive 对应目录下上传一个名为 `.password` 的文件，文件内容即为访问密码

两个网盘的私密目录互不影响，各自独立管理。

## 技术栈

- **框架**: Next.js 13 + TypeScript
- **样式**: Tailwind CSS + 毛玻璃效果
- **后端**: Next.js API Routes → 天翼云 API + Microsoft Graph API
- **存储**: Redis (Upstash) — 天翼云会话 Cookie + OneDrive OAuth Token
- **部署**: Vercel (Serverless)

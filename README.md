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
| `NEXT_PUBLIC_PROTECTED_ROUTES` | （空） | 天翼云受密码保护的目录路径，多个用逗号分隔。需在天翼云对应目录下放 `.password` 文件 |
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

> 原理：OneDrive 走 Microsoft OAuth 2.0 **授权码模式**。站点后端用存在 Redis 里的 `refresh_token` 自动换取 `access_token` 调用 Microsoft Graph API，token 过期会自动续期，**无需你手动干预**。以下流程只需要在你**首次部署后执行一次**，把 refresh token 写入 Redis；之后所有授权数据都在服务端处理，token 不会经过浏览器。

#### 第 0 步：确认前置条件

- `REDIS_URL` 已配置（Upstash，`rediss://` 格式）—— refresh token 存放在这里
- `CRYPTO_SECRET` 已配置—— 用于加密 `CLIENT_SECRET` 与 token（见下方安全配置表）

#### 第 1 步：在 Azure Portal 注册应用（一次性）

1. 打开 [Azure Portal](https://portal.azure.com/) → 搜索并进入 **App registrations** → 点 **New registration**
2. 填写注册信息：
   - **Name**：任意，例如 `TianYi-Index OneDrive`
   - **Supported account types**：选择 **Accounts in any organizational directory and personal Microsoft accounts**（个人 OneDrive 必须选含 personal 的选项；代码里走 `common` 租户）
   - **Redirect URI**：平台选 **Web**，URI 填 **`http://localhost`**（必须与 `config/api.config.js` 中 `redirectUri` 完全一致，不要改动）
3. 点 **Register** 后进入应用 Overview 页，复制 **Application (client) ID** —— 这就是 `CLIENT_ID`
4. 左侧菜单 **Certificates & secrets** → **New client secret**：
   - Description 随意，Expires 建议选最长的有效期
   - 创建后**立即复制 Value**（页面刷新后不再显示）—— 这就是明文 `CLIENT_SECRET`
5. （可选但推荐）左侧 **API permissions** → **Add a permission** → Microsoft Graph → Delegated permissions → 添加 `Files.Read.All`。运行时会请求 `user.read files.read.all offline_access` 三个权限，个人账户在授权页同意后自动生效

#### 第 2 步：加密 CLIENT_SECRET

服务端用 `CRYPTO_SECRET` 作为 AES 密钥解密 `CLIENT_SECRET`，所以必须**先用 `CRYPTO_SECRET` 加密真实密钥**，再填入环境变量（直接填明文会解密失败）。在项目根目录执行：

```bash
node -e "const CryptoJS = require('crypto-js'); console.log(CryptoJS.AES.encrypt('你的真实CLIENT_SECRET', '你的CRYPTO_SECRET').toString())"
```

把输出的密文填入 `CLIENT_SECRET` 环境变量。

#### 第 3 步：配置环境变量（Vercel）并重新部署

| 变量 | 说明 |
|------|------|
| `CLIENT_ID` | Azure 应用的 Application (client) ID |
| `CLIENT_SECRET` | 用 `CRYPTO_SECRET` 加密后的密文（不是明文） |
| `USER_PRINCIPAL_NAME` | 你的 Microsoft 账户邮箱（登录 OneDrive 用的那个） |
| `BASE_DIRECTORY` | 默认 `/`；只想挂载子目录时改为 `/Photos/Blog` 之类的路径 |

#### 第 4 步：访问授权页面，完成三步授权

部署完成后访问 `https://<你的域名>/onedrive-index-oauth/step-1`：

1. **step-1（准备）**：页面展示当前配置的 `CLIENT_ID`、`REDIRECT_URI`、scope 等信息供核对，点 **Proceed to OAuth** 进入下一步
2. **step-2（获取授权码）**：
   - 点击页面上的 OAuth 链接，新标签页打开 Microsoft 登录页
   - 用你的 Microsoft 账户登录并点击同意授权
   - 浏览器随后跳转到 `http://localhost/?code=M.R3_BAY...` —— localhost 打不开是**正常现象**，只需把**地址栏里的整条 URL 复制**下来
   - 回到 step-2 页面，把整条 URL 粘贴进输入框，页面会自动提取出 `code`，显示绿色提示后点 **Get tokens**
3. **step-3（换取并存储 token）**：服务端用授权码向 Microsoft 换取 `access_token` + `refresh_token`，然后调用 Graph API（`/v1.0/me`）校验登录账户是否与 `USER_PRINCIPAL_NAME` 一致——不一致会拒绝存储，防止授权到了错误的账号。校验通过后 token 直接写入 Redis，**不经过浏览器**。页面显示成功，2 秒后自动跳回首页

#### 第 5 步：验证

刷新首页或访问 `/OneDrive`，能看到文件列表即表示授权成功。此后 `access_token` 过期时，后端会用 `refresh_token` 自动续期（含跨 serverless 实例的互斥刷新锁，避免 token 轮换竞态），无需再手动授权。

#### 常见问题

| 问题 | 原因与解决 |
|------|-----------|
| step-3 报错 `Do not pretend to be the site owner` | 授权登录的账户与 `USER_PRINCIPAL_NAME` 不一致，检查是否登录了正确的 Microsoft 账户 |
| 报错 `CRYPTO_SECRET 环境变量未配置` | 检查 `CRYPTO_SECRET` 是否已设置，且 `CLIENT_SECRET` 是用同一个密钥加密的 |
| step-2 粘贴 URL 后 code 为空 | 复制的必须是完整 URL（含 `?code=...`），且以 `http://localhost` 开头 |
| 想重新授权 | 已有有效 token 时访问 step-1/2/3 会直接跳回首页。需要重走流程时，先清空 Redis 中 OneDrive 的 access/refresh token，再访问 `/onedrive-index-oauth/step-1` |

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

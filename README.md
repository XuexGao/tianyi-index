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

#### OneDrive（可选，不配置则只使用天翼云）

| 变量 | 说明 |
|------|------|
| `CLIENT_ID` | Microsoft OAuth 客户端 ID，在 Azure Portal → App registrations 注册应用获取 |
| `CLIENT_SECRET` | Microsoft OAuth 客户端密钥，需先加密后填入（见下方说明） |
| `USER_PRINCIPAL_NAME` | Microsoft 账户邮箱，用于 OAuth 身份校验 |
| `BASE_DIRECTORY` | OneDrive 远端根目录，默认 `/`。设为 `/Photos/Blog` 则只挂载该子目录 |

配置 OneDrive 后，访问 `/onedrive-index-oauth/step-1` 完成 OAuth 三步授权流程，将 refresh token 存入 Redis。

#### 可选

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DEFAULT_FOLDER_ID` | `-11` | 天翼云默认浏览的文件夹 ID，`-11` 为根目录 |
| `KV_PREFIX` | （空） | Redis 键前缀，多项目共用同一 Redis 时用于隔离 |
| `NEXT_PUBLIC_SITE_TITLE` | `TianYi-Index` | 网站标题，显示在左上角和浏览器标签 |
| `NEXT_PUBLIC_TIANYI_MOUNT_PATH` | `/` | 天翼云挂载路径。设为 `/Tianyi` 则天翼云文件出现在 `/Tianyi` 下 |
| `NEXT_PUBLIC_ONEDRIVE_MOUNT_PATH` | `/OneDrive` | OneDrive 挂载路径。天翼云根目录会自动出现 OneDrive 文件夹入口。设为空则禁用 OneDrive |
| `NEXT_PUBLIC_PROTECTED_ROUTES` | `/其他文件/文件传输` | 天翼云受密码保护的目录路径，多个用逗号分隔。需在天翼云对应目录下放 `.password` 文件 |
| `NEXT_PUBLIC_PROTECTED_ROUTES_OD` | （空） | OneDrive 受密码保护的目录路径（相对于 `BASE_DIRECTORY`），多个用逗号分隔 |
| `NEXT_PUBLIC_EMAIL` | （空） | 联系邮箱，显示在导航栏，格式 `you@example.com` |

> **访问统计**：内置基于 Redis 的今日 / 累计访问量统计，复用 `REDIS_URL`，无需额外配置。存储 key 为 `stats:total`（累计）和 `stats:today:YYYY-MM-DD`（当日，次日凌晨自动过期）。底部毛玻璃胶囊条会在每次会话首次进入网站时 +1。

### 本地开发

```bash
cp .env.example .env
# 编辑 .env 填入真实凭据
npm install --legacy-peer-deps
npm run dev
```

### OneDrive OAuth 授权流程

1. 在 [Azure Portal](https://portal.azure.com/) → App registrations 注册一个应用
2. 配置 Redirect URI 为 `http://localhost`（与 `config/api.config.js` 中 `redirectUri` 一致）
3. 获取 `CLIENT_ID` 和 `CLIENT_SECRET`
4. 把 `CLIENT_SECRET` [在线加密](https://onedrive-vercel-index.spencerwoo.com/docs/advanced#modify-configs-in-apiconfigjs)，原始文本填入自己的secret就可以了，最后把产物填入变量
4. 填入 `USER_PRINCIPAL_NAME`（你的 Microsoft 账户邮箱）
5. 部署后访问 `/onedrive-index-oauth/step-1`，按页面提示完成三步授权
6. 授权成功后 refresh token 会自动存入 Redis，OneDrive 即可正常使用

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

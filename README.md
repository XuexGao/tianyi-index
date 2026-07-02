# TianYi-Index — 天翼云文件索引

基于 Next.js 的天翼云网盘文件浏览器。使用 OneDrive-Index 的毛玻璃 UI，后端替换为天翼云 API。

## 功能

- 📁 浏览天翼云网盘文件（目录树导航）
- 🖼️ 文件预览：图片、视频、音频、PDF、Office、Markdown、EPUB、代码等
- ⬇️ 文件下载（单选/多选打包/ZIP 递归下载）
- 🌐 多语言（中文/English/日本語 等 8 种语言）
- 🌗 毛玻璃主题 + 随机壁纸
- 🔐 环境变量自动登录
- 🔒 私密目录密码保护（在对应目录放 `.password` 文件）

## 部署到 Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FXuexGao%2Ftianyi-index)

### 环境变量

在 Vercel 项目设置 → Environment Variables 中配置以下变量。

#### 必填

| 变量 | 说明 |
|------|------|
| `TIANYI_USERNAME` | 天翼云账号（手机号/邮箱） |
| `TIANYI_PASSWORD` | 天翼云密码 |
| `REDIS_URL` | Upstash Redis 连接字符串，必须使用 `rediss://`（双 s，TLS）格式，例如 `rediss://default:<密码>@<区域>.upstash.io:6379`。注意不是 Upstash 的 REST URL（`https://...`） |

#### 可选

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DEFAULT_FOLDER_ID` | `-11` | 默认浏览的文件夹 ID，`-11` 为根目录 |
| `KV_PREFIX` | （空） | Redis 键前缀，多项目共用同一 Redis 时用于隔离 |
| `NEXT_PUBLIC_SITE_TITLE` | `TianYi-Index` | 网站标题，显示在左上角和浏览器标签 |
| `NEXT_PUBLIC_PROTECTED_ROUTES` | `/其他文件/文件传输` | 受密码保护的目录路径，多个用逗号分隔。需在天翼云对应目录下放 `.password` 文件，文件内容为访问密码 |
| `NEXT_PUBLIC_EMAIL` | （空） | 联系邮箱，显示在导航栏，格式 `you@example.com` |
| `NEXT_PUBLIC_UMAMI_BASE_URL` | （空） | Umami 统计服务地址，例如 `https://umami.example.com`。三个 Umami 变量需同时配置才生效 |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | （空） | Umami 网站 ID |
| `NEXT_PUBLIC_UMAMI_SHARE_ID` | （空） | Umami 分享 ID，用于读取公开统计接口 |

### 本地开发

```bash
cp .env.example .env
# 编辑 .env 填入真实凭据
npm install --legacy-peer-deps
npm run dev
```

### 私密目录使用说明

1. 在 `config/site.config.js` 的 `protectedRoutes` 中配置路径，或通过环境变量 `NEXT_PUBLIC_PROTECTED_ROUTES` 覆盖
2. 在天翼云网盘对应目录下上传一个名为 `.password` 的文件，文件内容即为访问密码
3. 用户访问该目录时会要求输入密码

## 技术栈

- **框架**: Next.js 13 + TypeScript
- **样式**: Tailwind CSS + 毛玻璃效果
- **后端**: Next.js API Routes → 天翼云 API
- **存储**: Redis (Upstash) — 会话 Cookie 持久化
- **部署**: Vercel (Serverless)

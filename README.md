# TianYi-Index — 天翼云文件索引

基于 Next.js 的天翼云网盘文件浏览器。使用 OneDrive-Index 的毛玻璃 UI，后端替换为天翼云 API。

## 功能

- 📁 浏览天翼云网盘文件（目录树导航）
- 🖼️ 文件预览：图片、视频、音频、PDF、Office、Markdown、EPUB、代码等
- ⬇️ 文件下载（单选/多选打包/ZIP 递归下载）
- 🌐 多语言（中文/English/日本語 等 8 种语言）
- 🌗 毛玻璃主题 + 随机壁纸
- 🔐 环境变量自动登录

## 部署到 Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FXuexGao%2Ftianyi-index)

### 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `TIANYI_USERNAME` | ✅ | 天翼云账号（手机号/邮箱） |
| `TIANYI_PASSWORD` | ✅ | 天翼云密码 |
| `REDIS_URL` | ✅ | Upstash Redis 连接字符串 |
| `DEFAULT_FOLDER_ID` | ❌ | 默认文件夹 ID，默认 `-11`（根目录） |
| `KV_PREFIX` | ❌ | Redis 键前缀 |
| `NEXT_PUBLIC_SITE_TITLE` | ❌ | 网站标题 |

### 本地开发

```bash
cp .env.example .env
# 编辑 .env 填入真实凭据
npm install --legacy-peer-deps
npm run dev
```

## 技术栈

- **框架**: Next.js 13 + TypeScript
- **样式**: Tailwind CSS + 毛玻璃效果
- **后端**: Next.js API Routes → 天翼云 API
- **存储**: Redis (Upstash) — 会话 Cookie 持久化
- **部署**: Vercel (Serverless)

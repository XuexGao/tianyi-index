# 新增网盘挂载指南

本文档说明如何为 tianyi-index 挂载一个新的云盘（如 Google Drive、Dropbox、阿里云盘等）。
当前架构支持双云盘（天翼云 `ty` + OneDrive `od`），以下步骤同样适用于第三个、第四个网盘。

## 架构总览

```
浏览器 URL
   │  (driveResolver.ts 解析挂载点)
   ▼
/api/{drive}/*          ← 每个云盘一组 API 路由（目录列表 / 下载 / 搜索 / 缩略图）
   │
   ▼
WebDAV (/dav/*)         ← driveRegistry.ts 注册表 + /api/dav 各 drive 分支
```

前端通过 `driveResolver.ts` 把 URL 路径映射到 `{ drive, apiBase, relPath }`；
后端每个云盘一组独立的 API 路由，互不耦合。

## 新增网盘步骤（以 Google Drive 为例）

### 1. 后端 API 路由组

复制 `src/pages/api/od/` 的结构，新建 `src/pages/api/gd/`：

| 文件 | 职责 |
|---|---|
| `index.ts` | 目录列表 / 文件元数据（对齐现有 `od/index.ts` 的响应结构：`{ folder: { value: [...] } }` 或 `{ file: {...} }`） |
| `raw.ts` | 文件下载（重定向到真实下载 URL，或小文件代理） |
| `search.ts` | 搜索（需过滤受保护目录结果） |
| `thumbnail.ts` | 缩略图（可选） |
| `config.ts` | 前端 OAuth 配置（可选） |

**响应结构必须与现有 API 对齐**，前端组件（FileListing、预览组件）按统一结构渲染。

### 2. 注册到 WebDAV 注册表

编辑 `src/utils/driveRegistry.ts`：

```ts
export const DAV_DRIVES = [
  { name: '天翼云盘', id: 'ty' },
  { name: 'OneDrive', id: 'od' },
  { name: 'GoogleDrive', id: 'gd' },   // ← 新增
] as const
```

WebDAV 虚拟根目录入口、路径解析自动生效。然后在
`src/pages/api/dav/[[...path]].ts` 的 `handlePropfind` / `handleGet` 中
按 `davPath.drive === 'gd'` 实现目录列举与文件下载（可参考 `ty` 分支，
使用统一的 `resolveTianyiPath` 模式或对应云盘 SDK）。

### 3. 挂载路径配置

编辑 `config/site.config.js`，新增：

```js
// Google Drive 挂载路径（空字符串则不启用）
googledriveMountPath: normalizeMountPath(process.env.NEXT_PUBLIC_GOOGLEDRIVE_MOUNT_PATH || '/GoogleDrive'),
```

### 4. 前端驱动解析

编辑 `src/utils/driveResolver.ts`：

- `DriveType` 增加 `'gd'`
- `DriveResolution.apiBase` 增加 `'/api/gd'`
- 在 `resolveDrive()` 中增加挂载点匹配（参考 OneDrive 分支，注意
  **必须按 component-by-component 比较**，避免 `/Go` 误匹配 `/GoogleDrive`）
- 管理员虚拟路径（`/Admin`）增加对应入口文件夹

### 5. 前端受保护目录

- 环境变量 `NEXT_PUBLIC_PROTECTED_ROUTES_GD`（逗号分隔，路径相对于新网盘根目录）
- `src/utils/protectedRouteHandler.ts` 的 `normalizeDrive` / `matchProtectedRoute`
  增加 `'gd'` 分支（参考 `'od'` 分支，localStorage key 加前缀防冲突）
- 后端 API 受保护路由鉴权：参考 `od/index.ts` 的 `checkAuthRoute`（下载 `.password`
  文件比对哈希）或 `ty` 的 `checkProtectedRoute`，二选一保持一致

### 6. 环境变量与文档

- `.env.example` 增加新网盘的配置项（账号/OAuth/挂载路径/私密目录）
- 本文档的"架构总览"可同步更新

## 注意事项

- **统一响应结构**：所有网盘的 API 路由必须返回同构的 `{ folder | file }` 结构，
  前端才能零改动渲染；
- **受保护目录**：新网盘的搜索接口必须过滤受保护目录（参考 `od/search.ts`），
  防止搜索绕过目录密码泄露文件元数据；
- **路径安全**：所有用户输入路径必须 `pathPosix.normalize + resolve` 后再使用，
  防止 `../` 穿越；
- **错误处理**：不向客户端透传上游错误详情，统一返回结构化 JSON 错误；
- **限流**：涉及凭证校验的接口（登录、WebDAV、签名令牌）必须接入 Redis 限流。
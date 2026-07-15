import { posix as pathPosix } from 'path'

import type { NextApiRequest, NextApiResponse } from 'next'

import apiConfig from '../../../../config/api.config'
import { cloud189Login } from '../../../utils/tianyiAuth'
import { getFiles } from '../../../utils/tianyiClient'
import { getTianyiSession, saveTianyiSession } from '../../../utils/tianyiSessionStore'
import { checkProtectedRoute } from '../../../utils/protectedRouteChecker'
import { isAdminReq } from '../auth/check'

const DEFAULT_USER_ID = 'default_user'

function getEnvUsername(): string { return process.env.TIANYI_USERNAME || '' }
function getEnvPassword(): string { return process.env.TIANYI_PASSWORD || '' }
function getDefaultFolderId(): string { return process.env.DEFAULT_FOLDER_ID || '-11' }

/**
 * 获取或创建天翼云会话
 * 注意：所有可能抛错的调用都已包裹 try/catch，避免错误冒泡到 Next.js 顶层
 * 导致整个 API 返回 HTML 500 页面（而非可读的 JSON 错误）。
 *
 * @returns session 成功时返回会话；失败返回 { error } 携带真实失败原因
 *          （验证码 / 密码错 / 网络错等），便于排查而非笼统的 "No access token"
 */
async function getOrCreateSession(): Promise<
  | { cookies: Record<string, string>; username: string; password: string }
  | { error: string }
> {
  const U = process.env.TIANYI_USERNAME || ''
  const P = process.env.TIANYI_PASSWORD || ''

  // 1. 从 Redis 获取已有会话（Redis 失败时 getTianyiSession 返回 null，自动降级）
  try {
    const session = await getTianyiSession(DEFAULT_USER_ID)
    if (session?.cookies && Object.keys(session.cookies).length > 0) {
      return {
        cookies: session.cookies,
        username: session.username || U,
        password: session.password || P,
      }
    }
  } catch {
    // Redis 读取失败，继续走自动登录
  }

  // 2. 自动登录
  if (!U || !P) {
    return { error: '未配置 TIANYI_USERNAME / TIANYI_PASSWORD 环境变量' }
  }

  try {
    const loginResult = await cloud189Login(U, P)
    if (loginResult.status === 'success' && loginResult.data?.cookies) {
      // 持久化会话；saveTianyiSession 内部已有 try/catch，不会抛错
      await saveTianyiSession(loginResult.data.cookies, {
        username: U,
        password: P,
      })
      return { cookies: loginResult.data.cookies, username: U, password: P }
    }
    // 登录未成功：透传真实原因（验证码 / 密码错 / 接口变更等）
    if (loginResult.status === 'need_captcha') {
      return { error: '天翼云登录需要验证码，请在浏览器登录 cloud.189.cn 一次后重试，或稍后再试' }
    }
    return { error: `天翼云登录失败: ${loginResult.message || loginResult.status}` }
  } catch (e: any) {
    return { error: `天翼云登录异常: ${e?.message || '未知错误'}` }
  }
}


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', apiConfig.cacheControlHeader)

  // admin 参数：管理员路由请求从绝对根目录开始（忽略 DEFAULT_FOLDER_ID）
  const adminFlag = req.query.admin === '1' || req.body?.admin === true
  let isAdmin = false
  if (adminFlag) {
    isAdmin = await isAdminReq(req)
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin session required.' })
      return
    }
  }

  // 路径参数
  let rawPath = '/'
  if (req.method === 'GET') {
    rawPath = (req.query.path as string) || '/'
  } else if (req.method === 'POST') {
    rawPath = req.body?.path || '/'
  }

  if (rawPath === '[...path]') {
    res.status(400).json({ error: 'No path specified.' })
    return
  }
  if (typeof rawPath !== 'string') {
    res.status(400).json({ error: 'Path query invalid.' })
    return
  }

  const cleanPath = pathPosix.resolve('/', pathPosix.normalize(rawPath)).replace(/\/$/, '')
  const segments = cleanPath === '/' ? [] : cleanPath.split('/').filter(Boolean)

  // 整个 handler 逻辑都放进 try/catch，确保任何未预期错误都返回 JSON 而非 HTML 500
  try {
    // 获取会话
    const session = await getOrCreateSession()
    if ('error' in session) {
      res.status(403).json({ error: session.error })
      return
    }

    const { username, password } = session
    let cookies = session.cookies

    // === 受保护路由鉴权 ===
    // 如果请求路径匹配 protectedRoutes，读取该目录下 .password 文件内容，
    // SHA256 后与请求头 od-protected-token 比较，不匹配则返回 401。
    const tokenHeader = (req.headers['od-protected-token'] as string) || ''
    const authPassed = await checkProtectedRoute(cleanPath, tokenHeader, cookies, username, password)
    if (!authPassed) {
      res.status(401).json({ error: 'Password required.' })
      return
    }

    // 逐层解析路径 -> folderId
    // admin 请求从天翼云绝对根目录（-11）开始，忽略 DEFAULT_FOLDER_ID 挂载点
    let currentFolderId = isAdmin ? '-11' : getDefaultFolderId()

    for (let i = 0; i < segments.length; i++) {
      const segment = decodeURIComponent(segments[i])
      const listResult = await getFiles(cookies, currentFolderId, username, password)

      // getFiles 可能在会话失效后重新登录，这里同步更新本地 cookies 供后续调用使用
      if (listResult.data?.cookies) {
        cookies = listResult.data.cookies
      }

      if (listResult.status === 'need_refresh' && listResult.data?.cookies) {
        await saveTianyiSession(listResult.data.cookies, { username, password })
        res.status(401).json({ error: 'Session expired. Please refresh.', needRefresh: true })
        return
      }

      if (listResult.status !== 'success' || !listResult.data) {
        res.status(500).json({ error: listResult.message || '获取文件列表失败' })
        return
      }

      // 先查文件夹匹配
      const matchedFolder = listResult.data.folders.find((f) => f.name === segment)
      if (matchedFolder) {
        currentFolderId = matchedFolder.id
        // 如果这是最后一段路径，继续往下获取该文件夹内容
        if (i === segments.length - 1) {
          // fall through to the final listing below
        }
        continue
      }

      // 如果是路径最后一段，尝试匹配文件
      const matchedFile = listResult.data.files.find((f) => f.name === segment)
      if (matchedFile && i === segments.length - 1) {
        res.status(200).json({
          file: {
            id: matchedFile.id,
            name: matchedFile.name,
            size: matchedFile.size,
            lastModifiedDateTime: matchedFile.lastOpTime,
            'file@': { mimeType: getMimeType(matchedFile.name) },
            file: { mimeType: getMimeType(matchedFile.name) },
          },
        })
        return
      }

      // 没找到
      res.status(404).json({ error: 'Path not found.' })
      return
    }

    // 获取当前文件夹内容
    const result = await getFiles(cookies, currentFolderId, username, password)

    // 同步 getFiles 重新登录后的新 cookies
    if (result.data?.cookies) {
      cookies = result.data.cookies
    }

    if (result.status === 'need_refresh' && result.data?.cookies) {
      await saveTianyiSession(result.data.cookies, { username, password })
      res.status(401).json({ error: 'Session expired. Please refresh.', needRefresh: true })
      return
    }

    if (result.status !== 'success' || !result.data) {
      res.status(500).json({ error: result.message || '获取文件列表失败' })
      return
    }

    // 转换为 UI 期望的数据结构
    const folderChildren = [
      ...result.data.folders.map((f) => ({
        id: f.id,
        name: f.name,
        size: 0,
        lastModifiedDateTime: f.lastOpTime,
        folder: { childCount: 0 },
      })),
      ...result.data.files.map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
        lastModifiedDateTime: f.lastOpTime,
        file: { mimeType: getMimeType(f.name) },
      })),
    ]

    res.status(200).json({
      folder: {
        '@odata.count': folderChildren.length,
        value: folderChildren,
      },
    })
    return
  } catch (error: any) {
    // 安全：不向客户端透传内部错误详情，仅记录日志
    console.error('[ty/index] 异常:', error)
    res.status(500).json({ error: '服务器内部错误，请稍后重试' })
    return
  }
}

/**
 * 根据文件名后缀获取 MIME 类型
 */
function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    xml: 'application/xml',
    csv: 'text/csv',
    js: 'text/javascript',
    ts: 'text/typescript',
    py: 'text/x-python',
    java: 'text/x-java',
    c: 'text/x-c',
    cpp: 'text/x-c++',
    h: 'text/x-c',
    html: 'text/html',
    css: 'text/css',
    mp4: 'video/mp4',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    wmv: 'video/x-ms-wmv',
    flv: 'video/x-flv',
    mkv: 'video/x-matroska',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    zip: 'application/zip',
    rar: 'application/vnd.rar',
    '7z': 'application/x-7z-compressed',
    tar: 'application/x-tar',
    gz: 'application/gzip',
    epub: 'application/epub+zip',
  }
  return mimeMap[ext] || 'application/octet-stream'
}

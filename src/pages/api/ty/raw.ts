import { posix as pathPosix } from 'path'

import type { NextApiRequest, NextApiResponse } from 'next'

import { cloud189Login } from '../../../utils/tianyiAuth'
import { getFiles, getDownloadLink } from '../../../utils/tianyiClient'
import { getTianyiSession, saveTianyiSession } from '../../../utils/tianyiSessionStore'
import { checkProtectedRoute } from '../../../utils/protectedRouteChecker'
import { isSignedToken, parseProtectedToken } from '../../../utils/protectedTokenSigner'
import { isAdminReq } from '../auth/check'

const DEFAULT_USER_ID = 'default_user'

/**
 * 安全解码 URL 组件，遇到畸形 % 序列不抛错而是原样返回
 */
function safeDecodeURIComponent(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { path = '/' } = req.query

  // 通过 cookie 判断 admin 状态（raw 下载是浏览器导航，自动带 cookie）
  // admin 时从天翼云绝对根目录 -11 开始，忽略 DEFAULT_FOLDER_ID
  const isAdmin = await isAdminReq(req)

  if (path === '[...path]') {
    res.status(400).json({ error: 'No path specified.' })
    return
  }
  if (typeof path !== 'string') {
    res.status(400).json({ error: 'Path query invalid.' })
    return
  }

  const cleanPath = pathPosix.resolve('/', pathPosix.normalize(path)).replace(/\/$/, '')
  const segments = cleanPath === '/' ? [] : cleanPath.split('/').filter(Boolean)

  // 整个 handler 逻辑都放进 try/catch，确保任何未预期错误都返回 JSON 而非 HTML 500
  try {
    // 获取会话（getTianyiSession 内部已有 try/catch，失败返回 null）
    const session = await getTianyiSession(DEFAULT_USER_ID)
    let cookies = session?.cookies || null
    let username = session?.username || process.env.TIANYI_USERNAME || ''
    let password = session?.password || process.env.TIANYI_PASSWORD || ''

    if (!cookies) {
      if (!process.env.TIANYI_USERNAME || !process.env.TIANYI_PASSWORD) {
        res.status(403).json({ error: 'No access token.' })
        return
      }
      const loginResult = await cloud189Login(process.env.TIANYI_USERNAME, process.env.TIANYI_PASSWORD)
      if (loginResult.status !== 'success') {
        res.status(403).json({ error: 'Login failed: ' + (loginResult.message || loginResult.status) })
        return
      }
      cookies = loginResult.data?.cookies || null
      if (cookies) {
        // saveTianyiSession 内部已有 try/catch，不会抛错
        await saveTianyiSession(cookies, { username: process.env.TIANYI_USERNAME, password: process.env.TIANYI_PASSWORD })
      }
    }

    if (!cookies) {
      res.status(403).json({ error: 'No access token.' })
      return
    }

    // === 受保护路由鉴权 ===
    // 防止绕过目录密码保护直接下载文件
    const odptToken = (req.query.odpt as string) || ''
    if (isSignedToken(odptToken)) {
      const parsed = parseProtectedToken(odptToken)
      if (!parsed.valid) {
        res.status(401).json({ error: 'Invalid or expired token' })
        return
      }
      if (cleanPath !== parsed.path && !cleanPath.startsWith(parsed.path.replace(/\/?$/, '/') + '/')) {
        res.status(403).json({ error: 'Token path mismatch' })
        return
      }
    } else {
      const authPassed = await checkProtectedRoute(cleanPath, odptToken, cookies, username, password)
      if (!authPassed) {
        res.status(401).json({ error: 'Password required.' })
        return
      }
    }

    // 逐层查找文件
    // admin 请求从天翼云绝对根目录（-11）开始
    let currentFolderId = isAdmin ? '-11' : (process.env.DEFAULT_FOLDER_ID || '-11')
    let fileId: string | null = null
    let fileName: string | null = null

    for (let i = 0; i < segments.length; i++) {
      const segment = safeDecodeURIComponent(segments[i])
      const result = await getFiles(cookies, currentFolderId, username, password)

      // getFiles 可能在会话失效后重新登录，同步新 cookies 供后续调用使用
      if (result.data?.cookies) {
        cookies = result.data.cookies
      }

      if (result.status === 'need_refresh' && result.data?.cookies) {
        await saveTianyiSession(result.data.cookies, { username, password })
        cookies = result.data.cookies
      }

      if (result.status !== 'success' || !result.data) {
        res.status(500).json({ error: result.message || '获取文件列表失败' })
        return
      }

      // 检查文件夹匹配
      const matchedFolder = result.data.folders.find((f) => f.name === segment)
      if (matchedFolder) {
        currentFolderId = matchedFolder.id
        if (i < segments.length - 1) continue
        // 最后一段是文件夹 -> 不支持下载文件夹，返回 400
        res.status(400).json({ error: 'Cannot download a folder.' })
        return
      }

      // 检查文件匹配
      const matchedFile = result.data.files.find((f) => f.name === segment)
      if (matchedFile && i === segments.length - 1) {
        fileId = matchedFile.id
        fileName = matchedFile.name
        break
      }

      res.status(404).json({ error: 'File not found.' })
      return
    }

    if (!fileId) {
      res.status(404).json({ error: 'File not found.' })
      return
    }

    const downloadResult = await getDownloadLink(cookies, fileId)
    if (downloadResult.status !== 'success' || !downloadResult.data?.url) {
      res.status(500).json({ error: downloadResult.message || '获取下载链接失败' })
      return
    }

    // 重定向到真实下载链接
    res.redirect(downloadResult.data.url)
    return
  } catch (error: any) {
    // 安全：不向客户端透传内部错误详情，仅记录日志
    console.error('[ty/raw] 异常:', error)
    res.status(500).json({ error: '服务器内部错误，请稍后重试' })
    return
  }
}

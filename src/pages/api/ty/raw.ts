import { posix as pathPosix } from 'path'

import type { NextApiRequest, NextApiResponse } from 'next'

import { getOrCreateTianyiSession } from '../../../utils/tianyiSession'
import { resolveTianyiPath } from '../../../utils/tianyiPath'
import { getDownloadLink } from '../../../utils/tianyiClient'
import { deleteTianyiSession } from '../../../utils/tianyiSessionStore'
import { checkProtectedRoute } from '../../../utils/protectedRouteChecker'
import { isSignedToken, parseProtectedToken } from '../../../utils/protectedTokenSigner'
import { isAdminReq } from '../auth/check'

const DEFAULT_USER_ID = 'default_user'

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
    // 获取会话（Redis 会话优先，自动登录兜底）
    const session = await getOrCreateTianyiSession()
    if ('error' in session) {
      res.status(403).json({ error: session.error })
      return
    }

    const { username, password } = session
    let cookies = session.cookies

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
        res.status(401).json({ error: 'Token path mismatch' })
        return
      }
    } else {
      const authPassed = await checkProtectedRoute(cleanPath, odptToken, cookies, username, password)
      if (!authPassed) {
        res.status(401).json({ error: 'Password required.' })
        return
      }
    }

    // 逐层解析路径定位文件
    // admin 请求从天翼云绝对根目录（-11）开始
    const result = await resolveTianyiPath(cookies, segments, username, password, isAdmin ? '-11' : (process.env.DEFAULT_FOLDER_ID || '-11'))
    cookies = result.cookies

    if (result.status === 'need_refresh') {
      // 会话已失效且无法自动恢复：清除失效会话，下次请求自动重新登录
      await deleteTianyiSession(DEFAULT_USER_ID)
      res.status(401).json({ error: '登录已失效，请刷新页面重试', needRefresh: true })
      return
    }

    if (result.status === 'not_found') {
      res.status(404).json({ error: 'File not found.' })
      return
    }

    if (result.status !== 'ok') {
      res.status(500).json({ error: result.message || '获取文件列表失败' })
      return
    }

    if (!result.fileId) {
      // 路径最后一段是文件夹 -> 不支持下载文件夹
      res.status(400).json({ error: 'Cannot download a folder.' })
      return
    }

    const downloadResult = await getDownloadLink(cookies, result.fileId)
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
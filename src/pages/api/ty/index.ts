import { posix as pathPosix } from 'path'

import type { NextApiRequest, NextApiResponse } from 'next'

import apiConfig from '../../../../config/api.config'
import { getMimeType } from '../../../utils/mime'
import { getOrCreateTianyiSession } from '../../../utils/tianyiSession'
import { resolveTianyiPath } from '../../../utils/tianyiPath'
import { getFiles } from '../../../utils/tianyiClient'
import { deleteTianyiSession } from '../../../utils/tianyiSessionStore'
import { checkProtectedRoute } from '../../../utils/protectedRouteChecker'
import { isAdminReq } from '../auth/check'

const DEFAULT_USER_ID = 'default_user'

function getDefaultFolderId(): string {
  return process.env.DEFAULT_FOLDER_ID || '-11'
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
    // 获取会话（Redis 会话优先，自动登录兜底）
    const session = await getOrCreateTianyiSession()
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

    // 逐层解析路径 -> folderId / fileId
    // admin 请求从天翼云绝对根目录（-11）开始，忽略 DEFAULT_FOLDER_ID 挂载点
    const result = await resolveTianyiPath(cookies, segments, username, password, isAdmin ? '-11' : getDefaultFolderId())
    cookies = result.cookies

    if (result.status === 'need_refresh') {
      // 会话已失效且无法自动恢复：清除失效会话，下次请求自动重新登录
      await deleteTianyiSession(DEFAULT_USER_ID)
      res.status(401).json({ error: '登录已失效，请刷新页面重试', needRefresh: true })
      return
    }

    if (result.status === 'not_found') {
      res.status(404).json({ error: 'Path not found.' })
      return
    }

    if (result.status !== 'ok') {
      const status = result.upstreamStatus && result.upstreamStatus >= 400 ? result.upstreamStatus : 500
      res.status(status).json({ error: result.message || '获取文件列表失败' })
      return
    }

    // 路径最后一段是文件：返回文件元数据
    if (result.fileMeta) {
      res.status(200).json({
        file: {
          id: result.fileMeta.id,
          name: result.fileMeta.name,
          size: result.fileMeta.size,
          lastModifiedDateTime: result.fileMeta.lastOpTime,
          file: { mimeType: getMimeType(result.fileMeta.name) },
        },
      })
      return
    }

    // 获取当前文件夹内容
    const listResult = await getFiles(cookies, result.folderId, username, password)

    // 同步 getFiles 重新登录后的新 cookies
    if (listResult.data?.cookies) {
      cookies = listResult.data.cookies
    }

    if (listResult.status === 'need_refresh') {
      await deleteTianyiSession(DEFAULT_USER_ID)
      res.status(401).json({ error: '登录已失效，请刷新页面重试', needRefresh: true })
      return
    }

    if (listResult.status !== 'success' || !listResult.data) {
      const status = listResult.upstreamStatus && listResult.upstreamStatus >= 400 ? listResult.upstreamStatus : 500
      res.status(status).json({ error: listResult.message || '获取文件列表失败' })
      return
    }

    // 转换为 UI 期望的数据结构
    const folderChildren = [
      ...listResult.data.folders.map(f => ({
        id: f.id,
        name: f.name,
        size: 0,
        lastModifiedDateTime: f.lastOpTime,
        folder: { childCount: 0 },
      })),
      ...listResult.data.files.map(f => ({
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
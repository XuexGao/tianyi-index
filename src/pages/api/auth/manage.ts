import type { NextApiRequest, NextApiResponse } from 'next'
import { isAdminReq } from './check'
import { isSameOriginReq } from '../../../utils/adminAuth'
import { deleteTianyiSession } from '../../../utils/tianyiSessionStore'
import { getOdAuthTokens, storeOdAuthTokens } from '../../../utils/odAuthTokenStore'
import {
  getProtectedRoutes,
  getProtectedRoutesOd,
  setProtectedRoutes,
  setProtectedRoutesOd,
  resetProtectedRoutes,
} from '../../../utils/protectedRoutesStore'

/**
 * 管理员操作 API
 *
 * POST /api/auth/manage
 * Body: { action: string, ...payload }
 *
 * 需要管理员登录。
 *
 * 支持的 action：
 * - 'clear-cache'：清除云盘缓存 session
 * - 'get-protected-routes'：获取私密目录列表
 * - 'set-protected-routes'：设置私密目录列表
 * - 'reset-protected-routes'：重置为环境变量配置
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  // CSRF 防护：校验同源
  if (!isSameOriginReq(req)) {
    res.status(403).json({ error: '跨站请求被拒绝' })
    return
  }

  const isAdmin = await isAdminReq(req)
  if (!isAdmin) {
    res.status(401).json({ error: '未登录或会话已过期' })
    return
  }

  const { action } = req.body || {}

  try {
    switch (action) {
      case 'clear-cache':
        return await handleClearCache(req, res)
      case 'get-protected-routes':
        return await handleGetProtectedRoutes(req, res)
      case 'set-protected-routes':
        return await handleSetProtectedRoutes(req, res)
      case 'reset-protected-routes':
        return await handleResetProtectedRoutes(req, res)
      default:
        res.status(400).json({ error: `未知操作: ${action}` })
    }
  } catch (e: any) {
    // 安全：不向客户端透传内部错误详情，仅记录日志
    console.error('[manage] 操作失败:', e)
    res.status(500).json({ error: '服务器内部错误，请稍后重试' })
  }
}

/**
 * 清除云盘缓存 session
 */
async function handleClearCache(_req: NextApiRequest, res: NextApiResponse) {
  const results: string[] = []

  // 清天翼云 session
  try {
    await deleteTianyiSession('default_user')
    results.push('天翼云 session 已清除')
  } catch (e: any) {
    results.push(`天翼云清除失败: ${e?.message || e}`)
  }

  // 清 OneDrive access token（refresh token 保留）
  try {
    const { refreshToken } = await getOdAuthTokens()
    await storeOdAuthTokens({
      accessToken: '',
      accessTokenExpiry: 1,
      refreshToken: String(refreshToken || ''),
    })
    results.push('OneDrive access_token 已清除（refresh_token 保留）')
  } catch (e: any) {
    results.push(`OneDrive 清除失败: ${e?.message || e}`)
  }

  res.status(200).json({ success: true, messages: results })
}

/**
 * 获取私密目录列表
 */
async function handleGetProtectedRoutes(_req: NextApiRequest, res: NextApiResponse) {
  const ty = await getProtectedRoutes()
  const od = await getProtectedRoutesOd()
  res.status(200).json({ success: true, ty, od })
}

/**
 * 设置私密目录列表
 * Body: { ty?: string[], od?: string[] }
 */
async function handleSetProtectedRoutes(req: NextApiRequest, res: NextApiResponse) {
  const { ty, od } = req.body || {}
  const messages: string[] = []

  if (Array.isArray(ty)) {
    await setProtectedRoutes(ty)
    messages.push(`天翼云私密目录已更新（${ty.length} 条）`)
  }
  if (Array.isArray(od)) {
    await setProtectedRoutesOd(od)
    messages.push(`OneDrive 私密目录已更新（${od.length} 条）`)
  }

  if (messages.length === 0) {
    res.status(400).json({ error: '未提供 ty 或 od 数组' })
    return
  }

  res.status(200).json({ success: true, messages })
}

/**
 * 重置私密目录为环境变量配置
 */
async function handleResetProtectedRoutes(_req: NextApiRequest, res: NextApiResponse) {
  await resetProtectedRoutes()
  res.status(200).json({ success: true, messages: ['已重置为环境变量配置'] })
}

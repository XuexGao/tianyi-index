import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyAdminSession } from '../../../utils/adminSessionStore'
import { getTokenFromReq } from '../../../utils/adminAuth'

/**
 * 检查管理员登录状态
 *
 * GET /api/auth/check
 * 返回当前是否已登录、会话信息。
 *
 * 也可被其他 API 路由复用：导入 isAdminReq 判断请求是否来自管理员。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const token = getTokenFromReq(req)
  const payload = await verifyAdminSession(token)

  res.status(200).json({
    isAdmin: Boolean(payload),
    session: payload
      ? {
          username: payload.username,
          createdAt: payload.createdAt,
          lastAccessAt: payload.lastAccessAt,
        }
      : null,
  })
}

/**
 * 判断请求是否来自已登录的管理员（供其他 API 路由复用）
 */
export async function isAdminReq(req: NextApiRequest): Promise<boolean> {
  const token = getTokenFromReq(req)
  const payload = await verifyAdminSession(token)
  return Boolean(payload)
}

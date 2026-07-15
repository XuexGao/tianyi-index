import type { NextApiRequest, NextApiResponse } from 'next'
import { deleteAdminSession } from '../../../utils/adminSessionStore'
import { ADMIN_COOKIE_NAME, ADMIN_COOKIE_PATH, getTokenFromReq, isSameOriginReq } from '../../../utils/adminAuth'

/**
 * 管理员登出 API
 *
 * POST /api/auth/logout
 * 删除 Redis session 并清除 cookie。
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

  const token = getTokenFromReq(req)
  await deleteAdminSession(token)

  // 清除 cookie
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=${ADMIN_COOKIE_PATH}`)
  res.status(200).json({ success: true })
}

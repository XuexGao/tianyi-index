import type { NextApiRequest, NextApiResponse } from 'next'
import { deleteAdminSession } from '../../../utils/adminSessionStore'
import { ADMIN_COOKIE_NAME, ADMIN_COOKIE_PATH, getTokenFromReq } from '../../../utils/adminAuth'

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

  const token = getTokenFromReq(req)
  await deleteAdminSession(token)

  // 清除 cookie
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=${ADMIN_COOKIE_PATH}`)
  res.status(200).json({ success: true })
}

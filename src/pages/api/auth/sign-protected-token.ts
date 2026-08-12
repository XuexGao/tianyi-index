import type { NextApiRequest, NextApiResponse } from 'next'
import { signProtectedToken } from '../../../utils/protectedTokenSigner'
import { checkProtectedRoute } from '../../../utils/protectedRouteChecker'
import { checkAuthRoute, getAccessToken } from '../od'
import { checkRateLimit } from '../../../utils/rateLimit'
import { getClientIp } from '../../../utils/getClientIp'

/**
 * 失败限流：15 分钟窗口内最多 30 次鉴权失败（按 IP，Redis 计数）。
 * 防止攻击者对受保护目录密码哈希做无限暴力尝试。
 * 仅对失败计数，合法用户正常输入密码不受影响。
 */
const MAX_FAIL_ATTEMPTS = 30
const FAIL_WINDOW_SEC = 15 * 60

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { path, hash, drive } = req.body || {}
  if (typeof path !== 'string' || typeof hash !== 'string') {
    res.status(400).json({ error: 'Missing path or hash' })
    return
  }

  let authorized = false
  if (drive === 'od') {
    const accessToken = await getAccessToken()
    if (!accessToken) {
      res.status(503).json({ error: 'OneDrive not configured' })
      return
    }
    const result = await checkAuthRoute(path, accessToken, hash)
    authorized = result.code === 200
  } else {
    const cookies: Record<string, string> = {}
    const username = process.env.TIANYI_USERNAME || ''
    const password = process.env.TIANYI_PASSWORD || ''
    authorized = await checkProtectedRoute(path, hash, cookies, username, password)
  }

  if (!authorized) {
    // 鉴权失败：按 IP 限流，防止暴力尝试目录密码哈希
    const ip = getClientIp(req)
    const rl = await checkRateLimit(`sign-token:fail:${ip}`, MAX_FAIL_ATTEMPTS, FAIL_WINDOW_SEC)
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfter))
      res.status(429).json({ error: `尝试次数过多，请 ${rl.retryAfter} 秒后重试` })
      return
    }
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const token = signProtectedToken(path)
  if (!token) {
    res.status(500).json({ error: 'Signing key not configured (CRYPTO_SECRET or ADMIN_PASSWORD required)' })
    return
  }

  res.json({ token })
}

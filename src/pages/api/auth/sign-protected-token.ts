import type { NextApiRequest, NextApiResponse } from 'next'
import { posix as pathPosix } from 'path'
import { signProtectedToken } from '../../../utils/protectedTokenSigner'
import { checkProtectedRoute, findProtectedRoute } from '../../../utils/protectedRouteChecker'
import { checkAuthRoute, getAccessToken, getAuthTokenPath } from '../od'
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
  if (typeof path !== 'string' || typeof hash !== 'string' || (drive !== 'ty' && drive !== 'od')) {
    res.status(400).json({ error: 'Missing or invalid path, hash, or drive' })
    return
  }

  const cleanPath = pathPosix.resolve('/', pathPosix.normalize(path))
  let protectedPath = ''
  let authorized = false

  if (drive === 'od') {
    const accessToken = await getAccessToken()
    if (!accessToken) {
      res.status(503).json({ error: 'OneDrive not configured' })
      return
    }
    const authTokenPath = await getAuthTokenPath(cleanPath)
    if (authTokenPath) {
      protectedPath = authTokenPath.slice(0, -'/.password'.length)
      const result = await checkAuthRoute(cleanPath, accessToken, hash)
      authorized = result.code === 200
    }
  } else {
    protectedPath = await findProtectedRoute(cleanPath)
    if (protectedPath) {
      const cookies: Record<string, string> = {}
      const username = process.env.TIANYI_USERNAME || ''
      const password = process.env.TIANYI_PASSWORD || ''
      authorized = await checkProtectedRoute(cleanPath, hash, cookies, username, password)
    }
  }

  // Never sign an arbitrary or unprotected path. The token must represent the
  // configured protected root, otherwise it could be used as a parent-path bypass.
  if (!protectedPath || !authorized) {
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

  const token = await signProtectedToken(protectedPath)
  if (!token) {
    res.status(500).json({ error: 'Signing key not configured' })
    return
  }

  res.json({ token })
}

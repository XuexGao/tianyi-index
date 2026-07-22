import type { NextApiRequest, NextApiResponse } from 'next'
import { signProtectedToken } from '../../../utils/protectedTokenSigner'
import { checkProtectedRoute } from '../../../utils/protectedRouteChecker'
import { checkAuthRoute, getAccessToken } from '../od'

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

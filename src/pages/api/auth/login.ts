import type { NextApiRequest, NextApiResponse } from 'next'
import { timingSafeEqual } from 'crypto'
import { createHash } from 'crypto'
import { createAdminSession } from '../../../utils/adminSessionStore'
import { ADMIN_COOKIE_NAME, ADMIN_COOKIE_MAX_AGE, ADMIN_COOKIE_PATH, isSameOriginReq } from '../../../utils/adminAuth'
import { checkRateLimit } from '../../../utils/rateLimit'

/**
 * 管理员登录 API
 *
 * POST /api/auth/login
 * Body: { password: string }
 *
 * 校验密码（与环境变量 ADMIN_PASSWORD 比对），
 * 成功则创建 Redis session 并设置 HTTP-only cookie。
 */

// 限流参数：15 分钟窗口内最多 10 次尝试（Redis 计数，跨实例生效）
const MAX_ATTEMPTS = 10
const WINDOW_SEC = 15 * 60

function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

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

  // 限流：基于 Redis INCR + EXPIRE，跨实例全局共享计数
  const ip = getClientIp(req)
  const rl = await checkRateLimit(`login:ip:${ip}`, MAX_ATTEMPTS, WINDOW_SEC)
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    res.status(429).json({ error: `尝试次数过多，请 ${rl.retryAfter} 秒后重试` })
    return
  }

  const { password } = req.body || {}
  const adminPassword = process.env.ADMIN_PASSWORD

  if (!adminPassword) {
    res.status(503).json({ error: '管理员功能未配置（ADMIN_PASSWORD 环境变量未设置）' })
    return
  }

  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: '密码不能为空' })
    return
  }

  // 防止时序攻击：用恒定时间比较（不因长度差异提前返回）
  if (!safeCompare(password, adminPassword)) {
    // 加一点延迟，防止暴力破解
    await new Promise(resolve => setTimeout(resolve, 500))
    res.status(401).json({ error: '密码错误' })
    return
  }

  // 创建 session
  const token = await createAdminSession('admin')
  if (!token) {
    res.status(500).json({ error: '创建会话失败（Redis 不可用？）' })
    return
  }

  // 设置 HTTP-only cookie
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Max-Age=${ADMIN_COOKIE_MAX_AGE}; Path=${ADMIN_COOKIE_PATH}`)
  res.status(200).json({ success: true })
}

function safeCompare(a: string, b: string): boolean {
  const aHash = createHash('sha256').update(a).digest()
  const bHash = createHash('sha256').update(b).digest()
  return timingSafeEqual(aHash, bHash)
}

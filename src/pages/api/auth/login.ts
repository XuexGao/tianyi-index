import type { NextApiRequest, NextApiResponse } from 'next'
import { createAdminSession } from '../../../utils/adminSessionStore'
import { ADMIN_COOKIE_NAME, ADMIN_COOKIE_MAX_AGE, ADMIN_COOKIE_PATH } from '../../../utils/adminAuth'

/**
 * 管理员登录 API
 *
 * POST /api/auth/login
 * Body: { password: string }
 *
 * 校验密码（与环境变量 ADMIN_PASSWORD 比对），
 * 成功则创建 Redis session 并设置 HTTP-only cookie。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
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

  // 防止时序攻击：用恒定时间比较
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

/**
 * 恒定时间字符串比较，防止时序攻击
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

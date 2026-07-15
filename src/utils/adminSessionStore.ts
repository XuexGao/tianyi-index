import Redis from 'ioredis'
import siteConfig from '../../config/site.config'

/**
 * 管理员会话存储（基于 Redis）
 *
 * 登录成功后生成随机 session token，写入 HTTP-only cookie，
 * 同时以 token 为 key 存到 Redis（参考 tianyiSessionStore 模式）。
 *
 * 失败时静默降级（视为未登录），不抛错。
 */

let kv: Redis | null = null
let initError: string | null = null

try {
  if (process.env.REDIS_URL) {
    kv = new Redis(process.env.REDIS_URL, {
      retryStrategy: times => (times > 2 ? null : Math.min(times * 200, 1000)),
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
    })
  } else {
    initError = 'REDIS_URL 未配置'
  }
} catch (e: any) {
  initError = `Redis 初始化失败: ${e?.message || '未知错误'}`
  kv = null
}

const SESSION_PREFIX = 'admin:session:'
// 7 天 TTL
const SESSION_TTL = 7 * 24 * 3600

export interface AdminSessionPayload {
  username: string
  createdAt: number
  // 最后访问时间，用于展示
  lastAccessAt: number
}

/**
 * 创建新的管理员会话，返回随机 session token
 */
export async function createAdminSession(username = 'admin'): Promise<string | null> {
  try {
    if (!kv) return null
    // 生成 32 字节随机 token
    const token = generateToken()
    const payload: AdminSessionPayload = {
      username,
      createdAt: Date.now(),
      lastAccessAt: Date.now(),
    }
    await kv.setex(`${siteConfig.kvPrefix}${SESSION_PREFIX}${token}`, SESSION_TTL, JSON.stringify(payload))
    return token
  } catch {
    return null
  }
}

/**
 * 校验 session token 是否有效，有效则续期并返回 payload
 */
export async function verifyAdminSession(token: string | undefined | null): Promise<AdminSessionPayload | null> {
  try {
    if (!token || !kv) return null
    const key = `${siteConfig.kvPrefix}${SESSION_PREFIX}${token}`
    const raw = await kv.get(key)
    if (!raw) return null
    const payload = JSON.parse(raw) as AdminSessionPayload
    // 续期并更新最后访问时间
    payload.lastAccessAt = Date.now()
    await kv.setex(key, SESSION_TTL, JSON.stringify(payload))
    return payload
  } catch {
    return null
  }
}

/**
 * 删除指定 session（登出）
 */
export async function deleteAdminSession(token: string | undefined | null): Promise<void> {
  try {
    if (!token || !kv) return
    await kv.del(`${siteConfig.kvPrefix}${SESSION_PREFIX}${token}`)
  } catch {
    // 忽略删除错误
  }
}

/**
 * 列出所有活跃的 admin session（管理页诊断用）
 */
export async function listAdminSessions(): Promise<Array<{ token: string; payload: AdminSessionPayload }>> {
  try {
    if (!kv) return []
    const pattern = `${siteConfig.kvPrefix}${SESSION_PREFIX}*`
    const keys = await kv.keys(pattern)
    const result: Array<{ token: string; payload: AdminSessionPayload }> = []
    for (const key of keys) {
      const raw = await kv.get(key)
      if (!raw) continue
      const token = key.split(SESSION_PREFIX)[1]
      // 安全：掩码 token，避免在诊断接口中暴露可用凭据导致 session 劫持
      const maskedToken = token.length > 12 ? `${token.slice(0, 8)}…${token.slice(-4)}` : '…'
      result.push({ token: maskedToken, payload: JSON.parse(raw) })
    }
    return result
  } catch {
    return []
  }
}

export function getAdminRedisStatus(): { initialized: boolean; error: string | null } {
  return { initialized: Boolean(kv), error: initError }
}

/**
 * 生成 32 字节随机 hex token
 */
function generateToken(): string {
  const { randomBytes } = require('crypto')
  return randomBytes(32).toString('hex')
}

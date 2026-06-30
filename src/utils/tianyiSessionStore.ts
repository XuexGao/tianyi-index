import Redis from 'ioredis'
import siteConfig from '../../config/site.config'

/**
 * 天翼云 Cookie 会话存储（基于 Redis）
 * 替代原 PostgreSQL db_manager.py 和 OneDrive OAuth token store
 */

const kv = new Redis(process.env.REDIS_URL || '')

const SESSION_PREFIX = 'tianyi:session:'
const DEFAULT_USER_ID = 'default_user'

export async function getTianyiSession(userId = DEFAULT_USER_ID): Promise<{
  cookies: Record<string, string> | null
  username?: string
  password?: string
} | null> {
  try {
    const key = `${siteConfig.kvPrefix}${SESSION_PREFIX}${userId}`
    const raw = await kv.get(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function saveTianyiSession(
  cookies: Record<string, string>,
  options?: { userId?: string; username?: string; password?: string },
): Promise<void> {
  const key = `${siteConfig.kvPrefix}${SESSION_PREFIX}${options?.userId || DEFAULT_USER_ID}`
  const existing = await getTianyiSession(options?.userId)
  const payload = {
    cookies,
    username: options?.username || existing?.username || '',
    password: options?.password || existing?.password || '',
    updatedAt: Date.now(),
  }
  // 1 小时 TTL，每次访问续期
  await kv.setex(key, 3600, JSON.stringify(payload))
}

export async function deleteTianyiSession(userId = DEFAULT_USER_ID): Promise<void> {
  await kv.del(`${siteConfig.kvPrefix}${SESSION_PREFIX}${userId}`)
}

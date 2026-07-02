import Redis from 'ioredis'
import siteConfig from '../../config/site.config'

/**
 * 天翼云 Cookie 会话存储（基于 Redis）
 * 替代原 PostgreSQL db_manager.py 和 OneDrive OAuth token store
 *
 * 注意：Redis 在本项目中仅用作会话缓存，失败时应静默降级（每次请求重新登录），
 * 而不是让整个 API 请求崩溃。因此所有读写操作都包裹了 try/catch。
 */

let kv: Redis | null = null
let kvInitError: string | null = null

try {
  // 延迟构造，避免 REDIS_URL 缺失/格式错误时模块加载即抛错导致整个 API 路由 500
  if (process.env.REDIS_URL) {
    kv = new Redis(process.env.REDIS_URL, {
      // Upstash 等托管 Redis 在 serverless 环境下建议禁用重试，避免冷启动堆积
      retryStrategy: times => (times > 2 ? null : Math.min(times * 200, 1000)),
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
    })
  } else {
    kvInitError = 'REDIS_URL 未配置'
  }
} catch (e: any) {
  kvInitError = `Redis 初始化失败: ${e?.message || '未知错误'}`
  kv = null
}

const SESSION_PREFIX = 'tianyi:session:'
const DEFAULT_USER_ID = 'default_user'

export async function getTianyiSession(userId = DEFAULT_USER_ID): Promise<{
  cookies: Record<string, string> | null
  username?: string
  password?: string
} | null> {
  try {
    if (!kv) return null
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
  try {
    if (!kv) return
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
  } catch {
    // Redis 写入失败不影响主流程，下次请求会重新登录
  }
}

export async function deleteTianyiSession(userId = DEFAULT_USER_ID): Promise<void> {
  try {
    if (!kv) return
    await kv.del(`${siteConfig.kvPrefix}${SESSION_PREFIX}${userId}`)
  } catch {
    // 忽略删除错误
  }
}

/**
 * 返回 Redis 初始化状态，供 /api/config 诊断使用
 */
export function getRedisStatus(): { initialized: boolean; error: string | null } {
  return { initialized: Boolean(kv), error: kvInitError }
}

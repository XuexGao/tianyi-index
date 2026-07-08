import Redis from 'ioredis'
import siteConfig from '../../config/site.config'

/**
 * 内置访问统计（基于 Redis）
 * - stats:total            累计访问量（永不过期）
 * - stats:today:YYYY-MM-DD 当日访问量（次日凌晨自动过期）
 *
 * 容错策略与 tianyiSessionStore / odAuthTokenStore 一致：
 * Redis 不可用时降级返回 0，不抛错，不影响主流程。
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

const PREFIX = `${siteConfig.kvPrefix}stats:`
const TOTAL_KEY = `${PREFIX}total`

/** 用 UTC 日期作 key 后缀，避免服务器时区差异；TTL 设 36 小时保证跨时区次日都能命中并自动清理 */
function todayKey(): { key: string; date: string } {
  const d = new Date()
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  return { key: `${PREFIX}today:${date}`, date }
}

/** 读今日 + 累计，Redis 不可用时返回 0 */
export async function getVisitStats(): Promise<{ today: number; total: number }> {
  if (!kv) return { today: 0, total: 0 }
  try {
    const { key } = todayKey()
    const [today, total] = await kv.mget(key, TOTAL_KEY)
    return {
      today: Number(today) || 0,
      total: Number(total) || 0,
    }
  } catch {
    return { today: 0, total: 0 }
  }
}

/** 今日 +1、累计 +1，原子操作 */
export async function incrementVisit(): Promise<{ today: number; total: number }> {
  if (!kv) return { today: 0, total: 0 }
  try {
    const { key } = todayKey()
    // pipeline 保证两次 incr 原子提交；当日 key 首次写入时设置 36h TTL
    const pipeline = kv.multi()
    pipeline.incr(key)
    pipeline.incr(TOTAL_KEY)
    pipeline.expire(key, 36 * 3600)
    const results = await pipeline.exec()
    const today = Number(results?.[0]?.[1]) || 0
    const total = Number(results?.[1]?.[1]) || 0
    return { today, total }
  } catch {
    return { today: 0, total: 0 }
  }
}

export function getStatsRedisStatus() {
  return { initialized: Boolean(kv), error: initError }
}

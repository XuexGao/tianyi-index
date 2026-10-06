import Redis from 'ioredis'
import siteConfig from '../../config/site.config'
import { logRedisError, redisConnectionOptions } from './redisOptions'

/**
 * 基于 Redis INCR + EXPIRE 的分布式限流。
 *
 * 替代原 /api/auth/login 中的内存 Map 限流：
 * - 内存限流在 serverless 多实例下为近似值（每实例独立计数）；
 * - Redis 限流全局共享计数，并能跨实例生效。
 *
 * 容错策略：Redis 不可用时**放行**（见 checkRateLimit 注释），不因缓存故障拒绝用户。
 */

let kv: Redis | null = null
let initError: string | null = null

try {
  if (process.env.REDIS_URL) {
    kv = new Redis(process.env.REDIS_URL, redisConnectionOptions())
    kv.on('error', logRedisError('rateLimit'))
  } else {
    initError = 'REDIS_URL 未配置'
  }
} catch (e: any) {
  initError = `Redis 初始化失败: ${e?.message || '未知错误'}`
  kv = null
}

const PREFIX = `${siteConfig.kvPrefix}ratelimit:`

export interface RateLimitResult {
  /** 是否允许通过 */
  allowed: boolean
  /** 当前窗口内已使用次数 */
  count: number
  /** 触发限流时建议的重试等待秒数（用于 Retry-After 头） */
  retryAfter: number
  /** Redis 是否真实生效（false 表示降级放行） */
  enforced: boolean
  /**
   * 是否因 Redis 故障而降级放行。
   * 为 true 时 `allowed` 恒为 true，且计数未生效（不代表用户真的没超限）。
   */
  degraded: boolean
}

/**
 * 检查是否允许通过限流。
 *
 * 实现要点：
 * - INCR 是原子的，第一次访问时 count=1，此时设置 EXPIRE；
 * - 即使 INCR 之后 EXPIRE 失败（网络/重启），key 也会自然过期内存回收，
 *   不会永久卡死用户；
 * - 不用 Lua 脚本：INCR + EXPIRE 两步在极少数并发场景下窗口可能略长，
 *   对登录限流这种粗粒度场景可接受，换取更简单的实现与更好的 Upstash 兼容性。
 *
 * 容错语义（重要，2026-10 修正）：
 * Redis 不可用/超时/命令失败时**一律放行**（`degraded: true`），绝不因此拒绝用户。
 * 旧实现在认证入口传 `failClosed=true`，Redis 抖动即返回 429 —— 而此时计数根本没写进去，
 * 用户看到"尝试次数过多，请 900 秒后重试"，实际是他一次都没被计数，
 * 表现为"刷新好几次才能加载出来"（碰巧落到 Redis 握手成功的实例）。
 * 真正防暴力破解的是：恒定时间比较 + 失败延迟 + 主机侧的其他防线；
 * 限流只是纵深防御的一层，不应在故障时成为可用性单点。
 *
 * @param key 限流维度标识（如 `login:ip:1.2.3.4`）
 * @param max 窗口内最大允许次数
 * @param windowSec 窗口大小（秒）
 */
export async function checkRateLimit(key: string, max: number, windowSec: number): Promise<RateLimitResult> {
  if (!kv) {
    return { allowed: true, count: 0, retryAfter: 0, enforced: false, degraded: true }
  }
  try {
    const k = `${PREFIX}${key}`
    const count = await kv.incr(k)
    if (count === 1) {
      // 第一次访问，设置过期时间。即使后续 EXPIRE 失败，下一次 incr 仍会重试 expire。
      await kv.expire(k, windowSec)
    }
    if (count > max) {
      const ttl = await kv.ttl(k)
      return {
        allowed: false,
        count,
        retryAfter: ttl > 0 ? ttl : windowSec,
        enforced: true,
        degraded: false,
      }
    }
    return { allowed: true, count, retryAfter: 0, enforced: true, degraded: false }
  } catch (err) {
    // Redis 故障：放行并告警。计数丢失期间限流事实失效，但这是可接受的取舍，
    // 好过把正常用户（含管理员）锁在门外。
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[rateLimit] Redis 不可用，本次放行 (${key}): ${msg}`)
    return { allowed: true, count: 0, retryAfter: 0, enforced: false, degraded: true }
  }
}

export function getRateLimiterStatus(): { initialized: boolean; error: string | null } {
  return { initialized: Boolean(kv), error: initError }
}

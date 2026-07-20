import Redis from 'ioredis'
import siteConfig from '../../config/site.config'

/**
 * 天翼云登录流程监控。
 *
 * 目的：天翼云登录依赖 cloud.189.cn 的开放接口，对方接口变更或风控策略调整
 * 会导致登录静默失败（用户只看到"获取文件列表失败"），定位困难。
 *
 * 本模块在登录成功/失败时记录指标到 Redis：
 * - 最近 1 小时失败计数（INCR + EXPIRE）
 * - 最近 20 条失败记录（LPUSH + LTRIM）
 *
 * 暴露在 /api/config 诊断接口供管理员查看，便于及时发现接口变更。
 *
 * 容错策略：Redis 不可用时静默降级，不影响登录主流程。
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

const PREFIX = `${siteConfig.kvPrefix}tianyi:login:`
const FAILURE_COUNT_KEY = `${PREFIX}failures:1h`
const RECENT_ERRORS_KEY = `${PREFIX}recent_errors`
const SUCCESS_COUNT_KEY = `${PREFIX}successes:1h`

const FAILURE_WINDOW_SEC = 3600 // 1 小时滚动窗口
const MAX_RECENT_ERRORS = 20
const RECENT_ERRORS_TTL_SEC = 24 * 3600 // 错误记录保留 24 小时

export interface LoginFailureRecord {
  timestamp: number
  status: string
  message: string
}

export interface LoginMonitorStats {
  /** 最近 1 小时登录失败次数 */
  recentFailures: number
  /** 最近 1 小时登录成功次数 */
  recentSuccesses: number
  /** 最近 20 条失败记录（最新在前） */
  recentErrorRecords: LoginFailureRecord[]
  /** 监控是否真实写入 Redis（false 表示 Redis 不可用，统计为 0） */
  enabled: boolean
}

/**
 * 记录一次登录失败。
 * message 会被截断到 200 字符以内，防止异常堆栈撑爆 Redis。
 */
export async function recordLoginFailure(status: string, message: string): Promise<void> {
  if (!kv) return
  try {
    // 失败计数（1 小时滚动窗口）
    const count = await kv.incr(FAILURE_COUNT_KEY)
    if (count === 1) {
      await kv.expire(FAILURE_COUNT_KEY, FAILURE_WINDOW_SEC)
    }

    // 最近错误列表：LPUSH 插入头部，LTRIM 裁剪保留前 N 条
    const record: LoginFailureRecord = {
      timestamp: Date.now(),
      status,
      message: (message || '').substring(0, 200),
    }
    await kv.lpush(RECENT_ERRORS_KEY, JSON.stringify(record))
    await kv.ltrim(RECENT_ERRORS_KEY, 0, MAX_RECENT_ERRORS - 1)
    // 每次写入刷新 TTL，避免长期无失败时记录过期清空（保留最近 24h 内的失败痕迹）
    await kv.expire(RECENT_ERRORS_KEY, RECENT_ERRORS_TTL_SEC)
  } catch {
    // 监控失败不影响主流程
  }
}

/**
 * 记录一次登录成功。同时清除失败计数（成功表示接口已恢复）。
 */
export async function recordLoginSuccess(): Promise<void> {
  if (!kv) return
  try {
    const count = await kv.incr(SUCCESS_COUNT_KEY)
    if (count === 1) {
      await kv.expire(SUCCESS_COUNT_KEY, FAILURE_WINDOW_SEC)
    }
    // 登录成功说明接口恢复正常，清除失败计数避免历史失败继续影响告警判断
    await kv.del(FAILURE_COUNT_KEY)
  } catch {
    // 忽略
  }
}

/**
 * 获取登录监控统计（供 /api/config 诊断接口使用）。
 * Redis 不可用时返回零值。
 */
export async function getLoginMonitorStats(): Promise<LoginMonitorStats> {
  if (!kv) {
    return {
      recentFailures: 0,
      recentSuccesses: 0,
      recentErrorRecords: [],
      enabled: false,
    }
  }
  try {
    const [failures, successes, rawRecords] = await Promise.all([
      kv.get(FAILURE_COUNT_KEY),
      kv.get(SUCCESS_COUNT_KEY),
      kv.lrange(RECENT_ERRORS_KEY, 0, MAX_RECENT_ERRORS - 1),
    ])

    const records: LoginFailureRecord[] = []
    for (const raw of rawRecords) {
      try {
        records.push(JSON.parse(raw) as LoginFailureRecord)
      } catch {
        // 跳过损坏的记录
      }
    }

    return {
      recentFailures: failures ? parseInt(failures, 10) : 0,
      recentSuccesses: successes ? parseInt(successes, 10) : 0,
      recentErrorRecords: records,
      enabled: true,
    }
  } catch {
    return {
      recentFailures: 0,
      recentSuccesses: 0,
      recentErrorRecords: [],
      enabled: false,
    }
  }
}

export function getLoginMonitorStatus(): { initialized: boolean; error: string | null } {
  return { initialized: Boolean(kv), error: initError }
}

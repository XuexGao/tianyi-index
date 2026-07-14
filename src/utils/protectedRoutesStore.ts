import Redis from 'ioredis'
import siteConfig from '../../config/site.config'

/**
 * 私密目录动态配置存储（基于 Redis）
 *
 * 环境变量配置的 protectedRoutes / protectedRoutesOd 是初始值，
 * 管理员可在管理页面动态增删，覆盖环境变量配置。
 *
 * 失败时降级到环境变量配置，不抛错。
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

const TY_KEY = `${siteConfig.kvPrefix}admin:protected_routes`
const OD_KEY = `${siteConfig.kvPrefix}admin:protected_routes_od`

/**
 * 获取天翼云私密目录列表
 * Redis 有值则用 Redis，否则降级到 siteConfig 环境变量配置
 */
export async function getProtectedRoutes(): Promise<string[]> {
  try {
    if (!kv) return siteConfig.protectedRoutes
    const raw = await kv.get(TY_KEY)
    if (raw === null) return siteConfig.protectedRoutes
    return JSON.parse(raw) as string[]
  } catch {
    return siteConfig.protectedRoutes
  }
}

/**
 * 获取 OneDrive 私密目录列表
 */
export async function getProtectedRoutesOd(): Promise<string[]> {
  try {
    if (!kv) return siteConfig.protectedRoutesOd
    const raw = await kv.get(OD_KEY)
    if (raw === null) return siteConfig.protectedRoutesOd
    return JSON.parse(raw) as string[]
  } catch {
    return siteConfig.protectedRoutesOd
  }
}

/**
 * 设置天翼云私密目录列表
 */
export async function setProtectedRoutes(routes: string[]): Promise<void> {
  try {
    if (!kv) throw new Error('Redis 不可用')
    await kv.set(TY_KEY, JSON.stringify(routes))
  } catch (e: any) {
    throw new Error(`保存失败: ${e?.message || e}`)
  }
}

/**
 * 设置 OneDrive 私密目录列表
 */
export async function setProtectedRoutesOd(routes: string[]): Promise<void> {
  try {
    if (!kv) throw new Error('Redis 不可用')
    await kv.set(OD_KEY, JSON.stringify(routes))
  } catch (e: any) {
    throw new Error(`保存失败: ${e?.message || e}`)
  }
}

/**
 * 重置为环境变量配置
 */
export async function resetProtectedRoutes(): Promise<void> {
  try {
    if (!kv) throw new Error('Redis 不可用')
    await kv.del(TY_KEY, OD_KEY)
  } catch (e: any) {
    throw new Error(`重置失败: ${e?.message || e}`)
  }
}

export function getProtectedRoutesRedisStatus(): { initialized: boolean; error: string | null } {
  return { initialized: Boolean(kv), error: initError }
}

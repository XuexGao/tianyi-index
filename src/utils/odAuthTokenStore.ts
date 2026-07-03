import Redis from 'ioredis'
import siteConfig from '../../config/site.config'

// Persistent key-value store is provided by Redis, hosted on Upstash
// https://vercel.com/integrations/upstash
// 失败时降级返回空，不抛错（与天翼云 tianyiSessionStore 的容错策略一致）
let kv: Redis | null = null
let initError: string | null = null
try {
  if (process.env.REDIS_URL) {
    kv = new Redis(process.env.REDIS_URL)
  } else {
    initError = 'REDIS_URL 未配置'
  }
} catch (e: any) {
  initError = e?.message || String(e)
}

// 使用 od: 前缀，避免与天翼云会话 key（tianyi:session:）冲突
const PREFIX = `${siteConfig.kvPrefix}od:`

export async function getOdAuthTokens(): Promise<{ accessToken: unknown; refreshToken: unknown }> {
  if (!kv) {
    console.warn('[odAuthTokenStore] Redis 不可用:', initError)
    return { accessToken: null, refreshToken: null }
  }
  try {
    const accessToken = await kv.get(`${PREFIX}access_token`)
    const refreshToken = await kv.get(`${PREFIX}refresh_token`)
    return { accessToken, refreshToken }
  } catch (e: any) {
    console.warn('[odAuthTokenStore] 读取 token 失败:', e?.message)
    return { accessToken: null, refreshToken: null }
  }
}

export async function storeOdAuthTokens({
  accessToken,
  accessTokenExpiry,
  refreshToken,
}: {
  accessToken: string
  accessTokenExpiry: number
  refreshToken: string
}): Promise<void> {
  if (!kv) {
    console.warn('[odAuthTokenStore] Redis 不可用，跳过存储:', initError)
    return
  }
  try {
    await kv.set(`${PREFIX}access_token`, accessToken, 'EX', accessTokenExpiry)
    await kv.set(`${PREFIX}refresh_token`, refreshToken)
  } catch (e: any) {
    console.warn('[odAuthTokenStore] 存储 token 失败:', e?.message)
  }
}

export function getOdRedisStatus() {
  return { initialized: Boolean(kv), error: initError }
}

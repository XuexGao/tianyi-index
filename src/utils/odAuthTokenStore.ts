import Redis from 'ioredis'
import siteConfig from '../../config/site.config'

// Persistent key-value store is provided by Redis, hosted on Upstash
// https://vercel.com/integrations/upstash
// 失败时降级返回空，不抛错（与天翼云 tianyiSessionStore 的容错策略一致）
let kv: Redis | null = null
let initError: string | null = null
try {
  if (process.env.REDIS_URL) {
    kv = new Redis(process.env.REDIS_URL, {
      // serverless 冷启动：允许离线队列，避免连接未就绪时命令直接失败 → token 读空 → 403
      retryStrategy: times => (times > 3 ? null : Math.min(times * 150, 1000)),
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
      lazyConnect: false,
      connectTimeout: 8000,
    })
    kv.on('error', err => {
      console.warn('[odAuthTokenStore] Redis error:', err?.message || err)
    })
  } else {
    initError = 'REDIS_URL 未配置'
  }
} catch (e: any) {
  initError = e?.message || String(e)
}

// 使用 od: 前缀，避免与天翼云会话 key（tianyi:session:）冲突
const PREFIX = `${siteConfig.kvPrefix}od:`
const REFRESH_LOCK_KEY = `${PREFIX}refresh_lock`

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 等 Redis ready；冷启动时避免立刻 get 失败 */
async function ensureRedis(timeoutMs = 5000): Promise<Redis | null> {
  const client = kv
  if (!client) return null
  if (client.status === 'ready') return client

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      cleanup()
      resolve(client.status === 'ready' ? client : null)
    }, timeoutMs)

    const onReady = () => {
      cleanup()
      resolve(client)
    }
    const onEnd = () => {
      cleanup()
      resolve(null)
    }
    const cleanup = () => {
      clearTimeout(timer)
      client.off('ready', onReady)
      client.off('end', onEnd)
      client.off('close', onEnd)
    }

    client.once('ready', onReady)
    client.once('end', onEnd)
    client.once('close', onEnd)

    // 已在 connecting 时只等事件；否则尝试 ping 触发连接
    if (client.status === 'wait') {
      client.connect().catch(() => {})
    }
  })
}

export async function getOdAuthTokens(): Promise<{ accessToken: unknown; refreshToken: unknown }> {
  const client = await ensureRedis()
  if (!client) {
    console.warn('[odAuthTokenStore] Redis 不可用:', initError || kv?.status)
    return { accessToken: null, refreshToken: null }
  }

  // 冷启动偶发失败：短重试
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [accessToken, refreshToken] = await client.mget(`${PREFIX}access_token`, `${PREFIX}refresh_token`)
      return { accessToken, refreshToken }
    } catch (e: any) {
      console.warn(`[odAuthTokenStore] 读取 token 失败 (try ${attempt + 1}):`, e?.message)
      if (attempt < 2) await sleep(150 * (attempt + 1))
    }
  }
  return { accessToken: null, refreshToken: null }
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
  const client = await ensureRedis()
  if (!client) {
    console.warn('[odAuthTokenStore] Redis 不可用，跳过存储:', initError)
    return
  }
  try {
    // 提前 5 分钟过期，避免临界点仍用将失效的 access token 打 Graph 拿 401
    const ttl = Math.max(60, accessTokenExpiry - 300)
    const pipeline = client.pipeline()
    pipeline.set(`${PREFIX}access_token`, accessToken, 'EX', ttl)
    pipeline.set(`${PREFIX}refresh_token`, refreshToken)
    await pipeline.exec()
  } catch (e: any) {
    console.warn('[odAuthTokenStore] 存储 token 失败:', e?.message)
  }
}

/** 跨 serverless 实例互斥刷新，防止 refresh_token 轮换竞态 */
export async function acquireOdRefreshLock(ttlSec = 25): Promise<boolean> {
  const client = await ensureRedis()
  if (!client) return true // 无 Redis 时退化为进程内锁
  try {
    const ok = await client.set(REFRESH_LOCK_KEY, String(Date.now()), 'EX', ttlSec, 'NX')
    return ok === 'OK'
  } catch {
    return true
  }
}

export async function releaseOdRefreshLock(): Promise<void> {
  const client = await ensureRedis()
  if (!client) return
  try {
    await client.del(REFRESH_LOCK_KEY)
  } catch {
    // ignore
  }
}

/** 强制丢掉 access token，下次走 refresh */
export async function clearOdAccessToken(): Promise<void> {
  const client = await ensureRedis()
  if (!client) return
  try {
    await client.del(`${PREFIX}access_token`)
  } catch (e: any) {
    console.warn('[odAuthTokenStore] 清除 access token 失败:', e?.message)
  }
}

export function getOdRedisStatus() {
  return { initialized: Boolean(kv), status: kv?.status ?? null, error: initError }
}

/**
 * 123 云盘会话令牌的 Redis 存取。
 * JWT 长期有效（数周），失效由 pan123Client 的 401 重登逻辑兜底，
 * 因此这里不做 TTL 管理，仅做持久化与主动清除。
 */

import Redis from 'ioredis'

import siteConfig from '../../config/site.config'
import { logRedisError, redisConnectionOptions } from './redisOptions'

let kv: Redis | null = null
let initError: string | null = null
try {
  if (process.env.REDIS_URL) {
    kv = new Redis(process.env.REDIS_URL, redisConnectionOptions())
    kv.on('error', logRedisError('p123TokenStore'))
  } else {
    initError = 'REDIS_URL 未配置'
  }
} catch (e: any) {
  initError = e?.message || String(e)
}

const TOKEN_KEY = `${siteConfig.kvPrefix}p123:access_token`

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
    const cleanup = () => {
      clearTimeout(timer)
      client.off('ready', onReady)
    }
    client.once('ready', onReady)
    if (client.status === 'wait') {
      client.connect().catch(() => {})
    }
  })
}

export async function getP123Token(): Promise<string | null> {
  const client = await ensureRedis()
  if (!client) return null
  try {
    return await client.get(TOKEN_KEY)
  } catch {
    return null
  }
}

export async function setP123Token(token: string): Promise<void> {
  const client = await ensureRedis()
  if (!client) return
  try {
    if (token) {
      await client.set(TOKEN_KEY, token)
    } else {
      await client.del(TOKEN_KEY)
    }
  } catch {
    // 忽略：token 缓存失败只影响下次请求多登录一次
  }
}

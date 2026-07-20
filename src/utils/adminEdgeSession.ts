/**
 * Edge 兼容的管理员 session 校验（基于 Upstash Redis REST API）。
 *
 * 背景：middleware 运行在 Edge Runtime，无法使用 ioredis（依赖 node net/tls）。
 * Upstash Redis 提供 HTTP REST API，可在 Edge Runtime 中调用。
 *
 * 所需环境变量（Vercel 集成 Upstash 时自动注入）：
 * - UPSTASH_REDIS_REST_URL：如 https://xxx.upstash.io
 * - UPSTASH_REDIS_REST_TOKEN：REST 访问 token
 *
 * 容错策略：
 * - 未配置 REST 变量时返回 false（安全默认：拒绝），middleware 会回退到 cookie 存在性检查；
 * - 网络错误时返回 false，避免伪造 cookie 通过；
 * - 注意：此模块仅在 middleware 调用，不影响 API 路由（API 路由用 ioredis 真校验）。
 */

const SESSION_PREFIX = 'admin:session:'

interface UpstashGetResponse {
  result: string | null
  error?: string
}

/**
 * 调用 Upstash Redis REST API 执行 GET。
 * 文档：https://docs.upstash.com/redis/features/restapi
 */
async function upstashGet(key: string): Promise<string | null> {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!baseUrl || !token) return null

  try {
    const url = `${baseUrl.replace(/\/$/, '')}/get/${encodeURIComponent(key)}`
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      // session 状态必须实时，不使用缓存
      cache: 'no-store',
    })
    if (!resp.ok) return null
    const data = (await resp.json()) as UpstashGetResponse
    return data.result
  } catch {
    return null
  }
}

/**
 * 在 Edge Runtime 中校验 admin session token 是否真实存在于 Redis。
 *
 * 注意：此处仅做"存在性"校验（GET key），不续期。
 * 续期逻辑由 API 路由的 verifyAdminSession 完成（ioredis，每次访问续期）。
 * 这样可以减少 middleware 中的 Redis 写入，降低 Upstash 请求数。
 *
 * @returns true=有效 session；false=无效/未配置/网络错误
 */
export async function verifyAdminSessionEdge(token: string | undefined | null): Promise<boolean> {
  if (!token) return false

  const kvPrefix = process.env.KV_PREFIX || ''
  const key = `${kvPrefix}${SESSION_PREFIX}${token}`
  const raw = await upstashGet(key)
  return Boolean(raw)
}

/**
 * Upstash REST 是否已配置（用于诊断/降级判断）。
 */
export function isEdgeSessionCheckerConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

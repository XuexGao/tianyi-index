/**
 * 天翼云请求 User-Agent 管理。
 *
 * 替代原硬编码单一 UA 的方案：
 * - 单一 UA 长期使用容易被风控识别为爬虫；
 * - 版本号过旧（Chrome/120）也可能被风控；
 * - 维护一组近期主流 UA 随机选用，降低被风控概率。
 *
 * 策略：
 * 1. 优先用环境变量 TIANYI_UA（管理员可固定 UA 用于排查问题）；
 * 2. 否则从 UA 池中随机选一个，1 小时缓存一次（同实例内一致，便于排查）；
 * 3. UA 池可在此处手动更新（更新频率建议：每 6-12 个月）。
 *
 * 注意：UA 池中所有 UA 均为桌面浏览器主流 UA，避免移动端 UA 触发不同的接口分支。
 */

const UA_POOL: string[] = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
]

const ROTATE_INTERVAL_MS = 60 * 60 * 1000 // 1 小时轮换一次

let cachedUA: string | null = null
let cacheExpiry = 0

/**
 * 获取天翼云请求 User-Agent。
 *
 * - 优先环境变量 TIANYI_UA（管理员可固定用于排查）
 * - 否则从 UA 池中随机选一个，1 小时缓存（同实例内一致，便于日志排查）
 */
export function getTianyiUserAgent(): string {
  // 环境变量优先：管理员排查问题时可固定 UA
  const envUA = process.env.TIANYI_UA
  if (envUA && envUA.trim()) {
    return envUA.trim()
  }

  const now = Date.now()
  if (cachedUA && now < cacheExpiry) {
    return cachedUA
  }
  // 随机选一个 UA，1 小时缓存一次
  cachedUA = UA_POOL[Math.floor(Math.random() * UA_POOL.length)]
  cacheExpiry = now + ROTATE_INTERVAL_MS
  return cachedUA
}

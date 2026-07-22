/**
 * 管理员认证相关常量和工具
 */

// cookie 名称
export const ADMIN_COOKIE_NAME = 'admin_session'

export function isSameOriginReq(req: { headers: { origin?: string; host?: string } }): boolean {
  const origin = req.headers.origin
  if (!origin) return false
  const host = req.headers.host
  if (!host) return false
  return origin === `https://${host}` || origin === `http://${host}`
}

// cookie 有效期（7 天，单位秒）
export const ADMIN_COOKIE_MAX_AGE = 7 * 24 * 3600

// cookie 路径（全站）
export const ADMIN_COOKIE_PATH = '/'

/**
 * 从请求中提取 admin session token
 * 仅从 cookie 读取。曾支持 ?admin_token= query 参数，但 query 会经由
 * 访问日志 / 浏览器历史 / Referer 泄露 token，已移除。
 */
export function getTokenFromReq(req: {
  headers: { cookie?: string }
}): string | null {
  const cookieHeader = req.headers.cookie
  if (!cookieHeader) return null

  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === ADMIN_COOKIE_NAME) {
      return v.join('=')
    }
  }
  return null
}

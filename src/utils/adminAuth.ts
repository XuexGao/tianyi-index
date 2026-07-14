/**
 * 管理员认证相关常量和工具
 */

// cookie 名称
export const ADMIN_COOKIE_NAME = 'admin_session'

// cookie 有效期（7 天，单位秒）
export const ADMIN_COOKIE_MAX_AGE = 7 * 24 * 3600

// cookie 路径（全站）
export const ADMIN_COOKIE_PATH = '/'

/**
 * 从请求中提取 admin session token
 * 优先从 cookie 读取，兼容 query 参数（方便某些场景）
 */
export function getTokenFromReq(req: {
  headers: { cookie?: string }
  query?: { admin_token?: string }
}): string | null {
  // 优先 query 参数
  if (req.query?.admin_token && typeof req.query.admin_token === 'string') {
    return req.query.admin_token
  }

  // 从 cookie 读取
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

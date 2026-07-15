/**
 * 服务端专用：SSR 阶段管理员身份校验。
 *
 * 本模块仅被 getServerSideProps 引用，Next.js 会自动将其从客户端 bundle 中剥离，
 * 因此可以安全地静态 import adminSessionStore（依赖 ioredis / node net, tls）。
 *
 * 切勿将本模块导入到客户端组件或 useIsAdmin.ts（后者被客户端引用）。
 */
import { ADMIN_COOKIE_NAME } from './adminAuth'
import { verifyAdminSession } from './adminSessionStore'

/**
 * 从请求 cookie 提取 token 并真实校验 Redis 中的 session 有效性。
 *
 * 安全：不再仅检查 cookie 是否存在，避免攻击者伪造任意 admin_session cookie
 * 即被 SSR 当作管理员而泄露管理界面结构。
 */
export async function isAdminFromReq(req: any): Promise<boolean> {
  const cookieHeader = req?.headers?.cookie || ''
  let token: string | null = null
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === ADMIN_COOKIE_NAME) {
      token = v.join('=')
      break
    }
  }
  if (!token) return false
  try {
    const payload = await verifyAdminSession(token)
    return Boolean(payload)
  } catch {
    return false
  }
}

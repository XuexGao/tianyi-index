import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ADMIN_COOKIE_NAME } from './utils/adminAuth'
import { verifyAdminSessionEdge, isEdgeSessionCheckerConfigured } from './utils/adminEdgeSession'

/**
 * Next.js Middleware（Edge Runtime）
 *
 * 职责：
 * 1. 保护 /@manage 路由：未登录重定向到 /@login
 * 2. 已登录 /@login 时重定向到 /@manage
 * 3. 为所有页面注入 x-admin-status 头，让前端知道是否登录（用于控制统计加载）
 *
 * 校验策略：
 * - /@manage、/@login 路由：调用 Upstash Redis REST API 做 Edge 真校验（防 cookie 伪造）；
 * - 其他路由：仅检查 cookie 存在性（性能优先，x-admin-status 仅用于前端 UI 切换，
 *   实际权限校验由 API 路由的 ioredis 真校验把关）。
 *
 * 性能考量：每次页面请求都打 Upstash 会增加 ~50-100ms 延迟，因此只在管理路由上做真校验，
 * 其他路由保留 cookie 存在性检查（伪造 cookie 最多看到管理 UI 框架，无法实际操作）。
 *
 * 降级：UPSTASH_REDIS_REST_URL/TOKEN 未配置时，管理路由也回退到 cookie 存在性检查
 * （兼容未启用 Upstash REST 的部署；强烈建议生产环境配置）。
 */

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value
  const cookiePresent = Boolean(token)

  // 兼容 /@manage 和 /_admin-manage 两种路径（rewrite 前后）
  const isManageRoute = pathname.startsWith('/@manage') || pathname.startsWith('/_admin-manage')
  const isLoginRoute = pathname.startsWith('/@login') || pathname.startsWith('/_admin-login')

  // 管理相关路由：启用 Edge 真校验（若 Upstash REST 已配置）
  if (isManageRoute || isLoginRoute) {
    let isValidSession = cookiePresent
    if (cookiePresent && isEdgeSessionCheckerConfigured()) {
      // 调用 Upstash Redis REST API 真校验 session 是否在 Redis 中存在
      isValidSession = await verifyAdminSessionEdge(token)
    }

    // 保护管理页：未登录（或 session 失效）重定向到登录页
    if (isManageRoute && !isValidSession) {
      const loginUrl = req.nextUrl.clone()
      loginUrl.pathname = '/@login'
      loginUrl.searchParams.set('redirect', '/@manage')
      return NextResponse.redirect(loginUrl)
    }

    // 已登录访问登录页，重定向到管理页
    if (isLoginRoute && isValidSession) {
      const manageUrl = req.nextUrl.clone()
      manageUrl.pathname = '/@manage'
      return NextResponse.redirect(manageUrl)
    }

    const res = NextResponse.next()
    if (isValidSession) {
      res.headers.set('x-admin-status', '1')
    }
    return res
  }

  // 其他路由：仅 cookie 存在性检查（性能优先，UI 切换用）
  const res = NextResponse.next()
  if (cookiePresent) {
    res.headers.set('x-admin-status', '1')
  }
  return res
}

export const config = {
  /**
   * 匹配所有路由，但排除：
   * - /api/* （API 路由自己校验）
   * - /_next/* （Next.js 内部资源）
   * - 静态资源
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|android-chrome|images|icons).*)'],
}

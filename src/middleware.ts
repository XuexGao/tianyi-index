import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ADMIN_COOKIE_NAME } from './utils/adminAuth'

/**
 * Next.js Middleware
 *
 * 职责：
 * 1. 保护 /@manage 路由：未登录重定向到 /@login
 * 2. 已登录 /@login 时重定向到 /@manage
 * 3. 为所有页面注入 x-admin-status 头，让前端知道是否登录（用于控制统计加载）
 *
 * 注意：middleware 在 edge runtime 运行，不能直接访问 Redis。
 * 这里只检查 cookie 是否存在（粗粒度），真正的 session 校验由 API 路由做。
 */

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value
  const isAdmin = Boolean(token)

  // 兼容 /@manage 和 /_admin-manage 两种路径（rewrite 前后）
  const isManageRoute = pathname.startsWith('/@manage') || pathname.startsWith('/_admin-manage')
  const isLoginRoute = pathname.startsWith('/@login') || pathname.startsWith('/_admin-login')

  // 保护管理页
  if (isManageRoute) {
    if (!isAdmin) {
      const loginUrl = req.nextUrl.clone()
      loginUrl.pathname = '/@login'
      loginUrl.searchParams.set('redirect', '/@manage')
      return NextResponse.redirect(loginUrl)
    }
    // 已登录，放行，并注入头
    const res = NextResponse.next()
    res.headers.set('x-admin-status', '1')
    return res
  }

  // 已登录访问登录页，重定向到管理页
  if (isLoginRoute && isAdmin) {
    const manageUrl = req.nextUrl.clone()
    manageUrl.pathname = '/@manage'
    return NextResponse.redirect(manageUrl)
  }

  // 为所有页面注入 admin 状态头，前端用此控制统计加载
  const res = NextResponse.next()
  if (isAdmin) {
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

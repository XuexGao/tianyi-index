import { useEffect, useState } from 'react'
import { ADMIN_COOKIE_NAME } from './adminAuth'

/**
 * 检测当前是否为管理员登录状态（客户端）
 *
 * 通过 /api/auth/check 查询，结果缓存到 sessionStorage 避免重复请求。
 *
 * 重要：useState 的 lazy initializer 会在首次渲染时同步读 sessionStorage
 * 并设置 window.__isAdmin，确保 resolveDrive 等纯函数在首次渲染就能拿到
 * 正确的登录状态。如果用 useEffect 异步设置，首次渲染 window.__isAdmin
 * 还是 undefined，会导致 driveResolver 返回错误的 drive 类型，引发：
 * - 闪现未登录内容（先请求天翼云根目录，再切换到虚拟根）
 * - 组件 re-mount 后状态丢失（key={asPath} 触发重新挂载）
 *
 * @param ssrInitial SSR 传入的初始值（从 getServerSideProps 读取 cookie 判断）。
 *                   仅在客户端首次渲染且 sessionStorage 无缓存时使用。
 *                   避免 SSR 渲染 false、hydrate 后异步变 true 导致的闪现。
 *
 * 后台仍会 fetch /api/auth/check 校验 session 有效性（可能已过期），
 * 如果校验失败会回滚到 false。
 */
function initIsAdmin(ssrInitial?: boolean): boolean {
  if (typeof window === 'undefined') return ssrInitial ?? false
  // 优先用 sessionStorage 缓存（客户端导航时同步可用）
  const cached = sessionStorage.getItem('admin_status')
  if (cached !== null) {
    const admin = cached === '1'
    ;(window as any).__isAdmin = admin
    return admin
  }
  // sessionStorage 无缓存（首次访问/刷新），用 SSR 传入的初始值
  if (ssrInitial !== undefined) {
    ;(window as any).__isAdmin = ssrInitial
    return ssrInitial
  }
  return false
}

export function useIsAdmin(ssrInitial?: boolean): boolean {
  const [isAdmin, setIsAdmin] = useState(() => initIsAdmin(ssrInitial))

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/check/', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const admin = Boolean(data.isAdmin)
        setIsAdmin(admin)
        ;(window as any).__isAdmin = admin
        sessionStorage.setItem('admin_status', admin ? '1' : '0')
      })
      .catch(() => {
        // 忽略错误，保持当前状态
      })

    return () => {
      cancelled = true
    }
  }, [])

  return isAdmin
}

/**
 * 从请求 cookie 判断是否管理员登录（供 getServerSideProps 使用）
 * 粗粒度：只检查 cookie 存在性，真正的 session 校验由 API 路由做。
 */
export function isAdminFromReq(req: any): boolean {
  const cookieHeader = req?.headers?.cookie || ''
  return cookieHeader
    .split(';')
    .some((part: string) => part.trim().startsWith(`${ADMIN_COOKIE_NAME}=`))
}

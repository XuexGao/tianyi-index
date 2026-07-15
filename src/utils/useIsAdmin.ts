import { useEffect, useState } from 'react'

/**
 * 检测当前是否为管理员登录状态（客户端）
 *
 * 状态来源优先级（客户端）：
 *   1. window.__isAdmin（由前一次渲染或登录页设置，客户端导航时同步可用）
 *   2. ssrInitial（SSR 从 cookie 判断，刷新页面时同步可用）
 *
 * 不再使用 sessionStorage 缓存，因为它可能与 cookie 状态不一致，
 * 导致 SSR 渲染 true（cookie 存在）而客户端 hydration 返回 false
 * （sessionStorage 缓存 0），引发 hydration mismatch。
 *
 * 后台仍会 fetch /api/auth/check 校验 session 是否过期。
 *
 * @param ssrInitial SSR 传入的初始值（从 getServerSideProps 读取 cookie 判断）。
 */
function initIsAdmin(ssrInitial?: boolean): boolean {
  if (typeof window === 'undefined') return ssrInitial ?? false
  // 优先用 window.__isAdmin（客户端导航时由前一次渲染设置，同步可用）
  if ((window as any).__isAdmin !== undefined) {
    return Boolean((window as any).__isAdmin)
  }
  // 首次访问/刷新：用 SSR 传入的初始值，保持与 SSR 一致避免 hydration mismatch
  const admin = ssrInitial ?? false
  ;(window as any).__isAdmin = admin
  return admin
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

// 注意：SSR 阶段的管理员校验已迁移到 src/utils/ssrAdmin.ts（服务端专用）。
// 本文件被客户端组件引用，不可 import adminSessionStore（依赖 ioredis / node net, tls）。

import { useEffect, useState } from 'react'

/**
 * 检测当前是否为管理员登录状态（客户端）
 *
 * 通过 /api/auth/check 查询，结果缓存到 sessionStorage 避免重复请求。
 * middleware 注入的 x-admin-status 头只能用于 SSR，客户端导航时拿不到，
 * 所以用这个 hook 做客户端检测。
 *
 * 首次访问（SSR 渲染）时还没有结果，返回 false（保守），
 * 客户端 hydrate 后发起请求，更新状态。
 *
 * 结果同步写入 window.__isAdmin，供 driveResolver 等纯函数读取。
 */
export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    // 先从 sessionStorage 读缓存，避免每次导航都请求
    if (typeof window !== 'undefined') {
      const cached = sessionStorage.getItem('admin_status')
      if (cached === '1') {
        setIsAdmin(true)
        ;(window as any).__isAdmin = true
      }
    }

    let cancelled = false
    fetch('/api/auth/check/', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const admin = Boolean(data.isAdmin)
        setIsAdmin(admin)
        ;(window as any).__isAdmin = admin
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('admin_status', admin ? '1' : '0')
        }
      })
      .catch(() => {
        // 忽略错误，保持 false
      })

    return () => {
      cancelled = true
    }
  }, [])

  return isAdmin
}

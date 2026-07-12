import { useEffect, useState } from 'react'

/**
 * 背景图组件：
 * - 通过同源代理 /api/wallpaper/ fetch 图片，一次请求同时拿到图片和亮度（X-Bg-Dark 响应头）
 * - 用 blob URL 显示图片，保证显示的图和采样的图是同一张
 * - 亮度结果通过全局事件 'bg-dark-change' 通知 Navbar
 *
 * 注意：不能用普通 <img src> + crossOrigin，因为那样拿不到响应头。
 * 用 fetch 才能同时拿到 blob 和响应头。
 */
export default function BackgroundImage() {
  const [src, setSrc] = useState<string>('')

  useEffect(() => {
    let url: string | null = null
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/wallpaper/', { cache: 'no-store' })
        if (!res.ok) return
        const isDark = res.headers.get('X-Bg-Dark') === '1'
        const blob = await res.blob()
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setSrc(url)
        window.dispatchEvent(new CustomEvent('bg-dark-change', { detail: { isDark } }))
      } catch (e) {
        console.warn('[bg-image]', e)
      }
    }

    load()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [])

  return (
    <div id="bg-wallpaper" aria-hidden="true">
      {src && <img id="bg-wallpaper-img" src={src} alt="" />}
    </div>
  )
}

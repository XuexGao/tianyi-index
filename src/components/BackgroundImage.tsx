import { useEffect, useState } from 'react'

/**
 * 背景图组件：
 * - 通过同源代理 /api/wallpaper/ fetch 图片，一次请求同时拿到图片和亮度（X-Bg-Dark 响应头）
 * - 用 blob URL 显示图片，保证显示的图和采样的图是同一张
 * - 亮度结果存到 window.__bgDark，并通过全局事件 'bg-dark-change' 通知 Navbar
 *
 * 性能优化：
 * - 模块级提前 fetch：在 _app.tsx import 本模块时就发起请求，省去组件挂载 + useEffect 调度延迟。
 *   这是客户端最早能发起请求的时机（SSR 时 typeof window 检查跳过）。
 * - 不用 cache: 'no-store'：服务端已返回 max-age=60，让浏览器复用 _document 的 preload 响应。
 */

let bgFetchPromise: Promise<Response> | null = null

function startBgFetch(): Promise<Response> | null {
  if (typeof window === 'undefined') return null
  if (!bgFetchPromise) {
    bgFetchPromise = fetch('/api/wallpaper/')
  }
  return bgFetchPromise
}

// 模块加载时立即发起（比 useEffect 早一拍）
startBgFetch()

export default function BackgroundImage() {
  const [src, setSrc] = useState<string>('')

  useEffect(() => {
    let url: string | null = null
    let cancelled = false

    async function load() {
      try {
        const res = await startBgFetch()
        if (!res || !res.ok) return
        const isDark = res.headers.get('X-Bg-Dark') === '1'
        const blob = await res.blob()
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setSrc(url)
        // 存到全局，供后挂载的 Navbar 初始读取
        ;(window as any).__bgDark = isDark
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

import { useEffect, useState } from 'react'

/**
 * 采样背景图顶部区域亮度，返回是否深色背景。
 *
 * 实现说明：
 * - 主壁纸图直连外部源（快），不走代理，避免拖慢加载
 * - 采样时单独通过同源代理 /api/wallpaper/ 加载一张图，
 *   带 crossOrigin 让 canvas 可读，采样顶部条带平均亮度
 * - 采样是辅助功能，慢一点不影响主图显示
 * - 系统暗色模式优先，直接视为深色
 *
 * @returns isDark 是否深色背景（true=需要浅色文字）
 */
export function useBackgroundBrightness(): boolean {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    // 系统暗色模式优先：直接视为深色
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    if (mq.matches) {
      setIsDark(true)
      return
    }

    // 通过同源代理异步加载图片用于采样
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const w = img.naturalWidth
        const h = img.naturalHeight
        if (!w || !h) return

        // 顶部条带：高度取图片顶部 12%（约对应 navbar 区域）
        const stripH = Math.max(1, Math.floor(h * 0.12))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = stripH
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return

        ctx.drawImage(img, 0, 0, w, stripH, 0, 0, w, stripH)
        const data = ctx.getImageData(0, 0, w, stripH).data

        // 计算平均亮度（感知亮度公式）
        let total = 0
        const pixels = data.length / 4
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          total += 0.299 * r + 0.587 * g + 0.114 * b
        }
        const avg = total / pixels
        // 阈值 100：较暗才算深色背景，避免误判
        setIsDark(avg < 100)
      } catch (e) {
        console.warn('[bg-brightness]', e)
      }
    }
    img.onerror = () => {
      // 采样失败，降级为默认
    }
    img.src = '/api/wallpaper/'
  }, [])

  return isDark
}

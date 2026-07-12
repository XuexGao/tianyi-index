import { useEffect, useState } from 'react'

/**
 * 采样背景图顶部区域亮度，返回是否深色背景。
 *
 * 原理：背景图加载完成后，画到 canvas，取顶部条带（navbar 区域）
 * 的像素平均亮度。亮度 < 阈值则视为深色背景，需要浅色文字。
 *
 * 要求背景图 img 带 crossOrigin="anonymous" 且服务端返回 CORS 头，
 * 否则 canvas 会被 tainted，getImageData 抛错，降级为 false（默认深色文字）。
 *
 * @returns isDark 是否深色背景（true=需要浅色文字）
 */
export function useBackgroundBrightness(): boolean {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const img = document.getElementById('bg-wallpaper-img') as HTMLImageElement | null
    if (!img) return

    const sample = () => {
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
        // 阈值 128：低于视为深色背景
        setIsDark(avg < 128)
      } catch (e) {
        // canvas tainted 或其他错误，降级为默认（不深色）
        console.warn('[bg-brightness]', e)
      }
    }

    if (img.complete && img.naturalWidth > 0) {
      sample()
    } else {
      img.addEventListener('load', sample, { once: true })
    }
  }, [])

  return isDark
}

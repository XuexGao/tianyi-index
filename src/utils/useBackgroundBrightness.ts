import { useEffect, useState } from 'react'

/**
 * 监听背景图亮度变化，返回是否深色背景。
 *
 * 亮度由 BackgroundImage 组件通过 /api/wallpaper 服务端计算，
 * 通过全局事件 'bg-dark-change' 通知。这样保证采样结果和显示的图是同一张。
 *
 * 系统暗色模式优先：直接视为深色。
 *
 * @returns isDark 是否深色背景（true=需要浅色文字）
 */
export function useBackgroundBrightness(): boolean {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    // 系统暗色模式优先：直接视为深色
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onMq = (e: MediaQueryListEvent) => setIsDark(e.matches)
    if (mq.matches) {
      setIsDark(true)
    } else {
      // 系统非暗色时，监听背景图亮度事件
      const onBg = (e: Event) => {
        const detail = (e as CustomEvent).detail
        setIsDark(Boolean(detail?.isDark))
      }
      window.addEventListener('bg-dark-change', onBg)
      return () => {
        window.removeEventListener('bg-dark-change', onBg)
        mq.removeEventListener('change', onMq)
      }
    }
    mq.addEventListener('change', onMq)
    return () => mq.removeEventListener('change', onMq)
  }, [])

  return isDark
}

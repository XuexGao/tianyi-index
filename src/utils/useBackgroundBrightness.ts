import { useEffect, useState } from 'react'

/**
 * 监听背景图亮度变化，返回是否深色背景。
 *
 * 亮度由 BackgroundImage 组件在图片加载后采样计算，
 * 通过全局事件 'bg-dark-change' 通知，同时存到 window.__bgDark。
 *
 * 策略：先看系统暗色模式，如果未启用则根据背景图片亮度判断。
 * 系统暗色模式不覆盖图片亮度判断——即使系统是暗色模式，
 * 如果背景图片很亮，文字仍然需要暗色以保持可读性。
 *
 * @returns isDark 是否深色背景（true=需要浅色文字）
 */
export function useBackgroundBrightness(): boolean {
  // 初始化时先读全局，避免错过事件
  const [isDark, setIsDark] = useState<boolean>(false)

  useEffect(() => {
    // 先读全局缓存
    if ((window as any).__bgDark !== undefined) {
      setIsDark(Boolean((window as any).__bgDark))
    }

    // 监听后续变化
    const onBg = (e: Event) => {
      const detail = (e as CustomEvent).detail
      setIsDark(Boolean(detail?.isDark))
    }
    window.addEventListener('bg-dark-change', onBg)
    return () => window.removeEventListener('bg-dark-change', onBg)
  }, [])

  return isDark
}

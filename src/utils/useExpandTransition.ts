import { useState, useEffect, useRef } from 'react'

// Loading 卡片高度：py-16 (64px*2) + 文字行高约 20px ≈ 148px
// 用于 measuring 阶段作为展开过渡的起点
const LOADING_H = 148

/**
 * 加载展开过渡动画 hook
 *
 * 状态机：loading → measuring → expanding → done
 * - loading：显示 Loading 文字撑开容器，不限制高度
 * - measuring：数据到了，渲染内容（opacity 0 占位），测量内容真实高度
 * - expanding：max-height 从 LOADING_H → 内容高度平滑过渡，Loading 淡出，内容淡入
 * - done：过渡完成，正常显示
 *
 * 关键设计：
 * 1. maxH 用 null 表示"不限制高度"（max-height: none），数字表示受控
 *    - loading 阶段 maxH=null，容器由 Loading 文字自然撑开
 *    - measuring/expanding 阶段 maxH=数字，平滑过渡
 * 2. measuring 阶段分两步设 maxH：
 *    - 第一步 maxH=LOADING_H（从 none→数字，浏览器不过渡，视觉无变化）
 *    - 第二步 maxH=内容高度（数字→数字，触发平滑展开过渡）
 *
 * @param isLoading 是否正在加载
 * @returns { ref, phase, maxH } ref 绑到容器 div，phase 控制内容/Loading 显隐，maxH 设到容器 style.maxHeight
 */
export function useExpandTransition(isLoading: boolean) {
  const [phase, setPhase] = useState<'loading' | 'measuring' | 'expanding' | 'done'>('loading')
  // null = max-height: none（不限制，loading 阶段用）；数字 = 受控（过渡用）
  const [maxH, setMaxH] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const transitionedRef = useRef(false)

  // 新一次加载（isLoading 变 true）时回到 loading
  useEffect(() => {
    if (isLoading) {
      transitionedRef.current = false
      setPhase('loading')
      setMaxH(null)
    }
  }, [isLoading])

  // 数据加载完成 → measuring：渲染内容层（opacity 0），下一帧测内容真实高度
  useEffect(() => {
    if (!isLoading && !transitionedRef.current) {
      transitionedRef.current = true
      setPhase('measuring')
    }
  }, [isLoading])

  // measuring 阶段：内容已渲染但不可见（opacity 0），测量内容真实高度
  // 关键：max-height 从 none 切到数字无法 CSS 过渡，所以分两步：
  // 1. 先设 maxH = LOADING_H（loading 卡片高度，从 none→数字无视觉变化，因为
  //    此时 Loading 是 absolute 不占高度，内容 in-flow 但被 max-height 裁到 LOADING_H）
  // 2. 下一帧设 maxH = 内容实际高度（数字→数字，触发平滑展开过渡）
  useEffect(() => {
    if (phase === 'measuring' && ref.current) {
      const measure = () => {
        if (ref.current && phase === 'measuring') {
          // scrollHeight = 内容真实高度（内容 in-flow 撑开，不受 max-height 影响）
          const targetH = ref.current.scrollHeight
          // 先锁定到 loading 卡片高度作为过渡起点
          setMaxH(LOADING_H)
          // 下一帧设为内容高度，触发展开过渡
          requestAnimationFrame(() => {
            setMaxH(targetH)
            setPhase('expanding')
          })
        }
      }
      // 双 rAF：第一帧 React 提交内容 DOM，第二帧布局完成测量才准确
      requestAnimationFrame(() => requestAnimationFrame(measure))
    }
  }, [phase])

  // expanding → done：等过渡动画完成后收尾，解除 max-height 限制
  useEffect(() => {
    if (phase === 'expanding') {
      const t = setTimeout(() => {
        setPhase('done')
        setMaxH(null) // 解除限制，避免超长内容被裁
      }, 900)
      return () => clearTimeout(t)
    }
  }, [phase])

  return { ref, phase, maxH }
}

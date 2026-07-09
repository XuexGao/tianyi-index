import { useState, useEffect, useRef } from 'react'

/**
 * 加载展开过渡动画 hook
 *
 * 状态机：loading → measuring → expanding → done
 * - loading：显示 Loading 文字撑开容器，测量此时高度作为过渡起点
 * - measuring：数据到了，渲染内容（opacity 0 占位），测量内容真实高度
 * - expanding：max-height 从 loading 高度 → 内容高度平滑过渡，Loading 淡出，内容淡入
 * - done：过渡完成，正常显示
 *
 * 关键：maxH 始终是数字（不用 null/none），否则 max-height: none ↔ 数字之间无法 CSS 过渡。
 * loading 和 measuring 各测一次高度，保证"加载框比内容大"和"比内容小"两种情况都有动画。
 *
 * @param isLoading 是否正在加载
 * @returns { ref, phase, maxH } ref 绑到容器 div，phase 控制内容/Loading 显隐，maxH 设到容器 style.maxHeight
 */
export function useExpandTransition(isLoading: boolean) {
  const [phase, setPhase] = useState<'loading' | 'measuring' | 'expanding' | 'done'>('loading')
  const [maxH, setMaxH] = useState<number>(0)
  const ref = useRef<HTMLDivElement>(null)
  const transitionedRef = useRef(false)

  // 新一次加载（isLoading 变 true）时回到 loading，maxH 归零触发重新测量
  useEffect(() => {
    if (isLoading) {
      transitionedRef.current = false
      setPhase('loading')
      setMaxH(0)
    }
  }, [isLoading])

  // loading 阶段：测量容器（此时只有 Loading 文字撑开）的实际高度，作为过渡起点
  useEffect(() => {
    if (phase === 'loading' && ref.current) {
      const measure = () => {
        if (ref.current && ref.current.scrollHeight > 0) {
          setMaxH(ref.current.scrollHeight)
        }
      }
      // 双 rAF：第一帧 React 提交 DOM，第二帧布局完成，测量才准确
      requestAnimationFrame(() => requestAnimationFrame(measure))
    }
  }, [phase])

  // 数据加载完成 → measuring：渲染内容层（opacity 0），下一帧测内容真实高度
  useEffect(() => {
    if (!isLoading && !transitionedRef.current) {
      transitionedRef.current = true
      setPhase('measuring')
    }
  }, [isLoading])

  // measuring 阶段：内容已渲染但不可见，测量容器此时（含内容）的实际高度，然后进入 expanding
  useEffect(() => {
    if (phase === 'measuring') {
      const measure = () => {
        if (ref.current) {
          setMaxH(ref.current.scrollHeight)
          setPhase('expanding')
        }
      }
      requestAnimationFrame(() => requestAnimationFrame(measure))
    }
  }, [phase])

  // expanding → done：等过渡动画完成后收尾
  useEffect(() => {
    if (phase === 'expanding') {
      const t = setTimeout(() => setPhase('done'), 900)
      return () => clearTimeout(t)
    }
  }, [phase])

  return { ref, phase, maxH }
}

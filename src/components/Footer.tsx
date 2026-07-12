import { useEffect, useState } from 'react'

// 构建期由 next.config.js 注入：process.env.NEXT_PUBLIC_GIT_COMMIT_HASH / NEXT_PUBLIC_BUILD_DATE
const currentYear = new Date().getFullYear()
const commitHash = process.env.NEXT_PUBLIC_GIT_COMMIT_HASH || 'unknown'
const buildDate = process.env.NEXT_PUBLIC_BUILD_DATE || 'unknown'

// 访问量统计（从原 _app.tsx UmamiFooter 合并而来）
function VisitStats() {
  const [entered, setEntered] = useState(false)
  const [today, setToday] = useState<number | null>(null)
  const [total, setTotal] = useState<number | null>(null)

  useEffect(() => {
    const shareId = process.env.NEXT_PUBLIC_UMAMI_SHARE_ID || ''
    const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || ''
    const baseUrl = process.env.NEXT_PUBLIC_UMAMI_BASE_URL || ''

    if (!shareId || !websiteId || !baseUrl) return

    requestAnimationFrame(() => setEntered(true))

    function animateValue(setter: (n: number) => void, end: number) {
      let startTs: number | null = null
      const duration = 800
      const step = (ts: number) => {
        if (!startTs) startTs = ts
        const progress = Math.min((ts - startTs) / duration, 1)
        setter(Math.floor(progress * end))
        if (progress < 1) window.requestAnimationFrame(step)
        else setter(end)
      }
      window.requestAnimationFrame(step)
    }

    async function fetchStats() {
      try {
        const tokenRes = await fetch(`${baseUrl}/api/share/${shareId}`)
        if (!tokenRes.ok) return
        const { token, websiteId: wid = websiteId } = await tokenRes.json()

        const now = Date.now()
        const startOfDay = new Date()
        startOfDay.setHours(0, 0, 0, 0)
        const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)
        const headers = { 'x-umami-share-token': token }

        const [todayRes, totalRes] = await Promise.all([
          fetch(
            `${baseUrl}/api/websites/${wid}/stats?startAt=${startOfDay.getTime()}&endAt=${now}&unit=hour&timezone=${tz}&compare=false`,
            { headers }
          ),
          fetch(
            `${baseUrl}/api/websites/${wid}/stats?startAt=0&endAt=${now}&unit=hour&timezone=${tz}&compare=false`,
            { headers }
          ),
        ])
        if (todayRes.ok) {
          const d = await todayRes.json()
          animateValue(setToday, d.pageviews?.value ?? d.pageviews ?? 0)
        }
        if (totalRes.ok) {
          const d = await totalRes.json()
          animateValue(setTotal, d.pageviews?.value ?? d.pageviews ?? 0)
        }
      } catch (e) {
        console.warn('[umami-footer]', e)
      }
    }

    fetchStats()
  }, [])

  // 未配置 Umami 环境变量时不渲染
  if (
    !process.env.NEXT_PUBLIC_UMAMI_SHARE_ID ||
    !process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ||
    !process.env.NEXT_PUBLIC_UMAMI_BASE_URL
  ) {
    return null
  }

  return (
    <span
      className={`od-footer-stats inline-flex items-center gap-2 transition-opacity duration-700 ${
        entered ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <span>
        今日访问 <b>{today ?? '--'}</b> 次
      </span>
      <span className="od-footer-divider">/</span>
      <span>
        累计访问 <b>{total ?? '--'}</b> 次
      </span>
    </span>
  )
}

const Footer = () => {
  return (
    <div className="mx-auto w-fit max-w-[42rem] px-2 pb-4 pt-4 sm:px-3">
      <div className="od-footer-card rounded-xl px-4 py-4 text-center text-[11px] leading-relaxed">
        <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 text-gray-600 dark:text-gray-300">
          <span>&copy; 2024 - {currentYear}</span>
          <a
            className="font-medium text-blue-500 transition hover:opacity-80"
            target="_blank"
            href="https://github.com/XuexGao"
            rel="noopener noreferrer"
          >
            XuexGao
          </a>
          <span>，采用</span>
          <a
            className="font-medium text-blue-500 transition hover:opacity-80"
            target="_blank"
            href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
            rel="noopener noreferrer"
          >
            CC BY-NC-SA 4.0
          </a>
          <span>许可</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 text-gray-600 dark:text-gray-300">
          <a
            className="font-medium text-blue-500 transition hover:opacity-80"
            target="_blank"
            href="/rss.xml"
            rel="noopener noreferrer"
          >
            RSS
          </a>
          <span className="od-footer-divider">/</span>
          <a
            className="font-medium text-blue-500 transition hover:opacity-80"
            target="_blank"
            href="/sitemap.xml"
            rel="noopener noreferrer"
          >
            网站地图
          </a>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 text-gray-600 dark:text-gray-300">
          <VisitStats />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 text-gray-600 dark:text-gray-300">
          <span>本网站代码</span>
          <a
            className="font-medium text-blue-500 transition hover:opacity-80"
            target="_blank"
            href="https://github.com/XuexGao/tianyi-index"
            rel="noopener noreferrer"
          >
            已开源
          </a>
          <a
            className="text-[10px] text-gray-600 transition hover:text-blue-500 dark:text-gray-300"
            target="_blank"
            href={`https://github.com/XuexGao/tianyi-index/commit/${commitHash}`}
            rel="noopener noreferrer"
          >
            ({commitHash} @ {buildDate})
          </a>
        </div>
      </div>
    </div>
  )
}

export default Footer

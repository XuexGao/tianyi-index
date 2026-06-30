import '@fortawesome/fontawesome-svg-core/styles.css'

import '../styles/globals.css'
import '../styles/markdown-github.css'
import '../styles/glassmorphism.css'
import { Analytics } from '@vercel/analytics/react'
import { useEffect, useState } from 'react'

const { library, config } = require('@fortawesome/fontawesome-svg-core')
config.autoAddCss = false

import {
  faFileImage,
  faFilePdf,
  faFileWord,
  faFilePowerpoint,
  faFileExcel,
  faFileAudio,
  faFileVideo,
  faFileArchive,
  faFileCode,
  faFileAlt,
  faFile,
  faFolder,
  faCopy,
  faArrowAltCircleDown,
  faTrashAlt,
  faEnvelope,
  faFlag,
  faCheckCircle,
} from '@fortawesome/free-regular-svg-icons'
import {
  faSearch,
  faPen,
  faCheck,
  faPlus,
  faMinus,
  faCopy as faCopySolid,
  faAngleRight,
  faDownload,
  faMusic,
  faArrowLeft,
  faArrowRight,
  faFileDownload,
  faUndo,
  faBook,
  faKey,
  faSignOutAlt,
  faCloud,
  faChevronCircleDown,
  faChevronDown,
  faLink,
  faExternalLinkAlt,
  faExclamationCircle,
  faExclamationTriangle,
  faTh,
  faThLarge,
  faThList,
  faHome,
  faLanguage,
  faCube,
} from '@fortawesome/free-solid-svg-icons'
import * as Icons from '@fortawesome/free-brands-svg-icons'

import type { AppProps } from 'next/app'
import NextNProgress from 'nextjs-progressbar'
import { appWithTranslation } from 'next-i18next'

const iconList = Object.keys(Icons)
  .filter(k => k !== 'fab' && k !== 'prefix')
  .map(icon => Icons[icon])

library.add(
  faFileImage, faFilePdf, faFileWord, faFilePowerpoint, faFileExcel,
  faFileAudio, faFileVideo, faFileArchive, faFileCode, faFileAlt,
  faFile, faFlag, faFolder, faMusic, faArrowLeft, faArrowRight,
  faAngleRight, faFileDownload, faCopy, faCopySolid, faPlus, faMinus,
  faDownload, faLink, faUndo, faBook, faArrowAltCircleDown, faKey,
  faTrashAlt, faSignOutAlt, faEnvelope, faCloud, faChevronCircleDown,
  faExternalLinkAlt, faExclamationCircle, faExclamationTriangle,
  faHome, faCheck, faCheckCircle, faSearch, faChevronDown,
  faTh, faThLarge, faThList, faLanguage, faPen, faCube,
  ...iconList
)

// Umami 访问统计
function UmamiFooter() {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const shareId   = process.env.NEXT_PUBLIC_UMAMI_SHARE_ID || ''
    const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || ''
    const baseUrl   = process.env.NEXT_PUBLIC_UMAMI_BASE_URL || ''

    // 未配置 Umami 环境变量，不执行任何逻辑
    if (!shareId || !websiteId || !baseUrl) return

    // 入口动画：延迟一帧后从底部弹出
    requestAnimationFrame(() => setEntered(true))

    function animateValue(el: HTMLElement, end: number) {
      let start = 0
      const duration = 800
      let startTs: number | null = null
      const step = (ts: number) => {
        if (!startTs) startTs = ts
        const progress = Math.min((ts - startTs) / duration, 1)
        el.innerHTML = String(Math.floor(progress * end))
        if (progress < 1) window.requestAnimationFrame(step)
        else el.innerHTML = String(end)
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
          fetch(`${baseUrl}/api/websites/${wid}/stats?startAt=${startOfDay.getTime()}&endAt=${now}&unit=hour&timezone=${tz}&compare=false`, { headers }),
          fetch(`${baseUrl}/api/websites/${wid}/stats?startAt=0&endAt=${now}&unit=hour&timezone=${tz}&compare=false`, { headers }),
        ])
        if (todayRes.ok) {
          const d = await todayRes.json()
          const el = document.getElementById('uv-today')
          if (el) animateValue(el, d.pageviews?.value ?? d.pageviews ?? 0)
        }
        if (totalRes.ok) {
          const d = await totalRes.json()
          const el = document.getElementById('uv-total')
          if (el) animateValue(el, d.pageviews?.value ?? d.pageviews ?? 0)
        }
      } catch (e) {
        console.warn('[umami-footer]', e)
      }
    }

    function initScrollHide() {
      let lastY = window.scrollY
      let lastTouchY = 0
      let ticking = false

      window.addEventListener('scroll', () => {
        if (!ticking) {
          window.requestAnimationFrame(() => {
            const el = document.getElementById('umami-footer')
            if (el) {
              const cur = window.scrollY
              if (cur > lastY + 4) el.classList.add('hidden')
              else if (cur < lastY - 4) el.classList.remove('hidden')
              lastY = cur
            }
            ticking = false
          })
          ticking = true
        }
      }, { passive: true })

      window.addEventListener('touchstart', e => { lastTouchY = e.touches[0].clientY }, { passive: true })
      window.addEventListener('touchmove', e => {
        const el = document.getElementById('umami-footer')
        if (!el) return
        const delta = lastTouchY - e.touches[0].clientY
        if (delta > 4) el.classList.add('hidden')
        else if (delta < -4) el.classList.remove('hidden')
        lastTouchY = e.touches[0].clientY
      }, { passive: true })
    }

    fetchStats()
    initScrollHide()
  }, [])

  // 没有配置 Umami 环境变量时不渲染底部统计框
  if (!process.env.NEXT_PUBLIC_UMAMI_SHARE_ID || !process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || !process.env.NEXT_PUBLIC_UMAMI_BASE_URL) {
    return null
  }

  return (
    <div id="umami-footer" className={entered ? '' : 'umami-enter'}>
      <span>今日访问 <b id="uv-today">--</b> 次</span>
      <span>累计访问 <b id="uv-total">--</b> 次</span>
    </div>
  )
}

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      {/* 随机壁纸：用 img 标签比 CSS background-image 更可靠 */}
      <div id="bg-wallpaper" aria-hidden="true">
        <img src="https://api.elaina.cat/random/" alt="" />
      </div>

      <UmamiFooter />
      <NextNProgress height={1} color="rgb(156, 163, 175, 0.9)" options={{ showSpinner: false }} />
      <Analytics />
      <Component {...pageProps} />
    </>
  )
}

export default appWithTranslation(MyApp)

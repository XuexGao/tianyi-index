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

// 内置访问统计（基于 Redis，复用 #umami-footer 的毛玻璃胶囊样式）
// 计数口径：每次"会话首屏"+1（仅在客户端首次进入网站时 POST 一次，路由切换不计数）
function StatsFooter() {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    // 入口动画：延迟一帧后从底部弹出
    requestAnimationFrame(() => setEntered(true))

    function animateValue(el: HTMLElement, end: number) {
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

    async function recordVisit() {
      try {
        // 用 sessionStorage 保证单次会话只 +1 一次，避免刷新和路由切换重复计数
        const FLAG = 'stats_recorded'
        const method = sessionStorage.getItem(FLAG) ? 'GET' : 'POST'
        // 注意：next.config.js 开了 trailingSlash: true，fetch('/api/stats') 会被
        // 308 重定向到 '/api/stats/'，而 POST 在重定向过程中会退化为 GET，
        // 导致 incrementVisit 永远不执行、数字恒为 0。所以这里必须带尾斜杠。
        const res = await fetch('/api/stats/', { method })
        if (!res.ok) return
        const json = await res.json()
        const { today, total } = json?.data || {}
        const todayEl = document.getElementById('uv-today')
        const totalEl = document.getElementById('uv-total')
        if (todayEl && typeof today === 'number') animateValue(todayEl, today)
        if (totalEl && typeof total === 'number') animateValue(totalEl, total)
        if (method === 'POST') sessionStorage.setItem(FLAG, '1')
      } catch (e) {
        console.warn('[stats-footer]', e)
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

    recordVisit()
    initScrollHide()
  }, [])

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

      <StatsFooter />
      <NextNProgress height={1} color="rgb(156, 163, 175, 0.9)" options={{ showSpinner: false }} />
      <Analytics />
      <Component {...pageProps} />
    </>
  )
}

export default appWithTranslation(MyApp)

import '@fortawesome/fontawesome-svg-core/styles.css'

import '../styles/globals.css'
import '../styles/markdown-github.css'
import '../styles/glassmorphism.css'
import { Analytics } from '@vercel/analytics/react'

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
// 按需 import 常用 brand 图标，避免 import * as Icons 全量打包 500+ 图标
// 如需新增 brand 图标，在此 import 并加入 brandIconMap 即可
import {
  faGithub,
  faGitlab,
  faBitbucket,
  faWeibo,
  faZhihu,
  faBilibili,
  faQq,
  faWeixin,
  faTwitter,
  faFacebook,
  faInstagram,
  faLinkedin,
  faYoutube,
  faTiktok,
  faTwitch,
  faTelegram,
  faDiscord,
  faSlack,
  faReddit,
  faMedium,
  faMastodon,
  faSteam,
  faMarkdown,
} from '@fortawesome/free-brands-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'

import type { AppProps } from 'next/app'
import NextNProgress from 'nextjs-progressbar'
import BackgroundImage from '../components/BackgroundImage'
import { appWithTranslation } from 'next-i18next'
import siteConfig from '../../config/site.config'
import { useIsAdmin } from '../utils/useIsAdmin'

// 常用 brand 图标映射：key 是 siteConfig.links 里 name 的小写形式
const brandIconMap: Record<string, IconDefinition> = {
  github: faGithub,
  gitlab: faGitlab,
  bitbucket: faBitbucket,
  weibo: faWeibo,
  zhihu: faZhihu,
  bilibili: faBilibili,
  qq: faQq,
  weixin: faWeixin,
  wechat: faWeixin,
  twitter: faTwitter,
  facebook: faFacebook,
  instagram: faInstagram,
  linkedin: faLinkedin,
  youtube: faYoutube,
  tiktok: faTiktok,
  twitch: faTwitch,
  telegram: faTelegram,
  discord: faDiscord,
  slack: faSlack,
  reddit: faReddit,
  medium: faMedium,
  mastodon: faMastodon,
  steam: faSteam,
}

// 只注册配置中实际用到的 brand 图标 + md 文件图标（按需加载，避免全量打包）
const usedBrandIcons: IconDefinition[] = siteConfig.links
  .map(l => brandIconMap[l.name.toLowerCase()])
  .filter((icon): icon is IconDefinition => Boolean(icon))

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
  faMarkdown,
  ...usedBrandIcons
)

function MyApp({ Component, pageProps }: AppProps) {
  // 管理员登录后不加载统计代码（Vercel Analytics）
  const isAdmin = useIsAdmin()

  return (
    <>
      {/* 随机壁纸：通过同源代理加载，同时拿到亮度数据 */}
      <BackgroundImage />

      <NextNProgress height={1} color="rgb(156, 163, 175, 0.9)" options={{ showSpinner: false }} />
      {!isAdmin && <Analytics />}
      <Component {...pageProps} />
    </>
  )
}

export default appWithTranslation(MyApp)

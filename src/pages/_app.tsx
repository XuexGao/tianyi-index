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
import * as Icons from '@fortawesome/free-brands-svg-icons'

import type { AppProps } from 'next/app'
import NextNProgress from 'nextjs-progressbar'
import BackgroundImage from '../components/BackgroundImage'
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

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      {/* 随机壁纸：通过同源代理加载，同时拿到亮度数据 */}
      <BackgroundImage />

      <NextNProgress height={1} color="rgb(156, 163, 175, 0.9)" options={{ showSpinner: false }} />
      <Analytics />
      <Component {...pageProps} />
    </>
  )
}

export default appWithTranslation(MyApp)

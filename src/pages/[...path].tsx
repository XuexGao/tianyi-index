import { useRouter } from 'next/router'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'

import siteConfig from '../../config/site.config'
import Navbar from '../components/Navbar'
import FileListing from '../components/FileListing'
import Footer from '../components/Footer'
import Breadcrumb from '../components/Breadcrumb'
import SwitchLayout from '../components/SwitchLayout'
import Seo from '../components/Seo'
import { isAdminFromReq } from '../utils/ssrAdmin'

export default function Folders({ ssrIsAdmin = false, baseUrl }: { ssrIsAdmin?: boolean; baseUrl: string }) {
  const { query, asPath } = useRouter()

  // 当前路径最后一段作为页面标题（目录/文件名）
  const pathSegments = asPath.split('/').filter(Boolean)
  const currentName = pathSegments.length > 0 ? decodeURIComponent(pathSegments[pathSegments.length - 1]) : null
  const seoTitle = currentName ? `${currentName} - ${siteConfig.title}` : siteConfig.title

  return (
    <div className="od-page-wrapper flex min-h-[110vh] flex-col items-center">
      <Seo title={seoTitle} description={siteConfig.description} path={asPath} baseUrl={baseUrl} />

      <main className="od-main flex w-full flex-1 flex-col">
        <Navbar />
        <div className="mx-auto w-full max-w-5xl py-4 px-3 sm:px-4 sm:p-4">
          <nav className="od-breadcrumb-bar relative z-10 mb-3 flex items-center justify-between gap-4 rounded-2xl px-4 py-1.5">
            <Breadcrumb query={query} />
            <SwitchLayout />
          </nav>
          <div key={asPath}>
            <FileListing query={query} ssrIsAdmin={ssrIsAdmin} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}

export async function getServerSideProps({ locale, req }: { locale: string; req: any }) {
  // 可信站点域名：SITE_URL env 优先，避免 Host 头注入
  const baseUrl = (process.env.SITE_URL || `https://${req.headers.host || 'example.com'}`).replace(/\/$/, '')
  return {
    props: {
      ssrIsAdmin: await isAdminFromReq(req),
      baseUrl,
      ...(await serverSideTranslations(locale, ['common'])),
    },
  }
}

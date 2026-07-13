import type { GetServerSidePropsContext } from 'next'
import i18nConfig from '../../next-i18next.config'

/**
 * sitemap.xml
 *
 * 本站是文件浏览器，动态路径无限多，不能把所有路径都塞进 sitemap，
 * 只把首页和关键静态页作为入口暴露给搜索引擎，让其从首页链接自然发现其余路径。
 *
 * 完善：
 * - 静态页：首页、404 页、OAuth 步骤页
 * - 多语言 alternate：为每个 URL 列出所有 locale 的 alternate 链接（hreflang）
 * - 标准字段：lastmod / changefreq / priority
 *
 * 用 getServerSideProps 输出原始 XML，避免被 Next 当成 API route prerender。
 */
function SitemapPage() {
  return null
}

const LOCALES = i18nConfig.i18n.locales as string[]
const DEFAULT_LOCALE = i18nConfig.i18n.defaultLocale

// 返回某 locale 下的 URL（默认 locale 不带前缀，其余带 /locale 前缀）
function localizedUrl(baseUrl: string, locale: string, path: string): string {
  const cleanPath = path === '/' ? '' : path
  if (locale === DEFAULT_LOCALE) {
    return `${baseUrl}${cleanPath}` || `${baseUrl}/`
  }
  return `${baseUrl}/${locale}${cleanPath}`
}

// 静态页面定义：path 是默认 locale 下的路径
const STATIC_PAGES: { path: string; changefreq: string; priority: string }[] = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/404', changefreq: 'monthly', priority: '0.3' },
]

export async function getServerSideProps({ req, res }: GetServerSidePropsContext) {
  const host = req.headers.host || 'example.com'
  const baseUrl = `https://${host}`
  const lastmod = new Date().toISOString()

  const urls: string[] = []

  for (const page of STATIC_PAGES) {
    const alternates = LOCALES.map(
      loc => `      <xhtml:link rel="alternate" hreflang="${loc}" href="${escapeXml(localizedUrl(baseUrl, loc, page.path))}" />`
    ).join('\n')

    // 默认 locale 的 URL 作为主 URL
    const primaryUrl = localizedUrl(baseUrl, DEFAULT_LOCALE, page.path)

    urls.push(`  <url>
    <loc>${escapeXml(primaryUrl)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
${alternates}
  </url>`)
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>`

  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  // 短时缓存，避免每次请求都重新生成
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.write(xml)
  res.end()

  return { props: {} }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export default SitemapPage

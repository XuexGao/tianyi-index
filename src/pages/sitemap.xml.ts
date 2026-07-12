import type { GetServerSidePropsContext } from 'next'

/**
 * 简版 sitemap.xml：本站是文件浏览器，动态路径无限多，
 * 只把首页作为入口暴露给搜索引擎，让其从首页链接自然发现其余路径。
 *
 * 用 getServerSideProps 输出原始 XML，避免被 Next 当成 API route prerender。
 */
function SitemapPage() {
  return null
}

export async function getServerSideProps({ req, res }: GetServerSidePropsContext) {
  const host = req.headers.host || 'example.com'
  const baseUrl = `https://${host}`

  const urls = [
    {
      loc: `${baseUrl}/`,
      lastmod: new Date().toISOString(),
      changefreq: 'daily',
      priority: '1.0',
    },
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`

  res.setHeader('Content-Type', 'application/xml')
  res.write(xml)
  res.end()

  return { props: {} }
}

export default SitemapPage

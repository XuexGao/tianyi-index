import type { GetServerSidePropsContext } from 'next'
import siteConfig from '../../config/site.config'

/**
 * 简版 rss.xml：本站是文件浏览器，没有传统博客文章条目，
 * 提供一个站点级 RSS feed，描述站点本身，条目为空。
 *
 * 用 getServerSideProps 输出原始 XML，避免被 Next 当成 API route prerender。
 */
function RssPage() {
  return null
}

export async function getServerSideProps({ req, res }: GetServerSidePropsContext) {
  const host = req.headers.host || 'example.com'
  const baseUrl = `https://${host}`
  const title = siteConfig.title
  const description = '天翼云网盘文件浏览器'
  const buildDate = new Date().toUTCString()

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${baseUrl}/</link>
    <description>${escapeXml(description)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
  </channel>
</rss>`

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
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

export default RssPage

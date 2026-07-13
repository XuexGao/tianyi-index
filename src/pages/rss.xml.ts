import type { GetServerSidePropsContext } from 'next'
import siteConfig from '../../config/site.config'

/**
 * 站点级 RSS feed。
 *
 * 本站是文件浏览器，没有传统博客文章条目，RSS 提供站点级元数据，
 * 方便 RSS 阅读器订阅站点更新。
 *
 * 符合 RSS 2.0 规范，同时带 atom namespace 和 self link，
 * 让各类阅读器能正确识别 feed 自身地址。
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
  const description = '天翼云网盘文件浏览器 —— 基于 OneDrive 与天翼云盘的双云盘文件分享站'
  const buildDate = new Date().toUTCString()
  const selfUrl = `${baseUrl}/rss.xml`
  const iconUrl = `${baseUrl}${siteConfig.icon}`
  const commitHash = process.env.NEXT_PUBLIC_GIT_COMMIT_HASH || 'unknown'

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${baseUrl}/</link>
    <description>${escapeXml(description)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <pubDate>${buildDate}</pubDate>
    <ttl>60</ttl>
    <generator>tianyi-index (${commitHash})</generator>
    <docs>https://www.rssboard.org/rss-specification</docs>
    <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml" />
    <image>
      <url>${iconUrl}</url>
      <title>${escapeXml(title)}</title>
      <link>${baseUrl}/</link>
      <width>192</width>
      <height>192</height>
      <description>${escapeXml(description)}</description>
    </image>
  </channel>
</rss>`

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
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

export default RssPage

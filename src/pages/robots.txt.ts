import type { GetServerSidePropsContext } from 'next'

/**
 * robots.txt
 *
 * 允许搜索引擎抓取全站，仅排除管理员区与内部接口路径，
 * 并声明 sitemap 位置，帮助搜索引擎发现入口页面。
 *
 * 用 getServerSideProps 输出原始文本，避免被 Next 当成 API route prerender。
 */
function RobotsPage() {
  return null
}

export async function getServerSideProps({ req, res }: GetServerSidePropsContext) {
  // 安全：优先使用环境变量配置的可信域名，避免 Host 头注入攻击
  // 攻击者可伪造 Host 头让 robots.txt 中的 Sitemap 指向恶意域名
  const baseUrl = (process.env.SITE_URL || `https://${req.headers.host || 'example.com'}`).replace(/\/$/, '')

  const robots = `# robots.txt — tianyi-index
User-agent: *
Allow: /

# 管理员区：登录与管理页面不入索引
Disallow: /@login
Disallow: /@manage
Disallow: /_admin-login
Disallow: /_admin-manage

# 内部接口
Disallow: /api/
Disallow: /dav/

Sitemap: ${baseUrl}/sitemap.xml
`

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  // robots.txt 变化频率低，可以长时间缓存
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.write(robots)
  res.end()

  return { props: {} }
}

export default RobotsPage

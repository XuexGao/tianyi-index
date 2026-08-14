import Document, { Head, Html, Main, NextScript } from 'next/document'
import type { DocumentContext } from 'next/document'
import siteConfig from '../../config/site.config'
import { ADMIN_COOKIE_NAME } from '../utils/adminAuth'

class MyDocument extends Document<{ isAdmin: boolean; baseUrl: string }> {
  static async getInitialProps(ctx: DocumentContext) {
    const initialProps = await Document.getInitialProps(ctx)
    // 从请求 cookie 判断是否管理员登录，登录后不加载 Umami 统计脚本
    const cookieHeader = ctx.req?.headers?.cookie || ''
    const isAdmin = cookieHeader
      .split(';')
      .some(part => part.trim().startsWith(`${ADMIN_COOKIE_NAME}=`))
    // 安全：优先 SITE_URL env 作为可信域名，避免 Host 头注入
    const baseUrl = (process.env.SITE_URL || `https://${ctx.req?.headers?.host || 'example.com'}`).replace(/\/$/, '')
    return { ...initialProps, isAdmin, baseUrl }
  }

  render() {
    const { isAdmin, baseUrl } = this.props
    const siteUrl = `${baseUrl}/`
    const ogImageUrl = `${baseUrl}${siteConfig.ogImage}`

    // 搜索引擎站点验证：配置对应 env 后输出，未配置则不渲染
    const verificationMetas = [
      { name: 'google-site-verification', content: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION },
      { name: 'baidu-site-verification', content: process.env.NEXT_PUBLIC_BAIDU_SITE_VERIFICATION },
      { name: 'msvalidate.01', content: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION },
    ].filter(v => v.content)

    // WebSite 结构化数据，帮助搜索引擎理解站点身份
    const webSiteJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: siteConfig.title,
      url: siteUrl,
    }

    return (
      <Html>
        <Head>
          <meta name="description" content={siteConfig.description} />
          <link rel="icon" href="/favicon.ico" />
          <link rel="preload" href="/api/wallpaper/?v=2" as="image" />

          {/* 主题色（浏览器地址栏），浅/深色各一个 */}
          <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
          <meta name="theme-color" content="#0a0a14" media="(prefers-color-scheme: dark)" />

          {/* Open Graph 站点级默认值（页面级 title/url 由各页面 Seo 组件输出，避免重复） */}
          <meta property="og:site_name" content={siteConfig.title} />
          <meta property="og:type" content="website" />
          <meta property="og:locale" content="zh_CN" />
          <meta property="og:image" content={ogImageUrl} />

          {/* 搜索引擎站点验证 */}
          {verificationMetas.map(({ name, content }) => (
            <meta key={name} name={name} content={content} />
          ))}

          {/* WebSite 结构化数据 */}
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteJsonLd) }} />

          {/* DNS 预解析 & 预连接，加速字体和 CDN 资源加载 */}
          <link rel="dns-prefetch" href="//npm.elemecdn.com" />
          <link rel="preconnect" href="https://npm.elemecdn.com" crossOrigin="" />
          <link rel="dns-prefetch" href="//fonts.googleapis.com" />
          <link rel="dns-prefetch" href="//fonts.gstatic.com" />

          {/* LXGW WenKai Font */}
          <link
            rel="stylesheet"
            href="https://npm.elemecdn.com/lxgw-wenkai-webfont@1.1.0/lxgwwenkai-regular.css"
          />

          {/* Original Google Fonts */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          {siteConfig.googleFontLinks.map(link => (
            <link key={link} rel="stylesheet" href={link} />
          ))}

          {/* Umami Analytics：管理员登录后不加载 */}
          {!isAdmin &&
            process.env.NEXT_PUBLIC_UMAMI_BASE_URL &&
            process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
              <script
                defer
                src={`${process.env.NEXT_PUBLIC_UMAMI_BASE_URL}/script.js`}
                data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
              />
            )}
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument

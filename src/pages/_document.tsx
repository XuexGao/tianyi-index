import Document, { Head, Html, Main, NextScript } from 'next/document'
import siteConfig from '../../config/site.config'

class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head>
          <meta name="description" content="天翼云网盘文件浏览器" />
          <link rel="icon" href="/favicon.ico" />

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

          {/* Umami Analytics */}
          {process.env.NEXT_PUBLIC_UMAMI_BASE_URL && process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
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

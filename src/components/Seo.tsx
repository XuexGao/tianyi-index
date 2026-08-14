import Head from 'next/head'

/**
 * 页面级 SEO 头部。
 *
 * 站点级默认 meta（description / og:site_name / og:image / theme-color / 验证码等）
 * 由 _document.tsx 统一输出，这里只输出随页面变化的部分：
 * title、og:title、og:description、og:url、canonical。
 * baseUrl 由页面 getServerSideProps 传入（SITE_URL env 或 Host），SSR 与客户端一致，避免 hydration 抖动。
 */
const Seo: React.FC<{ title: string; description?: string; path?: string; baseUrl: string }> = ({
  title,
  description,
  path,
  baseUrl,
}) => {
  const canonical = `${baseUrl}${path || '/'}`

  return (
    <Head>
      <title>{title}</title>
      <meta property="og:title" content={title} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:url" content={canonical} />
      <link rel="canonical" href={canonical} />
    </Head>
  )
}

export default Seo

const { i18n } = require('./next-i18next.config')

module.exports = {
  i18n,
  reactStrictMode: true,
  // Required by Next i18n with API routes, otherwise API routes 404 when fetching without trailing slash
  trailingSlash: true,

  // 性能优化
  poweredByHeader: false,
  compress: true,

  // 兼容旧 API 路径：合并双云盘后 /api 拆成了 /api/ty 和 /api/od，
  // 这里把不带 ty/od 后缀的旧 /api/* 请求重写到 /api/ty/*，
  // 让外部调用方（如博客 Fuwari 的 vercel rewrite）不用改代码即可继续工作。
  async rewrites() {
    return [
      {
        source: '/api/:path((?!ty/|od/|config).*)',
        destination: '/api/ty/:path*',
      },
    ]
  },

  // 静态资源缓存头
  async headers() {
    return [
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/fonts/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/public/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
}

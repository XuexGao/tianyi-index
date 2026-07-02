const { i18n } = require('./next-i18next.config')

module.exports = {
  i18n,
  reactStrictMode: true,
  // Required by Next i18n with API routes, otherwise API routes 404 when fetching without trailing slash
  trailingSlash: true,

  // 性能优化
  poweredByHeader: false,
  compress: true,

  // 前端组件中大量地方硬编码了 /api/raw/ 作为下载/预览链接（继承自 OneDrive-Index 模板），
  // 但本项目的实际下载路由是 /api/ty/raw。这里做一层重写，避免改动 15+ 个前端文件。
  async rewrites() {
    return [
      {
        source: '/api/raw/',
        destination: '/api/ty/raw',
      },
      {
        source: '/api/raw/:path*',
        destination: '/api/ty/raw',
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

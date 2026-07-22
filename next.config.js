const { i18n } = require('./next-i18next.config')
const { execSync } = require('child_process')

// 构建期一次性获取 git 信息，注入到 process.env 供前端组件读取
let gitCommitHash = 'unknown'
let buildDate = 'unknown'
try {
  gitCommitHash = execSync('git rev-parse --short=7 HEAD').toString().trim()
  const date = new Date()
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const pad = (t) => parts.find(p => p.type === t)?.value ?? '00'
  buildDate = `${pad('year')}-${pad('month')}-${pad('day')} ${pad('hour')}:${pad('minute')}:${pad('second')}`
} catch (e) {
  // 静默忽略：构建环境无 git 时用默认值
}

module.exports = {
  i18n,
  reactStrictMode: true,
  // Required by Next i18n with API routes, otherwise API routes 404 when fetching without trailing slash
  trailingSlash: true,

  // 注入构建期 git 信息，供 Footer 等前端组件读取
  env: {
    NEXT_PUBLIC_GIT_COMMIT_HASH: gitCommitHash,
    NEXT_PUBLIC_BUILD_DATE: buildDate,
  },

  // 性能优化
  poweredByHeader: false,
  compress: true,

  // 兼容旧 API 路径：合并双云盘后 /api 拆成了 /api/ty 和 /api/od，
  // 这里把不带 ty/od 后缀的旧 /api/* 请求重写到 /api/ty/*，
  // 让外部调用方（如博客 Fuwari 的 vercel rewrite）不用改代码即可继续工作。
  async rewrites() {
    return [
      // WebDAV 挂载：/dav/* -> /api/dav/*
      // 先匹配带尾随斜杠的（适配 trailingSlash: true），再回退到无斜杠版本
      {
        source: '/dav/:path*/',
        destination: '/api/dav/:path*/',
      },
      {
        source: '/dav/:path*',
        destination: '/api/dav/:path*',
      },
      {
        source: '/api/:path((?!ty/|od/|dav/|config).*)',
        destination: '/api/ty/:path*',
      },
      // 管理员路由：/@login 和 /@manage 映射到实际页面文件
      // （@ 在 Next.js 路由中有 parallel routes 含义，不能直接用作文件名）
      {
        source: '/@login',
        destination: '/_admin-login',
      },
      {
        source: '/@manage',
        destination: '/_admin-manage',
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

    ]
  },
}

/**
 * CloudIndex 双云盘 - 网站配置
 * 支持 OneDrive + 天翼云盘
 */
module.exports = {
  // 网站图标
  icon: '/android-chrome-192x192.png',

  // Redis KV 存储前缀
  kvPrefix: process.env.KV_PREFIX || '',

  // 网站标题
  title: process.env.NEXT_PUBLIC_SITE_TITLE || 'TianYi-Index',

  // 受密码保护的路径（OneDrive 专用）
  protectedRoutes: process.env.NEXT_PUBLIC_PROTECTED_ROUTES
    ? process.env.NEXT_PUBLIC_PROTECTED_ROUTES.split(',')
    : [],

  // 联系邮箱
  email: process.env.NEXT_PUBLIC_EMAIL ? `mailto:${process.env.NEXT_PUBLIC_EMAIL}` : '',

  // 页脚 HTML
  footer: '',

  // 社交链接
  links: [
    {
      name: 'GitHub',
      link: 'https://github.com/XuexGao/tianyi-index',
    },
  ],

  // 每页最大文件数
  maxItems: 200,

  // Google 字体
  googleFontSans: 'Noto Sans SC',
  googleFontMono: 'Fira Mono',
  googleFontLinks: [
    'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Fira+Mono&display=swap',
  ],

  // 日期时间格式
  datetimeFormat: 'YYYY-MM-DD HH:mm:ss',
}

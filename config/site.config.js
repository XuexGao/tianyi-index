/**
 * CloudIndex 双云盘 - 网站配置
 * 支持 OneDrive + 天翼云盘，两个网盘挂载到同一个网站
 */
module.exports = {
  // 网站图标
  icon: '/android-chrome-192x192.png',

  // Redis KV 存储前缀
  kvPrefix: process.env.KV_PREFIX || '',

  // 网站标题
  title: process.env.NEXT_PUBLIC_SITE_TITLE || 'TianYi-Index',

  // === 双云盘挂载路径配置 ===
  // 天翼云挂载到网站的哪个路径（默认根目录 /）
  // 环境变量 NEXT_PUBLIC_TIANYI_MOUNT_PATH 优先（需 NEXT_PUBLIC_ 前缀，前端 driveResolver 要读取）
  // 设为空字符串则不启用天翼云挂载
  tianyiMountPath: normalizeMountPath(process.env.NEXT_PUBLIC_TIANYI_MOUNT_PATH || '/'),

  // OneDrive 挂载到网站的哪个路径（默认 /OneDrive）
  // 环境变量 NEXT_PUBLIC_ONEDRIVE_MOUNT_PATH 优先（需 NEXT_PUBLIC_ 前缀，前端要读取）
  // 设为空字符串则不启用 OneDrive 挂载
  onedriveMountPath: normalizeMountPath(process.env.NEXT_PUBLIC_ONEDRIVE_MOUNT_PATH || '/OneDrive'),

  // === 受密码保护的路径（在天翼云/OneDrive 对应目录下放 .password 文件，内容为访问密码）===
  // 天翼云侧私密目录：环境变量 NEXT_PUBLIC_PROTECTED_ROUTES 优先，逗号分隔
  // 路径是相对于天翼云挂载点内部的路径（不含挂载前缀）
  protectedRoutes: process.env.NEXT_PUBLIC_PROTECTED_ROUTES
    ? process.env.NEXT_PUBLIC_PROTECTED_ROUTES.split(',')
    : ['/其他文件/文件传输'],

  // OneDrive 侧私密目录：环境变量 NEXT_PUBLIC_PROTECTED_ROUTES_OD 优先，逗号分隔
  // 路径是相对于 OneDrive BASE_DIRECTORY 内部的路径（不含挂载前缀 /OneDrive）
  protectedRoutesOd: process.env.NEXT_PUBLIC_PROTECTED_ROUTES_OD
    ? process.env.NEXT_PUBLIC_PROTECTED_ROUTES_OD.split(',')
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

/**
 * 规范化挂载路径：确保以 / 开头，去除末尾 /
 * 空字符串表示不启用该云盘
 */
function normalizeMountPath(p) {
  if (!p || p.trim() === '') return ''
  p = p.trim()
  if (!p.startsWith('/')) p = '/' + p
  // 根目录特殊处理
  if (p === '/') return '/'
  // 去除末尾斜杠
  return p.replace(/\/$/, '')
}

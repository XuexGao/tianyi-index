/**
 * 双云盘路径解析器
 *
 * 根据浏览器 URL 路径判断当前位于哪个云盘挂载点，返回：
 * - drive: 'ty' | 'od' | 'virtual'
 * - apiBase: '/api/ty' | '/api/od'
 * - relPath: 剥离挂载前缀后的相对路径（传给后端 API 的 path 参数）
 * - mountPath: 当前云盘的挂载前缀
 *
 * 管理员登录后额外的虚拟路径（仅登录状态生效）：
 * - /Admin → virtual（显示天翼云盘和 OneDrive 两个入口文件夹）
 * - /Admin/天翼云盘/... → ty，relPath 为剥离 '/Admin/天翼云盘' 后的路径（根目录即天翼云根）
 * - /Admin/OneDrive/... → od，relPath 为剥离 '/Admin/OneDrive' 后的路径（根目录即 OneDrive 根）
 *
 * 注意：mountPath 必须用 component-by-component 比较，避免 '/One' 误匹配 '/OneDrive'。
 * 中文路径（如「天翼云盘」）需要 encode 后再与 router.asPath 比较。
 */

import siteConfig from '../../config/site.config'

export type DriveType = 'ty' | 'od' | 'virtual'

export interface DriveResolution {
  drive: DriveType
  apiBase: '/api/ty' | '/api/od'
  /** 剥离挂载前缀后的相对路径，始终以 / 开头，传给后端 API 的 path 参数 */
  relPath: string
  /** 当前云盘的挂载前缀，如 '/' 或 '/OneDrive' */
  mountPath: string
  /** 是否为管理员路由（/Admin 下的云盘路径），API 会忽略挂载基础目录从绝对根目录开始 */
  admin: boolean
}

const TY_MOUNT = siteConfig.tianyiMountPath // '/' 或 '/xxx'
const OD_MOUNT = siteConfig.onedriveMountPath // '/OneDrive' 或 '' 或 '/xxx'

/**
 * 管理员登录后的虚拟管理路径。
 * /Admin 下显示天翼云盘和 OneDrive 两个入口文件夹。
 */
export const ADMIN_MOUNT = '/Admin'
export const ADMIN_TY_FOLDER_NAME = '天翼云盘'
export const ADMIN_OD_FOLDER_NAME = 'OneDrive'
export const ADMIN_TY_MOUNT = `${ADMIN_MOUNT}/${ADMIN_TY_FOLDER_NAME}`
export const ADMIN_OD_MOUNT = `${ADMIN_MOUNT}/${ADMIN_OD_FOLDER_NAME}`

/**
 * 读取全局管理员状态（由 useIsAdmin hook 设置）
 * driveResolver 是纯函数，通过这个全局变量感知登录状态
 */
function getIsAdmin(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean((window as any).__isAdmin)
}

/**
 * 将挂载路径的每一段用 encodeURIComponent 编码，得到与 router.asPath 一致的编码形式。
 * router.asPath 对非 ASCII 字符（如中文「天翼云盘」）返回 percent-encoded 形式，
 * 而 mountPath 配置是 decoded 形式，比较前必须统一到 encoded。
 */
function encodeMountPath(mountPath: string): string {
  if (mountPath === '/') return '/'
  return mountPath
    .split('/')
    .map(s => encodeURIComponent(s))
    .join('/')
}

/**
 * 判断 urlPath 是否落在某个挂载点下（component-by-component）
 * mountPath='/' 表示根目录，任何路径都匹配
 */
function pathStartsWithMount(urlPath: string, mountPath: string): boolean {
  if (mountPath === '/') return true
  const p = urlPath.startsWith('/') ? urlPath : '/' + urlPath
  const m = encodeMountPath(mountPath)
  return p === m || p.startsWith(m + '/')
}

/**
 * 从 urlPath 中剥离挂载前缀，得到相对路径
 * 例如 mountPath='/OneDrive', urlPath='/OneDrive/foo/bar' → '/foo/bar'
 * mountPath='/' 时，urlPath 原样返回
 */
function stripMount(urlPath: string, mountPath: string): string {
  const p = urlPath.startsWith('/') ? urlPath : '/' + urlPath
  if (mountPath === '/') return p === '' ? '/' : p
  const m = encodeMountPath(mountPath)
  if (p === m) return '/'
  return p.slice(m.length) || '/'
}

/**
 * 根据浏览器 URL 路径解析当前云盘
 * @param urlPath 浏览器路径，如 router.asPath 的 pathname 部分（不含 query），如 '/OneDrive/foo'
 */
export function resolveDrive(urlPath: string): DriveResolution {
  // 剥离 query string 和 hash
  let cleanPath = urlPath
  const qIdx = cleanPath.indexOf('?')
  if (qIdx >= 0) cleanPath = cleanPath.slice(0, qIdx)
  const hIdx = cleanPath.indexOf('#')
  if (hIdx >= 0) cleanPath = cleanPath.slice(0, hIdx)

  const isAdmin = getIsAdmin()

  // === 管理员虚拟路径（登录后生效，必须在天翼云默认匹配之前） ===

  // /Admin → virtual（显示两个云盘入口文件夹）
  if (isAdmin && pathStartsWithMount(cleanPath, ADMIN_MOUNT) && !pathStartsWithMount(cleanPath, ADMIN_TY_MOUNT) && !pathStartsWithMount(cleanPath, ADMIN_OD_MOUNT)) {
    return {
      drive: 'virtual',
      apiBase: '/api/ty',
      relPath: '/',
      mountPath: ADMIN_MOUNT,
      admin: true,
    }
  }

  // /Admin/天翼云盘/... → ty，relPath 为剥离后的路径，admin=true 从绝对根目录开始
  if (isAdmin && pathStartsWithMount(cleanPath, ADMIN_TY_MOUNT)) {
    const relPath = stripMount(cleanPath, ADMIN_TY_MOUNT)
    return {
      drive: 'ty',
      apiBase: '/api/ty',
      relPath,
      mountPath: ADMIN_TY_MOUNT,
      admin: true,
    }
  }

  // /Admin/OneDrive/... → od，relPath 为剥离后的路径，admin=true 从绝对根目录开始
  if (isAdmin && pathStartsWithMount(cleanPath, ADMIN_OD_MOUNT)) {
    const relPath = stripMount(cleanPath, ADMIN_OD_MOUNT)
    return {
      drive: 'od',
      apiBase: '/api/od',
      relPath,
      mountPath: ADMIN_OD_MOUNT,
      admin: true,
    }
  }

  // === 原有云盘挂载点匹配 ===

  // 优先匹配 OneDrive（因为天翼云通常在根目录，会兜底）
  if (OD_MOUNT && pathStartsWithMount(cleanPath, OD_MOUNT)) {
    const relPath = stripMount(cleanPath, OD_MOUNT)
    return {
      drive: 'od',
      apiBase: '/api/od',
      relPath,
      mountPath: OD_MOUNT,
      admin: false,
    }
  }

  // 默认天翼云（若天翼云挂载在根目录则匹配所有路径）
  const relPath = TY_MOUNT === '/' ? cleanPath : stripMount(cleanPath, TY_MOUNT)
  return {
    drive: 'ty',
    apiBase: '/api/ty',
    relPath,
    mountPath: TY_MOUNT,
    admin: false,
  }
}

/**
 * 将 DriveType 归一化为 Drive（'virtual' → 'ty'）。
 * 虚拟目录没有私密目录，统一按 'ty' 处理即可。
 */
export function normalizeDrive(drive: DriveType): 'ty' | 'od' {
  return drive === 'virtual' ? 'ty' : drive
}

/**
 * 便捷：只获取 apiBase
 */
export function getApiBase(urlPath: string): '/api/ty' | '/api/od' {
  return resolveDrive(urlPath).apiBase
}

/**
 * 便捷：判断当前是否在 OneDrive 挂载点下
 */
export function isOnedrivePath(urlPath: string): boolean {
  return Boolean(OD_MOUNT) && pathStartsWithMount(urlPath, OD_MOUNT)
}

/**
 * OneDrive 挂载是否启用（配置了 onedriveMountPath 且非空）
 */
export const ONEDRIVE_ENABLED = Boolean(OD_MOUNT)

/**
 * 虚拟文件夹入口的唯一 id。
 * 布局组件通过这些 id 识别虚拟文件夹，跳过下载/复制等后端操作。
 */
// 主页天翼云根目录注入的 Admin 入口文件夹
export const VIRTUAL_ADMIN_FOLDER_ID = '__virtual_admin__'
// /Admin 下的天翼云入口
export const VIRTUAL_TIANYI_FOLDER_ID = '__virtual_tianyi__'
// /Admin 下的 OneDrive 入口
export const VIRTUAL_ONEDRIVE_FOLDER_ID = '__virtual_onedrive__'

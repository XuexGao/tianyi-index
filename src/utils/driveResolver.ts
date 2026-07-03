/**
 * 双云盘路径解析器
 *
 * 根据浏览器 URL 路径判断当前位于哪个云盘挂载点，返回：
 * - drive: 'ty' | 'od' | null
 * - apiBase: '/api/ty' | '/api/od'
 * - relPath: 剥离挂载前缀后的相对路径（传给后端 API 的 path 参数）
 * - mountPath: 当前云盘的挂载前缀
 *
 * 路径匹配规则（以 onedriveMountPath='/OneDrive' 为例）：
 * - '/' 或 '/foo' → 天翼云（若天翼云挂载在根目录）
 * - '/OneDrive' 或 '/OneDrive/foo' → OneDrive
 *
 * 注意：mountPath 必须用 component-by-component 比较，避免 '/One' 误匹配 '/OneDrive'。
 */

import siteConfig from '../../config/site.config'

export type DriveType = 'ty' | 'od'

export interface DriveResolution {
  drive: DriveType
  apiBase: '/api/ty' | '/api/od'
  /** 剥离挂载前缀后的相对路径，始终以 / 开头，传给后端 API 的 path 参数 */
  relPath: string
  /** 当前云盘的挂载前缀，如 '/' 或 '/OneDrive' */
  mountPath: string
}

const TY_MOUNT = siteConfig.tianyiMountPath // '/' 或 '/xxx'
const OD_MOUNT = siteConfig.onedriveMountPath // '/OneDrive' 或 '' 或 '/xxx'

/**
 * 判断 urlPath 是否落在某个挂载点下（component-by-component）
 * mountPath='/' 表示根目录，任何路径都匹配
 */
function pathStartsWithMount(urlPath: string, mountPath: string): boolean {
  if (mountPath === '/') return true
  // 标准化：确保都以 / 开头
  const p = urlPath.startsWith('/') ? urlPath : '/' + urlPath
  // 完全等于挂载点，或以 挂载点 + / 开头
  return p === mountPath || p.startsWith(mountPath + '/')
}

/**
 * 从 urlPath 中剥离挂载前缀，得到相对路径
 * 例如 mountPath='/OneDrive', urlPath='/OneDrive/foo/bar' → '/foo/bar'
 * mountPath='/' 时，urlPath 原样返回
 */
function stripMount(urlPath: string, mountPath: string): string {
  const p = urlPath.startsWith('/') ? urlPath : '/' + urlPath
  if (mountPath === '/') return p === '' ? '/' : p
  if (p === mountPath) return '/'
  // p 以 mountPath + '/' 开头
  return p.slice(mountPath.length) || '/'
}

/**
 * 根据浏览器 URL 路径解析当前云盘
 * @param urlPath 浏览器路径，如 router.asPath 的 pathname 部分（不含 query），如 '/OneDrive/foo'
 */
export function resolveDrive(urlPath: string): DriveResolution {
  // 剥离 query string 和 hash，避免 relPath 带上 ?xxx 或 #xxx
  // （router.asPath 可能包含 query，但后端 API 的 path 参数不应包含）
  let cleanPath = urlPath
  const qIdx = cleanPath.indexOf('?')
  if (qIdx >= 0) cleanPath = cleanPath.slice(0, qIdx)
  const hIdx = cleanPath.indexOf('#')
  if (hIdx >= 0) cleanPath = cleanPath.slice(0, hIdx)

  // 优先匹配 OneDrive（因为天翼云通常在根目录，会兜底）
  // 只有配置了 onedriveMountPath 才启用 OneDrive
  if (OD_MOUNT && pathStartsWithMount(cleanPath, OD_MOUNT)) {
    const relPath = stripMount(cleanPath, OD_MOUNT)
    return {
      drive: 'od',
      apiBase: '/api/od',
      relPath,
      mountPath: OD_MOUNT,
    }
  }

  // 默认天翼云（若天翼云挂载在根目录则匹配所有路径）
  const relPath = TY_MOUNT === '/' ? cleanPath : stripMount(cleanPath, TY_MOUNT)
  return {
    drive: 'ty',
    apiBase: '/api/ty',
    relPath,
    mountPath: TY_MOUNT,
  }
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
 * 虚拟 OneDrive 文件夹入口的唯一 id。
 * 在天翼云根目录列表中注入此虚拟文件夹，点击后导航到 OneDrive 挂载路径。
 * 布局组件通过此 id 识别虚拟文件夹，跳过下载/复制等后端操作（因为它不属于任何真实云盘）。
 */
export const VIRTUAL_ONEDRIVE_FOLDER_ID = '__virtual_onedrive__'

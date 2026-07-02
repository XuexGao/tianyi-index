import axios from 'axios'
import sha256 from 'crypto-js/sha256'

import siteConfig from '../../config/site.config'
import { getFiles, getDownloadLink } from './tianyiClient'

const DEFAULT_FOLDER_ID = process.env.DEFAULT_FOLDER_ID || '-11'

/**
 * .password 内容缓存（5 分钟 TTL）。
 * 否则每次访问受保护路径都要重新导航目录 + 下载 .password 文件，
 * 增加 3-4 次到 cloud.189.cn 的网络往返，严重拖慢加载。
 * 密码变更后最多 5 分钟生效。
 */
const passwordCache = new Map<string, { data: string | null; expires: number }>()

function getCachedPassword(route: string): string | null | undefined {
  const entry = passwordCache.get(route)
  if (entry && entry.expires > Date.now()) {
    return entry.data
  }
  passwordCache.delete(route)
  return undefined
}

function setCachedPassword(route: string, data: string | null) {
  passwordCache.set(route, { data, expires: Date.now() + 5 * 60 * 1000 })
}

/**
 * 检查解码后的路径是否匹配某个受保护路由。
 * 与前端 matchProtectedRoute 不同，这里直接对解码路径做 startsWith 比较，
 * 避免编码不一致导致匹配失败。
 */
export function findProtectedRoute(decodedPath: string): string {
  for (const r of siteConfig.protectedRoutes) {
    if (r && (decodedPath === r || decodedPath.startsWith(r + '/'))) {
      return r
    }
  }
  return ''
}

/**
 * 导航到指定路径（解码后的 segments），返回最终 folderId 和最新 cookies。
 * 用于定位受保护路由目录以读取 .password 文件。
 */
async function resolveFolderByPath(
  cookies: Record<string, string>,
  segments: string[],
  username: string,
  password: string,
): Promise<{ folderId: string; cookies: Record<string, string> } | null> {
  let currentFolderId = DEFAULT_FOLDER_ID
  for (const segment of segments) {
    const listResult = await getFiles(cookies, currentFolderId, username, password)
    if (listResult.data?.cookies) {
      cookies = listResult.data.cookies
    }
    if (listResult.status !== 'success' || !listResult.data) {
      return null
    }
    const matchedFolder = listResult.data.folders.find(f => f.name === segment)
    if (!matchedFolder) {
      return null
    }
    currentFolderId = matchedFolder.id
  }
  return { folderId: currentFolderId, cookies }
}

/**
 * 读取受保护路由目录下的 .password 文件内容。
 * 导航到该目录 → 列出文件 → 找到 .password → 下载内容。
 * 返回 trim 后的密码字符串；如果目录下没有 .password 文件则返回 null。
 */
async function getDotPasswordContent(
  cookies: Record<string, string>,
  protectedRoutePath: string,
  username: string,
  password: string,
): Promise<string | null> {
  const segments = protectedRoutePath.split('/').filter(Boolean)
  const resolved = await resolveFolderByPath(cookies, segments, username, password)
  if (!resolved) {
    return null
  }
  cookies = resolved.cookies

  // 列出受保护目录下的文件
  const listResult = await getFiles(cookies, resolved.folderId, username, password)
  if (listResult.data?.cookies) {
    cookies = listResult.data.cookies
  }
  if (listResult.status !== 'success' || !listResult.data) {
    return null
  }

  // 查找 .password 文件
  const dotPasswordFile = listResult.data.files.find(f => f.name === '.password')
  if (!dotPasswordFile) {
    return null
  }

  // 获取下载链接并读取文件内容
  const dlResult = await getDownloadLink(cookies, dotPasswordFile.id)
  if (dlResult.status !== 'success' || !dlResult.data?.url) {
    return null
  }

  try {
    const response = await axios.get(dlResult.data.url, {
      responseType: 'text',
      timeout: 15000,
      maxRedirects: 5,
    })
    return (response.data as string).trim()
  } catch {
    return null
  }
}

/**
 * 检查请求是否通过受保护路由的鉴权。
 *
 * @returns true 表示通过（或路径不受保护），false 表示鉴权失败应返回 401
 */
export async function checkProtectedRoute(
  decodedPath: string,
  tokenHeader: string,
  cookies: Record<string, string>,
  username: string,
  password: string,
): Promise<boolean> {
  const protectedRoutePath = findProtectedRoute(decodedPath)
  if (!protectedRoutePath) {
    return true // 路径不受保护，放行
  }

  // 优先读缓存，避免每次请求都导航目录 + 下载 .password 文件
  let dotPassword = getCachedPassword(protectedRoutePath)
  if (dotPassword === undefined) {
    dotPassword = await getDotPasswordContent(cookies, protectedRoutePath, username, password)
    setCachedPassword(protectedRoutePath, dotPassword)
  }

  if (dotPassword === null) {
    return true // .password 文件不存在，放行（与 OneDrive-Index 行为一致）
  }

  const hashedPassword = sha256(dotPassword).toString()
  return tokenHeader === hashedPassword
}

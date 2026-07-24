import sha256 from 'crypto-js/sha256'
import siteConfig from '../../config/site.config'

/** 云盘类型：ty=天翼云，od=OneDrive */
export type Drive = 'ty' | 'od'

/**
 * 从 apiBase 推导云盘类型
 * '/api/od' -> 'od'，其它（含 '/api/ty'）-> 'ty'
 */
export function driveFromApiBase(apiBase: string): Drive {
  return apiBase === '/api/od' ? 'od' : 'ty'
}

// Hash password token with SHA256
export function encryptToken(token: string): string {
  return sha256(token).toString()
}

/**
 * 恒定时间字符串比较，避免通过时序差异逐字节推断哈希值。
 * （无法使用 node:crypto.timingSafeEqual，因本模块被客户端组件引用）
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

// Fetch stored token from localStorage.
// 安全：localStorage 中只存储 SHA256 哈希，避免明文密码泄露（如 XSS 读取 localStorage）
// path 应为剥离挂载前缀的后端路径；drive 决定查 ty 还是 od 的私密目录列表
export function getStoredToken(path: string, drive: Drive = 'ty'): string | null {
  if (typeof window === 'undefined') return null
  const storageKey = matchProtectedRoute(path, drive)
  if (!storageKey) return null
  try {
    const item = localStorage.getItem(storageKey)
    if (item === null) return null
    return JSON.parse(item) as string || null
  } catch {
    return null
  }
}

/**
 * Compares the hash of .password and od-protected-token header
 * @param odTokenHeader od-protected-token header (sha256 hashed token)
 * @param dotPassword non-hashed .password file
 * @returns whether the two hashes are the same
 */
export function compareHashedToken({
  odTokenHeader,
  dotPassword,
}: {
  odTokenHeader: string
  dotPassword: string
}): boolean {
  return constantTimeEqual(encryptToken(dotPassword.trim()), odTokenHeader)
}

/**
 * Match the specified route against a list of predefined routes
 * @param route 目录路径（应为剥离挂载前缀的后端路径）
 * @param drive 'ty'=天翼云查 protectedRoutes，'od'=OneDrive 查 protectedRoutesOd
 * @returns 命中的私密目录路径（od 侧加 'od:' 前缀以避免与天翼云 key 冲突），未命中返回空串
 */
export function matchProtectedRoute(route: string, drive: Drive = 'ty'): string {
  const protectedRoutes: string[] = drive === 'od' ? siteConfig.protectedRoutesOd : siteConfig.protectedRoutes
  let authTokenPath = ''

  for (const r of protectedRoutes) {
    // protected route array could be empty
    if (r) {
      if (
        route.startsWith(
          r
            .split('/')
            .map(p => encodeURIComponent(p))
            .join('/')
        )
      ) {
        // od 侧 key 加前缀，避免两个云盘同名私密目录的 token 在 localStorage 中冲突
        authTokenPath = drive === 'od' ? `od:${r}` : r
        break
      }
    }
  }
  return authTokenPath
}

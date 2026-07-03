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
function encryptToken(token: string): string {
  return sha256(token).toString()
}

// Fetch stored token from localStorage and encrypt with SHA256
// path 应为剥离挂载前缀的后端路径；drive 决定查 ty 还是 od 的私密目录列表
export function getStoredToken(path: string, drive: Drive = 'ty'): string | null {
  const storedToken =
    typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(matchProtectedRoute(path, drive)) as string) : ''
  return storedToken ? encryptToken(storedToken) : null
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
  return encryptToken(dotPassword.trim()) === odTokenHeader
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

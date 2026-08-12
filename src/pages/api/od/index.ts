import { posix as pathPosix } from 'path'

import type { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'

import apiConfig from '../../../../config/api.config'
import siteConfig from '../../../../config/site.config'
import { revealObfuscatedToken } from '../../../utils/oAuthHandler'
import { compareHashedToken } from '../../../utils/protectedRouteHandler'
import {
  acquireOdRefreshLock,
  clearOdAccessToken,
  getOdAuthTokens,
  releaseOdRefreshLock,
  storeOdAuthTokens,
} from '../../../utils/odAuthTokenStore'
import { isAdminReq } from '../auth/check'
import { getProtectedRoutesOd } from '../../../utils/protectedRoutesStore'

const basePath = pathPosix.resolve('/', process.env.BASE_DIRECTORY || '/')
const clientId = process.env.CLIENT_ID || ''

/**
 * 延迟解密 CLIENT_SECRET。
 *
 * 安全：revealObfuscatedToken 在 CRYPTO_SECRET 未配置时会抛错（禁止回退公开密钥）。
 * 若在模块顶层调用，Next.js 构建期 "Collecting page data" 阶段会加载本模块
 * （因 step-1/2/3 通过 import { getAccessToken } from '../api/od' 引用），
 * 此时 Vercel 构建环境没有 CRYPTO_SECRET 会导致构建失败。
 *
 * 移到函数内部后，仅在运行时真正需要刷新 access token 时才解密，
 * 构建期模块加载不再触发该路径。
 */
function getClientSecret(): string {
  return revealObfuscatedToken(process.env.CLIENT_SECRET || '')
}

/**
 * Encode the path of the file relative to the base directory
 *
 * @param path Relative path of the file to the base directory
 * @param base Base directory to resolve from (defaults to BASE_DIRECTORY env)
 * @returns Absolute path of the file inside OneDrive
 */
export function encodePath(path: string, base: string = basePath): string {
  let encodedPath = pathPosix.join(base, path)
  if (encodedPath === '/' || encodedPath === '') {
    return ''
  }
  encodedPath = encodedPath.replace(/\/$/, '')
  return `:${encodeURIComponent(encodedPath)}`
}

/**
 * 模块级 token 锁：同一实例内并发请求复用同一 promise。
 * 跨实例刷新用 Redis NX 锁（acquireOdRefreshLock），避免 refresh_token 轮换竞态。
 */
let pendingTokenPromise: Promise<string> | null = null

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const body = new URLSearchParams()
  body.append('client_id', clientId)
  body.append('redirect_uri', apiConfig.redirectUri)
  body.append('client_secret', getClientSecret())
  body.append('refresh_token', refreshToken)
  body.append('grant_type', 'refresh_token')

  const resp = await axios.post(apiConfig.authApi, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  })

  // Microsoft 有时只返回 access_token + expires_in（不轮换 refresh_token）
  if (resp.data?.access_token) {
    const { expires_in, access_token, refresh_token } = resp.data
    await storeOdAuthTokens({
      accessToken: access_token,
      accessTokenExpiry: parseInt(expires_in, 10) || 3600,
      refreshToken: typeof refresh_token === 'string' ? refresh_token : refreshToken,
    })
    return access_token as string
  }
  return ''
}

/**
 * @param forceRefresh 为 true 时忽略 Redis 中的 access token，强制用 refresh_token 换新
 */
export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (pendingTokenPromise) {
    return pendingTokenPromise
  }

  pendingTokenPromise = (async () => {
    if (forceRefresh) {
      await clearOdAccessToken()
    }

    let { accessToken, refreshToken } = await getOdAuthTokens()

    if (!forceRefresh && typeof accessToken === 'string' && accessToken) {
      return accessToken
    }

    if (typeof refreshToken !== 'string' || !refreshToken) {
      // 冷启动/瞬时 Redis 失败时再读一次
      await sleep(200)
      ;({ accessToken, refreshToken } = await getOdAuthTokens())
      if (!forceRefresh && typeof accessToken === 'string' && accessToken) {
        return accessToken
      }
      if (typeof refreshToken !== 'string' || !refreshToken) {
        return ''
      }
    }

    // 跨实例互斥刷新
    const gotLock = await acquireOdRefreshLock()
    if (!gotLock) {
      // 其他实例正在刷新：等待后复用新 token
      for (let i = 0; i < 8; i++) {
        await sleep(300)
        const again = await getOdAuthTokens()
        if (typeof again.accessToken === 'string' && again.accessToken) {
          return again.accessToken
        }
      }
    }

    try {
      // 拿到锁后再读一次，可能已有新 token
      if (!forceRefresh) {
        const latest = await getOdAuthTokens()
        if (typeof latest.accessToken === 'string' && latest.accessToken) {
          return latest.accessToken
        }
        if (typeof latest.refreshToken === 'string' && latest.refreshToken) {
          refreshToken = latest.refreshToken
        }
      }

      try {
        return await refreshAccessToken(refreshToken as string)
      } catch (e: any) {
        console.error('[getAccessToken] refresh failed:', e?.response?.status, e?.message)
        // 瞬时失败重试一次
        await sleep(400)
        try {
          const latest = await getOdAuthTokens()
          const rt = typeof latest.refreshToken === 'string' ? latest.refreshToken : (refreshToken as string)
          return await refreshAccessToken(rt)
        } catch (e2: any) {
          console.error('[getAccessToken] refresh retry failed:', e2?.response?.status, e2?.message)
          return ''
        }
      }
    } finally {
      if (gotLock) {
        await releaseOdRefreshLock()
      }
    }
  })()

  try {
    return await pendingTokenPromise
  } finally {
    pendingTokenPromise = null
  }
}

/** Graph 请求：遇 401 时强制刷新 token 重试一次 */
export async function graphGet<T = any>(
  url: string,
  options: { params?: Record<string, any>; timeout?: number } = {},
  accessToken?: string
): Promise<{ data: T; accessToken: string }> {
  let token = accessToken || (await getAccessToken())
  if (!token) {
    const err: any = new Error('No access token')
    err.response = { status: 403, data: { error: 'No access token. OneDrive OAuth may not be completed.' } }
    throw err
  }

  try {
    const { data } = await axios.get<T>(url, {
      headers: { Authorization: `Bearer ${token}` },
      params: options.params,
      timeout: options.timeout ?? 20000,
    })
    return { data, accessToken: token }
  } catch (error: any) {
    const status = error?.response?.status
    if (status === 401) {
      token = await getAccessToken(true)
      if (!token) throw error
      const { data } = await axios.get<T>(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: options.params,
        timeout: options.timeout ?? 20000,
      })
      return { data, accessToken: token }
    }
    throw error
  }
}

/**
 * 匹配 OneDrive 侧的受保护路由
 * 注意：protectedRoutesOd 是 OneDrive 专属的私密目录列表，
 * 与天翼云的 protectedRoutes 分开配置，互不影响。
 * cleanPath 是相对于 OneDrive BASE_DIRECTORY 的路径（已剥离挂载前缀 /OneDrive）。
 *
 * 读取 Redis 中的动态配置（管理员后台增删的私密目录），未配置时回退到环境变量。
 * 这样管理员在后台新增的私密目录会立即生效，无需重新部署。
 */
export async function getAuthTokenPath(path: string): Promise<string> {
  // Ensure trailing slashes to compare paths component by component. Same for protectedRoutes.
  // Since OneDrive ignores case, lower case before comparing. Same for protectedRoutes.
  path = path.toLowerCase() + '/'
  const protectedRoutes = await getProtectedRoutesOd()
  let authTokenPath = ''
  for (let r of protectedRoutes) {
    if (typeof r !== 'string') continue
    r = r.toLowerCase().replace(/\/$/, '') + '/'
    if (path.startsWith(r)) {
      authTokenPath = `${r}.password`
      break
    }
  }
  return authTokenPath
}

/**
 * Handles protected route authentication for OneDrive:
 * - Match the cleanPath against protectedRoutesOd
 * - If a match is found, download the .password file and compare with od-protected-token header
 */
export async function checkAuthRoute(
  cleanPath: string,
  accessToken: string,
  odTokenHeader: string
): Promise<{ code: 200 | 401 | 404 | 500; message: string }> {
  const authTokenPath = await getAuthTokenPath(cleanPath)

  if (authTokenPath === '') {
    return { code: 200, message: '' }
  }

  try {
    const { data: tokenMeta } = await graphGet(
      `${apiConfig.driveApi}/root${encodePath(authTokenPath)}`,
      { params: { select: '@microsoft.graph.downloadUrl,file' } },
      accessToken
    )

    const odProtectedToken = await axios.get(tokenMeta['@microsoft.graph.downloadUrl'], {
      timeout: 15000,
      maxRedirects: 5,
    })

    if (
      !compareHashedToken({
        odTokenHeader: odTokenHeader,
        dotPassword: odProtectedToken.data.toString(),
      })
    ) {
      return { code: 401, message: 'Password required.' }
    }
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return { code: 404, message: "You didn't set a password." }
    } else {
      return { code: 500, message: 'Internal server error.' }
    }
  }

  return { code: 200, message: 'Authenticated.' }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // If method is POST, then the API is called by the client to store acquired tokens
  if (req.method === 'POST') {
    // 写入 OneDrive 凭据属高危操作，必须校验管理员会话。
    // 初始 OAuth 设置已改为 step-3 服务端直接 storeOdAuthTokens，不再经此端点。
    if (!(await isAdminReq(req))) {
      res.status(403).json({ error: 'Admin session required.' })
      return
    }
    const { obfuscatedAccessToken, accessTokenExpiry, obfuscatedRefreshToken } = req.body
    const accessToken = revealObfuscatedToken(obfuscatedAccessToken)
    const refreshToken = revealObfuscatedToken(obfuscatedRefreshToken)

    // 安全：revealObfuscatedToken 对空输入返回 ''，必须拒绝空值，
    // 否则误 POST 空 body 会把 Redis 中有效的 token 覆盖为空导致 OneDrive 失联
    if (typeof accessToken !== 'string' || !accessToken || typeof refreshToken !== 'string' || !refreshToken) {
      res.status(400).send('Invalid request body')
      return
    }

    await storeOdAuthTokens({ accessToken, accessTokenExpiry, refreshToken })
    res.status(200).send('OK')
    return
  }

  // If method is GET, then the API is a normal request to the OneDrive API for files or folders
  const { path = '/', raw = false, next = '', sort = '' } = req.query

  res.setHeader('Cache-Control', apiConfig.cacheControlHeader)

  // admin 参数：管理员路由请求从 OneDrive 绝对根目录开始（忽略 BASE_DIRECTORY）
  const adminFlag = req.query.admin === '1'
  let isAdmin = false
  if (adminFlag) {
    isAdmin = await isAdminReq(req)
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin session required.' })
      return
    }
  }

  if (path === '[...path]') {
    res.status(400).json({ error: 'No path specified.' })
    return
  }
  if (typeof path !== 'string') {
    res.status(400).json({ error: 'Path query invalid.' })
    return
  }
  const cleanPath = pathPosix.resolve('/', pathPosix.normalize(path)).replace(/\/$/, '')

  if (typeof sort !== 'string') {
    res.status(400).json({ error: 'Sort query invalid.' })
    return
  }

  // getAccessToken 内部调用 getClientSecret()，若 CRYPTO_SECRET 未配置会抛错。
  // 这里捕获后返回 JSON 错误（而非让错误冒泡到 Next.js 默认 _error HTML 页面），
  // 让前端 SWR 能拿到结构化错误信息正常渲染 FourOhFour，避免 SSR 500。
  let accessToken: string
  try {
    accessToken = await getAccessToken()
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to get OneDrive access token.' })
    return
  }

  if (!accessToken) {
    res.status(403).json({ error: 'No access token. OneDrive OAuth may not be completed.' })
    return
  }

  const { code, message } = await checkAuthRoute(cleanPath, accessToken, req.headers['od-protected-token'] as string)
  if (code !== 200) {
    res.status(code).json({ error: message })
    return
  }
  if (message !== '') {
    res.setHeader('Cache-Control', 'no-cache')
  }

  // admin 请求从 OneDrive 绝对根目录开始，忽略 BASE_DIRECTORY 挂载点
  const requestPath = encodePath(cleanPath, isAdmin ? '/' : basePath)
  const requestUrl = `${apiConfig.driveApi}/root${requestPath}`
  const isRoot = requestPath === ''

  // Go for file raw download link and redirect to @microsoft.graph.downloadUrl
  if (raw) {
    res.setHeader('Cache-Control', 'no-cache')

    try {
      const { data } = await graphGet(requestUrl, {
        params: { select: 'id,@microsoft.graph.downloadUrl' },
      }, accessToken)

      if ('@microsoft.graph.downloadUrl' in data) {
        res.redirect(data['@microsoft.graph.downloadUrl'])
      } else {
        res.status(404).json({ error: 'No download url found.' })
      }
    } catch (error: any) {
      console.error('[api/od/index] raw error:', error?.message)
      res.status(error?.response?.status ?? 500).json({ error: error?.response?.data?.error || 'Internal server error.' })
    }
    return
  }

  // Querying current path identity (file or folder) and follow up query childrens in folder
  try {
    const { data: identityData, accessToken: tokenAfterIdentity } = await graphGet(requestUrl, {
      params: {
        select: 'name,size,id,lastModifiedDateTime,folder,file,video,image',
      },
    }, accessToken)
    accessToken = tokenAfterIdentity

    if ('folder' in identityData) {
      const { data: folderData } = await graphGet(`${requestUrl}${isRoot ? '' : ':'}/children`, {
        params: {
          ...{
            select: 'name,size,id,lastModifiedDateTime,folder,file,video,image',
            $top: siteConfig.maxItems,
          },
          ...(next ? { $skipToken: next } : {}),
          ...(sort ? { $orderby: sort } : {}),
        },
      }, accessToken)

      const nextPageMatch = folderData['@odata.nextLink']
        ? folderData['@odata.nextLink'].match(/&\$skiptoken=(.+)/i)
        : null
      const nextPage = nextPageMatch ? nextPageMatch[1] : null

      if (nextPage) {
        res.status(200).json({ folder: folderData, next: nextPage })
      } else {
        res.status(200).json({ folder: folderData })
      }
      return
    }
    res.status(200).json({ file: identityData })
    return
  } catch (error: any) {
    console.error('[api/od/index] error:', error?.message)
    res.status(error?.response?.status ?? 500).json({ error: error?.response?.data?.error || 'Internal server error.' })
    return
  }
}

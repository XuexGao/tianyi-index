import { posix as pathPosix } from 'path'

import type { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'

import apiConfig from '../../../../config/api.config'
import siteConfig from '../../../../config/site.config'
import { revealObfuscatedToken } from '../../../utils/oAuthHandler'
import { compareHashedToken } from '../../../utils/protectedRouteHandler'
import { getOdAuthTokens, storeOdAuthTokens } from '../../../utils/odAuthTokenStore'
import { isAdminReq } from '../auth/check'
import { runCorsMiddleware } from './raw'

const basePath = pathPosix.resolve('/', process.env.BASE_DIRECTORY || '/')
const clientId = process.env.CLIENT_ID || ''
const clientSecret = revealObfuscatedToken(process.env.CLIENT_SECRET || '')

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
 * Fetch the access token from Redis storage and check if the token requires a renew
 *
 * @returns Access token for OneDrive API
 */
export async function getAccessToken(): Promise<string> {
  const { accessToken, refreshToken } = await getOdAuthTokens()

  // Return in storage access token if it is still valid
  if (typeof accessToken === 'string') {
    return accessToken
  }

  // Return empty string if no refresh token is stored, which requires the application to be re-authenticated
  if (typeof refreshToken !== 'string') {
    return ''
  }

  // Fetch new access token with in storage refresh token
  const body = new URLSearchParams()
  body.append('client_id', clientId)
  body.append('redirect_uri', apiConfig.redirectUri)
  body.append('client_secret', clientSecret)
  body.append('refresh_token', refreshToken)
  body.append('grant_type', 'refresh_token')

  const resp = await axios.post(apiConfig.authApi, body, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })

  if ('access_token' in resp.data && 'refresh_token' in resp.data) {
    const { expires_in, access_token, refresh_token } = resp.data
    await storeOdAuthTokens({
      accessToken: access_token,
      accessTokenExpiry: parseInt(expires_in),
      refreshToken: refresh_token,
    })
    return access_token
  }

  return ''
}

/**
 * 匹配 OneDrive 侧的受保护路由
 * 注意：siteConfig.protectedRoutesOd 是 OneDrive 专属的私密目录列表，
 * 与天翼云的 protectedRoutes 分开配置，互不影响。
 * cleanPath 是相对于 OneDrive BASE_DIRECTORY 的路径（已剥离挂载前缀 /OneDrive）。
 */
export function getAuthTokenPath(path: string) {
  // Ensure trailing slashes to compare paths component by component. Same for protectedRoutes.
  // Since OneDrive ignores case, lower case before comparing. Same for protectedRoutes.
  path = path.toLowerCase() + '/'
  const protectedRoutes = (siteConfig.protectedRoutesOd as string[]) || []
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
  const authTokenPath = getAuthTokenPath(cleanPath)

  if (authTokenPath === '') {
    return { code: 200, message: '' }
  }

  try {
    const token = await axios.get(`${apiConfig.driveApi}/root${encodePath(authTokenPath)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: '@microsoft.graph.downloadUrl,file',
      },
    })

    const odProtectedToken = await axios.get(token.data['@microsoft.graph.downloadUrl'])

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

    if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
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

  const accessToken = await getAccessToken()

  if (!accessToken) {
    res.status(403).json({ error: 'No access token.' })
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

  // Go for file raw download link, add CORS headers, and redirect to @microsoft.graph.downloadUrl
  if (raw) {
    await runCorsMiddleware(req, res)
    res.setHeader('Cache-Control', 'no-cache')

    const { data } = await axios.get(requestUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'id,@microsoft.graph.downloadUrl',
      },
    })

    if ('@microsoft.graph.downloadUrl' in data) {
      res.redirect(data['@microsoft.graph.downloadUrl'])
    } else {
      res.status(404).json({ error: 'No download url found.' })
    }
    return
  }

  // Querying current path identity (file or folder) and follow up query childrens in folder
  try {
    const { data: identityData } = await axios.get(requestUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'name,size,id,lastModifiedDateTime,folder,file,video,image',
      },
    })

    if ('folder' in identityData) {
      const { data: folderData } = await axios.get(`${requestUrl}${isRoot ? '' : ':'}/children`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          ...{
            select: 'name,size,id,lastModifiedDateTime,folder,file,video,image',
            $top: siteConfig.maxItems,
          },
          ...(next ? { $skipToken: next } : {}),
          ...(sort ? { $orderby: sort } : {}),
        },
      })

      const nextPage = folderData['@odata.nextLink']
        ? folderData['@odata.nextLink'].match(/&\$skiptoken=(.+)/i)[1]
        : null

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
    res.status(error?.response?.code ?? 500).json({ error: error?.response?.data ?? 'Internal server error.' })
    return
  }
}

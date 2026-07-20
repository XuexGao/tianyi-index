import axios from 'axios'
import CryptoJS from 'crypto-js'

import apiConfig from '../../config/api.config'

// OneDrive OAuth 流程的客户端配置接口，从 /api/od/config 获取
async function getConfig() {
  const res = await axios.get('/api/od/config')
  return res.data
}

// Just a disguise to obfuscate required tokens (including but not limited to client secret,
// access tokens, and refresh tokens), used along with the following two functions.
//
// 安全策略：
// - revealObfuscatedToken 仅在服务端调用，CRYPTO_SECRET 必须配置，否则启动期首次调用即抛错；
// - obfuscateToken 仅由已废弃的客户端 sendTokenToServer 流程使用，无法读取服务端环境变量，
//   保留公开回退密钥仅为兼容旧调用方，新流程（step-3 SSR）已在服务端直接 storeOdAuthTokens。
//
// 注意：本模块同时被客户端（step-3.tsx 顶部 import）和服务端引用，因此不能在模块顶层抛错，
// 否则客户端 bundle 加载会崩。CRYPTO_SECRET 校验延迟到 revealObfuscatedToken 首次调用时执行
// （仅在服务端发生），相当于"启动报错"语义。
const CLIENT_FALLBACK_KEY = 'onedrive-vercel-index'

let serverAesKey: string | null = null
let serverAesKeyResolved = false

/**
 * 获取服务端 AES 密钥。CRYPTO_SECRET 未配置时抛错，禁止回退到公开密钥。
 * 缓存解析结果，避免每次解密都重复读取环境变量。
 */
function getServerAesKey(): string {
  if (serverAesKeyResolved) {
    if (serverAesKey === null) {
      throw new Error('CRYPTO_SECRET 环境变量未配置，无法解密 OneDrive 凭据。请在 Vercel/服务器环境变量中配置 CRYPTO_SECRET 后重新部署。')
    }
    return serverAesKey
  }
  serverAesKeyResolved = true
  const k = process.env.CRYPTO_SECRET
  if (!k || !k.trim()) {
    serverAesKey = null
    throw new Error('CRYPTO_SECRET 环境变量未配置，无法解密 OneDrive 凭据。请在 Vercel/服务器环境变量中配置 CRYPTO_SECRET 后重新部署。')
  }
  serverAesKey = k
  return serverAesKey
}

export function obfuscateToken(token: string): string {
  // 客户端无法读取服务端环境变量；该函数仅由已废弃的 sendTokenToServer 流程使用
  // （新流程 step-3 SSR 已直接在服务端存储 token），保留回退密钥仅为兼容。
  const key = typeof window !== 'undefined' ? CLIENT_FALLBACK_KEY : (process.env.CRYPTO_SECRET || CLIENT_FALLBACK_KEY)
  const encrypted = CryptoJS.AES.encrypt(token, key)
  return encrypted.toString()
}
export function revealObfuscatedToken(obfuscated: string): string {
  // Decrypt AES obfuscated token（仅服务端调用）
  if (!obfuscated) return ''
  const decrypted = CryptoJS.AES.decrypt(obfuscated, getServerAesKey())
  return decrypted.toString(CryptoJS.enc.Utf8)
}

// Generate the Microsoft OAuth 2.0 authorization URL, used for requesting the authorisation code
export async function generateAuthorisationUrl(): Promise<string> {
  const { clientId } = await getConfig()
  const { redirectUri, authApi, scope } = apiConfig
  const authUrl = authApi.replace('/token', '/authorize')

  // Construct URL parameters for OAuth2
  const params = new URLSearchParams()
  params.append('client_id', clientId)
  params.append('redirect_uri', redirectUri)
  params.append('response_type', 'code')
  params.append('scope', scope)
  params.append('response_mode', 'query')

  return `${authUrl}?${params.toString()}`
}

// The code returned from the Microsoft OAuth 2.0 authorization URL is a request URL with hostname
// http://localhost and URL parameter code. This function extracts the code from the request URL
export function extractAuthCodeFromRedirected(url: string): string {
  // Return empty string if the url is not the defined redirect uri
  if (!url.startsWith(apiConfig.redirectUri)) {
    return ''
  }

  // New URL search parameter
  const params = new URLSearchParams(url.split('?')[1])
  return params.get('code') ?? ''
}

// OAuth 配置结构（由 /api/od/config 返回）
interface OdClientConfig {
  clientId: string
  clientSecret: string
}

// After a successful authorisation, the code returned from the Microsoft OAuth 2.0 authorization URL
// will be used to request an access token. This function requests the access token with the authorisation code
// and returns the access token and refresh token on success.
export async function requestTokenWithAuthCode(code: string, config: OdClientConfig): Promise<
  | { expiryTime: string; accessToken: string; refreshToken: string }
  | { error: string; errorDescription: string; errorUri: string }
> {
  try {
    const clientId = config.clientId
    const clientSecret = revealObfuscatedToken(config.clientSecret)
    const { redirectUri, authApi } = apiConfig

    // Construct URL parameters for OAuth2
    const params = new URLSearchParams()
    params.append('client_id', clientId)
    params.append('redirect_uri', redirectUri)
    params.append('client_secret', clientSecret)
    params.append('code', code)
    params.append('grant_type', 'authorization_code')

    // Request access token
    return axios
      .post(authApi, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })
      .then(resp => {
        const { expires_in, access_token, refresh_token } = resp.data
        return { expiryTime: expires_in, accessToken: access_token, refreshToken: refresh_token }
      })
      .catch(err => {
        const { error, error_description, error_uri } = err.response.data
        return { error, errorDescription: error_description, errorUri: error_uri }
      })
  } catch (error) {
    console.error('Failed to get config:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { error: 'Failed to get config', errorDescription: errorMessage, errorUri: '' }
  }
}

// Verify the identity of the user with the access token and compare it with the userPrincipalName
// in the Microsoft Graph API. If the userPrincipalName matches, proceed with token storing.
export async function getAuthPersonInfo(accessToken: string) {
  const profileApi = apiConfig.driveApi.replace('/drive', '')
  return axios.get(profileApi, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
}

// 将 token 回传到服务端存储。原 OneDrive 项目硬编码 POST /api，这里改为 /api/od
export async function sendTokenToServer(accessToken: string, refreshToken: string, expiryTime: string) {
  return await axios.post(
    '/api/od',
    {
      obfuscatedAccessToken: obfuscateToken(accessToken),
      accessTokenExpiry: parseInt(expiryTime),
      obfuscatedRefreshToken: obfuscateToken(refreshToken),
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )
}

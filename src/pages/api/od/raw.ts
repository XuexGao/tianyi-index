import { posix as pathPosix } from 'path'

import type { NextApiRequest, NextApiResponse } from 'next'
import axios, { AxiosResponseHeaders } from 'axios'
import Cors from 'cors'

import { driveApi, cacheControlHeader } from '../../../../config/api.config'
import { encodePath, getAccessToken, checkAuthRoute } from '.'
import { isAdminReq } from '../auth/check'

// CORS middleware for raw links: https://nextjs.org/docs/api-routes/api-middlewares
export function runCorsMiddleware(req: NextApiRequest, res: NextApiResponse) {
  const cors = Cors({ methods: ['GET', 'HEAD'] })
  return new Promise((resolve, reject) => {
    cors(req, res, result => {
      if (result instanceof Error) {
        return reject(result)
      }

      return resolve(result)
    })
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 同 /api/od/index.ts：捕获 CRYPTO_SECRET 未配置等错误，返回 JSON 而非 _error HTML
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

  const { path = '/', odpt = '', proxy } = req.query

  // 通过 cookie 判断 admin 状态（raw 下载是浏览器导航，自动带 cookie）
  // admin 时从 OneDrive 绝对根目录开始，忽略 BASE_DIRECTORY
  const isAdmin = await isAdminReq(req)

  if (path === '[...path]') {
    res.status(400).json({ error: 'No path specified.' })
    return
  }
  if (typeof path !== 'string') {
    res.status(400).json({ error: 'Path query invalid.' })
    return
  }
  const cleanPath = pathPosix.resolve('/', pathPosix.normalize(path))

  const odTokenHeader = (req.headers['od-protected-token'] as string) ?? odpt

  const { code, message } = await checkAuthRoute(cleanPath, accessToken, odTokenHeader)
  if (code !== 200) {
    res.status(code).json({ error: message })
    return
  }
  if (message !== '') {
    res.setHeader('Cache-Control', 'no-cache')
  }

  await runCorsMiddleware(req, res)
  try {
    // admin 请求从 OneDrive 绝对根目录开始，忽略 BASE_DIRECTORY
    const requestUrl = `${driveApi}/root${encodePath(cleanPath, isAdmin ? '/' : undefined)}`
    const { data } = await axios.get(requestUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'id,size,@microsoft.graph.downloadUrl',
      },
    })

    if ('@microsoft.graph.downloadUrl' in data) {
      // Only proxy raw file content response for files up to 4MB
      // 安全：proxy 参数需显式传 'true'，否则非空字符串（如 'false'）会被当真值
      const shouldProxy = proxy === 'true'
      if (shouldProxy && 'size' in data && data['size'] < 4194304) {
        const { headers, data: stream } = await axios.get(data['@microsoft.graph.downloadUrl'] as string, {
          responseType: 'stream',
        })
        // 安全：仅转发白名单响应头，避免透传 Set-Cookie / Location 等
        const safeHeaders: Record<string, any> = {
          'Content-Type': headers['content-type'] || 'application/octet-stream',
          'Content-Length': headers['content-length'] || '',
          'ETag': headers['etag'] || '',
          'Last-Modified': headers['last-modified'] || '',
          'Cache-Control': cacheControlHeader,
        }
        res.writeHead(200, safeHeaders as AxiosResponseHeaders)
        stream.pipe(res)
      } else {
        res.redirect(data['@microsoft.graph.downloadUrl'])
      }
    } else {
      res.status(404).json({ error: 'No download url found.' })
    }
    return
  } catch (error: any) {
    // 安全：不向客户端透传上游 Graph API 错误详情，仅记录日志
    console.error('[api/od/raw] error:', error?.message)
    res.status(error?.response?.status ?? 500).json({ error: 'Internal server error.' })
    return
  }
}

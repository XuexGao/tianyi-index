import type { NextApiRequest, NextApiResponse } from 'next'

import { encodePath, getAccessToken, graphGet } from '.'
import apiConfig from '../../../../config/api.config'
import siteConfig from '../../../../config/site.config'
import { getProtectedRoutesOd } from '../../../utils/protectedRoutesStore'

/**
 * Sanitize the search query
 */
function sanitiseQuery(query: string): string {
  const sanitisedQuery = query
    .replace(/'/g, "''")
    .replace(/</g, ' &lt; ')
    .replace(/>/g, ' &gt; ')
    .replace(/\?/g, ' ')
    .replace(/\//g, ' ')
  return encodeURIComponent(sanitisedQuery)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  const { q: searchQuery = '' } = req.query

  res.setHeader('Cache-Control', apiConfig.cacheControlHeader)

  if (typeof searchQuery === 'string') {
    const searchRootPath = encodePath('/')
    const encodedPath = searchRootPath === '' ? searchRootPath : searchRootPath + ':'

    const searchApi = `${apiConfig.driveApi}/root${encodedPath}/search(q='${sanitiseQuery(searchQuery)}')`

    try {
      const { data } = await graphGet(searchApi, {
        params: {
          select: 'id,name,file,folder,parentReference',
          top: siteConfig.maxItems,
        },
      }, accessToken)

      // 安全：过滤掉受保护目录下的结果，避免搜索绕过目录密码保护泄露文件元数据。
      // 采用粗匹配（命中即隐藏，宁可多隐藏也不泄露）。
      // 读取 Redis 中的动态配置，管理员后台增删的私密目录也会被过滤。
      const protectedRoutesOd = (await getProtectedRoutesOd())
        .map(r => r.toLowerCase().replace(/\/$/, ''))
        .filter(Boolean)
      const filtered = (data.value as any[]).filter(item => {
        const fullPath = `${item.parentReference?.path || ''}/${item.name || ''}`.toLowerCase()
        return !protectedRoutesOd.some(r => fullPath.includes(r))
      })

      res.status(200).json(filtered)
    } catch (error: any) {
      console.error('[api/od/search] error:', error?.message)
      res.status(error?.response?.status ?? 500).json({ error: 'Internal server error.' })
    }
  } else {
    res.status(200).json([])
  }
  return
}

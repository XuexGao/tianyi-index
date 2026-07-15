import axios from 'axios'
import type { NextApiRequest, NextApiResponse } from 'next'

import { encodePath, getAccessToken } from '.'
import apiConfig from '../../../../config/api.config'
import siteConfig from '../../../../config/site.config'

/**
 * Sanitize the search query
 */
function sanitiseQuery(query: string): string {
  const sanitisedQuery = query
    .replace(/'/g, "''")
    .replace('<', ' &lt; ')
    .replace('>', ' &gt; ')
    .replace('?', ' ')
    .replace('/', ' ')
  return encodeURIComponent(sanitisedQuery)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const accessToken = await getAccessToken()

  const { q: searchQuery = '' } = req.query

  res.setHeader('Cache-Control', apiConfig.cacheControlHeader)

  if (typeof searchQuery === 'string') {
    const searchRootPath = encodePath('/')
    const encodedPath = searchRootPath === '' ? searchRootPath : searchRootPath + ':'

    const searchApi = `${apiConfig.driveApi}/root${encodedPath}/search(q='${sanitiseQuery(searchQuery)}')`

    try {
      const { data } = await axios.get(searchApi, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          select: 'id,name,file,folder,parentReference',
          top: siteConfig.maxItems,
        },
      })

      // 安全：过滤掉受保护目录下的结果，避免搜索绕过目录密码保护泄露文件元数据。
      // 采用粗匹配（命中即隐藏，宁可多隐藏也不泄露）。
      const protectedRoutesOd = ((siteConfig.protectedRoutesOd as string[]) || [])
        .map(r => r.toLowerCase().replace(/\/$/, ''))
        .filter(Boolean)
      const filtered = (data.value as any[]).filter(item => {
        const fullPath = `${item.parentReference?.path || ''}/${item.name || ''}`.toLowerCase()
        return !protectedRoutesOd.some(r => fullPath.includes(r))
      })

      res.status(200).json(filtered)
    } catch (error: any) {
      res.status(error?.response?.status ?? 500).json({ error: error?.response?.data ?? 'Internal server error.' })
    }
  } else {
    res.status(200).json([])
  }
  return
}

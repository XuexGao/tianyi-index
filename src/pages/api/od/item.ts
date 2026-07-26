import type { NextApiRequest, NextApiResponse } from 'next'

import { getAccessToken, graphGet } from '.'
import apiConfig from '../../../../config/api.config'

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

  const { id = '' } = req.query

  res.setHeader('Cache-Control', apiConfig.cacheControlHeader)

  if (typeof id === 'string') {
    // 安全：校验 id 仅含合法字符，防止路径注入到 Graph API URL
    if (!/^[A-Za-z0-9!_-]+$/.test(id)) {
      res.status(400).json({ error: 'Invalid driveItem ID.' })
      return
    }
    const itemApi = `${apiConfig.driveApi}/items/${id}`

    try {
      const { data } = await graphGet(itemApi, {
        params: {
          select: 'id,name,parentReference',
        },
      }, accessToken)
      res.status(200).json(data)
    } catch (error: any) {
      console.error('[api/od/item] error:', error?.message)
      res.status(error?.response?.status ?? 500).json({ error: 'Internal server error.' })
    }
  } else {
    res.status(400).json({ error: 'Invalid driveItem ID.' })
  }
  return
}

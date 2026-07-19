import { Readable } from 'stream'

import type { NextApiRequest, NextApiResponse } from 'next'

const UPSTREAM = process.env.WALLPAPER_UPSTREAM || 'https://api.elaina.cat/random/'

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const upstream = await fetch(UPSTREAM, { redirect: 'follow' })
    if (!upstream.ok || !upstream.body) {
      res.status(502).json({ error: 'upstream error' })
      return
    }

    const contentType = upstream.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) {
      res.status(502).json({ error: 'upstream returned non-image content type' })
      return
    }

    res.setHeader('Content-Type', contentType)
    const contentLength = upstream.headers.get('content-length')
    if (contentLength) res.setHeader('Content-Length', contentLength)
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.statusCode = 200

    await new Promise<void>((resolve, reject) => {
      const stream = Readable.fromWeb(upstream.body as any)
      stream.on('error', reject)
      res.on('finish', resolve)
      res.on('close', resolve)
      stream.pipe(res)
    })
  } catch (error) {
    console.error('[api/wallpaper] error:', error)
    if (!res.headersSent) res.status(502).json({ error: 'Internal server error.' })
  }
}

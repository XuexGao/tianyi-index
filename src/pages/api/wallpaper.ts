import { Readable } from 'stream'

import type { NextApiRequest, NextApiResponse } from 'next'

const UPSTREAM = process.env.WALLPAPER_UPSTREAM || 'https://api.elaina.cat/random/'
// 最大允许图片大小 10MB，防止上游返回超大内容
const MAX_IMAGE_SIZE = 10 * 1024 * 1024

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

    const contentLength = upstream.headers.get('content-length')
    // 验证上游 Content-Length 不超过限制
    if (contentLength) {
      const length = parseInt(contentLength, 10)
      if (!isNaN(length) && length > MAX_IMAGE_SIZE) {
        res.status(502).json({ error: 'upstream image too large' })
        return
      }
    }

    res.setHeader('Content-Type', contentType)
    if (contentLength) res.setHeader('Content-Length', contentLength)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.statusCode = 200

    // 用管道转发时限制数据量，超出后销毁流
    let totalBytes = 0
    const transformed = new Readable({
      read() {},
    })
    const upstreamStream = Readable.fromWeb(upstream.body as any)
    upstreamStream.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length
      if (totalBytes > MAX_IMAGE_SIZE) {
        upstreamStream.destroy()
        transformed.destroy(new Error('image too large'))
        if (!res.headersSent) res.status(502).json({ error: 'upstream image too large' })
        return
      }
      transformed.push(chunk)
    })
    upstreamStream.on('end', () => {
      transformed.push(null)
    })
    upstreamStream.on('error', (err) => {
      transformed.destroy(err)
    })

    await new Promise<void>((resolve, reject) => {
      transformed.on('error', reject)
      res.on('finish', resolve)
      res.on('close', resolve)
      transformed.pipe(res)
    })
  } catch (error) {
    console.error('[api/wallpaper] error:', error)
    if (!res.headersSent) res.status(502).json({ error: 'Internal server error.' })
  }
}

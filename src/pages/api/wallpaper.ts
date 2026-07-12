import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * 背景图代理：同源返回外部壁纸，并加 CORS 头，
 * 让前端 canvas 能跨域读取像素做亮度采样。
 *
 * 不缓存：每次请求都拿新图（与原 https://api.elaina.cat/random/ 行为一致）。
 */
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const upstream = 'https://api.elaina.cat/random/'
    const r = await fetch(upstream, { redirect: 'follow' })
    if (!r.ok) {
      res.status(502).json({ error: 'upstream error' })
      return
    }
    const buf = Buffer.from(await r.arrayBuffer())
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(200).send(buf)
  } catch (e: any) {
    res.status(502).json({ error: String(e?.message || e) })
  }
}

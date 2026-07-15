import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * 背景图代理：同源返回外部壁纸，并加 CORS 头，
 * 同时在服务端计算图片顶部亮度，通过响应头 X-Bg-Dark 返回。
 *
 * 保持每次请求都返回新图（与原 https://api.elaina.cat/random/ 行为一致）。
 * 不做服务端缓存，保证刷新能换图。
 *
 * 唯一的性能优化：sharp 处理加超时降级（1.5s），避免原生模块冷启动阻塞响应。
 */
const UPSTREAM = 'https://api.elaina.cat/random/'
const SHARP_TIMEOUT = 1500 // sharp 处理超时降级

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const r = await fetch(UPSTREAM, { redirect: 'follow' })
    if (!r.ok) {
      res.status(502).json({ error: 'upstream error' })
      return
    }
    const buf = Buffer.from(await r.arrayBuffer())

    // 安全：校验上游 Content-Type 为图片类型，防止非图片内容以本站同源执行 XSS
    const upstreamContentType = r.headers.get('content-type') || ''
    if (!upstreamContentType.startsWith('image/')) {
      res.status(502).json({ error: 'upstream returned non-image content type' })
      return
    }

    // sharp 计算亮度，超时降级
    let isDark = false
    try {
      isDark = await Promise.race([
        isImageTopDark(buf),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), SHARP_TIMEOUT)),
      ])
    } catch (e) {
      // 解析失败降级为不深色
    }

    res.setHeader('Content-Type', upstreamContentType)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Expose-Headers', 'X-Bg-Dark')
    res.setHeader('X-Bg-Dark', isDark ? '1' : '0')
    res.status(200).send(buf)
  } catch {
    res.status(502).json({ error: 'Internal server error.' })
  }
}

/**
 * 解析图片 buffer，采样顶部 12% 条带的平均亮度。
 * 亮度 < 100 视为深色。
 * 动态 require sharp（原生模块，冷启动慢），失败降级。
 */
async function isImageTopDark(buf: Buffer): Promise<boolean> {
  const sharp = require('sharp')
  const meta = await sharp(buf).metadata()
  const w = meta.width || 0
  const h = meta.height || 0
  if (!w || !h) return false
  const stripH = Math.max(1, Math.floor(h * 0.12))
  const { data, info } = await sharp(buf)
    .extract({ left: 0, top: 0, width: w, height: stripH })
    .raw()
    .toBuffer({ resolveWithObject: true })
  let total = 0
  const channels = info.channels
  const pixels = data.length / channels
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    total += 0.299 * r + 0.587 * g + 0.114 * b
  }
  const avg = total / pixels
  return avg < 100
}

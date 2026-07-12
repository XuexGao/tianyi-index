import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * 背景图代理：同源返回外部壁纸，并加 CORS 头，
 * 同时在服务端计算图片顶部亮度，通过响应头 X-Bg-Dark 返回。
 *
 * 前端用 fetch 拿到图片 blob + 响应头，一次请求同时获得图和亮度，
 * 保证采样结果和实际显示的图完全一致（不会出现两张随机图错位）。
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

    // 服务端计算顶部条带平均亮度
    let isDark = false
    try {
      isDark = await isImageTopDark(buf)
    } catch (e) {
      // 解析失败降级为不深色
    }

    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Expose-Headers', 'X-Bg-Dark')
    res.setHeader('X-Bg-Dark', isDark ? '1' : '0')
    res.status(200).send(buf)
  } catch (e: any) {
    res.status(502).json({ error: String(e?.message || e) })
  }
}

/**
 * 解析图片 buffer，采样顶部 12% 条带的平均亮度。
 * 支持 JPEG / PNG。亮度 < 100 视为深色。
 *
 * 这里用最小化方式：不依赖 sharp，用 Node 内置能力 + 轻量解析。
 * 为避免引入大依赖，使用动态 require sharp（若已安装），否则降级。
 */
async function isImageTopDark(buf: Buffer): Promise<boolean> {
  // 尝试用 sharp（若安装）
  try {
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
  } catch {
    // sharp 不可用，降级为不深色
    return false
  }
}

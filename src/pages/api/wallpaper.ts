import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * 背景图代理：同源返回外部壁纸，并加 CORS 头，
 * 同时在服务端计算图片顶部亮度，通过响应头 X-Bg-Dark 返回。
 *
 * 性能优化：
 * 1. 模块级短时缓存（60秒 TTL）：Vercel serverless 实例复用时，短时间内多个请求直接返回缓存，
 *    避免每次都 fetch 外部图 + sharp 处理。这是首屏加速的核心。
 * 2. 上游失败时降级返回旧缓存（stale-while-error），避免完全无背景。
 * 3. sharp 处理加超时（1.5s），超时降级为不深色，避免阻塞响应。
 * 4. Cache-Control: public, max-age=60, stale-while-revalidate=300
 *    让浏览器和 CDN 短时缓存，preload 和 fetch 可复用同一响应。
 */
const UPSTREAM = 'https://api.elaina.cat/random/'
const CACHE_TTL = 60 * 1000 // 60 秒内复用同一张图
const SHARP_TIMEOUT = 1500 // sharp 处理超时降级

interface CacheEntry {
  buf: Buffer
  contentType: string
  isDark: boolean
  ts: number
}

let cache: CacheEntry | null = null

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const now = Date.now()

  // 命中缓存：直接返回（首屏加速核心）
  if (cache && now - cache.ts < CACHE_TTL) {
    sendImage(res, cache)
    return
  }

  try {
    const r = await fetch(UPSTREAM, { redirect: 'follow' })
    if (!r.ok) {
      // 上游失败但有旧缓存：返回旧缓存
      if (cache) {
        sendImage(res, cache)
        return
      }
      res.status(502).json({ error: 'upstream error' })
      return
    }
    const buf = Buffer.from(await r.arrayBuffer())
    const contentType = r.headers.get('content-type') || 'image/jpeg'

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

    // 更新缓存
    cache = { buf, contentType, isDark, ts: now }
    sendImage(res, cache)
  } catch (e: any) {
    // 异常但有旧缓存：返回旧缓存
    if (cache) {
      sendImage(res, cache)
      return
    }
    res.status(502).json({ error: String(e?.message || e) })
  }
}

function sendImage(res: NextApiResponse, entry: CacheEntry) {
  res.setHeader('Content-Type', entry.contentType)
  // 短时缓存 + stale-while-revalidate：让浏览器/CDN 复用响应，
  // 同时让 BackgroundImage 的 fetch 能复用 _document 里的 preload 请求
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Expose-Headers', 'X-Bg-Dark')
  res.setHeader('X-Bg-Dark', entry.isDark ? '1' : '0')
  res.status(200).send(entry.buf)
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

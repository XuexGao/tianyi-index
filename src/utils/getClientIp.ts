import type { NextApiRequest } from 'next'

/**
 * 获取客户端真实 IP，用于限流等场景。
 *
 * 安全说明（重要）：
 * - 部署在 Vercel 等平台时，平台会覆盖/追加 X-Forwarded-For，直接取第一个值即可；
 * - 自托管部署时，X-Forwarded-For 可被客户端伪造，攻击者可借此绕过基于 IP 的限流。
 *   必须满足以下条件之一，限流才可信：
 *     1. 反向代理（nginx / Caddy 等）配置了
 *        `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`
 *        且不接受客户端传入的 XFF 头（$proxy_add_x_forwarded_for 会自动追加，配合
 *        代理层覆盖即可）；或
 *     2. 设置环境变量 IP_SOURCE=x-real-ip，并在反代配置
 *        `proxy_set_header X-Real-IP $remote_addr;`（nginx 会覆盖同名头，可信）。
 * - 若既无代理又未配置，可设 IP_SOURCE=socket 直接使用 TCP 连接地址
 *   （多实例/负载均衡场景不适用）。
 */

type IpSource = 'x-forwarded-for' | 'x-real-ip' | 'socket'

function resolveIpSource(): IpSource {
  const v = (process.env.IP_SOURCE || 'x-forwarded-for').trim().toLowerCase()
  if (v === 'x-real-ip' || v === 'socket') return v
  return 'x-forwarded-for'
}

export function getClientIp(req: NextApiRequest): string {
  const source = resolveIpSource()

  if (source === 'socket') {
    return req.socket?.remoteAddress || 'unknown'
  }

  if (source === 'x-real-ip') {
    const realIp = req.headers['x-real-ip']
    if (typeof realIp === 'string' && realIp.trim()) {
      return realIp.trim().split(',')[0].trim()
    }
    // x-real-ip 缺失时回退到 XFF / socket，避免误伤
    return fallbackIp(req)
  }

  // 默认：x-forwarded-for（兼容 Vercel 等托管平台）
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim() || fallbackIp(req)
  }
  return fallbackIp(req)
}

function fallbackIp(req: NextApiRequest): string {
  return req.socket?.remoteAddress || 'unknown'
}
import { createHmac, randomBytes } from 'crypto'

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

function getSigningKey(): string {
  // 安全：优先使用独立 CRYPTO_SECRET 签名受保护路由 token。
  // 回退到 ADMIN_PASSWORD 时，同一密钥同时用于管理登录和 token 签名，
  // 若 ADMIN_PASSWORD 泄露，攻击者可同时伪造 session 和 signed token。
  // 建议配置独立的 CRYPTO_SECRET 环境变量。
  if (process.env.CRYPTO_SECRET) return process.env.CRYPTO_SECRET
  if (process.env.ADMIN_PASSWORD) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[protectedTokenSigner] 使用 ADMIN_PASSWORD 作为签名密钥。建议配置独立 CRYPTO_SECRET 以提升安全性。')
    }
    return process.env.ADMIN_PASSWORD
  }
  return ''
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export function isSignedToken(token: string): boolean {
  return token.length > 64 && token.includes('.')
}

export function signProtectedToken(path: string): string | null {
  const key = getSigningKey()
  if (!key) return null

  const payload = JSON.stringify({
    exp: Date.now() + TOKEN_TTL_MS,
    path,
    nonce: randomBytes(8).toString('hex'),
  })
  const sig = createHmac('sha256', key).update(payload).digest('base64url')
  return Buffer.from(payload).toString('base64url') + '.' + sig
}

export function parseProtectedToken(token: string): { path: string; valid: boolean } {
  const dot = token.lastIndexOf('.')
  if (dot === -1) return { path: '', valid: false }

  const payloadB64 = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  const key = getSigningKey()
  if (!key) return { path: '', valid: false }

  const payloadStr = Buffer.from(payloadB64, 'base64url').toString()
  const expectedSig = createHmac('sha256', key).update(payloadStr).digest('base64url')
  if (!constantTimeEqual(sig, expectedSig)) return { path: '', valid: false }

  let data: any
  try {
    data = JSON.parse(payloadStr)
  } catch {
    return { path: '', valid: false }
  }

  if (typeof data.exp !== 'number' || Date.now() > data.exp) return { path: '', valid: false }
  if (typeof data.path !== 'string') return { path: '', valid: false }

  return { path: data.path, valid: true }
}

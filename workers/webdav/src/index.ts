interface Env {
  ADMIN_PASSWORD: string
}

const ORIGIN = 'https://pan.xiegao.top'
const FORWARDED_HEADERS = [
  'accept',
  'content-type',
  'depth',
  'if',
  'lock-token',
  'range',
  'timeout',
  'user-agent',
]

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'WWW-Authenticate': 'Basic realm="WebDAV"',
    },
  })
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function getBasicCredentials(request: Request): { username: string; password: string } | null {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Basic ')) return null

  try {
    const decoded = atob(authorization.slice(6).trim())
    const separator = decoded.indexOf(':')
    if (separator < 0) return null
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    }
  } catch {
    return null
  }
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  const bytes = new Uint8Array(signature)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function getOriginUrl(url: URL): URL {
  const davPrefix = '/dav'
  const suffix = url.pathname === davPrefix ? '/' : url.pathname.slice(davPrefix.length)
  return new URL(`/api/dav${suffix}${url.search}`, ORIGIN)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname !== '/dav' && !url.pathname.startsWith('/dav/')) {
      return new Response('Not found', { status: 404 })
    }
    const workerPath = url.pathname === '/dav' ? '/dav/' : url.pathname

    if (request.method !== 'OPTIONS') {
      const credentials = getBasicCredentials(request)
      if (!credentials || credentials.username !== 'admin' || !constantTimeEqual(credentials.password, env.ADMIN_PASSWORD)) {
        return unauthorized()
      }
    }

    const timestamp = String(Date.now())
    const signaturePayload = `${timestamp}\n${request.method}\n${workerPath}`
    const headers = new Headers()
    for (const name of FORWARDED_HEADERS) {
      const value = request.headers.get(name)
      if (value) headers.set(name, value)
    }
    headers.set('X-WebDAV-Worker-Time', timestamp)
    headers.set('X-WebDAV-Worker-Path', workerPath)
    headers.set('X-WebDAV-Worker-Signature', await sign(signaturePayload, env.ADMIN_PASSWORD))

    const upstream = await fetch(getOriginUrl(url), {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
      cf: { cacheTtl: 0, cacheEverything: false },
    })

    const responseHeaders = new Headers(upstream.headers)
    responseHeaders.set('Cache-Control', 'no-store')
    responseHeaders.delete('Set-Cookie')
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    })
  },
} satisfies ExportedHandler<Env>

interface Env {
  WEBDAV_WORKER_SECRET: string
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
const PASSWORD_CACHE_TTL_MS = 5 * 60_000
const passwordCache = new Map<string, number>()

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'WWW-Authenticate': 'Basic realm="WebDAV"',
    },
  })
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

async function passwordCacheKey(password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  const bytes = new Uint8Array(digest)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function isValidAdminPassword(password: string): Promise<boolean> {
  const cacheKey = await passwordCacheKey(password)
  if ((passwordCache.get(cacheKey) || 0) > Date.now()) {
    return true
  }

  try {
    const response = await fetch(new URL('/api/auth/login/', ORIGIN), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
      redirect: 'manual',
    })
    if (response.status !== 200) return false

    passwordCache.set(cacheKey, Date.now() + PASSWORD_CACHE_TTL_MS)
    return true
  } catch {
    return false
  }
}

function toDavPath(pathname: string): string | null {
  if (pathname === '/') return '/dav/'
  if (pathname !== '/dav' && !pathname.startsWith('/dav/')) {
    return `/dav${pathname}`
  }
  return pathname === '/dav' ? '/dav/' : pathname
}

function getOriginUrl(url: URL, davPath: string): URL {
  const davPrefix = '/dav'
  const suffix = davPath === davPrefix ? '/' : davPath.slice(davPrefix.length)
  return new URL(`/api/dav${suffix}${url.search}`, ORIGIN)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const workerPath = toDavPath(url.pathname)
    if (!workerPath) {
      return new Response('Not found', { status: 404 })
    }

    if (request.method !== 'OPTIONS') {
      const credentials = getBasicCredentials(request)
      if (!credentials || credentials.username !== 'admin' || !(await isValidAdminPassword(credentials.password))) {
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
    headers.set('X-WebDAV-Worker-Signature', await sign(signaturePayload, env.WEBDAV_WORKER_SECRET))

    const upstream = await fetch(getOriginUrl(url, workerPath), {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
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
}

import type { NextApiRequest, NextApiResponse } from 'next'
import { createHmac } from 'crypto'
import axios from 'axios'
import { posix as pathPosix } from 'path'

import { getAccessToken } from '../od/index'
import { getFiles, getDownloadLink } from '../../../utils/tianyiClient'
import { getOrCreateTianyiSession } from '../../../utils/tianyiSession'
import { resolveTianyiPath } from '../../../utils/tianyiPath'
import { getMimeType } from '../../../utils/mime'
import { constantTimeEqual } from '../../../utils/constantTimeEqual'
import { checkRateLimit } from '../../../utils/rateLimit'
import { getClientIp } from '../../../utils/getClientIp'
import { DAV_DRIVES, getDavDriveByName } from '../../../utils/driveRegistry'
import apiConfig from '../../../../config/api.config'

const DEFAULT_USER_ID = 'default_user'

/**
 * WebDAV 认证失败限流：15 分钟窗口内最多 20 次失败（按 IP，Redis 计数）。
 * WebDAV 的 Basic 认证使用 ADMIN_PASSWORD，若不限流可被无限暴力破解，
 * 且通过认证后可浏览两个云盘的完整内容，风险高于登录接口。
 * 仅对认证失败计数，正常 WebDAV 客户端（高频 PROPFIND/GET）不受影响。
 */
const MAX_AUTH_FAIL_ATTEMPTS = 20
const AUTH_FAIL_WINDOW_SEC = 15 * 60

function getTyEnvUsername(): string {
  return process.env.TIANYI_USERNAME || ''
}
function getTyEnvPassword(): string {
  return process.env.TIANYI_PASSWORD || ''
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatHttpDate(isoOrDash: string): string {
  if (!isoOrDash) return 'Mon, 01 Jan 2024 00:00:00 GMT'
  let d: Date
  if (isoOrDash.includes('T')) {
    d = new Date(isoOrDash)
  } else if (isoOrDash.includes('-') || isoOrDash.includes(':')) {
    d = new Date(isoOrDash.replace(' ', 'T') + (isoOrDash.includes('Z') ? '' : 'Z'))
  } else {
    d = new Date(isoOrDash)
  }
  if (isNaN(d.getTime())) return 'Mon, 01 Jan 2024 00:00:00 GMT'
  return d.toUTCString()
}

interface DavResource {
  href: string
  displayName: string
  isCollection: boolean
  contentLength?: number
  contentType?: string
  lastModified: string
}

function buildPropfindXml(resources: DavResource[]): string {
  const parts: string[] = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<multistatus xmlns="DAV:">',
  ]
  for (const r of resources) {
    const escapedHref = xmlEscape(r.href)
    const escapedDisplayName = xmlEscape(r.displayName)
    const escapedContentType = xmlEscape(r.contentType || (r.isCollection ? 'httpd/unix-directory' : 'application/octet-stream'))
    const escapedLastMod = xmlEscape(r.lastModified)
    parts.push(
      '  <response>',
      `    <href>${escapedHref}</href>`,
      '    <propstat>',
      '      <prop>',
      `        <displayname>${escapedDisplayName}</displayname>`,
      `        <resourcetype>${r.isCollection ? '<collection/>' : ''}</resourcetype>`,
      `        <getcontenttype>${escapedContentType}</getcontenttype>`,
      r.contentLength !== undefined ? `        <getcontentlength>${r.contentLength}</getcontentlength>` : '',
      `        <getlastmodified>${escapedLastMod}</getlastmodified>`,
      '      </prop>',
      '      <status>HTTP/1.1 200 OK</status>',
      '    </propstat>',
      '  </response>',
    )
  }
  parts.push('</multistatus>')
  return parts.join('\n')
}

function urlEncodePath(p: string): string {
  return p.split('/').map(seg => seg ? encodeURIComponent(seg) : seg).join('/')
}

interface ParsedDavPath {
  drive: (typeof DAV_DRIVES)[number]['id'] | 'root'
  subPath: string
}

function parseDavPath(segments: string[]): ParsedDavPath | null {
  if (segments.length === 0 || (segments.length === 1 && segments[0] === '')) {
    return { drive: 'root', subPath: '/' }
  }
  const driveName = segments[0]
  const rest = segments.slice(1).filter(Boolean)
  const subPath = '/' + rest.join('/')
  // 云盘注册表驱动：新增网盘只需在 driveRegistry.ts 注册 + 下方实现 listing/get 逻辑
  const drive = getDavDriveByName(driveName)
  if (!drive) return null
  return { drive: drive.id, subPath }
}

function isWorkerRequest(req: NextApiRequest, pathSegments: string[]): boolean {
  const workerSecret = process.env.WEBDAV_WORKER_SECRET || ''
  const timestamp = req.headers['x-webdav-worker-time']
  const workerPath = req.headers['x-webdav-worker-path']
  const signature = req.headers['x-webdav-worker-signature']

  if (!workerSecret || typeof timestamp !== 'string' || typeof workerPath !== 'string' || typeof signature !== 'string') {
    return false
  }

  const timestampMs = Number(timestamp)
  if (!Number.isSafeInteger(timestampMs) || Math.abs(Date.now() - timestampMs) > 60_000) {
    return false
  }

  const decodedSegments = pathSegments.filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment)
    } catch {
      return segment
    }
  })
  let expectedPath = decodedSegments.length === 0
    ? '/dav/'
    : `/dav/${decodedSegments.map(segment => encodeURIComponent(segment)).join('/')}`
  if (decodedSegments.length > 0 && workerPath.endsWith('/')) {
    expectedPath += '/'
  }
  if (workerPath !== expectedPath) {
    return false
  }

  const expectedSignature = createHmac('sha256', workerSecret)
    .update(`${timestamp}\n${req.method}\n${workerPath}`)
    .digest('base64')
  return constantTimeEqual(signature, expectedSignature)
}

async function authenticate(req: NextApiRequest, pathSegments: string[]): Promise<boolean> {
  if (isWorkerRequest(req, pathSegments)) return true

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Basic ')) return false
  const encoded = authHeader.slice(6).trim()
  let decoded: string
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf-8')
  } catch {
    return false
  }
  const colonIdx = decoded.indexOf(':')
  if (colonIdx < 0) return false
  const username = decoded.slice(0, colonIdx)
  const password = decoded.slice(colonIdx + 1)
  if (username !== 'admin') return false
  const adminPassword = process.env.ADMIN_PASSWORD || ''
  if (!adminPassword) return false
  return constantTimeEqual(password, adminPassword)
}

/**
 * 天翼云目录列举（PROPFIND）。
 * 基于公共 resolveTianyiPath：文件路径返回单条资源，目录路径返回子项列表。
 */
async function getTyDirListing(tyPath: string, cookies: Record<string, string>): Promise<{ resources: DavResource[] } | { error: string }> {
  const segments = tyPath.split('/').filter(Boolean)
  const username = getTyEnvUsername()
  const password = getTyEnvPassword()
  // WebDAV 始终从天翼云的绝对根目录开始，不受网站展示挂载点影响
  const result = await resolveTianyiPath(cookies, segments, username, password, '-11')

  if (result.status === 'need_refresh' || result.status === 'error') {
    return { error: result.message || '获取目录失败' }
  }
  if (result.status === 'not_found') {
    return { error: '路径未找到' }
  }

  const tyDavName = getDavDriveByName('ty')?.name || '天翼云盘'

  // 文件路径：返回单条文件资源
  if (result.fileMeta) {
    const requestedHref = urlEncodePath(`/dav/${tyDavName}/` + segments.join('/'))
    const resources: DavResource[] = [
      {
        href: requestedHref,
        displayName: result.fileMeta.name,
        isCollection: false,
        contentLength: result.fileMeta.size,
        contentType: getMimeType(result.fileMeta.name),
        lastModified: formatHttpDate(result.fileMeta.lastOpTime),
      },
    ]
    return { resources }
  }

  // 目录路径：列举子项
  const listResult = await getFiles(result.cookies, result.folderId, username, password)
  if (listResult.status !== 'success' || !listResult.data) {
    return { error: listResult.message || '获取目录失败' }
  }

  const parentHref = urlEncodePath(`/dav/${tyDavName}/` + segments.join('/'))
  const parentDisplayName = segments.length > 0 ? segments[segments.length - 1] : tyDavName

  const resources: DavResource[] = [
    {
      href: parentHref.endsWith('/') ? parentHref : parentHref + '/',
      displayName: parentDisplayName,
      isCollection: true,
      contentType: 'httpd/unix-directory',
      lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT',
    },
  ]

  for (const folder of listResult.data.folders) {
    const folderHref = parentHref.endsWith('/') ? parentHref + urlEncodePath(folder.name) + '/' : parentHref + '/' + urlEncodePath(folder.name) + '/'
    resources.push({
      href: folderHref,
      displayName: folder.name,
      isCollection: true,
      contentType: 'httpd/unix-directory',
      lastModified: formatHttpDate(folder.lastOpTime),
    })
  }

  for (const file of listResult.data.files) {
    const fileHref = parentHref.endsWith('/') ? parentHref + urlEncodePath(file.name) : parentHref + '/' + urlEncodePath(file.name)
    resources.push({
      href: fileHref,
      displayName: file.name,
      isCollection: false,
      contentLength: file.size,
      contentType: getMimeType(file.name),
      lastModified: formatHttpDate(file.lastOpTime),
    })
  }

  return { resources }
}

async function getOdDirListing(odPath: string, accessToken: string): Promise<{ resources: DavResource[] } | { error: string }> {
  const resolvedPath = pathPosix.resolve('/', odPath)
  const cleanPath = resolvedPath === '/' ? '/' : resolvedPath.replace(/\/$/, '')
  const isRoot = cleanPath === '/'
  const encodePath = (p: string): string => {
    if (p === '/' || p === '') return ''
    return ':' + encodeURIComponent(p.replace(/^\//, ''))
  }
  const requestPath = encodePath(cleanPath)
  const requestUrl = `${apiConfig.driveApi}/root${requestPath}`

  try {
    const { data: identityData } = await axios.get(requestUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { select: 'name,size,id,lastModifiedDateTime,folder,file' },
    })

    if (!('folder' in identityData)) {
      const parentHref = urlEncodePath('/dav/OneDrive/' + odPath.replace(/^\//, ''))
      const resources: DavResource[] = [
        {
          href: parentHref,
          displayName: identityData.name || 'unknown',
          isCollection: false,
          contentLength: identityData.size || 0,
          contentType: (identityData.file?.mimeType) || getMimeType(identityData.name || ''),
          lastModified: formatHttpDate(identityData.lastModifiedDateTime),
        },
      ]
      return { resources }
    }

    const parentHref = urlEncodePath('/dav/OneDrive/' + odPath.replace(/^\//, ''))
    const parentDisplayName = cleanPath === '/' ? 'OneDrive' : (identityData.name || 'OneDrive')

    const resources: DavResource[] = [
      {
        href: parentHref === '/dav/OneDrive/' ? '/dav/OneDrive/' : parentHref + '/',
        displayName: parentDisplayName,
        isCollection: true,
        contentType: 'httpd/unix-directory',
        lastModified: formatHttpDate(identityData.lastModifiedDateTime),
      },
    ]

    const childrenUrl = isRoot ? `${apiConfig.driveApi}/root/children` : `${requestUrl}:/children`
    const { data: folderData } = await axios.get(childrenUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'name,size,id,lastModifiedDateTime,folder,file',
        $top: 200,
      },
    })

    const children = folderData.value || []
    for (const child of children) {
      const isCol = 'folder' in child
      const childName: string = child.name || 'unknown'
      const childHrefEncoded = urlEncodePath(childName)
      const baseHref = parentHref === '/dav/OneDrive/' ? '/dav/OneDrive/' : parentHref + '/'
      const href = isCol ? baseHref + childHrefEncoded + '/' : baseHref + childHrefEncoded
      resources.push({
        href,
        displayName: childName,
        isCollection: isCol,
        contentLength: isCol ? undefined : (child.size || 0),
        contentType: isCol ? 'httpd/unix-directory' : (child.file?.mimeType || getMimeType(childName)),
        lastModified: formatHttpDate(child.lastModifiedDateTime),
      })
    }

    return { resources }
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return { error: '路径未找到' }
    }
    return { error: `OneDrive 请求失败: ${error?.message || '未知错误'}` }
  }
}

/**
 * WebDAV 虚拟根目录：由云盘注册表（DAV_DRIVES）生成入口列表。
 * 新增网盘注册后自动出现在根目录。
 */
async function getVirtualRootResources(): Promise<{ resources: DavResource[] }> {
  const resources: DavResource[] = [
    {
      href: '/dav/',
      displayName: 'dav',
      isCollection: true,
      contentType: 'httpd/unix-directory',
      lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT',
    },
  ]
  for (const drive of DAV_DRIVES) {
    resources.push({
      href: `/dav/${encodeURIComponent(drive.name)}/`,
      displayName: drive.name,
      isCollection: true,
      contentType: 'httpd/unix-directory',
      lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT',
    })
  }
  return { resources }
}

async function handlePropfind(req: NextApiRequest, res: NextApiResponse, davPath: ParsedDavPath): Promise<void> {
  const depth = req.headers.depth || '1'

  try {
    let resources: DavResource[] = []
    if (davPath.drive === 'root') {
      const result = await getVirtualRootResources()
      resources = result.resources
      if (depth === '0') {
        resources = resources.slice(0, 1)
      }
    } else if (davPath.drive === 'ty') {
      const session = await getOrCreateTianyiSession()
      if ('error' in session) {
        res.status(502).setHeader('Content-Type', 'text/xml; charset="utf-8"').send(
          buildPropfindXml([
            {
              href: req.url || '/dav/',
              displayName: 'Error',
              isCollection: true,
              lastModified: formatHttpDate(''),
            },
          ]),
        )
        return
      }
      const result = await getTyDirListing(davPath.subPath, session.cookies)
      if ('error' in result) {
        res.status(404).setHeader('Content-Type', 'text/xml; charset="utf-8"').send(
          buildPropfindXml([
            {
              href: req.url || '/dav/',
              displayName: 'Error',
              isCollection: true,
              lastModified: formatHttpDate(''),
            },
          ]),
        )
        return
      }
      resources = result.resources
      if (depth === '0' && resources.length > 1) {
        resources = resources.slice(0, 1)
      }
    } else if (davPath.drive === 'od') {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        res.status(502).setHeader('Content-Type', 'text/xml; charset="utf-8"').send(
          buildPropfindXml([
            {
              href: req.url || '/dav/',
              displayName: 'Error',
              isCollection: true,
              lastModified: formatHttpDate(''),
            },
          ]),
        )
        return
      }
      const result = await getOdDirListing(davPath.subPath, accessToken)
      if ('error' in result) {
        res.status(404).setHeader('Content-Type', 'text/xml; charset="utf-8"').send(
          buildPropfindXml([
            {
              href: req.url || '/dav/',
              displayName: 'Error',
              isCollection: true,
              lastModified: formatHttpDate(''),
            },
          ]),
        )
        return
      }
      resources = result.resources
      if (depth === '0' && resources.length > 1) {
        resources = resources.slice(0, 1)
      }
    }

    const xml = buildPropfindXml(resources)
    res.status(207).setHeader('Content-Type', 'application/xml; charset="utf-8"').send(xml)
  } catch (e: any) {
    console.error('[dav] PROPFIND error:', e?.message)
    res.status(500).setHeader('Content-Type', 'text/xml; charset="utf-8"').send(
      buildPropfindXml([
        {
          href: req.url || '/dav/',
          displayName: 'Error',
          isCollection: true,
          lastModified: formatHttpDate(''),
        },
      ]),
    )
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, davPath: ParsedDavPath): Promise<void> {
  if (davPath.drive === 'root') {
    res.status(400).json({ error: 'Cannot GET directory' })
    return
  }

  const segments = davPath.subPath.split('/').filter(Boolean)
  if (segments.length === 0) {
    res.status(400).json({ error: 'Cannot GET directory' })
    return
  }

  try {
    if (davPath.drive === 'ty') {
      const session = await getOrCreateTianyiSession()
      if ('error' in session) {
        res.status(502).json({ error: session.error })
        return
      }
      const result = await resolveTianyiPath(session.cookies, segments, session.username, session.password, '-11')
      if (result.status === 'need_refresh' || result.status === 'error') {
        res.status(502).json({ error: result.message || '获取文件列表失败' })
        return
      }
      if (result.status === 'not_found' || !result.fileId) {
        res.status(404).json({ error: '文件未找到' })
        return
      }
      const dlResult = await getDownloadLink(result.cookies, result.fileId)
      if (dlResult.status !== 'success' || !dlResult.data) {
        res.status(500).json({ error: dlResult.message || '获取下载链接失败' })
        return
      }
      res.redirect(302, dlResult.data.url)
    } else if (davPath.drive === 'od') {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        res.status(502).json({ error: 'OneDrive 未授权' })
        return
      }
      const cleanPath = pathPosix.resolve('/', davPath.subPath).replace(/\/$/, '')
      const encodePath = (p: string): string => {
        if (p === '/' || p === '') return ''
        return ':' + encodeURIComponent(p.replace(/^\//, ''))
      }
      const requestUrl = `${apiConfig.driveApi}/root${encodePath(cleanPath)}`
      const { data } = await axios.get(requestUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { select: 'id,@microsoft.graph.downloadUrl' },
      })
      if ('@microsoft.graph.downloadUrl' in data) {
        res.redirect(302, data['@microsoft.graph.downloadUrl'])
      } else {
        res.status(404).json({ error: 'No download url found' })
      }
    }
  } catch (e: any) {
    console.error('[dav] GET error:', e?.message)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  const pathSegments: string[] = Array.isArray(req.query.path) ? req.query.path : (req.query.path ? [req.query.path as string] : [])
  const authOk = await authenticate(req, pathSegments)
  if (!authOk) {
    // 认证失败：按 IP 限流，防止对 ADMIN_PASSWORD 暴力破解
    const ip = getClientIp(req)
    const rl = await checkRateLimit(`dav:auth-fail:${ip}`, MAX_AUTH_FAIL_ATTEMPTS, AUTH_FAIL_WINDOW_SEC)
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfter))
      res.setHeader('WWW-Authenticate', 'Basic realm="WebDAV"')
      res.status(429).json({ error: 'Too many failed attempts, please retry later.' })
      return
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="WebDAV"')
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const davPath = parseDavPath(pathSegments)
  if (!davPath) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  res.setHeader('DAV', '1')

  if (req.method === 'PROPFIND') {
    await handlePropfind(req, res, davPath)
  } else if (req.method === 'GET') {
    await handleGet(req, res, davPath)
  } else if (req.method === 'HEAD') {
    await handleGet(req, res, davPath)
  } else if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, HEAD, PROPFIND, OPTIONS')
    res.status(200).end()
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}
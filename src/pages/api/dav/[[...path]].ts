import type { NextApiRequest, NextApiResponse } from 'next'
import { timingSafeEqual } from 'crypto'
import axios from 'axios'
import { posix as pathPosix } from 'path'

import { getAccessToken } from '../od/index'
import { cloud189Login } from '../../../utils/tianyiAuth'
import { getFiles, getDownloadLink } from '../../../utils/tianyiClient'
import { getTianyiSession, saveTianyiSession } from '../../../utils/tianyiSessionStore'
import apiConfig from '../../../../config/api.config'

const DEFAULT_USER_ID = 'default_user'

function getTyEnvUsername(): string {
  return process.env.TIANYI_USERNAME || ''
}
function getTyEnvPassword(): string {
  return process.env.TIANYI_PASSWORD || ''
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    let diff = a.length ^ b.length
    const buf = Buffer.alloc(Math.max(a.length, b.length))
    for (let i = 0; i < buf.length; i++) {
      diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
    }
    return diff === 0
  }
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  return timingSafeEqual(aBuf, bBuf)
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

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    xml: 'application/xml',
    csv: 'text/csv',
    js: 'text/javascript',
    ts: 'text/typescript',
    py: 'text/x-python',
    java: 'text/x-java',
    c: 'text/x-c',
    cpp: 'text/x-c++',
    h: 'text/x-c',
    html: 'text/html',
    css: 'text/css',
    mp4: 'video/mp4',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    wmv: 'video/x-ms-wmv',
    flv: 'video/x-flv',
    mkv: 'video/x-matroska',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    zip: 'application/zip',
    rar: 'application/vnd.rar',
    '7z': 'application/x-7z-compressed',
    tar: 'application/x-tar',
    gz: 'application/gzip',
    epub: 'application/epub+zip',
  }
  return mimeMap[ext] || 'application/octet-stream'
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
  drive: 'root' | 'ty' | 'od'
  subPath: string
}

function parseDavPath(segments: string[]): ParsedDavPath | null {
  if (segments.length === 0 || (segments.length === 1 && segments[0] === '')) {
    return { drive: 'root', subPath: '/' }
  }
  const driveName = segments[0]
  const rest = segments.slice(1).filter(Boolean)
  const subPath = '/' + rest.join('/')
  if (driveName === '天翼云盘') {
    return { drive: 'ty', subPath }
  }
  if (driveName === 'OneDrive') {
    return { drive: 'od', subPath }
  }
  return null
}

async function authenticate(req: NextApiRequest): Promise<boolean> {
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

async function getTySession(): Promise<{ cookies: Record<string, string> } | { error: string }> {
  const U = getTyEnvUsername()
  const P = getTyEnvPassword()
  if (!U || !P) {
    return { error: '天翼云未配置' }
  }
  try {
    const session = await getTianyiSession(DEFAULT_USER_ID)
    if (session?.cookies && Object.keys(session.cookies).length > 0) {
      return { cookies: session.cookies }
    }
  } catch {
    // continue
  }
  try {
    const loginResult = await cloud189Login(U, P)
    if (loginResult.status === 'success' && loginResult.data?.cookies) {
      await saveTianyiSession(loginResult.data.cookies, { username: U, password: P })
      return { cookies: loginResult.data.cookies }
    }
    return { error: loginResult.message || '天翼云登录失败' }
  } catch (e: any) {
    return { error: `天翼云登录异常: ${e?.message || '未知错误'}` }
  }
}

async function getTyDirListing(tyPath: string, cookies: Record<string, string>): Promise<{ resources: DavResource[] } | { error: string }> {
  const segments = tyPath.split('/').filter(Boolean)
  let currentFolderId = process.env.DEFAULT_FOLDER_ID || '-11'
  let currentCookies = cookies

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const listResult = await getFiles(currentCookies, currentFolderId, getTyEnvUsername(), getTyEnvPassword())
    if (listResult.data?.cookies) {
      currentCookies = listResult.data.cookies
    }
    if (listResult.status !== 'success' || !listResult.data) {
      return { error: listResult.message || '获取目录失败' }
    }
    const matchedFolder = listResult.data.folders.find((f) => f.name === seg)
    if (matchedFolder) {
      currentFolderId = matchedFolder.id
      continue
    }
    const matchedFile = listResult.data.files.find((f) => f.name === seg)
    if (matchedFile && i === segments.length - 1) {
      const requestedHref = urlEncodePath('/dav/天翼云盘/' + segments.join('/'))
      const resources: DavResource[] = [
        {
          href: requestedHref,
          displayName: matchedFile.name,
          isCollection: false,
          contentLength: matchedFile.size,
          contentType: getMimeType(matchedFile.name),
          lastModified: formatHttpDate(matchedFile.lastOpTime),
        },
      ]
      return { resources }
    }
    return { error: '路径未找到' }
  }

  const result = await getFiles(currentCookies, currentFolderId, getTyEnvUsername(), getTyEnvPassword())
  if (result.data?.cookies) {
    currentCookies = result.data.cookies
  }
  if (result.status !== 'success' || !result.data) {
    return { error: result.message || '获取目录失败' }
  }

  const parentHref = urlEncodePath('/dav/天翼云盘/' + segments.join('/'))
  const parentDisplayName = segments.length > 0 ? segments[segments.length - 1] : '天翼云盘'

  const resources: DavResource[] = [
    {
      href: parentHref.endsWith('/') ? parentHref : parentHref + '/',
      displayName: parentDisplayName,
      isCollection: true,
      contentType: 'httpd/unix-directory',
      lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT',
    },
  ]

  for (const folder of result.data.folders) {
    const folderHref = parentHref.endsWith('/') ? parentHref + urlEncodePath(folder.name) + '/' : parentHref + '/' + urlEncodePath(folder.name) + '/'
    resources.push({
      href: folderHref,
      displayName: folder.name,
      isCollection: true,
      contentType: 'httpd/unix-directory',
      lastModified: formatHttpDate(folder.lastOpTime),
    })
  }

  for (const file of result.data.files) {
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
  const cleanPath = pathPosix.resolve('/', odPath).replace(/\/$/, '')
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

async function getVirtualRootResources(): Promise<{ resources: DavResource[] }> {
  const resources: DavResource[] = [
    {
      href: '/dav/',
      displayName: 'dav',
      isCollection: true,
      contentType: 'httpd/unix-directory',
      lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT',
    },
    {
      href: '/dav/%E5%A4%A9%E7%BF%BC%E4%BA%91%E7%9B%98/',
      displayName: '天翼云盘',
      isCollection: true,
      contentType: 'httpd/unix-directory',
      lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT',
    },
    {
      href: '/dav/OneDrive/',
      displayName: 'OneDrive',
      isCollection: true,
      contentType: 'httpd/unix-directory',
      lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT',
    },
  ]
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
      const session = await getTySession()
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
      const session = await getTySession()
      if ('error' in session) {
        res.status(502).json({ error: session.error })
        return
      }
      let currentFolderId = process.env.DEFAULT_FOLDER_ID || '-11'
      let currentCookies = session.cookies
      for (let i = 0; i < segments.length - 1; i++) {
        const seg = segments[i]
        const listResult = await getFiles(currentCookies, currentFolderId, getTyEnvUsername(), getTyEnvPassword())
        if (listResult.data?.cookies) {
          currentCookies = listResult.data.cookies
        }
        if (listResult.status !== 'success' || !listResult.data) {
          res.status(500).json({ error: listResult.message || '获取目录失败' })
          return
        }
        const matchedFolder = listResult.data.folders.find((f) => f.name === seg)
        if (!matchedFolder) {
          res.status(404).json({ error: '路径未找到' })
          return
        }
        currentFolderId = matchedFolder.id
      }
      const fileName = segments[segments.length - 1]
      const finalResult = await getFiles(currentCookies, currentFolderId, getTyEnvUsername(), getTyEnvPassword())
      if (finalResult.data?.cookies) {
        currentCookies = finalResult.data.cookies
      }
      if (finalResult.status !== 'success' || !finalResult.data) {
        res.status(500).json({ error: finalResult.message || '获取文件列表失败' })
        return
      }
      const matchedFile = finalResult.data.files.find((f) => f.name === fileName)
      if (!matchedFile) {
        res.status(404).json({ error: '文件未找到' })
        return
      }
      const dlResult = await getDownloadLink(currentCookies, matchedFile.id)
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

  const authOk = await authenticate(req)
  if (!authOk) {
    res.setHeader('WWW-Authenticate', 'Basic realm="WebDAV"')
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const pathSegments: string[] = Array.isArray(req.query.path) ? req.query.path : (req.query.path ? [req.query.path as string] : [])
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

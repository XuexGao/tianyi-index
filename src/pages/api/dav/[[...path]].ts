import type { NextApiRequest, NextApiResponse } from 'next'
import { createHmac } from 'crypto'
import { posix as pathPosix } from 'path'

import { getAccessToken, graphGet } from '../od/index'
import { getFiles, getDownloadLink } from '../../../utils/tianyiClient'
import { getOrCreateTianyiSession } from '../../../utils/tianyiSession'
import { resolveTianyiPath } from '../../../utils/tianyiPath'
import {
  getPan123DownloadLink,
  listPan123Folder,
  resolvePan123Path,
} from '../../../utils/pan123Client'
import { getMimeType } from '../../../utils/mime'
import { constantTimeEqual } from '../../../utils/constantTimeEqual'
import { checkRateLimit } from '../../../utils/rateLimit'
import { getClientIp } from '../../../utils/getClientIp'
import { DAV_DRIVES, getDavDriveByName, filterRootDrivesByAvailability } from '../../../utils/driveRegistry'
import { safeDecodeURIComponent } from '../../../utils/decode'
import apiConfig from '../../../../config/api.config'
import { getRuntimeConfigValue } from '../../../utils/runtimeConfigStore'
import { getDrivesAvailability } from '../../../utils/driveAvailability'
import { ADMIN_TY_FOLDER_NAME, ADMIN_P123_FOLDER_NAME } from '../../../utils/driveResolver'

const DEFAULT_USER_ID = 'default_user'

/**
 * WebDAV 认证失败限流：15 分钟窗口内最多 100 次失败（按 IP，Redis 计数）。
 * WebDAV 的 Basic 认证使用 ADMIN_PASSWORD，若不限流可被无限暴力破解，
 * 且通过认证后可浏览两个云盘的完整内容，风险高于登录接口。
 * 仅对认证失败计数，正常 WebDAV 客户端（高频 PROPFIND/GET）不受影响。
 *
 * 阈值说明（2026-10 放宽，原为 20）：
 * WebDAV 客户端（Windows 资源管理器 / RaiDrive / 挂载盘）在凭据过期或错误时
 * 会**每次请求都带 Basic 认证头重试**，一次目录浏览就可能产生几十次失败尝试，
 * 20 次的上限极易被正常客户端自己撞满并锁定 15 分钟。
 * 配合 rateLimit 的"Redis 故障放行"语义，调高到 100 次既能挡住暴力破解
 * （15 分钟内 100 次对猜测 32+ 位随机密码无意义），又不会误伤正常使用。
 */
const MAX_AUTH_FAIL_ATTEMPTS = 100
const AUTH_FAIL_WINDOW_SEC = 15 * 60

let cachedTyUsername: string | null = null
let cachedTyPassword: string | null = null
async function getTyRuntimeUsername(): Promise<string> {
  if (cachedTyUsername === null) {
    const { getRuntimeConfigValue } = await import('../../../utils/runtimeConfigStore')
    cachedTyUsername = await getRuntimeConfigValue('TIANYI_USERNAME')
  }
  return cachedTyUsername
}
async function getTyRuntimePassword(): Promise<string> {
  if (cachedTyPassword === null) {
    const { getRuntimeConfigValue } = await import('../../../utils/runtimeConfigStore')
    cachedTyPassword = await getRuntimeConfigValue('TIANYI_PASSWORD')
  }
  return cachedTyPassword
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

export function buildPropfindXml(resources: DavResource[]): string {
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
  // 过滤掉条件拼接产生的空串（如缺失的 getcontentlength），避免 XML 里出现空行
  return parts.filter(part => part !== '').join('\n')
}

function urlEncodePath(p: string): string {
  return p.split('/').map(seg => seg ? encodeURIComponent(seg) : seg).join('/')
}

interface ParsedDavPath {
  drive: (typeof DAV_DRIVES)[number]['id'] | 'root'
  subPath: string
}

/**
 * 目录列举失败的类别：
 * - not_found：远端确认该路径不存在，应向客户端返回 404；
 * - transient：后端故障（token 失效、上游 5xx、网络抖动等），
 *   必须返回 5xx 而不是 404 —— 否则 WebDAV 客户端会把"临时失败"
 *   当成"目录不存在"，表现为网盘消失 / NoSuchFileException。
 */
export interface DavListingError {
  error: string
  kind: 'not_found' | 'transient'
}

export function listingErrorStatus(kind: DavListingError['kind']): number {
  return kind === 'not_found' ? 404 : 502
}

/**
 * 解析 PROPFIND 的 Depth 头。RFC 4918 默认 infinity，
 * 本服务是云盘代理，infinity 按 1 处理（有界），0 表示只返回资源自身。
 */
export function parseDavDepth(header: string | string[] | undefined): 0 | 1 {
  const raw = Array.isArray(header) ? header[0] : header
  if (raw && raw.trim() === '0') return 0
  return 1
}

export function parseDavPath(segments: string[]): ParsedDavPath | null {
  if (segments.length === 0 || (segments.length === 1 && segments[0] === '')) {
    return { drive: 'root', subPath: '/' }
  }
  // URL 解码路径段：Worker 转发的路径可能是编码后的（含 %XX），
  // 而 DAV_DRIVES 注册名为中文原文，解码后才能正确匹配。
  const driveName = safeDecodeURIComponent(segments[0])
  const rest = segments.slice(1).filter(Boolean).map(s => safeDecodeURIComponent(s))
  const subPath = '/' + rest.join('/')
  const drive = getDavDriveByName(driveName)
  if (!drive) return null
  return { drive: drive.id, subPath }
}

async function isWorkerRequest(req: NextApiRequest, pathSegments: string[]): Promise<boolean> {
  const workerSecret = process.env.WEBDAV_WORKER_SECRET || ''
  const runtimeWorkerSecret = await getRuntimeConfigValue('WEBDAV_WORKER_SECRET')
  const effectiveWorkerSecret = runtimeWorkerSecret || workerSecret
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
  if (await isWorkerRequest(req, pathSegments)) return true

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
  const runtimeAdminPassword = await getRuntimeConfigValue('ADMIN_PASSWORD')
  const effectiveAdminPassword = runtimeAdminPassword || adminPassword
  if (!adminPassword) return false
  return constantTimeEqual(password, effectiveAdminPassword)
}

/**
 * 天翼云目录列举（PROPFIND）。
 * 基于公共 resolveTianyiPath：文件路径返回单条资源，目录路径返回子项列表。
 * 返回的 self 是请求路径自身的资源（RFC 4918 要求 PROPFIND 响应包含它），
 * 文件路径时 self 即该文件、resources 为空；目录路径时 self 为目录本身。
 */
async function getTyDirListing(
  tyPath: string,
  cookies: Record<string, string>,
): Promise<{ self: DavResource | null; resources: DavResource[] } | DavListingError> {
  const segments = tyPath.split('/').filter(Boolean)
  const username = await getTyRuntimeUsername()
  const password = await getTyRuntimePassword()
  // WebDAV 始终从天翼云的绝对根目录开始，不受网站展示挂载点影响
  const result = await resolveTianyiPath(cookies, segments, username, password, '-11')

  if (result.status === 'need_refresh' || result.status === 'error') {
    return { error: result.message || '获取目录失败', kind: 'transient' }
  }
  if (result.status === 'not_found') {
    return { error: '路径未找到', kind: 'not_found' }
  }

  const tyDavName = getDavDriveByName('ty')?.name || '天翼云盘'
  // 对外 href 不带 /dav 前缀：Worker 把 /天翼云盘/* 直接映射到内部 /api/dav/*，
  // 双前缀会让"按 href 走"和"按当前路径拼文件名"两类客户端解析出不同结果
  const baseHref = urlEncodePath(`/${tyDavName}/` + segments.join('/'))

  // 文件路径：返回单条文件资源（即自身）
  if (result.fileMeta) {
    const fileResource: DavResource = {
      href: baseHref,
      displayName: result.fileMeta.name,
      isCollection: false,
      contentLength: result.fileMeta.size,
      contentType: getMimeType(result.fileMeta.name),
      lastModified: formatHttpDate(result.fileMeta.lastOpTime),
    }
    return { self: fileResource, resources: [] }
  }

  // 目录路径：自身 + 列举子项
  const listResult = await getFiles(result.cookies, result.folderId, username, password)
  if (listResult.status !== 'success' || !listResult.data) {
    return { error: listResult.message || '获取目录失败', kind: 'transient' }
  }

  const self: DavResource = {
    href: baseHref.endsWith('/') ? baseHref : baseHref + '/',
    displayName: segments.length > 0 ? segments[segments.length - 1] : tyDavName,
    isCollection: true,
    contentType: 'httpd/unix-directory',
    lastModified: formatHttpDate(''),
  }

  const resources: DavResource[] = []

  for (const folder of listResult.data.folders) {
    const folderHref = baseHref.endsWith('/') ? baseHref + urlEncodePath(folder.name) + '/' : baseHref + '/' + urlEncodePath(folder.name) + '/'
    resources.push({
      href: folderHref,
      displayName: folder.name,
      isCollection: true,
      contentType: 'httpd/unix-directory',
      lastModified: formatHttpDate(folder.lastOpTime),
    })
  }

  for (const file of listResult.data.files) {
    const fileHref = baseHref.endsWith('/') ? baseHref + urlEncodePath(file.name) : baseHref + '/' + urlEncodePath(file.name)
    resources.push({
      href: fileHref,
      displayName: file.name,
      isCollection: false,
      contentLength: file.size,
      contentType: getMimeType(file.name),
      lastModified: formatHttpDate(file.lastOpTime),
    })
  }

  return { self, resources }
}

/**
 * OneDrive 目录列举（PROPFIND）。
 * 必须走 graphGet（Graph 返回 401 时自动强制刷新 token 重试一次），
 * 之前用裸 axios 直调，token 一旦被 Graph 拒绝就把故障伪装成 404，
 * 客户端表现为 NoSuchFileException: /OneDrive: HTTP 404。
 */
async function getOdDirListing(
  odPath: string,
  accessToken: string,
): Promise<{ self: DavResource | null; resources: DavResource[] } | DavListingError> {
  const resolvedPath = pathPosix.resolve('/', odPath)
  const cleanPath = resolvedPath === '/' ? '/' : resolvedPath.replace(/\/$/, '')
  const isRoot = cleanPath === '/'
  const encodePath = (p: string): string => {
    if (p === '/' || p === '') return ''
    return ':' + encodeURIComponent(p.replace(/^\//, ''))
  }
  const requestPath = encodePath(cleanPath)
  const requestUrl = `${apiConfig.driveApi}/root${requestPath}`
  const graphParams = { select: 'name,size,id,lastModifiedDateTime,folder,file' }

  try {
    const { data: identityData } = await graphGet(requestUrl, { params: graphParams }, accessToken)

    // 请求路径自身的资源（RFC 4918：PROPFIND 响应必须包含请求资源）
    if (!('folder' in identityData)) {
      const fileResource: DavResource = {
        href: urlEncodePath(`/OneDrive${cleanPath}`),
        displayName: identityData.name || 'unknown',
        isCollection: false,
        contentLength: identityData.size || 0,
        contentType: identityData.file?.mimeType || getMimeType(identityData.name || ''),
        lastModified: formatHttpDate(identityData.lastModifiedDateTime),
      }
      return { self: fileResource, resources: [] }
    }

    const selfHref = urlEncodePath(`/OneDrive${cleanPath}`) + (cleanPath === '/' ? '' : '/')
    const self: DavResource = {
      href: selfHref,
      displayName: cleanPath === '/' ? 'OneDrive' : identityData.name || 'OneDrive',
      isCollection: true,
      contentType: 'httpd/unix-directory',
      lastModified: formatHttpDate(identityData.lastModifiedDateTime),
    }

    const childrenUrl = isRoot ? `${apiConfig.driveApi}/root/children` : `${requestUrl}:/children`
    const { data: folderData } = await graphGet(
      childrenUrl,
      {
        params: {
          select: 'name,size,id,lastModifiedDateTime,folder,file',
          $top: 200,
        },
      },
      accessToken,
    )

    const parentBase = selfHref.endsWith('/') ? selfHref : selfHref + '/'

    const resources: DavResource[] = []
    const children = folderData.value || []
    for (const child of children) {
      const isCol = 'folder' in child
      const childName: string = child.name || 'unknown'
      const href = parentBase + urlEncodePath(childName) + (isCol ? '/' : '')
      resources.push({
        href,
        displayName: childName,
        isCollection: isCol,
        contentLength: isCol ? undefined : (child.size || 0),
        contentType: isCol ? 'httpd/unix-directory' : (child.file?.mimeType || getMimeType(childName)),
        lastModified: formatHttpDate(child.lastModifiedDateTime),
      })
    }

    return { self, resources }
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return { error: '路径未找到', kind: 'not_found' }
    }
    return { error: `OneDrive 请求失败: ${error?.message || '未知错误'}`, kind: 'transient' }
  }
}

/**
 * 123 云盘目录列举（PROPFIND）。路径语义与天翼分支一致：
 * 文件路径返回自身单条资源，目录路径返回自身 + 子项。
 */
async function getP123DirListing(
  p123Path: string,
): Promise<{ self: DavResource | null; resources: DavResource[] } | DavListingError> {
  const segments = p123Path.split('/').filter(Boolean)
  try {
    const resolved = await resolvePan123Path(segments)
    if (resolved.kind === 'not_found') {
      return { error: '路径未找到', kind: 'not_found' }
    }

    const baseHref = urlEncodePath(`/123云盘/${segments.join('/')}`)

    if (resolved.kind === 'file') {
      const m = resolved.meta
      return {
        self: {
          href: baseHref,
          displayName: m.FileName,
          isCollection: false,
          contentLength: m.Size || 0,
          contentType: getMimeType(m.FileName),
          lastModified: formatHttpDate(m.UpdateAt),
        },
        resources: [],
      }
    }

    const children = await listPan123Folder(resolved.id)
    const self: DavResource = {
      href: baseHref.endsWith('/') ? baseHref : baseHref + '/',
      displayName: segments.length > 0 ? segments[segments.length - 1] : '123云盘',
      isCollection: true,
      contentType: 'httpd/unix-directory',
      lastModified: formatHttpDate(''),
    }
    const resources: DavResource[] = []
    for (const child of children) {
      const isCol = child.Type === 1
      resources.push({
        href: `${baseHref.endsWith('/') ? baseHref : baseHref + '/'}${urlEncodePath(child.FileName)}${isCol ? '/' : ''}`,
        displayName: child.FileName,
        isCollection: isCol,
        contentLength: isCol ? undefined : (child.Size || 0),
        contentType: isCol ? 'httpd/unix-directory' : getMimeType(child.FileName),
        lastModified: formatHttpDate(child.UpdateAt),
      })
    }
    return { self, resources }
  } catch (error: any) {
    console.error('[dav] p123 listing error:', error?.message)
    // 凭据缺失/上游故障都是临时性问题，返回 502 防止客户端把网盘当不存在
    return { error: String(error?.message || '获取目录失败'), kind: 'transient' }
  }
}

/**
 * WebDAV 虚拟根目录：由云盘注册表（DAV_DRIVES）生成入口列表。
 * 对外命名空间以 / 为根：/天翼云盘/*、/OneDrive/*，
 * /dav/* 只是 Worker 内部映射空间与兼容别名，不再出现在任何 href 里。
 */
async function getVirtualRootResources(): Promise<{ resources: DavResource[] }> {
  const resources: DavResource[] = []
  for (const drive of DAV_DRIVES) {
    // href 统一百分号编码：中文盘名若以原始 UTF-8 出现在 href 里，
    // 部分客户端构造子请求时会处理失败
    resources.push({
      href: urlEncodePath(`/${drive.name}/`),
      displayName: drive.name,
      isCollection: true,
      contentType: 'httpd/unix-directory',
      lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT',
    })
  }
  return { resources }
}

/** 列举失败时返回的 XML 体（保持 multistatus 形状，兼容按体解析的客户端） */
function sendListingError(res: NextApiResponse, requestUrl: string | undefined, status: number): void {
  res.status(status).setHeader('Content-Type', 'application/xml; charset="utf-8"').send(
    buildPropfindXml([
      {
        href: requestUrl || '/',
        displayName: 'Error',
        isCollection: true,
        lastModified: formatHttpDate(''),
      },
    ]),
  )
}

async function handlePropfind(req: NextApiRequest, res: NextApiResponse, davPath: ParsedDavPath): Promise<void> {
  const depth = parseDavDepth(req.headers['depth'])

  try {
    let self: DavResource | null = null
    let resources: DavResource[] = []
    // 未配置凭据的网盘视为不存在（根列表不展示，直接访问返回 404）
    const avail = await getDrivesAvailability()

    if (davPath.drive === 'root') {
      // RFC 4918 §9.1：Depth 0/1 响应都必须包含请求资源自身。
      // 缺少自身条目会让部分客户端（Windows 重定向器等）挂载层级异常。
      // displayName 用 '.' 表示"本目录"，避免客户端把它渲染成多余的可点文件夹
      self = {
        href: '/',
        displayName: '.',
        isCollection: true,
        contentType: 'httpd/unix-directory',
        lastModified: formatHttpDate(''),
      }
      const result = await getVirtualRootResources()
      resources = filterRootDrivesByAvailability(result.resources, avail)
    } else if (davPath.drive === 'ty') {
      if (!avail.tianyi) {
        sendListingError(res, req.url, 404)
        return
      }
      const session = await getOrCreateTianyiSession()
      if ('error' in session) {
        // 会话故障是临时性问题，返回 502 而非 404，避免客户端把网盘当成不存在
        sendListingError(res, req.url, 502)
        return
      }
      const result = await getTyDirListing(davPath.subPath, session.cookies)
      if ('error' in result) {
        sendListingError(res, req.url, listingErrorStatus(result.kind))
        return
      }
      self = result.self
      resources = result.resources
    } else if (davPath.drive === 'od') {
      if (!avail.onedrive) {
        sendListingError(res, req.url, 404)
        return
      }
      const accessToken = await getAccessToken()
      if (!accessToken) {
        sendListingError(res, req.url, 502)
        return
      }
      const result = await getOdDirListing(davPath.subPath, accessToken)
      if ('error' in result) {
        sendListingError(res, req.url, listingErrorStatus(result.kind))
        return
      }
      self = result.self
      resources = result.resources
    } else if (davPath.drive === 'p123') {
      if (!avail.pan123) {
        sendListingError(res, req.url, 404)
        return
      }
      const result = await getP123DirListing(davPath.subPath)
      if ('error' in result) {
        sendListingError(res, req.url, listingErrorStatus(result.kind))
        return
      }
      self = result.self
      resources = result.resources
    }

    const bodyResources = depth === 0 ? (self ? [self] : []) : self ? [self, ...resources] : resources

    const xml = buildPropfindXml(bodyResources)
    res.status(207).setHeader('Content-Type', 'application/xml; charset="utf-8"').send(xml)
  } catch (e: any) {
    console.error('[dav] PROPFIND error:', e?.message)
    sendListingError(res, req.url, 500)
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, davPath: ParsedDavPath): Promise<void> {
  // 未配置凭据的网盘视为不存在，直接访问返回 404
  const avail = await getDrivesAvailability()
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
      if (!avail.tianyi) {
        res.status(404).json({ error: 'Not found' })
        return
      }
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
      if (!avail.onedrive) {
        res.status(404).json({ error: 'Not found' })
        return
      }
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
      // 与网页端一致走 graphGet：token 过期自动刷新重试，避免下载链接突然失效
      const { data } = await graphGet(requestUrl, { params: { select: 'id,@microsoft.graph.downloadUrl' } }, accessToken)
      if ('@microsoft.graph.downloadUrl' in data) {
        res.redirect(302, data['@microsoft.graph.downloadUrl'])
      } else {
        res.status(404).json({ error: 'No download url found' })
      }
    } else if (davPath.drive === 'p123') {
      if (!avail.pan123) {
        sendListingError(res, req.url, 404)
        return
      }
      const segments = davPath.subPath.split('/').filter(Boolean)
      if (segments.length === 0) {
        res.status(400).json({ error: 'Cannot download a folder' })
        return
      }
      const resolved = await resolvePan123Path(segments)
      if (resolved.kind !== 'file') {
        res.status(404).json({ error: '文件未找到' })
        return
      }
      const link = await getPan123DownloadLink(resolved.meta)
      res.redirect(302, link)
    }
  } catch (e: any) {
    console.error('[dav] GET error:', e?.message)
    // 仅远端确认不存在才 404；其余（token/网络/上游故障）一律 502
    const notFound = e?.response?.status === 404
    res.status(notFound ? 404 : 502).json({ error: notFound ? '文件未找到' : 'Internal server error' })
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') {
    // 部分客户端挂载前会用 OPTIONS 探测服务器能力，需要带上 DAV/Allow 头
    res.setHeader('DAV', '1')
    res.setHeader('Allow', 'GET, HEAD, PROPFIND, OPTIONS')
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
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}
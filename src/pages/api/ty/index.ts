import { posix as pathPosix } from 'path'

import type { NextApiRequest, NextApiResponse } from 'next'

import apiConfig from '../../../../config/api.config'
import { cloud189Login } from '../../../utils/tianyiAuth'
import { getFiles } from '../../../utils/tianyiClient'
import { getTianyiSession, saveTianyiSession } from '../../../utils/tianyiSessionStore'

const DEFAULT_USER_ID = 'default_user'

function getEnvUsername(): string { return process.env.TIANYI_USERNAME || '' }
function getEnvPassword(): string { return process.env.TIANYI_PASSWORD || '' }
function getDefaultFolderId(): string { return process.env.DEFAULT_FOLDER_ID || '-11' }

/**
 * 获取或创建天翼云会话
 */
async function getOrCreateSession(): Promise<{
  cookies: Record<string, string>
  username: string
  password: string
} | null> {
  const U = process.env.TIANYI_USERNAME || ''
  const P = process.env.TIANYI_PASSWORD || ''

  // 1. 从 Redis 获取已有会话
  const session = await getTianyiSession(DEFAULT_USER_ID)
  if (session?.cookies && Object.keys(session.cookies).length > 0) {
    return {
      cookies: session.cookies,
      username: session.username || U,
      password: session.password || P,
    }
  }

  // 2. 自动登录
  if (!U || !P) {
    return null
  }

  const loginResult = await cloud189Login(U, P)
  if (loginResult.status === 'success' && loginResult.data?.cookies) {
    await saveTianyiSession(loginResult.data.cookies, {
      username: U,
      password: P,
    })
    return { cookies: loginResult.data.cookies, username: U, password: P }
  }

  if (loginResult.status === 'need_captcha') {
    return null
  }

  return null
}


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', apiConfig.cacheControlHeader)

  // 路径参数
  let rawPath = '/'
  if (req.method === 'GET') {
    rawPath = (req.query.path as string) || '/'
  } else if (req.method === 'POST') {
    rawPath = req.body?.path || '/'
  }

  if (rawPath === '[...path]') {
    res.status(400).json({ error: 'No path specified.' })
    return
  }
  if (typeof rawPath !== 'string') {
    res.status(400).json({ error: 'Path query invalid.' })
    return
  }

  const cleanPath = pathPosix.resolve('/', pathPosix.normalize(rawPath)).replace(/\/$/, '')
  const segments = cleanPath === '/' ? [] : cleanPath.split('/').filter(Boolean)

  // 获取会话
  const session = await getOrCreateSession()
  if (!session) {
    res.status(403).json({
      error: 'No access token. 请配置 TIANYI_USERNAME 和 TIANYI_PASSWORD 环境变量。',
    })
    return
  }

  const { cookies, username, password } = session

  try {
    // 逐层解析路径 -> folderId
    let currentFolderId = getDefaultFolderId()

    for (let i = 0; i < segments.length; i++) {
      const segment = decodeURIComponent(segments[i])
      const listResult = await getFiles(cookies, currentFolderId, username, password)

      if (listResult.status === 'need_refresh' && listResult.data?.cookies) {
        await saveTianyiSession(listResult.data.cookies, { username, password })
        res.status(401).json({ error: 'Session expired. Please refresh.', needRefresh: true })
        return
      }

      if (listResult.status !== 'success' || !listResult.data) {
        res.status(500).json({ error: listResult.message || '获取文件列表失败' })
        return
      }

      // 先查文件夹匹配
      const matchedFolder = listResult.data.folders.find((f) => f.name === segment)
      if (matchedFolder) {
        currentFolderId = matchedFolder.id
        // 如果这是最后一段路径，继续往下获取该文件夹内容
        if (i === segments.length - 1) {
          // fall through to the final listing below
        }
        continue
      }

      // 如果是路径最后一段，尝试匹配文件
      const matchedFile = listResult.data.files.find((f) => f.name === segment)
      if (matchedFile && i === segments.length - 1) {
        res.status(200).json({
          file: {
            id: matchedFile.id,
            name: matchedFile.name,
            size: matchedFile.size,
            lastModifiedDateTime: matchedFile.lastOpTime,
            'file@': { mimeType: getMimeType(matchedFile.name) },
            file: { mimeType: getMimeType(matchedFile.name) },
          },
        })
        return
      }

      // 没找到
      res.status(404).json({ error: 'Path not found.' })
      return
    }

    // 获取当前文件夹内容
    const result = await getFiles(cookies, currentFolderId, username, password)

    if (result.status === 'need_refresh' && result.data?.cookies) {
      await saveTianyiSession(result.data.cookies, { username, password })
      res.status(401).json({ error: 'Session expired. Please refresh.', needRefresh: true })
      return
    }

    if (result.status !== 'success' || !result.data) {
      res.status(500).json({ error: result.message || '获取文件列表失败' })
      return
    }

    // 转换为 UI 期望的数据结构
    const folderChildren = [
      ...result.data.folders.map((f) => ({
        id: f.id,
        name: f.name,
        size: 0,
        lastModifiedDateTime: f.lastOpTime,
        folder: { childCount: 0 },
      })),
      ...result.data.files.map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
        lastModifiedDateTime: f.lastOpTime,
        file: { mimeType: getMimeType(f.name) },
      })),
    ]

    res.status(200).json({
      folder: {
        '@odata.count': folderChildren.length,
        value: folderChildren,
      },
    })
    return
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Internal server error.' })
    return
  }
}

/**
 * 根据文件名后缀获取 MIME 类型
 */
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

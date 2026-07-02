import { posix as pathPosix } from 'path'

import type { NextApiRequest, NextApiResponse } from 'next'

import { cloud189Login } from '../../../utils/tianyiAuth'
import { getFiles, getDownloadLink } from '../../../utils/tianyiClient'
import { getTianyiSession, saveTianyiSession } from '../../../utils/tianyiSessionStore'

const DEFAULT_USER_ID = 'default_user'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { path = '/', odpt = '' } = req.query

  if (path === '[...path]') {
    res.status(400).json({ error: 'No path specified.' })
    return
  }
  if (typeof path !== 'string') {
    res.status(400).json({ error: 'Path query invalid.' })
    return
  }

  const cleanPath = pathPosix.resolve('/', pathPosix.normalize(path)).replace(/\/$/, '')
  const segments = cleanPath === '/' ? [] : cleanPath.split('/').filter(Boolean)

  // 获取会话
  const session = await getTianyiSession(DEFAULT_USER_ID)
  let cookies = session?.cookies || null
  let username = session?.username || process.env.TIANYI_USERNAME || ''
  let password = session?.password || process.env.TIANYI_PASSWORD || ''

  if (!cookies) {
    if (!process.env.TIANYI_USERNAME || !process.env.TIANYI_PASSWORD) {
      res.status(403).json({ error: 'No access token.' })
      return
    }
    const loginResult = await cloud189Login(process.env.TIANYI_USERNAME, process.env.TIANYI_PASSWORD)
    if (loginResult.status !== 'success') {
      res.status(403).json({ error: 'Login failed.' })
      return
    }
    cookies = loginResult.data?.cookies || null
    if (cookies) {
      await saveTianyiSession(cookies, { username: process.env.TIANYI_USERNAME, password: process.env.TIANYI_PASSWORD })
    }
  }

  if (!cookies) {
    res.status(403).json({ error: 'No access token.' })
    return
  }

  try {
    // 逐层查找文件
    let currentFolderId = process.env.DEFAULT_FOLDER_ID || '-11'
    let fileId: string | null = null
    let fileName: string | null = null

    for (let i = 0; i < segments.length; i++) {
      const segment = decodeURIComponent(segments[i])
      const result = await getFiles(cookies, currentFolderId, username, password)

      // getFiles 可能在会话失效后重新登录，同步新 cookies 供后续调用使用
      if (result.data?.cookies) {
        cookies = result.data.cookies
      }

      if (result.status === 'need_refresh' && result.data?.cookies) {
        await saveTianyiSession(result.data.cookies, { username, password })
        cookies = result.data.cookies
      }

      if (result.status !== 'success' || !result.data) {
        res.status(500).json({ error: result.message || '获取文件列表失败' })
        return
      }

      // 检查文件夹匹配
      const matchedFolder = result.data.folders.find((f) => f.name === segment)
      if (matchedFolder) {
        currentFolderId = matchedFolder.id
        if (i < segments.length - 1) continue
        // 最后一段是文件夹 -> 不支持下载文件夹，返回第一个文件
        const innerResult = await getFiles(cookies, currentFolderId, username, password)
        if (innerResult.data?.cookies) {
          cookies = innerResult.data.cookies
        }
        if (innerResult.status === 'success' && innerResult.data?.files.length) {
          fileId = innerResult.data.files[0].id
          fileName = innerResult.data.files[0].name
        }
        break
      }

      // 检查文件匹配
      const matchedFile = result.data.files.find((f) => f.name === segment)
      if (matchedFile && i === segments.length - 1) {
        fileId = matchedFile.id
        fileName = matchedFile.name
        break
      }

      res.status(404).json({ error: 'File not found.' })
      return
    }

    if (!fileId) {
      res.status(404).json({ error: 'File not found.' })
      return
    }

    const downloadResult = await getDownloadLink(cookies, fileId)
    if (downloadResult.status !== 'success' || !downloadResult.data?.url) {
      res.status(500).json({ error: downloadResult.message || '获取下载链接失败' })
      return
    }

    // 重定向到真实下载链接
    res.redirect(downloadResult.data.url)
    return
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Internal server error.' })
    return
  }
}

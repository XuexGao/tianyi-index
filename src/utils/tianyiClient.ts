import axios, { AxiosInstance } from 'axios'
import { cloud189Login, LoginResult } from './tianyiAuth'

/**
 * 天翼云文件操作客户端
 */

const DEFAULT_FOLDER_ID = process.env.DEFAULT_FOLDER_ID || '-11'

export interface TianyiFile {
  id: string
  name: string
  lastOpTime: string
  size: number
  icon: string
  type: 'file'
}

export interface TianyiFolder {
  id: string
  name: string
  lastOpTime: string
  type: 'folder'
}

export interface FilesResult {
  status: 'success' | 'error' | 'need_refresh'
  message?: string
  data?: {
    folders: TianyiFolder[]
    files: TianyiFile[]
    folderId: string
    cookies?: Record<string, string>
  }
}

export interface DownloadResult {
  status: 'success' | 'error'
  message?: string
  data?: {
    url: string
    fileName: string
    fileId: string
  }
}

/**
 * 设置 cookie 到 axios 实例
 */
function setCookies(client: AxiosInstance, cookies: Record<string, string>) {
  const cookieStr = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
  client.defaults.headers.Cookie = cookieStr
}

function randomStr(): string {
  return '0.' + Math.floor(Math.random() * 9007199254740991).toString()
}

/**
 * 获取文件列表
 */
export async function getFiles(
  cookies: Record<string, string>,
  folderId: string = DEFAULT_FOLDER_ID,
  username?: string,
  password?: string,
): Promise<FilesResult> {
  const client = axios.create({
    timeout: 30000,
    validateStatus: (status) => status < 500, // 允许 400 状态，用于检查 InvalidSessionKey
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://cloud.189.cn/',
      Accept: 'application/json;charset=UTF-8',
    },
  })

  setCookies(client, cookies)

  const fileList: TianyiFile[] = []
  const folderList: TianyiFolder[] = []
  let pageNum = 1
  const MAX_PAGES = 5

  try {
    while (pageNum <= MAX_PAGES) {
      const response = await client.get('https://cloud.189.cn/api/open/file/listFiles.action', {
        params: {
          noCache: randomStr(),
          pageSize: '60',
          pageNum: String(pageNum),
          mediaType: '0',
          folderId: folderId,
          iconOption: '5',
          orderBy: 'lastOpTime',
          descending: 'true',
        },
      })

      const data = response.data

      // 检查登录是否失效（天翼云返回 400 + JSON 或 200 + 错误码）
      const isInvalidSession =
        response.status === 400 ||
        (typeof data === 'object' && data !== null && data.errorCode === 'InvalidSessionKey') ||
        (typeof data === 'string' && data.includes('InvalidSessionKey'))

      if (isInvalidSession) {
        if (username && password) {
          const loginResult = await cloud189Login(username, password)
          if (loginResult.status === 'success' && loginResult.data?.cookies) {
            // 更新 cookies 并重试当前页
            const newCookies = loginResult.data.cookies
            setCookies(client, newCookies)
            // 使用新 cookies 重新请求
            const retryResponse = await client.get('https://cloud.189.cn/api/open/file/listFiles.action', {
              params: {
                noCache: randomStr(),
                pageSize: '60',
                pageNum: String(pageNum),
                mediaType: '0',
                folderId: folderId,
                iconOption: '5',
                orderBy: 'lastOpTime',
                descending: 'true',
              },
            })
            if (retryResponse.status === 200 && retryResponse.data?.fileListAO) {
              const newData = retryResponse.data
              const fileListAO = newData.fileListAO
              for (const folder of fileListAO.folderList || []) {
                folderList.push({ id: String(folder.id), name: folder.name, lastOpTime: folder.lastOpTime, type: 'folder' })
              }
              for (const file of fileListAO.fileList || []) {
                fileList.push({ id: String(file.id), name: file.name, lastOpTime: file.lastOpTime, size: file.size || 0, icon: file.icon?.smallUrl || '', type: 'file' })
              }
              // 重试成功后继续翻页，跳过当前循环
              pageNum++
              continue
            }
          }
        }
        return { status: 'error', message: '登录已失效，请重新登录' }
      }

      // 检查错误码
      if (data.res_code && data.res_code !== 0) {
        return { status: 'error', message: data.res_message || '获取文件列表失败' }
      }

      const fileListAO = data.fileListAO
      if (!fileListAO || fileListAO.count === 0) {
        break
      }

      // 处理文件夹
      if (fileListAO.folderList) {
        for (const folder of fileListAO.folderList) {
          folderList.push({
            id: String(folder.id),
            name: folder.name,
            lastOpTime: folder.lastOpTime,
            type: 'folder',
          })
        }
      }

      // 处理文件
      if (fileListAO.fileList) {
        for (const file of fileListAO.fileList) {
          fileList.push({
            id: String(file.id),
            name: file.name,
            lastOpTime: file.lastOpTime,
            size: file.size || 0,
            icon: file.icon?.smallUrl || '',
            type: 'file',
          })
        }
      }

      // 检查是否还有更多页
      const hasFolders = fileListAO.folderList && fileListAO.folderList.length > 0
      const hasFiles = fileListAO.fileList && fileListAO.fileList.length > 0
      if (!hasFolders && !hasFiles) break

      pageNum++
    }

    return {
      status: 'success',
      data: { folders: folderList, files: fileList, folderId },
    }
  } catch (error: any) {
    return { status: 'error', message: `获取文件列表出错: ${error?.message || '未知错误'}` }
  }
}

/**
 * 获取文件下载链接
 */
export async function getDownloadLink(
  cookies: Record<string, string>,
  fileId: string,
): Promise<DownloadResult> {
  if (!fileId) {
    return { status: 'error', message: '文件ID不能为空' }
  }

  const client = axios.create({
    timeout: 30000,
    maxRedirects: 0,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://cloud.189.cn/',
      Accept: 'application/json;charset=UTF-8',
    },
  })

  setCookies(client, cookies)

  try {
    // 获取文件信息
    const response = await client.get('https://cloud.189.cn/api/portal/getFileInfo.action', {
      params: { fileId },
    })

    const fileInfo = response.data

    // 检查错误码
    if (fileInfo.res_code && fileInfo.res_code !== 0) {
      return { status: 'error', message: fileInfo.res_message || '获取文件信息失败' }
    }

    // 获取下载 URL
    let downloadUrl = fileInfo.downloadUrl || fileInfo.fileDownloadUrl || ''
    if (!downloadUrl) {
      return { status: 'error', message: '无法获取下载链接' }
    }

    // 处理 URL
    if (downloadUrl.startsWith('//')) {
      downloadUrl = 'https:' + downloadUrl
    } else if (!downloadUrl.startsWith('http')) {
      downloadUrl = 'https://' + downloadUrl
    }

    // 跟踪重定向获取真实下载链接
    let realUrl = downloadUrl
    let redirectCount = 0
    const MAX_REDIRECTS = 3

    while (redirectCount < MAX_REDIRECTS) {
      const redirectRes = await client.get(realUrl, {
        maxRedirects: 0,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      })
      if (redirectRes.status >= 300 && redirectRes.status < 400) {
        const location = redirectRes.headers.location
        if (location) {
          realUrl = location
          redirectCount++
        } else {
          break
        }
      } else {
        break
      }
    }

    // 确保 HTTPS
    realUrl = realUrl.replace('http://', 'https://')

    const fileName = fileInfo.fileName || fileInfo.name || `文件_${fileId}`

    return {
      status: 'success',
      data: { url: realUrl, fileName, fileId },
    }
  } catch (error: any) {
    return { status: 'error', message: `获取下载链接失败: ${error?.message || '未知错误'}` }
  }
}

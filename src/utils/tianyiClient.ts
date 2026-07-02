import axios, { AxiosInstance } from 'axios'
import { cloud189Login, LoginResult } from './tianyiAuth'
import { saveTianyiSession } from './tianyiSessionStore'

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
 * axios transformResponse：保护 19 位 long 类型 ID 不被 JSON.parse 转成 Number 丢精度。
 * 天翼云的 file/folder id（如 8247532039947921XX）超过 Number.MAX_SAFE_INTEGER，
 * 直接 JSON.parse 会末尾被置零。这里用正则把 >= 16 位的纯整数 token 包成字符串。
 * 注意：必须设置 responseType 为文本后再手动 parse，否则 axios 默认就 parse 完了。
 */
function preserveLongIds(data: string): any {
  if (typeof data !== 'string') return data
  // 匹配 JSON 中形如 "id": 8247532039947921XX 或 "id" : 123 这样的 16 位以上纯整数
  // 用正则把值两侧加上引号，使其解析为字符串
  const protectedJson = data.replace(
    /("(?:id|fileId|folderId|parentId|srcFileOwnerId|operId|userId|familyId|groupId)"\s*:\s*)(\d{16,})/g,
    (_match, key, num) => `${key}"${num}"`,
  )
  try {
    return JSON.parse(protectedJson)
  } catch {
    // parse 失败则原样返回原始文本，交由后续逻辑处理
    return data
  }
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
    // 自定义响应解析：保护 19 位 long 类型 ID 不丢精度
    transformResponse: [preserveLongIds],
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
  let refreshedCookies: Record<string, string> | undefined
  let sessionRefreshed = false

  const listParams = (page: number) => ({
    noCache: randomStr(),
    pageSize: '60',
    pageNum: String(page),
    mediaType: '0',
    folderId: folderId,
    iconOption: '5',
    orderBy: 'lastOpTime',
    descending: 'true',
  })

  try {
    while (pageNum <= MAX_PAGES) {
      const response = await client.get('https://cloud.189.cn/api/open/file/listFiles.action', {
        params: listParams(pageNum),
      })

      const data = response.data

      // 仅当响应体明确指示会话失效时才判定为登录失效（避免把其他 4xx 错误误判为会话失效）
      const isInvalidSession =
        (typeof data === 'object' && data !== null && data.errorCode === 'InvalidSessionKey') ||
        (typeof data === 'string' && data.includes('InvalidSessionKey'))

      if (isInvalidSession) {
        // 重新登录后用新 cookies 重试当前页（仅重试一次，避免死循环）
        if (username && password && !sessionRefreshed) {
          const loginResult = await cloud189Login(username, password)
          if (loginResult.status === 'success' && loginResult.data?.cookies) {
            sessionRefreshed = true
            refreshedCookies = loginResult.data.cookies
            setCookies(client, refreshedCookies)
            // 持久化新会话，避免后续请求继续使用失效的旧 cookies
            await saveTianyiSession(refreshedCookies, { username, password })
            // 不递增 pageNum，用新 cookies 重新请求当前页
            continue
          }
        }
        return { status: 'error', message: '登录已失效，请重新登录' }
      }

      // 处理其他非 200 响应（非会话失效的错误，返回真实错误信息而非"登录失效"）
      if (response.status !== 200) {
        const errMsg =
          (typeof data === 'object' && data !== null
            ? data.errorMsg || data.msg || data.res_message
            : typeof data === 'string'
              ? data
              : '') || `获取文件列表失败 (HTTP ${response.status})`
        return { status: 'error', message: errMsg }
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
      data: { folders: folderList, files: fileList, folderId, cookies: refreshedCookies },
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
    // 自定义响应解析：保护 19 位 long 类型 ID 不丢精度
    transformResponse: [preserveLongIds],
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

import axios, { AxiosInstance } from 'axios'
import { cloud189Login, LoginResult } from './tianyiAuth'
import { saveTianyiSession } from './tianyiSessionStore'

/**
 * 天翼云文件操作客户端
 */

const DEFAULT_FOLDER_ID = process.env.DEFAULT_FOLDER_ID || '-11'

/**
 * 简易 TTL 内存缓存。
 * Vercel serverless 实例间不共享，但同实例内的重复请求（如一次请求中
 * 鉴权导航 + 路径解析会列出同一文件夹多次）可命中，显著减少到 cloud.189.cn
 * 的串行网络往返。TTL 短（60s），文件变更后最多等 60s 即刷新。
 */
interface CacheEntry<T> { data: T; expires: number }
const fileCache = new Map<string, CacheEntry<{ folders: TianyiFolder[]; files: TianyiFile[] }>>()

function getCachedFiles(folderId: string) {
  const entry = fileCache.get(folderId)
  if (entry && entry.expires > Date.now()) {
    return entry.data
  }
  fileCache.delete(folderId)
  return null
}

function setCachedFiles(folderId: string, folders: TianyiFolder[], files: TianyiFile[]) {
  fileCache.set(folderId, { data: { folders, files }, expires: Date.now() + 60000 })
}

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
 * 自然排序比较函数（natural sort，不区分大小写）。
 * 规则：
 *   1. 把文件名拆成「数字段」和「非数字段」交替的序列
 *   2. 数字段按数值大小比较（这样 2 < 10，而非字符串比较的 "10" < "2"）
 *   3. 非数字段按字符串比较（小写优先，不区分大小写）
 *   4. 数字开头的项天然会先与空串比较，因此数字开头的项排在字母开头之前
 *      —— 满足"数字在上方、字母 a-z 在下方"的需求
 */
function naturalCompare(a: string, b: string): number {
  const ax: (number | string)[] = []
  const bx: (number | string)[] = []
  a.replace(/(\d+)|(\D+)/g, (_, $1, $2) => {
    ax.push($1 ? parseInt($1, 10) : $2.toLowerCase())
    return ''
  })
  b.replace(/(\d+)|(\D+)/g, (_, $1, $2) => {
    bx.push($1 ? parseInt($1, 10) : $2.toLowerCase())
    return ''
  })
  while (ax.length && bx.length) {
    const an = ax.shift()!
    const bn = bx.shift()!
    const nn =
      typeof an === 'number' && typeof bn === 'number'
        ? an - bn
        : String(an).localeCompare(String(bn))
    if (nn !== 0) return nn
  }
  return ax.length - bx.length
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
  // 命中缓存则直接返回，跳过到 cloud.189.cn 的网络往返
  const cached = getCachedFiles(folderId)
  if (cached) {
    return {
      status: 'success',
      data: { folders: cached.folders, files: cached.files, folderId },
    }
  }

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
    pageSize: '100',
    pageNum: String(page),
    mediaType: '0',
    folderId: folderId,
    iconOption: '5',
    orderBy: 'name',
    descending: 'false',
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

    // 按名称自然排序：数字开头的排在前，数字按数值大小比较（2 < 10），字母 a-z 升序
    // 天翼云 API 的 orderBy=name 是字符串排序，无法满足"2 < 10"和"数字在上方"的需求，
    // 这里在前端再排一次。
    folderList.sort((a, b) => naturalCompare(a.name, b.name))
    fileList.sort((a, b) => naturalCompare(a.name, b.name))

    // 写入缓存：后续 60s 内对同一 folderId 的请求直接命中，无需打 cloud.189.cn
    setCachedFiles(folderId, folderList, fileList)

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
    // 接受 2xx 和 3xx：天翼云的 getFileInfo.action 和下载链接都会返回 302，
    // 默认 validateStatus 只接受 2xx 会把 302 当错误抛出。
    validateStatus: (status) => status < 400,
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
    // 获取文件信息（天翼云可能返回 302 重定向到带 downloadUrl 的 JSON 接口，
    // 这里手动跟随以保留 cookie 并拿到最终 JSON）
    let response = await client.get('https://cloud.189.cn/api/portal/getFileInfo.action', {
      params: { fileId },
    })

    // 手动跟随 getFileInfo 的 3xx 重定向（最多 5 次）
    let redirectCount = 0
    while (response.status >= 300 && response.status < 400 && response.headers.location && redirectCount < 5) {
      response = await client.get(response.headers.location)
      redirectCount++
    }

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

    // 跟踪下载链接的重定向获取真实下载地址（CDN 通常会 302 到带签名的 URL）
    // 注意：用 stream 避免把整个文件下载到内存；遇到 3xx 就读 location 继续跟随，
    // 遇到 2xx 说明已经是最终地址，直接销毁流并跳出。
    let realUrl = downloadUrl
    let dlRedirectCount = 0
    const MAX_DL_REDIRECTS = 5

    while (dlRedirectCount < MAX_DL_REDIRECTS) {
      let redirectRes
      try {
        redirectRes = await client.get(realUrl, {
          responseType: 'stream',
        })
      } catch {
        // 跟随失败则使用当前 realUrl，浏览器会自己处理重定向
        break
      }
      // 立即销毁流，避免连接泄漏（我们只需要 headers）
      redirectRes.data?.destroy?.()
      if (redirectRes.status >= 300 && redirectRes.status < 400) {
        const location = redirectRes.headers.location
        if (location) {
          realUrl = location
          dlRedirectCount++
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

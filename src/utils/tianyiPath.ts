/**
 * 天翼云路径解析统一入口：从天翼云根目录逐层导航，把路径段解析为 folderId / fileId。
 *
 * 原实现分别在以下位置各维护了一份几乎相同的逐层导航循环：
 * - src/pages/api/ty/index.ts（目录列表）
 * - src/pages/api/ty/raw.ts（查找文件下载）
 * - src/pages/api/dav/[[...path]].ts（getTyDirListing / handleGet 的 ty 分支）
 * 提取为公共模块，统一会话失效（need_refresh）、未找到（not_found）等状态语义。
 */

import { getFiles, TianyiFile } from './tianyiClient'
import { safeDecodeURIComponent } from './decode'

export interface TianyiPathResult {
  /** 最终目录 id（文件场景为文件所在目录） */
  folderId: string
  /** 路径最后一段命中文件时存在 */
  fileId?: string
  fileName?: string
  fileMeta?: TianyiFile
  /** 解析过程中可能被 getFiles 刷新的 cookies，调用方应回传使用 */
  cookies: Record<string, string>
  status: 'ok' | 'not_found' | 'need_refresh' | 'error'
  message?: string
  upstreamStatus?: number
}

/**
 * 逐层解析天翼云路径。
 *
 * @param cookies 起始 cookies（会被 getFiles 的自动重登刷新，通过返回值回传）
 * @param segments 解码前的路径段（getFiles 内部按名称精确匹配，段会安全解码）
 * @param username 天翼云账号（用于会话失效时自动重登）
 * @param password 天翼云密码
 * @param startFolderId 起始目录 id（默认 -11 天翼云根目录；管理员模式也从根开始）
 *
 * 返回语义：
 * - ok：成功。若命中文件则带 fileId/fileMeta；否则 folderId 为最终目录
 * - not_found：路径某段不存在（调用方应返回 404）
 * - need_refresh：会话失效且无法自动恢复（调用方应清除会话并返回 401）
 * - error：上游错误（调用方应返回 5xx，可参考 upstreamStatus）
 */
export async function resolveTianyiPath(
  cookies: Record<string, string>,
  segments: string[],
  username: string,
  password: string,
  startFolderId = '-11',
): Promise<TianyiPathResult> {
  let currentFolderId = startFolderId
  let currentCookies = cookies

  for (let i = 0; i < segments.length; i++) {
    const segment = safeDecodeURIComponent(segments[i])
    const listResult = await getFiles(currentCookies, currentFolderId, username, password)

    // getFiles 可能在会话失效后重新登录，这里同步更新本地 cookies 供后续调用使用
    if (listResult.data?.cookies) {
      currentCookies = listResult.data.cookies
    }

    if (listResult.status === 'need_refresh') {
      return {
        folderId: currentFolderId,
        cookies: currentCookies,
        status: 'need_refresh',
        message: listResult.message || '登录已失效，请重新登录',
      }
    }

    if (listResult.status !== 'success' || !listResult.data) {
      return {
        folderId: currentFolderId,
        cookies: currentCookies,
        status: 'error',
        message: listResult.message || '获取文件列表失败',
        upstreamStatus: listResult.upstreamStatus,
      }
    }

    // 先查文件夹匹配
    const matchedFolder = listResult.data.folders.find(f => f.name === segment)
    if (matchedFolder) {
      currentFolderId = matchedFolder.id
      continue
    }

    // 路径最后一段尝试匹配文件
    const matchedFile = listResult.data.files.find(f => f.name === segment)
    if (matchedFile && i === segments.length - 1) {
      return {
        folderId: currentFolderId,
        fileId: matchedFile.id,
        fileName: matchedFile.name,
        fileMeta: matchedFile,
        cookies: currentCookies,
        status: 'ok',
      }
    }

    return { folderId: currentFolderId, cookies: currentCookies, status: 'not_found' }
  }

  return { folderId: currentFolderId, cookies: currentCookies, status: 'ok' }
}
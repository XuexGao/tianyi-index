import axios from 'axios'
import useSWRInfinite from 'swr/infinite'

import type { OdAPIResponse } from '../types'

import { getStoredToken, driveFromApiBase } from './protectedRouteHandler'

// Common axios fetch function for use with useSWR
export async function fetcher([url, token]: [url: string, token?: string]): Promise<any> {
  try {
    const res = await (token
      ? axios.get(url, {
          headers: { 'od-protected-token': token },
        })
      : axios.get(url))
    // 安全检查：如果响应不是对象（如 HTML 页面字符串），说明请求命中了
    // 页面路由而非 API 路由，直接抛错避免后续代码对字符串做 in 操作导致崩溃
    if (typeof res.data !== 'object' || res.data === null) {
      throw { status: 404, message: 'API route not found, got HTML response' }
    }
    return res.data
  } catch (err: any) {
    if (err.status) throw err
    throw { status: err.response?.status ?? 500, message: err.response?.data ?? err.message }
  }
}

/**
 * Paging with useSWRInfinite + protected token support
 * @param path Current query directory path
 * @param apiBase API base path, e.g. '/api/ty' or '/api/od'
 * @param admin 是否以管理员身份请求（忽略挂载基础目录，从云盘绝对根目录开始）
 * @returns useSWRInfinite API
 */
export function useProtectedSWRInfinite(path: string = '', apiBase: string = '/api/ty', admin: boolean = false) {
  const hashedToken = getStoredToken(path, driveFromApiBase(apiBase))
  const adminParam = admin ? '&admin=1' : ''

  function getNextKey(pageIndex: number, previousPageData: OdAPIResponse): (string | null)[] | null {
    // path 为空字符串时视为虚拟根，不发起请求
    if (path === '') return null
    if (previousPageData && !previousPageData.folder) return null
    if (pageIndex === 0) return [`${apiBase}/?path=${path}${adminParam}`, hashedToken]
    return [`${apiBase}/?path=${path}&next=${previousPageData.next}${adminParam}`, hashedToken]
  }

  const revalidationOptions = {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    // 切换文件夹时保留上一个文件夹的数据，避免空白闪烁
    keepPreviousData: true,
    // 同一路径 60 秒内不重复请求
    dedupingInterval: 60000,
  }

  return useSWRInfinite(getNextKey, fetcher, revalidationOptions)
}

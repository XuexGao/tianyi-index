import axios from 'axios'
import useSWRInfinite from 'swr/infinite'

import type { OdAPIResponse } from '../types'

import { getStoredToken, driveFromApiBase } from './protectedRouteHandler'

// Common axios fetch function for use with useSWR
export async function fetcher([url, token]: [url: string, token?: string]): Promise<any> {
  try {
    return (
      await (token
        ? axios.get(url, {
            headers: { 'od-protected-token': token },
          })
        : axios.get(url))
    ).data
  } catch (err: any) {
    throw { status: err.response.status, message: err.response.data }
  }
}

/**
 * Paging with useSWRInfinite + protected token support
 * @param path Current query directory path
 * @returns useSWRInfinite API
 */
export function useProtectedSWRInfinite(path: string = '', apiBase: string = '/api/ty') {
  const hashedToken = getStoredToken(path, driveFromApiBase(apiBase))

  function getNextKey(pageIndex: number, previousPageData: OdAPIResponse): (string | null)[] | null {
    if (previousPageData && !previousPageData.folder) return null
    if (pageIndex === 0) return [`${apiBase}/?path=${path}`, hashedToken]
    return [`${apiBase}/?path=${path}&next=${previousPageData.next}`, hashedToken]
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

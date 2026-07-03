import axios from 'axios'
import { useEffect, useState } from 'react'
import { getStoredToken, Drive } from './protectedRouteHandler'

// 模块级缓存，整个应用生命周期内有效，切换文件夹再回来无需重新请求
const contentCache = new Map<string, string>()

/**
 * Custom hook for axios to fetch raw file content on component mount
 * @param fetchUrl The URL pointing to the raw file content
 * @param path The path of the file, used for determining whether path is protected
 */
export default function useFileContent(
  fetchUrl: string,
  path: string
): { response: any; error: string; validating: boolean } {
  const cached = contentCache.get(fetchUrl)
  const [response, setResponse] = useState(cached ?? '')
  const [validating, setValidating] = useState(!cached)
  const [error, setError] = useState('')

  useEffect(() => {
    // 命中缓存，直接返回，不发请求
    if (contentCache.has(fetchUrl)) {
      setResponse(contentCache.get(fetchUrl)!)
      setValidating(false)
      return
    }

    setValidating(true)
    // fetchUrl 形如 `${apiBase}/raw/?path=...`，据此推导云盘类型
    const drive: Drive = fetchUrl.startsWith('/api/od') ? 'od' : 'ty'
    const hashedToken = getStoredToken(path, drive)
    const url = fetchUrl + (hashedToken ? `&odpt=${hashedToken}` : '')

    axios
      .get(url, { responseType: 'blob' })
      .then(async res => {
        const text = await res.data.text()
        contentCache.set(fetchUrl, text)  // 存入缓存
        setResponse(text)
      })
      .catch(e => setError(e.message))
      .finally(() => setValidating(false))
  }, [fetchUrl, path])

  return { response, error, validating }
}

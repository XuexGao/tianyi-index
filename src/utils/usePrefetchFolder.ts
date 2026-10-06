import { useCallback } from 'react'

import { getStoredToken, type Drive } from './protectedRouteHandler'

/**
 * 文件夹悬停预取。
 *
 * 动机（基于线上实测）：
 * - 天翼云 API 单次请求只返回一层，且 `resolveTianyiPath` 每次都要从根目录逐层
 *   `getFiles` 重走祖先目录，因此深层目录的首次访问代价 = O(深度) 次上游往返；
 * - 实测同一 URL：MISS 约 8s，命中边缘缓存后约 1.2s（favicon 基线也要 1.6s），
 *   即上游往返才是主要成本。
 *
 * 策略：鼠标悬停到文件夹上时，提前以与真实请求完全相同的 URL 打一次 API，
 * 从而预热 Vercel 边缘缓存与服务端 Redis 缓存（tianyiClient 的 L2）。
 * 用户真正点击时即可命中缓存，明显缩短等待。
 *
 * 为什么只预热 HTTP 缓存、不直接写 SWR 状态：
 * `useSWRInfinite` 的缓存 key 由各页 key 序列化而来（第 2 页起依赖
 * previousPageData），外部无法可靠构造同一个 key。写入不匹配的 key 既不会
 * 命中、又会泄漏缓存条目，反而制造诡异行为。预热 HTTP 层则与前端状态机解耦，
 * 对所有布局（列表/网格）与所有网盘统一生效。
 *
 * 安全：不预取虚拟入口（`__virtual_*`，它们不对应真实上游路径，会 404），
 * 并携带与真实请求一致的私密目录 token，避免预热到未授权响应。
 * 鉴权失败（401/403）响应不会被 Vercel 边缘缓存（已实测每次 MISS），
 * 因此预热不会把未授权结果"锁"进缓存。
 */

/** 同一会话内已预取过的 URL（带时间戳），避免重复打上游（模块级，跨组件共享） */
const prefetchedUrls = new Map<string, number>()
/**
 * 去重有效期与边缘/服务端缓存的 60s TTL 对齐：
 * 超过 60s 后缓存已过期，此时再次悬停应当重新预热，否则第二次悬停等于没预热。
 */
const PREFETCH_DEDUPE_MS = 60_000

/** 虚拟入口不对应真实上游路径，跳过 */
function isVirtualFolderId(id: string): boolean {
  return typeof id === 'string' && id.startsWith('__virtual_')
}

export function usePrefetchFolder(apiBase: string, backendPath: string, drive: Drive, admin: boolean) {
  return useCallback(
    (child: { id: string; name: string; folder?: unknown }) => {
      // 只预取文件夹；虚拟入口跳过
      if (!child?.folder || isVirtualFolderId(child.id) || !child.name) return

      const childPath = `${backendPath === '/' ? '' : backendPath}/${encodeURIComponent(child.name)}`
      const url = `${apiBase}/?path=${childPath}${admin ? '&admin=1' : ''}`
      const lastPrefetch = prefetchedUrls.get(url)
      if (lastPrefetch && Date.now() - lastPrefetch < PREFETCH_DEDUPE_MS) return
      prefetchedUrls.set(url, Date.now())

      const token = getStoredToken(childPath, drive)
      fetch(url, {
        headers: token ? { 'od-protected-token': token } : undefined,
      })
        // 必须消费响应体，否则连接不会释放（预取只关心是否走到上游）
        .then(res => res.arrayBuffer())
        .catch(() => {
          // 预取失败无需打扰用户：真实点击时会正常重试并报错。
          // 清掉时间戳，让下次悬停可以立即重试。
          prefetchedUrls.delete(url)
        })
    },
    [apiBase, backendPath, drive, admin],
  )
}

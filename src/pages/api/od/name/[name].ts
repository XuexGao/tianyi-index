import type { NextApiRequest, NextApiResponse } from 'next'
import { default as rawFileHandler } from '../raw'

/**
 * 兼容路由：/api/od/name/:name
 *
 * 原 onedrive-index 项目提供该路径模式，合并双云盘后保留。
 * raw handler 读取 req.query.path，而本路由把文件路径放在 req.query.name，
 * 这里做一次映射，避免请求落到默认 '/' 导致 404。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const q = req.query as Record<string, unknown>
  // 仅当 path 缺失时用 name 兜底（显式 ?path= 优先）
  if (q.path === undefined && typeof q.name === 'string' && q.name) {
    q.path = q.name
  }
  await rawFileHandler(req, res)
}
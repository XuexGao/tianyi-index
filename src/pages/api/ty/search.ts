import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * 天翼云 API 暂不支持全局搜索。
 * 返回空结果，搜索功能在前端将被禁用。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { q: searchQuery = '' } = req.query

  if (typeof searchQuery === 'string' && searchQuery.trim()) {
    res.status(200).json([])
  } else {
    res.status(200).json([])
  }
  return
}

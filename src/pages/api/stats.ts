import type { NextApiRequest, NextApiResponse } from 'next'
import { getVisitStats, incrementVisit, getStatsRedisStatus } from '../../utils/visitStatsStore'

/**
 * 内置访问统计 API
 * - GET  /api/stats      读取今日 / 累计访问量
 * - POST /api/stats      +1 并返回更新后的数字
 *
 * 客户端只在首次进入网站时 POST 一次（见 _app.tsx），客户端路由切换不计数，
 * 因此统计的是 PV（页面浏览量，按"会话首屏"口径，单次访问只算 1）。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Redis 不可用时也返回 200 + 0，让前端降级显示 0 而不是报错
  const redisStatus = getStatsRedisStatus()

  try {
    if (req.method === 'POST') {
      const { today, total } = await incrementVisit()
      res.status(200).json({
        status: 'success',
        data: { today, total, redis: redisStatus },
      })
      return
    }

    if (req.method === 'GET') {
      const { today, total } = await getVisitStats()
      res.status(200).json({
        status: 'success',
        data: { today, total, redis: redisStatus },
      })
      return
    }

    res.setHeader('Allow', 'GET, POST')
    res.status(405).json({ status: 'error', error: 'Method not allowed' })
  } catch (e: any) {
    res.status(200).json({
      status: 'error',
      error: e?.message || 'unknown error',
      data: { today: 0, total: 0, redis: redisStatus },
    })
  }
}
